/**
 * engine/reports.ts - the portfolio report (funnel, stuck products, throughput, minutes owed, blockers, documents, freshness)
 * and the one-product status report, each with JSON, CSV and printable HTML variants.
 *
 * Words: everything a person reads is business language (see engine/plain.ts): "Stage 2 sign-off" not "Gate 2", "things still needed"
 * not "blockers", "Light / Standard / Thorough" not "L1 / L2 / L3", role names with capital letters.
 * Time owed by people has ONE source: the sum over products of (planned minutes - minutes done). The meeting and role lists below are
 * breakdowns of that same number. Minutes owed "by role" are by ROLE: a meeting's minutes are owed by everyone listed in the meeting's
 * `who` (split on "+"), because the data requests carry no individual assignee. This is stated in the response.
 */
import * as Q from './query';
import * as gates from './gates';
import * as compose from './compose';
import * as handoff from './handoff';
const handoffLib = handoff;
import * as requests from './requests';
import * as schema from './schema';
import * as summary from './summary';
import * as render from './compose_render';
import * as plain from './plain';
import * as stages from './stages';
import { snapshot } from './pstate';
import { daysBetween, addDays, dayOf } from './units';
import * as handoffMod from './handoff';
import * as unitsMod from './units';
import * as dashboardMod from './dashboard';

const STAGE_ORDER = ['idea', 'P0', 'P1', 'P2', 'P3', 'P4', 'handoff', 'done', 'parked'];
const critText = () => Object.fromEntries(gates.criteria().map((c) => [c.id, plain.needOf(c.id, c.text)]));
const decisionWord = (d) => String(d || '').replace(/_/g, ' ');

const csvCell = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (headers, rows) => [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
/** HTML table. Cells are escaped; a cell that is an object is never printed as "[object Object]" (it is flattened to its readable parts). */
const cellText = (c) => {
  if (c === undefined || c === null) return '';
  if (Array.isArray(c)) return c.map(cellText).join(', ');
  if (typeof c === 'object') return c.name || c.title || c.label || Object.entries(c).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ');
  return String(c);
};
const table = (headers, rows) => `<table><thead><tr>${headers.map((h) => `<th>${render.esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${render.esc(cellText(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Gates passed (go or go with conditions) in the last n days, from each product's gate decisions. */
function gatesPassedWithin(store, today, days) {
  const from = addDays(today, -days);
  return Object.values(store.data.gates || {}).filter((g: any) => g && ['Passed', 'Passed-with-conditions'].includes(g.state) && dayOf(g.decided_at) >= from && dayOf(g.decided_at) <= today)
    .map((g: any) => ({ gate: g.gate, stage: g.gate, decision: g.decision, decided_at: g.decided_at, decided_by: g.decided_by }));
}

/** GET /api/portfolio/report. portfolio = Portfolio instance; opts: {stuckDays} */
function portfolioReport(portfolio, opts: any = {}) {
  const stuckDays = Number(opts.stuckDays) > 0 ? Number(opts.stuckDays) : 14;
  const today = portfolio.today();
  const entries = portfolio.list();
  const rows = entries.map((e) => ({ entry: e, store: portfolio.store(e.id) }));
  portfolio.syncAll();
  const products = rows.map((r) => summary.portfolioRow(r.entry, r.store, { today }));

  const funnel = STAGE_ORDER.map((s) => ({ stage: s, label: plain.stageLabel(s), count: s === 'idea' ? portfolio.ideas().filter((i) => i.status === 'new' || i.status === 'shortlisted').length : products.filter((p) => p.stage === s).length }));
  const byStage = Object.fromEntries(STAGE_ORDER.filter((s) => s !== 'idea').map((s) => [s, products.filter((p) => p.stage === s).map((p) => ({ id: p.id, name: p.name, days_in_stage: p.days_in_stage }))]));
  const active = products.filter((p) => !['done', 'parked'].includes(p.stage));
  const dis = active.map((p) => p.days_in_stage).filter((x) => x !== null);
  const days_in_stage = { average: dis.length ? Math.round((10 * dis.reduce((a, b) => a + b, 0)) / dis.length) / 10 : null, maximum: dis.length ? Math.max(...dis) : null, longest: active.slice().sort((a, b) => (b.days_in_stage || 0) - (a.days_in_stage || 0)).slice(0, 3).map((p) => ({ id: p.id, name: p.name, stage: p.stage, stage_label: plain.stageLabel(p.stage), days: p.days_in_stage })) };
  const stuck = active.filter((p) => p.days_since_activity !== null && p.days_since_activity >= stuckDays).map((p) => ({ id: p.id, name: p.name, stage: p.stage, stage_label: plain.stageLabel(p.stage), days_since_activity: p.days_since_activity, last_activity: p.last_activity, what_happens_next: p.what_happens_next }));

  const passed30 = []; const passed90 = [];
  for (const r of rows) {
    for (const g of gatesPassedWithin(r.store, today, 90)) { const rec = { product_id: r.entry.id, product: r.entry.name, stage_label: plain.stageLabel(`P${g.gate}`), ...g }; passed90.push(rec); if (dayOf(g.decided_at) >= addDays(today, -30)) passed30.push(rec); }
  }

  // People's time owed: one source (the product rows), shown in total, by meeting and by role.
  const totalOwed = products.reduce((s, p) => s + (p.human_minutes_owed || 0), 0);
  const bySession = {}; const byRole = {};
  for (const r of rows) {
    const plan = requests.plan(r.store);
    for (const s of plan.sessions) {
      const open = plan.requests.filter((q) => q.session === (s as any).id && q.inDepth && !q.done && ['HUMAN', 'DOCUMENT'].includes(q.owner_kind));
      const mins = open.reduce((m, q) => m + q.minutes, 0);
      if (!mins) continue;
      const e = (bySession[(s as any).id] = bySession[(s as any).id] || { code: (s as any).id, title: (s as any).title, who: plain.whoText((s as any).who), minutes: 0, steps: 0, products: [] });
      e.minutes += mins; e.steps += open.length; e.products.push({ id: r.entry.id, name: r.entry.name, minutes: mins });
      for (const person of String((s as any).who || '').split('+').map((x) => plain.roleName(x)).filter(Boolean)) { const pr = (byRole[person] = byRole[person] || { person, minutes: 0, sessions: new Set() }); pr.minutes += mins; pr.sessions.add((s as any).id); }
    }
  }
  const owedSession = Object.values(bySession).sort((a: any, b: any) => b.minutes - a.minutes);
  const inMeetings = owedSession.reduce((s, x: any) => s + x.minutes, 0);
  if (totalOwed > inMeetings) owedSession.push({ code: '', title: 'Other questions that are not part of a meeting', who: '', minutes: totalOwed - (inMeetings as any), steps: 0, products: [] });
  const owedRole = Object.values(byRole).map((x: any) => ({ person: x.person, minutes: x.minutes, sessions: [...x.sessions].sort() })).sort((a, b) => b.minutes - a.minutes);

  // what holds products up
  const ct = critText(); const blockerMap = {};
  for (const r of rows) {
    const st = snapshot(r.store, { cache: true });
    if (st.nextGate >= 5) continue;
    for (const b of st.evals[st.nextGate].blockers) { const e = (blockerMap[b.id] = blockerMap[b.id] || { criterion: b.id, text: ct[b.id] || plain.clean(b.text), todo: plain.todoOf(b.id), products: [] }); e.products.push({ id: r.entry.id, name: r.entry.name, stage: st.nextGate, message: plain.clean(b.message) }); }
  }
  // products whose five stages are signed off are still held up by what is outstanding for the handoff
  for (const r of rows) {
    const st = snapshot(r.store, { cache: true });
    if (st.nextGate < 5) continue;
    const hs = handoffMod.status(r.store);
    if (hs.handed_off && !hs.exceptions) continue;
    const add = (key, text, todo) => { const e = (blockerMap[key] = blockerMap[key] || { criterion: key, text, todo, products: [] }); e.products.push({ id: r.entry.id, name: r.entry.name, stage: 4, message: hs.headline }); };
    if (!hs.handed_off) add('handoff', 'Nothing has been handed over to developers yet', 'Complete and approve a user story, then create its handoff package (Hand over to developers).');
    if (hs.exceptions) add('exceptions', 'Items were set aside by an exception instead of being finished', 'Finish the items, or let the exceptions run out and be renewed on purpose.');
  }
  const top_blockers = Object.values(blockerMap).map((b: any) => ({ ...b, product_count: b.products.length })).sort((a, b) => b.product_count - a.product_count || a.criterion.localeCompare(b.criterion)).slice(0, 12);

  const documents = products.map((p) => ({ id: p.id, name: p.name, approved: p.documents_approved, total: p.documents_total, avg_completeness: p.documents_avg_completeness }));
  const freshness = {
    totals: { stale: products.reduce((s, p) => s + p.stale_values, 0), due: products.reduce((s, p) => s + p.due_values, 0), suspect: products.reduce((s, p) => s + p.suspect_items, 0), unverified_agent_items: products.reduce((s, p) => s + p.unverified_agent_items, 0) },
    by_product: products.map((p) => ({ id: p.id, name: p.name, stale: p.stale_values, due: p.due_values, suspect: p.suspect_items, unverified: p.unverified_agent_items })),
  };
  return {
    as_of: today, stuck_after_days: stuckDays, counts: { products: products.length, ideas_open: funnel[0].count },
    stage_rule: plain.STAGE_RULE,
    funnel, products_by_stage: byStage, days_in_stage, stuck, throughput: { gates_passed_30d: passed30.length, gates_passed_90d: passed90.length, last_30d: passed30, last_90d: passed90 },
    human_minutes_owed: { total: totalOwed, by_session: owedSession, by_person: owedRole, person_basis: 'By role, not by named person: the questions are not assigned to individuals, so everyone in a meeting shares its minutes. The total is the sum over all products of the planned minutes not yet done.' },
    top_blockers, documents: { approved: documents.reduce((s, d) => s + d.approved, 0), total: documents.reduce((s, d) => s + d.total, 0), by_product: documents }, freshness,
    products: products.map((p) => ({ id: p.id, name: p.name, stage: p.stage, stage_label: p.stage_label, stage_warnings: p.stage_warnings, days_in_stage: p.days_in_stage, readiness_percent: p.readiness_percent, blocker_count: p.blocker_count, human_minutes_owed: p.human_minutes_owed, documents_approved: p.documents_approved, last_activity: p.last_activity })),
  };
}

function portfolioCsv(rep) {
  return toCsv(['Reference', 'Product', 'Stage', 'Days in stage', 'Percent ready', 'Things still needed', "Minutes of people's time owed", 'Documents approved', 'Last activity'],
    rep.products.map((p) => [p.id, p.name, p.stage_label || plain.stageLabel(p.stage), p.days_in_stage, p.readiness_percent, p.blocker_count, p.human_minutes_owed, p.documents_approved, p.last_activity]));
}
function portfolioHtml(rep) {
  const body = `<h1>Portfolio report</h1><p class="meta">As of ${render.esc(rep.as_of)}. ${rep.counts.products} products, ${rep.counts.ideas_open} open ideas. ${render.esc(rep.stage_rule)}</p>
<h2>Where products are</h2>${table(['Stage', 'Count'], rep.funnel.map((f) => [f.label, f.count]))}
<h2>Products</h2>${table(['Product', 'Stage', 'Days in stage', 'Percent ready', 'Things still needed', "Minutes of people's time owed", 'Documents approved (of 30)', 'Last activity'], rep.products.map((p) => [p.name, p.stage_label, p.days_in_stage, p.readiness_percent, p.blocker_count, p.human_minutes_owed, p.documents_approved, dayOf(p.last_activity)]))}
${rep.products.some((p) => (p.stage_warnings || []).length) ? `<h2>Please look at</h2><ul>${rep.products.flatMap((p) => (p.stage_warnings || []).map((w) => `<li>${render.esc(p.name)}: ${render.esc(w)}</li>`)).join('')}</ul>` : ''}
<h2>Quiet for ${rep.stuck_after_days} days or more</h2>${rep.stuck.length ? table(['Product', 'Stage', 'Days quiet'], rep.stuck.map((s) => [s.name, s.stage_label, s.days_since_activity])) : '<p>None.</p>'}
<h2>Stages signed off</h2><p>${rep.throughput.gates_passed_30d} in the last 30 days, ${rep.throughput.gates_passed_90d} in the last 90.</p>
<h2>People's time owed: ${rep.human_minutes_owed.total} minutes</h2>${table(['Meeting', 'Who', 'Minutes'], rep.human_minutes_owed.by_session.map((s) => [s.title, s.who, s.minutes]))}
<h2>What holds up the most products</h2>${table(['What is missing', 'Products held up'], rep.top_blockers.map((b) => [b.text, b.products.map((p) => p.name).join(', ')]))}
<h2>How fresh the data is</h2><p>${rep.freshness.totals.stale} values out of date, ${rep.freshness.totals.due} due for a refresh, ${rep.freshness.totals.suspect} items to take a second look at, ${rep.freshness.totals.unverified_agent_items} assistant findings nobody has checked.</p>`;
  return render.page('Portfolio report', unitsMod.datesInText(body));
}

/** GET /api/reports/product */
function productReport(entry, store) {
  const st = snapshot(store);
  const sum = summary.productSummary(entry, store);
  const docs = compose.list(store);
  const ctx = new Q.Ctx(store, { gate: 4 });
  const ho = handoff.readiness(ctx);
  const ct = critText();
  const risks = store.list('Risk', (r) => !['Closed'].includes(r.status)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10).map((r) => ({ id: r.id, title: r.title, score: r.score || null, owner: r.owner || null, status: r.status, category: r.category || null }));
  const decisions = store.list('Decision').map((d) => ({ id: d.id, title: plain.clean(d.title), kind: d.kind, status: d.status, chosen: d.chosen ? decisionWord(d.chosen) : null, decided_on: d.decided_on || null, decider: d.decider || null }));
  const waivers = store.list('Waiver', null).map((w) => ({ id: w.id, criterion: w.criterion_id || null, what: w.criterion_id ? ct[w.criterion_id] || w.criterion_id : null, gate: w.gate === undefined ? null : w.gate, status: w.status, approver: w.approver, expiry_on: w.expiry_on || null, rationale: w.rationale }));
  const conditions = store.list('Condition').map((c) => ({ id: c.id, text: c.text, owner: c.owner, status: c.status, must_close_by_gate: c.must_close_by_gate }));
  const phases = st.evals.map((ev, i) => ({ phase: i, name: dashboardMod.PHASE_NAMES[i], label: plain.stageName(i), gate_state: ev.state, state_text: plain.stateText(ev), nothing_written: !ev.summary.written, readiness: ev.summary.readiness, must_ok: ev.summary.mustOk, must_total: ev.summary.mustTotal, blockers: ev.blockers.map((b) => ({ id: b.id, text: ct[b.id] || plain.clean(b.text), message: plain.clean(b.message) })), decided_on: ev.decision ? dayOf(ev.decision.decided_at) : null, decision: ev.decision ? decisionWord(ev.decision.decision) : null }));
  return {
    as_of: st.today, product: sum.product, one_liner: sum.one_liner, what_happens_next: sum.next.what_happens_next, stage_rule: plain.STAGE_RULE, stage_warnings: sum.stage_warnings,
    progress: { overall_documents_percent: Math.round(docs.reduce((s, d) => s + d.completeness, 0) / docs.length), phases },
    documents: { completed: docs.filter((d) => d.status === 'approved').map((d) => ({ key: d.key, title: d.title, approved_by: d.approved_by, approved_at: d.approved_at })), pending: docs.filter((d) => d.status !== 'approved').map((d) => ({ key: d.key, title: d.title, status: d.status, completeness: d.completeness, missing_count: d.missing_count })) },
    risks, decisions, waivers, conditions,
    handoff: handoffLib.status(store),
    handoff_readiness: { ready_stories: ho.ready, total_stories: ho.total, not_ready: ho.stories.filter((s) => !s.ready).slice(0, 10).map((s) => ({ id: s.id, title: s.title, reasons: s.reasons.map(plain.clean) })) },
    headline_numbers: sum.headline_numbers,
  };
}
const stageNote = (p) => (p.nothing_written ? 'nothing written yet' : `${p.readiness}% ready`);
function productCsv(rep) {
  const rows = [];
  for (const p of rep.progress.phases) rows.push(['Stage', p.label + ': ' + p.name, p.state_text, stageNote(p) + (p.nothing_written ? '' : `; ${p.must_ok} of ${p.must_total} required items done`), p.blockers.map((b) => b.text).join('; ')]);
  for (const d of rep.documents.completed) rows.push(['Document approved', d.title, 'approved', d.approved_by || '', d.approved_at ? dayOf(d.approved_at) : '']);
  for (const d of rep.documents.pending) rows.push(['Document still to finish', d.title, d.status.replace('_', ' '), `${d.completeness}% complete`, `${d.missing_count} ${d.missing_count === 1 ? 'part' : 'parts'} missing`]);
  for (const r of rep.risks) rows.push(['Risk', r.title, r.status, `score ${r.score}`, r.owner]);
  for (const d of rep.decisions) rows.push(['Decision', d.title, d.status, d.chosen, d.decider]);
  for (const w of rep.waivers) rows.push(['Exception (waiver)', w.what || '', w.status, w.rationale, `${w.approver}; ends ${w.expiry_on || 'at a stage sign-off'}`]);
  for (const c of rep.conditions) rows.push(['Follow-up to close', c.text, c.status, `to close by the Stage ${c.must_close_by_gate} sign-off`, c.owner]);
  rows.push(['Handoff to developers', rep.handoff.headline, rep.handoff.handed_off ? 'handed over' : 'not handed over', `${rep.handoff.stories_approved} stories approved, ${rep.handoff.stories_ready} ready, ${rep.handoff.packages} packages`, rep.handoff.outstanding.join(' ')]);
  return toCsv(['Section', 'Item', 'Status', 'Detail', 'Owner or note'], rows);
}
function productHtml(rep) {
  const body = `<h1>${render.esc(rep.product.name)}: status report</h1><p class="meta">As of ${render.esc(rep.as_of)} | ${render.esc(rep.product.stage_label || plain.stageLabel(rep.product.stage))} | ${render.esc(rep.product.thoroughness || plain.THOROUGHNESS[rep.product.depth_level] || '')} thoroughness</p>
<p>${render.esc(rep.what_happens_next)}</p>${(rep.stage_warnings || []).length ? `<p><strong>Please look at:</strong> ${render.esc(rep.stage_warnings.map((w) => w.text).join(' '))}</p>` : ''}
<h2>Progress by stage</h2>${table(['Stage', 'Where it stands', 'Percent ready', 'Required items done', 'Decision', 'Still needed'], rep.progress.phases.map((p) => [p.label + ': ' + p.name, p.state_text, p.nothing_written ? 'nothing written yet' : p.readiness, `${p.must_ok} of ${p.must_total}`, p.decision ? `${p.decision} on ${p.decided_on}` : '', p.blockers.map((b) => b.text).join('; ')]))}
<h2>Documents</h2>${table(['Document', 'Status', 'Percent complete', 'Parts missing'], rep.documents.completed.map((d) => [d.title, 'approved', 100, 0]).concat(rep.documents.pending.map((d) => [d.title, d.status.replace('_', ' '), d.completeness, d.missing_count])))}
<h2>Risks</h2>${table(['Risk', 'Score', 'Owner', 'Status'], rep.risks.map((r) => [r.title, r.score, r.owner, r.status]))}
<h2>Decisions</h2>${table(['Decision', 'Status', 'Chosen', 'Decided by'], rep.decisions.map((d) => [d.title, d.status, d.chosen, d.decider]))}
<h2>Exceptions and follow-ups</h2>${table(['Item', 'Status', 'Detail'], rep.waivers.map((w) => [w.what || 'Exception', w.status, `${w.rationale} (approved by ${w.approver})`]).concat(rep.conditions.map((c) => ['Follow-up', c.status, `${c.text} (owner ${c.owner}, to close by the Stage ${c.must_close_by_gate} sign-off)`])))}
<h2>Handoff to developers</h2><p><strong>${render.esc(rep.handoff.headline)}</strong></p>${rep.handoff.outstanding.length ? `<ul>${rep.handoff.outstanding.map((o) => `<li>${render.esc(o)}</li>`).join('')}</ul>` : ''}<p>${rep.handoff_readiness.ready_stories} of ${rep.handoff_readiness.total_stories} approved stories are ready.</p>`;
  return render.page(`${rep.product.name} status report`, unitsMod.datesInText(body));
}

export { portfolioReport, portfolioCsv, portfolioHtml, productReport, productCsv, productHtml, toCsv };
