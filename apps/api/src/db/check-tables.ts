import { ALL_TABLES, TYPE_TABLES, CORE_TABLES } from './tables';
import { TYPES } from '../legacy/engine/schema';
// conflicts: same field name with a different kind across a type's fields
for (const [t, d] of Object.entries<any>(TYPES)) {
  const seen = new Map<string, string>();
  for (const f of d.fields) { const k = f.kind + (f.integer ? 'i' : ''); if (seen.has(f.name) && seen.get(f.name) !== k) console.log('CONFLICT', t, f.name, seen.get(f.name), k); seen.set(f.name, k); }
}
console.log('tables', ALL_TABLES.length, 'core', CORE_TABLES.length, 'types', TYPE_TABLES.length);
const names = new Set<string>();
for (const t of ALL_TABLES) { if (names.has(t.table)) console.log('DUP', t.table); names.add(t.table); if (t.table.length > 63) console.log('LONG', t.table); }
