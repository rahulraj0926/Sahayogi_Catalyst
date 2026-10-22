/**
 * engine/compose_render.ts - safe Markdown and HTML renderers for composed documents.
 *
 * Safety: every piece of text is HTML-escaped BEFORE item tokens ([[PRD-001]]) are turned into links, so a field value
 * such as "<script>alert(1)</script>" is shown as text, never executed. SVG diagrams are built by compose_kit with
 * escaped labels. Item tokens only match the strict id pattern, and the generated href is "#/item/<id>".
 *
 * Reading text never shows record codes: in a sentence or a list an item token becomes the item's NAME (or disappears when the
 * name is already written next to it). Only the "ID" column of a table keeps the code, as small secondary text, because that is
 * where a person may need to refer to a record. Where a record came from is written in plain words, not as an engine label.
 */
import * as plain from './plain';
import * as unitsMod from './units';
const ID_RE = /\[\[([A-Z]{2,4}-\d{1,5})\]\]/g;

const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Provenance label for an item: invented, human, document, agent unverified/verified, derived. */
function provenance(item) {
  if (!item) return null;
  if (item.origin === 'assistant') return item.verification === 'verified' ? 'assistant verified' : 'assistant proposed';
  if (item.origin === 'agent') return item.verification === 'verified' ? 'agent verified' : 'agent unverified';
  return item.origin || 'human';
}
const BADGE_CLASS = { invented: 'b-invented', human: 'b-human', document: 'b-document', 'agent unverified': 'b-agent-un', 'agent verified': 'b-agent-ok', 'assistant proposed': 'b-agent-un', 'assistant verified': 'b-agent-ok', derived: 'b-derived' };
/** The same label in plain words. */
const PROVENANCE_TEXT = { invented: 'example, not real evidence', human: 'entered by a person', document: 'read from a file', 'agent unverified': 'found by an assistant, not yet checked', 'agent verified': 'found by an assistant, checked', 'assistant proposed': 'suggested by the assistant, not yet checked', 'assistant verified': 'suggested by the assistant, checked', derived: 'worked out by the tool' };
const provenanceText = (pv) => PROVENANCE_TEXT[pv] || pv;

/** Map itemId -> [footnote numbers] from a document's citations (confirmed pointers behind items mentioned in the text). */
function citeMap(doc) {
  const m = new Map();
  for (const c of (doc && doc.citations) || []) for (const id of c.item_ids) { if (!m.has(id)) m.set(id, []); m.get(id).push(c.n); }
  return m;
}

/**
 * Turn the tokens of one text into output pieces. mode: 'html' | 'md'. asCode: the text sits in an ID column (keep the small code).
 * Returns the finished (escaped) string. Item names come from the store; an unknown id is shown as written.
 */
function renderText(text, store, cm, mode, asCode) {
  const src = unitsMod.datesInText(String(text === undefined || text === null ? '' : text)); // dates are shown in words (6 Oct 2026)
  const ops = []; // {start, end, html}
  let m;
  ID_RE.lastIndex = 0;
  const cites = (id) => { const ns = cm && cm.get(id); return ns ? ns.map((n) => (mode === 'html' ? `<sup class="cite"><a href="#fn-${n}" id="cite-${n}">[${n}]</a></sup>` : ` [^${n}]`)).join('') : ''; };
  while ((m = ID_RE.exec(src))) {
    const id = m[1]; const it = store && store.get(id); const start = m.index; const end = m.index + m[0].length;
    const pv = provenance(it);
    if (asCode) {
      const code = mode === 'html' ? `<a class="ref ref-code" href="#/item/${id}">${id}</a>${pv ? ` <span class="badge ${BADGE_CLASS[pv] || ''}" title="${esc(provenanceText(pv))}">${esc(provenanceText(pv))}</span>` : ''}` : `${id}${pv ? ` _(${provenanceText(pv)})_` : ''}`;
      ops.push({ start, end, html: code + cites(id) });
      continue;
    }
    const title = it ? String(it.title || id) : null;
    if (!title) { ops.push({ start, end, html: mode === 'html' ? esc(id) : id }); continue; }
    // the name is already written right after the token ("[[SEG-001]] State utilities ...")? then the code simply disappears
    const rest = src.slice(end); const lead = /^\s*/.exec(rest)[0].length;
    const bare = title.replace(/\.\.\.$/, '').trim();
    const probe = bare.slice(0, 24).toLowerCase();
    if (probe && rest.slice(lead).toLowerCase().startsWith(probe)) {
      ops.push({ start, end: end + lead, html: '' });
      const upTo = end + lead + Math.min(bare.length, rest.length - lead);
      const full = rest.slice(lead).toLowerCase().startsWith(bare.toLowerCase()) ? end + lead + bare.length : upTo;
      if (cites(id)) ops.push({ start: full, end: full, html: cites(id) });
    } else ops.push({ start, end, html: (mode === 'html' ? `<a href="#/item/${id}">${esc(title)}</a>` : title) + cites(id) });
  }
  ops.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = ''; let i = 0;
  const seg = (t) => (mode === 'html' ? esc(t) : t);
  for (const o of ops) { if (o.start < i) continue; out += seg(src.slice(i, o.start)) + o.html; i = Math.max(i, o.end); }
  out += seg(src.slice(i));
  return out;
}
const inlineHtml = (text, store, cm, asCode?) => renderText(text, store, cm, 'html', asCode);
const inlineMd = (text, store, cm, asCode?) => renderText(String(text === undefined || text === null ? '' : text).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|'), store, cm, 'md', asCode);
const mdText = (text, store, cm) => renderText(text, store, cm, 'md', false);
const headerLabel = (h) => (h === 'ID' ? 'Ref' : h);
const footMd = (doc) => (doc.citations || []).map((c) => `[^${c.n}]: ${c.filename}, ${c.label}. Quote: "${String(c.quote).replace(/\s+/g, ' ')}"`);
const footHtml = (doc, prefix) => ((doc.citations || []).length ? `<ol class="footnotes">${doc.citations.map((c) => `<li id="fn-${c.n}"><strong>${esc(c.filename)}</strong>, ${esc(c.label)} <a href="${esc(c.viewer_route)}">open in the viewer</a> <span class="note">"${esc(String(c.quote).slice(0, 160))}"</span> <a href="#cite-${c.n}">back</a></li>`).join('')}</ol>` : '');

/** Where to add a missing part, in plain words (no routes, no API calls). */
function targetText(t) {
  if (!t) return '';
  const bits = [];
  if (t.request) bits.push(`answer the question for it in "Work on it"${t.minutes ? ` (about ${t.minutes} minutes)` : ''}`);
  else if (t.ui) bits.push('open the matching screen and add it there');
  if (t.create && !t.request) bits.push(`or add a ${plain.word('', String(t.create.type).replace(/([a-z])([A-Z])/g, '$1 $2')).toLowerCase()} by hand`);
  return bits.join('; ');
}

// ------------------------------------------------------------------ Markdown
function toMarkdown(doc, store, opts: any = {}) {
  const L = []; const cm = citeMap(doc);
  const h = opts.level || 1;
  const H = (n, t) => `${'#'.repeat(Math.min(6, h + n - 1))} ${t}`;
  L.push(H(1, doc.title));
  L.push('');
  L.push(`_Stage ${doc.phase} | status: ${doc.status.replace('_', ' ')} | ${doc.completeness}% complete | ${doc.word_count} words | owner: ${plain.roleName(doc.owner_role)} | ${doc.missing_count ? `${doc.missing_count} ${doc.missing_count === 1 ? 'part' : 'parts'} missing` : 'nothing missing'}_`);
  L.push('');
  for (const s of doc.sections) {
    L.push(H(2, s.heading)); L.push('');
    for (const b of s.blocks) {
      if (b.t === 'p') L.push(mdText(b.text, store, cm), '');
      else if (b.t === 'note') L.push(`_${mdText(b.text, store, cm)}_`, '');
      else if (b.t === 'ul') { for (const i of b.items) L.push(`- ${mdText(i, store, cm)}`); L.push(''); }
      else if (b.t === 'table') {
        L.push(`| ${b.headers.map((x) => inlineMd(headerLabel(x), store, cm)).join(' | ')} |`, `| ${b.headers.map(() => '---').join(' | ')} |`);
        for (const r of b.rows) L.push(`| ${r.map((c, j) => inlineMd(c, store, cm, b.headers[j] === 'ID')).join(' | ')} |`);
        L.push('');
      } else if (b.t === 'diagram') L.push(`**${b.title}** (diagram text)`, '', '```mermaid', b.mermaid, '```', '');
    }
  }
  if ((doc.citations || []).length) { L.push(H(2, 'Sources'), ''); for (const f of footMd(doc)) L.push(f, ''); }
  if (doc.missing.length) {
    L.push(H(2, 'Missing'), '', 'The following is absent from the data. Nothing has been invented to fill the gap.', '');
    for (const m of doc.missing) L.push(`- **${m.label}**${m.why ? ` (${m.why})` : ''}. To add it: ${targetText(m.target) || 'see the Work screen'}.`);
    L.push('');
  }
  return L.join('\n');
}

// ------------------------------------------------------------------ HTML
const CSS = `body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#1a202c;line-height:1.5}
h1{border-bottom:2px solid #2b6cb0;padding-bottom:.3rem}h2{margin-top:1.8rem;color:#2c5282}.meta{color:#4a5568;font-size:.9rem}
table{border-collapse:collapse;width:100%;margin:.6rem 0;font-size:.88rem}th,td{border:1px solid #cbd5e0;padding:.3rem .5rem;text-align:left;vertical-align:top}th{background:#edf2f7}
.badge{font-size:.68rem;padding:0 .35rem;border-radius:.6rem;border:1px solid #a0aec0;color:#4a5568;white-space:nowrap}.b-invented{background:#fefcbf}.b-human{background:#c6f6d5}.b-document{background:#bee3f8}.b-agent-un{background:#fed7d7}.b-agent-ok{background:#c6f6d5}.b-derived{background:#e9d8fd}
a.ref-code{font-family:Consolas,monospace;font-size:.75rem;color:#718096;text-decoration:none}
.missing{border:2px dashed #c53030;background:#fff5f5;padding:.6rem 1rem;margin:1.4rem 0}.missing h2{margin-top:0;color:#c53030}.note{color:#4a5568;font-style:italic}
pre.mermaid{background:#f7fafc;border:1px solid #e2e8f0;padding:.5rem;overflow:auto;font-size:.75rem}.diagram{overflow:auto;margin:.8rem 0}details summary{cursor:pointer;color:#2b6cb0}
.toc a{text-decoration:none}sup.cite{font-size:.7em}ol.footnotes{font-size:.85rem}@media print{body{margin:0}.diagram{break-inside:avoid}}`;

function sectionHtml(doc, store, idPrefix = '') {
  const out = []; const cm = citeMap(doc);
  for (const s of doc.sections) {
    out.push(`<section id="${esc(idPrefix + slug(s.id))}"><h2>${esc(s.heading)}</h2>`);
    for (const b of s.blocks) {
      if (b.t === 'p') out.push(`<p>${inlineHtml(b.text, store, cm)}</p>`);
      else if (b.t === 'note') out.push(`<p class="note">${inlineHtml(b.text, store, cm)}</p>`);
      else if (b.t === 'ul') out.push(`<ul>${b.items.map((i) => `<li>${inlineHtml(i, store, cm)}</li>`).join('')}</ul>`);
      else if (b.t === 'table') out.push(`<table><thead><tr>${b.headers.map((x) => `<th>${esc(headerLabel(x))}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, j) => `<td>${inlineHtml(c, store, cm, b.headers[j] === 'ID')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      else if (b.t === 'diagram') out.push(`<figure><figcaption><strong>${esc(b.title)}</strong></figcaption><div class="diagram">${b.svg || ''}</div><details><summary>Diagram text</summary><pre class="mermaid">${esc(b.mermaid)}</pre></details></figure>`);
    }
    out.push('</section>');
  }
  if ((doc.citations || []).length) out.push(`<section class="sources"><h2>Sources</h2>${footHtml(doc, idPrefix)}</section>`);
  if (doc.missing.length) {
    out.push(`<aside class="missing" id="${esc(idPrefix)}missing"><h2>Missing</h2><p>The following is absent from the data. Nothing has been invented to fill the gap.</p><ul>`);
    for (const m of doc.missing) out.push(`<li><strong>${esc(m.label)}</strong>${m.why ? ` <span class="note">(${esc(m.why)})</span>` : ''}<br><small>To add it: ${esc(targetText(m.target) || 'see the Work screen')}${m.target && m.target.ui ? ` <a href="${esc(m.target.ui)}">open</a>` : ''}</small></li>`);
    out.push('</ul></aside>');
  }
  return out.join('\n');
}
const docMeta = (doc) => `<p class="meta">Stage ${esc(doc.phase)} | status: <strong>${esc(doc.status.replace('_', ' '))}</strong> | ${esc(doc.completeness)}% complete | ${esc(doc.word_count)} words | owner: ${esc(plain.roleName(doc.owner_role))} | ${doc.missing_count ? `${esc(doc.missing_count)} ${doc.missing_count === 1 ? 'part' : 'parts'} missing` : 'nothing missing'}${doc.last_updated ? ` | last updated ${esc(unitsMod.dateWords(doc.last_updated))}` : ''}</p>`;

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;

function toHtml(doc, store) { return page(doc.title, `<h1>${esc(doc.title)}</h1>${docMeta(doc)}${sectionHtml(doc, store)}`); }

/** The dossier: title page, table of contents, every document. docs = composed documents in order. */
function dossierHtml(title, docs, store, meta) {
  const toc = `<nav class="toc"><h2>Contents</h2><ol>${docs.map((d) => `<li><a href="#doc-${esc(d.key)}">${esc(d.title)}</a> <span class="meta">(stage ${esc(d.phase)}, ${esc(d.status.replace('_', ' '))}, ${esc(d.completeness)}%)</span></li>`).join('')}</ol></nav>`;
  const body = docs.map((d) => `<article id="doc-${esc(d.key)}"><h1>${esc(d.title)}</h1>${docMeta(d)}${sectionHtml(d, store, d.key + '-')}</article>`).join('<hr>');
  return page(title, `<h1>${esc(title)}</h1><p class="meta">${esc(meta || '')}</p>${toc}${body}`);
}
function dossierMd(title, docs, store, meta) {
  const L = [`# ${title}`, '', meta ? `_${meta}_` : '', '', '## Contents', ''];
  docs.forEach((d, i) => L.push(`${i + 1}. ${d.title} (stage ${d.phase}, ${d.status.replace('_', ' ')}, ${d.completeness}%)`));
  L.push('');
  for (const d of docs) L.push(toMarkdown(d, store, { level: 2 }), '');
  return L.join('\n');
}

export { esc, toMarkdown, toHtml, dossierHtml, dossierMd, inlineHtml, provenance, provenanceText, page, renderText };
