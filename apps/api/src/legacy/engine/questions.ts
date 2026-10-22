/**
 * engine/questions.ts - resolution of Must questions (spec 4.8).
 *
 * A Must question may be resolved three ways, and the gate engine only accepts a resolution that is itself valid:
 *   answered  -> status Answered (answer text present or answered_by link)
 *   assumed   -> status Provisional AND linked (provisionally_answered_by) to an Open/Validated Assumption that has an owner
 *                and a reconfirm_by date that has not passed
 *   waived    -> status Waived AND an Active, unexpired Waiver whose subjects include the question
 * If the assumption is invalidated, reconfirm_by passes, or the waiver expires, the question is OPEN again for gate purposes.
 */

function activeWaiverFor(store, subjectId, criterionId?) {
  const today = store.today();
  return store.list('Waiver').find((w) => w.status === 'Active'
    && (!w.expiry_on || w.expiry_on >= today)
    && (w.kind === 'question_waiver' ? (w.subjects || []).includes(subjectId) : (!criterionId || w.criterion_id === criterionId) && (w.subjects || []).includes(subjectId))) || null;
}

/** Effective state of a question for gate purposes: open | answered | assumed | waived | deferred | withdrawn, plus a reason. */
function effectiveState(store, q) {
  const today = store.today();
  switch (q.status) {
    case 'Answered': return { state: 'answered' };
    case 'Withdrawn': return { state: 'withdrawn' };
    case 'Deferred': return q.priority === 'Must' ? { state: 'open', reason: 'Must questions cannot be deferred' } : { state: 'deferred' };
    case 'Provisional': {
      const link = store.out(q.id, 'provisionally_answered_by')[0];
      const a = link && store.get(link.target);
      if (!a) return { state: 'open', reason: 'marked Provisional but no assumption is linked' };
      if (!['Open', 'Validated'].includes(a.status)) return { state: 'open', reason: `assumption ${a.id} is ${a.status}` };
      if (!a.owner || !a.reconfirm_by) return { state: 'open', reason: `assumption ${a.id} needs an owner and a reconfirm_by date` };
      if (a.reconfirm_by < today) return { state: 'open', reason: `assumption ${a.id} reconfirm_by ${a.reconfirm_by} has passed` };
      return { state: 'assumed', assumption: a.id, reconfirmBy: a.reconfirm_by };
    }
    case 'Waived': {
      const w = activeWaiverFor(store, q.id);
      if (!w) return { state: 'open', reason: 'marked Waived but no active, unexpired Waiver covers it' };
      return { state: 'waived', waiver: w.id, expiry: w.expiry_on };
    }
    default: return { state: 'open' };
  }
}

/**
 * Resolve a question. kind: answered | assumed | waived.
 *  answered: { answer }
 *  assumed:  { assumption: {statement, owner, reconfirm_by, validate_by_gate, ...} }  (creates the Assumption and the link)
 *  waived:   { rationale, approver, expiry_on, requested_by, risk }                      (creates an Active Waiver)
 */
function resolve(store, id, kind, payload: any = {}, actor) {
  const q = store.get(id);
  if (!q || q.type !== 'Question') throw Object.assign(new Error(`${id} is not a Question`), { status: 404 });
  if (kind === 'answered') {
    if (!payload.answer) throw Object.assign(new Error('answered needs an answer text'), { status: 422 });
    store.update(id, { status: 'Answered', resolution: 'answered', answer: payload.answer }, { actor });
    return { question: store.get(id) };
  }
  if (kind === 'assumed') {
    const a = payload.assumption || {};
    let asm = a.id ? store.get(a.id) : null;
    if (!asm) {
      if (!a.statement || !a.owner || !a.reconfirm_by) throw Object.assign(new Error('assumed needs an assumption with statement, owner and reconfirm_by'), { status: 422 });
      asm = store.create('Assumption', {
        title: a.title || `Working assumption for ${id}`, statement: a.statement, owner: a.owner, reconfirm_by: a.reconfirm_by,
        category: a.category || 'other', uncertainty: a.uncertainty || 3, impact: a.impact || 4, validate_by_gate: a.validate_by_gate === undefined ? q.needed_by_gate + 1 : a.validate_by_gate,
        basis: 'assumed', status: 'Open',
      }, { actor, origin: payload.origin || 'human' });
    }
    store.ensureLink('provisionally_answered_by', id, asm.id, {}, { actor });
    store.update(id, { status: 'Provisional', resolution: 'assumed' }, { actor });
    return { question: store.get(id), assumption: asm };
  }
  if (kind === 'waived') {
    const w: any = payload;
    if (!w.rationale || !w.expiry_on || !w.approver) throw Object.assign(new Error('waived needs rationale, approver and expiry_on'), { status: 422 });
    if (w.requested_by && w.requested_by === w.approver) throw Object.assign(new Error('requester and approver must be different people'), { status: 422 });
    const waiver = store.create('Waiver', {
      title: `Waive ${id}: ${q.title.slice(0, 50)}`, kind: 'question_waiver', gate: q.needed_by_gate, subjects: [id], rationale: w.rationale,
      approver: w.approver, approver_role: w.approver_role || 'Sponsor', requested_by: w.requested_by || actor, expiry_on: w.expiry_on, status: w.pending ? 'Requested' : 'Active',
      ...(w.linked_risk ? { linked_risk: w.linked_risk } : {}),
    }, { actor });
    store.ensureLink('waives', waiver.id, id, {}, { actor });
    if (w.pending) return { question: store.get(id), waiver, pending: true }; // the question stays open until the approver agrees
    store.update(id, { status: 'Waived', resolution: 'waived' }, { actor });
    return { question: store.get(id), waiver };
  }
  throw Object.assign(new Error(`unknown resolution kind ${kind}`), { status: 422 });
}

export { effectiveState, resolve, activeWaiverFor };
