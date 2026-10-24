# Competitor page: how the server side is arranged

Rules this page follows (and new competitor work should keep following):

1. **One page, one read.** A page asks for what it shows in one call. It never downloads a whole product and picks its own rows in the browser.
2. **The server picks the rows.** Filtering by competitor, by status or by link happens on the server, in one place, and is tested.
3. **One piece of logic, one place.** The list of all competitors and the page of one competitor use the same functions (`productLinesOf`, `completenessOf`), so a number cannot differ between them.
4. **Every route has a written description** in `apps/api/src/legacy/openapi-docs` and appears in `docs/api/openapi.v1.json` (`npm run openapi:export -w apps/api`). The contract test fails if one is missing.
5. **Versioned addresses.** Everything is under `/api/v1`. `npm run openapi:breaking -w apps/api` compares a change with the saved reference.
6. **A product has one web address.** `products.slug` has a unique index in the database and `Portfolio.uniqueSlug()` never hands out a word that is taken, reserved, or looks like an id. A slug never changes once given. Covered by `src/tests/home.test.ts`.

## Calls the competitor page makes

| Call | What it gives |
|---|---|
| `GET /competitors/{id}/profile` | The competitor, its links and history, only its own plans, ratings, notes and files, its product lines, how complete the record is, the last few changes in plain words (`recent`), and the capability names in use. 404 if the id is not a competitor. |
| `GET /competitors/catalog` | Our common feature list (shared by every competitor, so it is a separate call) |
| `PATCH /items/{id}` | Saves fields. Refuses an edit made on an old revision (`If-Match` or `expected_rev`) |
| `POST /items`, `POST /links`, `POST /items/{id}/status` | Add a plan, product, note; link them; retire |

Before this change the page made 8 calls and read up to 7,000 items to show one competitor. Now it makes 2.

## Not done yet

- The routes of `/competitors/*` still take loose `Record<string, any>` bodies. They need request classes with validation, like `ideas` and `products`, and a module of their own (`src/competitors/`) instead of sitting in `checks.controller.ts`.
- Strengths and weaknesses are stored as text, one point per line. They should become a list of `{ heading, text }` once the data layer takes lists of objects.
- "Competes with" (`scopes`) is gone from the competitor page, but the dashboard filter, the file import and the API still use it.
