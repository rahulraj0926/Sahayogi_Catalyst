/**
 * engine/lint.ts - small rule-based text lint (spec 3.9.1). Rules are data-like: a name, a test and a severity.
 * Only the rules the gate criteria use are implemented: solution_language, vague_word, tbd, missing_measure.
 */

const VAGUE = /\b(adequate|fast|quick(?:ly)?|user[- ]friendly|robust|minimal|easy|easily|seamless(?:ly)?|reasonable|flexible|intuitive|scalable|efficient(?:ly)?|appropriate)\b/i;
const TBD = /\b(TBD|TBC|to be decided|to be confirmed)\b|\[NEEDS CLARIFICATION\]/i;
const SOLUTION = /\b(we (?:should|will|need to) (?:build|implement|develop|deploy)|build (?:a|an|the)\b|implement(?:ing)? (?:a|an|the)\b|using (?:a|an|the)\s+\w+|(?:an?|the) (?:new )?(?:app|portal|platform|dashboard|system|tool)\b|develop(?:ing)? (?:a|an|the)\b)/i;

const RULES = {
  solution_language: { severity: 'High', test: (t) => SOLUTION.test(t), msg: 'contains solution language (verbs or product names) instead of describing the problem' },
  vague_word: { severity: 'Medium', test: (t) => VAGUE.test(t), msg: 'contains a non-measurable word' },
  tbd: { severity: 'High', test: (t) => TBD.test(t), msg: 'contains TBD or an unresolved clarification marker' },
};

/** Text fields to lint per item type. */
const FIELDS = {
  Requirement: ['statement'], Story: ['want', 'benefit'], AcceptanceCriterion: ['given', 'when', 'then'],
  IntakeBrief: ['problem_statement'], Problem: ['statement'],
};

function lintText(text, rules) {
  const out = [];
  if (!text || typeof text !== 'string') return out;
  for (const r of rules) if (RULES[r] && RULES[r].test(text)) out.push({ rule: r, severity: RULES[r].severity, message: RULES[r].msg });
  return out;
}

/** Findings for one item. `rules` limits which rules run. Must items escalate Medium to High (spec 3.9.1). */
function lintItem(item, rules = ['vague_word', 'tbd']) {
  const findings = [];
  for (const field of FIELDS[item.type] || []) {
    for (const f of lintText(item[field], rules)) {
      // a vague word beside a number is acceptable ("fast" next to "<= 60 ms" is rare, but 'quickly' within 5 seconds is common)
      if (f.rule === 'vague_word' && /\d/.test(item[field])) continue;
      findings.push({ ...f, field, severity: item.priority === 'Must' && f.severity === 'Medium' ? 'High' : f.severity });
    }
  }
  return findings;
}

export { lintText, lintItem, RULES };
