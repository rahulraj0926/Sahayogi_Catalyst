# approvals: waiting for approval
**Prototype source:** `approvals_ui.js`, `approve.js` (the public page, now `app/approve/[token]/page.tsx`).
**API:** `GET /api/approvals`, `POST /api/approvals/:id/confirm|decline|resend|withdraw`, `POST /api/approvals/seen`, `GET|POST /api/sharing`; public: `GET /api/approve/:token`, `POST /api/approve/:token/decide`.
**Rule kept:** a link proves possession of the link and a typed name, not identity. No logins yet (milestone M6).
**Not yet ported:** the "announce" dialog that pops up right after an action creates an approval (links are visible on this page).
**Note:** the server still builds links as `<base>/#/approve/<token>`; the UI rewrites them to `/approve/<token>`.
