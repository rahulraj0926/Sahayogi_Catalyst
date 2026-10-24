/* Competitor import and dashboard. No database needed. Run: ts-node --transpile-only src/tests/competitor-import.test.ts */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { seedPortfolio } from '../legacy/scripts/seed_portfolio';
import { exportPlans, importCompetitors, parseCsv, parseMoney, template } from '../legacy/engine/competitor_import';
import { overview } from '../legacy/engine/competitor_overview';
import { importSample } from '../legacy/engine/competitor_sample';
import { comparePlans, ourPlans, plans as compPlans, setPlanFeature, setOurPlanFeature, addOurFeatures, pickFeatures } from '../legacy/engine/competitor_plans';
import { cellsOf, hasModules, inScope, scopeNames } from '../legacy/engine/competitor_owner';
import * as agent from '../legacy/engine/agent';
import * as selfcheck from '../legacy/engine/selfcheck';
import { done, ok } from './helpers';

async function main() {
  const pf: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp-')));
  const store = pf.store(pf.list()[0].id);
  const before = store.list('Competitor').length;
  const file = (text: string) => Buffer.from(text, 'utf8');

  await ok('csv reading: quotes, commas inside quotes, semicolon files, blank lines', () => {
    assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
    assert.deepEqual(parseCsv('a;b\n1;2\n'), [['a', 'b'], ['1', '2']]);
  });

  await ok('money: symbols, thousands, free, quote', () => {
    assert.deepEqual(parseMoney('₹1,200'), { amount: 1200, currency: 'INR', quote: false, period: null, per_user: false });
    assert.equal(parseMoney('$12/user/month')!.currency, 'USD');
    assert.equal(parseMoney('$12/user/month')!.per_user, true);
    assert.equal(parseMoney('Free')!.amount, 0);
    assert.equal(parseMoney('Contact sales')!.quote, true);
    assert.equal(parseMoney(''), null);
  });

  await ok('the template imports cleanly, and a preview saves nothing', () => {
    const t = template('plans');
    const pre = importCompetitors(store, { filename: t.filename, buffer: file(t.body) }, { commit: false });
    assert.equal(pre.committed, false);
    assert.equal(pre.competitors.created, 2);
    assert.equal(store.list('Competitor').length, before, 'preview must not save');
    assert.ok(pre.plan_rows.some((p) => p.plan === 'Enterprise' && p.terms[0].quote), 'contact sales plan is a quote');
    assert.equal(pre.error_count, 0);
  });

  await ok('commit creates competitors, plans with users, and plan features; running it again adds nothing', () => {
    const t = template('plans');
    const a = importCompetitors(store, { filename: t.filename, buffer: file(t.body) }, { commit: true, actor: 'Test' });
    assert.equal(a.committed, true);
    assert.equal(store.list('Competitor').length, before + 2);
    const zoho = store.list('Competitor').find((c) => c.title === 'Zoho Books');
    assert.equal(zoho.tier, 'T1');
    assert.deepEqual(zoho.scopes, ['Accounting']);
    const std = store.list('PricePoint').filter((p) => p.plan === 'Standard' && p.currency === 'INR');
    assert.equal(std.length, 2, 'monthly and yearly are two terms of one plan');
    assert.equal(std[0].tier_tag, undefined, 'plans carry no level'); assert.equal(std[0].seat_model, 'multi_user'); assert.equal(std[0].max_users, 3);
    const silver = store.list('PricePoint').find((p) => p.plan === 'Silver');
    assert.equal(silver.seat_model, 'single_user'); assert.equal(silver.billing_model, 'one_time'); assert.equal(silver.amount, 22500);
    const ent = store.list('PricePoint').find((p) => p.plan === 'Enterprise');
    assert.equal(ent.price_type, 'quote'); assert.equal(ent.tier_tag, undefined);
    const prices = store.list('PricePoint').length, caps = store.list('Capability').length, ratings = store.list('CompetitorCapability').length;
    const b = importCompetitors(store, { filename: t.filename, buffer: file(t.body) }, { commit: true, actor: 'Test' });
    assert.equal(b.competitors.created, 0); assert.equal(b.prices.created, 0); assert.equal(b.features.plan_links, 0);
    assert.equal(store.list('PricePoint').length, prices); assert.equal(store.list('Capability').length, caps); assert.equal(store.list('CompetitorCapability').length, ratings);
  });

  await ok('tiers side by side, with names matched to what exists', () => {
    const csv = 'Tier 1,Tier 2,Tier 3\nzoho books,Busy,Vyapar\nTally Prime,Marg ERP,\n';
    const r = importCompetitors(store, { filename: 'tiers.csv', buffer: file(csv) }, { commit: true });
    assert.equal(r.competitors.existing, 2); assert.equal(r.competitors.created, 3);
    assert.equal(store.list('Competitor').find((c) => c.title === 'Busy').tier, 'T2');
    assert.equal(store.list('Competitor').find((c) => c.title === 'Vyapar').tier, 'T3');
  });

  await ok('a ticked grid (one row per feature, one column per plan) ticks features on existing plans', () => {
    const csv = 'Competitor,Feature,Silver,Gold\nTally Prime,Multi-currency,,yes\nTally Prime,Accounting,yes,yes\n';
    const r = importCompetitors(store, { filename: 'grid.csv', buffer: file(csv) }, { commit: true });
    assert.ok(r.features.plan_links >= 1, 'Multi-currency is new on Gold; Accounting was already there');
    assert.equal(r.warnings.filter((w) => /level/i.test(w)).length, 0, 'no level warnings any more');
    const gold = store.list('PricePoint').find((p) => p.plan === 'Gold');
    const names = store.out(gold.id, 'includes_capability').map((l) => store.get(l.target).capability_tag);
    assert.ok(names.includes('Multi-currency') && names.includes('Accounting'));
  });

  await ok('rows typed in the dialog take the same road, with no level asked for', () => {
    const r = importCompetitors(store, { rows: [{ Competitor: 'Khatabook', Tier: 'Tier 3', Plan: 'Premium', 'Monthly price': '₹299', Features: 'Invoicing; Reminders' }] }, { commit: true });
    assert.equal(r.plan_rows[0].level, undefined); assert.equal(r.plan_rows[0].level_guessed, undefined);
    assert.ok(!r.warnings.some((w) => /level|guessed/i.test(w)));
  });

  await ok('the dashboard counts analysed competitors, lists common features with their share, and prices the recommendation', () => {
    const o: any = overview(store, { threshold: '60' });
    assert.ok(o.analysed.total >= 5);
    assert.equal(o.tiers.find((t) => t.key === 'T1').competitors.length >= 2, true);
    const inv = o.common.features.find((f) => f.name === 'Invoicing' || /invoic/i.test(f.name));
    assert.ok(inv && inv.pct > 0 && inv.of_total === o.common.competitor_count);
    assert.ok(o.recommended.ladder.length > 0);
    assert.ok(o.recommended.ladder.every((l) => l.price.count === 0 || l.price.avg_yearly_inr >= 0));
  });

  await ok('a scope keeps competitors tagged for it, plus those with no scope', () => {
    assert.equal(inScope({ scopes: ['Accounting'] }, 'accounting'), true);
    assert.equal(inScope({ scopes: ['Accounting'] }, 'Inventory'), false);
    assert.equal(inScope({}, 'Inventory'), true);
    const all: any = overview(store, {}); const acc: any = overview(store, { scope: 'Inventory' });
    assert.ok(acc.analysed.total < all.analysed.total, 'Zoho and Tally are Accounting only');
  });

  await ok('an unreadable file or an empty one gives a plain message', () => {
    assert.throws(() => importCompetitors(store, { filename: 'a.xls', buffer: file('x') }, { commit: false }), /\.xlsx or \.csv/);
    assert.throws(() => importCompetitors(store, { filename: 'a.csv', buffer: file('Foo,Bar\n1,2\n') }, { commit: false }), /no competitor names/);
  });
  // ---- the two files the product team actually has (kept in tests/fixtures)
  const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'fixtures', n));
  const pf2: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp2-')));
  const st2 = pf2.store(pf2.list()[0].id);

  await ok('a Tier 3 module list: title lines skipped, the Tier 3 heading spans blank columns, every module recorded as a scope', () => {
    const r: any = importCompetitors(st2, { filename: 'Modules_rawTier_3.csv', buffer: fx('Modules_rawTier_3.csv') }, { commit: false });
    assert.equal(r.competitors.created, 50);
    const by = new Map<string, any>(r.competitor_names.map((c: any) => [c.name, c]));
    assert.equal(by.get('SAP').tier, 'T3');
    assert.deepEqual(by.get('SAP').scopes, ['Finance & Accounting', 'Inventory', 'Supply Chain & Logistics']);
    assert.equal(by.get('Manhattan Associates').scopes[0], 'Warehouse Management'); // a stray tab in the cell is gone
    assert.equal(by.get('Unicommerce').scopes.length, 2); // same company under two modules is one competitor
    assert.ok(r.warnings.some((w: string) => /Self-Service Portal/.test(w)));
  });

  await ok('a Windows-1252 price list for one company: name from the title, plans with several terms, prices without GST', () => {
    const r: any = importCompetitors(st2, { filename: 'Boss_Pricing_competitorTALLY.csv', buffer: fx('Boss_Pricing_competitorTALLY.csv') }, { commit: false, tier: 'Tier 1' } as any);
    assert.deepEqual(r.competitor_names.map((c: any) => [c.name, c.tier]), [['Tally', 'T1']]);
    const silver = r.plan_rows.find((p: any) => p.plan === 'Silver');
    assert.deepEqual(silver.terms.map((t: any) => [t.period, t.amount]), [['month', 750], ['quarter', 2138], ['year', 8100], ['one_time', 22500]]);
    assert.equal(silver.product, 'TallyPrime'); assert.equal(silver.seat_model, 'single_user'); assert.equal(silver.features, 7);
    const gold = r.plan_rows.find((p: any) => p.plan === 'Gold');
    assert.equal(gold.seat_model, 'unlimited_users'); assert.equal(gold.terms.find((t: any) => t.period === 'year').amount, 24300);
    const pack = r.plan_rows.find((p: any) => p.plan === 'Regular Plus Pack');
    assert.deepEqual([pack.seat_model, pack.max_users, pack.terms[0].period, pack.terms[0].amount], ['per_user', 4, 'month', 450]);
    assert.equal(r.plan_rows.length, 20); assert.equal(r.prices.created, 23);
    assert.ok(r.warnings.some((w: string) => /TallyPrime Server.*billing is not stated/.test(w)), 'a price with no stated billing is not guessed');
    assert.ok(r.warnings.some((w: string) => /100 pages free/.test(w)));
  });

  await ok('committing both files stores the plans and ticks the features on every term of a plan; importing again adds nothing', () => {
    importCompetitors(st2, { filename: 'Boss_Pricing_competitorTALLY.csv', buffer: fx('Boss_Pricing_competitorTALLY.csv') }, { commit: true, competitor: 'Tally' } as any);
    const again: any = importCompetitors(st2, { filename: 'Boss_Pricing_competitorTALLY.csv', buffer: fx('Boss_Pricing_competitorTALLY.csv') }, { commit: false, competitor: 'Tally' } as any);
    assert.equal(again.prices.created, 0); assert.equal(again.competitors.created, 0);
    const tally = st2.list('Competitor', (c) => c.title === 'Tally')[0];
    assert.ok(tally);
    const silverPrices = st2.list('PricePoint', (x) => x.plan === 'Silver' && /Tally/.test(x.title));
    assert.equal(silverPrices.length, 4);
    assert.equal(st2.out(silverPrices[0].id, 'includes_capability').length, 7);
    importCompetitors(st2, { filename: 'Modules_rawTier_3.csv', buffer: fx('Modules_rawTier_3.csv') }, { commit: true });
    assert.equal(st2.list('Competitor', (c) => c.tier === 'T3').length, 50);
  });

  await ok('module by module: each module lists its own competitors by tier, and a Tally price list tagged "Finance and Accounting" lands in "Finance & Accounting"', () => {
    importCompetitors(st2, { filename: 'Boss_Pricing_competitorTALLY.csv', buffer: fx('Boss_Pricing_competitorTALLY.csv') }, { commit: true, competitor: 'Tally', tier: 'Tier 1', scope: 'Finance and Accounting' } as any);
    const o: any = overview(st2, {});
    const fin = o.modules.rows.find((m: any) => /finance/i.test(m.name));
    assert.deepEqual([fin.T1, fin.T3], [1, 4]); // Tally (Tier 1) and SAP, Oracle NetSuite, D365, Workday
    assert.equal(fin.competitors, 5); assert.equal(fin.priced, 1); assert.ok(fin.min_yearly_inr > 0 && fin.min_yearly_inr <= 8100); // Tally's cheapest plan
    const wh = o.modules.rows.find((m: any) => m.name === 'Warehouse Management');
    assert.equal(wh.competitors, 6); assert.equal(wh.priced, 0);
    assert.equal(o.modules.rows.find((m: any) => m.name === 'Self-Service Portal'), undefined); // no competitor, no Module record: nothing to show
    const only: any = overview(st2, { scope: 'finance and accounting' });
    const t3 = only.tiers.find((t: any) => t.key === 'T3').competitors.map((c: any) => c.title);
    assert.ok(t3.includes('SAP') && !t3.includes('Blue Yonder')); // competitors with no module still count everywhere, the other modules' do not
  });

  await ok('the Sahayogi Developer sample workbooks: tiers first, then one company per tier with its own plan names, users and features', () => {
    const pf3: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp3-')));
    const st3 = pf3.store(pf3.list().find((p: any) => p.name === 'Sahayogi Developer').id);
    const dir = path.join(__dirname, '..', '..', '..', '..', 'docs', 'samples');
    const f1 = 'Sahayogi_Developer_1_Competitors_by_Tier.xlsx'; const f2 = 'Sahayogi_Developer_2_Competitor_Prices_One_per_Tier.xlsx';
    const a: any = importCompetitors(st3, { filename: f1, buffer: fs.readFileSync(path.join(dir, f1)) }, { commit: true });
    assert.equal(a.competitors.created, 21); assert.deepEqual(a.warnings, []);
    const b: any = importCompetitors(st3, { filename: f2, buffer: fs.readFileSync(path.join(dir, f2)) }, { commit: true });
    assert.equal(b.competitors.existing, 3); assert.equal(b.plan_rows.length, 17 - 2); // 5 + 5 + 5 plans
    for (const n of ['Roadwise', 'Reqly', 'DocuTrail']) assert.equal(b.plan_rows.filter((p: any) => p.competitor === n).length, 5, n);
    const road = b.plan_rows.find((p: any) => p.competitor === 'Roadwise' && p.plan === 'Growth');
    assert.deepEqual([road.seat_model, road.max_users, road.terms.map((t: any) => t.amount)], ['per_user', 50, [749, 7490]]);
    assert.equal(st3.list('Competitor', (c) => c.title === 'DocuTrail')[0].tier, 'T3');
    // export gives back a file the importer reads without adding anything
    const comp = st3.list('Competitor', (c) => c.title === 'Reqly')[0];
    const out = exportPlans(st3, { id: comp.id });
    assert.match(out.body, /Competitor,Tier,Module,Product,Plan,Licence/); assert.equal(out.filename, 'Reqly-plans.csv');
    const again: any = importCompetitors(st3, { filename: out.filename, buffer: Buffer.from(out.body, 'utf8') }, { commit: false });
    assert.equal(again.prices.created, 0); assert.equal(again.plan_rows.length, 5); assert.ok(again.plan_rows.every((p: any) => p.state === 'already there'));
  });

  await ok('sample competitors fill every band, save once, and the cut-offs and team sizes can be changed', () => {
    const pf5: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp5-')));
    const st5 = pf5.store(pf5.list().find((p: any) => p.name === 'Sahayogi Developer').id);
    const first: any = importSample(st5, { commit: true });
    assert.equal(first.competitors.created, 9);
    const again: any = importSample(st5, { commit: true });
    assert.equal(again.competitors.created, 0); assert.equal(again.prices.created, 0);
    const o: any = overview(st5, {});
    assert.ok(o.common.bands.must >= 2 && o.common.bands.common >= 2 && o.common.bands.niche >= 2, JSON.stringify(o.common.bands));
    assert.deepEqual(o.recommended.by_users.map((x: any) => x.users), [1, 5, 10, 25]);
    const priced = o.recommended.by_users.filter((x: any) => x.avg_yearly_inr);
    assert.ok(priced.length >= 2 && priced[priced.length - 1].avg_yearly_inr > priced[0].avg_yearly_inr); // more users, higher yearly price
    const o2: any = overview(st5, { must: '60', common: '30', compare_users: '2,50' });
    assert.deepEqual([o2.common.cut_offs.must, o2.common.cut_offs.common], [60, 30]);
    assert.deepEqual(o2.recommended.by_users.map((x: any) => x.users), [2, 50]);
    assert.ok(o2.common.bands.must >= o.common.bands.must);
  });

  await ok('our plans can be changed and removed; a company with no free plan is compared by its cheapest paid plan', () => {
    const pf6: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp6-')));
    const st6 = pf6.store(pf6.list().find((p: any) => p.name === 'Sahayogi Developer').id);
    importSample(st6, { commit: true });
    const plan = st6.create('PricingPlan', { title: 'Starter', amount: 0, is_free: true, billing_period: 'monthly' }, { actor: 't' });
    st6.update(plan.id, { title: 'Starter plus', amount: 199, is_free: false }, { actor: 't' });
    assert.equal(ourPlans(st6).plans.find((p: any) => p.id === plan.id).title, 'Starter plus');
    st6.setStatus(plan.id, 'Deprecated', { actor: 't' });
    assert.ok(!ourPlans(st6).plans.some((p: any) => p.id === plan.id));
    // every sample company has a free plan, so price one: it then has no free plan and shows by its cheapest paid plan
    const c = st6.list('Competitor', (x) => x.title === 'NoteStack')[0];
    const free = comparePlans(st6, { position: 'free', fallback: 'cheapest' });
    assert.ok(!free.columns.some((x: any) => x.competitor.title === 'NoteStack' && x.shown_as), 'NoteStack has a free plan, so it is shown by it');
    for (const pp of cellsOf(st6, c).filter((x: any) => x.type === 'PricePoint' && x.plan === 'Starter')) st6.update(pp.id, { amount: 99 }, { actor: 't' });
    const after = comparePlans(st6, { position: 'free', fallback: 'cheapest' });
    assert.equal(after.fallback_used, free.fallback_used + 1);
    assert.ok(after.columns.some((x: any) => x.competitor.title === 'NoteStack' && x.shown_as === 'cheapest'));
    assert.equal(comparePlans(st6, { position: 'free' }).without_plan.some((x: any) => x.title === 'NoteStack'), true); // without the fallback it is only listed as having no free plan
    assert.equal(comparePlans(st6, { position: 'free' }).fallback, null);
  });

  await ok('a product that is a single product has no modules; a suite does; older products follow their competitors', () => {
    const pf4: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp4-')));
    const one = pf4.create({ name: 'Solo Tool', structure: 'single' }, { actor: 't' });
    const suite = pf4.create({ name: 'Big Suite', structure: 'modules' }, { actor: 't' });
    assert.equal(hasModules(pf4.store(one.id)), false); assert.equal(hasModules(pf4.store(suite.id)), true);
    assert.throws(() => pf4.create({ name: 'Bad', structure: 'nope' }, { actor: 't' }), /structure must be/);
    const old = pf4.store(pf4.list().find((p: any) => p.name === 'Sahayogi Developer').id);
    assert.equal(hasModules(old), false);
    importCompetitors(old, { filename: 'm.csv', buffer: file('Competitor,Module\nAcme,CRM\n') }, { commit: true });
    assert.equal(hasModules(old), true);
    assert.deepEqual(scopeNames(pf4.store(one.id)), []);
  });

  await ok('many features at once: our list, our plans, and a competitor plan', () => {
    const pf7: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp7-')));
    const st7 = pf7.store(pf7.list()[0].id);
    importSample(st7, { commit: true });
    // add many features to our list; a repeated name is reused, and a plan can take them all
    const plan = st7.create('PricingPlan', { title: 'Starter', currency: 'INR', billing_period: 'yearly' }, { actor: 't' });
    const r = addOurFeatures(st7, { features: [{ name: 'Zeta alpha one', category: 'Bulk' }, { name: 'zeta alpha one' }, { name: 'Zeta alpha two', category: 'Bulk' }, { name: '  ' }], plan_ids: [plan.id] }, 't');
    assert.deepEqual([r.added, r.existing, r.linked], [2, 1, 2], 'two new features, the repeated name reused, both put into the plan');
    assert.throws(() => addOurFeatures(st7, { features: [] }, 't'), /at least one/);
    assert.throws(() => addOurFeatures(st7, { features: [{ name: 'x' }], plan_ids: ['CMP-001'] }, 't'), /not one of our plans/);
    // untick and tick many on one of our plans in one call
    setOurPlanFeature(st7, { plan_id: plan.id, capability_ids: r.ids, included: false }, 't');
    assert.equal(ourPlans(st7).plans.find((p: any) => p.id === plan.id)!.feature_count, 0);
    setOurPlanFeature(st7, { plan_id: plan.id, capability_ids: r.ids, included: true }, 't');
    assert.equal(ourPlans(st7).plans.find((p: any) => p.id === plan.id)!.feature_count, 2);
    // a competitor plan: tick many features in one call
    const comp = st7.list('Competitor').find((c: any) => compPlans(st7, { competitor: c.id }).plans.length > 0);
    const d: any = compPlans(st7, { competitor: comp.id });
    const caps = d.features.filter((f: any) => f.capability_id).slice(0, 5).map((f: any) => ({ capability_id: f.capability_id }));
    assert.ok(caps.length >= 2, 'the sample competitor has features on our list');
    setPlanFeature(st7, { competitor: comp.id, price_ids: d.plans[0].price_ids, features: caps, included: true }, 't');
    const after: any = compPlans(st7, { competitor: comp.id });
    assert.ok(caps.every((c: any) => after.features.find((f: any) => f.capability_id === c.capability_id).in_plans.includes(d.plans[0].key)), 'every ticked feature is in the plan');
    assert.throws(() => setPlanFeature(st7, { competitor: comp.id, price_ids: d.plans[0].price_ids, features: [{}], included: true }, 't'), /capability_id or a rating_id/);
  });

  await ok('an administrator may check a price they typed themselves, nobody else may', () => {
    const pf8: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp8-')));
    const st8 = pf8.store(pf8.list()[0].id);
    const comp = st8.list('Competitor')[0];
    const mk = () => { const p = st8.create('PricePoint', { title: 'Own price', plan: 'Own', amount: 100, currency: 'INR', unit: 'plan/month', price_type: 'list', billing_model: 'subscription', value_metric: 'seat', tax_basis: 'excl_gst', captured_on: st8.today(), origin: 'human' }, { actor: 'Asha' }); st8.link('contains', comp.id, p.id, {}, { actor: 'Asha' }); return p; };
    const a = mk();
    selfcheck.configure(null);
    assert.throws(() => agent.verify(st8, a.id, 'Asha', 'opened the vendor price page'), /different person/);
    selfcheck.configure((who) => who === 'Asha'); // Asha is an administrator
    assert.ok(agent.verify(st8, a.id, 'Asha', 'opened the vendor price page').includes(a.id), 'an administrator can check their own price');
    const b = mk();
    assert.throws(() => agent.verify(st8, b.id, 'Ravi', 'x'), /3|source note|different person/, 'a note is still needed');
    selfcheck.configure(null);
  });

  await ok('picking features from competitors: same feature once, counted, only what is not ours, filtered', () => {
    const pf9: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp9-')));
    const st9 = pf9.store(pf9.list()[0].id);
    const [c1, c2] = st9.list('Competitor');
    const rate = (c: any, tag: string) => { const r = st9.create('CompetitorCapability', { title: `${c.title}: ${tag}`, capability_tag: tag, level: 'unknown', importance: 3, captured_on: st9.today() }, { actor: 't' }); st9.link('contains', c.id, r.id, {}, { actor: 't' }); return r; };
    const base = pickFeatures(st9, { limit: 500 }).total;
    rate(c1, 'Zeta pick one'); rate(c2, 'zeta  PICK one'); rate(c1, 'Zeta pick two');
    const all: any = pickFeatures(st9, { limit: 500 });
    assert.equal(all.total, base + 2, 'two new features: the two spellings of the first are one row');
    const first = all.features.find((f: any) => /zeta pick one/i.test(f.name));
    assert.equal(first.count, 2, 'both competitors have it');
    assert.equal(all.features[0].count >= all.features[all.features.length - 1].count, true, 'most common first');
    assert.equal(pickFeatures(st9, { q: 'pick two' }).total, 1, 'search by name');
    assert.equal(pickFeatures(st9, { competitor: c2.id, q: 'zeta' }).total, 1, 'only one competitor');
    assert.equal(pickFeatures(st9, { q: 'zeta', limit: 1, offset: 1 }).features.length, 1, 'paging');
    assert.ok((pickFeatures(st9, { q: 'zeta', names_only: '1' }) as any).names.length === 2, 'every matching name');
    assert.equal(pickFeatures(st9, { position: 'free', q: 'zeta' }).total, 0, 'ratings tied to no plan in that position do not show under a position');
    assert.throws(() => pickFeatures(st9, { position: 'gold' }), /position must be one of/);
    // once added to our list under that name, it is no longer offered
    addOurFeatures(st9, { features: [{ name: 'Zeta pick two' }] }, 't');
    assert.equal(pickFeatures(st9, { q: 'pick two' }).total, 0);
  });

  await ok('our plans carry a monthly price, a yearly price and the users they cover; older single prices still show', () => {
    const pf10: any = seedPortfolio(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-cimp10-')));
    const st10 = pf10.store(pf10.list()[0].id);
    const both = st10.create('PricingPlan', { title: 'Team', currency: 'INR', amount: 499, billing_period: 'monthly', price_monthly: 499, price_yearly: 4999, seat_model: 'multi_user', max_users: 3 }, { actor: 't' });
    const old = st10.create('PricingPlan', { title: 'Old yearly', currency: 'INR', amount: 3000, billing_period: 'yearly' }, { actor: 't' });
    const other = st10.create('PricingPlan', { title: 'Old quarterly', currency: 'INR', amount: 900, billing_period: 'quarterly' }, { actor: 't' });
    const list: any[] = ourPlans(st10).plans;
    const t: any = list.find((p) => p.id === both.id);
    assert.deepEqual([t.price_monthly, t.price_yearly, t.seat_model, t.max_users], [499, 4999, 'multi_user', 3]);
    const o: any = list.find((p) => p.id === old.id);
    assert.deepEqual([o.price_monthly, o.price_yearly, o.seat_model, o.max_users], [null, 3000, null, null], 'a plan saved with one yearly price shows it as the yearly price');
    assert.equal(list.find((p) => p.id === other.id).price_monthly, null);
    assert.throws(() => st10.update(both.id, { seat_model: 'a crowd' }, { actor: 't' }), /seat_model|one of/i, 'only the known user kinds are accepted');
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
