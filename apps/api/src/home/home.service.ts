import { BadRequestException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ActivitySource, PortfolioSource } from '../engine-port/ports';
import { engine } from '../engine-port/legacy';
import { paged } from '../common/dto/pagination.dto';
import { IdeasService } from '../ideas/ideas.service';
import type { PortfolioLike, ProductEntry, StoreLike } from '../types/legacy';
import {
  ActivityPageDto, CalendarDto, CalendarEventDto, HomeDto, HomeProductDto, KpiDto, KpisDto, ProductsPageDto, ProductsQueryDto, STAGES,
} from './dto/home.dto';
import { isActive, ProductRowCache } from './product-rows';

const MAX_EVENTS = 500;
const MAX_RANGE_DAYS = 93;
const WARM_CHUNK = 25;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const lastAt = (s: StoreLike, e: ProductEntry) => { const a = s.data.audit; return a.length ? a[a.length - 1].at : e.created_at || ''; };

/**
 * Home screen data. Built for portfolios of hundreds to thousands of products:
 * - the table filters and sorts on registry fields without touching any product, then computes rows for the visible page only
 *   (rows needed for readiness / phase / health sorting are computed once and memoised until that product changes);
 * - KPIs and the calendar read cheap fields; the cache is warmed in small chunks after boot so the event loop is never blocked long;
 * - recent activity comes from the indexed audit table, newest first, with a cursor.
 */
@Injectable()
export class HomeService implements OnApplicationBootstrap {
  private readonly log = new Logger('Home');
  readonly rows = new ProductRowCache();

  constructor(private readonly src: PortfolioSource, private readonly activitySrc: ActivitySource, private readonly ideas: IdeasService) {}

  onApplicationBootstrap() { void this.warm(); }

  private warming: Promise<number> | null = null;

  /** Make sure rows exist for the whole portfolio before answering from them. One warm-up at a time; the event loop is released between slices. */
  private async ensureWarm(): Promise<void> {
    const pf = this.src.get();
    if (this.rows.size >= pf.list().length) return;
    this.warming ??= this.warm().finally(() => { this.warming = null; });
    await this.warming;
  }

  /** Compute every product row in small slices, yielding between slices. */
  async warm(): Promise<number> {
    let pf: PortfolioLike;
    try { pf = this.src.get(); } catch { return 0; }
    const entries = pf.list();
    const t0 = Date.now();
    for (let i = 0; i < entries.length; i += WARM_CHUNK) {
      for (const e of entries.slice(i, i + WARM_CHUNK)) { try { this.rows.row(pf, e); } catch (err) { this.log.warn(`warm ${e.id}: ${(err as Error).message}`); } }
      await new Promise((r) => setImmediate(r));
    }
    if (entries.length) this.log.log(`warmed ${entries.length} product rows in ${Date.now() - t0} ms`);
    return entries.length;
  }

  // ------------------------------------------------------------------ KPI cards
  async kpis(): Promise<KpisDto> {
    await this.ensureWarm();
    const pf = this.src.get();
    const rows = pf.list().map((e) => this.rows.row(pf, e));
    const active = rows.filter((r) => isActive(r.stage as never));
    const sum = (f: (r: HomeProductDto) => number) => active.reduce((a, r) => a + f(r), 0);
    const blocked = active.filter((r) => r.health === 'blocked').length;
    const idle = active.filter((r) => r.health === 'idle').length;
    const waiting = rows.reduce((a, r) => a + r.approvalsWaiting, 0);
    const ideas = this.ideas.openCount();
    const avg = active.length ? Math.round(active.reduce((a, r) => a + r.readinessPercent, 0) / active.length) : 0;
    const stale = sum((r) => r.staleValues);
    const minutes = sum((r) => r.minutesOwed);
    const handoff = active.filter((r) => r.stage === 'handoff').length;
    const k = (key: string, label: string, value: number, unit: KpiDto['unit'], status: KpiDto['status'], note: string, group: KpiDto['group'], href?: string): KpiDto => ({ key, label, value, unit, status, note, group, href });
    return {
      asOf: pf.today(),
      kpis: [
        k('in_progress', 'Products in progress', active.length, 'count', 'info', `of ${rows.length} in the portfolio`, 'primary', '/'),
        k('blocked', 'Held up at sign-off', blocked, 'count', blocked ? 'critical' : 'healthy', blocked ? 'products with something still needed' : 'nothing is holding a product up', 'primary', '/?health=blocked'),
        k('approvals_waiting', 'Waiting for approval', waiting, 'count', waiting ? 'warning' : 'healthy', waiting ? 'someone has to say yes or no' : 'no approvals pending', 'primary', '/approvals'),
        k('ideas_pending', 'Ideas to decide', ideas, 'count', ideas ? 'warning' : 'neutral', ideas ? 'accept or reject below' : 'the inbox is empty', 'primary'),
        k('avg_readiness', 'Average readiness', avg, 'percent', avg >= 70 ? 'healthy' : avg >= 40 ? 'warning' : 'info', 'across products in progress', 'primary'),
        k('at_handoff', 'Ready to hand over', handoff, 'count', handoff ? 'healthy' : 'neutral', 'all five stages signed off', 'secondary', '/?stage=handoff'),
        k('idle', 'No activity for 14 days', idle, 'count', idle ? 'warning' : 'healthy', idle ? 'may be stuck' : 'everything is moving', 'secondary', '/?health=idle'),
        k('stale_values', 'Facts to re-check', stale, 'count', stale ? 'warning' : 'healthy', 'out of date or due for a second look', 'secondary'),
        k('minutes_owed', 'People’s time needed', minutes, 'minutes', 'neutral', 'listed work still to do', 'secondary'),
      ],
    };
  }

  // ------------------------------------------------------------------ products table
  async products(q: ProductsQueryDto): Promise<ProductsPageDto> {
    const needsAll = !!q.health?.length || q.sort === 'readiness' || q.sort === 'phase';
    if (needsAll) await this.ensureWarm();
    const pf = this.src.get();
    const all = pf.list();
    const owners = [...new Set(all.map((e) => e.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const term = q.q?.trim().toLowerCase();
    const owner = q.owner?.trim().toLowerCase();
    let entries = all.filter((e) =>
      (!q.stage?.length || q.stage.includes(e.stage)) &&
      (!q.kind?.length || q.kind.includes(e.kind)) &&
      (!owner || (e.owner || '').toLowerCase() === owner) &&
      (!term || `${e.name} ${e.one_liner || ''} ${e.owner || ''}`.toLowerCase().includes(term)));

    const dir = q.order === 'asc' ? 1 : -1;
    const needsRows = !!q.health?.length || q.sort === 'readiness' || q.sort === 'phase';
    if (needsRows) {
      let rows = entries.map((e) => this.rows.row(pf, e));
      if (q.health?.length) rows = rows.filter((r) => q.health!.includes(r.health));
      rows.sort((a, b) => dir * (q.sort === 'readiness' ? a.readinessPercent - b.readinessPercent : a.phase.id - b.phase.id) || a.name.localeCompare(b.name));
      const page = paged(rows, q.page, q.limit);
      return { ...page, owners };
    }
    const key = (e: ProductEntry): string | number => {
      if (q.sort === 'name') return e.name.toLowerCase();
      if (q.sort === 'owner') return (e.owner || '').toLowerCase();
      if (q.sort === 'stage') return (STAGES as readonly string[]).indexOf(e.stage);
      return lastAt(pf.store(e.id), e);
    };
    const keyed = entries.map((e) => ({ e, k: key(e) }));
    keyed.sort((a, b) => dir * (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || a.e.name.localeCompare(b.e.name));
    entries = keyed.map((x) => x.e);
    const page = paged(entries, q.page, q.limit);
    return { data: page.data.map((e) => this.rows.row(pf, e)), meta: page.meta, owners };
  }

  // ------------------------------------------------------------------ calendar
  calendar(fromIn?: string, toIn?: string): CalendarDto {
    const pf = this.src.get();
    const today = pf.today();
    const [y, m] = today.split('-').map(Number);
    const from = fromIn || `${y}-${String(m).padStart(2, '0')}-01`;
    const to = toIn || new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (!(span >= 0)) throw new BadRequestException({ code: 'bad_range', message: 'to must not be before from.' });
    if (span > MAX_RANGE_DAYS) throw new BadRequestException({ code: 'bad_range', message: `Ask for at most ${MAX_RANGE_DAYS} days at a time.` });
    const inRange = (d: string) => d >= from && d <= to;
    const events: CalendarEventDto[] = [];
    const add = (e: CalendarEventDto) => { if (inRange(e.date)) events.push(e); };

    for (const e of pf.list()) {
      const store = pf.store(e.id);
      const slug = e.slug || e.id;
      const base = { productId: e.id, productSlug: slug, productName: e.name };
      add({ ...base, id: `${e.id}:created`, date: day(e.created_at), kind: 'product_created', title: `${e.name} started`, href: `/products/${slug}` });
      if (e.stage_since && isActive(e.stage)) add({ ...base, id: `${e.id}:stage:${e.stage}`, date: day(e.stage_since), kind: 'stage_entered', title: `${e.name} moved to ${engine.plain.stageLabel(e.stage)}`, href: `/products/${slug}` });
      for (const a of store.data.approvals || []) if (a.status === 'waiting') add({ ...base, id: `${e.id}:${a.id}`, date: day(a.expires_at), kind: 'approval_expires', title: `${a.approver} has until today to answer: ${a.title}`, href: `/products/${slug}/approvals` });
      for (const [g, rec] of Object.entries(store.data.gates || {})) if (rec && rec.decided_at) add({ ...base, id: `${e.id}:gate:${g}`, date: day(rec.decided_at), kind: 'gate_decision', title: `${e.name}: Stage ${g} ${String(rec.decision || rec.state || 'decided').toLowerCase()}`, href: `/products/${slug}/gates` });
    }
    for (const i of pf.ideas().filter((x) => x.status !== 'innovation')) add({ id: i.id, date: day(i.created_on), kind: 'idea_submitted', title: `Idea: ${i.one_liner}` });

    events.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    return { from, to, events: events.slice(0, MAX_EVENTS), truncated: events.length > MAX_EVENTS };
  }

  // ------------------------------------------------------------------ recent activity (all products)
  async activity(limit = 15, cursor?: string): Promise<ActivityPageDto> {
    const pf = this.src.get();
    const n = Math.min(Math.max(1, Math.trunc(limit) || 15), 50);
    const { entries, next } = await this.activitySrc.recent(n, cursor);
    return {
      next,
      data: entries.map((a) => {
        let text = a.summary;
        try { text = engine.plain.activity(a.summary, pf.cache.get(a.productId)); } catch { /* keep the raw sentence */ }
        return { id: a.seq, at: a.at, actor: a.actor, action: a.action, text, productId: a.productId, productSlug: pf.get(a.productId)?.slug || a.productId, productName: pf.get(a.productId)?.name || a.productId };
      }),
    };
  }

  // ------------------------------------------------------------------ everything for the first paint, in one call
  async overview(): Promise<HomeDto> {
    const defaults = Object.assign(new ProductsQueryDto(), { page: 1, limit: 10, sort: 'activity', order: 'desc' });
    const [activity, k, products] = await Promise.all([this.activity(10), this.kpis(), this.products(defaults)]);
    return {
      asOf: k.asOf, kpis: k.kpis, products, ideas: this.ideas.list().slice(0, 8), ideasTotal: this.ideas.openCount(),
      activity, calendar: this.calendar(),
    };
  }
}
