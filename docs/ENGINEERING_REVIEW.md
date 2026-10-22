# Engineering review and hardening plan

Honest status: the product behaviour was ported first and fast. The code is **not yet production grade**. This file lists what is wrong, why it matters, the target design, and the order to fix it. Use `docs/HARDENING_PROMPT.md` to run it in Claude Code.

## 1. What is wrong today (measured)
| Area | Finding | Risk |
|---|---|---|
| Identity and auth | No login. The API trusts the `x-actor` header and falls back to the name "Kanishk" (`legacy-api.ts`). Anyone can act as anyone, including approving their own work | Critical: the "nobody approves their own work" rule is not enforceable |
| API contract | 144 routes behind one catch-all bridge (`legacy-api.ts` + `legacy/router.js`). No DTOs, no validation pipe, no OpenAPI, no versioning (`/api/v1`), inconsistent error shapes (`{error}` vs `{message,error,statusCode}`), verbs not always REST (`POST .../steps/:id` with an `action` field) | Clients and tests cannot trust shapes; hard to evolve |
| Domain code | 12.7k lines of untyped CommonJS JS in `legacy/engine` + `legacy/routes`. No types, no module boundaries, route logic and domain logic mixed | Hard to change safely; Claude Code and humans both guess |
| State and scale | In-memory store per product, loaded from Postgres and diff-written. One API instance only. No row-level locking or optimistic version check across instances | Lost updates if scaled out; restart loses nothing but cold start grows with data |
| Persistence | Items are stored as documents; relational integrity (links, audit, approvals) is not enforced by the database | Orphans and drift possible |
| Security | No helmet, rate limit, request size policy beyond uploads, no CSRF story, upload type check by extension, public approval tokens never rotated except by "resend", no secrets validation | Must close before any shared deploy |
| Observability | `Logger` only in persistence. No request id, structured logs, metrics, tracing; health endpoint is a stub | Cannot diagnose production |
| Quality gates | No ESLint, Prettier, commit hooks, CI. One parity test script. No unit or API tests for the new screens. No Playwright in the repo (it lives outside) | Regressions go unseen |
| Web code | ~4.5k lines in features. ~500 `any`, ~470 lines over 200 characters, inline styles, business wording and API paths repeated in components, no shared API types, fetch error handling by `alert/ask` per screen | Fragile and hard to review |
| Infra | Only a `docker-compose.yml` for Postgres. No Dockerfiles, no env schema, no migrations workflow in CI, no backup plan, no staging/prod config | Not deployable repeatably |
| Docs | Good feature map. No HLD/LLD, ADRs, runbook, API reference | Decisions are lost |

## 2. Target design (HLD)
- **Edge**: Next.js web (BFF-style rewrites) -> NestJS API. Same origin in production.
- **API**: versioned `/api/v1`, OpenAPI generated from DTOs, one error envelope `{code,message,details,requestId}`, pagination and filtering conventions, idempotency key on mutating POSTs that create things.
- **Auth**: OIDC or email magic link. Session cookie (httpOnly, SameSite). `actor` always from the session, never from a header or body. Roles per product (owner, editor, approver, viewer) enforced by a guard; "not your own work" enforced in the domain service.
- **Domain**: Nest modules per bounded context: `lifecycle` (stages, gates, waivers, conditions), `records` (items, links, audit), `work` (sessions, requests, forms), `documents`, `files` (attachments, pointers, assistant), `competitors`, `approvals`, `handoff`, `portfolio`. Each has controller (thin), service (rules), repository (Prisma), DTOs, tests. The legacy engine is wrapped behind these services first (strangler pattern), then ported to TypeScript module by module.
- **Data**: Postgres is the source of truth. Add version column + optimistic locking, foreign keys for links and audit, indexes, a nightly backup, `prisma migrate` in CI. Remove "one API instance" by dropping the in-memory cache or making it read-through with invalidation (Redis later).
- **Async**: assistant and ingest calls go through a job queue (BullMQ) with retry, cost cap and audit.
- **Observability**: pino JSON logs with request id, OpenTelemetry traces, Prometheus metrics, `/health/live` and `/health/ready` (DB check).
- **Delivery**: Dockerfiles (multi-stage), compose for local, GitHub Actions (lint, typecheck, unit, API tests, Playwright, build, migrate), env validated at boot (zod), `.env.example`, staging and prod config.

## 3. Order of work (each step ships green)
0. Safety net: ESLint + Prettier + husky + CI; move Playwright into `apps/web/e2e`; freeze behaviour with a contract test per route (record today's responses).
1. API contract: global `ValidationPipe`, error filter with one envelope, request id, helmet, rate limit, CORS from env, `/api/v1` prefix with the old path kept as alias, OpenAPI.
2. Identity: auth module, session, roles, remove the `Kanishk` default, derive `actor` from the session; keep a dev-only "act as" behind `NODE_ENV!=production`.
3. Modules: split the bridge into Nest modules per context; types for every DTO; controllers delegate to services that call the legacy engine; then port engine files to TS one at a time under the contract tests.
4. Data integrity: optimistic locking, FKs, indexes, migration for audit and links; multi-instance safe.
5. Web: generated API client and types from OpenAPI, one `useQuery` layer (TanStack Query) with error and retry policy, remove `any`, split files over ~250 lines, extract copy and constants, no inline API paths in components.
6. Observability and infra: logs, metrics, traces, health, Dockerfiles, deploy pipeline, backups, runbook.
7. Docs: HLD, LLD per module, ADRs (auth, strangler, locking, queue), API reference, runbook.

## 4. Definition of done for "robust"
No route without a DTO and a test; no `any` in new code; every mutating request is authenticated, authorized, audited and idempotent where needed; two API instances can run at once; a failed deploy can roll back; a new developer can run everything with `docker compose up` and `npm test`.
