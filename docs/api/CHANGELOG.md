# API changelog

The API is versioned in the URL: everything new lives under `/api/v1`. The full contract is `docs/api/openapi.v1.json`
(regenerate with `npm run openapi:export -w apps/api`, commit the file; its git history is the history of the API).
Live docs: `GET /api/docs` (Swagger UI) and `GET /api/docs-json` when the API runs (always on outside production, `SWAGGER=1` to enable in production).

Rules
- Adding a field or endpoint = minor change, list it here. Removing or renaming a field, or changing its meaning = new version (`/api/v2/...`); keep `v1` working until the web app has moved.
- Every endpoint has a DTO, validation and an OpenAPI description. Every error has the same shape: `{ code, message, details?, requestId, statusCode }`.
- The old `/api/...` routes (the prototype's 144) still work. They answer with `Deprecation: true` and move into `/api/v1` module by module.

## Unreleased
- Ideas: an innovation step before the CEO. `POST /ideas` takes an optional `draft: true`; such an idea starts with status `innovation` and is hidden from the CEO inbox, the Home counts and the calendar until it is sent (`GET /ideas?status=innovation` lists drafts). The pitcher fills in the case: `PATCH /ideas/{id}/innovation` (problem, who_for, optional demo_url), `POST /ideas/{id}/competitors` (name, website, optional note and demo_url) and `DELETE /ideas/{id}/competitors/{competitorId}`, then `POST /ideas/{id}/send`. Only the person who pitched it (the X-Actor name) may change a draft (403 `not_your_idea`), and only while it is in innovation (409 `idea_not_in_innovation`). New `GET /ideas/{id}`. Every idea answer gains `problem`, `who_for`, `demo_url`, `competitors` (always a list) and `door` (what a draft still lacks: problem, who_for, 3 competitors; null once sent), and the status can now be `innovation`.
  Competitors are real or not stored: the server opens the website before keeping it (public http/https addresses on the default ports only, no credentials, every redirect and every connection re-checked against private, loopback, link-local and reserved addresses, 6 seconds, 64 KB). A normal answer is `check.status: verified`; a 4xx answer (a real site that blocks automated visits) is `responded`; no answer or a 5xx is 422 `competitor_unreachable`; a private or non-public address is 422 `competitor_unsafe_address`; text that is not an address is 422 `competitor_bad_address`; a site already listed (same host, www ignored, or the same place after redirects) is 409 `competitor_duplicate`; more than 12 is 422 `too_many_competitors`. A demo link is only checked to be a plain http/https address, never opened. `POST /ideas/{id}/send` answers 422 `innovation_not_ready` with `details.door` while something is missing.
  A website that answers 404 or 410 is refused (`competitor_unreachable`: the page is not there, most likely a mistyped address); other 4xx answers, such as 403 from a site that blocks automatic checks, are kept as `responded`.
  The CEO actions are unchanged but refuse a draft (409 `idea_not_sent`). When an idea is accepted, its problem becomes the intake brief's problem statement, its rivals (name, website, date checked, verified or site responded, demo link) are added to the brief's idea text and `reference_products`, and who_for is kept on the product's idea card.
  Database: new table `idea_competitors` and new columns on `ideas` (`problem`, `who_for`, `demo_url`, plus `decided_by`, `decided_at` and `reject_reason`, which accept and reject already wrote and which had no column, so saving a decision failed). Migration `0015_idea_innovation`; the API creates the table and adds the columns on start-up, and `npm run db:apply` does the same by hand. Counts of ideas waiting for the CEO (portfolio funnel, `byStage.idea`, the Home card) now mean new and shortlisted only.
- Hardening: an id such as `constructor`, `toString` or `__proto__` used to make `GET /items/:id`, `GET /documents/:key`, `PATCH /items/:id`, `POST /waivers/:id/revoke` and `POST /conditions/:id/close` fail with 500; they now answer 404 like any unknown id. Creating an item with an explicit `fields.id` now needs 1 to 64 letters, digits, `.`, `_` or `-` (422 otherwise).
- Audit (F22): a refused admin action (wrong role, or no name) and a change that could not be saved now leave records `access.denied` and `save.failed` in the system audit trail. The same person doing the same thing is recorded once a minute, and at most 30 records are written a minute. No API shape changed.
- The old route table and its bridge are gone (all routes are typed controllers). The old `/api/...` addresses keep working through a redirect-style fallback with the same `Deprecation` / `Sunset` headers. `GET /api/auth/me` and `/api/v1/auth/me` are unchanged.
- Feedback notes ("Something wrong here?") are now stored in PostgreSQL (new table `feedback_notes`), so they are backed up and restored with everything else. Run `npm run db:apply` once to create the table; on the next start the API copies the notes from an old `uploads/feedback.json` across and renames that file to `feedback.json.imported`. Answers are unchanged, except `saved_in` is now `"database"`.
- Observability (F20): new `POST /api/v1/client-errors` (the web app reports a crashed screen; answers 204, nothing stored, written to the server log). New unversioned `GET /metrics` (Prometheus text; needs `METRICS_TOKEN` as a Bearer token, and is off in production until one is set). `GET /health/ready` now also shows `backup` (newest backup file, its age, `stale`); a stale backup never stops the API from answering. Logs are one JSON object per line when `LOG_FORMAT=json` (the default in production).
- Typed rebuild (F13): all 147 engine routes are now typed controllers with DTOs under `/api/v1`; behaviour and answers are unchanged. Differences to know: request bodies are checked more strictly (a key the route does not know now gives 400 `validation_failed`); `POST /portfolio/products` no longer accepts a caller-chosen `id` (the tool always assigns PRD-nnn); approver-link answers are now saved to the database like every other change; `actor` in a chat body is ignored (the X-Actor header is used).
- Audit (F22): creating a product, adding / shortlisting / rejecting / promoting / deleting an idea, and `GET /api/v1/export` now leave audit records (the export answer is unchanged). Events that belong to no single product go to the new table `system_audit_log`; run `npm run db:apply` once to create it. No API shape changed.

### Editing
- `PATCH /api/items/:id` accepts `expected_rev` (body) or `If-Match` (header). If the item changed since, it answers 409 `stale_edit` with the current item instead of overwriting. Callers that send nothing behave as before.

### Errors and retirement of the older routes (F14)
- Errors from the older `/api` routes now use the `/api/v1` envelope: `{ code, message, details?, requestId, statusCode }`. The old fields (`error`, `errors`, `validation`, `eligible`, and extras like `current_sig`) are still sent next to it, so nothing breaks; read `code` + `message` in new code.
- Every answer from an older route carries `Deprecation: true`, `Sunset: <date>` (default 30 Jun 2027, set `LEGACY_SUNSET`) and a `Link` header to `/api/v1`. After the Sunset date the older routes may be removed.

### Add-only v1 (F15)
- New `npm run openapi:breaking -w apps/api -- <base.json>`: CI runs it on every pull request against the target branch's `docs/api/openapi.v1.json`. It fails when `/api/v1` loses an endpoint or an answer field, retypes a field, makes a request field or parameter required, or stops accepting a value. Make such changes under `/api/v2` instead.

### Pagination, caching and safe retries (F16, F17)
- `GET /api/v1/ideas` takes `limit` (1-100, default 50) and `cursor`; the answer gains `next` (null on the last page). The `status` filter is unchanged. Cursors are based on the last row sent, so new ideas never shift or repeat a page.
- Every `GET /api/v1` answer has an `ETag` and `Cache-Control: private, no-cache`; send the tag back as `If-None-Match` to get `304` without a body.
- Send `Idempotency-Key` (8-100 characters of letters, digits, `_ . : -`) on any change under `/api/v1`: a repeat of the same request within 24 hours gets the first answer back with `Idempotent-Replayed: true` and nothing is done twice; the same key with a different request is `422 idempotency_key_reuse`; while the first is still running it is `409 request_in_progress`. Kept in memory (one API instance).

### Every route is under /api/v1 (F13)
- All 147 routes of the lifecycle engine now answer at `/api/v1/...` (for example `/api/v1/items`, `/api/v1/gates/3`, `/api/v1/portfolio`) with the same rules and the same error envelope. The API reference lists them at these addresses; the web app calls them there.
- The old addresses (`/api/items` ...) still work, unchanged, and carry `Deprecation` and `Sunset` headers (30 Jun 2027). New callers must use `/api/v1`.
- The handlers are still the engine's own; rebuilding them as typed Nest modules with strict DTOs is the next, internal step and will not change addresses. Because they are in `/api/v1`, the add-only rule (CI breaking-change check) now covers them too.

### Descriptions for every older route (F13, step 1)
- All 147 older routes now have a written summary, parameters, request body and answer in the API reference. Answers are described by their main fields (extra fields may appear); some engine-shaped answers are described as an open object. Moving each route into a typed `/api/v1` endpoint is still to do.
- A new route without a description fails `npm run check` (contract test).
- Descriptions live in `apps/api/src/legacy/openapi-docs/` (one file per domain). `npm run test:docs -w apps/api` calls the real handlers on the demo data and checks the answers against what is written, so a wrong description fails; `test:contract` fails if a description names a route that no longer exists.

### Documentation
- The API reference now lists every route: 160 operations (147 older routes generated from the route table, 13 typed `/api/v1`). Older routes show method, path, parameters, headers and error codes; their bodies are described only as JSON objects until they move into typed modules (F13).
- The web app has an **API** page (left rail) showing the Swagger UI.
- New `npm run test:contract -w apps/api` (part of `check`/CI): fails if a server route or a web call is not in the reference, or `swagger.html` is stale.

### Database
- All JSON columns replaced by a real relational schema (migration `0002_real_schema`, 100+ tables). Move old data with `npm run db:import-legacy`.
- Documents, approvals, the assistant review inbox and flagged answers are now saved; the old storage silently lost them on restart.
- New `npm run db:backup` / `db:restore` (plain Node, consistent snapshot, one-transaction restore, `--keep N` pruning).
- New `npm run db:drop-legacy` removes the old JSON tables (dry run by default; needs `--yes`; refuses if the real tables are empty or the old ones still hold rows). `@prisma/client` and `@prisma/adapter-pg` were removed; the Prisma CLI stays for `db:migrate`.
- Gate decisions: `GET /api/gates/:n` now returns `sig`; send it back as `expected_sig` on `POST /api/gates/:n/decide` (or attest) and a decision made against a gate whose checks have changed is refused with `409 stale_gate` and `current_sig`.
- Older routes that decide, delete or promote ideas, or set the assistant cost cap, now need the admin role (`403 role_required`).
- New `docs/api/swagger.html`: the OpenAPI file as a Swagger UI page you can open without running the server (`npm run openapi:html -w apps/api`; also made by `openapi:export`; CI checks it is up to date).
- Not stored: the cached `report` of derived requests (rebuilt on run) and conflict detail text on inbox proposals.

- **Older `/api` routes now need a named person for every change.** Send `X-Actor`; without it you get `401` with `code: "actor_required"`. The body field `actor` and the old default name are gone. Reads still need no name.
- Older `/api` routes are rate-limited per IP (`LEGACY_READ_LIMIT`, `LEGACY_WRITE_LIMIT`, default 900 / 180 per minute): `429` with `Retry-After` and `RateLimit-*` headers.
- A change that cannot be saved to the database now answers `503` with `code: "save_failed"` and the product is reloaded from the database, so nothing unsaved is kept in memory.
- Server errors on the older routes now return a plain message instead of internal details.
- `Deprecation: true` is no longer sent on `/api/v1` responses (it was by mistake).

## 1.0.0 - 2026-10-15 (Home)
New
- `GET /api/v1/home` first paint in one call (KPIs, first page of products, open ideas, recent activity, this month's calendar).
- `GET /api/v1/home/kpis` five main + four supporting KPI cards.
- `GET /api/v1/home/products` products table: `page, limit (<=100), q, stage, kind, owner, health, sort, order`.
- `GET /api/v1/home/calendar?from&to` dated events (approval deadlines, sign-offs, stage changes, ideas, product starts); at most 93 days.
- `GET /api/v1/home/activity?limit&cursor` cross-product audit trail, newest first, cursor paging.
- `GET /api/v1/ideas`, `POST /api/v1/ideas` (anyone), `POST /api/v1/ideas/:id/{shortlist,unshortlist,accept,reject}` (admin / founder).
- `GET /api/v1/me` who you are and what you may do.
- `GET /health/live`, `GET /health/ready` (database check). `GET /health` unchanged.
Cross-cutting
- Validation on every body and query (unknown fields are rejected). One error envelope. `X-Request-Id` on every response.
- helmet, rate limit (`THROTTLE_LIMIT` per minute per IP on `/api/v1`), CORS from `WEB_ORIGIN`, graceful shutdown.
- No default actor any more on `/api/v1`: changes without `X-Actor` get `401 actor_required` (interim until login, hardening step 2).

## 1.1.0 - 2026-10-15 (readable product addresses)
- Every product now has a stable URL name (`slug`), e.g. `sahayogi-cdn`, made from its name once and never changed by a rename. It is unique, never a route word (`new`, `all`...) and never looks like an id. Older data is given slugs on the first start.
- Web addresses are `/products/<slug>/<screen>` (was `/p/PRD-001/...`). Old `/p/...` and `/products/PRD-001/...` addresses still work and move to the readable one.
- `GET /api/v1/products/:ref` resolves an id or a slug to `{ id, slug, name }`.
- Added `slug` to `home/products` rows, `productSlug` to calendar events, activity rows and the idea-accept result. The old `/api/...` routes accept a slug wherever they accept a product id.
