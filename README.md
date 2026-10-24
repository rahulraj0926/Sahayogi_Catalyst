# Sahayogi Platform

Product lifecycle platform for the 13-phase process (Phase 0 Intake ... Phase 12 Feedback). NestJS API + PostgreSQL (real relational tables, no JSON columns) + Next.js.
Built from the `prototype/` (Phases 0-4, all features kept) plus new Phases 5-12. Read `docs/BUILD_PLAN.md` first, then `CLAUDE.md`.

## Run it (first time on a new computer)

You need **Node 24.20.0** (the exact version is in `.nvmrc`; how to install it and every other version we use is in [docs/VERSIONS.md](docs/VERSIONS.md)), **Docker** (for the database; or your own PostgreSQL 16) and **git**.

```bash
git clone https://github.com/rahulraj0926/Sahayogi_Catalyst.git
cd Sahayogi_Catalyst
npm ci                                        # installs exactly the versions in package-lock.json
docker compose up -d db                       # PostgreSQL 16 on localhost:5432 (user, password and database: sahayogi)
cp apps/api/.env.example apps/api/.env        # Windows PowerShell: Copy-Item apps/api/.env.example apps/api/.env
npm run db:migrate -w apps/api                # creates the tables
npm run seed                                  # 6 demo products + 4 ideas, each with records in all phases 0-12
npm run dev:api                               # http://localhost:4000   (/health)   <- keep this window open
npm run dev:web                               # http://localhost:3000               <- in a second window
```

Open http://localhost:3000. If the page loads with demo products, everything works.

**Database without Docker (pgAdmin / your own PostgreSQL).** Skip the `docker compose` line and do this instead:
1. Install PostgreSQL 16 and, if you want a window onto the data, pgAdmin.
2. In pgAdmin (or `psql`), create an empty database, for example `sahayogi`.
3. In your own `apps/api/.env`, set `DATABASE_URL="postgresql://<user>:<password>@localhost:5432/sahayogi?schema=public"` with your own user and password. Never put your real password in `.env.example` or commit `.env`.
4. Run `npm run db:migrate -w apps/api`, then `npm run seed`, then start the API and web app as above.

To look at the data in pgAdmin with the Docker database, add a server with host `localhost`, port `5432`, database, user and password all `sahayogi`.

Each developer has their own database; data is not shared through GitHub. What is shared is the table structure, through the migration files. After every `git pull`, run `npm run db:migrate -w apps/api` to bring your own database up to date.


- **The API settings** live in `apps/api/.env` (never committed). `apps/api/.env.example` lists every setting with a comment; only `DATABASE_URL` is required and its default already matches the Docker database.
- **The web app** needs no settings if the API runs on port 4000. Otherwise copy `apps/web/.env.example` to `apps/web/.env.local` and change `API_URL`.
- **Versions:** `versions.json` is the one list of Node, npm, PostgreSQL and package versions. Change a version only with `npm run versions:set -- <package> <version>`; `npm run versions:check` fails if anything disagrees. See [docs/VERSIONS.md](docs/VERSIONS.md).
- **Checks before you open a pull request:** `npm run check` (types and contract) and `npm test` (needs the database). The same checks run on GitHub for every pull request.

**Which address goes where.** On your own computer you change nothing: the defaults already point at each other. Change one only if you move a part to another port or computer.

| Setting | File | Means | Default (local) |
|---|---|---|---|
| `DATABASE_URL` | `apps/api/.env` | Where the database is: `postgresql://user:password@host:port/database` | `postgresql://sahayogi:sahayogi@localhost:5432/sahayogi?schema=public` (the Docker database) |
| `WEB_ORIGIN` | `apps/api/.env` | The address of the **web app**, so the API accepts its calls | `http://localhost:3000` |
| `API_URL` | `apps/web/.env.local` | The address of the **API**, so the web app can reach it | `http://localhost:4000` |
| `PORT` | `apps/api/.env` | The port the API listens on. If you change it, change `API_URL` to match | `4000` |

Rule of thumb: the web app's file names the API, and the API's file names the web app. When both run on one computer, both stay on `localhost`.

| If you see | Do this |
|---|---|
| `DATABASE_URL is required` | You skipped the `cp ... .env` step, or you started the API from a different folder. Use `npm run dev:api` from the project root. |
| `ECONNREFUSED ... 5432` or "database does not exist" | The database is not running: `docker compose up -d db`, then `npm run db:migrate -w apps/api`. |
| `EADDRINUSE` (port already in use) | Something else uses port 4000 or 3000. Stop it, or change `PORT` in `apps/api/.env` and `API_URL` in `apps/web/.env.local`. |
| The web page loads but shows no data or errors | The API is not running, or `API_URL` points to the wrong address. Open http://localhost:4000/health. |
| A new database field is missing after pulling | Run `npm run db:migrate -w apps/api` again. |

Other commands:
```bash
npm test                                      # 12 checks: Postgres parity with the prototype, HTTP, persistence
npm run check -w apps/api                     # typecheck + 13 Home/ideas checks (no database needed)
```
Every route is under `/api/v1` (the older `/api/...` addresses still work until the sunset date). API reference: while the API runs, open http://localhost:4000/api/docs (Swagger UI, can send requests). Without a server, open `docs/api/swagger.html` in a browser (generated from `docs/api/openapi.v1.json` by `npm run openapi:export -w apps/api`; needs internet for the viewer files). The web app has an **API** page in the left rail that shows the same Swagger UI.

**Keeping the API reference current:** after you add, change or remove any API route (backend) or any API call (web app), run `npm run openapi:export -w apps/api` and commit `docs/api`. Describing a route's input and answer: add it to `apps/api/src/legacy/openapi-docs/` (see `items.ts`); `npm run test:docs` checks the descriptions against real answers. `npm run test:contract -w apps/api` (part of `npm run check`, so CI runs it) fails when a server route is missing from the reference, a web call points at a route that does not exist, or `swagger.html` is out of date.

Node 24.20.0 (see `.nvmrc`). The web app proxies `/api/*` to `API_URL` (default http://localhost:4000).

## Working as a team

- **One branch per task**, started from an up-to-date `main`: `git checkout main && git pull && git checkout -b feature/short-name`. Open a pull request into `main`; the other person reviews and merges it. Nobody pushes straight to `main`.
- **One owner per page or feature**, covering both its web part and its API part. When one person does the screen and the other the API for the same page, first agree the route and what it returns (write it in `apps/api/src/legacy/openapi-docs/`). The API person merges a small pull request with the route first; the screen person then pulls `main` and builds on it.
- **Database changes:** a new field goes in `apps/api/src/legacy/engine/schema.ts`, then `npm run db:generate -w apps/api`, plus a numbered folder in `apps/api/prisma/migrations` registered in `apps/api/src/db/apply.ts`. Tell the other person before you pick the next number, and merge it first.
- **Generated files** (`apps/api/prisma/schema.prisma`, `docs/api/*`) are never merged by hand. If they conflict, take either version, run `npm run db:generate -w apps/api` or `npm run openapi:export -w apps/api`, and commit the result.
- **Never commit** `.env` files, `uploads/`, `backups/` or `.claude/`. They are in `.gitignore`.

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
| Not yet | Other prototype screens (Work, Files, Review inbox, Flows, Handoff, Reports), sign-off buttons, login/roles, typed Nest controllers. See BUILD_PLAN.md |

The Phase 0-4 gate results are identical to the prototype on all 6 seeded products (`apps/api/src/tests/parity_with_prototype.ts <path to prototype>`).
Limit: the engine keeps each product in memory and writes the changes to Postgres, so run one API instance until BUILD_PLAN milestone M6.
