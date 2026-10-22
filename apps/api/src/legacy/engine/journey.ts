/**
 * engine/journey.ts - the whole journey of one product in one answer, for GET /api/journey.
 *
 * Seven steps: Idea, Intake, Market, Scope, Requirements, Flows, Hand-over.  Steps 1 to 5 are the five stages (sign-offs 0 to 4),
 * built from engine/stages.ts (which stage is open), engine/sessions.ts (the question sessions and their steps), engine/approvals.ts
 * (who has to decide) and engine/nextactions.ts (plain wording of the next step). Nothing here changes a rule or a gate: it only reads.
 *
 * Shape:
 *   product      { id, name, one_liner, owner }
 *   stages[7]    { n, key, name, status: done|current|waiting|todo, progress 0..100, tasks_done, tasks_total, starts_after, waiting_on, signed_off_on, href }
 *   current      the number (0..6) of the step the product is in
 *   tasks[]      the checklist of the current step: { n, id, title, minutes, who: you|assistant|other, who_name, status: done|next|todo|waiting|blocked, kind, href, note }
 *   plan         the question sessions of the current step: who comes, what to bring, minutes ("Session plan")
 *   next         { kind: task|waiting|done, phrase, title, minutes, who, href, button, session, step }
 *   waiting      { for_you: { approvals, checks, total, href, text }, for_others: { count, text, items[] } }
 *   handover     { bullets[] (at most 3), stories_total, stories_approved, packages, handed_off }
 *   warnings     stage sign-offs given out of order (short sentences)
 */
import * as stages from './stages';
import * as sessions from './sessions';
import * as approvals from './approvals';
import * as nextactions from './nextactions';
import * as handoffLib from './handoff';
import * as agent from './agent';
import { snapshot } from './pstate';
import * as floweditMod from './flowedit';

const STEPS = [
  { key: 'idea', name: 'Idea' }, { key: 'intake', name: 'Intake', gate: 0 }, { key: 'market', name: 'Market', gate: 1 }, { key: 'scope', name: 'Scope', gate: 2 },
  { key: 'requirements', name: 'Requirements', gate: 3 }, { key: 'flows', name: 'Flows', gate: 4 }, { key: 'handover', name: 'Hand-over' },
];
/** Short names for the question sessions (at most 8 words); the engine titles are long. */
const SESSION_NAMES = {
  'S0-A': 'Kick-off with the sponsor', 'S0-B': 'Limits, assumptions and risks', 'S0-C': 'Open questions and scope line',
  'S1-A': 'Customers and competitors', 'S1-B': 'Positioning and risks',
  'S2-A': 'Scope workshop', 'S2-B': 'Capacity and release plan',
  'S3-A': 'Requirements walkthrough', 'S3-B': 'Quality review',
  'S4-A': 'Flow walkthrough', 'S4-B': 'Hand-over readiness',
};
const clipWords = (t, n = 8) => { const w = String(t || '').replace(/\s+/g, ' ').trim().split(' '); return w.length <= n ? w.join(' ') : w.slice(0, n).join(' '); };
const sessionName = (s) => SESSION_NAMES[s.code] || clipWords(String(s.title || '').replace(/ and the Stage \d sign-off$/i, '').replace(/, [^,]*the Stage \d sign-off$/i, ''));
const enc = encodeURIComponent;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'someone';
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** What an approval is about, as a verb phrase: "sign off Market", "approve the Intake Document". */
function approvalWhat(a) {
  const t = String(a.title || '');
  let m = /^Sign off: Stage (\d) \((.*)\)$/.exec(t);
  if (m) return `sign off ${m[2]}`;
  m = /^Approve "(.*)"$/.exec(t) || /^Approve document: (.*)$/.exec(t);
  if (m) return `approve the ${m[1]}`;
  m = /^Approve user story: (.*)$/.exec(t);
  if (m) return `approve the story "${clipWords(m[1], 5)}"`;
  return lowerFirst(clipWords(t.replace(/:\s*/, ' '), 7));
}

function waitingOf(store, actor) {
  const base = 'http://localhost';
  const ov = approvals.overview(store, actor, { url: base });
  const me = ov.for_you.map((a) => ({ id: a.id, title: a.title, what: approvalWhat(a), stage: a.stage, kind: a.kind }));
  const others = ov.waiting.filter((a) => !same(a.approver, actor)).map((a) => ({ id: a.id, approver: a.approver, what: approvalWhat(a), stage: a.stage, kind: a.kind, title: a.title, prepared_by: a.prepared_by }));
  const queue = agent.queue(store);
  const mineCheck = (i) => [i.entered_by, i.proposed_by].some((n) => n && same(n, actor));
  const checksForYou = queue.filter((i) => !mineCheck(i)).length;
  const checksByYou = queue.length - checksForYou;
  return { ov, me, others, queue, checksForYou, checksByYou };
}

function build(store, entry, opts: any = {}) {
  const actor = opts.actor || 'Kanishk';
  const ctx = opts.ctx || { kind: (entry && entry.kind) || 'software', audience: 'sold' };
  const pid = entry.id;
  const st = snapshot(store, { cache: true }); // the same state is reused until something is saved
  const sess = sessions.list(store, { forms: false, ctx });
  const W = waitingOf(store, actor);
  const brief = store.list('IntakeBrief')[0] || null;
  const oneLiner = entry.one_liner || (brief && brief.idea ? String(brief.idea).split(/[.\n]/)[0] : '');
  const hs = handoffLib.status(store);
  const open = stages.earliestOpen(store);
  // the idea card: name, one line, who it is for, why now, who asked. A product that already has answers beyond it counts as having an idea.
  const idea = entry.idea || {};
  const ideaFacts = [entry.name, oneLiner, idea.who_for, idea.why_now, idea.asked_by || entry.owner].map((x) => String(x || '').trim());
  const cardFilled = ideaFacts.every(Boolean);
  const started = open > 0 || !!brief || Object.values(store.data.requestState || {}).some((r: any) => r && r.status === 'answered');
  const ideaDone = !!(entry.name && oneLiner && entry.owner) && (cardFilled || started);
  const current = !ideaDone ? 0 : open < 5 ? open + 1 : 6;
  const base = `#/p/${enc(pid)}`;

  const phaseSessions = (n) => ((sess.phases.find((p) => p.phase === n) || {}).sessions || []);
  const waitingStage = (n) => W.ov.waiting.find((a) => a.kind === 'stage_decision' && a.stage === n);
  const doneStatus = (s) => ['done', 'not_applicable', 'skipped'].includes(s.status);

  // ---- stages ------------------------------------------------------------------------------------------------------------
  const out = STEPS.map((s, i) => ({ n: i, key: s.key, name: s.name, gate: s.gate === undefined ? null : s.gate, status: 'todo', progress: 0, tasks_done: 0, tasks_total: 0, starts_after: i > 0 ? STEPS[i - 1].name : null, waiting_on: null, signed_off_on: null, signed_off_by: null, href: `${base}?stage=${i}` }));
  out[0].tasks_total = 5; out[0].tasks_done = ideaFacts.filter(Boolean).length; out[0].progress = Math.round((out[0].tasks_done / 5) * 100); out[0].status = ideaDone ? 'done' : 'current';
  for (let g = 0; g < 5; g++) {
    const o = out[g + 1]; const ss = phaseSessions(g);
    const steps = ss.flatMap((x) => x.steps.filter((y) => y.in_depth && y.kind !== 'gate_decision'));
    o.tasks_total = steps.length; o.tasks_done = steps.filter(doneStatus).length;
    const passed = stages.isPassed(store, g);
    o.progress = passed ? 100 : steps.length ? Math.round((o.tasks_done / steps.length) * 100) : 0;
    if (passed) {
      o.status = 'done';
      const d = st.evals[g] && st.evals[g].decision;
      if (d) { o.signed_off_on = String(d.decided_at || '').slice(0, 10); o.signed_off_by = d.approved_by || d.decided_by || null; }
    } else if (current === g + 1) { const w = waitingStage(g); o.status = w ? 'waiting' : 'current'; o.waiting_on = w ? w.approver : null; }
  }
  const h = out[6];
  h.tasks_total = 3; h.tasks_done = (hs.stories_approved > 0 ? 1 : 0) + (hs.stories_ready > 0 ? 1 : 0) + (hs.handed_off ? 1 : 0);
  h.progress = Math.round((h.tasks_done / 3) * 100);
  h.status = hs.handed_off ? 'done' : current === 6 ? 'current' : 'todo';
  // the step that follows the current one says what it waits for
  out.forEach((o, i) => { if (o.status !== 'todo') o.starts_after = null; else if (i > 0) o.starts_after = STEPS[i - 1].name; });

  // ---- the checklist of the current step ---------------------------------------------------------------------------------
  function tasksFor(view) {
  const tasks = []; let plan = null;
  const push = (t) => tasks.push({ n: tasks.length + 1, minutes: 0, who: 'you', who_name: null, note: null, ...t });
  if (view === 0) {
    push({ id: 'idea-card', title: 'Fill in your idea', status: ideaDone ? 'done' : 'todo', kind: 'idea', href: `${base}/idea`, minutes: 2, note: ideaDone ? null : `${ideaFacts.filter(Boolean).length} of 5 filled in` });
  } else if (view >= 1 && view <= 5) {
    const g = view - 1; const ss = phaseSessions(g);
    plan = { stage: g, sessions: ss.map((x) => ({ code: x.code, title: sessionName(x), who_text: x.who_text, attendees: x.attendees, bring: x.bring, outcome: x.outcome, total_minutes: x.total_minutes, minutes_left: x.minutes_left, steps: x.steps.filter((y) => y.in_depth).map((y) => ({ id: y.request_id, short: nextactions.plainTitle({ kind: 'data_request', ref: y.request_id, title: y.title }) })) })), minutes_total: ss.reduce((m, x) => m + x.total_minutes, 0), minutes_left: ss.reduce((m, x) => m + x.minutes_left, 0) };
    let decisionStep = null; let decisionCode = null;
    for (const x of ss) {
      const all = x.steps.filter((y) => y.in_depth);
      const dec = all.find((y) => y.kind === 'gate_decision'); if (dec) { decisionStep = dec; decisionCode = x.code; }
      const steps = all.filter((y) => y.kind !== 'gate_decision');
      if (!steps.length) continue;
      const left = steps.filter((y) => !doneStatus(y));
      const actionable = left.find((y) => ['ready', 'in_progress'].includes(y.status));
      const aprWait = left.find((y) => y.approval_waiting);
      let status = 'todo'; let who = 'you'; let who_name = null; let note = null;
      if (!left.length) status = 'done';
      else if (!actionable && aprWait) { status = 'waiting'; who = 'other'; who_name = aprWait.approval_waiting.approver; note = `Waiting for ${who_name}`; }
      else if (!actionable) { status = left.some((y) => y.waiting_for_check) ? 'waiting' : 'blocked'; if (status === 'blocked') note = 'Opens after the steps above'; else { who = 'other'; note = 'Waiting for a second person to check'; } }
      else if (['AGENT_RESEARCH', 'DERIVED'].includes(actionable.owner_kind)) who = 'assistant';
      else if (actionable.kind === 'attestation') { who = 'other'; }
      push({ id: x.code, title: sessionName(x), minutes: left.reduce((m, y) => m + (y.minutes || 0), 0) || steps.reduce((m, y) => m + (y.minutes || 0), 0), who, who_name, status, kind: 'session', session: x.code, step: actionable ? actionable.request_id : null, step_title: actionable ? actionable.title : null, step_minutes: actionable ? actionable.minutes : null, step_id: actionable ? actionable.request_id : null, steps_done: steps.length - left.length, steps_total: steps.length, note,
        href: `${base}/work/${enc(x.code)}${actionable ? `?step=${enc(actionable.request_id)}` : ''}` });
    }
    if (view === 5) { // Stage 4: the stories must be approved before the sign-off (the hand-over check wants an approved story), and the flows written out
      push({ id: 'stories-approve', title: hs.stories_total ? `Get the user stories approved (${hs.stories_approved} of ${hs.stories_total})` : 'Get the user stories approved', minutes: 10, who: 'you', status: hs.stories_approved > 0 && hs.stories_approved >= hs.stories_total ? 'done' : hs.stories_total ? 'todo' : 'blocked', kind: 'stories', href: hs.stories_total ? `${base}/people` : `${base}/stories`, note: hs.stories_total ? null : 'Opens when the stories are drafted' });
    }
    if (view === 5) { // Stage 4: write the flows out in plain words (the flow editor)
      const fl = floweditMod.list(store);
      const sessOpen = tasks.some((x) => x.kind === 'session' && x.status !== 'done');
      const needWork = fl.filter((x) => !x.ok || x.draft || !x.failure_paths);
      push({ id: 'flows-edit', title: fl.length ? 'Write out your flows' : 'Write out your flows (after the walkthrough)', minutes: Math.max(5, fl.length * 6), who: 'you', status: !fl.length ? 'blocked' : needWork.length ? (sessOpen ? 'todo' : 'todo') : 'done', kind: 'flows', href: fl.length === 1 ? `${base}/flows/${enc(fl[0].id)}/edit` : `${base}/flows`, note: !fl.length ? 'Opens after the flow walkthrough' : needWork.length ? `${needWork.length} of ${fl.length} flows still need steps or a failure path` : null });
    }
    if (W.queue.length) {
      const mine = W.checksForYou > 0;
      push({ id: 'checks', title: `Check ${W.queue.length} ${W.queue.length === 1 ? 'fact' : 'facts'} entered earlier`, minutes: Math.max(3, Math.min(30, W.queue.length * 3)), who: mine ? 'you' : 'other', who_name: mine ? null : 'a second person', status: mine ? 'todo' : 'waiting', kind: 'checks', href: `${base}/checks`, note: mine ? null : 'You entered these; a second person must check' });
    }
    const aprOther = W.others.filter((a) => a.kind !== 'stage_decision');
    if (aprOther.length) push({ id: 'approvals', title: `Get ${aprOther.length} ${aprOther.length === 1 ? 'approval' : 'approvals'}`, minutes: 0, who: 'other', who_name: aprOther.map((a) => a.approver).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 2).join(' and '), status: 'waiting', kind: 'approvals', href: `${base}/approvals`, note: 'Counts only after the named person decides' });
    const blockers = st.evals[g].blockers.length; const sw = waitingStage(g);
    const sessionsOpen = tasks.some((t) => t.kind === 'session' && t.status !== 'done');
    push({ id: `signoff-${g}`, title: `Sign off ${STEPS[g + 1].name}`, minutes: decisionStep ? decisionStep.minutes : 10, who: sw ? 'other' : 'you', who_name: sw ? sw.approver : null, status: stages.isPassed(store, g) ? 'done' : sw ? 'waiting' : (sessionsOpen || blockers) ? 'blocked' : 'todo', kind: 'signoff', session: decisionCode, step: decisionStep ? decisionStep.request_id : null,
      note: sw ? `Waiting for ${sw.approver}` : (sessionsOpen || blockers) ? (blockers ? `${blockers} ${blockers === 1 ? 'thing' : 'things'} still needed` : 'Opens after the steps above') : null,
      href: decisionStep ? `${base}/work/${enc(decisionCode)}?step=${enc(decisionStep.request_id)}` : `#/gates/${g}` });
  } else {
    const canStories = hs.stories_total > 0;
    push({ id: 'ho-stories', title: 'Finish and approve user stories', minutes: 20, who: 'you', status: hs.stories_approved > 0 && hs.stories_approved >= hs.stories_total ? 'done' : 'todo', kind: 'handover', href: `${base}/stories`, note: canStories ? `${hs.stories_approved} of ${hs.stories_total} approved` : 'No stories yet' });
    push({ id: 'ho-check', title: 'Check stories are ready for developers', minutes: 2, who: 'assistant', status: hs.stories_ready > 0 ? 'done' : 'blocked', kind: 'handover', href: `${base}/handoff`, note: hs.stories_ready ? `${hs.stories_ready} ready` : 'Opens after a story is approved' });
    push({ id: 'ho-send', title: 'Create the hand-over package', minutes: 3, who: 'you', status: hs.handed_off ? 'done' : hs.stories_ready > 0 ? 'todo' : 'blocked', kind: 'handover', href: `${base}/handoff`, note: hs.handed_off ? `${hs.packages} created` : null });
  }
  // exactly one row is the next task of the product: the first one a person can act on now
  let nextRow = null;
  const signing = tasks.some((t) => t.kind === 'signoff' && t.status === 'waiting');
  if (view === current && !signing) { nextRow = tasks.find((t) => ['todo'].includes(t.status) && t.who !== 'other') || tasks.find((t) => t.status === 'todo') || null; if (nextRow) nextRow.status = 'next'; }
  return { tasks, plan, nextRow };
  }
  const cur = tasksFor(current); const tasks = cur.tasks; const nextRow = cur.nextRow;
  const view = opts.stage !== undefined && opts.stage !== null && opts.stage >= 0 && opts.stage <= 6 ? opts.stage : current;
  const shown = view === current ? cur : tasksFor(view);

  // ---- the waiting lines -------------------------------------------------------------------------------------------------
  const forYouTotal = W.me.length + W.checksForYou;
  const parts = [];
  if (W.me.length) parts.push(`${W.me.length} ${W.me.length === 1 ? 'approval' : 'approvals'}`);
  if (W.checksForYou) parts.push(`${W.checksForYou} ${W.checksForYou === 1 ? 'check' : 'checks'}`);
  const forYou = { approvals: W.me.length, checks: W.checksForYou, total: forYouTotal, text: parts.length ? `Waiting for you: ${parts.join(' and ')}` : null, href: W.me.length ? `${base}/approvals` : `${base}/checks`, items: W.me.slice(0, 3) };
  const othersText = (() => {
    const o = W.others;
    if (!o.length) return null;
    if (o.length === 1) return `Waiting for ${o[0].approver} to ${o[0].what}`;
    const names = o.map((a) => a.approver).filter((v, i, arr) => arr.indexOf(v) === i);
    return names.length === 1 ? `Waiting for ${names[0]} to decide ${o.length} things` : `Waiting for ${names[0]} and ${o.length - 1} more to decide`;
  })();
  const forOthers = { count: W.others.length, text: othersText, items: W.others.slice(0, 5), href: `${base}/approvals` };

  // ---- the next step -----------------------------------------------------------------------------------------------------
  let next;
  if (nextRow) {
    const ref = nextRow.step_id;
    const mins = nextRow.step_minutes || nextRow.minutes;
    const title = nextRow.kind === 'session' && nextRow.step_title ? nextactions.plainTitle({ kind: 'data_request', ref, title: nextRow.step_title }) : nextRow.title;
    const phrase = `Next: ${lowerFirst(title)}${mins ? `, ${mins} min` : ''}`;
    next = { kind: 'task', phrase, title, minutes: mins, who: nextRow.who, href: nextRow.href, button: 'Continue', session: nextRow.session || null, step: nextRow.step || null, task: nextRow.id };
  } else if (othersText) {
    next = { kind: 'waiting', phrase: othersText, title: othersText, minutes: 0, who: 'other', href: `${base}/approvals`, button: 'See who', session: null, step: null, task: null };
  } else if (current === 6 && hs.handed_off) {
    next = { kind: 'done', phrase: 'All done: a hand-over package exists', title: 'Done', minutes: 0, who: 'you', href: `${base}/handoff`, button: 'Open hand-over', session: null, step: null, task: null };
  } else {
    const top = nextactions.build(store, { state: st })[0];
    next = top ? { kind: 'task', phrase: nextactions.nextPhrase(top), title: top.plain_title, minutes: top.minutes, who: ['agent_task'].includes(top.kind) ? 'assistant' : 'you', href: top.route && top.route.session ? `${base}/work/${enc(top.route.session)}?step=${enc(top.ref || '')}` : (top.route && top.route.ui) || `${base}/documents`, button: 'Continue', session: top.route && top.route.session, step: top.ref, task: null }
      : { kind: 'done', phrase: 'Nothing is waiting for you', title: 'Nothing', minutes: 0, who: 'you', href: `${base}/documents`, button: 'Open documents', session: null, step: null, task: null };
  }
  next.phrase = clipWords(next.phrase, 12);

  // ---- hand-over bullets -------------------------------------------------------------------------------------------------
  const bullets = [];
  if (hs.stages_signed < 5) bullets.push(`${5 - hs.stages_signed} of 5 stages not signed off`);
  if (!hs.stories_total) bullets.push('No user stories yet'); else if (hs.stories_approved < hs.stories_total) bullets.push(`${hs.stories_total - hs.stories_approved} of ${hs.stories_total} stories not approved`);
  if (hs.exceptions) bullets.push(`${hs.exceptions} ${hs.exceptions === 1 ? 'item' : 'items'} set aside by exception`);
  if (!hs.handed_off && bullets.length < 3) bullets.push('Nothing handed over yet');
  if (hs.handed_off && !bullets.length) bullets.push(`${hs.packages} ${hs.packages === 1 ? 'package' : 'packages'} handed over`);

  return {
    product: { id: pid, name: entry.name, one_liner: oneLiner, owner: entry.owner || null, kind: entry.kind },
    idea: { name: entry.name, one_liner: oneLiner, who_for: idea.who_for || '', why_now: idea.why_now || '', asked_by: idea.asked_by || entry.owner || '', filled: cardFilled, done: ideaDone },
    as_of: store.today(), current, current_name: STEPS[current].name, view, stages: out, tasks: shown.tasks, plan: shown.plan, next, waiting: { for_you: forYou, for_others: forOthers },
    handover: { bullets: bullets.slice(0, 3), stories_total: hs.stories_total, stories_approved: hs.stories_approved, stories_ready: hs.stories_ready, packages: hs.packages, handed_off: hs.handed_off },
    warnings: stages.outOfOrder(store).map((w) => w.text),
  };
}

export { build, STEPS, SESSION_NAMES, approvalWhat };
