/**
 * db/repository.ts - reads and writes the real tables with plain SQL (node-postgres). No JSON anywhere.
 *
 * Writing is a diff: the repository remembers what it last read or wrote (one JSON string per row, in memory) and only
 * sends the rows that changed, in one transaction. Reading is set-based: one query per table, not per product.
 */
import { Pool, PoolClient, types } from 'pg';
import { ALL_TABLES, CORE_TABLES, TABLE_BY_NAME } from './tables';
import { Row, TableSet, fromKv, keyOf, productToRows, put, rowsOf, rowsToProduct, toKv, ProductBundle } from './mapper';
import { ColSpec, TableSpec, q } from './spec';

/** rows as last read from / written to the database: table -> rowKey -> JSON text */
export type Snapshot = Map<string, Map<string, string>>;
export interface SystemEvent { action: string; subject?: string | null; actor?: string | null; summary: string; at?: string }
export async function logSystemEvent(db: { query: (sql: string, params?: any[]) => Promise<any> }, e: SystemEvent) {
  await db.query('INSERT INTO system_audit_log (at, action, subject, actor, summary) VALUES ($1,$2,$3,$4,$5)', [e.at || new Date().toISOString(), e.action, e.subject ?? null, e.actor ?? null, e.summary]);
}

/** For operator commands: never lets a logging problem stop the command itself. */
export async function logOperator(db: { query: (sql: string, params?: any[]) => Promise<any> }, action: string, summary: string, subject?: string) {
  const who = process.env.USER || process.env.USERNAME || 'operator';
  try { await logSystemEvent(db, { action, subject: subject ?? null, actor: `operator ${who}`, summary }); }
  catch (e: any) { console.error(`(could not write the audit record: ${e.message})`); }
}

/**
 * Columns the code expects that a table does not have yet. Only a plain nullable column can be added safely on start-up;
 * anything else (a required column, a counter) is returned under `blocked` so a person looks at it.
 */
export function missingColumns(specs: TableSpec[], existing: Map<string, Set<string>>): { add: { table: string; col: ColSpec }[]; blocked: string[] } {
  const add: { table: string; col: ColSpec }[] = []; const blocked: string[] = [];
  for (const t of specs) {
    const have = existing.get(t.table);
    if (!have) { blocked.push(`table ${t.table}`); continue; }
    for (const col of t.cols) {
      if (have.has(col.name)) continue;
      if (col.notNull || col.serial) blocked.push(`${t.table}.${col.name}`); else add.push({ table: t.table, col });
    }
  }
  return { add, blocked };
}

export interface ProductState { snapshot: Snapshot; auditCount: number }

const REGISTRY_TABLES = ['portfolio', 'portfolio_counters', 'portfolio_settings', 'portfolio_extra_fields', 'ideas', 'feedback_notes', 'members', 'ai_usage_log'];
const MEMBERS_SQL = `CREATE TABLE IF NOT EXISTS "members" (
    "id" TEXT NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "email" TEXT, "role" TEXT NOT NULL, "scope" TEXT NOT NULL,
    "product_id" TEXT, "product_name" TEXT, "phase" INTEGER, "added_by" TEXT, "added_at" TEXT,
    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "members_product_idx" ON "members"("product_id");`;
export { MEMBERS_SQL };
const PRODUCT_TABLES = ALL_TABLES.filter((t) => !REGISTRY_TABLES.includes(t.table) && t.table !== 'audit_log' && t.table !== 'audit_details' && t.table !== 'system_audit_log');

/** Scripts (seed, import, tests) run outside Nest, so read apps/api/.env themselves when DATABASE_URL is not set. */
function loadDotEnv() {
  if (process.env.DATABASE_URL) return;
  try { (process as any).loadEnvFile(); } catch { /* no .env file in this folder */ }
}

export function makePool(connectionString?: string, max = Number(process.env.DB_POOL_MAX || 10)) {
  loadDotEnv();
  connectionString = connectionString || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set. Put it in apps/api/.env (see .env.example).');
  return new Pool({
    connectionString, max,
    // DATE comes back as the text 'YYYY-MM-DD' (not a JS Date at local midnight); BIGINT as a number
    types: { getTypeParser: ((oid: number, fmt?: any) => (oid === 1082 ? (v: string) => v : oid === 20 ? (v: string) => Number(v) : types.getTypeParser(oid, fmt))) as any },
  });
}

/**
 * The column that ties a row to one product: the products table is keyed by its own `id`, every other product table by `product_id`.
 * (Looking only for `product_id` once made "load one product" return every product, so a reload put the wrong one in memory.)
 */
export function productKey(spec: TableSpec): string | null {
  if (spec.table === 'products') return 'id';
  return spec.cols.some((c) => c.name === 'product_id') ? 'product_id' : null;
}

function readRow(spec: TableSpec, r: Row): Row {
  const out: Row = {};
  for (const c of spec.cols) {
    const v = r[c.name];
    out[c.name] = c.type === 'TIMESTAMPTZ(3)' && v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

const PG_ARRAY: Record<string, string> = { TEXT: 'text[]', INTEGER: 'int[]', BIGINT: 'bigint[]' };
const colOf = (spec: TableSpec, name: string): ColSpec => spec.cols.find((c) => c.name === name)!;

export class Repository {
  constructor(readonly pool: Pool) {}

  async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await fn(c);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch { /* connection already gone */ }
      throw e;
    } finally { c.release(); }
  }

  /** Append an event that belongs to no single product (idea decisions, exports, backups ...). `db` is a pool or a transaction client. */
  async logSystem(db: { query: (sql: string, params?: any[]) => Promise<any> }, e: SystemEvent) { await logSystemEvent(db, e); }

  async ping() { await this.pool.query('SELECT 1'); }
  /** Tables added after the first install are created here when missing (never changes or drops anything), so an update does not need a manual step before the API can start. */
  async ensureTables() {
    await this.pool.query(MEMBERS_SQL);
  }
  /**
   * The code and the database must agree on every column. A column the code writes but the table lacks made every save of that
   * kind fail ("column does not exist"). Missing nullable columns are added here (nothing is changed or dropped); anything
   * else stops start-up with a clear message, instead of failing later on somebody's save.
   * Returns the columns it added.
   */
  async ensureColumns(): Promise<string[]> {
    const r = await this.pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    const existing = new Map<string, Set<string>>();
    for (const x of r.rows) (existing.get(x.table_name) || existing.set(x.table_name, new Set()).get(x.table_name)!).add(x.column_name);
    const { add, blocked } = missingColumns(ALL_TABLES, existing);
    if (blocked.length) throw new Error(`The database does not match this version of the program: ${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} missing. Run \`npm run db:apply\` in apps/api and start again.`);
    for (const { table: t, col } of add) await this.pool.query(`ALTER TABLE ${q(t)} ADD COLUMN IF NOT EXISTS ${q(col.name)} ${col.type}`);
    return add.map((a) => `${a.table}.${a.col.name}`);
  }
  async close() { await this.pool.end(); }

  /** Is the real schema installed (migration 0002 applied)? */
  async schemaReady(): Promise<boolean> {
    const r = await this.pool.query("SELECT (to_regclass('public.products') IS NOT NULL AND to_regclass('public.system_audit_log') IS NOT NULL) AS ok");
    return !!r.rows[0].ok;
  }
  async productCount(): Promise<number> {
    const r = await this.pool.query('SELECT count(*)::int AS n FROM products');
    return r.rows[0].n;
  }

  // ------------------------------------------------------------ reading
  private async selectAll(spec: TableSpec, productId?: string): Promise<Row[]> {
    const order = spec.pk.map(q).join(',');
    const key = productId ? productKey(spec) : null;
    const r = productId && key
      ? await this.pool.query(`SELECT * FROM ${q(spec.table)} WHERE ${q(key)} = $1 ORDER BY ${order}`, [productId])
      : await this.pool.query(`SELECT * FROM ${q(spec.table)} ORDER BY ${order}`);
    return r.rows.map((x) => readRow(spec, x));
  }

  /** Every product (or just one) as engine data, plus the bookkeeping needed to write only differences later. */
  async loadProducts(only?: string): Promise<{ bundle: ProductBundle; state: ProductState; position: number }[]> {
    const per = new Map<string, TableSet>();
    for (const spec of PRODUCT_TABLES) {
      for (const row of await this.selectAll(spec, only)) {
        const pid = spec.table === 'products' ? row.id : row.product_id;
        if (only && pid !== only) continue; // a request for one product never returns another
        let set = per.get(pid);
        if (!set) per.set(pid, (set = new Map()));
        put(set, spec.table, row);
      }
    }
    const auditSpec = TABLE_BY_NAME.get('audit_log')!;
    const auditRows = only
      ? (await this.pool.query('SELECT * FROM audit_log WHERE product_id = $1 ORDER BY seq', [only])).rows
      : (await this.pool.query('SELECT * FROM audit_log ORDER BY seq')).rows;
    const detailRows = only
      ? (await this.pool.query('SELECT d.* FROM audit_details d JOIN audit_log a ON a.seq = d.seq WHERE a.product_id = $1', [only])).rows
      : (await this.pool.query('SELECT * FROM audit_details')).rows;
    const detailsBySeq = new Map<number, Row[]>();
    for (const d of detailRows) (detailsBySeq.get(d.seq) || detailsBySeq.set(d.seq, []).get(d.seq)!).push(d);
    const auditBy = new Map<string, { row: Row; details: Row[] }[]>();
    for (const a of auditRows) {
      const row = readRow(auditSpec, a);
      (auditBy.get(row.product_id) || auditBy.set(row.product_id, []).get(row.product_id)!).push({ row, details: detailsBySeq.get(row.seq) || [] });
    }
    const out = [];
    for (const [id, set] of per) {
      if (!rowsOf(set, 'products').length) continue; // rows without their product (a half-deleted product) are not a product
      const audit = auditBy.get(id) || [];
      const bundle = rowsToProduct(set, audit);
      out.push({ bundle, state: { snapshot: snapshotOf(set), auditCount: audit.length }, position: rowsOf(set, 'products')[0].position });
    }
    return out.sort((a, b) => a.position - b.position);
  }

  async loadRegistry(): Promise<{ reg: Row; snapshot: Snapshot }> {
    const set: TableSet = new Map();
    for (const t of REGISTRY_TABLES) for (const row of await this.selectAll(TABLE_BY_NAME.get(t)!)) put(set, t, row);
    return { reg: rowsToRegistry(set), snapshot: snapshotOf(set) };
  }

  // ------------------------------------------------------------ writing
  /** Write what changed in one product. Returns the new bookkeeping; nothing changes in memory if this throws. */
  async saveProduct(c: PoolClient, position: number, bundle: ProductBundle, prev?: ProductState): Promise<ProductState> {
    const { rows, audit } = productToRows(position, bundle);
    await applyDiff(c, PRODUCT_TABLES, prev?.snapshot, rows);
    const done = prev?.auditCount ?? 0;
    // auditTotal counts every entry ever made; the list in memory may have been cut, so take the newest (total - done) of it
    const total = bundle.auditTotal;
    const fresh = total === undefined ? audit.slice(done) : total > done ? audit.slice(Math.max(0, audit.length - (total - done))) : [];
    if (fresh.length) await insertAudit(c, fresh);
    return { snapshot: snapshotOf(rows), auditCount: total === undefined ? audit.length : total };
  }

  async saveRegistry(c: PoolClient, reg: Row, prev?: Snapshot): Promise<Snapshot> {
    const set = registryToRows(reg);
    await applyDiff(c, REGISTRY_TABLES.map((t) => TABLE_BY_NAME.get(t)!), prev, set);
    return snapshotOf(set);
  }

  /** Remove everything (used by the seed with --force). */
  async wipe(c: PoolClient) {
    await c.query(`TRUNCATE ${REGISTRY_TABLES.map(q).join(', ')}, "products" RESTART IDENTITY CASCADE`);
  }
}

// ---------------------------------------------------------------- registry (portfolio-wide) rows
const REG_KNOWN = new Set(['version', 'asOf', 'counters', 'settings', 'usage', 'products', 'ideas', 'feedback', 'members']);
const IDEA_KNOWN = new Set(['id', 'one_liner', 'text', 'requester', 'created_on', 'kind', 'status', 'product_id', 'origin']);
const NOTE_KNOWN = new Set(['id', 'text', 'categories', 'route', 'product', 'product_name', 'actor', 'at', 'width', 'words', 'done', 'done_at', 'done_by']);
const MEMBER_KNOWN = new Set(['id', 'name', 'email', 'role', 'scope', 'product_id', 'product_name', 'phase', 'added_by', 'added_at']);
const USAGE_KNOWN = new Set(['date', 'at', 'file', 'attachment', 'product', 'goal', 'by', 'status', 'estimated_tokens_in', 'estimated_tokens_out', 'estimated_cost_inr', 'actual_tokens_in', 'actual_tokens_out', 'actual_cost_inr', 'note']);
const nn = (v: any) => (v === undefined ? null : v);

export function registryToRows(reg: Row): TableSet {
  const set: TableSet = new Map();
  put(set, 'portfolio', { id: 1, version: reg.version ?? 1, as_of: nn(reg.asOf), usage_cap_inr: nn(reg.usage?.cap_inr) });
  for (const [name, value] of Object.entries<any>(reg.counters || {})) put(set, 'portfolio_counters', { name, value });
  for (const [k, v] of Object.entries<any>(reg.settings || {})) if (v !== undefined) put(set, 'portfolio_settings', toKv(k, v, 'settings'));
  for (const [k, v] of Object.entries<any>(reg)) if (!REG_KNOWN.has(k) && v !== undefined) put(set, 'portfolio_extra_fields', toKv(k, v, 'portfolio'));
  (reg.ideas || []).forEach((i: Row, position: number) => {
    const bad = Object.keys(i).filter((k) => !IDEA_KNOWN.has(k));
    if (bad.length) throw new Error(`idea ${i.id}: no column for field(s) ${bad.join(', ')} - add them to src/db/tables.ts`);
    put(set, 'ideas', { id: i.id, position, one_liner: i.one_liner ?? '', text: nn(i.text), requester: nn(i.requester), created_on: nn(i.created_on), kind: nn(i.kind), status: i.status ?? 'new', product_id: nn(i.product_id), origin: nn(i.origin) });
  });
  (reg.feedback || []).forEach((n: Row, position: number) => {
    const bad = Object.keys(n).filter((k) => !NOTE_KNOWN.has(k));
    if (bad.length) throw new Error(`feedback note ${n.id}: no column for field(s) ${bad.join(', ')} - add them to src/db/tables.ts`);
    put(set, 'feedback_notes', { id: n.id, position, text: n.text ?? '', categories: n.categories ?? [], route: nn(n.route), product: nn(n.product), product_name: nn(n.product_name), actor: nn(n.actor), at: nn(n.at), width: nn(n.width), words: nn(n.words), done: !!n.done, done_at: nn(n.done_at), done_by: nn(n.done_by) });
  });
  (reg.members || []).forEach((m: Row, position: number) => {
    const bad = Object.keys(m).filter((k) => !MEMBER_KNOWN.has(k));
    if (bad.length) throw new Error(`member ${m.id}: no column for field(s) ${bad.join(', ')} - add them to src/db/tables.ts`);
    put(set, 'members', { id: m.id, position, name: m.name ?? '', email: nn(m.email), role: m.role ?? 'Contributor', scope: m.scope ?? 'platform', product_id: nn(m.product_id), product_name: nn(m.product_name), phase: nn(m.phase), added_by: nn(m.added_by), added_at: nn(m.added_at) });
  });
  (reg.usage?.log || []).forEach((u: Row, position: number) => {
    const bad = Object.keys(u).filter((k) => !USAGE_KNOWN.has(k) && u[k] !== undefined);
    if (bad.length) throw new Error(`assistant usage entry: no column for field(s) ${bad.join(', ')}`);
    put(set, 'ai_usage_log', { position, ...Object.fromEntries([...USAGE_KNOWN].map((k) => [k, nn(u[k])])) });
  });
  return set;
}

export function rowsToRegistry(set: TableSet): Row {
  const p = rowsOf(set, 'portfolio')[0];
  const reg: Row = { version: p ? p.version : 1, asOf: p ? p.as_of : null, counters: Object.fromEntries(rowsOf(set, 'portfolio_counters').map((r) => [r.name, r.value])) };
  const settings = rowsOf(set, 'portfolio_settings');
  if (settings.length) reg.settings = Object.fromEntries(settings.map((r) => [r.key, fromKv(r)]));
  for (const r of rowsOf(set, 'portfolio_extra_fields')) reg[r.key] = fromKv(r);
  const log = rowsOf(set, 'ai_usage_log').sort((a, b) => a.position - b.position).map((r) => {
    const { position, ...rest } = r;
    return Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== null || k === 'product' || k === 'by' || k.startsWith('actual_')));
  });
  if (log.length || (p && p.usage_cap_inr !== null)) reg.usage = { log, cap_inr: p ? p.usage_cap_inr : null };
  reg.ideas = rowsOf(set, 'ideas').sort((a, b) => a.position - b.position).map((r) => {
    const { position, ...rest } = r;
    return rest;
  });
  reg.feedback = rowsOf(set, 'feedback_notes').sort((a, b) => a.position - b.position).map((r) => {
    const { position, ...rest } = r;
    return { ...rest, categories: rest.categories ?? [] };
  });
  reg.members = rowsOf(set, 'members').sort((a, b) => a.position - b.position).map((r) => {
    const { position, ...rest } = r;
    return rest;
  });
  return reg;
}

// ---------------------------------------------------------------- diff + SQL
function snapshotOf(set: TableSet): Snapshot {
  const out: Snapshot = new Map();
  for (const [t, rows] of set) out.set(t, new Map([...rows].map(([k, r]) => [k, JSON.stringify(r)])));
  return out;
}

async function applyDiff(c: PoolClient, tables: TableSpec[], prev: Snapshot | undefined, next: TableSet) {
  // deletes first, children before parents
  for (const spec of [...tables].reverse()) {
    const before = prev?.get(spec.table);
    if (!before) continue;
    const now = next.get(spec.table);
    const gone = [...before].filter(([k]) => !now?.has(k)).map(([, json]) => JSON.parse(json));
    if (gone.length) await deleteRows(c, spec, gone);
  }
  // then inserts and updates, parents before children
  for (const spec of tables) {
    const now = next.get(spec.table);
    if (!now) continue;
    const before = prev?.get(spec.table);
    const changed: Row[] = [];
    for (const [k, row] of now) if (before?.get(k) !== JSON.stringify(row)) changed.push(row);
    if (changed.length) await upsertRows(c, spec, changed);
  }
}

async function upsertRows(c: PoolClient, spec: TableSpec, rows: Row[]) {
  const cols = spec.cols.filter((x) => !x.serial);
  const per = Math.max(1, Math.floor(30000 / cols.length));
  const updates = cols.filter((x) => !spec.pk.includes(x.name)).map((x) => `${q(x.name)} = EXCLUDED.${q(x.name)}`);
  const conflict = updates.length ? `DO UPDATE SET ${updates.join(', ')}` : 'DO NOTHING';
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: any[] = [];
    const values = chunk.map((r) => `(${cols.map((x) => { params.push(r[x.name] === undefined ? null : r[x.name]); return `$${params.length}`; }).join(',')})`);
    await c.query(`INSERT INTO ${q(spec.table)} (${cols.map((x) => q(x.name)).join(',')}) VALUES ${values.join(',')} ON CONFLICT (${spec.pk.map(q).join(',')}) ${conflict}`, params);
  }
}

async function deleteRows(c: PoolClient, spec: TableSpec, rows: Row[]) {
  const arrays = spec.pk.map((name) => rows.map((r) => r[name]));
  const types_ = spec.pk.map((name) => PG_ARRAY[colOf(spec, name).type]);
  const unnest = types_.map((t, i) => `$${i + 1}::${t}`).join(', ');
  const alias = spec.pk.map((_, i) => `k${i}`).join(', ');
  const where = spec.pk.map((name, i) => `t.${q(name)} = d.k${i}`).join(' AND ');
  await c.query(`DELETE FROM ${q(spec.table)} t USING unnest(${unnest}) AS d(${alias}) WHERE ${where}`, arrays);
}

async function insertAudit(c: PoolClient, entries: Row[]) {
  const per = 2000;
  for (let i = 0; i < entries.length; i += per) {
    const chunk = entries.slice(i, i + per);
    const params: any[] = [];
    const values = chunk.map((a) => `(${[a.product_id, a.at, a.action, a.subject, a.actor, a.summary].map((v) => { params.push(v === undefined ? null : v); return `$${params.length}`; }).join(',')})`);
    const res = await c.query(`INSERT INTO audit_log (product_id, at, action, subject, actor, summary) VALUES ${values.join(',')} RETURNING seq`, params);
    const seqs: number[] = res.rows.map((r) => Number(r.seq));
    const details: Row[] = [];
    chunk.forEach((a, n) => { for (const [k, v] of Object.entries<any>(a.details || {})) if (v !== undefined) details.push({ seq: seqs[n], ...toKv(k, v, 'audit details') }); });
    if (details.length) await upsertRows(c, TABLE_BY_NAME.get('audit_details')!, details);
  }
}

export { CORE_TABLES, keyOf };
