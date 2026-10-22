# flows: viewer, editor, life cycles
**Prototype source:** `flows.js`, `flows_svg.js`, `flowedit_ui.js`.
**API:** `GET /api/flows`, `GET /api/flows/:id`, `GET /api/entities/:id`, `GET /api/flow-edit[/:id]`, `POST /api/flow-edit/:id`.
**Files:** `Diagram.tsx` (SVG layout), `Editor.tsx` (list editor), `index.tsx` (routes: `/flows`, `/flows/:id`, `/flows/:id/edit`, `/flows/entity/:id`).
**Not yet ported:** the prototype's richer SVG (swim lanes by actor, hover details, test coverage marks), drag to reorder steps.
