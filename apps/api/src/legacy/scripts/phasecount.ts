import { SEEDS } from '../scripts/seed_portfolio';
import * as schema from '../engine/schema';
const T: any = (schema as any).TYPES || (schema as any).default?.TYPES;
const only = process.argv[2];
for (const k of Object.keys(SEEDS)) {
  if (only && only !== k) continue;
  try {
    const S = (SEEDS as any)[k]();
    const c: Record<string, number> = {};
    for (const it of S.all()) { const ph = String(T[it.type]?.phase); c[ph] = (c[ph] || 0) + 1; }
    const row = ['0','1','2','3','4','5','6','7','8','9','10','11','12','X'].map((p) => `${p}:${c[p] || 0}`).join(' ');
    console.log(k.padEnd(10), row);
  } catch (e: any) { console.log(k.padEnd(10), 'ERROR', String(e.message).slice(0, 300)); }
}
