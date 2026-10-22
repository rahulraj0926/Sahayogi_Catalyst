# work: Work on it (overview + one-question-at-a-time wizard)
**Prototype source:** `work.js`, `ui.js` (forms)
**API:** `POST /api/sessions/auto`, `GET /api/sessions`, `POST /api/sessions/:code/steps/:requestId` (`{answers}`, `{action:"skip"|"na"|"reopen"|"derive"|"ask_agent"}`), `/attachments` + `/attachments/:id/assist` (answer from a document), `GET /api/people`. Files: `index.tsx`, `Overview.tsx`, `Wizard.tsx`; forms in `components/StepForm.tsx`.
**Not yet ported:** keyboard shortcuts; spreadsheet-like paste into rows.
