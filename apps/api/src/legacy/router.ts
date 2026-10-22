/**
 * router.ts - what is left of the older route table: the portfolio reference, reset-to-seed and the upload limit.
 * All routes now live in typed controllers under src/engine/controllers.
 */

import { ValidationError } from './engine/store';
import * as portfolioSeed from './scripts/seed_portfolio';
const MAX_UPLOAD = 25 * 1024 * 1024;
let portfolio = null;
const setPortfolio = (p) => { portfolio = p; };
const getPortfolioRef = () => portfolio;
/** Rebuild one product from its seed (reset button, demo replay). */
function resetToSeed(productId) {
  const entry = portfolio.resolve(productId);
  const build = portfolioSeed.SEEDS[entry.seed];
  if (!build) throw Object.assign(new Error(`product ${entry.id} was not created from a seed, so it cannot be reset`), { status: 409 });
  const fresh = build();
  const cur = portfolio.store(entry.id);
  cur.replaceData(fresh.data);
  portfolio.save(entry.id);
}
// ------------------------------------------------------------------ router
/** Every route is now a typed controller (src/engine/controllers); this table stays, empty, for the code that still lists it. */
const routes: any[] = [];
export const getPortfolio = getPortfolioRef;
export { routes, setPortfolio, resetToSeed, MAX_UPLOAD, ValidationError };
