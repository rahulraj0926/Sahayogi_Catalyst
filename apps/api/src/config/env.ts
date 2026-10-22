import { z } from 'zod';

/** All environment variables the API reads, validated once at boot. A bad value stops the server with a clear message. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Requests per minute per IP on /api/v1 (the legacy /api bridge has its own limits). */
  THROTTLE_LIMIT: z.coerce.number().int().min(10).default(300),
  /** Requests per minute per IP for reads on the older /api routes. */
  LEGACY_SUNSET: z.string().default('Wed, 30 Jun 2027 23:59:59 GMT'),
  LEGACY_READ_LIMIT: z.coerce.number().int().min(10).default(900),
  /** Requests per minute per IP for changes on the older /api routes. */
  LEGACY_WRITE_LIMIT: z.coerce.number().int().min(5).default(180),
  /** Set when the API sits behind a reverse proxy, so the caller's real address is used (number of proxies, or 'loopback'). */
  TRUST_PROXY: z.string().optional(),
  /** Comma list of people who may act as founder/admin (accept or reject ideas). Empty = everyone in development only. */
  ADMIN_ACTORS: z.string().default(''),
  /** json = one JSON object per log line (default in production), pretty = readable console lines. */
  LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
  /** Bearer token for GET /metrics. In production /metrics is off until this is set. */
  METRICS_TOKEN: z.string().min(16, 'METRICS_TOKEN must be at least 16 characters').optional(),
  /** A backup older than this many hours is reported as stale by /health/ready and /metrics. */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().min(1).default(36),
  /** Set to 1 to serve Swagger at /api/docs (always on outside production). */
  SWAGGER: z.enum(['0', '1']).optional(),
});

export type Env = z.infer<typeof schema>;

let dotenvLoaded = false;
/** Reads apps/api/.env once (values already in the environment win). Node 22 has this built in. */
function loadDotenv() {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  try { process.loadEnvFile('.env'); } catch { /* no .env file: use the real environment */ }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) loadDotenv();
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export const adminActors = (env: Env): string[] => env.ADMIN_ACTORS.split(',').map((s) => s.trim()).filter(Boolean);
