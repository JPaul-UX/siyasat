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
   * The owner account, created on startup. Required in production so someone can approve new users.
   * Changing ADMIN_PASSWORD and restarting updates the password.
   */
  ADMIN_EMAIL: optional(z.email()),
  ADMIN_PASSWORD: optional(z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters').max(200)),
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
  readonly adminEmail?: string;
  readonly adminPassword?: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.contactEmail = env.CONTACT_EMAIL;
    this.openAlexApiKey = env.OPENALEX_API_KEY;
    this.semanticScholarApiKey = env.SEMANTIC_SCHOLAR_API_KEY;
    this.webDist = env.WEB_DIST;
    this.publicUrl = env.PUBLIC_URL?.replace(/\/+$/, '');
    this.adminEmail = env.ADMIN_EMAIL?.toLowerCase();
    this.adminPassword = env.ADMIN_PASSWORD;
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
  const env = parsed.data;
  const hasAdminEmail = !!env.ADMIN_EMAIL;
  const hasAdminPassword = !!env.ADMIN_PASSWORD;
  if (hasAdminEmail !== hasAdminPassword) {
    throw new Error('Invalid environment:\n  ADMIN_EMAIL: Set both ADMIN_EMAIL and ADMIN_PASSWORD, or leave both empty.');
  }
  if (env.NODE_ENV === 'production' && !hasAdminEmail) {
    throw new Error(
      'Invalid environment:\n  ADMIN_EMAIL: Set ADMIN_EMAIL and ADMIN_PASSWORD before starting Siyasat in production.\n' +
        '  ADMIN_EMAIL is the email you log in with. ADMIN_PASSWORD is your password (at least 8 characters).\n' +
        '  The app creates that admin account on startup. On Railway, add both under the service Variables, then redeploy.',
    );
  }
  return new AppConfig(env);
}
