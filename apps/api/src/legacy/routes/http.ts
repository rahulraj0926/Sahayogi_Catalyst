/** Small helpers shared by route modules: file responses with a safe Content-Disposition. */
const asciiName = (n) => String(n).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'download';

/** Build a { __raw, headers } result. mode: 'inline' | 'attachment'. */
function file(body, type, filename, mode) {
  const ascii = asciiName(filename);
  return {
    __raw: body,
    headers: {
      'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${mode === 'attachment' ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  };
}
const slug = (s) => String(s || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
const wantsDownload = (q) => ['1', 'true', 'yes'].includes(String(q.download));

export { file, slug, wantsDownload, asciiName };
