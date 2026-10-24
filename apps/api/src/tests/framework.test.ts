/* Lifecycle framework: 13 phases, 70 steps, completion (plain average, no weights). No database needed. Run: ts-node --transpile-only src/tests/framework.test.ts */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import * as framework from '../legacy/engine/framework';
import * as gates from '../legacy/engine/gates';
import * as lifecycle from '../legacy/engine/lifecycle';
import { done, ok } from './helpers';

async function main() {
  const pf: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-fw-')));
  const store = pf.store(pf.list()[0].id);

  await ok('the framework has 13 phases and 70 steps with stable ids', () => {
    const fw = framework.FRAMEWORK;
    assert.equal(fw.phases.length, 13);
    const ids = fw.phases.flatMap((p: any) => p.steps.map((s: any) => s.id));
    assert.equal(ids.length, 70);
    assert.equal(new Set(ids).size, 70);
    assert.ok(ids.includes('P0.1') && ids.includes('P5.3') && ids.includes('P12.5'));
    assert.deepEqual(fw.phases.map((p: any) => p.engine).sort((a: number, b: number) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  await ok('every phase percent is the plain average of its steps, with no weights', () => {
    const r = framework.evaluate(store);
    for (const p of r.phases) {
      const avg = p.steps.reduce((a: number, s: any) => a + s.fraction, 0) / p.steps.length;
      assert.equal(p.percent, Math.round(avg * 100), `phase ${p.n}`);
      assert.ok(p.percent >= 0 && p.percent <= 100);
      for (const s of p.steps) assert.ok(s.weight === undefined && s.tier === undefined && s.share === undefined, 'no weight fields on a step');
      assert.equal(p.weightTotal, undefined);
    }
    assert.equal(r.overall, Math.round(r.phases.reduce((a: number, p: any) => a + p.percent, 0) / r.phases.length));
    assert.equal((r as any).tiers, undefined);
  });

  await ok('a new record raises the percent; a sample or an unreviewed drafted record does not', () => {
    const pct = () => framework.evaluate(store).phases.find((p: any) => p.n === 7).percent;
    const before = pct();
    store.create('FeatureSpec', { title: 'Spec 1', main_flow: 'x', ui_needs: 'x', backend_needs: 'x', business_rules: 'x', testing_requirements: 'x', definition_of_done: ['x'] }, { actor: 'test', origin: 'human' });
    assert.ok(pct() > before, 'a real record counts');
    const mid = pct();
    store.create('FeatureSpec', { title: 'Spec 2', main_flow: 'x' }, { actor: 'test', origin: 'invented' });
    assert.equal(pct(), mid, 'a sample record counts for nothing');
  });

  await ok('the weights controls are gone', () => {
    assert.equal((framework as any).setWeights, undefined);
    assert.equal((framework as any).weights, undefined);
    assert.ok(!JSON.stringify(framework.FRAMEWORK).includes('"tier"'), 'framework data holds no tiers');
  });

  await ok('the detail view carries the framework text and what shows a step is done', () => {
    const p = framework.evaluate(store, { detail: 4 }).phases.find((x: any) => x.engine === 4);
    assert.ok(p.objective && p.exit && p.perspectives.ceo);
    assert.ok(p.steps.every((s: any) => s.what && s.evidence.length > 0));
    assert.equal(framework.evaluate(store).phases.find((x: any) => x.engine === 4).steps[0].what, undefined, 'summary has no long text');
  });

  await ok('the lifecycle overview carries the percent of every phase', () => {
    const o = lifecycle.overview(store, gates);
    assert.equal(o.phases.length, 13);
    for (const p of o.phases) assert.ok(typeof p.percent === 'number' && p.stepsTotal > 0 && p.title);
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
