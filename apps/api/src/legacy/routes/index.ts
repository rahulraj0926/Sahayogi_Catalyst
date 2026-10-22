/**
 * routes/index.ts - mounts the product-layer routes (everything added on top of the single-product API).
 * Each module receives the router helpers { get, post, patch, del, route, getPortfolio }.
 * Product scope: every route except /api/portfolio/* runs against one product, chosen by ?product=ID or the X-Product header
 * (default: the first non-archived product); handlers receive { store, product, portfolio, query, body, params, actor }.
 */
import type { RouterApi } from './api';

export default (api: RouterApi): void => {
};
