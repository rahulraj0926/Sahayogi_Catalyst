# Prototype to platform audit (updated 2026-10-14)

Method: every `/api/...` call made by the 45 prototype page files plus `app.js`, `ui.js`, `api.js` was compared with the calls made in `apps/web`, then each screen was ported to match the prototype's behaviour end to end. This audits **capabilities** (what a screen can do), not pixels.

Status: **all gaps found in the first audit are now ported**, except sign-in (needs the auth milestone). All 51 routes were opened in a real browser with no console or API errors, and the dynamic-path buttons were clicked through.

## A. Whole screens
| Prototype | Platform | Status |
|---|---|---|
| `living.js` (Product document) | `features/doc` | done |
| `login.js` + `GET /api/auth/me` | none | **open: auth milestone (M3)** |

## B. Capabilities inside a screen
| Area | Platform | Status |
|---|---|---|
| Record links (add, remove, confirm), clear a flag | `features/item/Links.tsx`, `features/gates/Stage.tsx` | done |
| Overview journey, stage focus, edit-product dialog | `features/overview/Journey.tsx` | done |
| Work: auto-session, wizard, skip / N/A / reopen, answer from a document, research by hand | `features/work/*` | done |
| Plan: effort band, prompt and ingest, generate, N/A | `features/plan` | done |
| Documents: reader, status dialog, exception flow | `features/documents/*` | done |
| Gates: stage overview, stage detail, sign off, set aside, recheck, decision, follow-ups, exceptions, snapshots, depth preview | `features/gates/*` | done |
| Trace: matrix, gaps, funnel, rules | `features/trace/*` | done |
| Files: cost estimate and limit, paste text, sheet picker, evidence per line or cell, reject or remove evidence | `features/files/*` | done |
| Competitors: sources and evidence, verification queue and ingests, effort and cost, full profile (edit sections, prices with units, capabilities, files with candidates, notes) | `features/competitors/*` | done |
| Inbox reject, approvals decline / resend / withdraw, handover create | clicked in a browser | done |
| Handover **deliver** | `features/handoff` | built; not clickable end to end here because no developer-tool address is set on this server |

## C. Fixed while testing
- Calls without an explicit product were sent to the default product. `lib/api.ts` now takes the product from the page URL.
- Browser `confirm` / `prompt` / `alert` dialogs were replaced by in-page dialogs (`useAction().ask / prompt / say`).

## D. Still different (not capabilities)
Guided tour, print styles, global keyboard shortcuts, drag-and-drop upload, highlight-to-select in the file viewer, creating a new record from a quote. Phases 5 to 12 have no prototype screens yet (the prototype covers phases 0 to 4). Compare visually next, then change or remove features in VS Code with Claude Code.
