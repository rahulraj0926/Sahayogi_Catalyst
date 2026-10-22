/**
 * engine/extract_office.ts - text extractors for Office Open XML: PPTX, DOCX, XLSX (regex-based XML reading on top of engine/zip.ts).
 * Each returns { status, kind, slides|pages|sheets:[{index,title,text,tables,...}], warnings } and never invents text:
 * a part that cannot be read becomes a warning and the status drops to "partial".
 */
import { ZipReader, ZipError } from './zip';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ''; } }
  return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
});
const attr = (tag, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : null; };
const clean = (s) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const colLetters = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const colIndex = (letters) => letters.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Text of runs inside one paragraph-like XML chunk. tag = 'a:t' (DrawingML) or 'w:t' (WordprocessingML). */
function runsText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<(?:a:br|w:br|w:cr)\\s*/>|<w:tab\\s*/>`, 'g');
  let out = ''; let m;
  while ((m = re.exec(xml))) { if (m[1] !== undefined) out += decode(m[1]); else out += m[0].startsWith('<w:tab') ? '\t' : '\n'; }
  return out;
}

function relsOf(zip, relPath) {
  const xml = zip.tryText(relPath);
  const map = {};
  if (!xml) return map;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) { const id = attr(m[0], 'Id'); if (id) map[id] = { target: attr(m[0], 'Target'), type: attr(m[0], 'Type') || '' }; }
  return map;
}
const resolvePath = (base, target) => {
  if (!target) return null;
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

// ------------------------------------------------------------------ PPTX
function tableFromDrawingML(xml) {
  const rows = [];
  for (const tr of xml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)) {
    const cells = [];
    for (const tc of tr[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)) cells.push(clean(paragraphs(tc[0], 'a:p', 'a:t').join('\n')));
    rows.push(cells);
  }
  return rows;
}
function paragraphs(xml, ptag, ttag) {
  const out = [];
  xml = xml.replace(new RegExp(`<${ptag}\\s*/>`, 'g'), ''); // self-closed empty paragraphs would otherwise swallow the next one
  for (const m of xml.matchAll(new RegExp(`<${ptag}\\b[\\s\\S]*?</${ptag}>`, 'g'))) { const t = runsText(m[0], ttag); if (t.trim()) out.push(t.replace(/\n+/g, ' ').trim()); }
  return out;
}

function extractPptx(zip, warnings) {
  const pres = zip.tryText('ppt/presentation.xml');
  const rels = relsOf(zip, 'ppt/_rels/presentation.xml.rels');
  let slidePaths = [];
  if (pres) for (const m of pres.matchAll(/<p:sldId\b[^>]*>/g)) { const rid = attr(m[0], 'r:id'); if (rid && rels[rid]) slidePaths.push(resolvePath('ppt/presentation.xml', rels[rid].target)); }
  if (!slidePaths.length) {
    slidePaths = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    if (slidePaths.length) warnings.push('slide order read from file names (presentation.xml order not found)');
  }
  const slides = [];
  slidePaths.forEach((path, idx) => {
    const xml = zip.tryText(path);
    if (xml === null) { warnings.push(`slide ${idx + 1} (${path}) could not be read`); slides.push({ index: idx + 1, title: '', text: '', tables: [], notes: '', ok: false }); return; }
    let title = ''; const blocks = []; const tables = [];
    for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>|<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
      const el = m[0];
      if (el.startsWith('<p:graphicFrame')) { if (/<a:tbl\b/.test(el)) { const t = tableFromDrawingML(el); if (t.length) { tables.push({ rows: t }); blocks.push(t.map((r) => r.join(' | ')).join('\n')); } } continue; }
      const ph = /<p:ph\b[^>]*>/.exec(el);
      const phType = ph ? attr(ph[0], 'type') : null;
      if (phType === 'sldNum' || phType === 'dt' || phType === 'ftr') continue;
      const text = paragraphs(el, 'a:p', 'a:t').join('\n');
      if (!text) continue;
      if ((phType === 'title' || phType === 'ctrTitle') && !title) title = text.replace(/\n/g, ' '); else blocks.push(text);
    }
    // speaker notes through the slide's relationships
    let notes = '';
    const srels = relsOf(zip, path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    const nrel: any = Object.values(srels).find((r: any) => /notesSlide$/.test(r.type));
    if (nrel) {
      const nx = zip.tryText(resolvePath(path, nrel.target));
      if (nx) { const parts = []; for (const m of nx.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) { const ph = /<p:ph\b[^>]*>/.exec(m[0]); const t = ph ? attr(ph[0], 'type') : null; if (t === 'sldNum' || t === 'sldImg' || t === 'hdr' || t === 'dt' || t === 'ftr') continue; const tx = paragraphs(m[0], 'a:p', 'a:t').join('\n'); if (tx) parts.push(tx); } notes = parts.join('\n'); }
    }
    const text = [title, ...blocks].filter(Boolean).join('\n');
    const images = Object.values(srels).filter((r: any) => /\/image$/.test(r.type)).map((r: any) => resolvePath(path, r.target)).filter((pth) => pth && zip.has(pth));
    slides.push({ index: idx + 1, title, text, tables, notes, images, ok: true });
  });
  return { slides, warnings };
}

// ------------------------------------------------------------------ DOCX
function extractDocx(zip, warnings) {
  const xml = zip.tryText('word/document.xml');
  if (xml === null) throw new ZipError('word/document.xml not found');
  const body = (/<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml) || [null, xml])[1];
  const sections = [{ title: '', elements: [] }]; // elements keep reading order: {t:'p', style, text, heading} | {t:'table', rows}
  const last = () => sections[sections.length - 1];
  const flushPara = (pxml) => {
    const style = (/<w:pStyle\b[^>]*>/.exec(pxml) || [''])[0];
    const sv = style ? attr(style, 'w:val') : null;
    const text = runsText(pxml, 'w:t').replace(/\n+/g, ' ').trim();
    if (!text) return;
    const heading = !!(sv && /^(Heading|Title)/i.test(sv));
    if (heading && /^Heading1$|^Title$/i.test(sv)) sections.push({ title: text, elements: [] });
    last().elements.push({ t: 'p', style: sv, text, heading });
  };
  let depth = 0; let tblStart = -1; let m;
  const re = /<w:tbl>|<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  while ((m = re.exec(body))) {
    if (m[0] === '<w:tbl>') { if (depth === 0) tblStart = m.index; depth++; continue; }
    if (m[0] === '</w:tbl>') {
      depth--;
      if (depth === 0 && tblStart >= 0) {
        const tx = body.slice(tblStart, m.index + m[0].length); const rows = [];
        for (const tr of tx.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) { const cells = []; for (const tc of tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)) cells.push(clean(paragraphs(tc[0], 'w:p', 'w:t').join('\n'))); rows.push(cells); }
        if (rows.length) last().elements.push({ t: 'table', rows });
      }
      continue;
    }
    if (depth === 0) flushPara(m[0]);
  }
  const pages = sections.filter((s) => s.title || s.elements.length).map((s, idx) => {
    const tables = s.elements.filter((e) => e.t === 'table').map((e) => ({ rows: e.rows }));
    return {
      index: idx + 1, title: s.title || (idx === 0 ? 'Document' : `Section ${idx + 1}`), tables, elements: s.elements,
      text: s.elements.map((e) => (e.t === 'p' ? e.text : e.rows.map((r) => r.join(' | ')).join('\n'))).join('\n'), headings: s.elements.filter((e) => e.heading).map((e) => e.text),
    };
  });
  if (zip.has('word/footnotes.xml')) warnings.push('footnotes are not extracted');
  return { pages, warnings };
}

// ------------------------------------------------------------------ XLSX
function extractXlsx(zip, warnings) {
  const wb = zip.tryText('xl/workbook.xml');
  if (wb === null) throw new ZipError('xl/workbook.xml not found');
  const rels = relsOf(zip, 'xl/_rels/workbook.xml.rels');
  const shared = [];
  const ss = zip.tryText('xl/sharedStrings.xml');
  if (ss) for (const si of ss.matchAll(/<si\b[\s\S]*?<\/si>/g)) shared.push(runsText(si[0].replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''), 't'));
  const sheets = [];
  const sheetTags = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]);
  sheetTags.forEach((tag, idx) => {
    const name = attr(tag, 'name') || `Sheet${idx + 1}`;
    const rid = attr(tag, 'r:id');
    const path = rid && rels[rid] ? resolvePath('xl/workbook.xml', rels[rid].target) : `xl/worksheets/sheet${idx + 1}.xml`;
    const xml = zip.tryText(path);
    if (xml === null) { warnings.push(`sheet "${name}" (${path}) could not be read`); sheets.push({ index: idx + 1, title: name, text: '', tables: [], cells: [], ok: false }); return; }
    const cells = []; let truncated = false;
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if (cells.length >= 20000) { truncated = true; break; }
        const ref = attr(cm[1], 'r'); const t = attr(cm[1], 't'); const inner = cm[2] || '';
        if (!ref) continue;
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner); const f = /<f\b[^>]*>([\s\S]*?)<\/f>|<f\b[^>]*\/>/.exec(inner);
        let value = null;
        if (t === 's' && v) value = shared[parseInt(v[1], 10)] !== undefined ? shared[parseInt(v[1], 10)] : null;
        else if (t === 'inlineStr') value = runsText(inner, 't');
        else if (v) value = decode(v[1]);
        if (t === 'b' && value !== null) value = value === '1' ? 'TRUE' : 'FALSE';
        if (value === null || value === '') continue;
        const mm = /^([A-Z]+)(\d+)$/.exec(ref);
        const cell: any = { ref, row: mm ? Number(mm[2]) : 0, col: mm ? mm[1] : '', value };
        if (f) cell.formula = f[1] !== undefined ? decode(f[1]) : '(shared formula)';
        if (t !== 's' && t !== 'str' && t !== 'inlineStr' && t !== 'b' && value !== '' && !Number.isNaN(Number(value))) cell.number = Number(value);
        cells.push(cell);
      }
    }
    if (truncated) warnings.push(`sheet "${name}" truncated at 20000 cells`);
    // dense table
    const byRow = new Map();
    for (const c of cells) { if (!byRow.has(c.row)) byRow.set(c.row, []); byRow.get(c.row).push(c); }
    const rowNums = [...byRow.keys()].sort((a, b) => a - b);
    const maxCol = Math.max(-1, ...cells.map((c) => colIndex(c.col)));
    const rows = rowNums.map((r) => { const arr = new Array(maxCol + 1).fill(''); for (const c of byRow.get(r)) arr[colIndex(c.col)] = c.value; return { row: r, cells: arr }; });
    const text = rowNums.map((r) => byRow.get(r).map((c) => `${c.ref}: ${c.value}`).join('\t')).join('\n');
    sheets.push({ index: idx + 1, title: name, text, tables: rows.length ? [{ first_row: rowNums[0], columns: Array.from({ length: maxCol + 1 }, (_, i) => colLetters(i)), rows: rows.map((r) => r.cells), row_numbers: rowNums }] : [], cells, ok: true });
  });
  if (!sheets.length) warnings.push('no sheets found');
  return { sheets, warnings };
}

/** Dispatch on a detected kind: 'pptx' | 'docx' | 'xlsx'. */
function extractOffice(buf, kind) {
  const warnings = [];
  let zip;
  try { zip = new ZipReader(buf); } catch (e) { return { status: 'failed', kind, warnings: [`not a readable ${kind.toUpperCase()} file: ${e.message}`] }; }
  try {
    const r: any = kind === 'pptx' ? extractPptx(zip, warnings) : kind === 'docx' ? extractDocx(zip, warnings) : extractXlsx(zip, warnings);
    const list = r.slides || r.pages || r.sheets;
    const bad = list.filter((x) => x.ok === false).length;
    const chars = list.reduce((s, x) => s + x.text.length, 0);
    const status = !list.length || (!chars && !list.some((x) => x.tables && x.tables.length)) ? (bad ? 'failed' : 'partial') : bad || warnings.some((w) => /could not be read|truncated/.test(w)) ? 'partial' : 'ok';
    return { status, kind, ...r, warnings: r.warnings };
  } catch (e) { return { status: 'failed', kind, warnings: [...warnings, `could not read ${kind.toUpperCase()}: ${e.message}`] }; }
}

export { extractOffice, decode, colLetters, colIndex };
