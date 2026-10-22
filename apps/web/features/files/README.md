# files: upload, read with the assistant, view, keep evidence
**Prototype source:** `files.js`, `fileviewer.js`
**API:** `/attachments` (list, upload, delete, view[?sheet=], download, raw), `/attachments/:id/assist` and `/assist/estimate`, `/attachments/:id/paste-text`, `/assistant/usage`, `/pointers` (create, PATCH reject, DELETE). Files: `index.tsx` (list), `Viewer.tsx`, `Extras.tsx`.
**Not yet ported:** drag and drop upload; highlight-to-select (evidence is kept per line or cell instead); creating a brand-new record from a quote (attach to an existing record, or use the review inbox).
