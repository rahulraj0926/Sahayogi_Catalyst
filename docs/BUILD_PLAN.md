# Sahayogi Platform: build plan (13-phase lifecycle, NestJS + Next.js, built with Claude Code)

## 1. Goal
One product-management platform that carries a product through the whole lifecycle in `Phase_Process_Of_Sahayogi.pdf`
(Phase 0 Intake → 12 Feedback & Iteration). The `prototype/` folder already implements Phases 0–4 as a working Node app
(50 item types, 65 link types, 50 gate criteria, 89 data requests, 30 generated documents, approvals, competitor workspace,
hand-over package). This project re-platforms that on **NestJS + PostgreSQL/Prisma + Next.js**, keeps every prototype feature,
and adds Phases 5–12 (see `ROADMAP.md`).

## 2. Architecture decisions
| Topic | Decision | Why |
|---|---|---|
| Engine | Prototype engine kept as the domain core (`apps/api/src/legacy/engine`), wrapped by Nest | 32k lines of tested behaviour (84 tests); faster and safer than rewriting |
| Data model | Generic `Item` + `Link` tables (JSONB for type fields), `AuditEntry`, `Product`, `Idea` | Item types and links are data-driven; new phases = new type entries, no migrations |
| Persistence | In-memory engine per product, diff-written to Postgres after each mutating request | Keeps engine behaviour identical. Limit: one API instance owns state (see risks) |
| API | Existing 144 routes mounted under `/api` first; then migrate hot paths to typed Nest controllers/DTOs module by module | Feature parity on day one, clean-up later |
| Web | Next.js App Router, typed API client, layout copied from prototype (sidebar, stage cards, Do-next, Documents, Activity) | Layout is already fixed |
| Lifecycle config | `lifecycle.json`: 13 phases (name, purpose, outputs, owner roles, gate id, quality-gate list) | Single source for dashboard, gates, docs |
| Auth | Phase 1: actor header (as prototype). Release A: Microsoft/Google SSO + roles, real approvals | Roadmap gap #1 |

## 3. Milestones (each ends with a demo and tests green)
| # | Milestone | Scope | Claude Code deliverable |
|---|---|---|---|
| M0 | Foundation (**in progress**) | Monorepo, Prisma schema, engine wrapped, Postgres persistence, seed, health | API boots; `npm run seed` loads 6 products; parity test: gate results from Postgres == prototype |
| M1 | Phases 0–4 UI | Next.js shell, Portfolio, Overview (13-stage strip), Work on it, Documents, Files, Competitors, Review inbox, Blocking, Gates, Traceability, Flows, Handoff, Reports, Admin | Pages ported one at a time against the same API |
| M2 | Lifecycle generalisation | Engine supports gates 0–12 (today hard-coded 0–4 in `gates.js`, `stages.js`, `dashboard.js`); `lifecycle.json` drives names | Tests for gate 5–12 evaluation |
| M3 | Release B: Phases 5–7 | Types: Screen, ScreenState, DesignReview, ArchDecision, QualityTargetMap, ApiContract, FeatureSpec, DoD. Rules: every story has screens+states; every NFR has an architecture answer; every feature spec complete | Gate 5/6/7 criteria in `gates.json`, templates, screens |
| M4 | Release C: Phases 8–9 | Dev status link (stories, PRs/commits), TestPlan, TestCase, TestRun, Defect, SecurityFinding, UAT sign-off; the **10 quality gates** of Phase 9 computed live; results import (CSV) | Gate 8/9 criteria, import endpoint, defect register UI |
| M5 | Release D: Phases 10–12 | Release record + checklist + notes from approved stories, rollback plan; Runbook, Alert, Incident, HealthReview; Feedback, ChangeRequest that reopens earlier phase and marks downstream suspect | Gate 10/11/12, end-to-end journey test |
| M6 | Production readiness | Auth/SSO, roles, hosting (Docker), backups, move engine reads to Postgres queries if multi-instance needed, observability | Deploy guide, CI |

## 4. How to drive this with Claude Code
1. **Open `sahayogi-platform/` in Claude Code.** It reads `CLAUDE.md` (conventions, commands, rules below) on every session.
2. **One milestone per session.** Start with plan mode: "Read docs/BUILD_PLAN.md and plan M1 page `Overview`". Approve, then implement.
3. **Port screens by parity, not by invention:** for each page give Claude Code the prototype file (`prototype/public/js/pages/overview.js`), the API route it calls, and the screenshot in `prototype/docs/layman2/screens/`. Prompt: "Rebuild this page in Next.js using the same API and layout. Do not change wording."
4. **Add a phase = data first.** Prompt template: "Add Phase 6 per ROADMAP.md §4: item types in `schema.js`, links in `links.js`, gate criteria in `data/gates.json`, coverage rules, data requests, document templates, tests. Then the UI." Always require tests and a seeded example that fails on purpose (the prototype seeds deliberate gaps).
5. **Use subagents for independent work** (e.g. one per phase's UI) but have one agent own `schema.js`/`gates.json` to avoid merge conflicts.
6. **Verify every step:** `npm test`, typecheck, boot API+web, click through with the browser tool, compare with the screenshot.
7. **Commit per milestone slice**; keep `docs/DECISIONS.md` updated.

## 5. Definition of done (per feature)
Requirement/ID noted · typed API · UI with loading/empty/error/permission states (Phase 5 rule) · acceptance criteria · tests (happy, negative, edge) · audit entry written · gate/coverage rule updated if it affects sign-off · docs updated.

## 6. Risks
- Engine hard-codes gates 0–4 (M2 fixes). Engine state is in memory: one API instance only until M6.
- Prototype text is written for non-experts ("layman" word budgets): keep wording when porting; copy lives in engine `plain.js`/`words.js`.
- People are the bottleneck, not code: approvals and real data need pilot users (roadmap §7).
- Seeded data is invented; replace with Vardhman/Sahayogi real starter pack (roles, headers, approval chain).

## 7. Status (update as you go)
- [x] Prototype studied; engine, routes (144), gate/coverage/request data copied into `apps/api/src/legacy`
- [x] Prisma schema, Postgres persistence service, Express bridge for all routes, seed script
- [ ] `npm install`, boot against Postgres, parity test (M0)
- [ ] Next.js web (M1) · lifecycle 0–12 (M2) · Phases 5–12 (M3–M5)
