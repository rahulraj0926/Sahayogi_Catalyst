/**
 * engine/sheet.ts - the Product sheet: one page of answers per product, built only from what was entered.
 * It never invents anything. Every row carries its status and where it came from, and a link to the record.
 * Also: cross-product search (searchAll) over records, so a pricing plan or a feature can be found by anyone.
 */
import { TERMINAL_STATUSES, TYPES } from './schema';
import * as attachments from './attachments';

const LABEL = {
  Feature: 'Feature', PricingPlan: 'Pricing plan', PricePoint: 'Competitor price', Competitor: 'Competitor', CompetitorCapability: 'Competitor capability',
  Story: 'Story', BusinessRule: 'Rule', Obligation: 'Legal duty', Metric: 'Quality target', Question: 'Open question', Decision: 'Decision', Module: 'Module',
  Persona: 'User type', Segment: 'Customer group', Problem: 'Problem', Opportunity: 'Opportunity', Risk: 'Risk', Constraint: 'Constraint', Assumption: 'Assumption',
  Stakeholder: 'Person involved', Evidence: 'Evidence', Flow: 'Flow', Requirement: 'Requirement', AcceptanceCriterion: 'Acceptance check', Entity: 'Data object',
};

const live = (i) => !TERMINAL_STATUSES.has(i.status);
const src = (i) => ({ id: i.id, title: i.title || i.id, status: i.status, origin: i.origin || 'human', by: i.created_by || '' });
const byId = (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
const money = (amount, cur, per) => {
  if (amount === undefined || amount === null || amount === '') return 'On request';
  const n = Number(amount);
  const txt = Number.isFinite(n) ? n.toLocaleString('en-IN') : String(amount);
  return `${cur || ''} ${txt}${per ? ` / ${per}` : ''}`.trim();
};
const PERIOD = { one_time: 'one time', monthly: 'month', quarterly: 'quarter', yearly: 'year', per_unit: '', custom: '' };

function others(store, id, type) {
  const out = [];
  for (const l of [...store.out(id), ...store.inn(id)]) {
    const o = store.get(l.source === id ? l.target : l.source);
    if (o && o.type === type && live(o)) out.push(o);
  }
  return out;
}

/** Stories reach a feature directly or through the requirements derived from it. */
function storiesOf(store, f) {
  const seen = new Set(others(store, f.id, 'Story').map((x) => x.id));
  for (const r of others(store, f.id, 'Requirement')) for (const st of others(store, r.id, 'Story')) seen.add(st.id);
  return seen.size;
}

function sheet(store, entry) {
  const prod = store.product() || {};
  const features = store.list('Feature', live).sort(byId).map((f) => ({
    ...src(f), description: f.description || '', priority: f.priority || '', scope: f.scope_status || '', mandatory: !!f.mandatory,
    module: (others(store, f.id, 'Module')[0] || {}).title || '',
    requirements: others(store, f.id, 'Requirement').length,
    stories: storiesOf(store, f),
  }));
  const plans = store.list('PricingPlan', live).sort(byId).map((p) => ({
    ...src(p), price: money(p.amount, p.currency, p.billing_period === 'per_unit' ? p.unit : PERIOD[p.billing_period]),
    amount: p.amount === undefined ? null : p.amount, currency: p.currency || '', billing_period: p.billing_period || '', unit: p.unit || '',
    includes: p.includes || '', limits: p.limits || '', audience: p.audience || '', is_free: !!p.is_free,
  }));
  const competitors = store.list('Competitor', live).sort(byId).map((c) => {
    const prices = store.out(c.id, 'contains').map((l) => store.get(l.target)).filter((x) => x && x.type === 'PricePoint' && live(x));
    return {
      ...src(c), website: c.website || '', positioning: c.positioning || '', tier: c.tier || '',
      prices: prices.sort(byId).map((p) => ({ ...src(p), plan: p.plan || '', price: money(p.amount, p.currency, p.unit), captured_on: p.captured_on || '' })),
      pricing_na_reason: c.pricing_na_reason || '',
    };
  });
  const simple = (type, pick) => store.list(type, live).sort(byId).map((i) => ({ ...src(i), ...pick(i) }));
  const rules = simple('BusinessRule', (i) => ({ text: i.statement || '', category: i.category || '' }));
  const duties = simple('Obligation', (i) => ({ text: i.obligation_text || i.applicability || '', kind: i.kind || '' }));
  const targets = simple('Metric', (i) => ({ text: i.definition || '', target: [i.comparator, i.target_value, i.unit].filter((x) => x !== undefined && x !== '').join(' ') }));
  const questions = store.list('Question', (i) => live(i) && !i.answer).sort(byId).map((i) => ({ ...src(i), priority: i.priority || '', asked_of: i.asked_of || '' }));
  const people = simple('Stakeholder', (i) => ({ text: i.role || i.description || '' }));
  const approved = (arr) => arr.filter((x) => ['Approved', 'Validated', 'Reviewed', 'Accepted'].includes(x.status)).length;
  return {
    product: { id: entry && entry.id, name: (entry && entry.name) || prod.title || 'Product', one_liner: (entry && entry.one_liner) || '', kind: (entry && entry.kind) || prod.product_kind || '', audience: prod.audience || '', stage: entry && entry.stage },
    features, plans, competitors, rules, duties, targets, questions, people,
    counts: {
      features: features.length, features_approved: approved(features), plans: plans.length, competitors: competitors.length,
      competitor_prices: competitors.reduce((n, c) => n + c.prices.length, 0), rules: rules.length, duties: duties.length, targets: targets.length, questions: questions.length,
    },
  };
}

// ---------------------------------------------------------------- search
const SKIP_FIELDS = new Set(['id', 'type', 'status', 'phase', 'origin', 'verification', 'proposed_by', 'rev', 'created_at', 'updated_at', 'created_by', 'fp', 'verified_by', 'verified_at']);
const norm = (s) => String(s).toLowerCase();

function searchAll(portfolio, q, opts: any = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')) : w));
  if (!words.length) return { q, total: 0, groups: [] };
  const hits = [];
  for (const p of portfolio.list()) {
    let store; try { store = portfolio.store(p.id); } catch (e) { continue; }
    if (opts.product && opts.product !== p.id) continue;
    const pname = norm(p.name);
    for (const it of store.all()) {
      if (!LABEL[it.type] && !TYPES[it.type]) continue;
      if (!LABEL[it.type]) continue;
      const title = norm(it.title || '');
      let text = '';
      for (const [k, v] of Object.entries(it)) {
        if (SKIP_FIELDS.has(k) || k === 'title') continue;
        if (typeof v === 'string' || typeof v === 'number') text += ` ${v}`;
      }
      text = norm(text);
      const all = `${title} ${text} ${norm(it.id)} ${pname} ${norm(LABEL[it.type])}`;
      if (!words.every((w) => all.includes(w))) continue;
      const inTitle = words.every((w) => title.includes(w) || norm(it.id).includes(w));
      const rawText = String(` ${it.description || it.statement || it.obligation_text || it.includes || it.positioning || it.definition || ''}`).replace(/\s+/g, ' ').trim();
      const lead = it.type === 'PricingPlan' ? `${money(it.amount, it.currency, it.billing_period === 'per_unit' ? it.unit : PERIOD[it.billing_period])}. ` : '';
      const at = rawText ? norm(rawText).indexOf(words[0]) : -1;
      const snippet = lead + (rawText ? (at > 40 ? '...' + rawText.slice(at - 30, at + 110) : rawText.slice(0, 140)) : '');
      hits.push({ product_id: p.id, product: p.name, id: it.id, type: it.type, label: LABEL[it.type], title: it.title || it.id, status: it.status, snippet, score: (inTitle ? 2 : 0) + (live(it) ? 1 : 0) });
    }
    // text inside uploaded files (decks, documents, sheets, PDFs), as far as it could be read
    for (const att of store.list('Attachment', (x) => x.status !== 'Deleted')) {
      let plain = '';
      try { plain = String(attachments.text(store, att.id, portfolio.uploadsDir(p.id)).extraction.plain_text || ''); } catch (e) { continue; }
      const low = norm(plain);
      const name = norm(att.filename || att.title || '');
      if (!words.every((w) => low.includes(w) || name.includes(w))) continue;
      const at = low.indexOf(words[0]);
      const clean = plain.replace(/\s+/g, ' ');
      const snippet = at >= 0 ? (at > 40 ? '...' : '') + clean.slice(Math.max(0, at - 40), at + 140) : '';
      hits.push({ product_id: p.id, product: p.name, id: att.id, type: 'Attachment', label: 'File', title: att.filename || att.title || att.id, status: 'Uploaded', snippet, href: `#/p/${encodeURIComponent(p.id)}/files/${encodeURIComponent(att.id)}`, score: name.includes(words[0]) ? 2 : 0 });
    }
  }
  hits.sort((a, b) => b.score - a.score || String(a.label).localeCompare(b.label) || byId(a, b));
  const groups = [];
  for (const h of hits.slice(0, opts.limit || 300)) {
    let g = groups.find((x) => x.label === h.label);
    if (!g) { g = { label: h.label, items: [] }; groups.push(g); }
    g.items.push(h);
  }
  return { q, total: hits.length, groups };
}

export { sheet, searchAll, LABEL };
