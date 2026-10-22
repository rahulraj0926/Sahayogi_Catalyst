# next: what to do next
**Prototype source:** `overview.js` (journey page) and `engine/nextactions.js`. **API:** `GET /api/next-actions[?kind=&limit=]`. Rows link through `route.ui` via `go()` in `lib/api.ts`.
**Not yet ported:** the journey stage strip with sign-off names (`GET /api/journey`) and the "Idea card" (`PATCH /api/portfolio/products/:id {idea}`).
