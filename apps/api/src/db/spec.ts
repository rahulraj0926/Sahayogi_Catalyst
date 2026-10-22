/**
 * db/spec.ts - a tiny description language for tables, and the two generators that read it:
 *   toPrismaSchema()  -> prisma/schema.prisma   (the model Prisma Client and `prisma migrate` use)
 *   toSql()           -> prisma/migrations/<n>/migration.sql  (the same tables as plain SQL)
 * Both come from the same TableSpec list (db/tables.ts), so the two can not drift apart and a new item type in
 * engine/schema.ts becomes a new table with one command: `npm run db:generate`.
 */

export type SqlType = 'TEXT' | 'INTEGER' | 'DOUBLE PRECISION' | 'BOOLEAN' | 'DATE' | 'TIMESTAMPTZ(3)' | 'TEXT[]' | 'BIGINT';

export interface ColSpec {
  name: string;
  type: SqlType;
  /** Column is NOT NULL. Arrays are never NOT NULL (an unset list is NULL, an empty list is {}). */
  notNull?: boolean;
  /** BIGSERIAL primary-key style counter. */
  serial?: boolean;
  /** Short note that becomes a comment in the Prisma schema. */
  doc?: string;
}

export interface FkSpec {
  name: string;
  cols: string[];
  refTable: string;
  refCols: string[];
  onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

export interface IndexSpec {
  name: string;
  cols: string[];
  unique?: boolean;
}

export interface TableSpec {
  table: string;
  model: string;
  doc?: string;
  cols: ColSpec[];
  pk: string[];
  fks: FkSpec[];
  indexes: IndexSpec[];
}

export const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

const PRISMA_TYPE: Record<SqlType, { t: string; db?: string }> = {
  TEXT: { t: 'String' },
  INTEGER: { t: 'Int' },
  'DOUBLE PRECISION': { t: 'Float' },
  BOOLEAN: { t: 'Boolean' },
  DATE: { t: 'DateTime', db: '@db.Date' },
  'TIMESTAMPTZ(3)': { t: 'DateTime', db: '@db.Timestamptz(3)' },
  'TEXT[]': { t: 'String[]' },
  BIGINT: { t: 'BigInt' },
};

/** Helper used by the table definitions. */
export function table(table: string, model: string, doc: string, cols: ColSpec[], pk: string[], extra: { fks?: FkSpec[]; indexes?: IndexSpec[] } = {}): TableSpec {
  return { table, model, doc, cols, pk, fks: extra.fks || [], indexes: extra.indexes || [] };
}

export function cascadeFk(childTable: string, cols: string[], refTable: string, refCols: string[], suffix = ''): FkSpec {
  return { name: `${childTable}_${cols.join('_')}${suffix}_fkey`, cols, refTable, refCols, onDelete: 'CASCADE' };
}

// ---------------------------------------------------------------- SQL
export function toSql(specs: TableSpec[]): string {
  const out: string[] = [];
  for (const t of specs) {
    const lines = t.cols.map((c) => {
      if (c.serial) return `    ${q(c.name)} BIGSERIAL NOT NULL`;
      return `    ${q(c.name)} ${c.type}${c.notNull ? ' NOT NULL' : ''}`;
    });
    lines.push(`    CONSTRAINT ${q(t.table + '_pkey')} PRIMARY KEY (${t.pk.map(q).join(',')})`);
    out.push(`-- CreateTable\nCREATE TABLE ${q(t.table)} (\n${lines.join(',\n')}\n);\n`);
  }
  for (const t of specs) {
    for (const ix of t.indexes) out.push(`-- CreateIndex\nCREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${q(ix.name)} ON ${q(t.table)}(${ix.cols.map(q).join(',')});\n`);
  }
  for (const t of specs) {
    for (const fk of t.fks) {
      out.push(`-- AddForeignKey\nALTER TABLE ${q(t.table)} ADD CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.cols.map(q).join(',')}) REFERENCES ${q(fk.refTable)}(${fk.refCols.map(q).join(',')}) ON DELETE ${fk.onDelete} ON UPDATE CASCADE;\n`);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- Prisma
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

export function toPrismaModels(specs: TableSpec[]): string {
  const byTable = new Map(specs.map((s) => [s.table, s]));
  // relation fields live on both sides: the child holds the FK, the parent lists its children
  const parentFields = new Map<string, string[]>();
  const childFields = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) || []), v]);
  for (const t of specs) {
    for (const fk of t.fks) {
      const parent = byTable.get(fk.refTable);
      if (!parent) throw new Error(`${t.table}.${fk.name}: unknown table ${fk.refTable}`);
      const child = camel(fk.name);
      const required = fk.cols.every((c) => t.cols.find((x) => x.name === c)?.notNull);
      push(childFields, t.table,
        `  ${child} ${parent.model}${required ? '' : '?'} @relation("${fk.name}", fields: [${fk.cols.join(', ')}], references: [${fk.refCols.join(', ')}], onDelete: ${fk.onDelete === 'CASCADE' ? 'Cascade' : fk.onDelete === 'SET NULL' ? 'SetNull' : 'Restrict'}, map: "${fk.name}")`);
      push(parentFields, parent.table, `  ${camel(t.table + '_via_' + fk.name)} ${t.model}[] @relation("${fk.name}")`);
    }
  }
  const out: string[] = [];
  for (const t of specs) {
    const lines: string[] = [];
    if (t.doc) lines.push(...t.doc.split('\n').map((l) => `/// ${l}`));
    lines.push(`model ${t.model} {`);
    const single = t.pk.length === 1 ? t.pk[0] : null;
    for (const c of t.cols) {
      const p = PRISMA_TYPE[c.type];
      let type = p.t;
      if (c.type !== 'TEXT[]' && !c.notNull && !c.serial) type += '?';
      const attrs: string[] = [];
      if (single === c.name) attrs.push(`@id(map: "${t.table}_pkey")`);
      if (c.serial) attrs.push('@default(autoincrement())');
      if (p.db) attrs.push(p.db);
      if (c.doc) lines.push(`  /// ${c.doc}`);
      lines.push(`  ${c.name} ${type}${attrs.length ? ' ' + attrs.join(' ') : ''}`);
    }
    for (const l of childFields.get(t.table) || []) lines.push(l);
    for (const l of parentFields.get(t.table) || []) lines.push(l);
    lines.push('');
    if (!single) lines.push(`  @@id([${t.pk.join(', ')}], map: "${t.table}_pkey")`);
    for (const ix of t.indexes) lines.push(`  ${ix.unique ? '@@unique' : '@@index'}([${ix.cols.join(', ')}], map: "${ix.name}")`);
    lines.push(`  @@map("${t.table}")`);
    lines.push('}');
    out.push(lines.join('\n'));
  }
  return out.join('\n\n') + '\n';
}
