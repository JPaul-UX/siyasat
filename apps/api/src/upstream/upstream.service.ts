import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config.js';
import { Lane } from './lane.js';

/** Thrown when a lookup service we cannot do without is rate-limiting us or down. */
export class UpstreamBusyError extends Error {}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isTimeout = (e: unknown) => e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');

/** How long a service is left alone after it tells us to slow down. */
const COOL_OFF_MS = 90_000;
const MAX_COOL_OFF_MS = 15 * 60_000;

interface Route {
  /** The unit that gets rate-limited together, and that we stop calling when it says "slow down". */
  service: string;
  /** Lanes the request has to pass through, outermost first. */
  lanes: Lane[];
  /** A service the checker can do without: when it is unavailable, lookups answer "nothing" instead of failing. */
  optional: boolean;
}

/**
 * Every outgoing request to a scholarly database goes through here, so that all users of the app together
 * stay inside each service's rate limit, and a service that says "slow down" is left alone for a while.
 */
@Injectable()
export class UpstreamService {
  private readonly log = new Logger(UpstreamService.name);
  private readonly down = new Map<string, number>();

  private readonly crossref: Lane;
  private readonly crossrefList: Lane;
  private readonly crossrefSingle: Lane;
  private readonly openalex = new Lane(4, 30);
  private readonly europePmc = new Lane(4, 110);
  private readonly semanticScholar = new Lane(1, 1100);
  private readonly unpaywall = new Lane(3, 50);
  private readonly other = new Lane(4);

  constructor(private readonly config: AppConfig) {
    // Crossref's limits depend on the pool it puts us in, and it states them on every response. Start with
    // the strictest (the public pool: one request at a time, one list query a second) and adopt what it says.
    this.crossref = new Lane(1);
    this.crossrefList = new Lane(1, 1150);
    this.crossrefSingle = new Lane(1, 250);
    if (!config.contactEmail) {
      this.log.warn('CONTACT_EMAIL is not set: using the slower public Crossref pool, and skipping Unpaywall.');
    }
    if (!config.openAlexApiKey) {
      this.log.warn('OPENALEX_API_KEY is not set: OpenAlex title search will mostly be unavailable (Crossref still works).');
    }
  }

  /** Append the contact address and API keys a service expects. */
  sign(url: string): string {
    const u = new URL(url);
    if (u.host === 'api.crossref.org' && this.config.contactEmail) u.searchParams.set('mailto', this.config.contactEmail);
    if (u.host === 'api.openalex.org') {
      if (this.config.contactEmail) u.searchParams.set('mailto', this.config.contactEmail);
      if (this.config.openAlexApiKey) u.searchParams.set('api_key', this.config.openAlexApiKey);
    }
    return u.toString();
  }

  private route(url: URL): Route {
    switch (url.host) {
      case 'api.crossref.org': {
        const single = /^\/works\/.+/.test(url.pathname);
        return { service: 'api.crossref.org', lanes: [single ? this.crossrefSingle : this.crossrefList, this.crossref], optional: false };
      }
      case 'api.openalex.org': {
        // Without a key OpenAlex rate-limits searches but still answers single-record lookups, so the two
        // are tracked separately: a refused search must not stop venue and abstract lookups.
        const search = url.searchParams.has('search');
        return { service: search ? 'api.openalex.org/search' : 'api.openalex.org', lanes: [this.openalex], optional: true };
      }
      case 'www.ebi.ac.uk':
        return { service: url.host, lanes: [this.europePmc], optional: true };
      case 'api.semanticscholar.org':
        return { service: url.host, lanes: [this.semanticScholar], optional: true };
      case 'api.unpaywall.org':
        return { service: url.host, lanes: [this.unpaywall], optional: true };
      default:
        return { service: url.host, lanes: [this.other], optional: true };
    }
  }

  /**
   * Crossref says on every response how fast this client may go: `x-rate-limit-limit` requests per
   * `x-rate-limit-interval` for this kind of request, and `x-concurrency-limit` at once. Follow it, with a
   * margin, so that every user of the app together stays inside what Crossref allows.
   */
  private adoptCrossrefLimits(url: URL, res: Response): void {
    const limit = Number(res.headers.get('x-rate-limit-limit'));
    const interval = /^(\d+)\s*s$/.exec(res.headers.get('x-rate-limit-interval') ?? '');
    const concurrency = Number(res.headers.get('x-concurrency-limit')) || this.crossref.limits.concurrency;
    if (!limit || !interval) return;
    const gap = Math.ceil(((Number(interval[1]) * 1000) / limit) * 1.25);
    const lane = /^\/works\/.+/.test(url.pathname) ? this.crossrefSingle : this.crossrefList;
    const before = lane.limits;
    if (before.minGapMs === gap && before.concurrency === concurrency) return;
    lane.tune(concurrency, gap);
    this.crossref.tune(concurrency, 0);
    const kind = lane === this.crossrefSingle ? 'single-record' : 'list';
    this.log.log(
      `Crossref ${kind} requests: ${limit} per ${interval[1]}s, ${concurrency} at a time (pool: ${res.headers.get('x-api-pool') ?? 'unknown'}); pacing them ${gap}ms apart`,
    );
  }

  private isDown(service: string): boolean {
    return (this.down.get(service) ?? 0) > Date.now();
  }

  private trip(service: string, retryAfterSeconds?: number): void {
    const wait = Math.min(MAX_COOL_OFF_MS, Math.max(COOL_OFF_MS, (retryAfterSeconds ?? 0) * 1000));
    if (!this.isDown(service)) this.log.warn(`${service} is rate-limiting us; leaving it alone for ${Math.round(wait / 1000)}s`);
    this.down.set(service, Date.now() + wait);
  }

  /**
   * Services that are rate-limiting us right now and that the user should hear about: the two a verdict
   * depends on. Abstract providers come and go without changing any verdict, and OpenAlex search without
   * an API key is expected to be refused, so neither is reported.
   */
  busyServices(): string[] {
    const now = Date.now();
    const out = new Set<string>();
    for (const [service, until] of this.down) {
      if (until <= now) continue;
      if (service === 'api.crossref.org') out.add(service);
      if (service.startsWith('api.openalex.org') && this.config.openAlexApiKey) out.add('api.openalex.org');
    }
    return [...out];
  }

  private limitHeaders(res: Response): string {
    return ['x-rate-limit-limit', 'x-rate-limit-interval', 'x-concurrency-limit', 'x-api-pool', 'retry-after']
      .map((h) => [h, res.headers.get(h)] as const)
      .filter(([, v]) => v)
      .map(([h, v]) => `${h}: ${v}`)
      .join(', ');
  }

  private async send(url: URL, route: Route, timeoutMs: number, accept = 'application/json'): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': `Siyasat/1.0 (citation checker${this.config.contactEmail ? `; mailto:${this.config.contactEmail}` : ''})`,
    };
    if (url.host === 'api.semanticscholar.org' && this.config.semanticScholarApiKey) {
      headers['x-api-key'] = this.config.semanticScholarApiKey;
    }
    // The timeout starts when the request is actually sent, not while it waits its turn.
    const go = () => fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
    return route.lanes.reduceRight<() => Promise<Response>>((next, lane) => () => lane.run(next), go)();
  }

  /**
   * Fetch JSON the way the verifier needs it. Answers null when the record does not exist. For a service we
   * can do without, also answers null when it is unavailable; for Crossref, throws UpstreamBusyError.
   */
  async getJson<T = unknown>(rawUrl: string): Promise<T | null> {
    const url = new URL(this.sign(rawUrl));
    const route = this.route(url);
    if (this.isDown(route.service)) {
      if (route.optional) return null;
      throw new UpstreamBusyError(`${url.host} is busy — try again in a minute`);
    }
    let last = '';
    // A service we cannot do without gets more patience: slow down, wait, and ask again.
    const attempts = route.optional ? 2 : 4;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const res = await this.send(url, route, 9000);
        if (url.host === 'api.crossref.org') this.adoptCrossrefLimits(url, res);
        if (res.status === 404) return null;
        if (res.ok) return (await res.json()) as T;
        last = 'HTTP ' + res.status;
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after')) || undefined;
          if (route.optional) {
            this.trip(route.service, retryAfter);
            return null;
          }
          // Hold every request to this service back for a moment, then take another turn in the queue.
          const wait = Math.min(15_000, Math.max(2000 * (attempt + 1), (retryAfter ?? 0) * 1000));
          this.log.warn(`${url.host} answered 429 (${this.limitHeaders(res)}); pausing its requests for ${wait}ms`);
          route.lanes.forEach((lane) => lane.pause(wait));
          continue;
        }
        if (res.status >= 500) {
          await sleep(1000);
          continue;
        }
        if (res.status >= 400) return null;
      } catch (e) {
        last = isTimeout(e) ? 'timed out' : e instanceof Error ? e.message : String(e);
        if (isTimeout(e) && route.optional) {
          this.trip(route.service);
          return null;
        }
      }
      await sleep(600);
    }
    if (route.optional) return null;
    throw new UpstreamBusyError(`Service busy (${url.host}${last ? ', ' + last : ''}) — try again`);
  }

  /**
   * Fetch JSON for a nice-to-have lookup (abstracts, author-and-year search): any failure answers null.
   */
  async getJsonSoft<T = unknown>(rawUrl: string): Promise<T | null> {
    const url = new URL(this.sign(rawUrl));
    const route = this.route(url);
    if (this.isDown(route.service)) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.send(url, route, 9000);
        if (url.host === 'api.crossref.org') this.adoptCrossrefLimits(url, res);
        if (res.status === 404) return null;
        if (res.ok) return (await res.json()) as T;
        if (res.status === 429) {
          // Crossref is needed for verdicts too, so it is slowed down rather than switched off.
          if (route.optional) this.trip(route.service, Number(res.headers.get('retry-after')) || undefined);
          else route.lanes.forEach((lane) => lane.pause(3000));
          return null;
        }
        if (res.status < 500) return null;
      } catch (e) {
        if (isTimeout(e)) {
          this.trip(route.service);
          return null;
        }
      }
      await sleep(700);
    }
    return null;
  }

  /**
   * Fetch once, for the full-text reader: null when the record does not exist, and an error for anything
   * else, so the reader can tell the user which service could not be reached.
   */
  async getOnce(rawUrl: string, as: 'json'): Promise<unknown | null>;
  async getOnce(rawUrl: string, as: 'text'): Promise<string | null>;
  async getOnce(rawUrl: string, as: 'json' | 'text'): Promise<unknown | null> {
    const url = new URL(this.sign(rawUrl));
    const route = this.route(url);
    if (this.isDown(route.service)) throw new UpstreamBusyError(`${url.host} is busy`);
    const res = await this.send(url, route, 10_000, as === 'text' ? 'application/xml, text/xml, */*' : 'application/json');
    if (res.status === 404) return null;
    if (res.status === 429) this.trip(route.service, Number(res.headers.get('retry-after')) || undefined);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return as === 'text' ? res.text() : res.json();
  }
}
