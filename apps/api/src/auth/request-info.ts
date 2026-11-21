import type { Request } from 'express';

/** Where a request came from, as recorded with sign-ups, sessions and activity. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  // `trust proxy` is set, so req.ip is the client's address as the host's proxy saw it.
  const ip = req.ip?.replace(/^::ffff:/, '') || null;
  const userAgent = req.get('user-agent')?.slice(0, 400) || null;
  return { ip, userAgent };
}

const TOOLS: [RegExp, string][] = [
  [/\bcurl\//i, 'curl'],
  [/\bwget\b/i, 'Wget'],
  [/python-requests|python-urllib|aiohttp|httpx/i, 'Python script'],
  [/PostmanRuntime/i, 'Postman'],
  [/insomnia/i, 'Insomnia'],
  [/node-fetch|undici|axios|\bnode\b/i, 'Node.js script'],
  [/Go-http-client/i, 'Go script'],
  [/okhttp/i, 'OkHttp client'],
  [/[a-z]bot\/|\bbot\b|crawler|spider|headlesschrome/i, 'Bot'],
];

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows NT/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

/**
 * A short description of the software behind a user agent, e.g. "Chrome on Windows" or "curl". Scripts and
 * bots are named as such, since a sign-up from one is worth a second look.
 */
export function describeDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  for (const [re, name] of TOOLS) if (re.test(userAgent)) return name;
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown browser';
}
