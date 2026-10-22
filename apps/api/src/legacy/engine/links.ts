/**
 * engine/links.ts - typed links: allowed (source type, target type) pairs, cardinality,
 * attributes, propagation direction, and validation on write.
 *
 * Link names follow the spec link table (3.7.2) except where the brief of this prototype
 * asked for a different name; those cases are marked in `v2Note` and listed in the README
 * ("deviations"). Propagation: TS = a change in the TARGET makes the SOURCE suspect,
 * ST = a change in the SOURCE makes the TARGET suspect, BOTH, INFO = never propagates.
 *
 * To add a link type: add an entry to LINKS. Nothing else needs to change.
 */
import { TYPES } from './schema';
import phases_5_12_linksMod from './phases_5_12_links';

const ALL = ['ANY'];
const SETS = {
  CITERS: ['Segment', 'Persona', 'Job', 'Problem', 'Competitor', 'CompetitorCapability', 'PricePoint', 'Opportunity', 'Assumption', 'Constraint', 'Decision', 'Requirement', 'Obligation', 'Stakeholder', 'Risk', 'Metric', 'Insight', 'BusinessRule', 'ExternalSystem', 'Feature'],
  DERIVE_TGT: ['Feature', 'Insight', 'Objective', 'Decision', 'Constraint', 'Obligation', 'Evidence', 'ExternalSystem', 'Story'],
  CONSTRAINED: ['Requirement', 'Feature', 'BusinessRule', 'Flow', 'Decision', 'Objective', 'Module', 'Release', 'Metric', 'Story', 'ScopeEntry', 'Capacity', 'Product'],
  ASSUMERS: ['Requirement', 'Feature', 'Decision', 'Metric', 'BusinessRule', 'Opportunity', 'ScopeEntry', 'Release', 'Capacity', 'Constraint'],
  MITIGATORS: ['Requirement', 'Feature', 'Decision', 'Constraint'],
  SCOPES: ['Feature', 'Module', 'Flow', 'FlowStep', 'Story', 'Release', 'Entity', 'Product'],
};

const lk = (name, inverse, pairs, o) => ({ name, inverse, pairs, card: 'N:M', propagation: 'INFO', attrs: [], ...o });

const LINKS = [
  // ---- evidence and customer context -------------------------------------
  lk('evidences', 'evidenced by', [[['Insight'], ['Evidence']]], { v2Ref: ['LK-001'], propagation: 'TS', coverage: ['CR-01'], description: 'Insight was distilled from this Evidence.' }),
  lk('supported_by', 'supports', [[SETS.CITERS, ['Evidence', 'Insight', 'Pointer']]], {
    v2Ref: ['LK-002'], propagation: 'TS', coverage: ['CR-02'], longRange: true,
    attrs: [{ name: 'role', kind: 'enum', values: ['supports', 'contradicts'], default: 'supports' }, { name: 'locator', kind: 'text' }],
    description: 'General evidence citation from any item to Evidence or Insight.',
  }),
  lk('raises', 'raised by', [[['Insight'], ['Problem', 'Opportunity']]], { v2Ref: ['LK-003'], propagation: 'ST', description: 'Insight surfaces a Problem or Opportunity.' }),
  lk('contradicts', 'contradicted by', [[['Evidence', 'Insight'], ['Evidence', 'Insight']]], { v2Ref: ['LK-004'], propagation: 'TS', description: 'Later evidence contradicts earlier evidence.' }),
  lk('member_of', 'has member', [[['Persona'], ['Segment']]], { v2Ref: ['LK-011'], card: 'N:1', propagation: 'TS', coverage: ['CR-03'], description: 'Persona belongs to a Segment.' }),
  lk('has_job', 'job of', [[['Persona'], ['Job']]], { v2Ref: ['LK-012'], coverage: ['CR-03'], description: 'Jobs the Persona is trying to get done.' }),
  lk('occurs_in', 'context of', [[['Job'], ['Segment']]], { v2Ref: ['LK-013'], propagation: 'TS', description: 'Where a Job occurs.' }),
  lk('addresses', 'addressed by', [[['Opportunity', 'Feature'], ['Problem']]], { v2Ref: ['LK-018'], propagation: 'TS', coverage: ['CR-05'], description: 'Opportunity or Feature intends to resolve the Problem.' }),
  lk('exploits', 'exploited by', [[['Opportunity'], ['CompetitorCapability']]], { v2Ref: ['LK-033'], propagation: 'TS', description: 'Opportunity rests on this competitor gap (a capability cell rated absent or partial).' }),
  lk('benchmarks', 'benchmarked by', [[['Decision', 'Opportunity'], ['PricePoint', 'CompetitorCapability']]], { v2Ref: ['LK-059'], v2Note: 'Spec: PricingHypothesis -> PricePoint. PricingHypothesis is not implemented, so Decision/Opportunity stand in.', propagation: 'TS', description: 'A competitor price or cell used as a benchmark.' }),
  lk('observed_via', 'observed', [[['Evidence'], ['TrackedSource']]], { v2Ref: ['LK-146', 'COMP-6'], card: 'N:1', propagation: 'TS', coverage: ['CR-54'], description: 'Which register entry produced the snapshot.' }),

  // ---- composition and structure ----------------------------------------
  lk('contains', 'part of', [[['Artifact'], ALL], [['Flow'], ['FlowStep']], [['Competitor'], ['CompetitorCapability', 'PricePoint', 'CompetitorProductLine']], [['CompetitorProductLine'], ['CompetitorCapability', 'PricePoint']]], { v2Ref: ['LK-027'], propagation: 'TS', description: 'Composition. A change inside the part makes the container suspect.' }),
  lk('supersedes', 'superseded by', [[ALL, ALL]], { v2Ref: ['LK-046'], sameType: true, propagation: 'INFO', description: 'New item replaces an old one of the same type.' }),
  lk('attached_to', 'has attachment', [[['Attachment'], ALL]], { v2Ref: ['PORTFOLIO/attached_to'], description: 'An uploaded file attached to any item (Evidence, Competitor, PricePoint...).' }),
  lk('includes_capability', 'included in', [[['PricePoint'], ['CompetitorCapability']]], { description: 'This plan includes the capability the competitor was rated on.' }),
  lk('offers', 'offered in', [[['PricingPlan'], ['Capability']]], { description: 'Our plan includes this feature from our common feature list.' }),
  lk('maps_to', 'has competitor ratings', [[['CompetitorCapability'], ['Capability']]], { card: 'N:1', description: 'Our common name for the feature a competitor calls something else.' }),
  lk('note_on', 'has note', [[['CompetitorNote'], ['Competitor']]], { v2Ref: ['PORTFOLIO/note_on'], card: 'N:1', description: 'Timeline note about a competitor.' }),
  lk('points_to', 'pointed to by', [[['Pointer'], ['Attachment']]], { v2Ref: ['PORTFOLIO/points_to'], card: 'N:1', description: 'The uploaded document a Pointer anchors into.' }),
  lk('cited_by', 'cites', [[['Pointer'], ALL]], { v2Ref: ['PORTFOLIO/cited_by'], description: 'A Pointer (exact quote at a place in a document) that backs an item. The item also links supported_by the Pointer.' }),
  lk('relates_to', 'related to', [[ALL, ALL]], { v2Ref: ['LK-109'], description: 'Informal association; never propagates and never counts for coverage.' }),

  // ---- registers: assumptions, constraints, questions, risks (long range) -
  lk('assumes', 'assumed by', [[SETS.ASSUMERS, ['Assumption']]], { v2Ref: ['LK-034'], propagation: 'TS', coverage: ['CR-24'], longRange: true, description: 'The source is valid only if the Assumption holds.' }),
  lk('constrains', 'constrained by', [[['Constraint'], SETS.CONSTRAINED]], { v2Ref: ['LK-062'], propagation: 'ST', coverage: ['CR-22'], longRange: true, description: 'A Constraint limits the target (any later phase).' }),
  lk('affects', 'affected by', [[['Assumption', 'Constraint', 'Question', 'Risk'], ALL]], {
    v2Ref: ['LK-034', 'LK-062', 'LK-065', 'LK-070'], v2Note: 'Prototype umbrella link requested by the brief; the spec expresses the same routes with assumes / constrains / clarifies / threatens.',
    propagation: 'ST', longRange: true, description: 'Register item (assumption, constraint, question, risk) affects any later item.',
  }),
  lk('blocks', 'blocked by', [[['Question'], ['Gate', ...ALL]]], { v2Ref: ['LK-064'], longRange: true, description: 'An open Question blocks a Gate or an item.' }),
  lk('clarifies', 'clarified by', [[['Question'], ALL]], { v2Ref: ['LK-065'], longRange: true, description: 'Question concerns the item.' }),
  lk('answered_by', 'answers', [[['Question'], ['Evidence', 'Insight', 'Experiment']]], { v2Ref: ['LK-066'], description: 'Factual answer to a Question.' }),
  lk('resolves', 'resolved by', [[['Decision'], ['Question']]], { v2Ref: ['LK-067'], description: 'Approving the Decision closes the Question.' }),
  lk('provisionally_answered_by', 'provisional answer for', [[['Question'], ['Assumption']]], { v2Ref: ['LK-068'], card: 'N:1', propagation: 'TS', description: 'A Must Question carried as Provisional rests on this Assumption.' }),
  lk('tests', 'tested by', [[['Experiment'], ['Assumption']]], { v2Ref: ['LK-035'], description: 'Experiment that validates or invalidates an Assumption.' }),
  lk('threatens', 'threatened by', [[['Risk'], ALL]], { v2Ref: ['LK-070'], propagation: 'INFO', longRange: true, description: 'Risk to any item.' }),
  lk('mitigates', 'mitigated by', [[SETS.MITIGATORS, ['Risk']]], { v2Ref: ['LK-072'], propagation: 'TS', description: 'Source reduces the Risk.' }),
  lk('decides', 'decided by', [[['Decision'], ['Gate', ...ALL]]], { v2Ref: ['LK-075'], propagation: 'ST', longRange: true, description: 'Decision concerns the item.' }),
  lk('waives', 'waived by', [[['Waiver'], ['Gate', 'Question', 'Requirement']]], { v2Ref: ['LK-089'], attrs: [{ name: 'criterion_id', kind: 'text' }], description: 'Waiver subject.' }),
  lk('condition_of', 'has condition', [[['Condition'], ['Gate']]], { v2Ref: ['LK-090'], card: 'N:1', description: 'Gate decision that created the Condition.' }),
  lk('tracks', 'tracked by', [[['Condition'], ['Question', ...ALL]]], { v2Ref: ['LK-091'], description: 'Item or Question a Condition requires to be closed.' }),

  // ---- phase 2: definition ----------------------------------------------
  lk('supports', 'supported by (goal)', [[['Feature'], ['Objective', 'Metric', 'Constraint', 'Obligation', 'Opportunity']]], { v2Ref: ['LK-028'], propagation: 'TS', coverage: ['CR-07'], description: 'Why the Feature exists.' }),
  lk('replaces', 'replaced by', [[['Feature'], ['SystemFunction']]], { v2Ref: ['LK-029b'], propagation: 'INFO', description: 'The new feature takes over this function of the existing system.' }),
  lk('realizes', 'realized by', [[['Feature'], ['Opportunity']]], { v2Ref: ['LK-029'], propagation: 'TS', description: 'Feature realises an Opportunity.' }),
  lk('targets', 'targeted by', [[['Opportunity', 'Feature'], ['Segment', 'Persona']]], { v2Ref: ['LK-030'], propagation: 'TS', description: 'Intended customer group.' }),
  lk('differentiates', 'differentiated by', [[['Feature'], ['Competitor', 'CompetitorCapability']]], { v2Ref: ['LK-031'], propagation: 'TS', attrs: [{ name: 'rating', kind: 'enum', values: ['ahead', 'parity', 'behind'] }], description: 'Feature position against a competitor.' }),
  lk('measures', 'measured by', [[['Metric'], ['Objective', 'Feature', 'Opportunity']]], { v2Ref: ['LK-039'], propagation: 'TS', description: 'A Metric measures progress on an Objective, Feature or Opportunity.' }),
  lk('scopes', 'scoped by', [[['ScopeEntry'], ['Feature', 'Module', 'ExternalSystem', 'Requirement']]], { v2Ref: ['LK-043'], propagation: 'TS', coverage: ['CR-08'], description: 'Scope disposition for a subject.' }),
  lk('justified_by', 'justifies', [[['ScopeEntry'], ['Decision', 'Constraint', 'Obligation']]], { v2Ref: ['LK-044'], propagation: 'TS', coverage: ['CR-08'], description: 'Reason for the scope disposition.' }),
  lk('refines', 'refined by', [[['ScopeEntry'], ['ScopeEntry']], [['Requirement'], ['Requirement']], [['Story'], ['Story']]], { v2Ref: ['LK-045'], propagation: 'TS', description: 'The source is a more detailed version of the target.' }),
  lk('belongs_to', 'contains (module)', [[['Feature', 'Requirement', 'Flow', 'FlowStep', 'Entity', 'Story'], ['Module']]], { v2Ref: ['LK-049'], card: 'N:1', coverage: ['CR-09'], description: 'Module attribution.' }),
  lk('planned_in', 'contains plan of', [[['Feature', 'Requirement', 'Story'], ['Release']]], { v2Ref: ['LK-050'], card: 'N:1', propagation: 'TS', coverage: ['CR-10'], description: 'Release assignment (MVP slice).' }),
  lk('staffed_by', 'staffs', [[['Release'], ['Capacity']]], { v2Ref: ['LK-053'], propagation: 'TS', description: 'Capacity available to deliver a Release.' }),
  lk('bounded_by', 'bounds', [[['Capacity', 'PhaseBudget'], ['Constraint']]], { v2Ref: ['LK-054'], propagation: 'TS', description: 'A budget or date Constraint bounding capacity.' }),

  // ---- phase 3: requirements --------------------------------------------
  lk('derives_from', 'source of', [[['Requirement', 'BusinessRule'], SETS.DERIVE_TGT]], { v2Ref: ['LK-092'], propagation: 'TS', coverage: ['CR-11'], longRange: true, description: 'Provenance of a Requirement or BusinessRule (no orphans).' }),
  lk('elaborates', 'elaborated by', [[['Story'], ['Requirement', 'Feature']]], { v2Ref: ['LK-093'], propagation: 'TS', coverage: ['CR-13'], description: 'Story elaborates what it implements.' }),
  lk('for_persona', 'has story', [[['Story'], ['Persona']]], { v2Ref: ['LK-094'], card: 'N:1', propagation: 'TS', coverage: ['CR-19'], description: 'The Persona the Story serves (mandatory).' }),
  lk('specifies', 'specified by', [[['AcceptanceCriterion'], ['Requirement', 'Story', 'BusinessRule']]], { v2Ref: ['LK-095'], propagation: 'TS', coverage: ['CR-12'], description: 'AC states the testable behaviour of its target.' }),
  lk('exercises', 'exercised by', [[['AcceptanceCriterion'], ['FlowStep', 'FlowEdge', 'State', 'Transition']]], { v2Ref: ['LK-096'], propagation: 'TS', coverage: ['CR-31'], description: 'AC covers a flow path element or a state change (FlowEdge = a next link).' }),
  lk('applies', 'applied by', [[['BusinessRule'], ['FlowStep', 'Requirement', 'Story']]], { v2Ref: ['LK-098'], propagation: 'ST', coverage: ['CR-18'], description: 'The rule governs the target; parameter change flags the target.' }),
  lk('applies_to', 'carries', [[['Requirement', 'Obligation'], ['Product', 'Feature', 'Module', 'Flow', 'FlowStep', 'Story', 'Release']]], {
    v2Ref: ['LK-101'], propagation: 'ST', coverage: ['CR-14', 'CR-26'], description: 'Scope of a cross-cutting requirement or obligation. Targeting the Product itself means "global".',
  }),
  lk('annotates', 'annotated by', [[['Requirement'], ['Flow', 'FlowStep']]], { v2Ref: ['LK-102'], propagation: 'ST', description: 'NFR hook on a flow or step (no coverage credit as behaviour).' }),
  lk('operates_on', 'operated on by', [[['Requirement'], ['Entity']]], { v2Ref: ['LK-104'], propagation: 'TS', coverage: ['CR-16'], description: 'Data requirement concerns an Entity.' }),
  lk('integrates_with', 'integrated by', [[['Requirement', 'Flow'], ['ExternalSystem']]], { v2Ref: ['LK-105'], propagation: 'TS', coverage: ['CR-15'], description: 'Integration dependency.' }),
  lk('satisfies', 'satisfied by', [[['Requirement', 'BusinessRule'], ['Obligation']]], { v2Ref: ['LK-117'], propagation: 'TS', coverage: ['CR-17', 'CR-25'], description: 'Requirement or rule implements an Obligation.' }),
  lk('conflicts_with', 'conflicts with', [[['Requirement', 'BusinessRule', 'Feature', 'Constraint'], ['Requirement', 'BusinessRule', 'Feature', 'Constraint']]], { v2Ref: ['LK-110'], propagation: 'BOTH', attrs: [{ name: 'status', kind: 'enum', values: ['open', 'resolved'], default: 'open' }], description: 'Declared conflict; open conflicts block Gate 3.' }),

  // ---- phase 4: flows ----------------------------------------------------
  lk('covers', 'covered by', [[['FlowStep'], ['Requirement', 'Story']]], { v2Ref: ['LK-103'], propagation: 'TS', coverage: ['CR-28'], description: 'The step implements the behaviour of a requirement or story.' }),
  lk('next', 'preceded by', [[['FlowStep'], ['FlowStep']]], {
    v2Ref: ['LK-120'], v2Note: 'Spec name: flows_to.', propagation: 'INFO', coverage: ['CR-31'], edgeKey: 'EDG',
    attrs: [{ name: 'kind', kind: 'enum', values: ['happy', 'alternate', 'failure'], required: true }, { name: 'condition', kind: 'text' }],
    description: 'Sequence edge between steps (happy, alternate or failure) with an optional guard condition.',
  }),
  lk('actor_of', 'performed by (primary)', [[['Actor'], ['Flow']]], { v2Ref: ['LK-118'], v2Note: 'Spec name: performs.', description: 'Primary actor of a Flow.' }),
  lk('performed_by', 'performs step', [[['FlowStep'], ['Actor']]], { v2Ref: ['LK-119'], card: 'N:1', propagation: 'TS', coverage: ['CR-34'], description: 'Actor of a step.' }),
  lk('calls', 'called by', [[['FlowStep'], ['ExternalSystem']]], { v2Ref: ['LK-106'], propagation: 'TS', coverage: ['CR-34'], description: 'Marks an external call.' }),
  lk('of_entity', 'has state', [[['State'], ['Entity']]], { v2Ref: ['LK-122'], card: 'N:1', propagation: 'TS', coverage: ['CR-30'], description: 'State belongs to an Entity lifecycle.' }),
  lk('from_state', 'leaves', [[['Transition'], ['State']]], { v2Ref: ['LK-123'], card: 'N:1', propagation: 'TS', coverage: ['CR-30'], description: 'Origin state of a Transition.' }),
  lk('to_state', 'enters', [[['Transition'], ['State']]], { v2Ref: ['LK-124'], card: 'N:1', propagation: 'TS', coverage: ['CR-30'], description: 'Destination state of a Transition.' }),
  lk('triggers_transition', 'triggered by', [[['FlowStep'], ['Transition']]], { v2Ref: ['LK-125'], propagation: 'TS', coverage: ['CR-30'], description: 'Step that performs a state change.' }),
  lk('in_state', 'required by step', [[['FlowStep'], ['State']]], { v2Ref: ['LK-126'], v2Note: 'Spec name: requires_state.', propagation: 'TS', description: 'Pre-check: step needs the Entity to be in this State.' }),

  // ---- handoff -----------------------------------------------------------
  lk('handed_off_as', 'handoff of', [[['Story'], ['Handoff']]], { v2Ref: ['LK-142'], description: 'Story package versions sent to the developer tool.' }),
  lk('includes', 'included in', [[['Handoff'], ALL]], { v2Ref: ['LK-143'], propagation: 'TS', description: 'Closure membership of a package version; a change flags the handoff for re-send.' }),
];

LINKS.push(...phases_5_12_linksMod(lk));

const LINK_MAP = Object.fromEntries(LINKS.map((l) => [l.name, l]));
for (const l of LINKS) l.v2Ref = l.v2Ref || [];

/** Virtual (non-stored) targets: gates and flow edges. */
function virtualType(id) {
  if (/^GATE-(?:[0-9]|1[0-2])$/.test(id)) return 'Gate';
  if (/^EDG-\d+$/.test(id)) return 'FlowEdge';
  return null;
}

function typeSetMatches(set, type) {
  return set.includes('ANY') ? (type !== 'Gate' && type !== 'FlowEdge') || set.includes(type) : set.includes(type);
}

/**
 * Validate a would-be link. `ctx` needs: ctx.getType(id) -> type name or null, ctx.linksOf(id) -> array of links.
 * Returns an array of error strings (empty when legal).
 */
function validateLink(ctx, type, source, target, attrs = {}) {
  const errors = [];
  const def = LINK_MAP[type];
  if (!def) return [`Unknown link type "${type}"`];
  const st = ctx.getType(source);
  const tt = ctx.getType(target);
  if (!st) errors.push(`source ${source} does not exist`);
  if (!tt) errors.push(`target ${target} does not exist`);
  if (errors.length) return errors;
  if (source === target) errors.push('an item cannot link to itself');
  const ok = def.pairs.some(([ss, ts]) => typeSetMatches(ss, st) && typeSetMatches(ts, tt));
  if (!ok) {
    const allowed = def.pairs.map(([ss, ts]) => `${ss.join('|')} -> ${ts.join('|')}`).join('; ');
    errors.push(`link "${type}" does not allow ${st} -> ${tt} (allowed: ${allowed})`);
  }
  if (def.sameType && st !== tt) errors.push(`link "${type}" requires source and target of the same type`);
  // attribute validation
  for (const a of def.attrs) {
    const v = attrs[a.name];
    if (v === undefined || v === '') { if (a.required) errors.push(`link "${type}" needs attribute "${a.name}"`); continue; }
    if (a.kind === 'enum' && !a.values.includes(v)) errors.push(`attribute ${a.name}="${v}" not in [${a.values.join(', ')}]`);
  }
  for (const k of Object.keys(attrs)) if (!def.attrs.some((a) => a.name === k)) errors.push(`link "${type}" has no attribute "${k}"`);
  // duplicates and cardinality
  const mine = ctx.linksOf(source).filter((l) => l.type === type && l.source === source);
  if (mine.some((l) => l.target === target)) errors.push(`duplicate link ${source} -${type}-> ${target}`);
  if ((def.card === 'N:1' || def.card === '1:1') && mine.length >= 1 && !mine.some((l) => l.target === target)) {
    errors.push(`cardinality ${def.card}: ${source} already has a "${type}" link (to ${mine[0].target})`);
  }
  if (def.card === '1:N' || def.card === '1:1') {
    const incoming = ctx.linksOf(target).filter((l) => l.type === type && l.target === target);
    if (incoming.length >= 1 && !incoming.some((l) => l.source === source)) errors.push(`cardinality ${def.card}: ${target} already has a "${type}" link`);
  }
  return errors;
}

function describe() {
  return LINKS.map((l) => ({
    name: l.name, inverse: l.inverse, card: l.card, propagation: l.propagation, v2Ref: l.v2Ref, v2Note: l.v2Note || null,
    pairs: l.pairs.map(([s, t]) => ({ sources: s, targets: t })), attrs: l.attrs, coverage: l.coverage || [], longRange: !!l.longRange, description: l.description,
  }));
}

/** Which end of a link changes drive suspect flags on which other end. Returns {driver, dependent} id arrays. */
function ends(link) {
  const def = LINK_MAP[link.type];
  const p = def ? def.propagation : 'INFO';
  if (p === 'TS') return [{ driver: link.target, dependent: link.source }];
  if (p === 'ST') return [{ driver: link.source, dependent: link.target }];
  if (p === 'BOTH') return [{ driver: link.target, dependent: link.source }, { driver: link.source, dependent: link.target }];
  return [];
}

export const TYPES_COUNT = Object.keys(TYPES).length;
export { LINKS, LINK_MAP, SETS, validateLink, describe, ends, virtualType };
