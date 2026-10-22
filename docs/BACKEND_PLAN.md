# Backend plan (NestJS + TypeScript, built to hold hundreds to thousands of products)

Written 2026-10-15. Read with `ENGINEERING_REVIEW.md` (what is wrong) and `HARDENING_PROMPT.md` (the step list).

## Done so far
| Item | Where |
|---|---|
| `/api/v1` prefix, ValidationPipe (whitelist + forbid unknown), one error envelope, request id, helmet, throttler, CORS from env, graceful shutdown, env validated with zod | `main.ts`, `config/env.ts`, `common/*` |
| Swagger UI (`/api/docs`) and a committed contract `docs/api/openapi.v1.json` + `docs/api/CHANGELOG.md` | `openapi-export.ts` |
| Health: `/health/live`, `/health/ready` (DB ping) | `health.controller.ts` |
| **Home module** (typed DTOs, tested): KPIs, products table (filter, sort, paging), calendar, activity, one-call overview | `home/*` |
| **Ideas module**: submit, shortlist, accept (creates product), reject with reason, admin-only decisions | `ideas/*` |
| Ports between typed code and the engine (`PortfolioSource`, `ActivitySource`) so modules are testable without a database | `engine-port/*` |
| Safety batch (F1-F5): named person required on every change (old and new routes), rate limit on the old routes, seed refuses to wipe a non-empty database, failed saves reload from the database (503 `save_failed`), CI with Postgres + OpenAPI drift and breaking-change checks | `legacy-api.ts`, `common/middleware/rate-limit.ts`, `persistence.service.ts`, `.github/workflows/ci.yml`, `tests/safety.test.ts` |
| All JavaScript converted to TypeScript: the whole engine, the 144-route table, route modules, seeds, packs, tests. Compiles with zero errors; old and new engine outputs match on every seeded product | `legacy/**/*.ts` |
| Tests: 13 Home/ideas checks without a database (`npm run test:unit -w apps/api`), 12 Postgres parity checks (`npm test`) | `tests/*` |

## Why Home stays fast with many products
- The table filters and sorts on registry fields without touching any product, then builds rows for the visible page only.
- Readiness / phase / health need the engine, so those rows are computed once per product and memoised until that product is saved (`home/product-rows.ts`).
- The cache is warmed in slices of 25 products after boot (event loop released between slices); the first request that needs all rows waits for that single warm-up.
- Recent activity reads PostgreSQL (`AuditEntry`, indexed by `seq`) with a cursor, so it never loads every product.
- Measured here (cloned demo products, slow disk): 600 products, cold build ~10-12 s once, then KPIs ~10 ms, sorted table page ~10-25 ms, calendar ~5 ms.
- **Known limit:** the engine still keeps every product's records in memory (`PersistenceService.loadAll`). At about 1000 big products this is the memory and boot-time ceiling. Fix = step "Scale" below.

## Next, in this order
1. **Auth + roles** (hardening step 2). Needs your decision: Microsoft/Google sign-in or email link. Until then `X-Actor` identifies people and `ADMIN_ACTORS` (env) lists founders/admins; with the list empty, everyone is admin in development only.
2. **Scale** (hardening step 4). (a) A `ProductSummary` table written on every save, so Home never computes rows at read time; (b) load product records on demand with an LRU instead of all at boot; (c) `version` column + optimistic locking so two API instances can run.
3. **Typed modules replacing the catch-all bridge**, one per context, each with DTOs + tests + OpenAPI: `products` (portfolio list, create, update), `lifecycle` (stages, gates, documents), `records` (items, links, audit), `work`, `files`, `competitors`, `approvals`, `handoff`. Old route keeps working until its module ships.
4. **Tighten engine types** (the engine is converted but loosely typed: many `any`, `strictNullChecks` off in `tsconfig.json`). Give `Store`, `Portfolio`, items and links real types one module at a time, then switch `strictNullChecks` on.
5. **Phases 5 to 12** (Release B/C/D in `ROADMAP.md`): add each phase as DATA first (`schema.ts`, `links.ts`, `gates.json`, coverage rules, document templates), then its typed module and screen. Order: 5 -> 6 -> 7, then 8 -> 9, then 10 -> 11 -> 12.
6. **Observability + delivery**: pino JSON logs, metrics, Dockerfiles, CI, backups (hardening steps 6 and 7).

## Decisions I need from you
- Sign-in method (step 1).
- Who is "founder" for idea decisions: put their names in `ADMIN_ACTORS` (comma list) in `apps/api/.env`.
- `Phase_Process_Of_Sahayogi.pdf` was not in the folder I could see; the 13 phases were taken from `data/lifecycle.json` (which cites that PDF). If the PDF differs, send it and I will reconcile.
