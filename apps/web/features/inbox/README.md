# inbox: review the assistant's proposals
**Prototype source:** `inbox.js` (+ plain-language helpers `SDF` from `files.js`).
**API:** `GET /api/inbox?status=all`, `POST /api/inbox/:id/accept|reject|edit`, `POST /api/inbox/accept-all?attachment=&minConfidence=`.
**Rule kept:** a proposal never counts until a person accepts; the requester accepting leaves it "waiting for a second person".
**Not yet ported:** keyboard shortcuts (A/R/E/O/J/K), per-goal edit forms with dropdowns (edit is a plain field list), "same fact also seen at" merge notes, "open at this spot" deep links into the viewer.
