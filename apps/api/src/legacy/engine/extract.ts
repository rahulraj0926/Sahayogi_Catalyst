/**
 * engine/extract.ts - document text extraction (no dependencies): format detection plus the extractors.
 *
 *   extract(buffer, {filename, mime}) -> { status, kind, slides|pages|sheets:[{index,title,text,tables,...}], plain_text, warnings, chars }
 *
 * status: ok (all recovered), partial (some parts missing; see warnings), unsupported (format or content cannot be read, e.g.
 * legacy .doc/.ppt/.xls, encrypted or scanned PDF), failed (file damaged or unreadable). Text is never invented: when a part
 * cannot be read it is omitted and reported in `warnings`.
 * Support matrix: PPTX, DOCX, XLSX (full text, tables, notes, cached formula values); CSV, TSV, TXT, MD, JSON, HTML;
 * PDF best-effort (Flate streams, simple fonts and ToUnicode fonts only).
 */
import * as path from 'node:path';
import { extractOffice } from './extract_office';
import { extractDelimited, extractPlain, extractHtml } from './extract_text';
import { extractPdf } from './extract_pdf';
import { ZipReader } from './zip';
import { addLocators } from './locators';

const EXT_KIND = { '.pptx': 'pptx', '.docx': 'docx', '.xlsx': 'xlsx', '.csv': 'csv', '.tsv': 'tsv', '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.json': 'json', '.html': 'html', '.htm': 'html', '.pdf': 'pdf', '.ppt': 'ole', '.doc': 'ole', '.xls': 'ole', '.rtf': 'rtf', '.odt': 'odf', '.odp': 'odf', '.ods': 'odf' };
const MIME_BY_EXT = { '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.html': 'text/html', '.htm': 'text/html', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.zip': 'application/zip', '.ppt': 'application/vnd.ms-powerpoint', '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel' };
/** Extensions refused at upload (anything that can run on a user's machine). */
const BLOCKED_EXT = new Set(['.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.msi', '.msp', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.jar', '.sh', '.bash', '.app', '.apk', '.pif', '.cpl', '.lnk', '.reg', '.hta', '.wsf', '.gadget', '.dmg', '.iso', '.bin', '.so', '.dylib', '.php', '.py', '.pl', '.rb']);

const extOf = (name) => path.extname(String(name || '')).toLowerCase();
const mimeFor = (name, headerMime) => (headerMime && headerMime !== 'application/octet-stream' && headerMime !== 'application/x-www-form-urlencoded' ? headerMime.split(';')[0].trim() : MIME_BY_EXT[extOf(name)] || 'application/octet-stream');

/** Detect the kind from magic bytes first, then the extension. */
function detect(buf, filename) {
  const ext = extOf(filename);
  const byExt = EXT_KIND[ext] || null;
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'ole';
  if (ZipReader.isZip(buf)) {
    try {
      const z = new ZipReader(buf); const names = z.names();
      if (names.some((n) => n.startsWith('ppt/'))) return 'pptx';
      if (names.some((n) => n.startsWith('word/'))) return 'docx';
      if (names.some((n) => n.startsWith('xl/'))) return 'xlsx';
      if (names.includes('mimetype')) return 'odf';
      return byExt && ['pptx', 'docx', 'xlsx'].includes(byExt) ? byExt : 'zip';
    } catch (e) { return byExt || 'zip'; }
  }
  if (byExt && ['pptx', 'docx', 'xlsx'].includes(byExt)) return byExt; // wrong content for the extension: let the extractor report it
  return byExt;
}

function plainOf(r) {
  if (r.slides) return r.slides.map((s) => `Slide ${s.index}${s.title ? ': ' + s.title : ''}\n${s.text.replace(new RegExp(`^${s.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`), '')}${s.notes ? `\nNotes: ${s.notes}` : ''}`.trim()).join('\n\n');
  if (r.sheets) return r.sheets.map((s) => `Sheet ${s.title}\n${s.text}`).join('\n\n');
  if (r.pages) return r.pages.map((p) => (r.pages.length > 1 ? `${p.title ? p.title + '\n' : ''}` : '') + p.text).join('\n\n');
  return '';
}

const OLD_NAMES = { '.doc': ['Word', '.docx'], '.ppt': ['PowerPoint', '.pptx'], '.xls': ['Excel', '.xlsx'] };
const PICTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);

/**
 * Why the text of a file could not be read, in plain words, with what to do about it. Returns null when the text was read.
 *   info: { status, kind, warnings[], filename, chars }
 *   -> { code: scanned | password | damaged | old_format | picture | empty | unsupported | partial, title, advice, level: bad | warn }
 */
function explain(info) {
  const status = info.status; const chars = info.chars || 0;
  const warnings = Array.isArray(info.warnings) ? info.warnings : String(info.warnings || '').split('\n');
  const w = warnings.join(' | ').toLowerCase();
  const ext = extOf(info.filename || '');
  const kind = info.kind || EXT_KIND[ext] || ext.slice(1);
  if (status === 'ok' && chars > 0) return null;
  if (status === 'partial' && chars > 0) return { code: 'partial', level: 'warn', title: 'Only part of this file could be read.', advice: 'What was read is available. If something important is missing, ask for another copy of the file or add the missing facts by hand.' };
  if (/encrypted|password/.test(w)) return { code: 'password', level: 'bad', title: 'This file is password-protected, so the assistant cannot open it.', advice: 'Ask the sender for a copy without a password. Or open it yourself with the password, save a copy without the password, and upload that copy.' };
  if (kind === 'ole' || OLD_NAMES[ext]) {
    const [app, to] = OLD_NAMES[ext] || ['Office', '.docx, .pptx or .xlsx'];
    return { code: 'old_format', level: 'bad', title: `This is an old-style ${app} file (${ext || 'binary Office'}), which the assistant cannot read.`, advice: `Open it in ${app}, choose File, then Save As, and pick ${to}. Upload the new file.` };
  }
  if (kind === 'pdf' && /scan|no text could be recovered|image|ocr|had no recoverable text/.test(w)) return { code: 'scanned', level: 'bad', title: 'This PDF is a scan (a picture of the pages with no text inside), so there is nothing to read.', advice: 'Ask for the original file (Word, PowerPoint or Excel). If you only have the scan, type or paste the key lines into a text file and upload that.' };
  if (PICTURE_EXT.has(ext)) return { code: 'picture', level: 'bad', title: 'This is a picture. The assistant cannot read words from pictures.', advice: 'You can still open it here. To use what it says, type or paste the words into a text file and upload that.' };
  if (status === 'failed' || /damaged|not a zip|truncated|end of central|no objects|no pages|not a pdf|not a readable|looks binary|could not read/.test(w)) return { code: 'damaged', level: 'bad', title: 'This file looks damaged or incomplete, so it could not be opened.', advice: 'Download or export it again from where it came from (a half-finished download or email attachment is the usual cause), then upload the new copy.' };
  if (status === 'partial' || status === 'ok') return { code: 'empty', level: 'bad', title: 'The file opened, but there is no text in it.', advice: 'Check that it is the right file. If the content is in pictures, ask for the original document or type the key lines into a text file.' };
  return { code: 'unsupported', level: 'bad', title: `The assistant cannot read this kind of file${ext ? ` (${ext})` : ''}.`, advice: 'Save it as a PDF, Word, Excel, PowerPoint or plain text file and upload that.' };
}

function extract(buf, opts: any = {}) {
  const filename = opts.filename || '';
  const kind = detect(buf, filename);
  let r;
  try {
    switch (kind) {
      case 'pptx': case 'docx': case 'xlsx': r = extractOffice(buf, kind); break;
      case 'csv': case 'tsv': r = extractDelimited(buf, kind); break;
      case 'txt': case 'md': case 'json': r = extractPlain(buf, kind); break;
      case 'html': r = extractHtml(buf); break;
      case 'pdf': r = extractPdf(buf); break;
      case 'ole': r = buf.includes(Buffer.from('EncryptedPackage', 'utf16le')) ? { status: 'unsupported', kind: 'ole', warnings: ['the Office file is password-protected (encrypted); text cannot be read without the password'] } : { status: 'unsupported', kind: 'ole', warnings: ['legacy binary Office files (.doc, .ppt, .xls) are not supported; save as .docx, .pptx or .xlsx and upload again'] }; break;
      case 'odf': case 'rtf': case 'zip': r = { status: 'unsupported', kind, warnings: [`${kind.toUpperCase()} files are not supported for text extraction`] }; break;
      default: r = { status: 'unsupported', kind: kind || extOf(filename).slice(1) || 'unknown', warnings: [`no extractor for "${extOf(filename) || 'this file type'}"; the file is stored but no text was read`] };
    }
  } catch (e) { r = { status: 'failed', kind, warnings: [`extraction failed: ${e.message}`] }; }
  r.warnings = r.warnings || [];
  r.plain_text = plainOf(r);
  r.chars = r.plain_text.length;
  addLocators(r);
  if (r.status === 'ok' && !r.chars && !(r.sheets || r.pages || r.slides || []).some((x) => x.tables && x.tables.length)) { r.status = 'partial'; r.warnings.push('the file was read but contains no text'); }
  r.reason = explain({ status: r.status, kind: r.kind, warnings: r.warnings, filename, chars: r.chars });
  return r;
}

export { extract, explain, detect, mimeFor, extOf, BLOCKED_EXT, EXT_KIND };
