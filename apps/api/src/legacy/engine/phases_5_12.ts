/**
 * engine/phases_5_12.ts - record types and links for Phases 5 to 12 of the lifecycle (the part the prototype did not build).
 * Same rules as Phases 0-4: a type is data (prefix, phase, statuses, fields), a link is data (allowed pairs, propagation).
 * Gate criteria for these phases are in data/gates.json (ids G5-xx ... G12-xx), coverage rules in data/coverage_rules.json (CR-P5-xx ...).
 * Source of the shapes: reports/Roadmap - rollout and phases 5 to 12.md section 4 and the lifecycle PDF (Phase 9 quality gates).
 */

import phases_5_12_linksMod from './phases_5_12_links';
function extendTypes(TYPES, h) {
  const { T, LT, E, N, D, B, R, RS, L, req, DOC_STATUSES } = h;
  const sev = ['Critical', 'High', 'Medium', 'Low'];
  Object.assign(TYPES, {
    // ===================== Phase 5: UX / UI design =====================
    Screen: {
      prefix: 'SCR', phase: 5, v2Ref: ['LIFECYCLE/P5/Screen'], statuses: DOC_STATUSES,
      fields: [E('kind', ['page', 'dialog', 'panel', 'report', 'email', 'mobile_screen']), T('design_link', { help: 'Link to the frame in Figma or Penpot. Never copy the design here.' }), T('designer'), B('responsive_checked'), B('accessibility_checked'), LT('purpose')],
      suspectFields: ['design_link', 'purpose'],
    },
    ScreenState: {
      prefix: 'SST', phase: 5, v2Ref: ['LIFECYCLE/P5/ScreenState'], statuses: DOC_STATUSES,
      fields: [req(E('state_kind', ['loading', 'empty', 'success', 'error', 'permission_denied', 'offline', 'partial'])), LT('description'), T('design_link')],
      suspectFields: ['state_kind', 'description'],
    },
    DesignReview: {
      prefix: 'DRV', phase: 5, v2Ref: ['LIFECYCLE/P5/DesignReview'], statuses: ['Requested', 'Approved', 'Changes requested', 'Rejected'],
      fields: [T('reviewer'), D('reviewed_on'), LT('findings'), E('scope', ['information_architecture', 'wireframes', 'ui_design', 'design_system', 'accessibility'])],
      suspectFields: ['findings'],
    },
    // ===================== Phase 6: system / technical architecture =====================
    ArchComponent: {
      prefix: 'ARC', phase: 6, v2Ref: ['LIFECYCLE/P6/Component'], statuses: DOC_STATUSES,
      fields: [req(E('kind', ['frontend', 'backend', 'database', 'integration', 'infrastructure', 'security', 'observability'])), T('technology'), T('owner'), LT('responsibility'), T('diagram_link')],
      suspectFields: ['kind', 'technology'],
    },
    ArchDecision: {
      prefix: 'ADR', phase: 6, v2Ref: ['LIFECYCLE/P6/ArchitectureDecision'], statuses: ['Proposed', 'Accepted', 'Superseded', 'Rejected'],
      fields: [req(LT('context')), req(LT('decision')), L('alternatives'), req(LT('consequences')), T('decider'), D('decided_on')],
      suspectFields: ['decision', 'consequences'],
    },
    ApiContract: {
      prefix: 'API', phase: 6, v2Ref: ['LIFECYCLE/P6/ApiContract'], statuses: DOC_STATUSES,
      fields: [req(T('spec_link', { help: 'Link to the OpenAPI file or contract document in the repository.' })), req(T('version')), T('owner'), E('kind', ['rest', 'graphql', 'event', 'file', 'webhook']), LT('summary')],
      suspectFields: ['spec_link', 'version'],
    },
    // ===================== Phase 7: detailed development specification =====================
    FeatureSpec: {
      prefix: 'FSP', phase: 7, v2Ref: ['LIFECYCLE/P7/FeatureSpecification'], statuses: DOC_STATUSES,
      fields: [
        LT('preconditions'), LT('trigger_input'), LT('pre_checks'), LT('main_flow'), LT('state_data'), LT('output'),
        LT('backend_needs'), LT('database_needs'), LT('integration_needs'), LT('ui_needs'), LT('business_rules'), LT('edge_cases'),
        LT('security_notes'), LT('observability_notes'), LT('testing_requirements'), L('definition_of_done'), T('owner'),
      ],
      suspectFields: ['main_flow', 'edge_cases', 'definition_of_done'],
    },
    // ===================== Phase 8: development (status and links only) =====================
    WorkItem: {
      prefix: 'DEV', phase: 8, v2Ref: ['LIFECYCLE/P8/WorkItem'], statuses: ['To do', 'In progress', 'In review', 'Done', 'Blocked'],
      fields: [T('assignee'), T('branch'), T('pr_url', { label: 'pull request link' }), T('commit_sha'), B('dod_met', { label: 'definition of done met' }), B('code_reviewed'), T('build_ref')],
      suspectFields: [],
    },
    // ===================== Phase 9: QA, testing, security, acceptance =====================
    TestPlan: {
      prefix: 'TPL', phase: 9, v2Ref: ['LIFECYCLE/P9/TestPlan'], statuses: DOC_STATUSES,
      fields: [LT('scope'), LT('approach'), LT('environments'), T('owner'), LT('exit_criteria')],
      suspectFields: ['scope', 'exit_criteria'],
    },
    TestCase: {
      prefix: 'TC', phase: 9, v2Ref: ['LIFECYCLE/P9/TestCase'], statuses: DOC_STATUSES,
      fields: [
        req(E('kind', ['functional', 'negative', 'edge', 'authorization', 'data_integrity', 'integration', 'regression', 'security', 'performance'])),
        E('priority', ['Must', 'Should', 'Could']), LT('steps'), req(LT('expected')), LT('test_data'),
      ],
      suspectFields: ['steps', 'expected', 'kind'],
    },
    TestRun: {
      prefix: 'RUN', phase: 9, v2Ref: ['LIFECYCLE/P9/TestExecution'], statuses: ['Recorded', 'Voided'],
      fields: [req(E('result', ['Pass', 'Fail', 'Blocked', 'Skipped'])), req(D('run_on')), T('run_by'), T('build'), T('environment'), T('evidence_link'), LT('notes')],
      suspectFields: [],
    },
    Defect: {
      prefix: 'DFT', phase: 9, v2Ref: ['LIFECYCLE/P9/Defect'], statuses: ['Open', 'Fixed', 'Retest', 'Closed', 'Accepted', 'Rejected'],
      fields: [req(E('severity', sev)), LT('description'), LT('steps_to_reproduce'), T('found_in'), T('assignee'), D('fixed_on'), LT('acceptance_note')],
      suspectFields: [],
    },
    SecurityFinding: {
      prefix: 'SEC', phase: 9, v2Ref: ['LIFECYCLE/P9/SecurityFinding'], statuses: ['Open', 'Fixed', 'Accepted', 'False positive'],
      fields: [req(E('severity', sev)), T('source_tool'), LT('description'), T('reference'), T('owner'), LT('acceptance_note')],
      suspectFields: [],
    },
    UatSignoff: {
      prefix: 'UAT', phase: 9, v2Ref: ['LIFECYCLE/P9/Acceptance'], statuses: ['Requested', 'Accepted', 'Accepted with conditions', 'Rejected'],
      fields: [req(T('stakeholder')), D('signed_on'), LT('comments'), LT('conditions')],
      suspectFields: [],
    },
    // ===================== Phase 10: deployment =====================
    DeployRelease: {
      prefix: 'DPL', phase: 10, v2Ref: ['LIFECYCLE/P10/Release'], statuses: ['Planned', 'Approved', 'Deployed', 'Rolled back', 'Failed'],
      fields: [
        req(T('version')), req(E('environment', ['staging', 'production', 'pilot'])), LT('release_notes'), LT('rollback_plan'), LT('migration_record'),
        E('smoke_result', ['not_run', 'pass', 'fail']), D('deployed_on'), T('pipeline_link'), T('approved_by'),
      ],
      suspectFields: ['version', 'rollback_plan'],
    },
    // ===================== Phase 11: operations / observability =====================
    Alert: {
      prefix: 'ALR', phase: 11, v2Ref: ['LIFECYCLE/P11/Alert'], statuses: ['Draft', 'Active', 'Retired'],
      fields: [E('kind', ['availability', 'latency', 'error_rate', 'resource', 'security', 'business']), LT('condition'), E('severity', sev), T('owner'), T('dashboard_link')],
      suspectFields: ['condition'],
    },
    Runbook: {
      prefix: 'RBK', phase: 11, v2Ref: ['LIFECYCLE/P11/Runbook'], statuses: DOC_STATUSES,
      fields: [req(T('owner')), LT('steps'), D('last_reviewed'), T('doc_link')],
      suspectFields: ['steps'],
    },
    Incident: {
      prefix: 'INC', phase: 11, v2Ref: ['LIFECYCLE/P11/Incident'], statuses: ['Open', 'Mitigated', 'Resolved', 'Reviewed'],
      fields: [req(E('severity', sev)), D('started_on'), D('resolved_on'), LT('impact'), LT('root_cause'), LT('post_incident_review')],
      suspectFields: [],
    },
    HealthReview: {
      prefix: 'HLR', phase: 11, v2Ref: ['LIFECYCLE/P11/HealthReport'], statuses: ['Draft', 'Reviewed'],
      fields: [D('period_end'), LT('availability_summary'), LT('latency_summary'), LT('incidents_summary'), LT('actions'), T('reviewer')],
      suspectFields: [],
    },
    // ===================== Phase 12: feedback and iteration =====================
    Feedback: {
      prefix: 'FDB', phase: 12, v2Ref: ['LIFECYCLE/P12/Feedback'], statuses: ['New', 'Triaged', 'Planned', 'Done', 'Rejected'],
      fields: [E('source', ['user', 'stakeholder', 'support', 'incident', 'defect', 'usage_data', 'team']), E('kind', ['bug', 'improvement', 'new_need', 'question']), LT('detail'), T('reported_by'), D('received_on')],
      suspectFields: [],
    },
    Lesson: {
      prefix: 'LSN', phase: 12, v2Ref: ['LIFECYCLE/P12/LessonLearned'], statuses: ['Draft', 'Shared'],
      fields: [req(LT('what_happened')), LT('what_to_change'), T('owner')],
      suspectFields: [],
    },
  });
}

export const extendLinks = (lk) => phases_5_12_linksMod(lk);
export { extendTypes };
