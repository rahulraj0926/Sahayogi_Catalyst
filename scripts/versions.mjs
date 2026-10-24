#!/usr/bin/env node
/**
 * The version catalog. versions.json is the one place that says which Node, npm, PostgreSQL and package versions we use.
 *
 *   npm run versions:check                      fails if anything disagrees with the catalog (CI runs this)
 *   npm run versions:set -- next 15.6.0         changes one version everywhere (a package, or node / npm / postgres)
 *   npm run versions:sync                       copies the catalog into every package.json, .nvmrc and docs/VERSIONS.md
 *   npm run versions:list                       prints the catalog
 *
 * Plain Node, no packages needed, so it also runs before `npm ci`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);
const MANIFESTS = [['package.json', 'Tools', ''], ['apps/api/package.json', 'API', 'apps/api'], ['apps/web/package.json', 'Web app', 'apps/web']];
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const SECTIONS = ['dependencies', 'devDependencies'];
const major = (v) => Number(String(v).split('.')[0]);
const loadCatalog = () => JSON.parse(read('versions.json'));
const manifests = () => MANIFESTS.map(([file, part, dir]) => ({ file, part, dir, json: JSON.parse(read(file)) }));

/** which parts of the project use each package */
function usage() {
  const u = new Map();
  for (const m of manifests()) for (const s of SECTIONS) for (const n of Object.keys(m.json[s] || {})) {
    if (!u.has(n)) u.set(n, []);
    u.get(n).push(m);
  }
  return u;
}
const partOf = (ms) => { const p = new Set(ms.map((m) => m.part)); return p.has('API') && p.has('Web app') ? 'Both' : [...p][0]; };
const engines = (c) => ({ node: `>=${c.node} <${major(c.node) + 1}`, npm: `>=${c.npm} <${major(c.npm) + 1}` });

/** the tables inside docs/VERSIONS.md, written from the catalog so they can never drift */
function tables(c) {
  const tools = `| Tool | Version |\n|---|---|\n| Node.js | **${c.node}** |\n| npm | **${c.npm}** |\n| PostgreSQL | **${c.postgres}** (Docker image \`postgres:${c.postgres}\`) |\n`;
  const order = ['Web app', 'API', 'Both', 'Tools'];
  const rows = [...usage().entries()].map(([n, ms]) => ({ n, part: partOf(ms), v: c.packages[n] ?? '?' }))
    .sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part) || a.n.localeCompare(b.n));
  const pk = `| Used in | Package | Version |\n|---|---|---|\n${rows.map((r) => `| ${r.part} | ${r.n} | ${r.v} |`).join('\n')}\n`;
  return { tools, pk };
}
function withTables(doc, c) {
  const t = tables(c);
  const swap = (s, tag, body) => s.replace(new RegExp(`(<!-- versions:${tag} -->\\n)[\\s\\S]*?(<!-- /versions:${tag} -->)`), `$1${body}$2`);
  return swap(swap(doc, 'tools', t.tools), 'packages', t.pk);
}

function check() {
  const c = loadCatalog();
  const bad = [];
  const warn = [];
  const used = usage();
  const lock = JSON.parse(read('package-lock.json')).packages;

  // 1. every package: exact version, in the catalog, same everywhere
  for (const [n, ms] of used) {
    if (!(n in c.packages)) { bad.push(`${n} is used but is not in versions.json`); continue; }
    for (const m of ms) {
      const spec = SECTIONS.map((s) => m.json[s]?.[n]).find(Boolean);
      if (!EXACT.test(spec)) bad.push(`${m.file}: ${n} is "${spec}", it must be an exact version (no ^ or ~)`);
      else if (spec !== c.packages[n]) bad.push(`${m.file}: ${n} is ${spec} but the catalog says ${c.packages[n]}`);
      // 2. the lock file installs the same version
      const hit = [m.dir && `${m.dir}/node_modules/${n}`, `node_modules/${n}`].filter(Boolean).find((k) => lock[k]);
      const got = hit && lock[hit].version;
      if (got !== c.packages[n]) bad.push(`package-lock.json installs ${n} ${got ?? '(nothing)'} for ${m.file}, the catalog says ${c.packages[n]}. Run: npm install --package-lock-only`);
    }
  }
  for (const n of Object.keys(c.packages)) if (!used.has(n)) bad.push(`${n} is in versions.json but no package.json uses it. Remove it from the catalog`);

  // 3. Node, npm
  for (const f of ['.nvmrc', '.node-version']) if (read(f).trim() !== c.node) bad.push(`${f} says ${read(f).trim()}, the catalog says ${c.node}`);
  const root = JSON.parse(read('package.json'));
  const e = engines(c);
  if (root.engines?.node !== e.node) bad.push(`package.json engines.node is "${root.engines?.node}", expected "${e.node}"`);
  if (root.engines?.npm !== e.npm) bad.push(`package.json engines.npm is "${root.engines?.npm}", expected "${e.npm}"`);
  if (root.packageManager !== `npm@${c.npm}`) bad.push(`package.json packageManager is "${root.packageManager}", expected "npm@${c.npm}"`);
  if (!/^engine-strict=true$/m.test(read('.npmrc'))) bad.push('.npmrc must contain engine-strict=true');

  // 4. GitHub checks and Docker
  const ci = read('.github/workflows/ci.yml');
  if (/^\s*node-version:/m.test(ci) || !/node-version-file: \.nvmrc/.test(ci)) bad.push('.github/workflows/ci.yml must read Node from .nvmrc (node-version-file: .nvmrc), not a typed number');
  for (const f of ['docker-compose.yml', '.github/workflows/ci.yml']) {
    for (const m of read(f).matchAll(/image:\s*postgres:(\S+)/g)) if (m[1] !== c.postgres) bad.push(`${f} uses postgres:${m[1]}, the catalog says ${c.postgres}`);
  }

  // 5. the readable catalog
  if (withTables(read('docs/VERSIONS.md'), c) !== read('docs/VERSIONS.md')) bad.push('docs/VERSIONS.md tables are out of date. Run: npm run versions:sync');

  if (c.packages['@types/node'] && major(c.packages['@types/node']) !== major(c.node)) warn.push(`@types/node is ${c.packages['@types/node']} but Node is ${c.node}: the type definitions are for another Node major version`);
  warn.forEach((w) => console.log(`note: ${w}`));
  if (bad.length) {
    console.error(`Version catalog problems (${bad.length}):\n${bad.map((b) => `  - ${b}`).join('\n')}\n\nTo change a version on purpose: npm run versions:set -- <package> <version>   (then: npm install --package-lock-only)`);
    process.exit(1);
  }
  console.log(`Versions OK: Node ${c.node}, npm ${c.npm}, PostgreSQL ${c.postgres}, ${Object.keys(c.packages).length} packages, all exact and the same everywhere.`);
}

function sync() {
  const c = loadCatalog();
  for (const m of manifests()) {
    for (const s of SECTIONS) for (const n of Object.keys(m.json[s] || {})) {
      if (!(n in c.packages)) throw new Error(`${n} (${m.file}) is not in versions.json. Add it there first.`);
      m.json[s][n] = c.packages[n];
    }
    if (m.file === 'package.json') { m.json.engines = engines(c); m.json.packageManager = `npm@${c.npm}`; }
    write(m.file, `${JSON.stringify(m.json, null, 2)}\n`);
  }
  write('.nvmrc', `${c.node}\n`); write('.node-version', `${c.node}\n`);
  write('docs/VERSIONS.md', withTables(read('docs/VERSIONS.md'), c));
  console.log('Synced package.json files, .nvmrc, .node-version and docs/VERSIONS.md from versions.json.');
}

function set(name, version) {
  if (!name || !version) { console.error('Usage: npm run versions:set -- <package|node|npm|postgres> <version>'); process.exit(1); }
  const c = loadCatalog();
  if (['node', 'npm', 'postgres'].includes(name)) {
    c[name] = version;
    if (name === 'postgres') for (const f of ['docker-compose.yml', '.github/workflows/ci.yml']) write(f, read(f).replace(/(image:\s*postgres:)\S+/g, `$1${version}`));
  } else {
    if (!(name in c.packages)) { console.error(`${name} is not in the catalog. To add a new package: install it with npm, then add it to versions.json with the same version.`); process.exit(1); }
    if (!EXACT.test(version)) { console.error(`"${version}" is not an exact version like 1.2.3`); process.exit(1); }
    c.packages[name] = version;
  }
  write('versions.json', `${JSON.stringify(c, null, 2)}\n`);
  sync();
  console.log(`\n${name} is now ${version} everywhere. Next:\n  1. npm install --package-lock-only   (updates package-lock.json)${name === 'node' ? '\n  2. install the new Node on your computer (nvm install ' + version + ')' : ''}\n  ${name === 'node' ? '3' : '2'}. npm run versions:check, then npm run check && npm test, and commit all changed files in one pull request.`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'check') check();
else if (cmd === 'sync') sync();
else if (cmd === 'set') set(a, b);
else if (cmd === 'list') { const c = loadCatalog(); console.log(`node ${c.node}\nnpm ${c.npm}\npostgres ${c.postgres}`); for (const [n, v] of Object.entries(c.packages)) console.log(`${n} ${v}`); }
else { console.error('Usage: node scripts/versions.mjs check | sync | set <name> <version> | list'); process.exit(1); }
