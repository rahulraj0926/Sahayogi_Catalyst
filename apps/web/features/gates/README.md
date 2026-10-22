# gates: stage sign-offs
**Prototype source:** `gates.js`, `gates_forms.js`
**API:** `GET /api/stages`, `GET /api/stages/:n`, `GET /api/gates/:n[?depth=]`, `POST /api/gates/:n/attest|waive|decide`, `POST /api/conditions/:id/close`, `POST /api/waivers/:id/revoke`, `POST /api/items/:id/clear`. Files: `index.tsx` (routes /gates and /gates/<n>), `Overview.tsx`, `Stage.tsx`; dialogs in `components/GateActions.tsx`.
**Not yet ported:** order warnings detail beyond the text from the server.
