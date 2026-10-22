# admin: history, import, export, settings
**Prototype source:** `admin.js`. **API:** `GET /api/audit`, `GET /api/export`, `POST /api/import {data}`, `POST /api/reset`, `POST /api/settings {asOf, suspectDepth}`.
**Not yet ported:** the "specification reference" table of record types (expert), import preview/diff. Import replaces the product's rows in PostgreSQL on the next flush.
