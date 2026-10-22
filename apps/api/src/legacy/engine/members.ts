/**
 * engine/members.ts - who is on the team, and how widely.
 * One list per install. Each member: { id, name, email, role, scope, product_id, product_name, phase, added_by, added_at }.
 *   scope "platform" : on the whole platform (every product)      product_id = null, phase = null
 *   scope "project"  : on one whole product                         product_id set,    phase = null
 *   scope "phase"    : on one phase of one product (0 to 12)        product_id set,    phase set
 * The list lives in the portfolio record (portfolio.reg.members), so it is saved with it: to PostgreSQL (table members) in the server.
 * This is a list of names, not a sign-in: it records who was given which part of the work.
 */
const SCOPES = ['platform', 'project', 'phase'];
const ROLES = ['Owner', 'Lead', 'Contributor', 'Reviewer', 'Viewer'];
const LAST_PHASE = 12;
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const clip = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

const membersOf = (portfolio) => { if (!Array.isArray(portfolio.reg.members)) portfolio.reg.members = []; return portfolio.reg.members; };
const nextNumber = (portfolio) => membersOf(portfolio).reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0) + 1;
const same = (a, b) => a.name.toLowerCase() === b.name.toLowerCase() && a.scope === b.scope && (a.product_id || '') === (b.product_id || '') && (a.phase ?? null) === (b.phase ?? null);

/** Add one member. body: { name, email?, role?, scope, product_id?, phase? } */
function add(portfolio, body, actor, now) {
  const name = clip(body.name, 80);
  if (!name) throw httpErr(422, 'Write the person\'s name.');
  const email = clip(body.email, 120).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpErr(422, 'That email address does not look right.');
  const role = ROLES.find((r) => r.toLowerCase() === String(body.role || 'Contributor').toLowerCase());
  if (!role) throw httpErr(422, `The role must be one of: ${ROLES.join(', ')}.`);
  const scope = String(body.scope || '').toLowerCase();
  if (!SCOPES.includes(scope)) throw httpErr(422, 'Say where the person is added: the whole platform, one project, or one phase of a project.');
  let product_id = null, product_name = null, phase = null;
  if (scope !== 'platform') {
    const entry = body.product_id ? portfolio.get(String(body.product_id)) : null;
    if (!entry) throw httpErr(422, 'Choose the project first.');
    product_id = entry.id; product_name = entry.name;
  }
  if (scope === 'phase') {
    phase = Number(body.phase);
    if (!Number.isInteger(phase) || phase < 0 || phase > LAST_PHASE) throw httpErr(422, `Choose a phase from 0 to ${LAST_PHASE}.`);
  }
  const m = { id: `MEM-${String(nextNumber(portfolio)).padStart(3, '0')}`, name, email, role, scope, product_id, product_name, phase, added_by: clip(actor, 80), added_at: now || new Date().toISOString() };
  if (membersOf(portfolio).some((x) => same(x, m))) throw httpErr(409, `${name} is already added there.`);
  membersOf(portfolio).push(m);
  portfolio.saveRegistry();
  return m;
}

/** filter: { project?, scope? } */
function list(portfolio, filter: any = {}) {
  const all = membersOf(portfolio);
  const keep = all.filter((m) => (!filter.project || m.product_id === filter.project) && (!filter.scope || m.scope === filter.scope));
  const counts = { all: all.length, platform: 0, project: 0, phase: 0 };
  for (const m of all) counts[m.scope]++;
  return { members: keep.slice().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), counts, roles: ROLES, scopes: SCOPES, last_phase: LAST_PHASE };
}

function setRole(portfolio, id, role, _actor) {
  const m = membersOf(portfolio).find((x) => x.id === id);
  if (!m) throw httpErr(404, 'No such member.');
  const r = ROLES.find((x) => x.toLowerCase() === String(role || '').toLowerCase());
  if (!r) throw httpErr(422, `The role must be one of: ${ROLES.join(', ')}.`);
  m.role = r;
  portfolio.saveRegistry();
  return m;
}

function remove(portfolio, id) {
  const all = membersOf(portfolio);
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) throw httpErr(404, 'No such member.');
  const [gone] = all.splice(i, 1);
  portfolio.saveRegistry();
  return gone;
}

export { add, list, setRole, remove, ROLES, SCOPES, LAST_PHASE };
