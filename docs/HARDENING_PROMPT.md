# Claude Code prompt: harden Sahayogi (run after the layout work, or on its own branch)

Read `docs/ENGINEERING_REVIEW.md`, `docs/BUILD_PLAN.md`, `CLAUDE.md` first. Behaviour must not change except where a step says so. Work on a branch, one step per commit, run the checks after each step, and show me the result before the next step.

Rules for every step
- Characterization first: before changing a route or screen, record its current response or screenshot and keep it green.
- TypeScript strict for new code. No `any`, no files over ~250 lines, no lines over 120 characters, no business text or API paths inline in components.
- Every new endpoint: DTO with class-validator, OpenAPI decorators, one error envelope, an API test.
- Never edit `../prototype`. Never log secrets or personal data.
- If a step needs a decision (auth provider, queue, hosting), stop and ask me with options and a recommendation.

Step 0 Safety net: ESLint (typescript-eslint, import order), Prettier, husky + lint-staged, `npm run check` = lint + typecheck + test, GitHub Actions running it with a Postgres service. Move the Playwright route and click tests into `apps/web/e2e` and run them in CI.
Step 1 API contract: `/api/v1` prefix (old `/api` stays as a deprecated alias), global ValidationPipe (whitelist, forbidNonWhitelisted), exception filter returning `{code,message,details,requestId}`, request-id middleware, helmet, throttler, CORS from env, graceful shutdown, Swagger at `/api/docs`. Add contract tests that replay the recorded responses for all 144 routes.
Step 2 Identity: auth module (propose OIDC vs magic link first), session cookie, product roles and a guard, remove the `Kanishk` default and the `actor` body fallback, enforce "not your own work" in the service not the UI. Keep a dev-only act-as switch disabled in production.
Step 3 Modules: replace the catch-all bridge with Nest modules per context (lifecycle, records, work, documents, files, competitors, approvals, handoff, portfolio). Thin controllers, services call the legacy engine through a typed facade, repositories use Prisma. Then port `legacy/engine/*.js` to TypeScript file by file, smallest first, contract tests staying green.
Step 4 Data: version column + optimistic locking, foreign keys and indexes for links/audit/approvals, migrations, remove the single-instance limit (cache invalidation or drop the in-memory store). Prove it by running two API instances in the e2e job.
Step 5 Web: generate a typed client from OpenAPI, adopt TanStack Query for every read and mutation with one error/retry/toast policy, remove `any`, split large files, move copy and constants into `features/<id>/copy.ts` and `constants.ts`, replace `useAction` side effects with mutations.
Step 6 Observability and infra: pino JSON logs with request id, OpenTelemetry traces, Prometheus metrics, `/health/live` and `/health/ready`, multi-stage Dockerfiles for api and web, compose for local, env validated with zod, `.env.example`, migrate-on-deploy job, backup script and restore test, staging and prod config.
Step 7 Docs: `docs/HLD.md`, one `docs/lld/<module>.md` per module (classes, tables, sequences), `docs/adr/*.md` for each decision, API reference from OpenAPI, `docs/RUNBOOK.md` (deploy, rollback, backup, incident).

Report after each step: what changed, tests added, what is still open. Finish with a table: finding in the review -> fixed / partly / open.
