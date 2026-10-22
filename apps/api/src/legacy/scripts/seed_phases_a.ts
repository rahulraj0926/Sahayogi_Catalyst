/** scripts/seed_phases_a.ts - phases 0 and 1 of the pack builder (see seed_lib.js for the pack format). */
import * as derive from '../engine/derive';
import * as gates from '../engine/gates';

const plus = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

function phase0(h) {
  const { S, pack } = h;
  const reach = pack.reach || 0;
  const d0 = h.date('start', '2026-07-01');
  h.clock(d0);
  h.mk('Product', { title: pack.name, name: pack.name, mode: pack.mode || 'greenfield', track: 'full', risk_class: pack.riskClass || 'standard', depth_level: pack.depth || 'L2', current_phase: 0, default_currency: pack.currency || 'INR', sponsor: pack.sponsor, status: 'Active' }, { id: 'PRJ-001' });
  S.data.meta.productId = 'PRJ-001';
  for (const [name, category, role, needs, isSponsor] of pack.people || []) h.stk.push(h.mk('Stakeholder', { title: name, category, role_title: role, is_sponsor: !!isSponsor, needs_summary: needs, influence: isSponsor ? 5 : 3, interest: 4, status: 'Active' }));
  const it = pack.intake;
  if (it) h.mk('IntakeBrief', { title: `${pack.name} intake brief`, idea: it.idea, requester: it.requester, problem_statement: it.problem, requested_solution: it.solution, desired_outcome: it.outcome, urgency: it.urgency || 'medium', needed_by: it.neededBy, purpose: it.purpose, existing_assets: it.assets, reference_products: it.refs, data_categories: it.data, personal_data: !!it.personal, jurisdictions: it.jurisdictions, criticality: it.criticality || 'business', strategic_fit_rating: it.fit || 4, status: pack.intakeStatus || (reach >= 1 ? 'Approved' : 'In review') });

  for (const [title, kind, cls, date, grade, extra] of pack.evidence || []) {
    h.clock(date > d0 ? date : d0);
    h.ev.push(h.mk('Evidence', { title, kind, source_class: cls, retrieved_on: date, published_on: date, reliability: grade || 'B', credibility: 2, captured: true, status: 'Captured', ...(extra && extra.fields ? extra.fields : {}) }, { origin: (extra && extra.origin) || 'invented' }));
  }
  h.clock(plus(d0, 7));
  for (const [text, status, conf, evs] of pack.insights || []) { const i = h.mk('Insight', { title: text, statement: text, confidence: conf, status }); h.many('evidences', i.id, evs.map((n) => h.ev[n].id)); h.ins.push(i); }
  for (const [text, cat, unc, imp, owner, gate, method, extra] of pack.assumptions || []) h.asm.push(h.mk('Assumption', { title: text.slice(0, 80), statement: text, category: cat, uncertainty: unc, impact: imp, owner, validate_by_gate: gate, basis: 'assumed', validation_method: method, status: 'Open', ...(extra || {}) }));
  for (const [kind, text, amount, unit, flex, owner] of pack.constraints || []) h.con.push(h.mk('Constraint', { title: text.slice(0, 80), kind, statement: text, ...(amount !== null && amount !== undefined ? { amount } : {}), ...(unit ? { unit } : {}), flexibility: flex, owner, status: 'Confirmed', reviewed_at: plus(d0, 12) }));
  (pack.questions || []).forEach(([text, pri, gate, who, state, answer], i) => {
    const base = { title: text, priority: pri, needed_by_gate: gate, asked_of: who, owner: who, category: 'scope' };
    let q;
    if (state === 'Answered') q = h.mk('Question', { ...base, status: 'Answered', resolution: 'answered', answer: answer || 'Confirmed by the sponsor in the kickoff meeting.' });
    else if (state === 'Assumed') {
      q = h.mk('Question', { ...base, status: 'Provisional', resolution: 'assumed' });
      const a = h.mk('Assumption', { title: `Working answer to: ${text}`.slice(0, 80), statement: answer || `Proceed on the working answer to "${text}" until it is confirmed.`, category: 'other', uncertainty: 3, impact: 3, owner: who, validate_by_gate: Math.min(4, gate + 1), reconfirm_by: plus(S.today(), 60), basis: 'assumed', status: 'Open' });
      h.asm.push(a); h.lk('provisionally_answered_by', q.id, a.id);
    } else if (state === 'Waived') {
      q = h.mk('Question', { ...base, status: 'Waived', resolution: 'waived' });
      const w = h.mk('Waiver', { title: `Waive question ${q.id}`, kind: 'question_waiver', subjects: [q.id], rationale: answer || 'The answer does not change what is built before the next gate.', approver: pack.sponsor, approver_role: 'Sponsor', requested_by: pack.owner, expiry_on: plus(S.today(), 90), status: 'Active' });
      h.lk('waives', w.id, q.id);
    } else q = h.mk('Question', { ...base, status: 'Open' });
    h.qst.push(q);
  });
  for (const [title, cat, p, i, owner, effect] of pack.risks || []) h.rsk.push(h.mk('Risk', { title, event: title, effect, category: cat, probability: p, impact: i, owner, status: 'Open', review_date: plus(S.today(), 45) }));
  for (const [text, disp, why, qIdx] of pack.scope0 || []) { const s = h.mk('ScopeEntry', { title: text, kind: 'initial_boundary', subject_text: text, disposition: disp, rationale: why, status: 'Approved' }); h.scp.push(s); if (qIdx !== undefined && qIdx !== null) h.lk('clarifies', h.qst[qIdx].id, s.id); }
  for (const [name, provider, kind, crit, owner] of pack.externals || []) h.ext.push(h.mk('ExternalSystem', { title: name, provider, kind, criticality: crit, owner, terms_version: 'v1', review_by: plus(S.today(), 150), status: 'Active' }));
  if ((pack.depth || 'L2') !== 'L1') h.mk('PhaseBudget', { title: 'Phase 1 budget', for_phase: 1, planned_effort: pack.budget1 || 4, planned_cost: pack.budgetCost1 || 2400000, approver: pack.sponsor, status: 'Approved' });
  for (const [title, kind, chosen, rationale, status, decider] of pack.decisions || []) h.mk('Decision', { title, kind, chosen, rationale, decided_on: plus(d0, 20), decider: decider || pack.sponsor, status });
  h.clock(plus(d0, 14));
  derive.run(S, 'link_questions_to_gates', {}, h.actor);
  derive.run(S, 'assemble_artifact', { kind: 'intake_document' }, h.actor);
  const art = S.list('Artifact', (a) => a.kind === 'intake_document')[0];
  if (art && reach >= 1) h.patch(art.id, { status: 'Approved' }); else if (art) h.patch(art.id, { status: 'In review' });
}

function phase1(h) {
  const { S, pack } = h;
  const d1 = plus(h.date('g0', '2026-07-20'), 2);
  h.clock(d1);
  const seg = (pack.segments || []);
  seg.forEach(([title, definition, primary, size]) => h.seg.push(h.mk('Segment', { title, definition, primary: !!primary, ...(size ? { size_count: size } : {}), status: primary ? 'Validated' : 'Assumed' })));
  (pack.personas || []).forEach(([title, kind, primary, goals, segIdx]) => { const p = h.mk('Persona', { title, kind, primary: !!primary, goals, buying_role: kind === 'buyer' ? 'economic_buyer' : 'user', status: primary ? 'Validated' : 'Assumed' }); h.per.push(p); h.lk('member_of', p.id, h.seg[segIdx].id); });
  (pack.jobs || []).forEach(([text, imp, segIdx, perIdx, evs], i) => {
    const j = h.mk('Job', { title: text.slice(0, 90), statement: text, importance: imp, satisfaction: 2, rank: i + 1, status: i < 3 ? 'Validated' : 'Assumed' }); h.job.push(j);
    h.lk('occurs_in', j.id, h.seg[segIdx].id); h.lk('has_job', h.per[perIdx].id, j.id);
    h.many('supported_by', j.id, (evs || [0]).map((n) => h.ev[n].id), { role: 'supports' });
  });
  // personas and segments cite evidence too (CR-03)
  h.per.forEach((p, i) => { if (p.primary) h.many('supported_by', p.id, [h.ev[i % h.ev.length].id], { role: 'supports' }); });
  h.seg.forEach((s, i) => { if (s.primary && h.ins.length) { h.lk('supported_by', s.id, h.ins[i % h.ins.length].id, { role: 'supports' }); h.many('supported_by', s.id, [0, 1].filter((n) => h.ev[n]).map((n) => h.ev[n].id), { role: 'supports' }); } });
  (pack.problems || []).forEach(([text, sev, insIdx, status]) => { const p = h.mk('Problem', { title: text, statement: text, severity: sev, frequency: 'frequent', status: status || 'Approved' }); h.prb.push(p); h.lk('raises', h.ins[insIdx].id, p.id); });
  (pack.opportunities || []).forEach(([text, insIdx, prbIdx, segIdx, status]) => {
    const o = h.mk('Opportunity', { title: text.slice(0, 90), statement: text, value_hypothesis: 'Customers adopt or switch when this problem is solved noticeably better than today', status: status || 'In review' }); h.opp.push(o);
    h.lk('raises', h.ins[insIdx].id, o.id); h.lk('addresses', o.id, h.prb[prbIdx].id); h.lk('targets', o.id, h.seg[segIdx].id); h.lk('supported_by', o.id, h.ins[insIdx].id, { role: 'supports' });
  });
  // competitors with their capability cells and prices
  const cellDate = (c, k) => c.dates && c.dates[k] ? c.dates[k] : plus(pack.asOf || '2026-10-09', -20);
  (pack.competitors || []).forEach((c) => {
    h.clock(plus(d1, 5));
    const status = c.agent ? 'Candidate' : (c.status || 'Reviewed');
    const comp = h.mk('Competitor', { title: c.name, kind: c.kind, tier: c.tier, tier_basis: c.basis, positioning: c.pos, status, ...(c.verified === false ? {} : { verified_by: 'Research analyst' }), ...(c.noPrice ? { pricing_na_reason: c.noPrice } : {}), ...(c.profile || {}) }, c.agent ? { origin: 'agent', actor: 'Research analyst' } : {});
    const rec = { item: comp, cells: [], prices: [] }; h.cmp.push(rec);
    (c.cells || []).forEach(([tag, level, imp, evIdx, note, date]) => {
      const verified = !c.agent;
      const cell = h.mk('CompetitorCapability', { title: `${c.name}: ${tag}`, capability_tag: tag, level, evidence_basis: 'documented', value_class: 'verified_fact', captured_on: date || cellDate(c, 'cells'), importance: imp, capture_method: c.agent ? 'ai_proposed' : 'manual', note: note || '', status: c.agent ? 'Draft' : 'Reviewed', ...(verified ? { verification: 'verified', verified_by: 'Research analyst', verified_on: plus(S.today(), -5) } : {}) }, c.agent ? { origin: 'agent', actor: 'Research analyst' } : {});
      h.lk('contains', comp.id, cell.id); h.lk('supported_by', cell.id, h.ev[evIdx].id, { role: 'supports' }); rec.cells.push(cell);
    });
    (c.prices || []).forEach((p) => {
      const price = h.mk('PricePoint', { title: `${c.name} ${p.plan}`, plan: p.plan, value_metric: p.metric || 'egress', unit: p.unit || 'GB', amount: p.amount, currency: p.currency || pack.currency || 'INR', price_type: p.type || 'list', billing_model: p.billing || 'usage', tax_basis: p.tax || 'excl_gst', region: p.region || 'India', captured_on: p.date || cellDate(c, 'prices'), source_grade: 'B', status: c.agent ? 'Draft' : 'Reviewed', ...(c.agent ? {} : { verification: 'verified', verified_by: 'Research analyst', verified_on: plus(S.today(), -5) }), ...(p.extra || {}) }, c.agent ? { origin: 'agent', actor: 'Research analyst' } : {});
      h.lk('contains', comp.id, price.id); h.lk('supported_by', price.id, h.ev[p.evIdx === undefined ? 0 : p.evIdx].id, { role: 'supports' }); rec.prices.push(price);
    });
  });
  (pack.tracked || []).forEach(([title, pattern, type, evIdx]) => { const t = h.mk('TrackedSource', { title, url_pattern: pattern, source_type: type, default_grade: 'B', access_method: 'manual_only', login_required: false, tos_verdict: 'allows_manual', tos_checked_on: plus(S.today(), -20), status: 'Active' }); h.tsr.push(t); if (evIdx !== undefined) h.lk('observed_via', h.ev[evIdx].id, t.id); });
  (pack.obligations || []).forEach(([title, kind, instrument, text, status], i) => { const o = h.mk('Obligation', { title, kind, instrument, jurisdiction: 'India', obligation_text: text, applicability: 'applicable', owner: pack.legal || 'Legal', status: status || 'Approved' }, { origin: 'document' }); h.obl.push(o); if (h.ev.length) h.lk('supported_by', o.id, h.ev[(pack.obligationEvidence || [0])[i % (pack.obligationEvidence || [0]).length]].id, { role: 'supports' }); });
  // experiments for the riskiest assumptions (G1-06) and the high-impact ones (G2-10)
  const risky = h.asm.filter((a) => a.status === 'Open').sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  if (pack.experiments !== false) risky.slice(0, Math.max(5, risky.filter((a) => a.impact >= 4).length)).forEach((a) => { const e = h.mk('Experiment', { title: `Test: ${a.title}`.slice(0, 80), hypothesis: a.statement, method: 'interview', owner: a.owner, due_on: plus(S.today(), 45), success_threshold: 'Confirmed in writing by two independent parties', result: 'pending', status: 'Planned' }); h.exp.push(e); h.lk('tests', e.id, a.id); });
  // every market-category risk threatens something concrete
  for (const r of h.rsk.filter((x) => x.category === 'market')) { if (h.cmp.length) h.lk('threatens', r.id, h.cmp[0].item.id); }
  if (h.opp.length && h.cmp.length) { const gap = h.cmp.flatMap((c) => c.cells).find((x) => ['absent', 'partial'].includes(x.level)); if (gap) { h.lk('exploits', h.opp[0].id, gap.id); } }
  if (pack.legalAttest) gates.attest(S, { criterion: 'G1-07', gate: 1, role: 'Legal', by: pack.legal || 'Meera Iyer', note: 'Obligation register reviewed.' }, h.actor);
  h.clock(plus(d1, 25));
  if (pack.artifacts === false) return;
  for (const kind of ['market_analysis', 'competitor_analysis']) { derive.run(S, 'assemble_artifact', { kind }, h.actor); }
  const arts = S.list('Artifact', (a) => ['market_analysis', 'competitor_analysis'].includes(a.kind));
  for (const a of arts) h.patch(a.id, { status: (pack.reach || 0) >= 2 ? 'Approved' : 'In review' });
}

export { phase0, phase1, plus };
