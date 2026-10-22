# Sahayogi Developer: API contract for the product layer

This document covers every route **added or changed** by the portfolio / documents / attachments / assistant work. The routes of the
original single-product prototype (`/api/items`, `/api/gates`, `/api/requests`, `/api/dashboard`, ...) are unchanged except for
the product scope described in section 0. Examples are real responses from the seeded data (trimmed); `...` marks a cut.

## 0. Conventions

**Product scope.** Every route except `/api/portfolio*` runs against ONE product. Choose it with the query parameter
`?product=PRD-003` or the header `X-Product: PRD-003`. If neither is sent the server uses the **first non-archived product**
of `GET /api/portfolio`, so the old UI keeps working. Unknown id -> `404 {"error":"unknown product \"PRD-999\""}`. Every product
response carries an `X-Product` header with the id actually used.

**Who is acting.** Header `X-Actor: Priya Nair` (default `Kanishk`). It is recorded in the audit log and decides separation of
duties (an assistant proposal and its accepting reviewer, a verifier and a submitter, a document approver and a waiver approver).

**Errors.** Always JSON `{ "error": "sentence", "errors": ["..."] }` (`errors` only for validation lists). Codes:
`400` bad JSON, `404` unknown route / product / item / document / attachment, `409` state conflict (already accepted, duplicate,
completeness below threshold, separation of duties), `410` attachment deleted or its file is missing, `413` body too large,
`415` refused file type, `422` validation (missing field, bad enum, quote not at locator), `502` the assistant service failed.

**Bodies.** JSON, except the attachment upload (raw bytes). Dates are `YYYY-MM-DD`; timestamps are ISO strings. The seeded demo pins
"today" to `2026-10-09` (`as_of`).

**File responses** (documents, dossier, reports, downloads) send `Content-Type`, `Content-Disposition` (`inline; filename="x.html"`
by default, `attachment` with `?download=1`; CSV and attachment downloads are always `attachment`) and `X-Content-Type-Options: nosniff`.

**Origins and verification.** Item `origin` is one of `human document agent assistant derived invented`. Items with origin `agent`
or `assistant` have `verification` `unverified | verified | rejected` and **never count toward a gate until `verified`** (and, as
before, in a counted status). New in this build: a competitor capability cell or price that is **stale** (older than its maximum age)
is also not counted, in the grid, in `/api/competitors/prices`, in `/api/competitors/compare` and in the gates (section 9).

**Locator** (used by pointers, the viewer and the assistant). A plain object:

| kind | fields | designates |
|---|---|---|
| `slide` | `index` | a whole slide (title, body, tables, notes as "Notes: ...") |
| `page` | `index` | a PDF page or a document section |
| `paragraph` | `index`, `paragraph` | line `paragraph` (1-based) of slide / page / section `index` (a table row is one line `a \| b`) |
| `table_cell` | `index`, `table`, `row`, `col` | 1-based table inside unit `index` (also CSV: index 1, table 1) |
| `sheet_cell` | `sheet`, `cell` | `{"kind":"sheet_cell","sheet":"Prices","cell":"C2"}` |
| `sheet_range` | `sheet`, `range` | `"A2:C3"` |
| `text_offset` | `offset`, `length` | character range of `extraction.plain_text` |

---

## 1. Portfolio

### `GET /api/portfolio[?archived=1]`
All products with a live summary. Archived products are hidden unless `archived=1`.

```json
{ "as_of": "2026-10-09", "default_product": "PRD-001",
  "counts": { "products": 6, "by_stage": { "idea": 4, "P0": 1, "P1": 2, "P2": 1, "P3": 1, "P4": 1, "handoff": 0, "done": 0, "parked": 0 }, "ideas": 4 },
  "products": [ {
    "id": "PRD-003", "name": "Smart Energy Meter Gateway", "one_liner": "A DIN-rail gateway ...", "kind": "hardware", "owner": "Rohan Mehta",
    "mode": "greenfield", "depth_level": "L2", "archived": false,
    "stage": "P1", "stage_since": "2026-09-04", "days_in_stage": 35, "stage_override": false, "created_at": "2026-08-17T09:30:00.000Z",
    "current_phase": 1, "readiness_percent": 83, "readiness_gate": 1,
    "gates": [ { "gate": 0, "name": "Intake", "state": "Passed", "live_state": "consistent", "readiness": 100, "must_ok": 12, "must_total": 12,
                 "blockers": 0, "decided_at": "2026-09-04T09:30:00.000Z", "decided_by": "Rohan Mehta", "decision": "go" }, "... 5 entries" ],
    "top_next_action": { "id": "AGT:DR-1-16", "kind": "agent_task", "title": "Ask the research agent: ...", "minutes": 3, "why": "...", "route": { "ui": "#/plan?request=DR-1-16", "form_api": "GET /api/requests/DR-1-16", "answer_api": "POST /api/agent/ingest" } },
    "what_happens_next": "Gate 1 (Product and market analysis) is blocked by 2 checks, for example: ...",
    "blocker_count": 2, "open_must_questions": 1, "stale_values": 2, "due_values": 0, "suspect_items": 0, "unverified_agent_items": 4,
    "human_minutes_owed": 225, "human_minutes_total": 385, "last_activity": "2026-10-06T09:30:00.000Z", "days_since_activity": 3,
    "documents_approved": 1, "documents_total": 30, "documents_avg_completeness": 57, "items": 67, "links": 95 } ] }
```
`stage` is one of `idea P0 P1 P2 P3 P4 handoff done parked`. It follows the data (current phase, gate 4 passed -> `handoff`, status
Killed/On hold -> `parked`) unless a person overrode it (`stage_override: true`). `readiness_percent` is the readiness of the gate
for the current phase (`readiness_gate`; the first gate not yet passed, or 4 when all are passed). `gate.state` is `Open | Passed |
Passed-with-conditions | Held | Recycled | Killed | Reopened`; `live_state` (`consistent | at_risk`) tells whether a passed gate still holds.
`human_minutes_owed` = planned minutes of open human and document requests at the product's depth (estimates, not measurements).

### `POST /api/portfolio/products`
Body `{ name*, one_liner, kind: software|hardware|service (default software), owner, mode: greenfield|existing_system (default greenfield), depth_level: L1|L2|L3 (default L2) }`.
Creates `data/products/<id>/store.json` with one `Product` item (`existing_system` is stored as Product.mode `replace`); the Phase 0
data requests are immediately ready (`GET /api/requests?product=ID`).
Response `{ "product": { "id": "PRD-007", "stage": "P0", ... }, "next": { "summary": "GET /api/product/summary?product=PRD-007", "first_session": "GET /api/sessions?product=PRD-007", "next_actions": "..." } }`.
Errors: `422` (missing name, bad kind / mode / depth), `409` (same name already exists).

### `PATCH /api/portfolio/products/:id`
Body any of `{ name, one_liner, owner, kind, stage, parked, archived }`. `stage` is one of `P0..P4 handoff done parked` (sets an override) or
`"auto"` (back to data-driven). `parked: true` parks (stage `parked`, remembers `parked_from`), `parked: false` resumes. `archived: true` hides it
from lists and from default-product selection. Response `{ "product": { ...registry entry } }`. Errors `404`, `422`.

### Ideas inbox
`GET /api/portfolio/ideas[?status=new|shortlisted|promoted|rejected]` -> `{ "total": 4, "ideas": [ { "id": "IDEA-001", "one_liner": "...", "text": "...", "requester": "Priya Nair", "created_on": "2026-09-28", "status": "new", "kind": "software", "product_id": null, "origin": "invented" } ] }`
`POST /api/portfolio/ideas` body `{ one_liner*, text, requester, kind, created_on }` -> `{ "idea": {...} }` (422 without one_liner)
`PATCH /api/portfolio/ideas/:id` body any of `one_liner text requester kind status(new|shortlisted|rejected)` -> `{ "idea" }`
`DELETE /api/portfolio/ideas/:id` -> `{ "deleted": {...} }`
`POST /api/portfolio/ideas/:id/promote` body optional `{ name, kind, owner, mode, depth_level }` -> creates a product at Phase 0 whose **IntakeBrief is pre-filled**
(`idea` = one-liner + text, `requester`, `problem_statement` = the idea text, status Draft, note asking to rewrite it as a pain) -> `{ "idea": {status:"promoted", product_id}, "product": {...}, "next": {...} }`. `409` if already promoted.

### `GET /api/portfolio/next-actions[?limit=20]`
Next actions of all active (not done / parked) products ranked together: `{ as_of, total, products: [ { product_id, name, stage, what_happens_next, total_actions, minutes_total } ], actions: [ <action as in section 3> + "product": { id, name, stage } ] }`.

### `GET /api/portfolio/report[?stuck_days=14][&format=csv|html][&download=1]`
```json
{ "as_of": "2026-10-09", "stuck_after_days": 14, "counts": { "products": 6, "ideas_open": 4 },
  "funnel": [ { "stage": "idea", "count": 4 }, { "stage": "P0", "count": 1 }, "... P1 P2 P3 P4 handoff done parked" ],
  "products_by_stage": { "P0": [ { "id": "PRD-005", "name": "...", "days_in_stage": 7 } ], "...": [] },
  "days_in_stage": { "average": 32.5, "maximum": 63, "longest": [ { "id": "PRD-006", "name": "BoSS Rebuild", "stage": "P2", "days": 63 } ] },
  "stuck": [ { "id": "PRD-006", "name": "BoSS Rebuild", "stage": "P2", "days_since_activity": 19, "last_activity": "...", "what_happens_next": "..." } ],
  "throughput": { "gates_passed_30d": 2, "gates_passed_90d": 8, "last_30d": [ { "product_id": "PRD-001", "product": "Sahayogi CDN", "gate": 0, "decision": "go_with_conditions", "decided_at": "...", "decided_by": "Anjali Rao" } ], "last_90d": [ "..." ] },
  "human_minutes_owed": { "total": 813, "by_session": [ { "code": "S4-A", "title": "Flow walkthrough", "who": "Product leader + BA + ops", "minutes": 166, "steps": 17, "products": [ { "id": "PRD-001", "name": "...", "minutes": 20 } ] } ],
                          "by_person": [ { "person": "Product leader", "minutes": 700, "sessions": [ "S0-A", "..." ] } ], "person_basis": "role: minutes of a session are owed by everyone named in the session ..." },
  "top_blockers": [ { "criterion": "G1-04b", "text": "...", "product_count": 2, "products": [ { "id": "PRD-001", "name": "...", "gate": 1, "message": "..." } ] } ],
  "documents": { "approved": 9, "total": 180, "by_product": [ { "id": "PRD-001", "name": "...", "approved": 5, "total": 30, "avg_completeness": 61 } ] },
  "freshness": { "totals": { "stale": 6, "due": 0, "suspect": 6, "unverified_agent_items": 9 }, "by_product": [ "..." ] },
  "products": [ { "id": "PRD-001", "name": "...", "stage": "P1", "days_in_stage": 27, "readiness_percent": 83, "blocker_count": 2, "human_minutes_owed": 152, "documents_approved": 5, "last_activity": "..." } ] }
```
`stuck` = active products with no audit activity for `stuck_days` or more. `by_person` is by role (the requests have no individual assignee).
`format=csv` -> one row per product (`product_id,product,stage,days_in_stage,readiness_percent,blocker_count,human_minutes_owed,documents_approved,last_activity`), always `attachment`. `format=html` -> printable page.

---

## 2. Product summary, next actions, sessions (product scope)

### `GET /api/product/summary`
Plain-language overview composed from the data: `{ product{id,name,kind,owner,mode,depth_level,stage,stage_since,status}, one_liner, purpose{text,problem,desired_outcome}, target_customers{segments[],personas[]}, scope{in[],out[{id,text,why}],later[],counts}, objectives[ {id,kind,title,statement,status,key_results[ {id,title,target,baseline_type,owner} ]} ], headline_numbers{competitors_tracked,requirements,requirements_by_priority,stories,acceptance_criteria,features,open_questions,open_must_questions,risks_open,assumptions_open,documents_approved,documents_total}, stage_timeline[ {phase,name,gate,gate_state,live_state,readiness,decision,decided_on,decided_by,rationale,conditions[],is_current,blockers} ], next{what_happens_next, top_actions[]}, recent_activity[ {at,action,actor,subject,sentence:"2026-10-08: Neha Kapoor started ..."} ] (15, newest first), documents[ {key,title,phase,status,completeness,missing_count} ] }`.

### `GET /api/next-actions[?limit=N][&kind=data_request|agent_task|verification|stale_refresh|suspect_review|attestation|document_approval]`
Ranked by **blocking value per minute** (`value_per_minute` = `value` / `minutes`; value: 3 per blocking Must check and 1 per advisory check, doubled at the next gate, a quarter at later gates; planning estimates, not measurements).
```json
{ "product": { "name": "Smart Energy Meter Gateway", "stage_gate": 1 }, "as_of": "2026-10-09", "total": 40, "minutes_total": 247,
  "by_kind": { "agent_task": 6, "verification": 2, "stale_refresh": 2, "data_request": 23, "document_approval": 7 },
  "what_happens_next": "Gate 1 (Product and market analysis) is blocked by 2 checks, for example: ... Best next step: ... (about 3 minutes).",
  "actions": [ { "rank": 1, "id": "AGT:DR-1-16", "kind": "agent_task", "title": "Ask the research agent: One-page profiles for Tier 2 competitors",
      "detail": "Claude rates only ...", "why": "It clears 1 blocking check for Gate 1: \"...\".", "minutes": 3, "value": 6, "value_per_minute": 2, "blocks": ["G1-04b"], "phase": 1,
      "owner_kind": "AGENT_RESEARCH", "ref": "DR-1-16",
      "route": { "ui": "#/plan?request=DR-1-16", "session": "S1-A", "form_api": "GET /api/requests/DR-1-16", "answer_api": "POST /api/agent/ingest", "session_api": "POST /api/sessions/S1-A/steps/DR-1-16" } } ] }
```
Action ids: `REQ:<request>` (open human / document data request), `AGT:<request>` (research the agent can do), `VER:<request|adhoc>` (agent / assistant values waiting for a different person; `items[]`), `STL:<item>` (stale or due value or evidence), `SUS:<item>` (suspect), `ATS:<criterion>` (attestation), `DOC:<key>` (document to review or approve). `route` always names the UI hash, the API to read the form and the API to answer.

### `GET /api/sessions[?forms=0]`
Sessions (the named short meetings) grouped by phase; `forms=0` omits step forms.
```json
{ "depth": "L1", "phases": [ { "phase": 0, "name": "Intake / Discovery", "minutes_left": 222, "sessions": [ {
  "code": "S0-A", "title": "Sponsor kickoff", "purpose": "Agree what the product is, who sponsors it and what material already exists.", "who": "Product leader + sponsor",
  "phase": 0, "total_minutes": 29, "minutes_left": 18, "steps_total": 7, "steps_done": 4, "complete": false, "next_step": "DR-0-05",
  "steps": [ {
    "question": "Who else decides, delivers, buys, uses, regulates or pays? One line each: Name | Category | Role | what they need.",
    "can_be_answered_by_document": true, "assist_goal": "stakeholders",
    "request_id": "DR-0-05", "title": "List the other people who matter, one line each", "ask": "...", "minutes": 6, "owner_kind": "HUMAN",
    "kind": "form", "phase": 0, "depth_level": "L1", "in_depth": true, "status": "ready", "blocked_by": [], "done_message": "criterion G0-04 not yet met",
    "feeds_criteria": ["G0-04"], "creates": "Stakeholder x N", "skipped_reason": null, "answered_at": null, "answered_by": null,
    "form": { "kind": "form", "question": "...", "example_answer": { "people": "Priya Nair | Operations | Head of Network Ops | Operable by 6-person NOC" },
              "can_be_answered_by_document": true, "assist_goal": "stakeholders", "hidden_field_count": 0, "conditional_fields": null, "prompt": null, "ingest_format": null, "derive": null, "link_to": null,
              "fields": [ { "key": "people", "label": "People", "type": "lines", "required": true, "help": "Name | Category | Role | Needs. ...", "example": "...", "default": null,
                            "lines": { "columns": ["name","category","role_title","needs_summary"], "min_parts": 2, "separator": "|" } } ] } } ] } ] } ] }
```
Step `status`: `done | not_applicable | skipped | ready | in_progress | blocked`. Step `kind` (how to render): `form` (fields), `resolve_question` (fields `question`, `kind` plus `conditional_fields` for `answered | assumed | waived`, each at most 3 fields), `attestation`, `gate_decision` (fields `decision` with the allowed values, `rationale`, `conditions` lines, `recycle_to`), `review_drafts` (`ids`), `verify_agent_items` (`action`,`ids`,`note`), `derived` (no fields; just POST), `agent_research` (`agent_json` plus `prompt` and `ingest_format`), `info`.
**Every step has at most 5 fields**, required fields first; the plain-language `question` is first, `example_answer` gives a sample; field `type` is `text | longtext | choice | yes_no | lines | pick_item | date | number`; `choice` has `values`, `pick_item` has `options [{id,title}]`, `lines` has `lines.columns` (one row per line, parts separated by `lines.separator`).
`can_be_answered_by_document` is true when an uploaded document can answer the step; pass `assist_goal` to `POST /api/attachments/:id/assist` (section 5).

### `POST /api/sessions/:code/steps/:requestId`
Body one of:
* `{ "answers": { "<field key>": value, ... } }` (default `action: "answer"`): creates the items and links through the engine, all or nothing.
* `{ "action": "skip", "reason": "..." }`: marks the step `skipped` (it does NOT count as done), audited as `session.skip`. `422` without a reason.
* `{ "action": "ask_agent" }`: returns `{ "prompt": "..." }` to paste into an assistant for a **draft** answer; nothing is written; audited as `session.ask_agent`.
Response `{ "action", "request_id", "changed": { "created": [ {id,type,title,status} ], "updated": [...], "links": 2, "extra": { decision, state, message, attested } }, "session": { code, steps_total, steps_done, complete }, "next_step": <step as above, with form> | null }`.
Errors: `404` (step not in that session), `422` (missing required answer, invalid row; nothing is written), `409` (gate decision not allowed).

---

## 3. Attachments, extraction, viewer

Files are stored in `data/products/<id>/uploads/`. Max 25 MB. Refused: executables and scripts by extension (`.exe .dll .bat .cmd .sh .ps1 .js .jar .msi ...`) **and by content** (MZ, ELF, `#!`). Soft delete only.

### `POST /api/attachments?target=ITEM_ID&name=FILENAME`
Raw request body = the file; content type from the `Content-Type` header, else the extension. Any item can be a target.
```json
{ "attachment": { "id": "ATT-001", "filename": "brief.pptx", "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "size_bytes": 5279, "sha256": "d68f0b...", "uploaded_by": "Priya Nair", "uploaded_on": "2026-10-09", "status": "Active", "extracted_text_status": "ok", "extracted_chars": 916, "pages": 4, "note": null, "warnings": [] },
  "target": "CMP-001", "extraction": { "status": "ok", "kind": "pptx", "chars": 916, "warnings": [] } }
```
`extracted_text_status`: `ok | partial | unsupported | failed`. Errors: `404` target, `413` > 25 MB, `415` refused type, `422` empty / no name / no target, `409` the same file is already attached to that target. The Attachment is an item (prefix `ATT`, origin `document`) linked `attached_to` its target.

### `GET /api/attachments[?target=ITEM_ID]`  ->  `{ target, total, attachments: [ { ...attachment brief, "targets": ["CMP-001"] } ] }`
### `GET /api/attachments/:id/download`  ->  the original bytes, always `Content-Disposition: attachment`.
### `GET /api/attachments/:id/raw`  ->  the original inline, for the browser's own viewer (PDF, images). Types a browser could execute (html, svg) are served as `text/plain`; every response has `Content-Security-Policy: sandbox`.
### `GET /api/attachments/:id/media?path=ppt/media/image1.png`  ->  one embedded image of an Office file (only `ppt|word|xl/media/<image>`; `422` otherwise, `404` if absent). Paths come from the `images` lists of `/view`.
### `GET /api/attachments/:id/text`
Structured extraction: `{ attachment, extraction: { status, kind, slides|pages|sheets: [...], plain_text, warnings, chars } }`.
* `slides[]`: `{ index, title, text, notes, images[], locator, blocks:[{locator,text}], tables:[{rows,locator_table,cells:[{locator,text}]}] }`
* `pages[]` (DOCX sections, PDF pages, text files): `{ index, title, text, blocks, tables, locator }`; DOCX pages also `elements[]` in reading order (`{t:"p",style,text,heading}` / `{t:"table",rows}`) and `headings[]`.
* `sheets[]`: `{ index, title, text, cells:[{ref,row,col,value,number?,formula?,locator}], tables:[{columns:["A","B",...],rows,row_numbers,first_row}] }` (formulas carry the cached value).
Support matrix: see README ("Text extraction").
### `DELETE /api/attachments/:id`  ->  `{ id, status: "Deleted", filename }` (soft; the file stays; audited `attachment.delete`).

### `GET /api/attachments/:id/view[?sheet=NAME&offset=0&limit=100]`
Viewer data plus the pointers already attached, positioned by locator. Common keys: `attachment, kind, extraction_status, warnings, pointers[], raw_url, download_url, viewer`.
* `viewer: "slides"` -> `slides: [ { index, locator, title, blocks:[{locator,text}], tables:[{table,rows,cells}], notes, images:[{path,url}] } ]` (ordered cards)
* `viewer: "document"` (DOCX) -> `sections: [ { index, title, locator, elements:[ {type:"heading|paragraph",style,text,locator} | {type:"table",table,first_line,rows,cells:[{locator,text}]} ] } ]` in reading order
* `viewer: "grid"` (XLSX, CSV, TSV) -> `sheets:[{index,title,cells}], sheet, grid: { columns:["A",...], total_rows, total_columns, offset, limit, has_more, columns_truncated, rows:[ { row, cells:[ {ref,value,locator} ] } ] }`; `limit` max 500 rows, 50 columns per request, page with `offset`
* `viewer: "pdf"` -> `pages:[{index,locator,text,blocks}]` best-effort text; show the file itself from `raw_url`; `text_status` says how much text was recovered
* `viewer: "image"` -> use `raw_url`; `viewer: "text"` (txt, md, html, json) -> `pages[].blocks`; `viewer: "none"` -> download only.
A pointer is placed by its `locator` (same shape as the `locator` of the blocks / cells / slides).

### `POST /api/attachments/:id/suggest`  (writes nothing)
Heuristic drafts (regex and rules) for **PricePoint** and **competitor profile** fields:
```json
{ "attachment": {...}, "extraction_status": "ok", "target": "CMP-001", "default_competitor_id": "CMP-001",
  "candidates": [ { "id": "c1", "kind": "price_point", "confidence": 0.95, "confidence_level": "high", "reasons": ["found in a table with a price column", "..."], "assumptions": [],
      "location": { "type": "slide", "index": 3, "label": "Slide 3 (\"Pricing\"), table row 2", "row": 2 },
      "locator": { "kind": "table_cell", "index": 3, "table": 1, "row": 2, "col": 2 }, "quote": "Rs 1,499 per user per month", "snippet": "Plan | Price | Billing >> Starter | Rs 1,499 per user per month | billed monthly, excl. GST",
      "fields": { "plan": "Starter", "amount": 1499, "currency": "INR", "unit": "user/month", "value_metric": "user", "price_type": "list", "billing_model": "subscription", "billing_period": "month", "tax_basis": "excl_gst" }, "currency_as_written": "Rs" },
    { "id": "c3", "kind": "competitor_field", "field": "founded_year", "confidence": 0.8, "fields": { "founded_year": 2011 }, "locator": {...}, "quote": "Founded in 2011 and headquartered in Pune, India.", "location": {...}, "reasons": [], "assumptions": [] } ],
  "warnings": [], "note": "These are drafts. Nothing has been created. ..." }
```
Prices: currency (symbol or ISO: `Rs`, `INR`, rupee sign, `$`, `USD`, EUR, GBP...) -> ISO code; `unit` (per GB, per user, per device...); `billing_period` (month, quarter, year, one_time); `price_type` (list, mrp, street, dealer, quote...); `tax_basis`; amounts followed by million / billion / crore are not prices; ranges are skipped with a warning. Anything not stated is filled with a default **and listed in `assumptions`**, which lowers confidence. Profile fields: `website`, `founded_year`, `headcount_note` + `size_band`, `funding_summary`, `hq_country`, `certifications`, `key_customers`. Candidates are sorted by confidence. Every candidate has a `locator` + `quote` that verify against the extraction.

### `POST /api/attachments/:id/accept`
Body `{ "candidates": [ <candidate objects from /suggest, optionally with "overrides": {field: value} and "competitor_id"> ], "competitor_id": "CMP-001", "own_product": false, "overwrite": false }`.
`price_point` -> a `PricePoint` (status Draft, **origin `document`, `verification: "unverified"`** meaning pending, `provenance: { source:"attachment", attachment_id, filename, location, snippet, confidence, accepted_by }`), linked `contains` from the competitor and `attached_to` from the attachment (and `supported_by` the Evidence when the attachment's target is an Evidence). `competitor_field` -> updates the competitor (existing different values are **skipped** unless `overwrite: true`) and adds a `CompetitorNote` recording the source. A competitor is required (`competitor_id`, the attachment's target, or `own_product: true` for a price of our own product). All or nothing: any error -> `422 { error, errors[] }` and nothing is written.
Response `{ "created": [ {id,type,title,status,origin,verification} ], "updated": ["CMP-001"], "skipped": [ {candidate, field, reason} ] }`. Nothing is ever created without this call.

---

## 4. Pointers (evidence anchors)

A **Pointer** (item prefix `PTR`) is an exact quote at a locator of an attachment. Fields: `attachment`, `locator_kind` + flattened `locator_*`, `quote` (max 500), `created_by`, `pointer_origin` `human | assistant`, `status` `proposed | confirmed | rejected`, `confidence`, `reason`. Links: `points_to` (Pointer -> Attachment), `cited_by` (Pointer -> backed item) and the item is `supported_by` the Pointer. A **confirmed** pointer also makes the item `supported_by` an **Evidence** record that stands for the attachment (created on demand, origin `document`, `url_or_file: "attachment:ATT-001"`), so every gate rule that asks for Evidence counts it, with provenance back to the exact place. Rejecting, retargeting or deleting a pointer removes that evidence link unless another confirmed pointer from the same document still backs the item.

### `POST /api/pointers`
Body `{ attachment*, locator*, quote*, target?: "CMP-001", create?: { type, subtype?, fields }, status?: "confirmed"(default for humans)|"proposed", reason?, confidence? }` -- send `target` (existing item) **or** `create` (a new item of that type with initial fields, origin `document`), not both. The quote must occur (whitespace-normalised) in the extracted text at the locator, otherwise `422 { "error": "pointer refused: the quote does not occur at slide 2" }`.
Response `{ "pointer": <pointer>, "target": {id,type,title}|null, "created_item": {id,type}|null }` where
`pointer = { id:"PTR-001", status, attachment, filename, locator, quote, created_by, origin, confidence, reason, targets:[{id,type,title}], created_at }`.
### `GET /api/pointers?attachment=ATT-001` | `?target=PPT-005` | `?status=confirmed` (rejected hidden unless `include_rejected=1`)  ->  `{ total, pointers[] }`
### `PATCH /api/pointers/:id`  body `{ status?: confirmed|rejected|proposed, target?: "ITEM", reason? }` (retarget moves the cited_by / supported_by links)  ->  `{ pointer }`
### `DELETE /api/pointers/:id`  ->  `{ deleted, was: {attachment, quote} }`
`GET /api/items/:id` now also returns `pointers: [ <confirmed pointers backing the item> ]` so an item page can link back to the exact place.

---

## 5. Assistant and review inbox

**Who does the linking?** The assistant reads an uploaded document and proposes items, links and pointers; **people only review**. It can never write anything final: it only adds proposals (status `proposed`) to the **review inbox** (`store.data.inbox`, ids `PRP-001...`). A person accepts, which is the only way records are created.

**Modes** (`GET /api/inbox` shows `assistant_mode`):
| mode | when | what happens |
|---|---|---|
| `live` | env `ANTHROPIC_API_KEY` is set | `POST https://api.anthropic.com/v1/messages` via `node:https`, model from env `SD_MODEL` (default `claude-sonnet-5-5`). **Only** the extracted text of that one document (lines prefixed with their locator, capped at 60 000 characters), the goal and the list of allowed fields are sent. |
| `mock` | env `SD_ASSIST_MOCK=1` | deterministic offline proposals (the heuristic result plus one invented quote that the filter must reject). No network. For tests and demos. |
| `heuristic` | neither | the regex / rule engine (`suggest.js` plus rules for capabilities, requirements, stakeholders). No network. |
**Nothing is ever sent to the network unless `ANTHROPIC_API_KEY` is set.** The prompt asks for JSON with exact quotes; the server then verifies every quote against the extracted text at the stated locator and **drops** any proposal whose quote is not found (logged in `store.data.hallucinations` and the audit log as `assistant.hallucination_rejected`), drops invalid field sets and wrong types, and de-duplicates.

### `POST /api/attachments/:id/assist`
Body `{ "goal": "competitor_profile|competitor_prices|capabilities|requirements_from_document|stakeholders", "target"?: "CMP-001" (or "competitor_id") }`. A competitor is needed for the first three goals (default: the attachment's target when it is a competitor; otherwise send it here or at accept time).
```json
{ "mode": "heuristic", "source": "heuristic", "goal": "competitor_prices", "attachment": {...}, "competitor_id": "CMP-001",
  "added": [ { "id": "PRP-001", "attachment": "ATT-001", "goal": "competitor_prices", "status": "proposed", "kind": "create_item", "competitor_id": "CMP-001",
      "item": { "type": "PricePoint", "fields": { "title": "Starter", "plan": "Starter", "amount": 1499, "currency": "INR", "unit": "user/month", "value_metric": "user", "price_type": "list", "billing_model": "subscription", "billing_period": "month", "tax_basis": "excl_gst" } },
      "pointer": { "locator": { "kind": "table_cell", "index": 3, "table": 1, "row": 2, "col": 2 }, "quote": "Rs 1,499 per user per month" },
      "confidence": 0.95, "reason": "found in a table with a price column; ...", "source": "heuristic", "proposed_by": "Priya Nair", "proposed_at": "..." } ],
  "rejected_hallucinations": [ { "at": "...", "attachment": "ATT-001", "goal": "...", "source": "mock", "quote": "...", "locator": {...}, "reason": "the quote does not occur at line 1 of unit 1" } ],
  "dropped": [ { "type": "PricePoint", "quote": "...", "reason": "invalid fields: ..." } ], "inbox_pending": 5, "note": "These are PROPOSALS ..." }
```
`kind` is `create_item` or `update_fields` (competitor profile: `item.type` = Competitor, `item.fields` = the fields to set). Goals: `competitor_prices` -> PricePoint; `capabilities` -> CompetitorCapability (table rows pairing a capability with yes / no / partial); `competitor_profile` -> profile fields; `requirements_from_document` -> Requirement (functional, Draft) from "shall / must / should" lines; `stakeholders` -> Stakeholder (category guessed from the role, skipped when unknown). Errors: `422` unknown goal / no readable text / not a competitor, `502` the live service failed.

### `GET /api/inbox[?status=proposed|accepted|rejected|all][&attachment=ATT-001][&goal=...]`
`{ status_filter, counts: {proposed,accepted,rejected}, total, hallucination_rejections, assistant_mode, groups: [ { attachment: {id,filename,status}, counts, proposals: [ <proposal> ] } ] }` grouped by document, proposals sorted by confidence.
### `POST /api/inbox/:id/accept`  body optional `{ competitor_id, overrides: {field: value}, overwrite }`
Creates the real item (origin **`assistant`**, `proposed_by` = whoever ran the assistant, status = the type's first status), the `contains` / `attached_to` links, and a **confirmed Pointer** (plus the Evidence link). **Verification:** if the reviewer (the `X-Actor`) is a *different person* from the proposer the item is `verified` (`verified_by` = reviewer); if the same person accepts their own proposal it stays `unverified` (pending) and needs `POST /api/agent/verify/:id` by someone else. Counting toward gates additionally needs the item's counted status (e.g. a PricePoint must be `Reviewed`).
`{ "proposal": {... "status": "accepted", "reviewed_by", "result": { "item": "PPT-005", "created": ["PPT-005"], "pointer": "PTR-001", "verification": "unverified" } }, "item": "PPT-005", "pointer": {...}, "verification": "unverified", "note": "..." }`. Errors: `409` already accepted / rejected, `422` competitor needed, `410` document deleted.
### `POST /api/inbox/:id/reject`  body `{ reason? }`  ->  `{ proposal: {status:"rejected", reject_reason} }`
### `POST /api/inbox/accept-all?attachment=ATT-001&minConfidence=0.7`  body optional `{ competitor_id }`
Accepts every proposed row of that document at or above the confidence; `{ attachment, min_confidence, considered, accepted, accepted_items[], failed:[{id,error}] }`. Each acceptance is atomic; one failure does not stop the others.

---

## 6. Documents (the 30 key outputs of Phases 0 to 4)

Keys by phase: **0** `intake_document stakeholder_register evidence_register constraints open_questions initial_scope`; **1** `market_analysis competitor_analysis customer_context problem_landscape market_risks`; **2** `product_definition scope_statement capability_map priorities success_metrics out_of_scope`; **3** `prd user_stories business_rules acceptance_criteria nfrs integration_requirements traceability`; **4** `user_journeys process_maps workflow_diagrams state_maps exception_flows cross_module_flows`.

### `GET /api/documents`
`{ product:{id,name}, total:30, approved, approval_threshold_percent:80, by_status, documents:[ { key,title,phase,status,completeness,last_updated,word_count,missing_count,owner_role,source_items,changed_since_approval,approved_by,approved_at } ] }`. `status`: `not_started` (no source data) `| draft | in_review | approved`. `completeness` = satisfied checks / all checks (0 when nothing exists yet).
### `GET /api/documents/:key[?format=json|html|md][&download=1]`
`json` (default): `{ key,title,phase,owner_role,status,completeness,last_updated,missing_count,needs_total,word_count,sources{types,items,provenance},artifact_kind,changed_since_approval,approved_by,approved_at,waiver, sections:[ {id,heading,blocks:[ {t:"p",text}|{t:"table",headers,rows}|{t:"ul",items}|{t:"note",text}|{t:"diagram",title,mermaid,svg} ],needs:[ {ok,label,why,target} ]} ], missing:[ {label,why,section,target} ], citations:[ ... ] }`.
Text may contain item tokens `[[PPT-005]]` (render as a link to `#/item/PPT-005` plus a provenance badge: invented, human, document, agent/assistant unverified or verified, derived). **`missing[].target`** says where to add it: `{ request, session, ui:"#/plan?request=DR-0-05", form_api:"GET /api/requests/DR-0-05", answer_api:"POST /api/requests/DR-0-05/answer", minutes }` or `{ create:{type,api:"POST /api/items"} }`. **`citations`**: `[ { n, pointer_id, attachment, filename, locator, label:"slide 2, line 3", quote, item_ids[], viewer_route:"#/viewer/ATT-001?locator=%7B...%7D", view_api } ]` -- every confirmed pointer behind an item mentioned in the document; the HTML shows `[n]` after the item and a Sources list, the Markdown uses `[^n]` footnotes. `html` is a self-contained page (all text escaped; diagrams as inline SVG plus Mermaid text); `md` has Mermaid fences. Both end with a **Missing** block when something is absent. Nothing is invented: absent data is stated as absent.
### `POST /api/documents/:key/status`
Body `{ status: draft|in_review|approved, role*, note?, waiver?: { reason, approver } }`. `role` must be one of Product Owner, Sponsor, Product leader, Tech lead, QA lead, Legal (or the document's owner role). Approval needs completeness >= `settings.params.doc_approval_min_pct` (default 80, change with `POST /api/settings {params:{doc_approval_min_pct: 70}}`) **or** a `waiver` whose approver is a different person; agents cannot approve. Recorded in the document history and the audit log (`document.status`); mirrored onto the matching Artifact item (`intake_document market_analysis competitor_analysis product_definition prd flow_pack`). Response `{ key, status, completeness, history[], waiver }`. Errors `422` (role, status, same-person waiver), `409` (not started, or `{error, completeness, threshold, missing[]}` below threshold).
### `GET /api/dossier[?format=html|md][&phase=N][&download=1]`  All documents (or one phase) with a table of contents; footnote numbers are unique across the dossier.

---

## 7. Competitors

### `GET /api/competitors/compare?ids=CMP-001,CMP-002[&include_ours=true][&users=10][&units=500][&gb=1000][&format=csv]`
`ids` defaults to all non-retired competitors. Usage defaults are `users=10, units=100, gb=1000` (GB per month); `usage.defaults_used` lists which were defaults. `include_ours=true` adds an `OURS` column (our Feature coverage in capability rows; our own prices are PricePoints that belong to no competitor).
```json
{ "as_of": "2026-10-09", "ids": ["CMP-001","CMP-002"], "usage": { "users": 10, "units": 500, "gb": 1000, "defaults_used": ["users","gb"], "note": "..." }, "include_ours": true,
  "columns": [ { "id": "CMP-001", "title": "VoltEdge VE-300", "tier": "T1", "tier_class": "tier1", "status": "Reviewed", "ours": false }, "..., { id:'OURS', ours:true }" ],
  "profile_rows": [ { "field": "founded_year", "label": "Founded", "values": { "CMP-001": { "value": 2013, "freshness": null }, "CMP-002": { "value": 2019, "freshness": null }, "OURS": null } } ],
  "profile_freshness": { "CMP-001": { "last_reviewed_on": null, "review_by": null, "review_overdue": false, "status": "Reviewed" } },
  "price_rows": [ { "id": "PPT-001", "column": "CMP-001", "competitor": "VoltEdge VE-300", "plan": "VE-300 MRP", "amount": 21500, "currency": "INR", "unit": "unit", "value_metric": "device", "price_type": "mrp", "billing_model": "one_time", "billing_period": "one_time", "tax_basis": "incl_gst", "channel_level": "retail", "region": "India", "valid_from": null, "valid_to": null,
      "mrp": 21500, "street_price": null, "dealer_margin_pct": null, "dealer_price_inr": null, "group": "mrp | retail | one_time | units", "cost_12m_inr": 9110169.49, "cost_36m_inr": 9110169.49, "cost_note": null, "quantity_kind": "units", "quantity_used": 500, "notes": ["GST 18% removed to compare excluding tax"],
      "captured_on": "2026-09-22", "grade": "B", "freshness": "fresh", "age_days": 17, "counted": true, "excluded": false, "excluded_reason": null, "status": "Reviewed", "origin": "invented", "verification": "verified", "rank_36m": 1 } ],
  "price_groups": [ { "group": "mrp | retail | one_time | units", "comparable": false, "rows": ["PPT-001"], "cheapest_36m": null, "excluded": [] } ],
  "capability_rows": [ { "tag": "Guided commissioning", "importance": 5, "cells": { "CMP-001": { "id": "CCP-003", "level": "absent", "grade": "B", "freshness": "fresh", "age_days": 17, "counted": true, "excluded": false, "evidence_basis": "documented", "note": "...", "captured_on": "..." }, "CMP-002": null,
        "OURS": { "feature_id": "FTR-002", "title": "...", "priority": "Must", "scope_status": "in", "rating": "ahead", "basis": "linked (differentiates)" } } } ],
  "rules": [ "Prices are only ranked inside identical groups ...", "Stale values are shown but excluded from ranking and counts ...", "..." ] }
```
Normalisation: amounts are converted to INR with `settings.fx` and made **excluding GST** (incl_gst divided by 1 + `gst_rate_pct`, default 18); `usage` prices scale with GB / TB (per month), per-user prices with `users`, per-device and per-unit prices with `units`; subscriptions are charged per period over 12 or 36 months, one-time prices once; `setup_fee` and `mandatory_extras` (`"Cable:200:one_time"`, period `one_time|month|year`) are added; a cost that cannot be computed is `null` with `cost_note` (never 0). A price is ranked (`rank_36m`) only inside its `group` (price type, channel level, billing family, quantity basis), only if `counted` and not `excluded` (stale). MRP, street and dealer prices are never mixed. `format=csv` -> `section,row,<competitor titles...>`, always attachment. Errors `404` unknown id, `422` negative or non-numeric usage.

### Item changes
* **Competitor** new optional fields: `legal_name founded_year hq_country size_band(1-10|11-50|51-200|201-1000|1001-5000|5000+) headcount_note ownership funding_summary target_customers strengths weaknesses gtm_channels[] technology_notes certifications[] key_customers[] tier_class(tier1|tier2|watchlist|alternative|in_house) segment_overlap(high|medium|low|none) last_reviewed_on review_by`. **`tier` stays `T1|T2|T3|S`** (it drives gates and freshness cadences); `tier_class` is the new portfolio label. Existing `kind`, `website`, `positioning` unchanged.
* **CompetitorNote** (prefix `CNT`): `date*, text*, source, author, importance`; linked `note_on` -> Competitor. Create with `POST /api/items {type:"CompetitorNote"}` then `POST /api/links {type:"note_on"}`.
* **PricePoint** new optional fields: `billing_period gst_rate_pct included included_quantity min_quantity setup_fee mandatory_extras[] warranty_months observed_basis mrp street_price dealer_margin_pct valid_from valid_to`; `value_metric` also accepts `unit transaction hour project`. **CompetitorCapability** new: `valid_from valid_to source_grade analyst_confidence kano_class disconfirming_note`.

---

## 8. Reports

### `GET /api/reports/product[?format=csv|html][&download=1]`
`{ as_of, product, one_liner, what_happens_next, progress:{ overall_documents_percent, phases:[ {phase,name,gate_state,readiness,must_ok,must_total,blockers:[{id,text,message}],decided_on,decision} ] }, documents:{ completed:[{key,title,approved_by,approved_at}], pending:[{key,title,status,completeness,missing_count}] }, risks:[ top 10 open by score ], decisions:[...], waivers:[...], conditions:[...], handoff_readiness:{ready_stories,total_stories,not_ready:[{id,title,reasons}]}, headline_numbers }`. CSV columns `section,item,status,detail,owner_or_note`; HTML is a printable page.

---

## 9. Changed behaviour of existing routes and engine

* All existing routes accept `?product=` / `X-Product` (section 0). `POST /api/reset` and the demo routes rebuild the scoped product from its seed (`409` for products not created by the seed script).
* `GET /api/items/:id` adds `pointers[]` (section 4).
* **Freshness consistency (bug fix):** `isCounted(item, {store,today})` excludes stale `CompetitorCapability` / `PricePoint` values. Used by the grid (`counted`), `/api/competitors/prices`, `/api/competitors/compare`, and the gate DSL (`counted: true` selectors and link requirements). Before, the grid flagged a stale cell but gate G1-04 still counted it.
* New origin `assistant` (unverified until a different person verifies). The verification queue (`GET /api/agent/queue`, `POST /api/agent/verify|reject/:id`) now lists `assistant` items too.
* New item types `Attachment (ATT)`, `Pointer (PTR)`, `CompetitorNote (CNT)`; new links `attached_to`, `points_to`, `cited_by`, `note_on`; `supported_by` may target a Pointer. Terminal statuses now include `Deleted` and `rejected`.
* Request bodies larger than the limit now get `413` (the connection is no longer dropped).

## 9b. Round 4 routes

| Route | What it does |
|---|---|
| `POST /api/feedback` (no product needed) | Saves a note from the "Something wrong here?" button: body `{ text, categories?: ["confusing","missing","broken","too much text"], route?, product?, width?, words? }`. Stored with the acting person and the time in the database, table `feedback_notes` (one list per install; older installs have their `feedback.json` copied in once at start). 422 when the text is empty or over 4,000 characters |
| `GET /api/feedback` (no product needed) | `{ total, open, notes[] (newest first), categories }` |
| `POST /api/feedback/:id/done` | `{ done: true\|false }` ticks a note as dealt with |
| `GET /api/needed` | "Who you need": `{ stages[{ n, name, state, counts, can_ask_count, rows[{ id, stage, type, who, role, need, status: not_asked\|asked\|waiting\|done\|declined, word, approval (link, mailto, whatsapp when waiting), href, can_ask, why_not }] }], summary, sponsor, legal, base }` |
| `POST /api/needed/send` | `{ stage? , row? }` asks for every row of that stage (or that row) that can be asked now: `{ created[], approvals[], skipped[{ id, need, why }], needed }` |
| `GET /api/flow-edit` | The flows with what each still needs: `{ flows[{ id, title, steps, failure_paths, ok, problems[], draft }] }` |
| `GET /api/flow-edit/:id` | One flow as the editor shows it: `{ flow, start, end, steps[{ id, text, actor, next: auto\|end\|<step id>, fail: { text, condition, test } \| null }], actors[], problems[], ok, failure_paths }` |
| `POST /api/flow-edit/:id` | Saves the whole list: `{ title?, goal?, trigger?, end_text?, steps[{ id?, text, actor?, next?, fail?: { text, condition?, test } }] }`. Failure paths end in their own "stopped" step (request DR-4-02) with a "Fails safely" test; a refused save changes nothing |
| `PATCH /api/portfolio/products/:id` | now also takes `idea: { who_for, why_now, asked_by }` (the Idea card). `GET /api/journey` returns `idea: { name, one_liner, who_for, why_now, asked_by, filled, done }` and, per finished step, `signed_off_on` and `signed_off_by` (the approver) |

## 10. Environment

| variable | meaning |
|---|---|
| `PORT` | listen port (default 4317) |
| `SD_DATA_DIR` | portfolio root (`portfolio.json`, `products/<id>/store.json`, `products/<id>/uploads/`); default `data/`. On first start the folder is seeded (the legacy `data/store.json`, when present, becomes the Sahayogi CDN product) |
| `SD_DATA` | legacy: a single store file; the server then runs a one-product portfolio around it |
| `ANTHROPIC_API_KEY` | enables the live assistant (the only way anything is sent to the network) |
| `SD_MODEL` | assistant model id (default `claude-sonnet-5-5`) |
| `SD_ASSIST_MOCK=1` | deterministic offline assistant for tests and demos |
