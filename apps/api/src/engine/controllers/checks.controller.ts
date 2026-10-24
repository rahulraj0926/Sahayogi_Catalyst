import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as Q from '../../legacy/engine/query';
import * as gates from '../../legacy/engine/gates';
import * as coverage from '../../legacy/engine/coverage';
import * as requests from '../../legacy/engine/requests';
import * as agent from '../../legacy/engine/agent';
import * as competitors from '../../legacy/engine/competitors';
import * as competitorProfile from '../../legacy/engine/competitor_profile';
import * as competitorPlans from '../../legacy/engine/competitor_plans';
import * as competitorOverview from '../../legacy/engine/competitor_overview';
import * as competitorSample from '../../legacy/engine/competitor_sample';
import * as competitorImport from '../../legacy/engine/competitor_import';
import { file } from '../../legacy/routes/http';
import { readBody } from '../body';
import { hasModules, scopeNames } from '../../legacy/engine/competitor_owner';
import * as handoff from '../../legacy/engine/handoff';
import * as demo from '../../legacy/engine/demo';
import * as approvals from '../../legacy/engine/approvals';
import * as plain from '../../legacy/engine/plain';
import * as formkitMod from '../../legacy/engine/formkit';
import * as un from '../../legacy/engine/units';
import { resetToSeed } from '../../legacy/router';
import { brief } from './lifecycle.controller';
import { DemoGotoDto, HandoffCreateDto, HandoffValidateDto, NaDto, NoteDto } from './dto/lifecycle.dto';

const shortOffenders = (evs: any[]) => evs.map((e) => ({ ...e, results: e.results.map((r: any) => ({ ...r, offenders: r.offenders.slice(0, 8), offenderCount: r.offenders.length })) }));

/** If the caller says which picture of the gate it was looking at (expected_sig) and the checks have changed since, refuse: reload and look again. */
const assertGateUnchanged = (store: any, n: number, body: any) => {
  const said = body && body.expected_sig;
  if (!said) return;
  const now = gates.evaluateGate(store, n, {}).sig;
  if (said !== now) throw Object.assign(new Error(`The checks for Gate ${n} changed while you were looking at them. Reload the gate and look again before you decide.`), { status: 409, code: 'stale_gate', current_sig: now });
};

@EngineController('', 'Gates')
export class CriteriaController {
  @Get('criteria') @EngineRoute()
  criteria() { return gates.config(); }

  /** What a competitor price can be "for" (per dealer, per site ... per GB only for products that sell usage). */
  @Get('price-units') @EngineRoute()
  priceUnits(@Ctx() c: EngineCtx) {
    const product = c.product;
    const prof = formkitMod.profile(c.store, product && product.kind ? { kind: product.kind } : undefined);
    return { profile: { kind: prof.kind, audience: prof.audience }, sells_usage: un.sellsUsage(prof), choices: un.PRICE_FOR.map((x: any) => ({ v: x.v, label: x.label, usage: !!x.usage, f: x.f })) };
  }
}

@EngineController('gates', 'Gates')
export class GatesController {
  @Get() @EngineRoute()
  all(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return shortOffenders(gates.evaluateAll(c.store, query.depth ? { depth: query.depth } : {})); }

  @Get(':n') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('n') nn: string, @Query() query: Record<string, string>) {
    const store = c.store;
    const n = Number(nn);
    if (!(n >= 0 && n <= 12)) throw Object.assign(new Error('gate must be 0-12'), { status: 404 });
    const evn = gates.evaluateGate(store, n, query.depth ? { depth: query.depth } : {});
    return { ...evn, eligibleReasonPlain: plain.eligibleText(evn), depthEffect: gates.depthEffect(store, n), attestations: store.data.attestations.filter((a: any) => a.gate === n), waivers: store.list('Waiver'), conditions: store.list('Condition'), baselines: store.data.baselines };
  }

  /** The body depends on the check being attested, so it is an open object (expected_sig guards against a stale picture). */
  @Post(':n/attest') @EngineRoute()
  attest(@Ctx() c: EngineCtx, @Param('n') n: string, @Body() body: Record<string, any>) { assertGateUnchanged(c.store, Number(n), body); return approvals.requestAttest(c.store, { ...body, gate: Number(n) }, c.actor); }

  @Post(':n/waive') @EngineRoute()
  waive(@Ctx() c: EngineCtx, @Param('n') n: string, @Body() body: Record<string, any>) { return approvals.requestException(c.store, { ...body, gate: body.gate === undefined ? Number(n) : body.gate }, c.actor); }

  @Post(':n/decide') @EngineRoute()
  decide(@Ctx() c: EngineCtx, @Param('n') n: string, @Body() body: Record<string, any>) { assertGateUnchanged(c.store, Number(n), body); return approvals.requestStageDecision(c.store, Number(n), body.decision, { ...body, enforce_second_person: true }, c.actor); }
}

@EngineController('waivers', 'Gates')
export class WaiversController {
  @Post(':id/revoke') @EngineRoute()
  revoke(@Ctx() c: EngineCtx, @Param('id') id: string) { return { waiver: c.store.update(id, { status: 'Revoked' }, { actor: c.actor }) }; }
}

@EngineController('conditions', 'Gates')
export class ConditionsController {
  @Post(':id/close') @EngineRoute()
  close(@Ctx() c: EngineCtx, @Param('id') id: string) { return { condition: c.store.update(id, { status: 'Closed', closed_on: c.store.today() }, { actor: c.actor }) }; }
}

@EngineController('requests', 'Data collection')
export class RequestsController {
  @Get() @EngineRoute()
  list(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const p = requests.plan(c.store, query.depth ? { depth: query.depth } : {});
    return { depth: p.depth, totals: p.totals, sessions: p.sessions, requests: p.requests.map((r: any) => ({ ...r, form: undefined, hasForm: !!r.form })) };
  }

  @Get(':id') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('id') id: string) {
    const p = requests.plan(c.store);
    const r = p.requests.find((x: any) => x.id === id);
    if (!r) throw Object.assign(new Error('request not found'), { status: 404 });
    return { request: { ...r, form: undefined }, form: requests.formFor(c.store, id), state: c.store.data.requestState[id] || null };
  }

  /** The answer's fields depend on the request's form, so the body is an open object. */
  @Post(':id/answer') @EngineRoute()
  answer(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: Record<string, any>) { return requests.answer(c.store, id, body, c.actor); }

  @Post(':id/derive') @EngineRoute()
  derive(@Ctx() c: EngineCtx, @Param('id') id: string) { return requests.runDerive(c.store, id, c.actor); }

  @Post(':id/na') @EngineRoute()
  na(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: NaDto) { requests.markNA(c.store, id, body.reason, c.actor); return { ok: true }; }
}

@EngineController('agent', 'Agent')
export class AgentController {
  /** What a helper (an AI agent or import) hands in: open object, the engine checks it. */
  @Post('ingest') @EngineRoute()
  ingest(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) { return agent.ingest(c.store, { submitted_by: c.actor, ...body }); }

  @Get('queue') @EngineRoute()
  queue(@Ctx() c: EngineCtx) { return { items: agent.queue(c.store) }; }

  @Get('checked') @EngineRoute()
  checked(@Ctx() c: EngineCtx) { return { items: agent.checked(c.store) }; }

  @Get('ingests') @EngineRoute()
  ingests(@Ctx() c: EngineCtx) { return { ingests: c.store.data.ingests }; }

  @Post('verify/:id') @EngineRoute()
  verify(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: NoteDto) { return { verified: agent.verify(c.store, id, c.actor, body && body.note) }; }

  @Post('reject/:id') @EngineRoute()
  reject(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() body: NoteDto) { return { rejected: agent.reject(c.store, id, c.actor, body && body.note) }; }
}

@EngineController('trace', 'Traceability')
export class TraceController {
  @Get('matrix') @EngineRoute()
  matrix(@Ctx() c: EngineCtx) { return { rows: coverage.matrix(new Q.Ctx(c.store, {})) }; }

  @Get('gaps') @EngineRoute()
  gaps(@Ctx() c: EngineCtx) { return coverage.gaps(new Q.Ctx(c.store, {})); }

  @Get('funnel') @EngineRoute()
  funnel(@Ctx() c: EngineCtx) { return { stages: coverage.funnel(new Q.Ctx(c.store, {})) }; }

  @Get('rules') @EngineRoute()
  rules(@Ctx() c: EngineCtx) {
    const ctx = new Q.Ctx(c.store, {});
    return { rules: coverage.rules().map((r: any) => { const e = coverage.evalRule(ctx, r); return { id: r.id, name: r.name, v2Ref: r.v2Ref, population: e.population, met: e.met, pct: e.pct, pass: e.pass, vacuous: e.vacuous, groups: Object.fromEntries(Object.entries(e.groups).map(([k, g]) => [k, { threshold: (g as any).threshold, population: (g as any).population, met: (g as any).met, pct: (g as any).pct }])), missing: e.missing.map(coverage.brief), noun: r.noun, missingText: r.missing }; }) };
  }
}

@EngineController('', 'Traceability')
export class FlowsController {
  @Get('flows') @EngineRoute()
  list(@Ctx() c: EngineCtx) {
    const store = c.store;
    return { flows: store.list('Flow').map((f: any) => ({ ...brief(f), steps: store.out(f.id, 'contains').length, check: (({ ok, failing, deadEnds }: any) => ({ ok, failing, deadEnds }))(coverage.flowCheck(store, f.id)) })), entities: store.list('Entity').map((e: any) => ({ ...brief(e), has_lifecycle: !!e.has_lifecycle })) };
  }

  @Get('flows/:id') @EngineRoute()
  one(@Ctx() c: EngineCtx, @Param('id') id: string) {
    const store = c.store;
    const ch = coverage.flowCheck(store, id);
    const covers: Record<string, any> = {}, actors: Record<string, any> = {}, calls: Record<string, any> = {};
    for (const s of ch.steps) covers[s.id] = store.out(s.id, 'covers').map((l: any) => ({ id: l.target, title: (store.get(l.target) || {}).title }));
    for (const s of ch.steps) { const a = store.out(s.id, 'performed_by')[0]; if (a) actors[s.id] = (store.get(a.target) || {}).title; }
    for (const s of ch.steps) { const x = store.out(s.id, 'calls')[0]; if (x) calls[s.id] = (store.get(x.target) || {}).title; }
    return { ...ch, covers, actors, calls, flowItem: store.get(id) };
  }

  @Get('entities/:id') @EngineRoute()
  entity(@Ctx() c: EngineCtx, @Param('id') id: string) { return coverage.entityCheck(c.store, id, new Q.Ctx(c.store, {})); }
}

@EngineController('competitors', 'Competitors')
export class CompetitorViewsController {
  @Get('tiers') @EngineRoute() tiers(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitors.tierView(c.store, query.scope); }
  @Get('grid') @EngineRoute() grid(@Ctx() c: EngineCtx) { return competitors.grid(c.store); }
  @Get('prices') @EngineRoute() prices(@Ctx() c: EngineCtx) { return competitors.prices(c.store); }
  @Get('sources') @EngineRoute() sources(@Ctx() c: EngineCtx) { return competitors.sources(c.store); }
  @Get('effort') @EngineRoute() effort(@Ctx() c: EngineCtx) { return competitors.effort(c.store); }
  @Get('product-lines') @EngineRoute() productLines(@Ctx() c: EngineCtx) { return competitors.productLines(c.store); }
  @Get('completeness') @EngineRoute() completeness(@Ctx() c: EngineCtx) { return competitors.completeness(c.store); }
  @Get('normalized-prices') @EngineRoute() normalizedPrices(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitors.normalizedPricing(c.store, query); }
  @Get('plan-capabilities') @EngineRoute() planCapabilities(@Ctx() c: EngineCtx) { return competitors.planCapabilities(c.store); }
  @Get('catalog') @EngineRoute() catalog(@Ctx() c: EngineCtx) { return competitors.catalog(c.store); }
  @Post('catalog/common') @EngineRoute() addCommon(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) { return competitors.addCommonFeatures(c.store, Array.isArray(body && body.features) ? body.features : [], c.actor); }
  @Get('plans') @EngineRoute() plans(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorPlans.plans(c.store, query); }
  @Post('plans/features') @EngineRoute() setPlanFeature(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) { return competitorPlans.setPlanFeature(c.store, body || {}, c.actor); }
  @Get('plan-level-features') @EngineRoute() planLevelFeatures(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorPlans.planLevelFeatures(c.store, query.scope); }
  @Get('recommended') @EngineRoute() recommended(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorPlans.recommended(c.store, query); }
  @Get('compare-plans') @EngineRoute() comparePlans(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorPlans.comparePlans(c.store, query); }
  @Get('our-plans') @EngineRoute() ourPlans(@Ctx() c: EngineCtx) { return competitorPlans.ourPlans(c.store); }
  @Get('our-plans/pick-features') @EngineRoute() pickFeatures(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorPlans.pickFeatures(c.store, query); }
  @Post('our-plans/features/new') @EngineRoute() addOurFeatures(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) { return competitorPlans.addOurFeatures(c.store, body || {}, c.actor); }
  @Post('our-plans/features') @EngineRoute() setOurPlanFeature(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) { return competitorPlans.setOurPlanFeature(c.store, body || {}, c.actor); }
  @Get('must-have') @EngineRoute() mustHave(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitors.mustHaveCapabilities(c.store, Math.min(100, Math.max(1, Number(query.threshold) || 80)), query.scope); }

  /** The whole competitor dashboard in one answer: analysed counts, tiers, common features with their share, the recommendation and its average price. */
  @Get('scopes') @EngineRoute() scopes(@Ctx() c: EngineCtx) { return { has_modules: hasModules(c.store), scopes: scopeNames(c.store) }; }

  /** Everything one competitor's page shows, worked out for that competitor only. */
  @Get(':id/profile') @EngineRoute() profile(@Ctx() c: EngineCtx, @Param('id') id: string) { return competitorProfile.profile(c.store, id); }

  @Get('overview') @EngineRoute() overview(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { return competitorOverview.overview(c.store, query); }

  /** POST /competitors/import?name=FILE.csv&commit=0|1 - the body is the file itself (.csv or .xlsx). commit=0 only checks and reports. */
  @Post('import') @EngineRoute()
  async importFile(@Ctx() c: EngineCtx, @Req() req: any, @Query() query: Record<string, string>) {
    const body = await readBody(req, true);
    const on = (v?: string) => v === '1' || v === 'true';
    return competitorImport.importCompetitors(c.store, { filename: query.name, buffer: body }, { commit: on(query.commit), overwrite: on(query.overwrite), createFeatures: query.create_features !== '0', actor: c.actor, competitor: query.competitor, tier: query.tier, scope: query.scope });
  }

  /** POST /competitors/sample - fills this product with nine fictional demo competitors, plans and features, to try the dashboard. Saving twice changes nothing. */
  @Post('sample') @EngineRoute()
  sample(@Ctx() c: EngineCtx) { return competitorSample.importSample(c.store, { commit: true, actor: c.actor }); }

  /** Rows typed into the Add a competitor dialog: the same checks and the same saving as a file. */
  @Post('bulk') @EngineRoute()
  bulk(@Ctx() c: EngineCtx, @Body() body: Record<string, any>) {
    return competitorImport.importCompetitors(c.store, { rows: Array.isArray(body && body.rows) ? body.rows : [] }, { commit: !!(body && body.commit), overwrite: !!(body && body.overwrite), createFeatures: !(body && body.create_features === false), actor: c.actor });
  }

  /** GET /competitors/export?id=COMP-001 - the plans of one competitor (or all, optionally one module) as a CSV that imports again unchanged. */
  @Get('export') @EngineRoute()
  exportPlans(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) { const t = competitorImport.exportPlans(c.store, { id: query.id, scope: query.scope }); return file(t.body, 'text/csv; charset=utf-8', t.filename, 'attachment'); }

  @Get('import/template') @EngineRoute()
  importTemplate(@Query() query: Record<string, string>) { const t = competitorImport.template(query.kind); return file(t.body, 'text/csv; charset=utf-8', t.filename, 'attachment'); }
}

@EngineController('handoff', 'Handover')
export class HandoffPackageController {
  @Get('stories') @EngineRoute()
  stories(@Ctx() c: EngineCtx) { return handoff.readiness(new Q.Ctx(c.store, { gate: 4 })); }

  @Get('preview') @EngineRoute()
  preview(@Ctx() c: EngineCtx, @Query() query: Record<string, string>) {
    const ctx = new Q.Ctx(c.store, { gate: 4 });
    const pkg = handoff.buildStoryPackage(ctx, query.story);
    return { package: pkg, validation: handoff.validate(ctx, pkg) };
  }

  /** Checking a package changes nothing, but it needs a named person like every POST. */
  @Post('validate') @EngineRoute()
  validate(@Ctx() c: EngineCtx, @Body() body: HandoffValidateDto) {
    const ctx = new Q.Ctx(c.store, { gate: 4 });
    const pkg = body.package || handoff.buildStoryPackage(ctx, body.story);
    return { validation: handoff.validate(ctx, pkg) };
  }

  @Post('create') @EngineRoute()
  create(@Ctx() c: EngineCtx, @Body() body: HandoffCreateDto) { return handoff.createHandoff(c.store, body.story, c.actor); }
}

function replayDemo(c: EngineCtx, n: number) {
  resetToSeed(c.product.id);
  for (let i = 0; i < n; i++) demo.next(c.store);
  if (n === 0) c.store.data.demo = { index: 0 };
  return demo.status(c.store);
}

@EngineController('demo', 'Demo')
export class DemoController {
  @Get() @EngineRoute()
  status(@Ctx() c: EngineCtx) { return demo.status(c.store); }

  @Post('next') @EngineRoute()
  next(@Ctx() c: EngineCtx) { return { result: demo.next(c.store), status: demo.status(c.store) }; }

  @Post('back') @EngineRoute()
  back(@Ctx() c: EngineCtx) { return replayDemo(c, Math.max(0, (c.store.data.demo.index || 0) - 1)); }

  @Post('reset') @EngineRoute()
  reset(@Ctx() c: EngineCtx) { return replayDemo(c, 0); }

  @Post('goto') @EngineRoute()
  goto(@Ctx() c: EngineCtx, @Body() body: DemoGotoDto) { return replayDemo(c, Math.max(0, Math.min(demo.STEPS.length, Number((body && body.index)) || 0))); }
}
