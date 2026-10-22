/**
 * Approval requests.
 *   the requester (product-scoped):  GET /approvals, POST /approvals/:id/resend | withdraw | confirm | decline, POST /approvals/seen
 *   portfolio-level:                 GET/POST /sharing - the address links start with, and how long they live
 *   open to anybody holding a link:  GET /approve/:token, GET /approve/:token/document, POST /approve/:token/decide
 * The token routes are the only routes that accept a decision from another computer, and each token works for exactly one request.
 * They need no name, but they DO leave records (opened, decided), so they are saved to PostgreSQL straight away (`records`).
 */
import { Body, Get, Param, Post, Req } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as approvals from '../../legacy/engine/approvals';
import * as compose from '../../legacy/engine/compose';
import { ApprovalNoteDto, DecideDto, SharingDto } from './dto/approvals.dto';

const httpErr = (status: number, message: string, extra?: Record<string, unknown>) => Object.assign(new Error(message), { status }, extra || {});

// wrong guesses per address, kept in memory: more than 10 in 10 minutes and that address is told to wait
const FAILS = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000; const MAX_FAILS = 10;
function tooMany(ip: string, now = Date.now()) { const l = (FAILS.get(ip) || []).filter((t) => now - t < WINDOW_MS); FAILS.set(ip, l); return l.length >= MAX_FAILS; }
function failed(ip: string, now = Date.now()) { const l = (FAILS.get(ip) || []).filter((t) => now - t < WINDOW_MS); l.push(now); FAILS.set(ip, l); }
export const resetLimits = () => FAILS.clear();

const settingsOf = (c: EngineCtx) => { const pf = c.portfolio; pf.reg.settings = pf.reg.settings || {}; approvals.configure(pf.reg.settings); return pf.reg.settings; };
const baseFor = (c: EngineCtx, req: any) => approvals.baseUrl(settingsOf(c), (req && req.socket && req.socket.localPort) || Number(process.env.PORT) || 4317);
const ipOf = (req: any) => (req && req.socket && req.socket.remoteAddress) || 'unknown';
const gate = (req: any) => { if (tooMany(ipOf(req))) throw httpErr(429, 'Too many wrong tries from this computer. Wait ten minutes and try again.', { code: 'rate_limited' }); };

function find(c: EngineCtx, token: string) {
  const pf = c.portfolio;
  if (typeof token !== 'string' || token.length < 20) return null;
  for (const e of pf.list({ includeArchived: true })) {
    let st; try { st = pf.store(e.id); } catch { continue; }
    const ap = (st.data.approvals || []).find((a: any) => a.token === token);
    if (ap) return { entry: e, store: st, ap };
  }
  return null;
}

/** What an approver sees, and how they answer. No name is asked for: holding the link is the credential. */
@EngineController('approve', 'Approvals')
export class ApproveByLinkController {
  @Get(':token') @EngineRoute({ noProduct: true, mutating: false, records: true })
  show(@Ctx() c: EngineCtx, @Param('token') token: string, @Req() req: any) {
    gate(req);
    const hit = find(c, token);
    if (!hit) { failed(ipOf(req)); throw httpErr(404, 'This link is not valid. It may have been mistyped, or replaced by a newer link. Ask the person who sent it for a new link.', { code: 'unknown' }); }
    const { store, ap, entry } = hit;
    approvals.opened(store, ap, req.headers['user-agent'], ipOf(req));
    c.portfolio.save(entry.id);
    const st = approvals.statusOf(store, ap);
    const x = st === 'waiting' ? approvals.contentFor(store, ap) : { lines: [], warnings: [], document_html: null, read_link: null };
    return {
      status: st, status_word: approvals.STATUS_WORD[st], kind_word: approvals.KIND_WORD[ap.kind], title: ap.title, statement: ap.statement, product: ap.product_name || entry.name, stage: ap.stage,
      prepared_by: ap.prepared_by, approver: ap.approver, created_at: ap.created_at, expires_at: ap.expires_at, decided_at: ap.decided_at || null, decided_by: ap.decided_by || null, decision_note: ap.decision_note || '',
      lines: x.lines, warnings: x.warnings, has_document: !!x.document_html, document_url: x.read_link,
      explain: st === 'expired' ? 'This request has expired. Ask the person who sent it for a new link.' : st === 'withdrawn' ? 'The person who sent this withdrew it, so there is nothing to decide.' : st === 'approved' || st === 'declined' ? `This was ${st}${ap.decided_by ? ' by ' + ap.decided_by : ''}. It cannot be decided a second time.` : null,
      honesty: 'This link proves that you hold the link and typed a name. It does not prove who you are. Only decide it if it was meant for you.',
    };
  }

  @Get(':token/document') @EngineRoute({ noProduct: true, mutating: false })
  document(@Ctx() c: EngineCtx, @Param('token') token: string, @Req() req: any) {
    gate(req);
    const hit = find(c, token);
    if (!hit) { failed(ipOf(req)); throw httpErr(404, 'This link is not valid.'); }
    if (hit.ap.kind !== 'document') throw httpErr(404, 'There is no document behind this request.');
    const r = compose.render1(hit.store, (hit.ap.payload.key || hit.ap.subject), 'html');
    return { __raw: r.body, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'Cache-Control': 'no-store' } };
  }

  @Post(':token/decide') @EngineRoute({ noProduct: true, mutating: false, records: true })
  decide(@Ctx() c: EngineCtx, @Param('token') token: string, @Body() dto: DecideDto, @Req() req: any) {
    gate(req);
    const hit = find(c, token);
    if (!hit) { failed(ipOf(req)); throw httpErr(404, 'This link is not valid. Ask the person who sent it for a new link.', { code: 'unknown' }); }
    const { store, ap, entry } = hit;
    try {
      approvals.decideApproval(store, ap, { decision: dto.decision === 'decline' ? 'decline' : 'approve', name: dto.name, note: dto.note, via: 'link', ua: req.headers['user-agent'], ip: ipOf(req) });
    } catch (e: any) {
      if (['wrong_name', 'preparer_blocked', 'name_required'].includes(e.code)) { failed(ipOf(req)); c.portfolio.save(entry.id); }
      throw e;
    }
    c.portfolio.save(entry.id); c.portfolio.sync(entry.id); c.portfolio.saveRegistry();
    return { ok: true, status: ap.status, message: ap.status === 'approved' ? 'Thank you. You approved it. The person who asked will see this straight away.' : 'Thank you. You declined it, and your reason has been passed on.' };
  }
}

/** The requester's side: what is waiting, for whom, with the links. */
@EngineController('approvals', 'Approvals')
export class ApprovalsController {
  private mustFind(store: any, id: string) { const ap = approvals.byId(store, id); if (!ap) throw httpErr(404, 'No such approval request.'); return ap; }

  @Get() @EngineRoute()
  overview(@Ctx() c: EngineCtx, @Req() req: any) { return approvals.overview(c.store, c.actor, baseFor(c, req)); }

  // (the fixed word "seen" comes before the :id routes, as the older table had it)
  @Post('seen') @EngineRoute()
  seen(@Ctx() c: EngineCtx) { for (const a of approvals.list(c.store)) if (['approved', 'declined'].includes(a.status)) a.seen_by_requester = true; return { ok: true }; }

  @Post(':id/resend') @EngineRoute()
  resend(@Ctx() c: EngineCtx, @Param('id') id: string, @Req() req: any) { const ap = approvals.resend(c.store, this.mustFind(c.store, id), c.actor, settingsOf(c)); return approvals.view(c.store, ap, baseFor(c, req)); }

  @Post(':id/withdraw') @EngineRoute()
  withdraw(@Ctx() c: EngineCtx, @Param('id') id: string, @Req() req: any) { return approvals.view(c.store, approvals.withdraw(c.store, this.mustFind(c.store, id), c.actor), baseFor(c, req)); }

  @Post(':id/confirm') @EngineRoute()
  confirm(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: ApprovalNoteDto, @Req() req: any) { return approvals.view(c.store, approvals.confirmInPerson(c.store, id, c.actor, { decision: 'approve', note: dto && dto.note }), baseFor(c, req)); }

  @Post(':id/decline') @EngineRoute()
  decline(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: ApprovalNoteDto, @Req() req: any) { return approvals.view(c.store, approvals.confirmInPerson(c.store, id, c.actor, { decision: 'decline', note: dto && dto.note }), baseFor(c, req)); }
}

/** The address approval links start with, and how long they live. */
@EngineController('sharing', 'Approvals')
export class SharingController {
  private view(c: EngineCtx, req: any) { const s = settingsOf(c); return { public_url: s.public_url || '', approval_expiry_days: approvals.expiryDays(s), base: baseFor(c, req), detected: approvals.lanAddress() }; }

  @Get() @EngineRoute({ noProduct: true })
  get(@Ctx() c: EngineCtx, @Req() req: any) { return this.view(c, req); }

  @Post() @EngineRoute({ noProduct: true })
  set(@Ctx() c: EngineCtx, @Body() dto: SharingDto, @Req() req: any) {
    const s = settingsOf(c);
    if (dto.public_url !== undefined) {
      const v = String(dto.public_url || '').trim();
      if (v && !/^https?:\/\/[^\s/]+(:\d+)?(\/.*)?$/i.test(v)) throw httpErr(422, 'The address must start with http:// or https:// and look like http://192.168.1.20:4317');
      s.public_url = v.replace(/\/+$/, '');
    }
    if (dto.approval_expiry_days !== undefined) { const n = Number(dto.approval_expiry_days); if (!(n >= 1 && n <= 365)) throw httpErr(422, 'Links can last from 1 to 365 days.'); s.approval_expiry_days = Math.round(n); }
    c.portfolio.saveRegistry();
    return this.view(c, req);
  }
}
