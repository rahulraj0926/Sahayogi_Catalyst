/**
 * Everything under /competitors. One file for the whole area, with a request class for every address that takes input,
 * so a wrong request is refused with a clear message before any work is done (the global ValidationPipe).
 * The work itself lives in legacy/engine/competitor*.ts; a handler only passes the product's store, the typed input and the actor along.
 */
import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as competitors from '../../legacy/engine/competitors';
import * as competitorProfile from '../../legacy/engine/competitor_profile';
import * as competitorPlans from '../../legacy/engine/competitor_plans';
import * as competitorOverview from '../../legacy/engine/competitor_overview';
import * as competitorSample from '../../legacy/engine/competitor_sample';
import * as competitorImport from '../../legacy/engine/competitor_import';
import { file } from '../../legacy/routes/http';
import { readBody } from '../body';
import { hasModules, scopeNames } from '../../legacy/engine/competitor_owner';
import {
  AddCommonFeaturesDto, AddOurFeaturesDto, BulkCompetitorsDto, CompetitorQueryDto, ComparePlansQueryDto, ExportQueryDto, ImportQueryDto, MustHaveQueryDto,
  NormalizedPricesQueryDto, OverviewQueryDto, PickFeaturesQueryDto, PlansQueryDto, RecommendedQueryDto, ScopeQueryDto, SetOurPlanFeatureDto, SetPlanFeatureDto, TemplateQueryDto,
} from './dto/competitors.dto';

const on = (v?: string) => v === '1' || v === 'true';

@EngineController('competitors', 'Competitors')
export class CompetitorsController {
  // ---- one competitor
  /** Everything one competitor's page shows, worked out for that competitor only. */
  @Get(':id/profile') @EngineRoute()
  profile(@Ctx() c: EngineCtx, @Param('id') id: string, @Query() _q: CompetitorQueryDto) { return competitorProfile.profile(c.store, id); }

  // ---- reading across all competitors
  @Get('tiers') @EngineRoute() tiers(@Ctx() c: EngineCtx, @Query() q: ScopeQueryDto) { return competitors.tierView(c.store, q.scope); }
  @Get('grid') @EngineRoute() grid(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.grid(c.store); }
  @Get('prices') @EngineRoute() prices(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.prices(c.store); }
  @Get('sources') @EngineRoute() sources(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.sources(c.store); }
  @Get('effort') @EngineRoute() effort(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.effort(c.store); }
  @Get('product-lines') @EngineRoute() productLines(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.productLines(c.store); }
  @Get('completeness') @EngineRoute() completeness(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.completeness(c.store); }
  @Get('normalized-prices') @EngineRoute() normalizedPrices(@Ctx() c: EngineCtx, @Query() q: NormalizedPricesQueryDto) { return competitors.normalizedPricing(c.store, q); }
  @Get('plan-capabilities') @EngineRoute() planCapabilities(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.planCapabilities(c.store); }
  @Get('must-have') @EngineRoute() mustHave(@Ctx() c: EngineCtx, @Query() q: MustHaveQueryDto) { return competitors.mustHaveCapabilities(c.store, Math.min(100, Math.max(1, Number(q.threshold) || 80)), q.scope); }
  @Get('scopes') @EngineRoute() scopes(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return { has_modules: hasModules(c.store), scopes: scopeNames(c.store) }; }
  /** The whole competitor dashboard in one answer: analysed counts, tiers, common features with their share, the recommendation and its average price. */
  @Get('overview') @EngineRoute() overview(@Ctx() c: EngineCtx, @Query() q: OverviewQueryDto) { return competitorOverview.overview(c.store, q); }

  // ---- our feature list
  @Get('catalog') @EngineRoute() catalog(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitors.catalog(c.store); }
  @Post('catalog/common') @EngineRoute()
  addCommon(@Ctx() c: EngineCtx, @Body() dto: AddCommonFeaturesDto) { return competitors.addCommonFeatures(c.store, dto.features, c.actor); }

  // ---- plans
  @Get('plans') @EngineRoute() plans(@Ctx() c: EngineCtx, @Query() q: PlansQueryDto) { return competitorPlans.plans(c.store, q); }
  @Post('plans/features') @EngineRoute() setPlanFeature(@Ctx() c: EngineCtx, @Body() dto: SetPlanFeatureDto) { return competitorPlans.setPlanFeature(c.store, dto, c.actor); }
  @Get('plan-position-features') @EngineRoute() planPositionFeatures(@Ctx() c: EngineCtx, @Query() q: ScopeQueryDto) { return competitorPlans.planPositionFeatures(c.store, q.scope); }
  @Get('recommended') @EngineRoute() recommended(@Ctx() c: EngineCtx, @Query() q: RecommendedQueryDto) { return competitorPlans.recommended(c.store, q); }
  @Get('compare-plans') @EngineRoute() comparePlans(@Ctx() c: EngineCtx, @Query() q: ComparePlansQueryDto) { return competitorPlans.comparePlans(c.store, q); }
  @Get('our-plans') @EngineRoute() ourPlans(@Ctx() c: EngineCtx, @Query() _q: CompetitorQueryDto) { return competitorPlans.ourPlans(c.store); }
  @Get('our-plans/pick-features') @EngineRoute() pickFeatures(@Ctx() c: EngineCtx, @Query() q: PickFeaturesQueryDto) { return competitorPlans.pickFeatures(c.store, q); }
  @Post('our-plans/features/new') @EngineRoute() addOurFeatures(@Ctx() c: EngineCtx, @Body() dto: AddOurFeaturesDto) { return competitorPlans.addOurFeatures(c.store, dto, c.actor); }
  @Post('our-plans/features') @EngineRoute() setOurPlanFeature(@Ctx() c: EngineCtx, @Body() dto: SetOurPlanFeatureDto) { return competitorPlans.setOurPlanFeature(c.store, dto, c.actor); }

  // ---- adding many at once
  /** POST /competitors/import?name=FILE.csv&commit=0|1 - the body is the file itself (.csv or .xlsx). commit=0 only checks and reports. */
  @Post('import') @EngineRoute()
  async importFile(@Ctx() c: EngineCtx, @Req() req: any, @Query() q: ImportQueryDto) {
    const body = await readBody(req, true);
    return competitorImport.importCompetitors(c.store, { filename: q.name, buffer: body }, { commit: on(q.commit), overwrite: on(q.overwrite), createFeatures: q.create_features !== '0', actor: c.actor, competitor: q.competitor, tier: q.tier, scope: q.scope });
  }

  /** POST /competitors/sample - fills this product with nine fictional demo competitors, plans and features, to try the dashboard. Saving twice changes nothing. */
  @Post('sample') @EngineRoute()
  sample(@Ctx() c: EngineCtx) { return competitorSample.importSample(c.store, { commit: true, actor: c.actor }); }

  /** Rows typed into the Add a competitor dialog: the same checks and the same saving as a file. */
  @Post('bulk') @EngineRoute()
  bulk(@Ctx() c: EngineCtx, @Body() dto: BulkCompetitorsDto) {
    return competitorImport.importCompetitors(c.store, { rows: dto.rows }, { commit: !!dto.commit, overwrite: !!dto.overwrite, createFeatures: dto.create_features !== false, actor: c.actor });
  }

  /** GET /competitors/export?id=COMP-001 - the plans of one competitor (or all, optionally one module) as a CSV that imports again unchanged. */
  @Get('export') @EngineRoute()
  exportPlans(@Ctx() c: EngineCtx, @Query() q: ExportQueryDto) { const t = competitorImport.exportPlans(c.store, { id: q.id, scope: q.scope }); return file(t.body, 'text/csv; charset=utf-8', t.filename, 'attachment'); }

  @Get('import/template') @EngineRoute()
  importTemplate(@Query() q: TemplateQueryDto) { const t = competitorImport.template(q.kind); return file(t.body, 'text/csv; charset=utf-8', t.filename, 'attachment'); }
}
