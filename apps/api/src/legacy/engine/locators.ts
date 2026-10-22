/**
 * engine/locators.ts - stable locators into extracted documents, and quote verification.
 *
 * A locator is a plain object: { kind, ... } with kind one of
 *   slide        { index }                                  whole slide (title, body, tables, notes)
 *   page         { index }                                  a PDF page, or a document section
 *   paragraph    { index, paragraph }                       line `paragraph` (1-based) of slide / page / section `index`
 *   table_cell   { index, table, row, col }                 1-based table, row, column inside unit `index`
 *   sheet_cell   { sheet, cell }                            e.g. { sheet: "Prices", cell: "C3" }
 *   sheet_range  { sheet, range }                           e.g. "A1:C3"
 *   text_offset  { offset, length }                         character range of extraction.plain_text
 * The numbers are positions in the extractor's own output, so they are stable as long as the file is not re-uploaded.
 * addLocators() decorates an extraction with `blocks` (paragraph lines) and table `cells` that carry their locators so a
 * viewer can render and highlight them.
 */
import { colIndex, colLetters } from './extract_office';

const norm = (s) => String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();

/** Units of an extraction in a uniform shape. */
function unitsOf(ex) {
  if (ex.slides) return ex.slides.map((u) => ({ unit: 'slide', index: u.index, title: u.title, text: [u.text, u.notes ? `Notes: ${u.notes}` : ''].filter(Boolean).join('\n'), tables: u.tables || [] }));
  if (ex.sheets) return ex.sheets.map((u) => ({ unit: 'sheet', index: u.index, title: u.title, text: u.text, tables: [], cells: u.cells || [] }));
  if (ex.pages) return ex.pages.map((u) => ({ unit: ex.kind === 'pdf' ? 'page' : ex.kind === 'docx' ? 'section' : 'text', index: u.index, title: u.title, text: u.text, tables: u.tables || [] }));
  return [];
}

function sheetOf(ex, loc) {
  const sheets = ex.sheets || [];
  if (loc.sheet !== undefined && loc.sheet !== null) return sheets.find((s) => s.title === loc.sheet) || sheets.find((s) => String(s.index) === String(loc.sheet)) || null;
  return loc.index ? sheets.find((s) => s.index === Number(loc.index)) || null : null;
}

function inRange(cell, range) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(range).toUpperCase());
  if (!m) return null;
  const [c1, r1, c2, r2] = [colIndex(m[1]), Number(m[2]), colIndex(m[3]), Number(m[4])];
  const c = colIndex(cell.col);
  return c >= Math.min(c1, c2) && c <= Math.max(c1, c2) && cell.row >= Math.min(r1, r2) && cell.row <= Math.max(r1, r2);
}

/** The text a locator designates, or null when the locator does not exist in this extraction. */
function textFor(ex, loc) {
  if (!loc || !loc.kind) return null;
  const units = unitsOf(ex);
  const unit = (i) => units.find((u) => u.index === Number(i)) || null;
  switch (loc.kind) {
    case 'slide': case 'page': { const u = unit(loc.index); return u ? u.text : null; }
    case 'paragraph': { const u = unit(loc.index); if (!u) return null; const lines = u.text.split('\n'); return lines[Number(loc.paragraph) - 1] === undefined ? null : lines[Number(loc.paragraph) - 1]; }
    case 'table_cell': { const u = unit(loc.index); const t = u && u.tables[Number(loc.table) - 1]; const row = t && t.rows[Number(loc.row) - 1]; return row && row[Number(loc.col) - 1] !== undefined ? String(row[Number(loc.col) - 1]) : null; }
    case 'sheet_cell': { const s = sheetOf(ex, loc); if (!s) return null; const c = s.cells.find((x) => x.ref === String(loc.cell).toUpperCase()); return c ? String(c.value) : null; }
    case 'sheet_range': { const s = sheetOf(ex, loc); if (!s) return null; const cells = s.cells.filter((c) => inRange(c, loc.range)); return cells.length ? cells.map((c) => c.value).join(' ') : null; }
    case 'text_offset': { const t = ex.plain_text || ''; const o = Number(loc.offset); const n = Number(loc.length); return Number.isInteger(o) && Number.isInteger(n) && o >= 0 && n > 0 && o + n <= t.length ? t.slice(o, o + n) : null; }
    default: return null;
  }
}

/** Does `quote` occur (whitespace-normalised, exact otherwise) at the locator? */
function verifyQuote(ex, loc, quote) {
  const q = norm(quote);
  if (!q) return { ok: false, reason: 'the quote is empty' };
  if (q.length > 500) return { ok: false, reason: 'the quote is longer than 500 characters' };
  const t = textFor(ex, loc);
  if (t === null) return { ok: false, reason: `the locator ${JSON.stringify(loc)} does not exist in the extracted text` };
  if (!norm(t).includes(q)) return { ok: false, reason: `the quote does not occur at ${labelOf(loc)}` };
  return { ok: true };
}

function labelOf(loc) {
  if (!loc) return '';
  switch (loc.kind) {
    case 'slide': return `slide ${loc.index}`;
    case 'page': return `page ${loc.index}`;
    case 'paragraph': return `line ${loc.paragraph} of unit ${loc.index}`;
    case 'table_cell': return `unit ${loc.index}, table ${loc.table}, row ${loc.row}, column ${loc.col}`;
    case 'sheet_cell': return `${loc.sheet}!${loc.cell}`;
    case 'sheet_range': return `${loc.sheet}!${loc.range}`;
    case 'text_offset': return `characters ${loc.offset} to ${Number(loc.offset) + Number(loc.length)}`;
    default: return loc.kind;
  }
}
/** Human label using the attachment kind ("slide 3, line 2"). */
function describe(ex, loc) {
  const unit = ex && ex.kind === 'pptx' ? 'slide' : ex && ex.kind === 'pdf' ? 'page' : 'section';
  if (!loc) return '';
  if (loc.kind === 'paragraph') return `${unit} ${loc.index}, line ${loc.paragraph}`;
  if (loc.kind === 'table_cell') return `${unit} ${loc.index}, table ${loc.table}, row ${loc.row}, column ${loc.col}`;
  return labelOf(loc);
}

/** Add `blocks` (paragraph lines with locators) to every unit and `cells` with locators to every table. Mutates and returns ex. */
function addLocators(ex) {
  for (const u of unitsOf(ex)) {
    const src = (ex.slides || ex.pages || ex.sheets).find((x) => x.index === u.index);
    if (!src || u.unit === 'sheet') continue;
    src.blocks = u.text.split('\n').map((text, i) => ({ locator: { kind: 'paragraph', index: u.index, paragraph: i + 1 }, text })).filter((b) => b.text.trim());
    src.locator = { kind: u.unit === 'slide' ? 'slide' : 'page', index: u.index };
    (src.tables || []).forEach((t, ti) => { t.locator_table = ti + 1; t.cells = []; t.rows.forEach((r, ri) => r.forEach((v, ci) => t.cells.push({ locator: { kind: 'table_cell', index: u.index, table: ti + 1, row: ri + 1, col: ci + 1 }, text: String(v) }))); });
  }
  for (const s of ex.sheets || []) { s.locator = { kind: 'sheet_range', sheet: s.title, range: s.cells.length ? `A1:${colLetters(Math.max(0, ...s.cells.map((c) => colIndex(c.col))))}${Math.max(1, ...s.cells.map((c) => c.row))}` : 'A1:A1' }; for (const c of s.cells) c.locator = { kind: 'sheet_cell', sheet: s.title, cell: c.ref }; }
  return ex;
}

/** Flat list of every addressable element: [{locator, text}] (units, lines, table cells, sheet cells). */
function elements(ex) {
  const out = [];
  for (const s of ex.slides || []) { out.push({ locator: { kind: 'slide', index: s.index }, text: s.text }); for (const b of s.blocks || []) out.push(b); for (const t of s.tables || []) for (const c of t.cells || []) out.push(c); }
  for (const p of ex.pages || []) { out.push({ locator: { kind: 'page', index: p.index }, text: p.text }); for (const b of p.blocks || []) out.push(b); for (const t of p.tables || []) for (const c of t.cells || []) out.push(c); }
  for (const s of ex.sheets || []) for (const c of s.cells || []) out.push({ locator: c.locator || { kind: 'sheet_cell', sheet: s.title, cell: c.ref }, text: String(c.value) });
  return out;
}

/** Flatten a locator into Pointer item fields and back. */
function toFields(loc) {
  const f = { locator_kind: loc.kind };
  const map = { index: 'locator_index', sheet: 'locator_sheet', cell: 'locator_cell', range: 'locator_range', paragraph: 'locator_paragraph', table: 'locator_table', row: 'locator_row', col: 'locator_col', offset: 'locator_offset', length: 'locator_length' };
  for (const [k, field] of Object.entries(map)) if (loc[k] !== undefined && loc[k] !== null && loc[k] !== '') f[field] = ['sheet', 'cell', 'range'].includes(k) ? String(loc[k]) : Number(loc[k]);
  return f;
}
function fromItem(p) {
  const loc = { kind: p.locator_kind };
  const map = { locator_index: 'index', locator_sheet: 'sheet', locator_cell: 'cell', locator_range: 'range', locator_paragraph: 'paragraph', locator_table: 'table', locator_row: 'row', locator_col: 'col', locator_offset: 'offset', locator_length: 'length' };
  for (const [field, k] of Object.entries(map)) if (p[field] !== undefined) loc[k] = p[field];
  return loc;
}

export { textFor, verifyQuote, labelOf, describe, addLocators, elements, toFields, fromItem, unitsOf, norm };
