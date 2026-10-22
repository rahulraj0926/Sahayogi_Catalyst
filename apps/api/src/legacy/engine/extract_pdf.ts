/**
 * engine/extract_pdf.ts - best-effort PDF text recovery on node:zlib. No dependencies, no OCR.
 *
 * What it does: finds objects (also inside object streams), inflates FlateDecode content streams, walks the page tree in
 * order, and reads text-showing operators (Tj, TJ, ', ") with simple string escapes and hex strings. Fonts with a
 * /ToUnicode CMap are decoded through it. Honest limits: encrypted files, scanned pages (images only), and fonts with
 * custom encodings and no ToUnicode cannot be read; such pages are reported, and the status is "partial" or "unsupported".
 * Text that decodes to mostly non-printable characters is discarded, never guessed.
 */
import * as zlib from 'node:zlib';

const MAX_STREAM = 40 * 1024 * 1024;

function inflate(buf) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) { try { return fn(buf, { maxOutputLength: MAX_STREAM }); } catch (e) { /* try next */ } }
  return null;
}

/** Parse all indirect objects: Map num -> {dict:string, stream:Buffer|null}. */
function parseObjects(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(s))) {
    const num = Number(m[1]); const start = m.index + m[0].length;
    const endIdx = s.indexOf('endobj', start);
    if (endIdx < 0) break;
    let body = s.slice(start, endIdx);
    let stream = null;
    const si = body.indexOf('stream');
    let dict = body;
    if (si >= 0 && /^\s*<</.test(body)) {
      dict = body.slice(0, si);
      let ds = start + si + 6;
      if (s[ds] === '\r') ds++; if (s[ds] === '\n') ds++;
      const de = s.lastIndexOf('endstream', endIdx);
      if (de > ds) { stream = buf.subarray(ds, de); let end = stream.length; if (stream[end - 1] === 0x0a) end--; if (stream[end - 1] === 0x0d) end--; stream = stream.subarray(0, end); }
    }
    objs.set(num, { dict, stream });
    re.lastIndex = endIdx + 6;
  }
  return objs;
}

function streamData(o) {
  if (!o || !o.stream) return null;
  if (/\/FlateDecode|\/Fl\b/.test(o.dict)) return inflate(o.stream);
  if (/\/Filter/.test(o.dict)) return null; // LZW, ASCII85, DCT...: unsupported
  return o.stream;
}

/** Add objects stored inside /ObjStm streams (PDF 1.5). */
function expandObjectStreams(objs) {
  for (const [num, o] of [...objs.entries()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const data = streamData(o); if (!data) continue;
    const n = Number((/\/N\s+(\d+)/.exec(o.dict) || [])[1]); const first = Number((/\/First\s+(\d+)/.exec(o.dict) || [])[1]);
    if (!n || !first) continue;
    const text = data.toString('latin1');
    const nums = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const onum = nums[2 * i]; const off = nums[2 * i + 1]; const next = i + 1 < n ? nums[2 * i + 3] : text.length - first;
      if (Number.isFinite(onum) && Number.isFinite(off) && !objs.has(onum)) objs.set(onum, { dict: text.slice(first + off, first + next), stream: null });
    }
  }
}

const refsIn = (s) => [...String(s).matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));

/** Pages in document order: walk /Root > /Pages > /Kids; fall back to file order of /Type /Page objects. */
function pageList(objs, trailerRoot) {
  const pages = [];
  const seen = new Set();
  const walk = (num) => {
    const o = objs.get(num); if (!o || seen.has(num)) return; seen.add(num);
    if (/\/Type\s*\/Pages\b/.test(o.dict) || /\/Kids\b/.test(o.dict)) { const kids = (/\/Kids\s*\[([^\]]*)\]/.exec(o.dict) || [])[1]; for (const k of refsIn(kids || '')) walk(k); } else if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push(num);
  };
  if (trailerRoot) { const root = objs.get(trailerRoot); const pr = root && /\/Pages\s+(\d+)\s+\d+\s+R/.exec(root.dict); if (pr) walk(Number(pr[1])); }
  if (!pages.length) for (const [num, o] of objs) if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push(num);
  return pages;
}

// ------------------------------------------------------------------ ToUnicode
function parseToUnicode(text) {
  const map = new Map(); let width = 1;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
  if (cs) { const h = /<([0-9a-fA-F]+)>/.exec(cs[1]); if (h) width = h[1].length / 2; }
  const u16 = (hex) => { let out = ''; for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16)); return out; };
  for (const b of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), u16(m[2]));
  for (const b of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of b[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16); const hi = parseInt(m[2], 16);
      if (hi - lo > 65535) continue;
      if (m[3]) { const base = u16(m[3]); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); } else if (m[4]) { [...m[4].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, i) => map.set(lo + i, u16(x[1]))); }
    }
  }
  return { map, width };
}

function decodeLiteral(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c !== '\\') { out += c; continue; }
    const n = str[++i];
    if (n === 'n') out += '\n'; else if (n === 'r') out += '\r'; else if (n === 't') out += '\t'; else if (n === 'b') out += '\b'; else if (n === 'f') out += '\f';
    else if (n === '\n') { /* line continuation */ } else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(str[i + 1])) o += str[++i]; out += String.fromCharCode(parseInt(o, 8) & 255); } else out += n;
  }
  return out;
}

/** Read the text operators of one content stream. fonts: name -> {cmap?}. Returns lines. */
function readContent(content, fonts) {
  const toks = [];
  const re = /\((?:\\[\s\S]|[^\\)])*\)|<[0-9a-fA-F\s]*>|\[|\]|\/[^\s/<>\[\]()]+|-?\d*\.?\d+|[A-Za-z'"*]+/g; let m;
  while ((m = re.exec(content))) toks.push(m[0]);
  const lines = []; let cur = ''; let font = null; let bad = 0; let good = 0;
  const flush = () => { if (cur.trim()) lines.push(cur.replace(/\s+$/, '')); cur = ''; };
  const showString = (tok) => {
    let codes;
    if (tok[0] === '(') codes = Array.from(decodeLiteral(tok.slice(1, -1)), (ch) => ch.charCodeAt(0) & 255);
    else { const hex = tok.slice(1, -1).replace(/\s+/g, ''); codes = []; for (let i = 0; i < hex.length; i += 2) codes.push(parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16)); }
    let text = '';
    const cm = font && font.cmap;
    if (cm) {
      const w = cm.width;
      for (let i = 0; i + w <= codes.length; i += w) { let code = 0; for (let j = 0; j < w; j++) code = code * 256 + codes[i + j]; const u = cm.map.get(code); if (u !== undefined) text += u; else { text += ''; bad++; } }
    } else if (font && font.composite) { bad += codes.length; return ''; } else { for (const c of codes) text += String.fromCharCode(c); text = text.replace(/ /g, ' '); }
    for (const ch of text) { if (/[\p{L}\p{N}\p{P}\p{S}\s]/u.test(ch) && ch !== '\u0000') good++; else bad++; }
    return text;
  };
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t[0] === '(' || (t[0] === '<' && t !== '<<')) { stack.push(t); continue; }
    if (t === '[') { const arr = []; i++; while (i < toks.length && toks[i] !== ']') { arr.push(toks[i]); i++; } stack.push(arr); continue; }
    if (t[0] === '/' || /^-?\d*\.?\d+$/.test(t)) { stack.push(t); continue; }
    switch (t) {
      case 'Tf': { const nm = stack[stack.length - 2]; font = typeof nm === 'string' && nm[0] === '/' ? fonts[nm.slice(1)] || null : null; break; }
      case 'Tj': { const s = stack[stack.length - 1]; if (typeof s === 'string') cur += showString(s); break; }
      case "'": case '"': { flush(); const s = stack[stack.length - 1]; if (typeof s === 'string') cur += showString(s); break; }
      case 'TJ': { const arr = stack[stack.length - 1]; if (Array.isArray(arr)) for (const e of arr) { if (e[0] === '(' || e[0] === '<') cur += showString(e); else if (/^-?\d*\.?\d+$/.test(e) && Number(e) < -250) cur += ' '; } break; }
      case 'T*': case 'TD': case 'Td': { const ty = Number(stack[stack.length - 1]); if (t === 'T*' || (Number.isFinite(ty) && ty !== 0)) flush(); else if (cur && !/\s$/.test(cur)) cur += ' '; break; }
      case 'ET': flush(); break;
      case 'Tm': flush(); break;
      default: break;
    }
    stack.length = 0;
  }
  flush();
  return { lines, bad, good };
}

function extractPdf(buf) {
  const warnings = [];
  const head = buf.subarray(0, 1024).toString('latin1');
  if (!/%PDF-/.test(head)) return { status: 'failed', kind: 'pdf', warnings: ['not a PDF (no %PDF header)'] };
  const whole = buf.toString('latin1');
  if (/\/Encrypt\b/.test(whole)) return { status: 'unsupported', kind: 'pdf', pages: [], warnings: ['the PDF is encrypted; text cannot be read without the password'] };
  const objs = parseObjects(buf);
  if (!objs.size) return { status: 'failed', kind: 'pdf', warnings: ['no objects found; the file may be damaged'] };
  expandObjectStreams(objs);
  const rootNum = Number((/\/Root\s+(\d+)\s+\d+\s+R/.exec(whole) || [])[1]) || null;
  const pageNums = pageList(objs, rootNum);
  if (!pageNums.length) return { status: 'failed', kind: 'pdf', pages: [], warnings: ['no pages found'] };

  const cmapCache = new Map();
  const fontsFor = (pageDict) => {
    const fonts = {};
    let res = /\/Resources\s*(<<[\s\S]*>>|\d+\s+\d+\s+R)/.exec(pageDict);
    let rd = res ? res[1] : '';
    if (/^\d+\s+\d+\s+R$/.test(rd)) { const ro = objs.get(refsIn(rd)[0]); rd = ro ? ro.dict : ''; }
    const fm = /\/Font\s*(<<[\s\S]*?>>|\d+\s+\d+\s+R)/.exec(rd);
    if (!fm) return fonts;
    let fd = fm[1];
    if (/^\d+\s+\d+\s+R$/.test(fd)) { const fo = objs.get(refsIn(fd)[0]); fd = fo ? fo.dict : ''; }
    for (const e of fd.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
      const fo = objs.get(Number(e[2])); if (!fo) continue;
      const f: any = { composite: /\/Subtype\s*\/Type0/.test(fo.dict) };
      const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(fo.dict);
      if (tu) { const n = Number(tu[1]); if (!cmapCache.has(n)) { const d = streamData(objs.get(n)); cmapCache.set(n, d ? parseToUnicode(d.toString('latin1')) : null); } f.cmap = cmapCache.get(n) || undefined; }
      fonts[e[1]] = f;
    }
    return fonts;
  };

  const pages = []; let unreadable = 0; let imageOnly = 0;
  pageNums.forEach((pn, idx) => {
    const po = objs.get(pn);
    const cm = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(po.dict);
    const contentRefs = cm ? refsIn(cm[1]) : [];
    const fonts = fontsFor(po.dict);
    let lines = []; let bad = 0; let good = 0; let streamFail = false;
    for (const cn of contentRefs) {
      const data = streamData(objs.get(cn));
      if (!data) { streamFail = true; continue; }
      const r = readContent(data.toString('latin1'), fonts);
      lines = lines.concat(r.lines); bad += r.bad; good += r.good;
    }
    const total = bad + good;
    const text = lines.join('\n').trim();
    const garbled = total > 0 && bad / total > 0.3;
    if (streamFail) warnings.push(`page ${idx + 1}: a content stream uses an unsupported filter`);
    if (garbled) { warnings.push(`page ${idx + 1}: text uses a font encoding without a usable map and was discarded`); unreadable++; pages.push({ index: idx + 1, title: `Page ${idx + 1}`, text: '', tables: [], ok: false }); return; }
    if (!text) { if (/\/Subtype\s*\/Image/.test(po.dict) || /\/XObject/.test(po.dict) || !contentRefs.length) imageOnly++; unreadable++; pages.push({ index: idx + 1, title: `Page ${idx + 1}`, text: '', tables: [], ok: false }); return; }
    pages.push({ index: idx + 1, title: text.split('\n')[0].slice(0, 80), text, tables: [], ok: true });
  });
  const readable = pages.filter((p) => p.ok).length;
  if (!readable) return { status: 'unsupported', kind: 'pdf', pages, warnings: [...warnings, 'no text could be recovered (scanned images, or unsupported font encodings); OCR is not available'] };
  if (unreadable) warnings.push(`${unreadable} of ${pages.length} page(s) had no recoverable text${imageOnly ? ' (possibly scanned images)' : ''}`);
  return { status: unreadable ? 'partial' : 'ok', kind: 'pdf', pages, warnings };
}

export { extractPdf };
