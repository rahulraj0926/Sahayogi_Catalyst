# Sahayogi Developer: running prototype (Phases 0 to 4)

A working thin vertical slice of "Sahayogi Developer", the tool that manages Phases 0 to 4 of the product lifecycle
(Intake, Product and market analysis, Product definition, Requirements, User and business flows). It runs, persists,
shows a dashboard, and has a guided demo that makes the process execute in front of you.

The sample product is **Sahayogi CDN** (CDN = Content Delivery Network, an assumption recorded as ASM-001). It is
hypothetical: every invented fact is tagged `origin=invented` in the data.

## Run it

```
node server.js          # http://localhost:4317  (Node 22, no npm install, no network)
node tests/run.js       # 84 tests
node scripts/seed.js    # rebuild data/: the Sahayogi CDN store.json AND the whole portfolio (6 products, 4 ideas)
node scripts/check_seed.js dealer all   # dev aid: gate picture of one seeded product (developer, meter, dealer, warranty, boss, cdn)
```

Open `http://localhost:4317`. Start with **Guided demo** (sidebar, blue) and press Next ten times: each step calls the
real API and the dashboard changes. `PORT=n` sets the port. `SD_DATA_DIR=path` moves the whole portfolio (default `data/`);
the legacy `SD_DATA=file.json` runs a one-product portfolio around a single store file. The existing pages work unchanged
against the first non-archived product; every route also takes `?product=PRD-nnn` (see `docs/API_CONTRACT.md`).

## The product layer (portfolio, documents, uploads, assistant)

The engine, gates and data model of the single-product prototype are unchanged. Around them there is now:

```
data/portfolio.json                      registry: products (id, name, one_liner, kind, owner, stage, stage_since, depth_level, mode, archived) + ideas
data/products/<PRD-nnn>/store.json       one engine Store per product, atomic write, cached per product id in the server
data/products/<PRD-nnn>/uploads/         uploaded files of that product
engine/portfolio.js    registry, store cache, create / promote idea       engine/pstate.js    shared computed state (gates, plan, stale, suspect)
engine/compose*.js     the 30 documents as Markdown / HTML (+ Mermaid and SVG), status, dossier, citations
engine/extract*.js     zip reader + PPTX / DOCX / XLSX / CSV / TSV / TXT / MD / JSON / HTML / PDF text extraction, locators.js (stable addresses)
engine/suggest.js      regex price / profile suggestions        engine/attachments.js  upload, viewer data, suggest / accept
engine/pointers.js     exact-quote anchors used as evidence     engine/assistant.js    proposals only, review inbox (live / mock / heuristic)
engine/compare.js      competitor comparison                    engine/nextactions.js  ranking by blocking value per minute
engine/sessions.js     guided wizard definitions and step posts engine/summary.js, reports.js  product summary and reports
routes/*.js            the new HTTP routes (server.js keeps the old ones)         scripts/seed_*.js, scripts/packs/*.js  portfolio seed
```

**The seeded portfolio** (all invented, `as_of` 2026-10-09; every record validates, gate states are computed by the engine):

| Product | Kind / depth | Stage | Items | Gate picture |
|---|---|---|---|---|
| Sahayogi CDN | service, L2 | P1 | 266 | G0 passed with conditions; G1 83% (stale prices, Legal not signed, unverified Bunny.net batch); the original seed, unchanged |
| Sahayogi Developer | software, L1 | P3 | 90 | G0-G2 passed; G3 56% (open Must question, a Must requirement with only a draft AC, a draft NFR AC) |
| Smart Energy Meter Gateway | hardware, L2 | P1 | 67 | G0 passed; G1 83% (a stale dealer price, Legal attestation pending, 4 unverified agent values); MRP / street / dealer-margin prices |
| Dealer Order Portal | software, L1 | P4 | 121 | G0-G3 passed; G4 71% (an external call without a failure path, a requirement not in a flow) |
| Warranty and Service Desk | service, L1 | P0 | 21 | G0 40% (no customer named, no date constraint, an open Must question, thin evidence) |
| BoSS Rebuild | software, existing system, L1 | P2 | 56 | G0-G1 passed; G2 63% (Must effort 47 pm vs 36 pm, baseline decision only proposed, an open Must question) |

Plus four ideas in the inbox. **To add a product:** write a pack in `scripts/packs/<name>.js` (plain arrays: people, evidence,
assumptions, competitors, features with their requirement / story / acceptance criteria, flows; set `reach` for the phase to seed through,
`decide` for the gates to decide, and leave gaps on purpose), register it in `SEEDS` and `PRODUCTS` of `scripts/seed_portfolio.js`, run
`node scripts/seed.js`. `scripts/seed_lib.js` builds every record through `Store.create` / `Store.link` and refuses to fake a gate decision.

**Text extraction support matrix** (no dependencies; `engine/extract.js`):

| Format | Works | Partial or not supported |
|---|---|---|
| PPTX | slides in presentation order, titles, text, tables, speaker notes, embedded image references | charts, SmartArt and text inside grouped shapes are not read |
| DOCX | headings, paragraphs and tables in reading order | footnotes, text boxes, headers and footers are not read (a warning says so) |
| XLSX | sheets, shared and inline strings, column letters and row numbers, cached values of formulas | dates appear as serial numbers; sheets stop at 20 000 cells |
| CSV, TSV, TXT, MD, JSON, HTML | text and tables (HTML scripts and styles removed) | legacy encodings other than UTF-8 / UTF-16 |
| PDF | text-based PDFs: Flate streams, object streams, simple fonts and fonts with a ToUnicode map, pages in order | scanned pages (no OCR), encrypted files, custom font encodings without a map: reported `partial` or `unsupported`, never guessed |
| DOC, PPT, XLS, ODF, RTF | stored; reported `unsupported` | save as OOXML and upload again |

**The assistant never writes anything final.** `POST /api/attachments/:id/assist` only adds proposals (each with an exact quote and a
locator, verified against the extracted text; invented quotes are dropped and logged) to a review inbox; a person accepts or rejects.
With `ANTHROPIC_API_KEY` set it asks the Messages API (`SD_MODEL`, default `claude-sonnet-5-5`); otherwise it uses the regex / rule
engine, and `SD_ASSIST_MOCK=1` gives deterministic offline proposals. **Nothing is sent to the network unless `ANTHROPIC_API_KEY` is set.**
The live path has been tested only with an injected fake transport, never against the real service.

## What you can see

| Page | Route | What it shows |
|---|---|---|
| Dashboard | `#/` | Depth selector; five-phase pipeline strip with readiness and gate state; gate cards; "What I need from you" with answer-in-place forms; agent tasks with copy-prompt; traceability funnel; open Must questions; stale evidence; suspect items; verification queue; effort meter; handoff readiness; recent activity |
| Collection plan | `#/plan` | All 89 data requests by phase and owner kind, minutes, sessions, status, prefilled forms |
| Phase workspaces | `#/phase/0..4`, `#/phase/X` | Item tables per type, schema-driven add/edit, status, provenance badge |
| Item detail | `#/item/ID` | Fields, upstream and downstream chains, links, suspect clear, gates that use it, history |
| Traceability | `#/trace` | Coverage matrix, rules, gap lists, funnel |
| Flow viewer | `#/flows` | SVG flows (happy solid, alternate dashed, failure red), entity state diagram, dead-end checks |
| Competitors | `#/competitors` | Tiers and caps, capability grid with grade and freshness, normalised prices, sources, verification queue, effort model |
| Gates | `#/gates` | Criterion-by-criterion evaluation, offenders, attest, waive, decide, effect of depth |
| Handoff | `#/handoff` | JSON payload preview and dry-run validation |
| Review queue | `#/review` | Derived drafts awaiting a person |
| Audit, import, export, reset | `#/admin` | Audit log, JSON export/import, reset to seed, settings, spec-ID reference |

## Architecture

```
server.js                  plain node:http, JSON API under /api, static files from public/
engine/   (CommonJS, shared by server and tests; the browser only renders what the API returns)
  schema.js    45 item types: prefixes, owning phase, typed fields, statuses, required fields, suspect fields, validation
  links.js     65 typed links: allowed (source,target) pairs, cardinality, attributes, propagation, validation on write
  store.js     persistence, ID generator, create/update/link with validation, audit log
  suspect.js   fingerprints, suspect and multi-hop stale propagation, clear
  query.js     selector/where/link-spec toolkit, "counted" rule
  coverage.js  coverage rules (data/coverage_rules.json), flow and state-model checks, matrix, gaps, funnel
  gates.js     gate engine: criteria evaluator (DSL), waivers, attestations, decisions, depth levels
  questions.js Must question resolution: answered / assumed (with assumption) / waived (with waiver)
  requests.js  data-collection plan engine: completion rules, totals, sessions, ranking, form answers
  derive.js    DERIVED generators; agent.js ingest + verification queue; competitors.js; handoff.js; dashboard.js; demo.js
data/    gates.json (50 criteria)  data_requests.json (89 requests)  coverage_rules.json  dimensions.json  examples/
public/  index.html app.css js/{api,ui,app}.js js/pages/*.js     (vanilla, no build, no CDN)
scripts/ seed.js  agent_ingest.js  browse.js (headless screenshots, a dev aid)
tests/   run.js + *.test.js
```

## Mapping to the specification (v2, pre-amendment)

Every type, link, criterion and request carries a `v2Ref` (visible in `#/admin` > Reference). Examples: `Requirement`
-> 3.3.E / 3.4.2; links -> LK-xxx; criteria -> `G3-08` etc. (split into `G3-08`, `G3-08b` where one spec line bundled
several coverage rules); coverage rules -> `CR-xx`; competitor slice -> `COMP-6/...`; handoff -> section 8.

How the gap-register fixes show up: UserStory type (STY) with `for_persona`; flow edges (`next` with kind and guard);
Entity/State/Transition; gate criteria as data (`data/gates.json`); coverage by subtype (global NFRs are scoped by
`global` or `applies_to`, never forced into flows: criteria G3-10, G4-03); register links (`assumes`, `constrains`,
`affects`, `blocks`, `clarifies`, long range); Artifact container with `contains`; Must question resolved by
documented assumption or waiver; numeric effort and capacity with a computed fit test (G2-07); handoff contract with
closure, idempotency key and dry run.

## Gate DSL (data/gates.json)

`op` is one of `count_min none_open each_has_fields exists_link coverage freshness numeric_compare categories_covered
must_questions lint weak_basis values_verified top_n_requirement suspect_free failure_edges_tested flows_complete
entities_complete handoff_ready all`. Selectors are `{type|types, subtype, where, counted}`; `where` supports equality,
lists, `{in,not,gte,lte,gt,lt,exists,contains,before,after}`, `$or/$and/$not`, `$hasOut/$noIn...`, `$suspect`.
Parameters (`$min_competitors` etc.) may be keyed by depth. Results are PASS, FAIL, ATTEST_PENDING, WAIVED or NA, each
with offenders and a plain sentence. Depth: a gate evaluates only criteria at or below the product's depth.

## How to extend

* **Item type**: add an entry to `TYPES` in `engine/schema.js` (prefix, phase, statuses, fields, suspectFields, v2Ref).
* **Link type**: add `lk(...)` in `engine/links.js` (pairs, card, propagation TS/ST/BOTH/INFO, attrs).
* **Gate criterion**: add an object to `data/gates.json` (id, gate, text, type, severity, depth_level, query, v2Ref). New
  query ops go into `OPS` in `engine/gates.js`. Coverage rules: `data/coverage_rules.json`.
* **Data request**: add an object to `data/data_requests.json` (owner_kind, minutes, why, done_when, form or prompt or derive).
  New derivations go into `FUNCS` in `engine/derive.js`.

## Honest list of what is stubbed or out of scope

* No authentication or roles; "Acting as" is a header selector (X-Actor). Separation of duties is enforced by name only.
* No real AI call: agent results are pasted JSON; prompts are ready to paste into Claude.
* Not implemented: Phases 5+, AS-IS and gap item types (BoSS Rebuild records the AS-IS side as Evidence and feature descriptions), ChangeRequest workflow beyond the type, baselines compare/restore,
  PDF export, notifications, review rounds and approvals (status changes stand in), Journey, Threat, Interface and 50 other spec types.
* Handoff is a dry run and a Handoff record; nothing is sent, signed or retried.
* `PricingHypothesis`, `Offering`, `IntelRequirement` are not implemented; `benchmarks` links from Decision/Opportunity instead.
* Minutes, hours and rupee figures are planning estimates (the competitor report's calibration), not measurements.
* The Sahayogi CDN seed has about 270 records, more than the 150 to 200 asked, to cover 50 criteria and a realistic mix. The generated products have 21 to 121 records (see the table above).
* The new screens do not exist yet: only the API (docs/API_CONTRACT.md). Costs, minutes and confidences are estimates. Document ids in the viewer routes (#/viewer/..., #/documents/...) are for the future UI.
* Lint is a small regex rule set; EARS conformance and glossary checks are not implemented.

## Deviations and findings about the spec

See the final report; the main ones: the spec has no `affects` link (the brief's name; the spec uses `assumes`,
`constrains`, `clarifies`, `threatens`), `flows_to` is called `next`, `performs` is `actor_of`, and `requires_state` is
`in_state`. The spec's rule "a vacuous coverage rule passes if the existence criterion is met" was replaced by "an empty
population fails unless the criterion says otherwise". Stale-value refresh needed a `supersedes` retirement rule the spec
only implies. Verifying an agent value cascades to its source Evidence, which the spec does not state.

## Round 4: the living run, notes and the new pages
- `node scripts/e2e_full.js` runs the whole journey as a product leader from a blank install, through the screens only, to a created hand-over package (approvals through links in a second tab on 127.0.0.1). Every step is scored 0 to 3 as a layman would feel it and the run fails on any 2 or 3. `--stop-after N`, `--keep`, `--resume <folder>`, `--shots <dir>`, `--max-minutes N` are described at the top of the file.
- `node scripts/ux_budget.js` also covers Your idea (120), Who you need (200), the flow editor (250) and Notes you left (200).
- New pages: Your idea (`#/p/:pid/idea`), Who you need (`#/p/:pid/people`), the flow editor (`#/p/:pid/flows`, `.../flows/:id/edit`), Notes you left (`#/notes`). New routes: `GET/POST /api/feedback`, `GET /api/needed`, `POST /api/needed/send`, `GET/POST /api/flow-edit`. Decisions: `docs/ROUND4_DECISIONS.md`.
