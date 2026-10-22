# Sahayogi Platform: guide for Claude Code
Read `docs/BUILD_PLAN.md` first. Source of truth for behaviour: `../prototype` (Phases 0–4), `../reports/Sahayogi Developer specification v2.md`, lifecycle PDF.

## Layout
- `apps/api` NestJS. `src/legacy/engine` = lifecycle engine (TypeScript, in-memory Store per product). `src/legacy/router.ts` = route table; route modules in `src/legacy/routes/*.ts` take a typed `RouterApi` (`routes/api.ts`).
  `src/persistence.service.ts` = Postgres load/diff-write. `src/legacy-api.ts` = Express bridge. `src/db/tables.ts` is the ONLY place tables are defined (one `item_<type>` table per item type, generated from `legacy/engine/schema.ts`); `npm run db:generate` writes `prisma/schema.prisma` and the migration SQL from it - never edit those by hand. No JSON columns: free-form data goes in key/value tables. `src/db/mapper.ts` (engine data <-> rows) and `src/db/repository.ts` (SQL) do the work.
- `apps/web` Next.js (App Router).
## Commands
`npm install` · `npm run db:up` · `cp apps/api/.env.example apps/api/.env` · `npm run db:push -w apps/api` · `npm run seed` · `npm run dev:api` · `npm run dev:web`
## Rules
- Add item types / links / gate criteria as DATA (`schema.ts`, `links.ts`, `data/gates.json`, `data/coverage_rules.json`), never hard-code per phase.
- Keep user-facing wording plain (word budgets). Never edit `../prototype`.
- Every mutating change goes through `Store.create/update/link` so audit, suspect propagation and validation run.
- Tests before "done"; seed deliberate gaps in examples.
- New API work = a Nest module under `apps/api/src/<context>/` with DTOs (class-validator), OpenAPI via the swagger plugin, `/api/v1` route, a test in `src/tests`. Talk to the engine only through `engine-port/`. Update `docs/api/CHANGELOG.md` and run `npm run openapi:export -w apps/api`.
- All source is TypeScript. Do not add `.js` files (the only non-TS file is `apps/web/postcss.config.mjs`, which Next requires in that form). The engine still uses loose types (`any`, `strictNullChecks` off); tighten module by module, see `docs/BACKEND_PLAN.md`.
- Web addresses use the product slug (/products/<slug>/...), never the id; build links from `slug`. The API accepts either.
- Changes by a person need `X-Actor`; never default an actor name. Endpoints that decide things use `@Roles('admin')`.
- Language: always reply in English, even when the request is written in Hindi, English or a mix of both. Understand all of them; answer only in English.
- Safety rules (do not undo): every change request names a person in `X-Actor` (no default name, never from the body); the seed refuses to wipe a database that already has products unless run with `--force`; a failed database write reloads the product from the database and answers 503 `save_failed`.

## API reference
After adding, changing or removing any API route (apps/api) or any API call (apps/web), run `npm run openapi:export -w apps/api` and commit `docs/api`. `npm run test:contract -w apps/api` fails otherwise.

## Login and roles (decision, Oct 2026)
Setu is the separate system that creates users for the Sahayogi ecosystem (client workspaces and their subscribed products). Sahayogi Platform is the internal product-management tool. How people sign in here, how roles work and how this connects to Setu will be decided after a discussion with the CEO. Until then: do NOT build our own email/password or Google login (F23 is parked). The temporary X-Actor header and ADMIN_ACTORS stay as they are.
Scope rule: leave the whole login / RBAC / admin area alone until the CEO decision - no new work and no changes to it (X-Actor handling, `common/auth/*`, `RolesGuard` and `@Roles`, the `admin` route flag, `ADMIN_ACTORS`, F1/F23 items). Other work must not depend on it or change how it behaves.
