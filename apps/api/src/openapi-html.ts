/**
 * npm run openapi:html
 * Turns docs/api/openapi.v1.json into docs/api/swagger.html: one file with the whole API description inside and the Swagger UI viewer
 * loaded from a CDN (needs internet to show). Double-click it, no server needed; "Try it out" is off because the file has no server to call
 * (use http://localhost:4000/api/docs while the API runs for that). `npm run openapi:export` runs this too.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SWAGGER_UI_VERSION = '5.17.14';
const root = path.join(__dirname, '..', '..', '..', 'docs', 'api');

export function renderHtml(spec: unknown): string {
  // "</" inside JSON must not close the script tag; U+2028/2029 are valid JSON but break older script parsers
  const json = JSON.stringify(spec).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  const title = String((spec as any)?.info?.title || 'API');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - API reference</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css">
<style>body{margin:0}.topbar{display:none}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script id="spec" type="application/json">${json}</script>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
<script>
  window.onload = function () {
    window.ui = SwaggerUIBundle({
      spec: JSON.parse(document.getElementById('spec').textContent),
      dom_id: '#swagger-ui',
      deepLinking: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: 0,
      supportedSubmitMethods: [],
    });
  };
</script>
</body>
</html>
`;
}

if (require.main === module) {
  const from = path.join(root, 'openapi.v1.json');
  if (!fs.existsSync(from)) { console.error(`${from} not found. Run npm run openapi:export first.`); process.exit(1); }
  const out = path.join(root, 'swagger.html');
  fs.writeFileSync(out, renderHtml(JSON.parse(fs.readFileSync(from, 'utf8'))));
  console.log(`Wrote ${out}`);
}
