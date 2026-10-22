/**
 * engine/accounts.ts - sign-in for the company server: people, passwords, sessions.
 *
 *  - Passwords are stored only as scrypt hashes with a random salt. Nobody, including an administrator, can read one.
 *  - A session is a random 192-bit token. Only its SHA-256 is stored, so a copy of the data folder does not hold working sessions.
 *  - Sign-in is limited: 8 wrong passwords for one email from one address in 10 minutes locks it for the rest of that window.
 *  - Login is OFF by default (one computer, one person). It is ON when SD_REQUIRE_LOGIN=1 is set or an administrator turned it on.
 *    With it on, the person who is signed in is the "actor" of every change; the browser cannot claim another name.
 *  - Honest limit: this is local accounts over plain HTTP unless the company puts HTTPS in front. Passwords and the session cookie
 *    cross the network in clear on plain HTTP. Use it on a trusted office network, or put an HTTPS proxy in front.
 *  - Not built: Microsoft sign-in. It needs an app registration in the company's Microsoft tenant (a client id and tenant id), which
 *    only the company can create.
 * Data: <data folder>/accounts.json (kept in memory only when there is no data folder, as in tests).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SESSION_HOURS = 12;
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const MIN_PASSWORD = 10;
const ROLES = ['admin', 'member'];

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hashPassword = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
const safeEq = (a, b) => { const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cleanEmail = (e) => String(e || '').trim().toLowerCase();

class Accounts {
  file: any;
  data: any;
  fails: any;
  constructor(root) {
    this.file = root ? path.join(root, 'accounts.json') : null;
    this.data = { required: false, users: [], sessions: {} };
    this.fails = new Map();
    if (this.file && fs.existsSync(this.file)) { try { this.data = { required: false, users: [], sessions: {}, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch (e) { /* start empty */ } }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  required() { return process.env.SD_REQUIRE_LOGIN === '1' || !!this.data.required; }
  setRequired(on) { this.data.required = !!on; this.save(); }
  needsSetup() { return this.required() && !this.data.users.some((u) => !u.disabled); }
  brief(u) { return u ? { id: u.id, name: u.name, email: u.email, role: u.role, disabled: !!u.disabled, created_at: u.created_at } : null; }

  validate({ name, email, password, role }, opts: any = {}) {
    const n = String(name || '').trim();
    const e = cleanEmail(email);
    if (!n) throw httpErr(422, 'Type the person\'s name. It is the name shown on everything they change.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw httpErr(422, 'Type a working email address. It is the sign-in name.');
    if (!opts.keepPassword) this.checkPassword(password);
    if (role && !ROLES.includes(role)) throw httpErr(422, `The role must be one of: ${ROLES.join(', ')}.`);
    return { n, e };
  }
  checkPassword(pw) {
    if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw httpErr(422, `The password must have at least ${MIN_PASSWORD} characters.`);
    if (/^(.)\1+$/.test(pw) || /^(password|1234567890|qwertyuiop)/i.test(pw)) throw httpErr(422, 'That password is too easy to guess. Choose another.');
  }

  /** The very first account: allowed only while login is required and nobody exists. It becomes the administrator. */
  setup(f) {
    if (!this.needsSetup()) throw httpErr(409, 'Setup is already done. Sign in instead.');
    return this._add(f, 'admin');
  }
  /** An administrator adds a person. */
  addUser(f) { return this._add(f, f.role || 'member'); }
  _add(f, role) {
    const { n, e } = this.validate({ ...f, role });
    if (this.data.users.some((u) => u.email === e)) throw httpErr(409, 'Someone with that email already has an account.');
    if (this.data.users.some((u) => !u.disabled && u.name.toLowerCase() === n.toLowerCase())) throw httpErr(409, 'Someone with that name already has an account. Names must differ, because the name is what approvals are recorded under.');
    const salt = crypto.randomBytes(16).toString('hex');
    const id = `U-${String(this.data.users.length + 1).padStart(3, '0')}`;
    const u = { id, name: n, email: e, role, salt, hash: hashPassword(f.password, salt), created_at: new Date().toISOString(), disabled: false };
    this.data.users.push(u); this.save();
    return this.brief(u);
  }

  login(email, password, ip) {
    const e = cleanEmail(email);
    const key = `${e}|${ip || ''}`;
    const now = Date.now();
    const f = this.fails.get(key);
    if (f && now - f.first < WINDOW_MS && f.count >= MAX_FAILS) throw httpErr(429, 'Too many wrong passwords. Wait ten minutes and try again.', { code: 'locked' });
    const u = this.data.users.find((x) => x.email === e && !x.disabled);
    const ok = u && safeEq(hashPassword(String(password || ''), u.salt), u.hash);
    if (!ok) {
      const cur = f && now - f.first < WINDOW_MS ? f : { first: now, count: 0 };
      cur.count += 1; this.fails.set(key, cur);
      throw httpErr(401, 'That email and password do not match. Check both and try again.', { code: 'bad_login' });
    }
    this.fails.delete(key);
    const token = crypto.randomBytes(24).toString('hex');
    this.data.sessions[sha(token)] = { user: u.id, expires: now + SESSION_HOURS * 3600 * 1000 };
    this.prune(); this.save();
    return { token, user: this.brief(u), max_age: SESSION_HOURS * 3600 };
  }
  prune() { const now = Date.now(); for (const [k, s] of Object.entries(this.data.sessions)) if ((s as any).expires < now) delete this.data.sessions[k]; }
  session(token) {
    if (!token) return null;
    const s = this.data.sessions[sha(token)];
    if (!s || s.expires < Date.now()) return null;
    const u = this.data.users.find((x) => x.id === s.user && !x.disabled);
    return u ? this.brief(u) : null;
  }
  logout(token) { if (token) { delete this.data.sessions[sha(token)]; this.save(); } }
  dropSessionsOf(userId) { for (const [k, s] of Object.entries(this.data.sessions)) if ((s as any).user === userId) delete this.data.sessions[k]; }

  list() { return this.data.users.map((u) => this.brief(u)); }
  /** Own password: the old one is required. An administrator resetting someone else's: no old password, and that person is signed out. */
  setPassword(actor, userId, { old_password, new_password }) {
    const u = this.data.users.find((x) => x.id === userId);
    if (!u) throw httpErr(404, 'No such person.');
    const self = actor.id === u.id;
    if (!self && actor.role !== 'admin') throw httpErr(403, 'Only an administrator can change someone else\'s password.');
    if (self && !safeEq(hashPassword(String(old_password || ''), u.salt), u.hash)) throw httpErr(401, 'The current password is not right.');
    this.checkPassword(new_password);
    u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hashPassword(new_password, u.salt);
    this.dropSessionsOf(u.id); this.save();
    return { ok: true, signed_out: true };
  }
  setDisabled(actor, userId, disabled) {
    if (actor.role !== 'admin') throw httpErr(403, 'Only an administrator can do that.');
    const u = this.data.users.find((x) => x.id === userId);
    if (!u) throw httpErr(404, 'No such person.');
    if (disabled && u.role === 'admin' && this.data.users.filter((x) => x.role === 'admin' && !x.disabled && x.id !== u.id).length === 0) throw httpErr(409, 'This is the last administrator. Add another administrator first.');
    u.disabled = !!disabled; if (disabled) this.dropSessionsOf(u.id); this.save();
    return this.brief(u);
  }
  setRole(actor, userId, role) {
    if (actor.role !== 'admin') throw httpErr(403, 'Only an administrator can do that.');
    if (!ROLES.includes(role)) throw httpErr(422, `The role must be one of: ${ROLES.join(', ')}.`);
    const u = this.data.users.find((x) => x.id === userId);
    if (!u) throw httpErr(404, 'No such person.');
    if (u.role === 'admin' && role !== 'admin' && this.data.users.filter((x) => x.role === 'admin' && !x.disabled && x.id !== u.id).length === 0) throw httpErr(409, 'This is the last administrator. Add another administrator first.');
    u.role = role; this.save();
    return this.brief(u);
  }
}

export { Accounts, MIN_PASSWORD, SESSION_HOURS, MAX_FAILS };
