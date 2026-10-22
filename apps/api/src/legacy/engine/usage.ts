/**
 * engine/usage.ts - the cost guard for the paid (live) assistant.
 *
 * The leader cannot afford unlimited AI service cost, so in LIVE mode only (ANTHROPIC_API_KEY set):
 *   1. before every run the screen shows an ESTIMATE of tokens and rupees for that one file and asks for a click to confirm;
 *   2. every run is written to a usage log (date, file, goal, estimated and, when the service returns them, actual tokens);
 *   3. this month's total is shown in the Files and Reports screens;
 *   4. a monthly cap (SD_MONTHLY_CAP_INR, or the setting the leader changes in the app; 0 = no cap) refuses to run when reached.
 * In simple or demo mode nothing here is shown or enforced, and nothing is sent to the network without the key.
 *
 * Estimate: input tokens = text characters / 4 + 1,500 for the instructions; expected output = 2,000 tokens.
 * Prices per million tokens come from SD_PRICE_IN_USD (default 3) and SD_PRICE_OUT_USD (default 15); the exchange rate from SD_USD_INR (default 87).
 * These are estimates, not an invoice.
 */
import { localDate } from './units';

const INSTRUCTION_TOKENS = 1500;
const EXPECTED_OUTPUT_TOKENS = 2000;
const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
const round2 = (x) => Math.round(x * 100) / 100;

/** True only when the paid assistant would be used: a key is set and the offline demo is not forced. */
const isLive = () => !!process.env.ANTHROPIC_API_KEY && process.env.SD_ASSIST_MOCK !== '1';

function prices() {
  return { in_usd_per_million: num(process.env.SD_PRICE_IN_USD, 3), out_usd_per_million: num(process.env.SD_PRICE_OUT_USD, 15), usd_inr: num(process.env.SD_USD_INR, 87) };
}

const costInr = (tokensIn, tokensOut, p = prices()) => round2(((tokensIn * p.in_usd_per_million + tokensOut * p.out_usd_per_million) / 1e6) * p.usd_inr);

/** Estimate for a document of `chars` characters of text. */
function estimate(chars) {
  const p = prices();
  const tokens_in = Math.ceil(Math.max(0, chars) / 4) + INSTRUCTION_TOKENS;
  const tokens_out = EXPECTED_OUTPUT_TOKENS;
  return {
    chars, tokens_in, tokens_out, tokens_total: tokens_in + tokens_out, cost_inr: costInr(tokens_in, tokens_out, p), prices: p,
    basis: `Estimate only: about ${tokens_in.toLocaleString('en-IN')} tokens in (the file text divided by 4, plus ${INSTRUCTION_TOKENS.toLocaleString('en-IN')} for the instructions) and ${tokens_out.toLocaleString('en-IN')} tokens out. The real bill can differ.`,
  };
}

// ---- the ledger: one per portfolio (the cost is the leader's, across all products) -------------------------------
/** Ledger shape: { log: [entry], cap_inr: number|null }. For a portfolio it lives in portfolio.reg.usage. */
function ledgerOf(owner) {
  if (owner && owner.reg) return (owner.reg.usage = owner.reg.usage || { log: [], cap_inr: null });
  if (owner && owner.log) return owner;
  const holder = owner || {};
  return (holder._usage = holder._usage || { log: [], cap_inr: null });
}

const monthOf = (date?) => String(date || localDate()).slice(0, 7);

/** Monthly cap in rupees: the setting if the leader set one, else SD_MONTHLY_CAP_INR, else 0 (no cap). */
function capOf(ledger) {
  if (ledger.cap_inr !== null && ledger.cap_inr !== undefined) return { cap_inr: num(ledger.cap_inr, 0), source: 'setting' };
  return { cap_inr: num(process.env.SD_MONTHLY_CAP_INR, 0), source: process.env.SD_MONTHLY_CAP_INR !== undefined ? 'environment' : 'none' };
}

function setCap(ledger, value) {
  if (value === null || value === '' || value === undefined) { ledger.cap_inr = null; return capOf(ledger); }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw httpErr(422, 'The monthly limit must be a number of rupees, 0 or more. Use 0 for no limit.');
  ledger.cap_inr = round2(n);
  return capOf(ledger);
}

const spentOf = (e) => (e.status === 'failed' ? 0 : e.actual_cost_inr !== null && e.actual_cost_inr !== undefined ? e.actual_cost_inr : e.estimated_cost_inr || 0);

function monthTotal(ledger, month = monthOf()) {
  const rows = ledger.log.filter((e) => monthOf(e.date) === month && e.status !== 'failed');
  return {
    month, calls: rows.length, spent_inr: round2(rows.reduce((s, e) => s + spentOf(e), 0)),
    tokens_in: rows.reduce((s, e) => s + (e.actual_tokens_in !== null && e.actual_tokens_in !== undefined ? e.actual_tokens_in : e.estimated_tokens_in || 0), 0),
    tokens_out: rows.reduce((s, e) => s + (e.actual_tokens_out !== null && e.actual_tokens_out !== undefined ? e.actual_tokens_out : e.estimated_tokens_out || 0), 0),
  };
}

/** Everything the screens show about cost. Returns { live: false } outside live mode, so nothing is shown. */
function summary(ledger, opts: any = {}) {
  if (!isLive()) return { live: false };
  const cap = capOf(ledger); const month = monthTotal(ledger);
  return {
    live: true, month, cap_inr: cap.cap_inr, cap_source: cap.source, remaining_inr: cap.cap_inr > 0 ? round2(Math.max(0, cap.cap_inr - month.spent_inr)) : null,
    cap_reached: cap.cap_inr > 0 && month.spent_inr >= cap.cap_inr, prices: prices(),
    log: ledger.log.slice(-(opts.limit || 30)).reverse(),
    note: 'Costs are estimates unless the service returned the real token counts. This is not an invoice.',
  };
}

/** Throw if the run would pass the monthly cap. Called before the network is touched. */
function assertWithinCap(ledger, est) {
  const cap = capOf(ledger).cap_inr;
  if (!(cap > 0)) return;
  const spent = monthTotal(ledger).spent_inr;
  if (spent >= cap) throw httpErr(403, `The monthly limit for the paid assistant (Rs ${cap}) has been reached: Rs ${spent} used so far this month. Nothing was sent. Raise the limit in Settings or wait until next month.`, { code: 'monthly_cap_reached', month: monthTotal(ledger), cap_inr: cap });
  if (spent + est.cost_inr > cap) throw httpErr(403, `This run would pass the monthly limit for the paid assistant: Rs ${spent} used, about Rs ${est.cost_inr} for this file, limit Rs ${cap}. Nothing was sent. Raise the limit in Settings, or try a smaller file.`, { code: 'monthly_cap_would_be_passed', estimate: est, month: monthTotal(ledger), cap_inr: cap });
}

/** Append one entry. usage = the numbers the service returned ({input_tokens, output_tokens}) or null. */
function record(ledger, e) {
  const p = prices();
  const actualIn = e.usage && Number.isFinite(Number(e.usage.input_tokens)) ? Number(e.usage.input_tokens) : null;
  const actualOut = e.usage && Number.isFinite(Number(e.usage.output_tokens)) ? Number(e.usage.output_tokens) : null;
  const entry = {
    date: localDate(), at: new Date().toISOString(), file: e.file, attachment: e.attachment, product: e.product || null, goal: e.goal, by: e.by || null, status: e.status || 'ok',
    estimated_tokens_in: e.estimate.tokens_in, estimated_tokens_out: e.estimate.tokens_out, estimated_cost_inr: e.estimate.cost_inr,
    actual_tokens_in: actualIn, actual_tokens_out: actualOut, actual_cost_inr: actualIn !== null && actualOut !== null ? costInr(actualIn, actualOut, p) : null,
    note: e.note || undefined,
  };
  ledger.log.push(entry);
  if (ledger.log.length > 2000) ledger.log.splice(0, ledger.log.length - 2000);
  return entry;
}

export { isLive, prices, estimate, costInr, ledgerOf, capOf, setCap, monthTotal, summary, assertWithinCap, record, INSTRUCTION_TOKENS, EXPECTED_OUTPUT_TOKENS };
