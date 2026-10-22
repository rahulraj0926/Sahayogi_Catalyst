/**
 * engine/extract_text.ts - plain-text family extractors: CSV, TSV, TXT, MD, JSON, HTML.
 */
import { decode } from './extract_office';

/** RFC 4180 style delimited parser (quotes, doubled quotes, newlines inside quotes). */
function parseDelimited(text, delim) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '') || row.length > 1) rows.push(row); row = []; } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const bufText = (buf) => {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^﻿/, '');
  return buf.toString('utf8').replace(/^﻿/, '');
};
const looksBinary = (s) => { const sample = s.slice(0, 4000); const bad = (sample.match(/[\u0000-\u0008\u000e-\u001f�]/g) || []).length; return sample.length > 0 && bad / sample.length > 0.05; };

function extractDelimited(buf, kind) {
  const text = bufText(buf);
  if (looksBinary(text)) return { status: 'failed', kind, warnings: ['file looks binary, not text'] };
  const delim = kind === 'tsv' ? '\t' : (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',');
  const rows = parseDelimited(text, delim);
  const warnings = delim === ';' && kind === 'csv' ? ['semicolon-separated values detected'] : [];
  const lines = rows.map((r) => r.join(' | '));
  return { status: 'ok', kind, pages: [{ index: 1, title: 'Table', text: lines.join('\n'), tables: [{ rows }] }], warnings };
}

function extractPlain(buf, kind) {
  const raw = bufText(buf);
  if (looksBinary(raw)) return { status: 'failed', kind, warnings: ['file looks binary, not text'] };
  let text = raw;
  const warnings = [];
  if (kind === 'json') { try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch (e) { warnings.push(`invalid JSON (${e.message}); raw text kept`); } }
  const tables = [];
  if (kind === 'md') {
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        const rows = []; let j = i;
        while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) { if (j !== i + 1) rows.push(lines[j].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); j++; }
        tables.push({ rows }); i = j;
      }
    }
  }
  return { status: warnings.length && kind === 'json' ? 'partial' : 'ok', kind, pages: [{ index: 1, title: 'Text', text, tables }], warnings };
}

function extractHtml(buf) {
  const raw = bufText(buf);
  if (looksBinary(raw)) return { status: 'failed', kind: 'html', warnings: ['file looks binary, not text'] };
  const warnings = [];
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw) || [])[1];
  const tables = [];
  for (const t of raw.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [];
    for (const tr of t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) { const cells = [...tr[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decode(c[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()); if (cells.length) rows.push(cells); }
    if (rows.length) tables.push({ rows });
  }
  const text = decode(raw.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { status: 'ok', kind: 'html', pages: [{ index: 1, title: title ? decode(title).trim() : 'Page', text, tables }], warnings };
}

export { extractDelimited, extractPlain, extractHtml, parseDelimited, bufText };
