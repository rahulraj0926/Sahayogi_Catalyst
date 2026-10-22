/**
 * engine/assistant.ts - the assistant that reads uploaded documents and PROPOSES items, links and pointers.
 *
 * Hard rules (enforced here, not by the model):
 *   1. The assistant can only add rows to the REVIEW INBOX (store.data.inbox, status "proposed"). It never creates an item,
 *      link or pointer. A person calls accept (or accept-all) and only then are real records written, by that person.
 *   2. Every proposal carries a pointer proposal (locator + exact quote). The quote is verified against the extracted text at
 *      the locator, server side. A proposal whose quote is not found is DROPPED and logged as a hallucination rejection.
 *   3. Proposed fields are validated against the item schema; invalid proposals are dropped with a reason.
 *   4. Accepted items get origin "assistant"; verification is "unverified" (pending) unless the reviewer is a different person
 *      from the person who asked for the proposal, in which case it is "verified" by the reviewer.
 *
 * MODES (provider-agnostic):
 *   live       ANTHROPIC_API_KEY is set  -> POST https://api.anthropic.com/v1/messages with node:https. Model id from SD_MODEL
 *              (default claude-sonnet-5-5). ONLY the extracted text of the one document (with locators), the goal and the field
 *              list are sent. NOTHING is ever sent to the network unless ANTHROPIC_API_KEY is set.
 *   mock       SD_ASSIST_MOCK=1          -> deterministic proposals built offline from the heuristic engine, plus one deliberately
 *              invented quote so the hallucination filter is exercised. No network.
 *   heuristic  neither set               -> the regex / heuristic suggestion engine (engine/suggest.ts and the rules below). No network.
 */
import * as https from 'node:https';
import * as schema from './schema';
import * as attachments from './attachments';
import * as locators from './locators';
import * as pointers from './pointers';
import { suggest, planKey } from './suggest';
import * as usage from './usage';
import * as extractLib from './extract';
import * as unitsMod from './units';
import * as suggestMod from './suggest';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const GOALS = {
  competitor_profile: { label: 'Competitor profile fields', needsCompetitor: true, types: ['Competitor'] },
  competitor_prices: { label: 'Competitor prices', needsCompetitor: true, types: ['PricePoint'] },
  capabilities: { label: 'Competitor capabilities', needsCompetitor: true, types: ['CompetitorCapability'] },
  requirements_from_document: { label: 'Requirements stated in the document', needsCompetitor: false, types: ['Requirement'] },
  stakeholders: { label: 'People and stakeholders', needsCompetitor: false, types: ['Stakeholder'] },
};
const MAX_PROPOSALS = 40;
const MAX_TEXT = 60000;

const mode = () => (process.env.SD_ASSIST_MOCK === '1' ? 'mock' : process.env.ANTHROPIC_API_KEY ? 'live' : 'heuristic');
let transportOverride = null; // tests inject a fake HTTP layer: async (requestBody) => responseJson
const setTransport = (fn) => { transportOverride = fn; };

// ------------------------------------------------------------------ heuristic proposers
const CATEGORY_RULES = [[/sponsor|ceo|founder|managing director|chairman/i, 'Sponsor'], [/legal|compliance|regulat/i, 'Regulator/Legal'], [/security|privacy|dpo/i, 'Security/Privacy'], [/finance|cfo|accounts|treasur/i, 'Finance'], [/engineer|cto|tech|delivery|developer|architect|project|product/i, 'Delivery'], [/customer|client|dealer|buyer|owner/i, 'Customer'], [/operations|noc|support|dispatch|logistic/i, 'Operations'], [/sales|marketing|commercial/i, 'Commercial'], [/partner|vendor|supplier/i, 'Partner'], [/user|operator|clerk|analyst|executive|staff/i, 'End-user']];
const categoryOf = (role) => { const r = CATEGORY_RULES.find(([re]) => (re as any).test(role)); return r ? r[1] : null; };
const LEVEL_WORDS = [[/^(yes|supported|available|included|native|full|y|✓|true)\b/i, 'parity'], [/^(partial|limited|add-on|addon|beta|on request|conditional)/i, 'partial'], [/^(no|not supported|not available|none|n\/a|absent|x|✗|false)\b/i, 'absent'], [/^(best|leading|advanced|strong)/i, 'strong']];

/** Heuristic proposals for a goal from an extraction. Returns raw proposals (not yet verified): {type, subtype?, fields, locator, quote, confidence, reason, update?}. */
function heuristic(ex, goal) {
  const out = [];
  const s = suggest(ex);
  if (goal === 'competitor_prices') {
    for (const c of s.candidates.filter((x) => x.kind === 'price_point' && x.locator)) out.push({ type: 'PricePoint', also: c.also_found, fields: c.fields, locator: c.locator, quote: c.quote, confidence: c.confidence, reason: `${c.reasons.join('; ')}${c.assumptions.length ? '. Assumed: ' + c.assumptions.join('; ') : ''}` });
  } else if (goal === 'competitor_profile') {
    for (const c of s.candidates.filter((x) => x.kind === 'competitor_field' && x.locator)) out.push({ type: 'Competitor', update: true, fields: c.fields, locator: c.locator, quote: c.quote, confidence: c.confidence, reason: c.reasons.join('; ') });
  } else if (goal === 'capabilities') {
    for (const u of locators.unitsOf(ex)) {
      for (const [ri, row] of (u.tables.length ? u.tables : []).flatMap((t, ti) => t.rows.map((r, i) => [ti * 10000 + i, r, t]))) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const name = String(row[0]).trim(); const ans = String(row[1]).trim();
        const lv = LEVEL_WORDS.find(([re]) => (re as any).test(ans));
        if (!lv || !name || name.length > 90 || /^(feature|capability|name)$/i.test(name)) continue;
        const line = `${row.join(' | ')}`;
        const para = (u.text.split('\n').findIndex((l) => l.trim() === line.trim())) + 1;
        if (!para) continue;
        out.push({ type: 'CompetitorCapability', fields: { capability_tag: name, level: lv[1], evidence_basis: 'documented', importance: 3, note: `Document says: ${ans}` }, locator: { kind: 'paragraph', index: u.index, paragraph: para }, quote: line, confidence: 0.7, reason: `a table row pairs the capability "${name}" with "${ans}"` });
      }
    }
  } else if (goal === 'requirements_from_document') {
    for (const u of locators.unitsOf(ex)) u.text.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.length < 25 || t.length > 400 || !/\b(shall|must|should)\b/i.test(t) || /^notes:/i.test(t)) return;
      out.push({ type: 'Requirement', subtype: 'functional', fields: { title: t.replace(/\.$/, '').slice(0, 70), statement: t, priority: /\b(shall|must)\b/i.test(t) ? 'Must' : 'Should', flow_applicability: 'flow' }, locator: { kind: 'paragraph', index: u.index, paragraph: i + 1 }, quote: t, confidence: /\b(shall|must)\b/i.test(t) ? 0.7 : 0.55, reason: 'the sentence states an obligation with "shall", "must" or "should"' });
    });
  } else if (goal === 'stakeholders') {
    for (const u of locators.unitsOf(ex)) {
      for (const t of u.tables) {
        const hdr = (t.rows[0] || []).map((h) => String(h).toLowerCase()); const ni = hdr.findIndex((h) => /name|person/.test(h)); const ri = hdr.findIndex((h) => /role|title|designation/.test(h));
        if (ni < 0 || ri < 0) continue;
        t.rows.slice(1).forEach((r, i) => { const cat = categoryOf(String(r[ri])); if (!r[ni] || !cat) return; out.push({ type: 'Stakeholder', fields: { title: String(r[ni]).trim(), category: cat, role_title: String(r[ri]).trim() }, locator: { kind: 'table_cell', index: u.index, table: u.tables.indexOf(t) + 1, row: i + 2, col: ni + 1 }, quote: String(r[ni]).trim(), confidence: 0.65, reason: `a table lists "${r[ni]}" with role "${r[ri]}"` }); });
      }
      u.text.split('\n').forEach((line, i) => {
        const m = /^\s*([A-Z][A-Za-z.' -]{2,40}?)\s*[(,–-]\s*([A-Za-z][A-Za-z &/]{2,40}?)\)?\s*$/.exec(line);
        if (!m || line.includes('|')) return;
        const cat = categoryOf(m[2]); if (!cat) return;
        out.push({ type: 'Stakeholder', fields: { title: m[1].trim(), category: cat, role_title: m[2].trim() }, locator: { kind: 'paragraph', index: u.index, paragraph: i + 1 }, quote: line.trim(), confidence: 0.55, reason: `the line names "${m[1].trim()}" with the role "${m[2].trim()}"` });
      });
    }
  }
  return out.slice(0, MAX_PROPOSALS);
}

// ------------------------------------------------------------------ live model
/** The text sent to the model: one line per addressable line, prefixed with its locator, capped. */
function promptCorpus(ex) {
  const lines = []; let size = 0;
  const add = (tag, text) => { const l = `[${tag}] ${text}`; if (size + l.length > MAX_TEXT) return false; lines.push(l); size += l.length + 1; return true; };
  for (const u of locators.unitsOf(ex)) {
    if (u.unit === 'sheet') { for (const c of (ex.sheets.find((s) => s.index === u.index).cells)) if (!add(`c:${u.title}!${c.ref}`, String(c.value))) return { text: lines.join('\n'), truncated: true }; continue; }
    for (const [i, l] of u.text.split('\n').entries()) if (l.trim() && !add(`p:${u.index}:${i + 1}`, l)) return { text: lines.join('\n'), truncated: true };
  }
  return { text: lines.join('\n'), truncated: false };
}
function parseLocatorRef(ref) {
  const s = String(ref || '').trim().replace(/^\[|\]$/g, '');
  let m;
  if ((m = /^p:(\d+):(\d+)$/.exec(s))) return { kind: 'paragraph', index: Number(m[1]), paragraph: Number(m[2]) };
  if ((m = /^c:(.+)!([A-Za-z]+\d+)$/.exec(s))) return { kind: 'sheet_cell', sheet: m[1], cell: m[2].toUpperCase() };
  return null;
}
const locatorRef = (l) => (l.kind === 'paragraph' ? `p:${l.index}:${l.paragraph}` : l.kind === 'sheet_cell' ? `c:${l.sheet}!${l.cell}` : null);

function buildPrompt(ex, goal, competitor) {
  const g = GOALS[goal];
  const fieldList = g.types.map((t) => `${t}: ${schema.fieldsFor(t, t === 'Requirement' ? 'functional' : undefined).filter((f) => !f.derived).map((f) => `${f.name}${f.kind === 'enum' ? '(' + f.values.join('|') + ')' : ''}${f.required ? '*' : ''}`).join(', ')}`).join('\n');
  const corpus = promptCorpus(ex);
  const system = 'You extract structured facts from one document for a product-documentation tool. You only PROPOSE; a person reviews everything. Never invent facts: every proposal must quote the document exactly. Reply with JSON only.';
  const user = `Goal: ${g.label}${competitor ? ` for the competitor "${competitor.title}"` : ''}.\n\nAllowed item types and their fields (* required):\n${fieldList}\n\nThe document, one line per locator. A locator looks like p:<unit>:<line> or c:<Sheet>!<Cell>:\n${corpus.text}\n\nReturn {"proposals":[{"type":"<one of the types>","fields":{...},"locator":"<locator copied from the line you used>","quote":"<exact words copied from that line, at most 300 characters>","confidence":<0 to 1>,"reason":"<one sentence>"}]}. ${goal === 'competitor_profile' ? 'For Competitor, fields holds only the profile field(s) found (one field per proposal).' : ''} At most ${MAX_PROPOSALS} proposals. If nothing in the document fits the goal, return {"proposals":[]}.`;
  return { system, user, truncated: corpus.truncated, chars: corpus.text.length };
}

function httpsPost(body, key) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ method: 'POST', hostname: 'api.anthropic.com', path: '/v1/messages', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-length': Buffer.byteLength(data) }, timeout: 60000 }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); if (res.statusCode >= 300) return reject(httpErr(502, `the assistant service answered ${res.statusCode}: ${text.slice(0, 200)}`)); try { resolve(JSON.parse(text)); } catch (e) { reject(httpErr(502, 'the assistant service sent an unreadable answer')); } });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => reject(httpErr(502, `could not reach the assistant service: ${e.message}`)));
    req.end(data);
  });
}

/** One call to the paid service. Returns { list, usage } where usage is what the service reported ({input_tokens, output_tokens}) or null. */
async function callModel(ex, goal, competitor, prompt) {
  const p = prompt || buildPrompt(ex, goal, competitor);
  const body = { model: process.env.SD_MODEL || 'claude-sonnet-5-5', max_tokens: 4000, system: p.system, messages: [{ role: 'user', content: p.user }] };
  const res = await (transportOverride ? transportOverride(body) : httpsPost(body, process.env.ANTHROPIC_API_KEY));
  const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const m = /\{[\s\S]*\}/.exec(text);
  let parsed; try { parsed = JSON.parse(m ? m[0] : text); } catch (e) { throw httpErr(502, 'the assistant did not return valid JSON', { usage: res.usage || null }); }
  const list = (parsed.proposals || []).map((x) => ({ type: x.type, subtype: x.subtype, update: x.type === 'Competitor', fields: x.fields || {}, locator: typeof x.locator === 'string' ? parseLocatorRef(x.locator) : x.locator, quote: x.quote, confidence: Number(x.confidence), reason: x.reason }));
  return { list, usage: res.usage || null };
}

/** Mock: the heuristic proposals in model format plus one invented quote (to be rejected). Deterministic, offline. */
function mockModel(ex, goal) {
  const raw = heuristic(ex, goal);
  const first = locators.unitsOf(ex)[0];
  raw.push({ type: GOALS[goal].types[0], update: goal === 'competitor_profile', fields: goal === 'competitor_prices' ? { plan: 'Imaginary plan', amount: 1, currency: 'INR', unit: 'user/month', value_metric: 'user', price_type: 'list', billing_model: 'subscription', tax_basis: 'excl_gst' } : goal === 'competitor_profile' ? { founded_year: 1999 } : goal === 'capabilities' ? { capability_tag: 'Imaginary capability', level: 'strong' } : goal === 'stakeholders' ? { title: 'Imaginary Person', category: 'Sponsor' } : { title: 'Imaginary requirement', statement: 'The system shall do something the document never says.', priority: 'Must' }, locator: { kind: 'paragraph', index: first ? first.index : 1, paragraph: 1 }, quote: 'This sentence does not appear anywhere in the document', confidence: 0.99, reason: 'mock hallucination to prove the filter' });
  return raw;
}

// ------------------------------------------------------------------ inbox
const inbox = (store) => (store.data.inbox = store.data.inbox || []);
const hallucinations = (store) => (store.data.hallucinations = store.data.hallucinations || []);
function nextId(store) { const n = (store.data.counters.PRP = (store.data.counters.PRP || 0) + 1); return `PRP-${String(n).padStart(3, '0')}`; }

function validateFields(p) {
  const def = schema.TYPES[p.type];
  if (!def) return [`unknown type ${p.type}`];
  const known = new Set(schema.fieldsFor(p.type, p.subtype).map((f) => f.name).concat(['title']));
  const errs = [];
  for (const k of Object.keys(p.fields)) if (!known.has(k)) errs.push(`unknown field ${k}`);
  const probe = { id: 'X-1', type: p.type, ...(p.subtype ? { subtype: p.subtype } : {}), status: def.initialStatus, phase: def.phase, origin: 'assistant', title: p.fields.title || 'probe', ...p.fields };
  return errs.concat(schema.validateItem(probe, { strictRequired: false }));
}

// ------------------------------------------------------------------ duplicates, facts already recorded, conflicts
const isTerminal = (i) => schema.TERMINAL_STATUSES.has(i.status);
const lc = (s) => String(s === undefined || s === null ? '' : s).trim().toLowerCase();
const rupees = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;
const moneyText = (f) => `${f.currency === 'INR' || !f.currency ? 'Rs' : f.currency} ${Number(f.amount).toLocaleString('en-IN')}`;

/** Plain place name for a locator: "slide 3, table 1, row 2, column 2" or "sheet Prices, cell C3". */
function whereText(ex, loc) {
  if (!loc) return '';
  if (loc.kind === 'sheet_cell') return `sheet ${loc.sheet}, cell ${loc.cell}`;
  return locators.describe(ex, loc);
}

/** The key that makes two proposals the same fact. */
function factKey(type, fields) {
  if (type === 'PricePoint') return JSON.stringify(['price', planKey(fields.plan), fields.amount, fields.currency, fields.billing_period || '', fields.unit || '']);
  if (type === 'CompetitorCapability') return JSON.stringify(['cap', lc(fields.capability_tag), fields.level]);
  if (type === 'Stakeholder') return JSON.stringify(['person', lc(fields.title)]);
  if (type === 'Requirement') return JSON.stringify(['req', lc(fields.statement || fields.title).replace(/[^a-z0-9]+/g, ' ')]);
  return JSON.stringify([type, fields]);
}

/** Is this fact already a record? Returns the existing item id, or null. */
function alreadyRecorded(store, type, fields, competitor) {
  if (type === 'Competitor') {
    if (!competitor) return null;
    const keys = Object.keys(fields);
    return keys.length && keys.every((k) => competitor[k] !== undefined && JSON.stringify(competitor[k]) === JSON.stringify(fields[k])) ? competitor.id : null;
  }
  const pool = competitor && ['PricePoint', 'CompetitorCapability'].includes(type) ? store.out(competitor.id, 'contains').map((l) => store.get(l.target)).filter((i) => i && i.type === type) : store.list(type);
  const key = factKey(type, type === 'Stakeholder' || type === 'Requirement' ? { ...fields } : fields);
  const hit = pool.find((i) => !isTerminal(i) && factKey(type, type === 'PricePoint' ? i : type === 'CompetitorCapability' ? i : type === 'Stakeholder' ? { title: i.title } : { statement: i.statement, title: i.title }) === key);
  return hit ? hit.id : null;
}

/** Other recorded or proposed prices for the same plan with a different amount. */
function priceConflicts(store, prop, comp, ex) {
  if (prop.item.type !== 'PricePoint') return [];
  const f = prop.item.fields; const k = planKey(f.plan);
  if (!k) return [];
  const out = [];
  const comparable = (o) => o.currency === f.currency && planKey(o.plan) === k && o.amount !== f.amount && (!o.billing_period || !f.billing_period || o.billing_period === f.billing_period);
  const side = (o, extra) => ({ plan: o.plan, amount: o.amount, currency: o.currency, price_type: o.price_type || null, billing_period: o.billing_period || null, ...extra });
  for (const p of inbox(store)) {
    if (p === prop || p.status === 'rejected' || p.item.type !== 'PricePoint' || (p.competitor_id || null) !== (prop.competitor_id || null)) continue;
    if (!comparable(p.item.fields)) continue;
    const att = store.get(p.attachment);
    out.push(side(p.item.fields, { source: 'proposal', ref: p.id, status: p.status, file: att ? att.filename : null, same_file: p.attachment === prop.attachment, where: p.where || null, quote: p.pointer.quote }));
  }
  if (comp) {
    for (const l of store.out(comp.id, 'contains')) {
      const it = store.get(l.target);
      if (!it || it.type !== 'PricePoint' || isTerminal(it) || !comparable(it)) continue;
      const pv = it.provenance || {};
      out.push(side(it, { source: 'item', ref: it.id, status: it.status, file: pv.filename || null, where: pv.location || null, quote: pv.snippet || it.title }));
    }
  }
  return out;
}

function conflictText(f, o) {
  const diffType = o.price_type && f.price_type && o.price_type !== f.price_type;
  if (o.same_file) return `Inside this file, ${o.plan} is ${moneyText(o)} at the other place but ${moneyText(f)} here.${diffType ? ` One is a ${o.price_type} price and the other a ${f.price_type} price, so some difference can be normal.` : ''} Check which one is right before accepting.`;
  return `${o.same_file ? `Elsewhere in this same file${o.where ? ` (${o.where})` : ''}` : o.file ? `${o.file}${o.where ? `, ${o.where}` : ''}` : 'Another record'} says ${o.plan} costs ${moneyText(o)} but this says ${moneyText(f)}.${diffType ? ` One is a ${o.price_type} price and the other a ${f.price_type} price, so some difference can be normal.` : ''} Check which one is right before accepting.`;
}

/** Fill prop.conflicts (and the matching entry on the older proposals). Returns how many were found. */
function flagConflicts(store, prop, comp, ex) {
  const found = priceConflicts(store, prop, comp, ex);
  if (!found.length) return 0;
  prop.conflicts = found.map((o) => ({ ...o, text: conflictText(prop.item.fields, o) }));
  prop.flags = Array.from(new Set([...(prop.flags || []), 'conflict']));
  for (const o of found.filter((x) => x.source === 'proposal')) {
    const older = inbox(store).find((p) => p.id === o.ref);
    if (!older) continue;
    const att = store.get(prop.attachment);
    const back = { plan: prop.item.fields.plan, amount: prop.item.fields.amount, currency: prop.item.fields.currency, price_type: prop.item.fields.price_type || null, billing_period: prop.item.fields.billing_period || null, source: 'proposal', ref: prop.id, status: prop.status, file: att ? att.filename : null, same_file: prop.attachment === older.attachment, where: prop.where || null, quote: prop.pointer.quote };
    older.conflicts = (older.conflicts || []).filter((c) => c.ref !== prop.id).concat([{ ...back, text: conflictText(older.item.fields, back) }]);
    older.flags = Array.from(new Set([...(older.flags || []), 'conflict']));
  }
  return found.length;
}

// ------------------------------------------------------------------ cost estimate (live mode only)
/** What a live run on this file would cost. { live:false } in simple or demo mode: nothing is shown or enforced. */
function costEstimate(store, attachmentId, body, dir, ctx: any = {}) {
  const goal = (body || {}).goal;
  if (!usage.isLive()) return { live: false, mode: mode() };
  if (!GOALS[goal]) throw httpErr(422, `goal must be one of ${Object.keys(GOALS).join(', ')}`);
  const { attachment, extraction: ex } = attachments.text(store, attachmentId, dir);
  if (['unsupported', 'failed'].includes(ex.status)) throw unreadable(attachment, ex);
  const competitor = (body.competitor_id || body.target) ? store.get(body.competitor_id || body.target) : null;
  const p = buildPrompt(ex, goal, competitor && competitor.type === 'Competitor' ? competitor : null);
  const est = usage.estimate(p.chars);
  const ledger = usage.ledgerOf(ctx.ledger || store);
  const sum = usage.summary(ledger, { limit: 0 });
  return { live: true, mode: 'live', file: attachment.filename, goal, truncated: p.truncated, estimate: est, month: sum.month, cap_inr: sum.cap_inr, remaining_inr: sum.remaining_inr, cap_reached: sum.cap_reached, would_pass_cap: sum.cap_inr > 0 && sum.month.spent_inr + est.cost_inr > sum.cap_inr, note: 'These numbers are estimates, not an invoice. Nothing is sent until you confirm.' };
}

/** A specific, plain refusal for a file whose text cannot be read. */
function unreadable(attachment, ex) {
  const reason = ex.reason || extractLib.explain({ status: ex.status, kind: ex.kind, warnings: ex.warnings, filename: attachment.filename, chars: ex.chars }) || { code: 'unsupported', title: 'No text could be read from this file.', advice: 'Save it as a PDF, Word, Excel or text file and upload that.' };
  return httpErr(422, `${reason.title} ${reason.advice}`, { code: 'unreadable_file', reason, hint: reason.advice });
}

/**
 * Run the assistant on one attachment. Returns {mode, goal, added[], rejected_hallucinations[], dropped[], merged, already_recorded[], inbox_total}.
 * In live mode: refuses past the monthly cap, needs body.confirm_cost === true (after the estimate was shown), logs the usage.
 * ctx (optional): { ledger, save, product } - the portfolio's usage ledger and a function that persists it.
 */
async function assist(store, attachmentId, body, actor, dir, ctx: any = {}) {
  const goal = body.goal;
  if (!GOALS[goal]) throw httpErr(422, `goal must be one of ${Object.keys(GOALS).join(', ')}`);
  const { attachment, extraction: ex } = attachments.text(store, attachmentId, dir);
  if (['unsupported', 'failed'].includes(ex.status) || (ex.status === 'partial' && !ex.chars)) throw unreadable(attachment, ex);
  const target = store.out(attachmentId, 'attached_to').map((l) => l.target)[0];
  let competitorId = body.competitor_id || body.target || null;
  if (!competitorId && target && (store.get(target) || {}).type === 'Competitor') competitorId = target;
  const competitor = competitorId ? store.get(competitorId) : null;
  if (competitorId && (!competitor || competitor.type !== 'Competitor')) throw httpErr(422, `${competitorId} is not a competitor`);
  const m = mode();
  let raw; let ledger = null; let est = null; let prompt = null; let used = null;
  if (m === 'live') {
    // cost guard: estimate, cap, then an explicit click, all BEFORE anything is sent to the network
    ledger = usage.ledgerOf(ctx.ledger || store);
    prompt = buildPrompt(ex, goal, competitor);
    est = usage.estimate(prompt.chars);
    usage.assertWithinCap(ledger, est);
    if (body.confirm_cost !== true) {
      const sum = usage.summary(ledger, { limit: 0 });
      throw httpErr(409, `This run is paid. It is estimated at about ${est.tokens_total.toLocaleString('en-IN')} tokens, roughly Rs ${est.cost_inr}. Confirm to go ahead.`, { code: 'confirm_required', estimate: est, month: sum.month, cap_inr: sum.cap_inr });
    }
    try {
      const r = await callModel(ex, goal, competitor, prompt);
      raw = r.list; used = r.usage;
    } catch (e) {
      usage.record(ledger, { file: attachment.filename, attachment: attachmentId, product: ctx.product, goal, by: actor, estimate: est, usage: e.usage || null, status: 'failed', note: e.message });
      if (ctx.save) ctx.save();
      throw e;
    }
    usage.record(ledger, { file: attachment.filename, attachment: attachmentId, product: ctx.product, goal, by: actor, estimate: est, usage: used, status: 'ok' });
    if (ctx.save) ctx.save();
  } else if (m === 'mock') raw = mockModel(ex, goal);
  else raw = heuristic(ex, goal);
  const source = m === 'live' ? 'model' : m;
  const added = []; const rejected = []; const dropped = []; const recorded = []; let merged = 0;
  const existing = new Set(inbox(store).filter((x) => x.attachment === attachmentId && x.status === 'proposed').map((x) => JSON.stringify([x.goal, x.item.fields, x.pointer.locator])));
  const pendingFacts = new Map(inbox(store).filter((x) => x.attachment === attachmentId && x.status === 'proposed' && (x.competitor_id || null) === (competitor ? competitor.id : null)).map((x) => [factKey(x.item.type, x.item.fields), x]));
  // best first, so that when the same fact is read twice the stronger reading (a table cell beats a sentence) is kept
  const ordered = raw.slice(0, MAX_PROPOSALS).sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  for (const r of ordered) {
    const fail = (why) => dropped.push({ type: r.type, quote: String(r.quote || '').slice(0, 80), reason: why });
    if (!GOALS[goal].types.includes(r.type)) { fail(`type ${r.type} is not allowed for goal ${goal}`); continue; }
    if (!r.locator) { fail('no usable locator'); continue; }
    const v = locators.verifyQuote(ex, r.locator, r.quote);
    if (!v.ok) {
      const h = { at: store.now(), attachment: attachmentId, goal, source, quote: String(r.quote || '').slice(0, 300), locator: r.locator, reason: v.reason };
      hallucinations(store).push(h); rejected.push(h);
      store.audit('assistant.hallucination_rejected', attachmentId, `${actor}'s assistant run (${source}) proposed a quote that is not in ${attachment.filename}; it was dropped: ${v.reason}`, { actor, goal });
      continue;
    }
    const fields = { ...r.fields };
    // "when did you see this": the date in the file (written in the quote, else the day it was uploaded), not today
    if (['PricePoint', 'CompetitorCapability'].includes(r.type) && !fields.captured_on) fields.captured_on = unitsMod.sourceDate(attachment, r.quote, store.today());
    if (r.type === 'Competitor') delete fields.title;
    if (r.type === 'PricePoint' && fields.plan) fields.plan = suggestMod.cleanPlan(fields.plan);
    const probe = { type: r.type, subtype: r.subtype, fields: r.type === 'Competitor' ? fields : { title: fields.title || `${fields.plan || fields.capability_tag || fields.statement || 'item'}`.slice(0, 80), ...fields } };
    const errs = r.type === 'Competitor' ? validateFields({ type: 'Competitor', fields }) : validateFields(probe);
    if (errs.length) { fail(`invalid fields: ${errs.slice(0, 3).join('; ')}`); continue; }
    if (r.type === 'Competitor' && !competitor) { fail('a competitor is needed to apply profile fields (send competitor_id)'); continue; }
    const key = JSON.stringify([goal, r.type === 'Competitor' ? fields : probe.fields, r.locator]);
    if (existing.has(key)) { fail('duplicate of a proposal already in the inbox'); continue; }
    existing.add(key);
    const useFields = r.type === 'Competitor' ? fields : probe.fields;
    // the same fact read twice from this file (table cell and the sentence around it) is ONE proposal
    const fk = factKey(r.type, useFields);
    const twin: any = r.type === 'Competitor' ? null : pendingFacts.get(fk);
    if (twin) { merged++; (twin.also_seen = twin.also_seen || []).push({ where: whereText(ex, r.locator), quote: locators.norm(r.quote) }); continue; }
    // a fact that is already a record is not offered again
    const have = alreadyRecorded(store, r.type, useFields, competitor);
    if (have) { recorded.push({ item: have, type: r.type, quote: String(r.quote || '').slice(0, 80) }); continue; }
    const prop: any = {
      id: nextId(store), attachment: attachmentId, goal, status: 'proposed', kind: r.type === 'Competitor' ? 'update_fields' : 'create_item', competitor_id: competitor ? competitor.id : null,
      item: { type: r.type, subtype: r.subtype || undefined, fields: useFields }, pointer: { locator: r.locator, quote: locators.norm(r.quote) }, where: whereText(ex, r.locator),
      confidence: Math.max(0, Math.min(1, Number.isFinite(r.confidence) ? r.confidence : 0.5)), reason: String(r.reason || '').slice(0, 400), source, proposed_by: actor, proposed_at: store.now(),
      ...(ex.pasted ? { from_pasted: { by: ex.pasted.by, at: ex.pasted.at } } : {}),
    };
    if (r.also && r.also.length) { prop.also_seen = r.also.map((a) => ({ where: whereText(ex, a.locator), quote: locators.norm(a.quote) })); merged += r.also.length; }
    inbox(store).push(prop); added.push(prop); pendingFacts.set(fk, prop);
  }
  // conflicts: the same plan with a different amount in another place (another file, another line, or an existing record)
  let conflicts = 0;
  for (const p of added) conflicts += flagConflicts(store, p, competitor, ex) ? 1 : 0;
  for (const p of added) if (p.also_seen) p.reason = `${p.reason}${p.reason ? '. ' : ''}The same fact also appears at ${p.also_seen.map((s) => s.where).join('; ')}; those were merged into this one.`.slice(0, 600);
  store.audit('assistant.run', attachmentId, `${actor} ran the assistant (${source}) on ${attachment.filename} for "${goal}": ${added.length} proposal(s) added, ${merged} duplicate(s) merged, ${recorded.length} already recorded, ${conflicts} with conflicting numbers, ${rejected.length} rejected as not in the document, ${dropped.length} dropped`, { actor, goal });
  return {
    mode: m, source, goal, attachment: attachments.brief(store.get(attachmentId)), competitor_id: competitor ? competitor.id : null, added, rejected_hallucinations: rejected, dropped, merged, already_recorded: recorded, conflicts,
    inbox_pending: inbox(store).filter((x) => x.status === 'proposed').length,
    ...(m === 'live' ? { cost: { estimated: est, actual_tokens: used ? { input: used.input_tokens, output: used.output_tokens } : null, actual_cost_inr: used ? usage.costInr(Number(used.input_tokens) || 0, Number(used.output_tokens) || 0) : null, month: usage.monthTotal(ledger) } } : {}),
    note: 'These are PROPOSALS in the review inbox. Nothing has been created. A person must accept each one (POST /api/inbox/:id/accept).',
  };
}

function listInbox(store, q: any = {}) {
  const status = q.status || 'proposed';
  const all = inbox(store).filter((x) => (!q.attachment || x.attachment === q.attachment) && (!q.goal || x.goal === q.goal));
  const byAtt = new Map();
  for (const p of all) { if (!byAtt.has(p.attachment)) byAtt.set(p.attachment, []); byAtt.get(p.attachment).push(p); }
  const groups = [...byAtt.entries()].map(([id, ps]) => {
    const att = store.get(id);
    const counts = { proposed: 0, accepted: 0, rejected: 0 }; for (const p of ps) counts[p.status]++;
    return { attachment: att ? { id, filename: att.filename, status: att.status } : { id }, counts, proposals: ps.filter((p) => status === 'all' || p.status === status).sort((a, b) => b.confidence - a.confidence) };
  }).filter((g) => g.proposals.length || status === 'all');
  const counts = { proposed: 0, accepted: 0, rejected: 0 }; for (const p of all) counts[p.status]++;
  return { status_filter: status, counts, total: all.length, hallucination_rejections: hallucinations(store).filter((h) => !q.attachment || h.attachment === q.attachment).length, assistant_mode: mode(), groups };
}

function find(store, id) { const p = inbox(store).find((x) => x.id === id); if (!p) throw httpErr(404, `proposal ${id} not found`); return p; }

/** Accept one proposal: creates the real item(s), links and the confirmed pointer, as the reviewing person. */
function accept(store, id, body, actor, dir) {
  const p = find(store, id);
  if (p.status !== 'proposed') throw httpErr(409, `${id} is already ${p.status}`);
  const att = attachments.get(store, p.attachment);
  if (att.status === 'Deleted') throw httpErr(410, `${att.id} was deleted`);
  const competitorId = body.competitor_id || p.competitor_id;
  if ((GOALS[p.goal].needsCompetitor) && !competitorId) throw httpErr(422, 'competitor_id is required to accept this proposal');
  const comp = competitorId ? store.get(competitorId) : null;
  if (competitorId && (!comp || comp.type !== 'Competitor')) throw httpErr(422, `${competitorId} is not a competitor`);
  const different = actor !== p.proposed_by;
  const snap = JSON.stringify(store.data);
  const created = [];
  try {
    let itemId;
    if (p.kind === 'update_fields') {
      const patch = {}; const skipped = [];
      for (const [k, v] of Object.entries({ ...p.item.fields, ...(body.overrides || {}) })) { if (comp[k] !== undefined && comp[k] !== '' && JSON.stringify(comp[k]) !== JSON.stringify(v) && !body.overwrite) skipped.push(k); else patch[k] = v; }
      if (!Object.keys(patch).length) throw httpErr(409, `the competitor already has ${skipped.join(', ')}; send overwrite: true to replace it`);
      store.update(comp.id, patch, { actor });
      itemId = comp.id;
    } else {
      const f = { ...p.item.fields, ...(body.overrides || {}), proposed_by: p.proposed_by, verification: different ? 'verified' : 'unverified', ...(different ? { verified_by: actor, verified_on: store.today(), verified_note: `Checked the quote in ${att.filename}${p.where ? ` (${p.where})` : ''} against the file itself` } : {}), requested_by: p.proposed_by };
      if (!f.title) f.title = `${f.plan || f.capability_tag || f.statement || 'item'}`.slice(0, 80);
      if (['PricePoint', 'CompetitorCapability'].includes(p.item.type)) { f.captured_on = f.captured_on || store.today(); f.title = `${comp ? comp.title + ' ' : ''}${f.plan || f.capability_tag || f.title}`.slice(0, 120); }
      if (p.item.type === 'CompetitorCapability') { f.capture_method = f.capture_method || 'ai_proposed'; }
      const it = store.create(p.item.type, f, { actor, origin: 'assistant', subtype: p.item.subtype });
      itemId = it.id; created.push(it.id);
      if (comp && ['PricePoint', 'CompetitorCapability'].includes(p.item.type)) store.link('contains', comp.id, it.id, {}, { actor, silent: true });
      store.link('attached_to', att.id, it.id, {}, { actor, silent: true });
    }
    const ptr = pointers.create(store, { attachment: att.id, locator: p.pointer.locator, quote: p.pointer.quote, target: itemId, origin: 'assistant', status: 'confirmed', confidence: p.confidence, reason: p.reason }, actor, dir);
    p.status = 'accepted'; p.reviewed_by = actor; p.reviewed_at = store.now(); p.result = { item: itemId, created, pointer: ptr.pointer.id, verification: p.kind === 'update_fields' ? null : (different ? 'verified' : 'unverified') };
    store.audit('inbox.accept', id, `${actor} accepted ${id} (${p.item.type}${itemId ? ' ' + itemId : ''}) from ${att.filename}; pointer ${ptr.pointer.id} confirmed`, { actor, proposer: p.proposed_by });
    return { proposal: p, item: itemId, pointer: ptr.pointer, verification: p.result.verification, note: p.kind === 'update_fields' ? 'Competitor fields were set from the document; the pointer links the competitor back to the exact quote.' : different ? 'Verified by the reviewer, who is a different person from the proposer.' : 'Pending verification: a different person must verify this item (POST /api/agent/verify/:id).' };
  } catch (e) { store.replaceData(JSON.parse(snap)); throw e; }
}

/**
 * Save changes to a waiting proposal without accepting it. body: { fields: { name: value, ... }, competitor_id? }. An empty value removes an optional field.
 * The quote and its place in the file never change. The card stays "proposed"; conflicts with other places are checked again.
 */
function edit(store, id, body, actor) {
  const p = find(store, id);
  if (p.status !== 'proposed') throw httpErr(409, `${id} is already ${p.status}`);
  const patch = (body && body.fields) || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw httpErr(422, 'fields must be an object, for example {"amount": 1499}');
  const old = p.item.fields; const next = { ...old };
  const derive = (fields) => `${fields.plan || fields.capability_tag || fields.statement || 'item'}`.slice(0, 80);
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === '' || v === undefined) delete next[k]; else next[k] = typeof v === 'string' ? v.trim() : v; }
  if (p.item.type === 'PricePoint' && next.plan) next.plan = suggestMod.cleanPlan(next.plan);
  if (old.title && old.title === derive(old) && p.item.type !== 'Competitor') next.title = derive(next);
  let compId = p.competitor_id;
  if (body && body.competitor_id !== undefined) {
    compId = body.competitor_id || null;
    const c = compId ? store.get(compId) : null;
    if (compId && (!c || c.type !== 'Competitor')) throw httpErr(422, `${compId} is not a competitor`);
  }
  const errs = validateFields({ type: p.item.type, subtype: p.item.subtype, fields: next });
  if (errs.length) throw httpErr(422, `These changes are not valid: ${errs.slice(0, 3).join('; ')}`, { errors: errs });
  const changed = Object.keys({ ...old, ...next }).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(next[k]));
  const compChanged = compId !== p.competitor_id;
  if (!changed.length && !compChanged) return { proposal: p, changed: [], note: 'Nothing was different, so nothing was saved.' };
  p.item.fields = next; p.competitor_id = compId || null;
  p.edited_by = actor; p.edited_at = store.now(); p.edits = (p.edits || []).concat([{ by: actor, at: p.edited_at, changed: compChanged ? changed.concat(['competitor']) : changed }]).slice(-20);
  // numbers may now agree or disagree with other places: check again
  for (const o of inbox(store)) if (o !== p && o.conflicts) { o.conflicts = o.conflicts.filter((c) => c.ref !== p.id); if (!o.conflicts.length) { delete o.conflicts; o.flags = (o.flags || []).filter((x) => x !== 'conflict'); } }
  delete p.conflicts; p.flags = (p.flags || []).filter((x) => x !== 'conflict');
  flagConflicts(store, p, compId ? store.get(compId) : null, null);
  store.audit('inbox.edit', id, `${actor} changed ${[...changed, ...(compChanged ? ['competitor'] : [])].join(', ')} on ${id} before deciding`, { actor });
  return { proposal: p, changed };
}

function reject(store, id, body, actor) {
  const p = find(store, id);
  if (p.status !== 'proposed') throw httpErr(409, `${id} is already ${p.status}`);
  p.status = 'rejected'; p.reviewed_by = actor; p.reviewed_at = store.now(); p.reject_reason = String((body && body.reason) || '').slice(0, 300);
  store.audit('inbox.reject', id, `${actor} rejected ${id}${p.reject_reason ? ': ' + p.reject_reason : ''}`, { actor });
  return { proposal: p };
}

function acceptAll(store, q, body, actor, dir) {
  if (!q.attachment) throw httpErr(422, 'attachment is required');
  const min = Number(q.minConfidence);
  const all = inbox(store).filter((p) => p.attachment === q.attachment && p.status === 'proposed' && (!Number.isFinite(min) || p.confidence >= min));
  // a proposal whose number disagrees with another place is never accepted in bulk: a person picks the right one
  const held = all.filter((p) => p.conflicts && p.conflicts.length);
  const todo = all.filter((p) => !held.includes(p));
  const accepted = []; const failed = [];
  for (const p of todo) { try { accepted.push(accept(store, p.id, body || {}, actor, dir).item); } catch (e) { failed.push({ id: p.id, error: e.message }); } }
  return { attachment: q.attachment, min_confidence: Number.isFinite(min) ? min : null, considered: all.length, accepted: accepted.length, accepted_items: accepted, failed, held_back_conflicts: held.map((p) => p.id) };
}

export { assist, costEstimate, listInbox, accept, edit, reject, acceptAll, mode, setTransport, GOALS, heuristic, buildPrompt, parseLocatorRef, locatorRef };
