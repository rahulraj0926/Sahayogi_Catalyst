import { loadEnv } from '../config/env';
import { rateLimit } from '../common/middleware/rate-limit';

let shared: ReturnType<typeof rateLimit> | undefined;
/** One limiter for every lifecycle-engine route, older address or new, so a caller cannot double the allowance by mixing them. */
export function engineLimit() {
  if (!shared) { const env = loadEnv(); shared = rateLimit({ reads: env.LEGACY_READ_LIMIT, writes: env.LEGACY_WRITE_LIMIT }); }
  return shared;
}
