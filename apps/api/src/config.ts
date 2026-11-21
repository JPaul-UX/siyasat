import { z } from 'zod';

/** An unset variable and an empty one mean the same thing. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /**
   * Sent to Crossref and OpenAlex as `mailto` (Crossref's "polite pool" gives higher rate limits per address)
   * and required by Unpaywall. Without it the full-text reader skips Unpaywall.
   */
  CONTACT_EMAIL: optional(z.email()),
  /** Free key from openalex.org. Without one, OpenAlex title search is rate-limited almost at once. */
  OPENALEX_API_KEY: optional(z.string()),
  SEMANTIC_SCHOLAR_API_KEY: optional(z.string()),
  /** Where the built web app is. Defaults to apps/web/dist next to this package. */
  WEB_DIST: optional(z.string()),
  /**
   * The site's public address, e.g. https://siyasat.example. Used for link previews. Without it, the
   * address each page was requested on is used, which is right unless the site answers on several domains.
   */
  PUBLIC_URL: optional(z.url()),
  /**
   * The super admin, who sees the admin dashboard. The account is created on start if it does not exist,
   * and the password here is always the one that works: change it here and restart to change it.
   */
  SUPER_ADMIN_EMAIL: optional(z.email()),
  SUPER_ADMIN_PASSWORD: optional(z.string().min(12, 'SUPER_ADMIN_PASSWORD must be at least 12 characters').max(200)),
  /** The time zone the admin dashboard counts days in. */
  STATS_TIMEZONE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .default('Asia/Manila')
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, 'STATS_TIMEZONE is not a time zone'),
  ),
}).refine((env) => !env.SUPER_ADMIN_EMAIL === !env.SUPER_ADMIN_PASSWORD, {
  message: 'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD together',
  path: ['SUPER_ADMIN_PASSWORD'],
});

export type Env = z.infer<typeof envSchema>;

/** The app's settings, read once from the environment. */
export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly databaseUrl: string;
  readonly contactEmail?: string;
  readonly openAlexApiKey?: string;
  readonly semanticScholarApiKey?: string;
  readonly webDist?: string;
  readonly publicUrl?: string;
  readonly superAdmin?: { email: string; password: string };
  readonly statsTimeZone: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.contactEmail = env.CONTACT_EMAIL;
    this.openAlexApiKey = env.OPENALEX_API_KEY;
    this.semanticScholarApiKey = env.SEMANTIC_SCHOLAR_API_KEY;
    this.webDist = env.WEB_DIST;
    this.publicUrl = env.PUBLIC_URL?.replace(/\/+$/, '');
    if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD) {
      this.superAdmin = { email: env.SUPER_ADMIN_EMAIL.trim().toLowerCase(), password: env.SUPER_ADMIN_PASSWORD };
    }
    this.statsTimeZone = env.STATS_TIMEZONE;
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // Local development keeps its settings in apps/api/.env; in production they are already in the environment.
  if (source === process.env) {
    try {
      process.loadEnvFile();
    } catch {
      /* no .env file */
    }
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return new AppConfig(parsed.data);
}
