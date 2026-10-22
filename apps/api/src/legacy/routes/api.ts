/**
 * routes/api.ts - the types shared by the router (router.ts) and every route module.
 * The engine objects (store, portfolio, product) are still the untyped legacy ones, so they are `any` here for now;
 * tightening them is tracked in docs/BACKEND_PLAN.md (convert the engine to typed modules).
 */

/** What every route handler receives. */
export interface RouteContext {
  store: any;
  product: any;
  portfolio: any;
  query: Record<string, any>;
  body: any;
  params: Record<string, string>;
  actor: string;
  req: any;
  [extra: string]: any;
}

export type RouteHandler = (ctx: RouteContext) => any;

/** mutating: default is "not GET"; noProduct: portfolio-level route (no store); raw: body is a Buffer (25 MB limit). */
export interface RouteOptions {
  mutating?: boolean;
  noProduct?: boolean;
  raw?: boolean;
  optionalProduct?: boolean;
  /** only an administrator may call this route (the same rule as the /api/v1 endpoints that need the admin role) */
  admin?: boolean;
  /** a read that leaves an audit record (an export): the answer is the same, but the record is saved, and no X-Actor is demanded */
  records?: boolean;
}

export type RouteAdder = (pattern: string, handler: RouteHandler, opts?: RouteOptions) => void;

/** The helpers the router hands to each route module. */
export interface RouterApi {
  route: (method: string, pattern: string, handler: RouteHandler, opts?: RouteOptions) => void;
  get: RouteAdder;
  post: RouteAdder;
  patch: RouteAdder;
  del: RouteAdder;
  getPortfolio: () => any;
  MAX_UPLOAD: number;
}
