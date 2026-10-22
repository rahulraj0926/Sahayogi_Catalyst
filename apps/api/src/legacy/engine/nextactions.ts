/**
 * engine/nextactions.ts - "what should I do next?", ranked by blocking value per minute.
 *
 * Action kinds: data_request (open human/document requests), agent_task (research the agent can do),
 * verification (agent-found values awaiting a different person), stale_refresh (competitor values and evidence
 * past their age limit), suspect_review (items whose upstream changed), attestation (a person must sign a gate check),
 * document_approval (documents ready or waiting for approval).
 * value  = how much it unblocks: 3 per blocking (Must) gate check, 1 per advisory check, doubled for the next gate.
 * ranked by value / minutes. Text is written for a non-technical reader; minutes are planning estimates, not measurements.
 */
import * as gates from './gates';
import * as compose from './compose';
import * as requests from './requests';
import { snapshot } from './pstate';
import * as plain from './plain';
import * as stages from './stages';
import * as handoffMod from './handoff';

const critText = Object.fromEntries(gates.criteria().map((c) => [c.id, plain.needOf(c.id, c.text)]));

/** Short, plain verb phrases (at most 8 words) for the long step titles. Every other title is used as it is. */
const SHORT = {
  'DR-0-01': 'Name the product and its thoroughness', 'DR-0-02': 'Describe the problem and the result', 'DR-0-16': 'Paste in a memo or brief', 'DR-0-06': 'State the budget and the fixed date',
  'DR-0-08': 'List your unproved assumptions', 'DR-0-11': 'Draw the first scope line', 'DR-0-12': 'Agree effort and cost for next stage', 'DR-1-01': 'Name your target customer groups',
  'DR-1-02': 'Rank the jobs customers need done', 'DR-1-09': 'Get a second person to check findings', 'DR-1-12': 'Paste survey results or sales notes', 'DR-1-05': 'Plan tests for the riskiest assumptions',
  'DR-1-17': 'List the laws and standards that apply', 'DR-1-07': 'Legal signs off the laws list', 'DR-1-18': 'Add two real customer quotes', 'DR-2-03': 'List what you will build, by priority',
  'DR-2-07': 'List what is not in version 1', 'DR-2-05': 'Tell us the team capacity', 'DR-2-06': 'Plan the first release', 'DR-3-01': 'Review the requirement drafts',
  'DR-3-02': 'State your own business rules', 'DR-3-05': 'Confirm the user type of each story', 'DR-4-01': 'Name the main flows', 'DR-4-03': 'Describe the life cycle of the main thing',
  'DR-4-05': 'Confirm flows were walked through', 'DR-4-07': 'Decide: move on and hand over',
};
const words8 = (t, n = 8) => { const w = String(t || '').replace(/\s+/g, ' ').trim().split(' '); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' '); };
/** The plain verb phrase of one action, at most 8 words, no ids, no trailing full stop. */
function plainTitle(a) {
  const ref = a.ref || (a.id || '').replace(/^[A-Z]+:/, '');
  if (a.kind === 'data_request' || a.kind === 'agent_task') {
    const t = a.kind === 'agent_task' ? String(a.title).replace(/^Research task for an AI helper:\s*/, '') : a.title;
    return SHORT[ref] || words8(t.replace(/:.*$/, ''));
  }
  if (a.kind === 'verification') { const n = (a.items || []).length; return n ? `Check ${n} fact${n === 1 ? '' : 's'} someone else entered` : 'Check facts someone else entered'; }
  if (a.kind === 'stale_refresh') return words8(a.title.replace(/^Re-check soon: /, 'Re-check ').replace(/^Refresh: /, 'Refresh '));
  if (a.kind === 'suspect_review') return words8(a.title.replace(/^Take a second look at "(.*?)".*$/, 'Re-check $1'));
  if (a.kind === 'attestation') return words8(a.title.replace(/:.*$/, ''));
  if (a.kind === 'document_approval') return words8(a.title.replace(/ \(waiting for review\)/, '').replace(/^Approve "(.*)"$/, 'Approve the $1 document').replace(/^Send "(.*)" for review$/, 'Send the $1 document for review'));
  return words8(a.title);
}
/** One line for the Next step bar: at most 12 words. */
const nextPhrase = (a) => { const t = plainTitle(a); return `Next: ${t.charAt(0).toLowerCase() + t.slice(1)}, ${a.minutes} min`; };
const round1 = (x) => Math.round(x * 100) / 100;

function reqRoute(r) {
  return { ui: `#/plan?request=${r.id}`, session: r.session || null, form_api: `GET /api/requests/${r.id}`, answer_api: r.owner_kind === 'AGENT_RESEARCH' ? 'POST /api/agent/ingest' : `POST /api/requests/${r.id}/answer`, session_api: r.session ? `POST /api/sessions/${r.session}/steps/${r.id}` : null };
}

function whyFor(r) {
  const c = r.criteriaImpact || [];
  if (!c.length) return 'It fills in more of your documents. Nothing is held up by it right now.';
  const musts = c.filter((x) => x.severity === 'must');
  const first = c[0];
  return `It removes ${musts.length ? `${musts.length} ${musts.length === 1 ? 'thing' : 'things'} holding up` : `${c.length} recommended ${c.length === 1 ? 'item' : 'items'} for`} the Stage ${first.gate} sign-off, for example: "${critText[first.id] || first.id}"${c.length > 1 ? ` and ${c.length - 1} more` : ''}.`;
}

/** Build the full list of ranked actions for one product. */
function build(store, opts: any = {}) {
  const st = opts.state || snapshot(store);
  const out = [];
  const gateNo = st.nextGate;
  const add = (a) => out.push({ ...a, value_per_minute: round1(a.value / Math.max(1, a.minutes)), value: round1(a.value) });

  // 1 and 2: data requests (people) and agent research tasks. Value counts blocking checks at the next gate in full and
  // checks at later gates at a quarter (they cannot be cleared yet).
  const attestCovered = new Set(st.plan.requests.filter((r) => !r.done && r.form && r.form.special === 'attest').map((r) => r.form.criterion));
  for (const r of st.plan.requests) {
    if (!r.inDepth || r.done || r.status === 'blocked') continue;
    const worth = (r.criteriaImpact || []).reduce((sum, c) => sum + (c.severity === 'must' ? 3 : 1) * (c.gate <= gateNo ? 2 : 0.25), 0);
    const base = worth || (r.phase === st.phaseNo ? 0.4 : 0.1);
    if (['HUMAN', 'DOCUMENT'].includes(r.owner_kind)) {
      add({ id: `REQ:${r.id}`, kind: 'data_request', title: r.title, detail: r.ask, why: whyFor(r), minutes: r.minutes, value: base, blocks: (r.criteriaImpact || []).map((c) => c.id), phase: r.phase, owner_kind: r.owner_kind, route: reqRoute(r), ref: r.id });
    } else if (r.owner_kind === 'AGENT_RESEARCH' && r.agent && r.agent.state === 'prompt_ready') {
      add({ id: `AGT:${r.id}`, kind: 'agent_task', title: `Research task for an AI helper: ${r.title}`, detail: r.ask, why: whyFor(r), minutes: 3, value: base, blocks: (r.criteriaImpact || []).map((c) => c.id), phase: r.phase, owner_kind: r.owner_kind, route: reqRoute(r), ref: r.id });
    }
  }

  // 3: verification queue, one action per submitting request/batch
  const batches = {};
  for (const q of st.queue) (batches[q.request_id || 'adhoc'] = batches[q.request_id || 'adhoc'] || []).push(q);
  for (const [rid, items] of Object.entries(batches)) {
    const req = rid !== 'adhoc' ? requests.get(rid) : null;
    add({
      id: `VER:${rid}`, kind: 'verification', title: `Check ${(items as any).length} ${(items as any).length === 1 ? 'fact' : 'facts'} waiting for a second person${req ? ` (${req.title.toLowerCase()})` : ''}`,
      detail: `Open each source and confirm the fact. Mark it as checked and write down where you checked it, or reject it. It must be someone other than the person who typed it in or asked for it. Facts: ${(items as any).slice(0, 5).map((i) => i.title || i.id).join('; ')}${(items as any).length > 5 ? '; and more' : ''}.`,
      why: 'Ratings, prices and customer words do not count toward any stage sign-off until a different person has checked them.', minutes: Math.max(4, Math.min(40, (items as any).length * 3)), value: Math.min(6, (items as any).length * 0.8) * (gateNo === 1 ? 2 : 1), blocks: ['G1-04', 'G1-20'], phase: 1, route: { ui: '#/go/checks', list_api: 'GET /api/agent/queue', verify_api: 'POST /api/agent/verify/:id' }, ref: rid, items: (items as any).map((i) => i.id),
    });
  }

  // 4: stale values and evidence to refresh
  for (const s of st.stale.slice(0, 25)) {
    const isStale = s.state === 'stale';
    add({
      id: `STL:${s.id}`, kind: 'stale_refresh', title: `${isStale ? 'Refresh' : 'Re-check soon'}: ${s.title}`, detail: s.reason || `${s.ageDays} days old`,
      why: isStale ? 'It is too old, so it no longer counts and the Stage 1 sign-off is held up.' : 'It will be too old soon. Refreshing it now avoids a problem later.', minutes: s.type === 'Evidence' ? 10 : 8, value: isStale ? (s.type === 'Evidence' ? 1.2 : (gateNo <= 1 ? 6 : 1.5) / Math.sqrt(Math.max(1, st.stale.filter((x) => x.state === 'stale').length))) : 0.4, blocks: isStale && s.type !== 'Evidence' ? ['G1-04b'] : [], phase: s.type === 'Evidence' ? 0 : 1, route: { ui: `#/item/${s.id}`, item_api: `GET /api/items/${s.id}`, update_api: `PATCH /api/items/${s.id}` }, ref: s.id,
    });
  }

  // 5: suspect items needing review
  for (const s of st.suspect.slice(0, 25)) {
    const approved = ['Approved', 'Validated', 'Confirmed'].includes(s.status);
    add({
      id: `SUS:${s.id}`, kind: 'suspect_review', title: `Take a second look at "${s.title}": something it depends on changed`, detail: `What changed: ${[...new Set(s.causes.map((c) => { const it = st.store.get(c); return it ? it.title : plain.clean(c); }))].join('; ')}.`,
      why: approved ? 'It was approved, but it may no longer be true. Confirm it, or fix it, so it does not hold up a stage sign-off.' : 'Something it depends on changed after it was written.', minutes: 4, value: approved ? 6 / Math.sqrt(Math.max(1, st.suspect.length)) : 0.6, blocks: approved ? ['GC-04'] : [], phase: typeof (st.store.get(s.id) || {}).phase === 'number' ? st.store.get(s.id).phase : 0, route: { ui: `#/item/${s.id}`, item_api: `GET /api/items/${s.id}`, clear_api: `POST /api/items/${s.id}/clear` }, ref: s.id,
    });
  }

  // 6: gate attestations for the next undecided gate
  if (gateNo < 5) {
    for (const r of st.evals[gateNo].results.filter((x) => x.status === 'ATTEST_PENDING' && !attestCovered.has(x.id))) {
      add({ id: `ATS:${r.id}`, kind: 'attestation', title: `${r.attest_required ? plain.roleName(r.attest_required.role) : 'A named person'} signs off: ${plain.lowerFirst(plain.needOf(r.id, r.text))}`, detail: r.attest_required ? plain.clean(r.attest_required.statement) : plain.clean(r.message), why: `The Stage ${gateNo} sign-off cannot happen until a person in that role signs this.`, minutes: 3, value: 3 * 2, blocks: [r.id], phase: gateNo, route: { ui: '#/gates', attest_api: `POST /api/gates/${gateNo}/attest` }, ref: r.id });
    }
  }

  // 7: documents awaiting approval
  const min = compose.threshold(st.store);
  for (const d of compose.list(st.store)) {
    if (d.status === 'in_review') add({ id: `DOC:${d.key}`, kind: 'document_approval', title: `Approve "${d.title}" (waiting for review)`, detail: `${d.completeness}% complete, ${d.missing_count} item(s) missing.`, why: d.completeness >= min ? 'It is complete enough to approve.' : `It is below ${min}% complete. Finish the missing parts, or approve it with a named second approver.`, minutes: 10, value: d.completeness >= min ? 1.2 : 0.5, blocks: [], phase: d.phase, route: { ui: `#/documents/${d.key}`, doc_api: `GET /api/documents/${d.key}`, status_api: `POST /api/documents/${d.key}/status` }, ref: d.key });
    else if (d.status === 'draft' && d.completeness >= min && d.phase <= Math.min(4, st.phaseNo)) add({ id: `DOC:${d.key}`, kind: 'document_approval', title: `Send "${d.title}" for review`, detail: `${d.completeness}% complete.`, why: 'It has enough content to be reviewed and approved.', minutes: 5, value: 0.6, blocks: [], phase: d.phase, route: { ui: `#/documents/${d.key}`, doc_api: `GET /api/documents/${d.key}`, status_api: `POST /api/documents/${d.key}/status` }, ref: d.key });
  }

  out.sort((a, b) => b.value_per_minute - a.value_per_minute || b.value - a.value || a.minutes - b.minutes || a.id.localeCompare(b.id));
  out.forEach((a, i) => { a.rank = i + 1; a.plain_title = plainTitle(a); });
  return out;
}

/** One plain sentence on what happens next for this product. */
function whatNext(store, actions, st) {
  st = st || snapshot(store);
  const p = st.prod;
  if (p && p.status === 'Killed') return 'This product was stopped at a stage sign-off. Nothing happens next unless someone reopens it.';
  if (p && p.status === 'On hold') return 'This product is on hold. Resume it before any more work is planned.';
  const g = st.nextGate; // the earliest stage whose sign-off has not passed (engine/stages.ts)
  const early = stages.outOfOrder(store).map((w) => ` Note: ${w.text}`).join('');
  if (g >= 5) { const hs = handoffMod.status(store); return `${hs.headline} ${hs.handed_off ? 'Create more packages as more stories become ready.' : 'Next: ' + (hs.stories_approved ? 'create the handoff package for a ready story.' : 'complete and approve a user story, then create its handoff package.')}${early}`; }
  const ev = st.evals[g];
  const top = actions[0];
  const label = plain.stageName(g);
  if (ev.summary.evaluated === 0 || (!ev.summary.written && !ev.decision)) return `${label} has not started. Start with: ${top ? `${top.title} (about ${top.minutes} minutes)` : 'the first question'}.${early}`;
  if (!ev.blockers.length) return `Everything required for ${label} is in place. Next: make the Stage ${g} sign-off decision${ev.eligible.includes('go') ? '' : ' (you can go ahead with follow-ups to close later)'}.${early}`;
  const b = ev.blockers;
  const sample = b.slice(0, 2).map((x) => plain.lowerFirst(plain.needOf(x.id, x.text)).replace(/\.$/, '')).join('; and ');
  const mins = actions.filter((a) => a.blocks.some((c) => b.some((x) => x.id === c))).reduce((s, a) => s + a.minutes, 0);
  return `${label} cannot be signed off yet: ${b.length} ${b.length === 1 ? 'thing is' : 'things are'} still needed, for example: ${sample}.${top ? ` Best next step: ${top.title} (about ${top.minutes} minutes).` : ''}${mins ? ` About ${mins} minutes of listed work goes towards these.` : ''}${early}`;
}

/** Product-scoped result. */
function forProduct(store, opts: any = {}) {
  const st = opts.state || snapshot(store);
  const actions = build(store, { state: st });
  const limit = opts.limit ? Number(opts.limit) : null;
  const kind = opts.kind || null;
  let list = kind ? actions.filter((a) => a.kind === kind) : actions;
  if (limit) list = list.slice(0, limit);
  const prod = st.prod;
  return {
    product: prod ? { name: prod.name, stage_gate: st.nextGate } : null, as_of: st.today, total: actions.length, minutes_total: actions.reduce((s, a) => s + a.minutes, 0),
    by_kind: actions.reduce((m, a) => { m[a.kind] = (m[a.kind] || 0) + 1; return m; }, {}), what_happens_next: whatNext(store, actions, st), actions: list,
  };
}

export { build, forProduct, whatNext, plainTitle, nextPhrase, SHORT };
