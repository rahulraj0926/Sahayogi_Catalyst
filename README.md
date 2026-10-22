# Sahayogi Platform

Product lifecycle platform for the 13-phase process (Phase 0 Intake ... Phase 12 Feedback). NestJS API + PostgreSQL (real relational tables, no JSON columns) + Next.js.
Built from the `prototype/` (Phases 0-4, all features kept) plus new Phases 5-12. Read `docs/BUILD_PLAN.md` first, then `CLAUDE.md`.

## Run it
```bash
npm install
docker compose up -d db                       # PostgreSQL 16 (or point DATABASE_URL at your own)
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w apps/api
npm run seed                                  # 6 demo products + 4 ideas, each with records in all phases 0-12
npm run dev:api                               # http://localhost:4000   (/health)
npm run dev:web                               # http://localhost:3000
npm test                                      # 12 checks: Postgres parity with the prototype, HTTP, persistence
npm run check -w apps/api                     # typecheck + 13 Home/ideas checks (no database needed)
```
Every route is under `/api/v1` (the older `/api/...` addresses still work until the sunset date). API reference: while the API runs, open http://localhost:4000/api/docs (Swagger UI, can send requests). Without a server, open `docs/api/swagger.html` in a browser (generated from `docs/api/openapi.v1.json` by `npm run openapi:export -w apps/api`; needs internet for the viewer files). The web app has an **API** page in the left rail that shows the same Swagger UI.

**Keeping the API reference current:** after you add, change or remove any API route (backend) or any API call (web app), run `npm run openapi:export -w apps/api` and commit `docs/api`. Describing a route's input and answer: add it to `apps/api/src/legacy/openapi-docs/` (see `items.ts`); `npm run test:docs` checks the descriptions against real answers. `npm run test:contract -w apps/api` (part of `npm run check`, so CI runs it) fails when a server route is missing from the reference, a web call points at a route that does not exist, or `swagger.html` is out of date.

Node 22+. The web app proxies `/api/*` to `API_URL` (default http://localhost:4000).

## Backup and restore
```bash
npm run db:backup -w apps/api                       # -> apps/api/backups/sahayogi-<time>.ndjson.gz (folder: BACKUP_DIR)
npm run db:backup -w apps/api -- --keep 14          # same, then delete all but the newest 14 backups
npm run db:restore -w apps/api -- backups/<file>.ndjson.gz --force   # replaces EVERYTHING in the database; restart the API after
npm run db:drill -w apps/api                       # restores the newest backup into a throwaway database and checks it (fails if the backup is older than 36 h)
npm run db:audit-archive -w apps/api               # shows audit entries older than AUDIT_RETENTION_YEARS (default 7); add -- --apply to archive them to backups/audit-archive and delete them
```
Plain Node, no `pg_dump` needed. A backup is a consistent snapshot even while the API runs, and a restore is one transaction (a failed restore changes nothing).
Uploaded files live in `UPLOAD_DIR`, not in the database: copy that folder too. Keep backups on another disk or machine.

Old JSON tables from before the schema change: once your data is in the real tables and you have a backup, `npm run db:drop-legacy -w apps/api` shows what it would drop and `-- --yes` drops them.

## Logs, metrics and health

- **Logs.** Every request writes one line with its request id, route (ids removed), status, time taken and who acted. In production (or `LOG_FORMAT=json`) each line is a JSON object, so you can search it with any tool: all lines for one failed call share the `requestId` that the user sees in the error. Server faults also write the stack trace under the same id. Screens that crash in the browser report themselves too (`context: "web"`).
- **Metrics.** `GET /metrics` (Prometheus text): request counts and timings per route, errors by code, browser errors, products loaded, database up/down, memory, and the age of the newest backup. Set `METRICS_TOKEN` (16+ characters) and send it as `Authorization: Bearer <token>`. In production the endpoint stays off until the token is set.
- **Health.** `GET /health/live` (process is up) and `GET /health/ready` (database answers). `ready` also shows the newest backup and whether it is older than `BACKUP_MAX_AGE_HOURS` (default 36). A stale backup is a warning to act on; it never stops the API.

## What is here
| Area | State |
|---|---|
| Engine (45+26 record types, 87 link types, 97 gate criteria, 36 coverage rules, 30 documents, approvals, competitors, hand-over) | Prototype engine kept in `apps/api/src/legacy`, extended to Phase 0-12 |
| API | New typed API under `/api/v1` (Home, Ideas, Me; Swagger at `/api/docs`, contract in `docs/api/`). The 144 prototype routes still work under `/api` (deprecated). Writes go to PostgreSQL |
| Web | Portfolio, Overview (13 phases), Phase workspace (records, add form, sign-off checks), Gates, Traceability, Item detail, Documents |
| Not yet | Other prototype screens (Work, Files, Competitors, Review inbox, Flows, Handoff, Reports), sign-off buttons, login/roles, typed Nest controllers. See BUILD_PLAN.md |

The Phase 0-4 gate results are identical to the prototype on all 6 seeded products (`apps/api/src/tests/parity_with_prototype.ts <path to prototype>`).
Limit: the engine keeps each product in memory and writes the changes to Postgres, so run one API instance until BUILD_PLAN milestone M6.
# sahayogi_catalyst
