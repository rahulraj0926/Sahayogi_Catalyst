# Roadmap: putting Sahayogi Developer to work, and extending it to Phases 5 to 12

Written 2026-10-10. Everything about effort is an estimate, not a measurement. Everything about the current tool comes from what was run and tested in this project.

## 1. The short answer

1. **First, prove the tool on one real product.** Phases 0 to 4 are built and a blank install reached a hand-over package in one scripted run. That run used invented facts. The next step is a real pilot with a real product, a few real colleagues and a real server. Four things stand between the tool and that pilot: hosting, logins, an "existing system" mode, and the developer-tool handoff. Section 3 covers them.
2. **Then extend the same engine, one stage at a time, at documentation level.** The tool does not replace your design, code, test or monitoring tools. For Phases 5 to 12 it holds the documents, the links between them, the approvals and the quality checks, and it points to the real tools for the actual work. Section 4 covers each phase.
3. **Go in four releases over about 10 to 14 weeks,** with a real product going through each release before the next one starts. Section 5 gives the plan.

## 2. What the tool can and cannot do today (honest)

| Works | Does not work or is weak |
|---|---|
| Portfolio of products and ideas, a seven-step journey, one question at a time | One computer only, no logins. A link plus a typed name is the only check |
| 30 readable documents for Phases 0 to 4, approvals through links, exceptions with a named approver | The "document how it works today" mode for existing systems is not built (needed for BoSS) |
| Files viewer, evidence links to exact slide or cell, review inbox, price and fact extraction from files | The free assistant finds prices, years and "must" sentences only. The paid AI route is built but never run against the real service |
| Competitor workspace, compare, reports, people list, flow editor, hand-over package | Drafted requirements, stories and tests echo your feature names; a person must rewrite them |
| Cost guard for paid AI use, feedback button, word budgets on every screen | A person still needs about 8 to 10 hours per product for Phases 0 to 4, plus colleagues |

## 3. Rolling out Phases 0 to 4 for real (weeks 1 to 6)

**Pick the pilot.** Default: the BoSS rebuild, because it is real, it exists today, and it exercises the hardest case. It needs the existing-system mode first. A smaller new product is the safer second pilot.

**Do these first (build, about 8 to 12 person-days, estimate):**
1. **Existing-system mode.** For each function of the old system: how it works today, what is wrong, a decision (keep, fix, add, confirm, exclude), and the approved target behaviour. Evidence pinned to a screenshot or document. This is the "AS-IS, gap, decision, TO-BE" chain in your lifecycle document.
2. **Hosting.** Run it on one company machine on your network. Approval links work only inside that network. For outside people (dealers, auditors), a hosted copy is needed: decide the host (company server or a cloud account) and a backup routine.
3. **Logins.** Sign in with the Microsoft accounts you already have, so an approval means a real person. Until then, treat approvals as recorded names.
4. **Developer-tool handoff.** Learn what your in-house developer tool (the Sahayogi One repo) accepts. The hand-over package already exists as a JSON file with stories, tests, rules, flows and quality targets; the missing piece is the receiving side.
5. **Starter pack for your company:** your own roles, your document headers, your approval chain, examples from electronics and software, replacing the invented samples.

**Run the pilot (about 4 weeks).** One product leader, one sponsor, a business analyst, Legal, an IT head, a service or sales head, and two or three dealers or customers for quotes. Weekly 60-minute check-ins. Measure: hours per stage, questions skipped, approvals waiting longer than three days, and every "Something wrong here?" note. Exit test: the leader finishes Stage 4 and creates a hand-over package without help, and the developers say the package is usable.

## 4. Phases 5 to 12 at documentation level

For each phase: what the lifecycle document says it produces, what the tool adds, which real tool it points to, and who does the work. "Record" means a new record type in the existing engine; "template" means a generated document skeleton with the missing parts marked.

| Phase | Produces (from your lifecycle document) | What the tool adds | Real tool it points to | Who does the work |
|---|---|---|---|---|
| **5 UX/UI design** | Information architecture, wireframes, UI designs, design system, interaction specs, responsive and accessibility states | Screen list linked to stories and flow steps; a state matrix per screen (loading, empty, error, success, permission denied); design review approval by link; check "every story has screens and states" | Figma or Penpot (links to frames, never copies) | UX designer |
| **6 System architecture** | System architecture, component diagram, data model, API contracts, integration, security, infrastructure | Architecture decision records; a table mapping every quality target and legal obligation from Phase 3 to the design answer; diagrams written as text and shown inline; links to API specification files | Git repository, OpenAPI files, diagram files | Architect, security lead |
| **7 Detailed development specification** | Per feature: story, preconditions, trigger and input, pre-checks, main flow, state and data, output, backend, database, integration and UI needs, rules, edge cases, security, observability, acceptance criteria, testing needs, definition of done | A feature specification template filled from the stories, flows and rules already in the tool, with gaps marked; completeness check per feature; developer-ready export | Developer tool | Business analyst with the tech lead |
| **8 Development** | Working code, database changes, APIs, integrations, developer tests, code review, build artifacts | Read-only status: which stories are in progress, in review, done; links from each requirement to its pull requests and commits; evidence that the definition of done is met | Sahayogi One developer tool, Git | Developers (outside the tool) |
| **9 QA, security, acceptance** | Test plan, test cases, test data, execution results, defect register, security findings, regression results, acceptance results, quality report, release-readiness sign-off | Test cases linked to acceptance criteria; results imported from a spreadsheet or test report; a defect register; acceptance sign-off by link from real stakeholders; the ten quality gates from your lifecycle document computed live (requirement coverage, functional correctness, negative and edge cases, authorization, data integrity, integration, regression, security, acceptance, release readiness) | Test tool or spreadsheets, security scanner reports | QA lead, security lead, business owners |
| **10 Deployment** | Release package, deployment record, migration record, smoke-test results, rollback plan, release notes | Release record with a checklist; release notes generated from approved stories; rollback plan template; sign-off by link; link to the deployment run | CI/CD pipeline | DevOps lead |
| **11 Operations and observability** | Dashboards, logs, metrics, traces, alerts, incident records, runbooks, health reports | Not a monitoring tool. Holds the service-level targets from Phase 3, the alert catalogue, runbooks, incident records with post-incident reviews, a monthly health review; links to the live dashboards | Monitoring and logging tools | SRE or operations head |
| **12 Feedback and iteration** | Feedback register, improvement backlog, change requests, prioritization, updated requirements and designs, lessons learned | Feedback intake (the "Something wrong here?" idea, for users of the product); change requests that reopen the right earlier stage and mark everything downstream as needing a second look (the engine already does this); version history; lessons-learned page | Support desk | Product leader |

## 5. Releases (estimates; assume a real product goes through each one)

| Release | Weeks | Scope | Build effort (estimate) | Exit test |
|---|---|---|---|---|
| **A: Pilot ready** | 1 to 6 | Section 3: existing-system mode, hosting, logins, handoff receiver, company starter pack, and the BoSS pilot | 8 to 12 person-days, plus the pilot | A real product finishes Phases 0 to 4 without help |
| **B: Design to spec (5, 6, 7)** | 7 to 9 | Screen list and state matrix, architecture records and the quality-target mapping, feature specification template | 7 to 10 person-days | A real feature has screens, an architecture answer and a complete specification, linked to its stories |
| **C: Build to release-ready (8, 9)** | 10 to 12 | Developer-tool status link, test cases, results import, defect register, acceptance by link, the ten quality gates | 7 to 9 person-days | A real release shows green or knowingly waived on all ten gates |
| **D: Release to learning (10, 11, 12)** | 13 to 14 | Release record and notes, runbooks and incidents, feedback and change requests | 7 to 10 person-days | One change request travels from feedback back to Phase 3 and forward to a new release |

Total build effort: roughly 30 to 40 person-days when reusing the existing engine. The engine already has the records, links, gates, approvals, handoff and reports; each new phase is mostly new record types, templates, gate rules and a few screens.

## 6. Who does what in the real process

| Role | Phases | What they do in the tool |
|---|---|---|
| Product leader | 0 to 4, 12 | Answers the questions, owns the journey, decides |
| Sponsor | 0 to 4, 9, 10 | Approves scope, accepts the release |
| Business analyst | 3, 4, 7 | Rewrites generated drafts, completes stories |
| UX designer | 5 | Works in the design tool; links frames, states and approvals |
| Architect and security lead | 6, 9 | Records decisions, maps quality targets, signs security findings |
| Developers | 7, 8 | Read the specification, update status, link pull requests |
| QA lead | 9 | Test cases, results, defects, readiness |
| DevOps and operations | 10, 11 | Release checklist, runbooks, incidents |
| Legal | 1, 3, 9 | Obligation scan and sign-off |
| Dealers, customers | 1, 9 | Give quotes, accept the result through links |

## 7. Constraints and risks

- **Usage cost.** The earlier build rounds used a large share of your plan: weekly use was at 80% when I checked. Do the next phase extensions one release at a time, each with a clear stop, and avoid broad multi-agent rounds. The existing engine makes each phase cheaper than the first build.
- **People, not software, are the bottleneck.** The pilot estimate was 8 to 10 hours of the leader's time per product plus 6 to 10 hours of colleagues. Approvals wait on real people.
- **Documents can look finished and be empty.** Generated drafts are placeholders. Add a rule that unchanged drafts block sign-off at Thorough depth.
- **Tool sprawl.** The tool must link to the design, code, test and monitoring tools you already use, not copy them. Anything copied goes out of date.
- **No logins is the biggest gap before a wider rollout.** Fix it in Release A.

## 8. Defaults I am assuming (correct any of them)

1. The pilot is the BoSS rebuild.
2. The first host is one company machine on your network, with Microsoft sign-in added in Release A.
3. The design tool is Figma or Penpot, and the developer tool is the Sahayogi One repo.
4. Phases 5 and 8 stay mainly outside the tool (links, status and approvals only), as you decided earlier.
5. One release at a time, each tested on a real product before the next starts.
