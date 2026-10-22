/**
 * engine/compose_kit.ts - building blocks shared by the document composers (compose_p0..p4.js).
 *
 * A composed document is plain data:
 *   { sections: [ { id, heading, blocks: [block], needs: [need] } ] }
 * block: {t:'p', text} | {t:'ul', items:[text]} | {t:'table', headers:[text], rows:[[text]]} | {t:'diagram', title, mermaid, svg} | {t:'note', text}
 * need : {ok:boolean, label, why, target:{ui, request, api, create}}   (a required element; failed needs become the "Missing" block)
 * Text may contain item tokens [[PRD-001]]; the renderers turn them into links with a provenance badge. No content is
 * invented here: every sentence is built from field values, and absent data produces a need, never filler.
 */
import * as schema from './schema';
import * as requestsLib from './requests';

/** Query helpers over one store. Terminal-status items (Retired, Rejected...) are left out unless asked for. */
class Kit {
  store: any;
  constructor(store) { this.store = store; }
  list(type, pred, opts: any = {}) {
    return this.store.list(type, (i) => (opts.all || !schema.TERMINAL_STATUSES.has(i.status)) && (!pred || pred(i)))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }
  get(id) { return this.store.get(id); }
  title(id) { const i = this.store.get(id); return i ? i.title : id; }
  out(id, type) { return this.store.out(id, type).map((l) => this.store.get(l.target)).filter(Boolean); }
  inn(id, type) { return this.store.inn(id, type).map((l) => this.store.get(l.source)).filter(Boolean); }
  product() { return this.store.product(); }
  ref(i) { return i ? `[[${i.id}]]` : ''; }
  refs(items) { return items.map((i) => `[[${i.id}]]`).join(', '); }
  /** "[[ID]] Title" */
  named(i) { return `[[${i.id}]] ${i.title}`; }
}

// ---- block constructors ---------------------------------------------------------------
const p = (text) => ({ t: 'p', text });
const ul = (items) => ({ t: 'ul', items });
const note = (text) => ({ t: 'note', text });
const table = (headers, rows) => ({ t: 'table', headers, rows });
const diagram = (title, mermaid, svg) => ({ t: 'diagram', title, mermaid, svg });
const sec = (id, heading, blocks, needs) => ({ id, heading, blocks: blocks.filter(Boolean), needs: needs || [] });

/** Table of items from column specs [[header, fn(item)]]. */
function tableOf(items, cols) {
  return table(cols.map((c) => c[0]), items.map((i) => cols.map((c) => { const v = c[1](i); return v === undefined || v === null || v === '' ? '-' : String(v); })));
}

// ---- needs and deep-link targets -------------------------------------------------------
const PHASE_OF = (type) => { const ph = schema.TYPES[type] && schema.TYPES[type].phase; return typeof ph === 'number' ? ph : 'X'; };
/**
 * Where to go to supply something. `request` is a data request id (form: GET /api/requests/:id, answer with
 * POST /api/requests/:id/answer); `create` is the item type for a direct add (POST /api/items).
 */
function target(opts) {
  const t: any = {};
  if (opts.request) {
    const r = requestsLib.get(opts.request);
    t.request = opts.request;
    t.session = (r && r.session) || null;
    t.ui = `#/plan?request=${opts.request}`;
    t.form_api = `GET /api/requests/${opts.request}`;
    t.answer_api = `POST /api/requests/${opts.request}/answer`;
    t.minutes = r ? r.minutes : null;
    if (r && r.owner_kind === 'AGENT_RESEARCH') t.answer_api = 'POST /api/agent/ingest';
    if (r && r.owner_kind === 'DERIVED') t.answer_api = `POST /api/requests/${opts.request}/derive`;
  }
  if (opts.create) {
    t.create = { type: opts.create, api: 'POST /api/items', phase: PHASE_OF(opts.create) };
    if (!t.ui) t.ui = `#/phase/${PHASE_OF(opts.create)}`;
  }
  if (opts.ui) t.ui = opts.ui;
  return t;
}
const need = (ok, label, why, tgt) => ({ ok: !!ok, label, why: why || '', target: tgt || {} });
/** Need: at least `min` items of a list. */
const needCount = (items, min, label, why, tgt) => need(items.length >= min, label, why, tgt);

// ---- text helpers ------------------------------------------------------------------------
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clip = (s, n = 160) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '...' : s; };
const sentence = (s) => { s = String(s || '').trim(); return s && !/[.!?]$/.test(s) ? s + '.' : s; };
/** "2 entries", "1 policy", "3 boxes": a plural for a regular English noun (an explicit `many` always wins). */
const pluralWord = (w) => (/[^aeiou]y$/i.test(w) ? w.replace(/y$/i, 'ies') : /(s|x|z|ch|sh)$/i.test(w) ? w + 'es' : w + 's');
const plural = (n, one, many?) => `${n} ${n === 1 ? one : many || pluralWord(one)}`;
const andList = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
const countBy = (arr, fn) => { const m = {}; for (const x of arr) { const k = fn(x) || 'unspecified'; m[k] = (m[k] || 0) + 1; } return m; };
const countsText = (m) => andList(Object.entries(m).map(([k, v]) => `${v} ${k}`));

// ---- diagram layout (shared by flows and state maps) ---------------------------------------
const mermaidLabel = (s) => String(s || '').replace(/["\[\]{}()<>|#;&`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || ' ';
const xmlEsc = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Minimal layered layout + SVG. nodes: [{id, label, shape: 'start'|'end'|'task'|'decision'|'external'|'state'|'final'}],
 * edges: [{from, to, kind: 'happy'|'alternate'|'failure'|'forbidden', label}]. Returns an SVG string (labels escaped).
 */
function layoutSvg(nodes, edges) {
  const W = 150; const H = 44; const GX = 40; const GY = 54;
  const ids = nodes.map((n) => n.id);
  const level = {};
  const succ = {};
  for (const e of edges) (succ[e.from] = succ[e.from] || []).push(e.to);
  const hasIn = new Set(edges.filter((e) => e.kind !== 'failure' || true).map((e) => e.to));
  const roots = nodes.filter((n) => !hasIn.has(n.id)).map((n) => n.id);
  if (!roots.length && ids.length) roots.push(ids[0]);
  const queue = roots.map((r) => { level[r] = 0; return r; });
  while (queue.length) { // BFS; back edges (loops) are ignored by only raising a level once
    const cur = queue.shift();
    for (const nx of succ[cur] || []) if (level[nx] === undefined) { level[nx] = level[cur] + 1; queue.push(nx); }
  }
  for (const id of ids) if (level[id] === undefined) level[id] = 0;
  const rows = {};
  const pos = {};
  for (const id of ids) { const l = level[id]; rows[l] = (rows[l] || 0) + 1; pos[id] = { l, c: rows[l] - 1 }; }
  const maxCols = Math.max(1, ...Object.values<number>(rows));
  const maxLevel = Math.max(0, ...Object.values<number>(level));
  const width = maxCols * (W + GX) + GX; const height = (maxLevel + 1) * (H + GY) + GY;
  const xy = (id) => ({ x: GX + pos[id].c * (W + GX) + ((maxCols - rows[pos[id].l]) * (W + GX)) / 2, y: GY / 2 + pos[id].l * (H + GY) });
  const color = { happy: '#2b6cb0', alternate: '#718096', failure: '#c53030', forbidden: '#c53030' };
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" font-family="sans-serif" font-size="11"><defs>`;
  for (const [k, c] of Object.entries(color)) out += `<marker id="ar-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${c}"/></marker>`;
  out += '</defs>';
  for (const e of edges) {
    if (!pos[e.from] || !pos[e.to]) continue;
    const a = xy(e.from); const b = xy(e.to);
    const k = color[e.kind] ? e.kind : 'happy';
    const down = pos[e.to].l >= pos[e.from].l;
    const x1 = a.x + W / 2; const y1 = down ? a.y + H : a.y; const x2 = b.x + W / 2; const y2 = down ? b.y : b.y + H;
    const dash = k === 'alternate' || k === 'forbidden' ? ' stroke-dasharray="5,3"' : '';
    out += `<path d="M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}" fill="none" stroke="${color[k]}" stroke-width="1.4"${dash} marker-end="url(#ar-${k})"/>`;
    if (e.label) out += `<text x="${(x1 + x2) / 2 + 4}" y="${(y1 + y2) / 2}" fill="${color[k]}">${xmlEsc(String(e.label).slice(0, 22))}</text>`;
  }
  for (const n of nodes) {
    const { x, y } = xy(n.id);
    const label = xmlEsc(String(n.label || n.id).slice(0, 38));
    const shape = n.shape || 'task';
    const fill = { start: '#c6f6d5', end: '#fed7d7', final: '#fed7d7', decision: '#fefcbf', external: '#e9d8fd', state: '#e2e8f0' }[shape] || '#ebf8ff';
    if (shape === 'decision') out += `<polygon points="${x + W / 2},${y} ${x + W},${y + H / 2} ${x + W / 2},${y + H} ${x},${y + H / 2}" fill="${fill}" stroke="#4a5568"/>`;
    else out += `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${shape === 'start' || shape === 'end' || shape === 'final' ? 20 : 5}" fill="${fill}" stroke="#4a5568"/>`;
    out += `<text x="${x + W / 2}" y="${y + H / 2 + 4}" text-anchor="middle" fill="#1a202c">${label}</text>`;
  }
  return out + '</svg>';
}

/** Mermaid flowchart text for flow-like graphs. */
function mermaidFlow(nodes, edges) {
  const lines = ['flowchart TD'];
  const nid = (id) => id.replace(/[^A-Za-z0-9]/g, '_');
  for (const n of nodes) {
    const l = mermaidLabel(n.label);
    const shape = n.shape || 'task';
    lines.push(`  ${nid(n.id)}${shape === 'decision' ? `{${l}}` : shape === 'start' || shape === 'end' ? `([${l}])` : shape === 'external' ? `[[${l}]]` : `[${l}]`}`);
  }
  for (const e of edges) {
    const arrow = e.kind === 'failure' || e.kind === 'forbidden' ? '-.->' : e.kind === 'alternate' ? '-->' : '==>';
    lines.push(`  ${nid(e.from)} ${arrow}${e.label ? `|${mermaidLabel(e.label)}|` : ''} ${nid(e.to)}`);
  }
  return lines.join('\n');
}
function mermaidStates(nodes, edges) {
  const lines = ['stateDiagram-v2'];
  const nid = (id) => id.replace(/[^A-Za-z0-9]/g, '_');
  for (const n of nodes) lines.push(`  state "${mermaidLabel(n.label)}" as ${nid(n.id)}`);
  for (const n of nodes) { if (n.initial) lines.push(`  [*] --> ${nid(n.id)}`); if (n.terminal) lines.push(`  ${nid(n.id)} --> [*]`); }
  for (const e of edges) lines.push(`  ${nid(e.from)} --> ${nid(e.to)}${e.kind === 'forbidden' ? ': forbidden' : ''}`);
  return lines.join('\n');
}

export { Kit, p, ul, note, table, tableOf, diagram, sec, need, needCount, target, cap, clip, sentence, plural, andList, countBy, countsText, layoutSvg, mermaidFlow, mermaidStates, xmlEsc, mermaidLabel };
