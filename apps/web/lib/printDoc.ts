import { actor, showName } from '@/lib/api';

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const PRINT_CSS = `
@page { size: A4; margin: 22mm 20mm 22mm 20mm; @bottom-center { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #777; } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #1a1a1a; }
body { font: 10.5pt/1.6 "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
table.pp { width: 100%; border-collapse: collapse; }
table.pp > thead > tr > td, table.pp > tbody > tr > td, table.pp > tfoot > tr > td { padding: 0; }
.ph { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; border-bottom: 1px solid #c9c9c9; padding-bottom: 6px; margin-bottom: 14px; font-size: 8pt; letter-spacing: .02em; color: #666; }
.ph b { color: #1a1a1a; font-weight: 600; }
.pf { height: 4mm; }
.cover { margin: 0 0 22px; padding: 10px 0 18px; border-bottom: 2px solid #1a1a1a; }
.cover .kind { font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: #666; margin: 0 0 8px; }
.cover h1 { font-size: 26pt; line-height: 1.15; margin: 0 0 8px; letter-spacing: -.01em; }
.cover .meta { margin: 0; color: #555; font-size: 9.5pt; }
h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; line-height: 1.25; color: #111; }
h1 { font-size: 17pt; margin: 22px 0 8px; } h2 { font-size: 13.5pt; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; } h3 { font-size: 11.5pt; margin: 14px 0 4px; }
p, li { orphans: 3; widows: 3; } p { margin: 0 0 8px; } ul, ol { margin: 0 0 10px; padding-left: 20px; }
table { border-collapse: collapse; max-width: 100%; margin: 6px 0 12px; }
table:not(.pp) th, table:not(.pp) td { border: 1px solid #cfcfcf; padding: 4px 8px; text-align: left; vertical-align: top; font-size: 9.5pt; }
table:not(.pp) th { background: #f1f1f1; font-weight: 600; }
table:not(.pp) tr { break-inside: avoid; page-break-inside: avoid; }
table:not(.pp) thead { display: table-header-group; }
pre, blockquote, figure, img, svg { break-inside: avoid; page-break-inside: avoid; max-width: 100%; }
pre { white-space: pre-wrap; background: #f5f5f5; padding: 8px 10px; font-size: 9pt; border-radius: 3px; }
blockquote { margin: 8px 0; padding: 2px 12px; border-left: 3px solid #ccc; color: #444; }
a { color: inherit; text-decoration: none; }
article { break-before: page; page-break-before: always; }
article:first-of-type, .cover + article { break-before: auto; page-break-before: auto; }
button, .btn, nav, script { display: none !important; }
/* numbered headings, like a standard report */
body { counter-reset: sec; }
h1 { counter-increment: sec; counter-reset: sub; } h1::before { content: counter(sec) ". "; }
h2 { counter-increment: sub; } h2::before { content: counter(sec) "." counter(sub) "  "; }
.cover h1, .toc h1 { counter-increment: none; counter-reset: none; } .cover h1::before, .toc h1::before { content: none; }
.toc { margin: 0 0 24px; break-after: page; page-break-after: always; }
.toc h1 { font-size: 15pt; margin: 0 0 10px; }
.toc ol { list-style: none; margin: 0; padding: 0; counter-reset: t; }
.toc li { counter-increment: t; display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px dotted #bbb; font-size: 10.5pt; }
.toc li::before { content: counter(t) "."; min-width: 22px; color: #555; }
@media screen { html { background: #d9dbe0; } .sheet { width: 210mm; max-width: calc(100% - 32px); margin: 28px auto; padding: 22mm 20mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.25); } }
@media print { .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; } }
`;

/** Prints one HTML document from the API in a hidden frame: a running header on every page, nothing from the app around it. */
export async function printDocument(url: string, o: { product: string; kind: string; title?: string }): Promise<void> {
  const res = await fetch(url, { headers: { 'x-actor': actor() } });
  const text = await res.text();
  if (!res.ok) { let m = `HTTP ${res.status}`; try { m = JSON.parse(text).error || m; } catch { /* not json */ } throw new Error(m); }
  const src = new DOMParser().parseFromString(showName(text), 'text/html');
  src.querySelectorAll('script,iframe,object,embed,link,meta,title,nav').forEach((n) => n.remove());
  src.querySelectorAll('*').forEach((el) => { [...el.attributes].forEach((a) => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }); });
  const styles = [...src.querySelectorAll('style')].map((s) => s.outerHTML).join('');
  src.querySelectorAll('style').forEach((s) => s.remove());
  const body = src.body.innerHTML;
  if (!body.trim()) throw new Error('There is nothing to print yet.');
  const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const heading = o.title || o.product;
  // contents list from the main headings
  const tmp = document.createElement('div'); tmp.innerHTML = body;
  const heads = [...tmp.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()).filter(Boolean);
  const toc = heads.length > 1 ? `<div class="toc"><h1>Contents</h1><ol>${heads.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading)} - ${esc(o.kind)}</title>${styles}<style>${PRINT_CSS}</style></head><body><div class="sheet">
<table class="pp"><thead><tr><td><div class="ph"><span><b>${esc(o.product)}</b> &nbsp;·&nbsp; ${esc(o.kind)}</span><span>${esc(when)}</span></div></td></tr></thead>
<tfoot><tr><td><div class="pf"></div></td></tr></tfoot>
<tbody><tr><td><div class="cover"><p class="kind">${esc(o.kind)}</p><h1>${esc(heading)}</h1><p class="meta">${esc(o.product)} &nbsp;·&nbsp; ${esc(when)}</p></div>${toc}${body}</td></tr></tbody></table></div></body></html>`;
  openPreview(html, `${heading} - ${o.kind}`);
}

/** A full-screen print preview: the document on paper, with Print and Close. Print then opens the browser's own print dialog. */
function openPreview(html: string, title: string) {
  document.getElementById('sd-preview')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'sd-preview';
  wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', 'Print preview');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#d9dbe0;font:14px system-ui,sans-serif';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 18px;background:#2b2d33;color:#fff';
  const t = document.createElement('b'); t.textContent = `Print preview: ${title}`; t.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600';
  const mk = (label: string, primary: boolean, fn: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = `padding:7px 18px;border-radius:7px;border:1px solid ${primary ? '#4f7cff' : '#666'};background:${primary ? '#4f7cff' : 'transparent'};color:#fff;font:inherit;font-weight:600;cursor:pointer;min-height:0`; b.onclick = fn; return b; };
  const frame = document.createElement('iframe');
  frame.style.cssText = 'flex:1;border:0;width:100%;background:#d9dbe0';
  const close = () => { document.removeEventListener('keydown', esc); wrap.remove(); };
  const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  bar.append(t, mk('Print', true, () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }), mk('Close', false, close));
  wrap.append(bar, frame);
  document.addEventListener('keydown', esc);
  frame.srcdoc = html;
  document.body.appendChild(wrap);
}
