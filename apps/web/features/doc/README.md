# doc: the Product document (the product home page)
**Prototype source:** `living.js`
**API:** `GET /api/journey`, `/stages`, `/audit`, `/documents`, `/dossier?format=html|md`, `/sheet`, `/existing`. Uses `components/DocBody.tsx` to sanitize the dossier HTML and route its links.
**Not yet ported:** guided tour; the old-system function add button covers only the `existing.applies` case.
