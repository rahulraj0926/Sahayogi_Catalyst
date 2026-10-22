/**
 * engine/receiver.ts - the RECEIVING side of the hand-over: what a developer tool does with a story package.
 *
 * receive(pkg, { dir }) checks the package on its own (no access to the sender's data), then files it:
 *   <dir>/<product key>/<story key>@v<version>/package.json   the package exactly as received
 *   <dir>/<product key>/<story key>@v<version>/story.md       the story, acceptance checks, rules and quality targets as a readable page
 *   <dir>/backlog.json and <dir>/backlog.csv                  one row per story (the newest version is active, older ones are superseded)
 *   <dir>/receipts.json                                       one receipt per delivery, keyed by the idempotency key
 * Delivery is safe to repeat: the same idempotency key returns the same receipt and changes nothing.
 * A package is rejected, with the reasons, when it is damaged (hash mismatch), incomplete, or its story is not approved.
 * This is the reference behaviour. The company's real developer tool replaces it; the contract it must meet is the same (docs/HANDOFF_RECEIVER.md).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCHEMA_VERSION = '1.0';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safe = (s) => String(s).replace(/[^A-Za-z0-9._@-]+/g, '_');

/** Checks that need only the package. Returns { valid, errors, warnings }. */
function check(pkg) {
  const errors = []; const warnings = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };
  if (!pkg || typeof pkg !== 'object') return { valid: false, errors: ['The package is empty or is not a JSON object.'], warnings };
  need(pkg.schema_version === SCHEMA_VERSION, `Unsupported schema_version "${pkg.schema_version}". This receiver understands ${SCHEMA_VERSION}.`);
  const p = pkg.package || {};
  need(p.package_id && p.idempotency_key && p.content_hash, 'package_id, idempotency_key and content_hash are all required.');
  need(!!pkg.product && !!pkg.product.key, 'The product block is missing.');
  const st = pkg.story;
  need(!!st && !!st.key && !!st.want, 'The story and its "want" statement are required.');
  if (st) {
    need(['Approved', 'Ready-for-handoff', 'Handed-off'].includes(st.status), `The story status is "${st.status}". Only approved stories are accepted.`);
    need(!!st.persona, 'The story has no persona (who it is for).');
  }
  const acs = pkg.acceptance_criteria || [];
  need(acs.length >= 1, 'At least one acceptance check is required.');
  need(acs.some((a) => a.scenario_type === 'happy'), 'At least one happy-path acceptance check is required.');
  need((pkg.requirements || []).length >= 1, 'The package has no requirement.');
  if (p.content_hash) {
    const { schema_version, package: _p, product, baseline, release, _closure, ...body } = pkg;
    const again = 'sha256:' + sha(JSON.stringify(body)).slice(0, 16);
    need(again === p.content_hash, 'The content does not match its hash. The package was changed or damaged after it was made.');
  }
  if (!(pkg.baseline && pkg.baseline.id)) warnings.push('The package has no sign-off baseline: it was made before the stage sign-offs passed.');
  return { valid: errors.length === 0, errors, warnings };
}

/** The readable page for a story. */
function storyMarkdown(pkg) {
  const s = pkg.story; const L = [];
  L.push(`# ${s.key}: ${s.title}`, '', `Product: ${pkg.product.name} (${pkg.product.key}). Package ${pkg.package.package_id} version ${pkg.package.package_version}. Priority: ${s.priority || 'not set'}.`, '');
  L.push('## The story', '', `As ${s.persona ? s.persona.name : 'a user'}, I want ${s.want}${s.benefit ? `, so that ${s.benefit}` : ''}.`, '');
  if (s.estimate) L.push(`Estimate: ${s.estimate.value} ${s.estimate.unit}.`, '');
  L.push('## Acceptance checks', '');
  for (const a of pkg.acceptance_criteria || []) L.push(`- **${a.key}** (${a.scenario_type || a.kind}): given ${a.given || '...'}, when ${a.when || '...'}, then ${a.then || '...'}`);
  const sec = (title, arr, fmt) => { if (arr && arr.length) { L.push('', `## ${title}`, ''); arr.forEach((x) => L.push(`- ${fmt(x)}`)); } };
  sec('Requirements', pkg.requirements, (r) => `**${r.key}** (${r.priority}, ${r.subtype}): ${r.statement}`);
  sec('Business rules', pkg.business_rules, (r) => `**${r.key}**: ${r.statement}`);
  sec('Quality targets that apply', pkg.applicable_nfrs, (n) => `**${n.key}** (${n.category}): ${n.metric} ${n.comparator || ''} ${n.target_value ?? ''} ${n.unit || ''}${n.condition_or_load_profile ? `, under ${n.condition_or_load_profile}` : ''}`);
  sec('Legal and standards duties', pkg.obligations, (o) => `**${o.key}** (${o.instrument || o.kind}): ${o.obligation_text || ''}`);
  sec('Constraints', pkg.constraints, (k) => `**${k.key}**: ${k.statement}`);
  sec('Other systems it talks to', pkg.interfaces, (i) => `**${i.key}**: ${i.name}${i.provider ? ` (${i.provider})` : ''}`);
  sec('Flow steps', pkg.flow_refs, (f) => `**${f.step}** in ${f.flow || 'a flow'}: ${f.title}`);
  L.push('');
  return L.join('\n');
}

const csvCell = (v) => { const t = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const CSV_COLS = ['story_key', 'title', 'product', 'priority', 'persona', 'estimate', 'module', 'acceptance_checks', 'package_version', 'state', 'received_at', 'folder'];

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeAtomic(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.tmp'; fs.writeFileSync(t, text); fs.renameSync(t, file); }

/** File a package. Returns a receipt: { receipt_id, status: 'accepted' | 'duplicate' | 'rejected', errors, warnings, folder }. */
function receive(pkg, { dir, now }: any = {}) {
  if (!dir) throw new Error('receive needs a folder to file the package in');
  const at = now || new Date().toISOString();
  const receiptsFile = path.join(dir, 'receipts.json');
  const receipts = readJson(receiptsFile, {});
  const key = pkg && pkg.package && pkg.package.idempotency_key;
  if (key && receipts[key] && receipts[key].status === 'accepted') return { ...receipts[key], status: 'duplicate', note: 'This exact package was already received. Nothing changed.' };
  const v = check(pkg);
  if (!v.valid) return { receipt_id: null, status: 'rejected', errors: v.errors, warnings: v.warnings };

  const s = pkg.story; const ver = pkg.package.package_version;
  const folder = path.join(safe(pkg.product.key), `${safe(s.key)}@v${ver}`);
  writeAtomic(path.join(dir, folder, 'package.json'), JSON.stringify(pkg, null, 2));
  writeAtomic(path.join(dir, folder, 'story.md'), storyMarkdown(pkg));

  const backlogFile = path.join(dir, 'backlog.json');
  const backlog = readJson(backlogFile, { rows: [] });
  for (const r of backlog.rows) if (r.story_key === s.key && r.product === pkg.product.key && r.state === 'active') r.state = 'superseded';
  backlog.rows.push({
    story_key: s.key, title: s.title, product: pkg.product.key, priority: s.priority || '', persona: s.persona ? s.persona.name : '', estimate: s.estimate ? `${s.estimate.value} ${s.estimate.unit}` : '',
    module: s.module || '', acceptance_checks: (pkg.acceptance_criteria || []).length, package_version: ver, state: 'active', received_at: at, folder: folder.replace(/\\/g, '/'),
  });
  writeAtomic(backlogFile, JSON.stringify(backlog, null, 2));
  writeAtomic(path.join(dir, 'backlog.csv'), [CSV_COLS.join(','), ...backlog.rows.map((r) => CSV_COLS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');

  const receipt = { receipt_id: `RCPT-${sha(key + at).slice(0, 10)}`, status: 'accepted', story: s.key, package_version: ver, received_at: at, folder: folder.replace(/\\/g, '/'), warnings: v.warnings };
  receipts[key] = receipt;
  writeAtomic(receiptsFile, JSON.stringify(receipts, null, 2));
  return receipt;
}

function backlog(dir) { return readJson(path.join(dir, 'backlog.json'), { rows: [] }); }

export { check, receive, backlog, storyMarkdown, SCHEMA_VERSION };
