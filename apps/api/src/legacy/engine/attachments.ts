/**
 * engine/attachments.ts - file uploads attached to any item, text extraction, and the suggest / accept flow.
 *
 * Files live under <product dir>/uploads/ (or in memory when the portfolio has no disk root, as in tests). Each upload is an
 * Attachment item (prefix ATT, origin "document") linked to its target by "attached_to". Deleting is soft: the item becomes
 * "Deleted", the file stays on disk, and the audit log records who did it. suggest never writes; accept creates
 * unverified items with provenance (attachment id, location, snippet).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { extract, explain, mimeFor, extOf, BLOCKED_EXT } from './extract';
import { suggest } from './suggest';
import * as schema from './schema';
import * as locatorsMod from './locators';
import * as unitsMod from './units';
import * as pointersMod from './pointers';
import * as extract_officeMod from './extract_office';
import { extractPlain } from './extract_text';
import { addLocators } from './locators';
import { ZipReader } from './zip';

const MAX_BYTES = 25 * 1024 * 1024;
const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});

/** Keep a safe, readable file name: no path parts, no control characters, bounded length. */
function safeName(raw) {
  let n = String(raw || '').replace(/\\/g, '/').split('/').pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().replace(/^\.+/, '');
  if (n.length > 150) { const e = path.extname(n); n = n.slice(0, 150 - e.length) + e; }
  return n;
}

function looksExecutable(buf) {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return 'Windows executable (MZ header)';
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return 'ELF executable';
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0xcafebabe) return 'Java class or Mach-O binary';
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return 'script with a #! line';
  return null;
}

const brief = (a) => ({
  phase: typeof a.phase === 'number' ? a.phase : null, id: a.id, filename: a.filename, mime: a.mime, size_bytes: a.size_bytes, sha256: a.sha256, uploaded_by: a.uploaded_by, uploaded_on: a.uploaded_on, status: a.status,
  extracted_text_status: a.extracted_text_status, extracted_chars: a.extracted_chars, pages: a.pages || 0, note: a.note || null, warnings: a.extract_warnings ? String(a.extract_warnings).split('\n') : [],
  // why the text could not be read, in plain words, with what to do about it (null when it was read)
  reason: explain({ status: a.extracted_text_status, warnings: a.extract_warnings || '', filename: a.filename, chars: a.extracted_chars }),
  // text typed or pasted by a person because the file itself could not be read (null when there is none)
  pasted: a.pasted_by ? { by: a.pasted_by, on: a.pasted_on || null, chars: a.pasted_chars || 0, times: a.pasted_times || 1 } : null,
});

/** Where files go. ctx = { dir: string|null }; null means in memory (kept on the store object). */
function fileOps(store, dir) {
  const mem = () => (store._files = store._files || new Map());
  return {
    write(rel, buf) { if (!dir) { mem().set(rel, buf); return; } const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, f); },
    read(rel) { if (!dir) { const b = mem().get(rel); if (!b) throw httpErr(410, 'the stored file is missing'); return b; } const f = path.join(dir, rel); if (!f.startsWith(dir)) throw httpErr(400, 'bad path'); if (!fs.existsSync(f)) throw httpErr(410, 'the stored file is missing on disk'); return fs.readFileSync(f); },
    exists(rel) { return dir ? fs.existsSync(path.join(dir, rel)) : mem().has(rel); },
  };
}

/** Upload. opts: { target, name, mime, body (Buffer), actor, dir } */
function add(store, opts) {
  // a file can be for a whole phase: with no target it is attached to the product record and remembers the phase
  const target = opts.target || (opts.phase !== undefined && opts.phase !== '' ? (store.product() || {}).id : null);
  const phase = opts.phase === undefined || opts.phase === '' ? null : Number(opts.phase);
  if (phase !== null && !(Number.isInteger(phase) && phase >= 0 && phase <= 12)) throw httpErr(422, 'phase must be a whole number from 0 to 12');
  if (!target) throw httpErr(422, 'target (the item id the file is attached to) or a phase is required');
  if (!store.get(target)) throw httpErr(404, `target item ${target} not found`);
  const name = safeName(opts.name);
  if (!name) throw httpErr(422, 'name (the file name) is required');
  const ext = extOf(name);
  if (BLOCKED_EXT.has(ext)) throw httpErr(415, `files of type "${ext}" are refused: executables and scripts cannot be uploaded`);
  const buf = opts.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw httpErr(422, 'the file is empty');
  if (buf.length > MAX_BYTES) throw httpErr(413, `file is larger than ${MAX_BYTES / 1048576} MB`);
  const exe = looksExecutable(buf);
  if (exe) throw httpErr(415, `the file content looks like a ${exe}; executables are refused whatever the extension`);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const dup = store.list('Attachment', (a) => a.status === 'Active' && a.sha256 === sha && store.out(a.id, 'attached_to').some((l) => l.target === target))[0];
  if (dup) throw httpErr(409, `the same file is already attached to ${target} as ${dup.id}`);
  const ex = extract(buf, { filename: name });
  const att = store.create('Attachment', {
    title: name, filename: name, mime: mimeFor(name, opts.mime), size_bytes: buf.length, sha256: sha, uploaded_by: opts.actor, uploaded_on: store.today(),
    ...(phase !== null ? { phase } : {}), extracted_text_status: ex.status, extracted_chars: ex.chars, pages: (ex.slides || ex.pages || ex.sheets || []).length, ...(ex.warnings.length ? { extract_warnings: ex.warnings.join('\n') } : {}), status: 'Active',
  }, { actor: opts.actor, origin: 'document' });
  const rel = `uploads/${att.id}_${name}`;
  const io = fileOps(store, opts.dir);
  io.write(rel.replace(/^uploads\//, ''), buf);
  io.write(`${att.id}.extracted.json`, Buffer.from(JSON.stringify(ex)));
  store.update(att.id, { stored_path: rel }, { actor: opts.actor, silent: true });
  store.link('attached_to', att.id, target, {}, { actor: opts.actor, silent: true });
  store.audit('attachment.upload', att.id, `${opts.actor} uploaded "${name}" (${buf.length} bytes) to ${target}; text extraction ${ex.status}`, { actor: opts.actor, target });
  return { attachment: brief(store.get(att.id)), target, extraction: { status: ex.status, kind: ex.kind, chars: ex.chars, warnings: ex.warnings } };
}

function get(store, id) {
  const a = store.get(id);
  if (!a || a.type !== 'Attachment') throw httpErr(404, `attachment ${id} not found`);
  return a;
}

function list(store, target) {
  let items = store.list('Attachment', (a) => a.status === 'Active');
  if (target) { if (!store.get(target)) throw httpErr(404, `item ${target} not found`); items = items.filter((a) => store.out(a.id, 'attached_to').some((l) => l.target === target)); }
  return { target: target || null, total: items.length, attachments: items.map((a) => ({ ...brief(a), targets: store.out(a.id, 'attached_to').map((l) => l.target) })) };
}

function download(store, id, dir) {
  const a = get(store, id);
  if (a.status === 'Deleted') throw httpErr(410, `${id} was deleted`);
  const io = fileOps(store, dir);
  return { buffer: io.read(a.stored_path.replace(/^uploads\//, '')), filename: a.filename, mime: a.mime };
}

/** Structured extraction (cached beside the file; recomputed if the cache is missing). */
function text(store, id, dir) {
  const a = get(store, id);
  if (a.status === 'Deleted') throw httpErr(410, `${id} was deleted`);
  const io = fileOps(store, dir);
  let ex;
  if (io.exists(`${id}.extracted.json`)) ex = JSON.parse(io.read(`${id}.extracted.json`).toString('utf8'));
  else { ex = extract(io.read(a.stored_path.replace(/^uploads\//, '')), { filename: a.filename }); io.write(`${id}.extracted.json`, Buffer.from(JSON.stringify(ex))); }
  if (ex.reason === undefined) ex.reason = explain({ status: ex.status, kind: ex.kind, warnings: ex.warnings, filename: a.filename, chars: ex.chars });
  if (io.exists(`${id}.pasted.json`)) ex = withPasted(ex, JSON.parse(io.read(`${id}.pasted.json`).toString('utf8')));
  return { attachment: brief(a), extraction: ex };
}

/**
 * The extraction a person's pasted text produces. It replaces what the file gave (the file itself stays as it was) and is clearly marked:
 * ex.pasted = { by, at, chars, ... } and ex.original = what the file itself gave. It is plain text, one page, so locators, quotes,
 * pointers and the assistant treat it exactly like read text.
 */
const MAX_PASTED = 400000;
function withPasted(orig, p) {
  
  
  const r: any = extractPlain(Buffer.from(p.text, 'utf8'), 'txt');
  r.warnings = [`This text was pasted by ${p.by}, not read from the file.`];
  r.plain_text = r.pages.map((x) => x.text).join('\n\n');
  r.chars = r.plain_text.length;
  addLocators(r);
  r.reason = null;
  r.pasted = { by: p.by, at: p.at, chars: r.chars, times: (p.history || []).length + 1, label: `Pasted by ${p.by}, not read from the file` };
  r.original = { status: orig.status, kind: orig.kind, chars: orig.chars || 0, warnings: orig.warnings || [], reason: orig.reason || null };
  return r;
}

/** Store text a person pasted because the file could not be read (or was read wrongly). Pasting again replaces the earlier text. body: { text } */
function pasteText(store, id, body, actor, dir) {
  const a = get(store, id);
  if (a.status === 'Deleted') throw httpErr(410, `${id} was deleted`);
  const raw = body && body.text;
  if (typeof raw !== 'string') throw httpErr(422, 'text is required: paste the words of the file into the box');
  const pasted = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!pasted) throw httpErr(422, 'There is no text to save. Paste the words of the file into the box first.');
  if (pasted.length > MAX_PASTED) throw httpErr(413, `The pasted text is too long (${pasted.length.toLocaleString('en-IN')} characters). The limit is ${MAX_PASTED.toLocaleString('en-IN')}. Paste the important part only.`);
  const io = fileOps(store, dir);
  let history = [];
  if (io.exists(`${id}.pasted.json`)) { const prev = JSON.parse(io.read(`${id}.pasted.json`).toString('utf8')); history = (prev.history || []).concat([{ by: prev.by, at: prev.at, chars: prev.text.length }]); }
  io.write(`${id}.pasted.json`, Buffer.from(JSON.stringify({ text: pasted, by: actor, at: store.now(), history })));
  store.update(id, { pasted_by: actor, pasted_on: store.today(), pasted_chars: pasted.length, pasted_times: history.length + 1 }, { actor, silent: true });
  const last = history[history.length - 1];
  store.audit('attachment.paste', id, `${actor} pasted ${pasted.length} characters of text for "${a.filename}" because the file itself gave no usable text${last ? `; this replaced the text ${last.by} pasted earlier (${last.chars} characters)` : ''}`, { actor, replaced: last || null });
  // proposals already waiting whose quote is no longer in the new text
  const t = text(store, id, dir);
  const verify = locatorsMod.verifyQuote;
  const stale = (store.data.inbox || []).filter((p) => p.attachment === id && p.status === 'proposed' && !verify(t.extraction, p.pointer.locator, p.pointer.quote).ok).length;
  return { attachment: t.attachment, extraction: { status: t.extraction.status, kind: t.extraction.kind, chars: t.extraction.chars, pasted: t.extraction.pasted }, replaced: last || null, stale_proposals: stale };
}

function remove(store, id, actor) {
  const a = get(store, id);
  if (a.status === 'Deleted') throw httpErr(409, `${id} is already deleted`);
  store.update(id, { status: 'Deleted' }, { actor, silent: true });
  store.audit('attachment.delete', id, `${actor} deleted attachment ${id} "${a.filename}" (soft delete: the file is kept)`, { actor });
  return { id, status: 'Deleted', filename: a.filename };
}

function suggestFor(store, id, dir) {
  const { attachment, extraction } = text(store, id, dir);
  const s = suggest(extraction);
  const target = store.out(id, 'attached_to').map((l) => l.target)[0] || null;
  const t = target ? store.get(target) : null;
  return {
    attachment, extraction_status: extraction.status, target, default_competitor_id: t && t.type === 'Competitor' ? t.id : null, candidates: s.candidates, warnings: [...(extraction.warnings || []), ...s.warnings],
    note: 'These are drafts. Nothing has been created. POST /api/attachments/:id/accept with the candidates you choose (and a competitor_id) to create unverified items.',
  };
}

/**
 * Create items from chosen candidates. body: { competitor_id?, own_product?, overwrite?, candidates:[{ id?, kind, fields, location, snippet, confidence, competitor_id?, overrides? }] }
 * price_point -> PricePoint (Draft, origin document, verification unverified, provenance) linked to the competitor and the attachment;
 * competitor_field -> updates the competitor's fields (existing values kept unless overwrite) and adds a CompetitorNote that records the source.
 * All-or-nothing.
 */
function accept(store, id, body, actor) {
  const att = get(store, id);
  if (att.status === 'Deleted') throw httpErr(410, `${id} was deleted`);
  const cands = Array.isArray(body.candidates) ? body.candidates : [];
  if (!cands.length) throw httpErr(422, 'candidates is required: send the candidates you chose from /suggest');
  const target = store.out(id, 'attached_to').map((l) => l.target)[0];
  const tItem = target && store.get(target);
  const snap = JSON.stringify(store.data);
  const created = []; const updated = []; const skipped = []; const errors = [];
  try {
    cands.forEach((c, i) => {
      const label = c.id || `candidate ${i + 1}`;
      const compId = c.competitor_id || body.competitor_id || (tItem && tItem.type === 'Competitor' ? tItem.id : null);
      const comp = compId ? store.get(compId) : null;
      if (compId && (!comp || comp.type !== 'Competitor')) { errors.push(`${label}: ${compId} is not a competitor`); return; }
      const prov = { source: 'attachment', attachment_id: id, filename: att.filename, location: (c.location && (c.location.label || c.location)) || null, snippet: String(c.snippet || '').slice(0, 400), confidence: c.confidence === undefined ? null : c.confidence, suggested_by: 'engine/suggest', accepted_by: actor, accepted_on: store.today() };
      if (c.kind === 'price_point') {
        if (!comp && !body.own_product) { errors.push(`${label}: which competitor is this price for? send competitor_id, or own_product: true for our own price`); return; }
        const f = { ...(c.fields || {}), ...(c.overrides || {}) };
        const fields = { title: `${comp ? comp.title : 'Own'} ${f.plan || 'price'}`.slice(0, 120), ...f, captured_on: f.captured_on || unitsMod.sourceDate(att, c.snippet || c.quote, store.today()), status: 'Draft', provenance: prov, verification: 'unverified' };
        try {
          const p = store.create('PricePoint', fields, { actor, origin: 'document' });
          if (comp) store.link('contains', comp.id, p.id, {}, { actor, silent: true });
          store.link('attached_to', id, p.id, {}, { actor, silent: true });
          if (tItem && tItem.type === 'Evidence') store.link('supported_by', p.id, tItem.id, { role: 'supports', locator: prov.location || undefined }, { actor, silent: true });
          created.push(p.id);
        } catch (e) { errors.push(`${label}: ${e.errors ? e.errors.join('; ') : e.message}`); }
      } else if (c.kind === 'competitor_field') {
        if (!comp) { errors.push(`${label}: a competitor_id is required to apply a profile field`); return; }
        const f = { ...(c.fields || {}), ...(c.overrides || {}) };
        const known = new Set(schema.fieldsFor('Competitor').map((x) => x.name));
        const patch = {}; const notes = [];
        for (const [k, v] of Object.entries(f)) {
          if (!known.has(k)) { errors.push(`${label}: Competitor has no field "${k}"`); continue; }
          if (comp[k] !== undefined && comp[k] !== '' && JSON.stringify(comp[k]) !== JSON.stringify(v) && !body.overwrite) { skipped.push({ candidate: label, field: k, reason: `already set to ${JSON.stringify(comp[k])}; send overwrite: true to replace it` }); continue; }
          patch[k] = v; notes.push(`${k} = ${Array.isArray(v) ? v.join(', ') : v}`);
        }
        if (Object.keys(patch).length) {
          try {
            store.update(comp.id, patch, { actor });
            const n = store.create('CompetitorNote', { title: `Profile from ${att.filename}`.slice(0, 100), date: store.today(), text: `Set from ${att.filename} (${prov.location || 'location unknown'}): ${notes.join('; ')}. Source text: "${prov.snippet}"`, source: att.filename, author: actor, importance: 'low', provenance: prov, verification: 'unverified' }, { actor, origin: 'document' });
            store.link('note_on', n.id, comp.id, {}, { actor, silent: true });
            store.link('attached_to', id, n.id, {}, { actor, silent: true });
            updated.push(comp.id); created.push(n.id);
          } catch (e) { errors.push(`${label}: ${e.errors ? e.errors.join('; ') : e.message}`); }
        }
      } else errors.push(`${label}: unknown kind "${c.kind}"`);
    });
    if (errors.length) throw httpErr(422, `nothing was created: ${errors.join(' | ')}`, { errors });
  } catch (e) {
    store.replaceData(JSON.parse(snap));
    throw e;
  }
  store.audit('attachment.accept', id, `${actor} accepted ${cands.length} suggestion(s) from ${att.filename}: ${created.length} item(s) created, ${[...new Set(updated)].length} competitor(s) updated (all unverified)`, { actor, created });
  const brief1 = (x) => { const i = store.get(x); return { id: x, type: i.type, title: i.title, status: i.status, origin: i.origin, verification: i.verification || null }; };
  return { created: created.map(brief1), updated: [...new Set(updated)], skipped };
}

// ------------------------------------------------------------------ viewer support
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'text/plain' };
const mediaUrl = (id, p) => `/api/attachments/${id}/media?path=${encodeURIComponent(p)}`;

/** Stream-ready original: { buffer, type, filename }. Types that a browser could execute are served as plain text with a sandbox CSP. */
function raw(store, id, dir) {
  const d = download(store, id, dir);
  const ext = extOf(d.filename);
  const safe = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.tsv': 'text/plain; charset=utf-8', '.json': 'text/plain; charset=utf-8', '.html': 'text/plain; charset=utf-8', '.htm': 'text/plain; charset=utf-8', '.svg': 'text/plain; charset=utf-8' };
  return { buffer: d.buffer, type: safe[ext] || (d.mime && /^(application\/vnd\.openxmlformats|application\/zip)/.test(d.mime) ? d.mime : 'application/octet-stream'), filename: d.filename };
}

/** One image embedded in an Office file (the viewer fetches the images listed in /view). */
function media(store, id, dir, p) {
  const { buffer, filename } = download(store, id, dir);
  if (!/^(ppt|word|xl)\/media\/[^/]+\.(png|jpe?g|gif|webp|bmp)$/i.test(String(p || ''))) throw httpErr(422, 'path must be an image under ppt/media, word/media or xl/media (see the images list of /view)');
  
  let z;
  try { z = new ZipReader(buffer); } catch (e) { throw httpErr(422, `${filename} is not an Office file`); }
  if (!z.has(p)) throw httpErr(404, `no image ${p} in ${filename}`);
  return { buffer: z.read(p), type: IMAGE_MIME[extOf(p)] || 'application/octet-stream', filename: p.split('/').pop() };
}

function gridFrom(columns, rows, rowNumbers, q, locatorOf) {
  const offset = Math.max(0, Number(q.offset) || 0);
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
  const maxCols = Math.min(columns.length, 50);
  const slice = rows.slice(offset, offset + limit);
  return {
    columns: columns.slice(0, maxCols), total_rows: rows.length, total_columns: columns.length, offset, limit, has_more: offset + limit < rows.length, columns_truncated: columns.length > maxCols,
    rows: slice.map((r, i) => ({ row: rowNumbers[offset + i], cells: r.slice(0, maxCols).map((v, c) => ({ ref: `${columns[c]}${rowNumbers[offset + i]}`, value: v, ...(locatorOf ? { locator: locatorOf(offset + i, c, rowNumbers[offset + i], columns[c]) } : {}) })) })),
  };
}

/** GET /api/attachments/:id/view. query: sheet, offset, limit (grids). */
function view(store, id, dir, q: any = {}) {
  const { attachment, extraction: ex } = text(store, id, dir);
  const pointers = pointersMod.list(store, { attachment: id }).pointers;
  const base = { attachment, kind: ex.kind, extraction_status: ex.status, warnings: ex.warnings || [], pointers, pasted: ex.pasted || null, original: ex.original || null, raw_url: `/api/attachments/${id}/raw`, download_url: `/api/attachments/${id}/download` };
  const ext = extOf(attachment.filename);
  if (ex.pasted) {
    // the person's pasted text stands in for what the file could not give; the original is still offered (a scanned PDF as a PDF, a picture as a picture)
    const pages = ex.pages.map((p) => ({ index: p.index, title: p.title, locator: p.locator, blocks: p.blocks || [], text: p.text }));
    if (ex.original && ex.original.kind === 'pdf') return { ...base, viewer: 'pdf', text_status: 'ok', pages };
    return { ...base, viewer: 'text', pages, ...(IMAGE_MIME[ext] && ext !== '.svg' ? { image: true } : {}) };
  }
  if (IMAGE_MIME[ext] && ext !== '.svg') return { ...base, viewer: 'image' };
  if (ex.slides) return { ...base, viewer: 'slides', slides: ex.slides.map((s) => ({ index: s.index, locator: s.locator, title: s.title, blocks: s.blocks || [], tables: (s.tables || []).map((t) => ({ table: t.locator_table, rows: t.rows, cells: t.cells })), notes: s.notes || '', images: (s.images || []).map((p) => ({ path: p, url: mediaUrl(id, p) })) })) };
  if (ex.kind === 'docx') {
    return { ...base, viewer: 'document', sections: ex.pages.map((s) => {
      let line = 0; let t = 0;
      return { index: s.index, title: s.title, locator: s.locator, elements: s.elements.map((e) => {
        if (e.t === 'p') { line++; return { type: e.heading ? 'heading' : 'paragraph', style: e.style, text: e.text, locator: { kind: 'paragraph', index: s.index, paragraph: line } }; }
        t++; const first = line + 1; line += e.rows.length;
        return { type: 'table', table: t, first_line: first, rows: e.rows, cells: e.rows.flatMap((r, ri) => r.map((v, ci) => ({ locator: { kind: 'table_cell', index: s.index, table: t, row: ri + 1, col: ci + 1 }, text: v }))) };
      }) };
    }) };
  }
  if (ex.sheets) {
    const sheet = ex.sheets.find((s) => s.title === q.sheet) || ex.sheets.find((s) => String(s.index) === String(q.sheet)) || ex.sheets[0];
    const t = sheet && sheet.tables[0];
    return { ...base, viewer: 'grid', sheets: ex.sheets.map((s) => ({ index: s.index, title: s.title, cells: s.cells.length })), sheet: sheet ? sheet.title : null,
      grid: t ? gridFrom(t.columns, t.rows, t.row_numbers, q, (ri, ci, rowNo, col) => ({ kind: 'sheet_cell', sheet: sheet.title, cell: `${col}${rowNo}` })) : null };
  }
  if (ex.kind === 'csv' || ex.kind === 'tsv') {
    const t = ex.pages[0].tables[0]; const w = Math.max(1, ...t.rows.map((r) => r.length));
    const cols = Array.from({ length: w }, (_, i) => extract_officeMod.colLetters(i));
    return { ...base, viewer: 'grid', sheets: [{ index: 1, title: 'Table', cells: t.rows.flat().length }], sheet: 'Table', grid: gridFrom(cols, t.rows.map((r) => Array.from({ length: w }, (_, i) => r[i] === undefined ? '' : r[i])), t.rows.map((_, i) => i + 1), q, (ri, ci) => ({ kind: 'table_cell', index: 1, table: 1, row: ri + 1, col: ci + 1 })) };
  }
  if (ex.kind === 'pdf') return { ...base, viewer: 'pdf', text_status: ex.status, pages: (ex.pages || []).map((p) => ({ index: p.index, locator: p.locator, text: p.text, blocks: p.blocks || [] })) };
  if (ex.pages) return { ...base, viewer: 'text', pages: ex.pages.map((p) => ({ index: p.index, title: p.title, locator: p.locator, blocks: p.blocks || [], text: p.text })) };
  return { ...base, viewer: 'none', note: 'No viewer for this file type; download the original.' };
}

export { add, list, get, download, text, remove, pasteText, suggestFor, accept, brief, safeName, MAX_BYTES, raw, media, view };
