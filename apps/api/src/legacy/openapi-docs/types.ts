/**
 * Hand-written API descriptions for the older /api routes (F13). A route listed here shows real parameters, request body and answer in
 * the API reference; the rest show a generic JSON object. Keep entries next to the behaviour they describe: when a route's input or
 * answer changes, change its entry and run `npm run openapi:export -w apps/api`. `npm run test:contract` fails when an entry names a
 * route that no longer exists, so a renamed or removed route cannot leave a stale description behind.
 */
export type Schema = Record<string, any>;
export interface RouteDoc {
  summary: string;
  description?: string;
  /** query parameters other than `product` (added for you) */
  query?: Record<string, { description: string; schema?: Schema; required?: boolean }>;
  /** JSON request body */
  body?: Schema;
  /** JSON answer on success */
  response?: Schema;
  /** the answer is a file, not JSON: media type (and optional note) */
  file?: { type: string; description?: string };
  /** raw upload body (binary) */
  upload?: string;
  /** extra error answers: status -> text (404, 409, 422, 429 are described for every route) */
  errors?: Record<string, string>;
}
export interface DocSet { schemas?: Record<string, Schema>; routes: Record<string, RouteDoc> }

export const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
export const str = (description?: string, extra: Schema = {}): Schema => ({ type: 'string', ...(description ? { description } : {}), ...extra });
export const int = (description?: string): Schema => ({ type: 'integer', ...(description ? { description } : {}) });
export const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
export const obj = (properties: Record<string, Schema>, required: string[] = [], extra: Schema = {}): Schema => ({ type: 'object', properties, ...(required.length ? { required } : {}), ...extra });
export const arr = (items: Schema): Schema => ({ type: 'array', items });
