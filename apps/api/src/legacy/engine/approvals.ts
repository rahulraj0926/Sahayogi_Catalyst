/**
 * engine/approvals.ts - "waiting for the approver".
 *
 * Whenever something needs a second person (a stage sign-off, an exception, a document, a signature, a story) the person who prepared it
 * does NOT get it counted. An approval request is created instead, naming the approver. Nothing counts until that person decides:
 *   - by opening the approval LINK  (/#/approve/<token>)  and typing their name, or
 *   - in person on this computer, by choosing "Acting as" that person and pressing Confirm (the fallback).
 * A link proves that someone holds the link and typed a name. It is NOT a login. The tool says so wherever it shows a link.
 *
 * Requests live in store.data.approvals (per product). The executors below are the single place where a decision takes effect:
 * every approval path (session questions, document page, stage decision page, sign-off, exception) ends in decideApproval().
 */
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import { addDays, dayOf } from './units';
import * as gates from './gates';
import * as compose from './compose';
import * as plain from './plain';
import * as storiesMod from './stories';
import * as stagesMod from './stages';

const httpErr = (status, message, extra?) => Object.assign(new Error(message), { status }, extra || {});
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase() && String(a || '').trim() !== '';
const DEFAULT_EXPIRY_DAYS = 14;
const KIND_WORD = { stage_decision: 'Stage sign-off', exception: 'Exception (going ahead without something)', document: 'Document approval', sign_off: 'Signature', story: 'User story approval' };

const list = (store) => (store.data.approvals = store.data.approvals || []);
const byId = (store, id) => list(store).find((a) => a.id === id) || null;

/** An unguessable token: 24 random bytes = 192 bits, URL-safe. */
const newToken = () => crypto.randomBytes(24).toString('base64url');

// ------------------------------------------------------------------ the public base URL
function lanAddress() {
  const nets = os.networkInterfaces();
  const cands = [];
  for (const arr of Object.values(nets)) for (const n of arr || []) if (n.family === 'IPv4' && !n.internal) cands.push(n.address);
  const priv = cands.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  return priv || cands[0] || null;
}
/** { url, source: 'saved'|'env'|'detected'|'localhost', warning, plain } */
function baseUrl(settings, port, lan = lanAddress) {
  const saved = settings && settings.public_url ? String(settings.public_url).trim() : '';
  const env = process.env.SD_PUBLIC_URL ? String(process.env.SD_PUBLIC_URL).trim() : '';
  let url; let source;
  if (saved) { url = saved; source = 'saved'; } else if (env) { url = env; source = 'env'; } else {
    const ip = lan();
    if (ip) { url = `http://${ip}:${port}`; source = 'detected'; } else { url = `http://localhost:${port}`; source = 'localhost'; }
  }
  url = url.replace(/\/+$/, '');
  const isLocal = /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(url);
  const isLan = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
  let warning = null; let explain;
  if (isLocal) { warning = 'This address only works on this computer. Other people cannot open links that start with it. Change the address below to this computer\'s network address, or to the address of a hosted copy.'; explain = 'Links will only open on this computer.'; } else if (isLan) { explain = 'Links will only work for people on the same network (the same office wifi or cable). For people outside it, a hosted copy of this tool is needed.'; } else explain = 'Links open for anyone who can reach this address. Send each link only to the person it is for.';
  return { url, source, warning, explain, is_local: isLocal, is_lan: isLan, port };
}
const linkFor = (base, token) => `${base.url}/#/approve/${token}`;

// ------------------------------------------------------------------ creating a request
function expiryDays(settings) { const n = Number(settings && settings.approval_expiry_days); return Number.isFinite(n) && n > 0 ? Math.min(365, Math.round(n)) : DEFAULT_EXPIRY_DAYS; }

function contactOf(store, name) {
  const s = store.list('Stakeholder', (x) => x.title.toLowerCase() === String(name).toLowerCase() && x.status !== 'Left')[0];
  return s ? { email: s.email || '', phone: s.phone || '' } : { email: '', phone: '' };
}

/**
 * Create a request. spec: { kind, subject, title, statement, prepared_by, approver, payload, stage, expiry_days, product_name }
 * Only one waiting request per kind+subject: asking again replaces (withdraws) the older one.
 */
function create(store, spec, settings = {}) {
  const approver = String(spec.approver || '').trim();
  const prepared = String(spec.prepared_by || '').trim();
  if (!approver) throw httpErr(422, 'Pick the person who has to approve this.');
  if (!prepared) throw httpErr(422, 'A named person has to ask for the approval.');
  if (same(approver, prepared)) throw httpErr(409, `${prepared} prepared this, so someone else has to approve it. Pick a different approver (for example the sponsor).`, { code: 'self_approval' });
  for (const old of list(store)) if (old.status === 'waiting' && old.kind === spec.kind && old.subject === spec.subject) { old.status = 'withdrawn'; old.audit.push({ at: store.now(), event: 'withdrawn', by: prepared, note: 'replaced by a new request' }); }
  const days = Number(spec.expiry_days) > 0 ? Number(spec.expiry_days) : expiryDays(settings);
  const n = (store.data.counters.APR = (store.data.counters.APR || 0) + 1);
  const now = store.now();
  const prod = store.product();
  const ap = {
    id: `APR-${String(n).padStart(3, '0')}`, token: newToken(), kind: spec.kind, subject: spec.subject, title: spec.title, statement: spec.statement || '',
    product_name: spec.product_name || (prod && prod.name) || '', stage: spec.stage === undefined ? null : spec.stage,
    prepared_by: prepared, approver, approver_contact: contactOf(store, approver), status: 'waiting', created_at: now, expires_at: new Date(Date.parse(now) + days * 86400000).toISOString(), expiry_days: days,
    payload: spec.payload || {}, audit: [{ at: now, event: 'asked', by: prepared }],
  };
  list(store).push(ap);
  store.audit('approval.asked', ap.id, `${prepared} asked ${approver} to approve: ${ap.title}`, { actor: prepared, kind: ap.kind });
  return ap;
}

/** The effective status: a waiting request past its end date is "expired". */
function statusOf(store, ap) { return ap.status === 'waiting' && Date.parse(ap.expires_at) < Date.parse(store.now()) ? 'expired' : ap.status; }
const STATUS_WORD = { waiting: 'Waiting', approved: 'Approved', declined: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' };

function pendingFor(store, kind, subject) { return list(store).find((a) => a.kind === kind && a.subject === subject && statusOf(store, a) === 'waiting') || null; }

// ------------------------------------------------------------------ executors: what happens when the approver says yes (or no)
const EXEC = {
  stage_decision: {
    approve(store, ap, approver) {
      
      const p = ap.payload;
      return gates.decide(store, p.gate, p.decision, { rationale: p.rationale, conditions: p.conditions || [], recycle_to: p.recycle_to, approver, submitted_by: ap.prepared_by }, ap.prepared_by);
    },
  },
  exception: {
    approve(store, ap, approver) {
      const w = store.get(ap.payload.waiver);
      if (!w) throw httpErr(409, 'The exception no longer exists.');
      store.update(w.id, { status: 'Active', approver }, { actor: approver, silent: true });
      if (ap.payload.question) {
        const q = store.get(ap.payload.question);
        if (q) store.update(q.id, { status: 'Waived', resolution: 'waived' }, { actor: ap.prepared_by });
      }
      store.audit('gate.waived', w.criterion_id || w.id, `${approver} confirmed the exception ${w.id}${w.expiry_on ? ' until ' + w.expiry_on : ''}`, { actor: approver });
      return w;
    },
    decline(store, ap, approver, note) {
      const w = store.get(ap.payload.waiver);
      if (w && w.status === 'Requested') store.update(w.id, { status: 'Rejected' }, { actor: approver, silent: true });
    },
  },
  document: {
    approve(store, ap, approver) {
      
      const p = ap.payload;
      return compose.setStatus(store, (p.key || ap.subject), { status: 'approved', role: p.role, by: approver, note: p.note, ...(p.waiver ? { waiver: { reason: p.waiver.reason, approver } } : {}), _confirmed: true }, approver);
    },
  },
  sign_off: {
    approve(store, ap, approver) {
      
      const p = ap.payload;
      return gates.attest(store, { criterion: p.criterion, gate: p.gate, role: p.role, by: approver, note: p.note || '', _confirmed: true }, approver);
    },
  },
  story: {
    approve(store, ap, approver) {
      const st = store.get(ap.payload.story);
      if (!st) throw httpErr(409, 'The story no longer exists.');
      store.update(st.id, { status: 'Approved', approved_by: approver }, { actor: approver, strict: false });
      for (const l of store.inn(st.id, 'specifies')) {
        const a = store.get(l.source);
        if (a && a.type === 'AcceptanceCriterion' && a.status === 'Draft') store.update(a.id, { status: 'In review' }, { actor: approver, silent: true, strict: false });
      }
      return st;
    },
  },
};

// ------------------------------------------------------------------ deciding
/**
 * Apply a decision. input: { decision: 'approve'|'decline', name, note, via: 'link'|'in_person', ua }
 * The typed name must match the named approver, and may never be the person who prepared the item.
 */
function decideApproval(store, ap, input) {
  const st = statusOf(store, ap);
  if (st !== 'waiting') throw httpErr(409, st === 'approved' || st === 'declined' ? `This has already been ${st}${ap.decided_by ? ' by ' + ap.decided_by : ''}. A second decision is not possible.` : st === 'expired' ? 'This request has expired. Ask the person who sent it for a new link.' : 'This request was withdrawn by the person who sent it, so nothing can be decided any more.', { code: 'closed', approval_status: st });
  const name = String(input.name || '').trim();
  if (!name) throw httpErr(422, 'Type your name to confirm who you are.', { code: 'name_required' });
  if (same(name, ap.prepared_by)) throw httpErr(403, `${ap.prepared_by} prepared this, so ${ap.prepared_by} cannot decide it. It has to be decided by ${ap.approver}.`, { code: 'preparer_blocked' });
  if (!same(name, ap.approver)) throw httpErr(403, `This request is for ${ap.approver}. The name you typed does not match, so nothing was decided.`, { code: 'wrong_name' });
  const decision = input.decision === 'decline' ? 'decline' : 'approve';
  const note = String(input.note || '').trim();
  if (decision === 'decline' && !note) throw httpErr(422, 'Say why you are declining. A reason is needed.', { code: 'reason_required' });
  const now = store.now();
  if (decision === 'approve') EXEC[ap.kind].approve(store, ap, ap.approver); // may throw: the request then stays waiting
  else if (EXEC[ap.kind].decline) EXEC[ap.kind].decline(store, ap, ap.approver, note);
  ap.status = decision === 'approve' ? 'approved' : 'declined';
  ap.decided_at = now; ap.decided_by = ap.approver; ap.decision_note = note; ap.decision_via = input.via === 'in_person' ? 'in_person' : 'link';
  ap.seen_by_requester = false;
  ap.audit.push({ at: now, event: ap.status, by: ap.approver, via: ap.decision_via, ua: String(input.ua || '').slice(0, 120), ...(input.ip ? { ip: String(input.ip).slice(0, 64) } : {}), note });
  store.audit(`approval.${ap.status}`, ap.id, `${ap.approver} ${ap.status === 'approved' ? 'approved' : 'declined'} (${ap.decision_via === 'link' ? 'through the link' : 'in person on this computer'}): ${ap.title}${note ? '. ' + note : ''}`, { actor: ap.approver, kind: ap.kind, ...(input.ip ? { from: String(input.ip).slice(0, 64) } : {}) });
  return ap;
}

function opened(store, ap, ua, ip?) {
  if (!ap.audit.some((e) => e.event === 'opened')) { ap.audit.push({ at: store.now(), event: 'opened', ua: String(ua || '').slice(0, 120), ...(ip ? { ip: String(ip).slice(0, 64) } : {}) }); store.audit('approval.opened', ap.id, `${ap.approver} opened the approval link for: ${ap.title}`, { actor: ap.approver, ...(ip ? { from: String(ip).slice(0, 64) } : {}) }); }
}

function withdraw(store, ap, actor) {
  if (statusOf(store, ap) !== 'waiting') throw httpErr(409, 'Only a request that is still waiting can be withdrawn.');
  ap.status = 'withdrawn'; ap.audit.push({ at: store.now(), event: 'withdrawn', by: actor });
  const w = ap.kind === 'exception' ? store.get(ap.payload.waiver) : null;
  if (w && w.status === 'Requested') store.update(w.id, { status: 'Rejected' }, { actor, silent: true });
  store.audit('approval.withdrawn', ap.id, `${actor} withdrew the request to ${ap.approver}: ${ap.title}`, { actor });
  return ap;
}

/** A new token and a new end date; the old link stops working. */
function resend(store, ap, actor, settings) {
  const st = statusOf(store, ap);
  if (!['waiting', 'expired'].includes(st)) throw httpErr(409, 'Only a request that is still waiting (or has expired) can be sent again.');
  const now = store.now(); const days = expiryDays(settings);
  ap.token = newToken(); ap.status = 'waiting'; ap.expires_at = new Date(Date.parse(now) + days * 86400000).toISOString(); ap.expiry_days = days;
  ap.audit.push({ at: now, event: 'resent', by: actor });
  store.audit('approval.resent', ap.id, `${actor} made a new link for ${ap.approver}: ${ap.title}`, { actor });
  return ap;
}

/** The fallback: the approver is sitting at this computer and has chosen "Acting as" their own name. */
function confirmInPerson(store, id, actor, input: any = {}) {
  const ap = byId(store, id);
  if (!ap) throw httpErr(404, 'No such approval request.');
  if (!same(actor, ap.approver)) throw httpErr(403, `Only ${ap.approver} can confirm this. Choose "Acting as" ${ap.approver} at the top, then press Confirm.`, { code: 'wrong_name' });
  return decideApproval(store, ap, { decision: input.decision, name: actor, note: input.note, via: 'in_person' });
}

// ------------------------------------------------------------------ views
const mailtoFor = (ap, link) => {
  const to = ap.approver_contact && ap.approver_contact.email ? ap.approver_contact.email : '';
  const subject = `Please approve: ${ap.title}`;
  const body = `Hello ${ap.approver},\n\n${ap.prepared_by} asks you to approve: ${ap.title}${ap.product_name ? ' (' + ap.product_name + ')' : ''}.\n\nOpen this link, read it, and press Approve or Decline:\n${link}\n\nThe link works only for you, once, until ${dayOf(ap.expires_at)}.`;
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
const whatsappFor = (ap, link) => {
  const phone = String((ap.approver_contact && ap.approver_contact.phone) || '').replace(/[^\d]/g, '');
  const text = `Hello ${ap.approver}, ${ap.prepared_by} asks you to approve: ${ap.title}. Open this link, read it, then Approve or Decline: ${link}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
};

/** A request as the requester sees it (with link, mail and chat buttons). */
function view(store, ap, base) {
  const link = linkFor(base, ap.token);
  const st = statusOf(store, ap);
  return {
    id: ap.id, kind: ap.kind, kind_word: KIND_WORD[ap.kind] || ap.kind, title: ap.title, statement: ap.statement, stage: ap.stage, subject: ap.subject, prepared_by: ap.prepared_by, approver: ap.approver,
    approver_contact: ap.approver_contact || {}, status: st, status_word: STATUS_WORD[st], created_at: ap.created_at, expires_at: ap.expires_at, decided_at: ap.decided_at || null, decided_by: ap.decided_by || null,
    decision_note: ap.decision_note || '', decision_via: ap.decision_via || null, opened: ap.audit.some((e) => e.event === 'opened'), audit: ap.audit.map((e) => ({ at: e.at, event: e.event, by: e.by || null, via: e.via || null, note: e.note || '' })),
    read: { document: ap.kind === 'document' ? (ap.payload.key || ap.subject) : undefined, story: ap.kind === 'story' ? ap.payload.story : undefined },
    waiting_text: `Waiting for ${ap.approver}`, seen_by_requester: ap.seen_by_requester !== false,
    ...(st === 'waiting' ? { link, mailto: mailtoFor(ap, link), whatsapp: whatsappFor(ap, link) } : {}),
  };
}

/** Everything the screens need. actor = the person using the tool now. */
function overview(store, actor, base) {
  const all = list(store).map((a) => view(store, a, base));
  const waiting = all.filter((a) => a.status === 'waiting');
  return {
    base, waiting, for_you: waiting.filter((a) => same(a.approver, actor)), asked_by_you: waiting.filter((a) => same(a.prepared_by, actor)),
    recent: all.filter((a) => a.status !== 'waiting').sort((a, b) => String(b.decided_at || b.created_at).localeCompare(String(a.decided_at || a.created_at))).slice(0, 12),
    notices: all.filter((a) => ['approved', 'declined'].includes(a.status) && a.seen_by_requester === false),
    honesty: 'A link proves that someone holds the link and typed a name. It does not prove who they are. Send each link only to the person it is for.',
  };
}

// ------------------------------------------------------------------ what the approver is shown
/** { lines:[plain sentences], warnings:[plain sentences], document_html?, read_link } for the approver page. */
function contentFor(store, ap) {
  
  const out = { lines: [], warnings: [], document_html: null, read_link: null };
  try {
    if (ap.kind === 'document') {
      
      const m: any = compose.compose(store, (ap.payload.key || ap.subject));
      out.lines.push(`Document: ${m.title}. It is ${m.completeness}% complete and has ${m.word_count} words.`);
      if (m.missing_count) { out.warnings.push(`${m.missing_count} ${m.missing_count === 1 ? 'part is' : 'parts are'} still missing: ${m.missing.slice(0, 6).map((x) => x.label).join('; ')}.`); }
      if (m.completeness < compose.threshold(store)) out.warnings.push(`It is below the usual ${compose.threshold(store)}% bar. By approving you accept that it goes ahead incomplete.`);
      const r = compose.render1(store, (ap.payload.key || ap.subject), 'html');
      out.document_html = r.body;
      out.read_link = `/api/approve/${ap.token}/document`;
    } else if (ap.kind === 'stage_decision') {
      const ev = gates.evaluateGate(store, ap.payload.gate); const v = plain.stageView(ev);
      out.lines.push(`${v.required_done} of ${v.required_total} required items for ${v.title} are done.`);
      const ex = v.items.filter((i) => i.status === 'WAIVED');
      for (const i of v.items.filter((x) => x.kind === 'required' && x.done)) out.lines.push(`Done: ${i.need}${i.status === 'WAIVED' ? ` (only through an agreed exception: ${i.waiver ? i.waiver.rationale : ''})` : ''}`);
      const open = v.items.filter((x) => x.kind === 'required' && !x.done);
      for (const i of open) out.warnings.push(`Still missing: ${i.need}`);
      if (ex.length) out.warnings.push(`${ex.length} required ${ex.length === 1 ? 'item is' : 'items are'} done only by an exception (set aside), not by real evidence.`);
      const drafts = storiesMod.unchangedDraftCount ? storiesMod.unchangedDraftCount(store) : 0;
      if (drafts && ap.payload.gate >= 2) out.warnings.push(`${drafts} drafts written by the tool were kept exactly as drafted and never rewritten by a person.`);
      for (const c of ap.payload.conditions || []) out.lines.push(`Follow-up to close later: ${c.text}`);
      if (ap.payload.rationale) out.lines.push(`Reason given: ${ap.payload.rationale}`);
      out.read_link = null;
    } else if (ap.kind === 'exception') {
      const w = store.get(ap.payload.waiver);
      if (w) { out.lines.push(`Going ahead without: ${plain.needOf(w.criterion_id, w.title)}`); out.lines.push(`Reason: ${w.rationale}`); if (w.expiry_on) out.lines.push(`Ends on: ${w.expiry_on}`); out.warnings.push('Agreeing does not make it true. It records that you accepted going ahead without it, and why.'); }
    } else if (ap.kind === 'story') {
      const st = store.get(ap.payload.story);
      if (st) { out.lines.push(`Story: ${st.title}`); out.lines.push(`What they want: ${st.want || ''}`); out.lines.push(`Why it matters: ${st.benefit || ''}`); for (const l of store.inn(st.id, 'specifies')) { const a = store.get(l.source); if (a) out.lines.push(`Test (${a.scenario_type === 'happy' ? 'normal case' : 'failure case'}): Given ${a.given || '...'}, when ${a.when || '...'}, then ${a.then || '...'}`); } }
    } else if (ap.kind === 'sign_off') { out.lines.push(ap.statement); }
  } catch (e) { out.warnings.push('The detail could not be shown: ' + e.message); }
  return out;
}

// ------------------------------------------------------------------ settings shared by every product (set by the server from the portfolio registry)
let SETTINGS = {};
const configure = (obj) => { SETTINGS = obj || {}; };
const settings = () => SETTINGS;

// ------------------------------------------------------------------ the ways a person asks for an approval
const DECISION_WORD = { go: 'sign off', go_with_conditions: 'sign off with follow-ups' };

/** A stage decision. go / go-with-follow-ups wait for the approver; hold, send back and stop take effect at once. */
function requestStageDecision(store, gate, decision, payload, actor, extra: any = {}) {
  
  
  if (!['go', 'go_with_conditions'].includes(decision)) return gates.decide(store, gate, decision, payload, actor);
  const approver = String(payload.approver || '').trim();
  if (!approver) throw httpErr(409, `${actor} prepared this stage, so someone else has to approve it. Name a different approver (for example the sponsor).`, { code: 'self_approval' });
  // every rule of the real decision is checked now, so a request that could never succeed is never sent
  gates.decide(store, gate, decision, { ...payload, approver, submitted_by: actor, dry_run: true }, actor);
  const ev = gates.evaluateGate(store, gate);
  const waived = ev.results.filter((r) => r.status === 'WAIVED').length;
  const ap = create(store, {
    kind: 'stage_decision', subject: `gate-${gate}`, stage: gate, prepared_by: actor, approver,
    title: `${DECISION_WORD[decision] === 'sign off' ? 'Sign off' : 'Sign off with follow-ups'}: Stage ${gate} (${stagesMod.STAGE_NAMES[gate]})`,
    statement: `${actor} asks ${approver} to sign off Stage ${gate}. ${ev.summary.mustOk} of ${ev.summary.mustTotal} required items are done${waived ? `, ${waived} of them only by an agreed exception` : ''}.${payload.rationale ? ' Reason given: ' + payload.rationale : ''}`,
    payload: { gate, decision, rationale: payload.rationale || '', conditions: payload.conditions || [], recycle_to: payload.recycle_to, request: extra.request || null },
  });
  return { pending: true, approval: ap, message: `Waiting for ${approver} to confirm the Stage ${gate} sign-off. It does not count until they do.` };
}

/** An exception ("set aside"): the item stays missing until the approver agrees. */
function requestException(store, p, actor) {
  
  
  const w = gates.waive(store, { ...p, pending: true }, actor);
  const need = plain.needOf(w.criterion_id, w.criterion_id);
  const ap = create(store, {
    kind: 'exception', subject: w.id, stage: w.gate === undefined ? null : w.gate, prepared_by: actor, approver: w.approver,
    title: `Go ahead without: ${need}`, statement: `${actor} asks ${w.approver} to agree that the product goes ahead without "${need}"${w.expiry_on ? ' until ' + w.expiry_on : ''}. Reason: ${w.rationale}`,
    payload: { waiver: w.id, request: p.request || null },
  });
  return { pending: true, waiver: w, approval: ap, message: `Waiting for ${w.approver} to agree. Until they do, this item still counts as missing.` };
}

/** A signature in a role (for example Legal). Signing for yourself is immediate; naming somebody else waits for them. */
function requestAttest(store, p, actor, extra: any = {}) {
  
  const by = String(p.by || actor || '').trim();
  if (!by || same(by, actor)) return gates.attest(store, { ...p, by }, actor);
  const crit = gates.criteria().find((c) => c.id === p.criterion);
  if (!crit || !crit.attest) throw httpErr(422, `criterion ${p.criterion} does not take a signature`);
  if (String(p.role || '').toLowerCase() !== crit.attest.role.toLowerCase()) throw httpErr(422, `this signature must be given in the role "${crit.attest.role}"`);
  
  const gate = p.gate === undefined ? (crit.gate === 'C' ? 0 : crit.gate) : p.gate;
  const ap = create(store, {
    kind: 'sign_off', subject: `${crit.id}-${gate}`, stage: gate, prepared_by: actor, approver: by,
    title: `Sign as ${plain.roleName(crit.attest.role)}: ${plain.needOf(crit.id, crit.text)}`, statement: plain.clean(crit.attest.statement) + (p.note ? ` Note from ${actor}: ${p.note}` : ''),
    payload: { criterion: crit.id, gate, role: crit.attest.role, note: p.note || '', request: extra.request || null },
  });
  return { pending: true, approval: ap, message: `Waiting for ${by} to sign. It does not count until they do.` };
}

/** A document: used by the approve button on the document page AND by the session question, so both follow the same rules. */
function requestDocument(store, key, p, actor) {
  
  return compose.setStatus(store, key, { ...p, status: 'approved' }, actor);
}

function requestStory(store, storyId, approver, actor, extra: any = {}) {
  const st = store.get(storyId);
  if (!st || st.type !== 'Story') throw httpErr(404, `${storyId} is not a story`);
  const ap = create(store, {
    kind: 'story', subject: storyId, stage: 3, prepared_by: actor, approver, title: `Approve user story: ${st.title}`,
    statement: `${st.want || ''}${st.benefit ? ' ' + st.benefit : ''}`.trim(), payload: { story: storyId, request: extra.request || null },
  });
  return { pending: true, approval: ap, message: `Waiting for ${approver} to approve the story.` };
}

export { contentFor, configure, settings, requestStageDecision, requestException, requestAttest, requestDocument, requestStory, create, list, byId, statusOf, pendingFor, decideApproval, confirmInPerson, withdraw, resend, opened, view, overview, baseUrl, linkFor, lanAddress, expiryDays, newToken, same, DEFAULT_EXPIRY_DAYS, KIND_WORD, STATUS_WORD, mailtoFor, whatsappFor };
