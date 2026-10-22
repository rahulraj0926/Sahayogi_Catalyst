# Claude Code prompt: move Sahayogi onto the Boss layout

How to use: put the extracted `boss-layout-extract` folder next to `sahayogi-platform` (same parent folder).
Open `sahayogi-platform` in VS Code, start Claude Code, and paste everything under the line.
Run the API first (`npm run dev:api`) and keep it running while you check screens.

---

Goal: replace the look and the app shell of `apps/web` with the layout from `../boss-layout-extract` (read its
`README.md` and `PROMPT.md` first). Keep every feature screen under `apps/web/features/*` working. Do not touch
`../prototype`. Do not copy any Boss data fetching: wire everything to Sahayogi's own API (`apps/web/lib/api.ts`).

## What we have today (do not break)
- Next.js 15 App Router, React 19. Plain CSS in `app/globals.css` (variables `--bg --panel --ink --accent --ok --warn --bad ...`). No Tailwind yet.
- One catch-all route `app/p/[pid]/[[...path]]/page.tsx` renders a feature from `features/registry.ts`. Sidebar groups come from the `section` of each registry entry (`components/Shell.tsx`).
- Home `/` = Portfolio. A product opens at `/p/<PRD-id>` (Overview with the 13-phase tiles and the Journey roadmap).
- Data hooks: `useApi(path, pid)` and `api(path,{method,body,product})` in `lib/api.ts`. Never fetch around them.
- The 13 phases (0 Intake, 1 Market, 2 Scope, 3 Requirements, 4 Flows, 5 UX/UI, 6 Architecture, 7 Dev spec, 8 Development, 9 QA/Testing, 10 Deployment, 11 Operations, 12 Feedback) are in `Phase_Process_Of_Sahayogi.pdf`. Only 0 to 4 have working screens; 5 to 12 show a placeholder.

## Steps (small, reviewable; after each one show a light and a dark screenshot and run `npx tsc --noEmit -p apps/web`)
1. **Inspect, then report** mismatches before changing anything: Tailwind v3/v4 (we have none, add v4 with `@tailwindcss/postcss`), shadcn/Radix (add the packages `package.json` of the extract lists), lucide-react, sonner, recharts.
2. **Theme first.** Port `theme/` (tokens, Inter font, `ThemeInitScript`, `ThemeProvider`, `ThemeToggle`). Then map our old variables to the new tokens so all 28 existing screens turn dark without edits, e.g. `--bg:var(--background)`, `--panel:var(--card)`, `--ink:var(--foreground)`, `--accent:var(--primary)`; keep `--ok/--warn/--bad` and give each a dark value. Remove the Light/Dark buttons in our current header; use the extract's `ThemeToggle`. `.dark` goes on `<html>` only.
3. **Common components.** Copy `common/` and `common/ui/` as-is. Replace our hand-made `Badge`, `Card`, `Modal`, `Tabs`, `Field` in `components/ui.tsx` and `components/kit.tsx` with thin wrappers over the shadcn ones, **keeping their current props** so no feature file changes. Port `dark-variants.test.ts` pointed at `apps/web`.
4. **Shell.** Rebuild `components/Shell.tsx` as `WorkspaceShell > Sidebar (icon rail, bottom tab bar on phones) > WorkspaceHeader > ModuleDrawer > page`:
   - Rail/drawer "modules" = our sections plus the 13 phases. Take the entries from `features/registry.ts` (do not hard-code a second list). Phases come from `GET /api/lifecycle` (or the tiles in `features/overview`).
   - Header: product switcher in place of `OrgSwitcher` (data: `GET /api/portfolio`), `HeaderSearch` bound to `GET /api/search?q=` (records) plus the registry screens, "Acting as" person picker (`lib/api.ts` `actor()/setActor()`), theme toggle, approvals bell showing the count from `GET /api/approvals` (`waiting`).
   - Footer area: the one-line "Every number is computed from the saved records" note plus the data date (`as_of` from `/api/portfolio`).
   - Keep `components/Shell.tsx`'s rule that a feature is hidden when `onlyMode` does not match.
5. **Assistant (robot) widget.** Port `assistant/` as pure UI. Wire `onSend` to a new Nest endpoint `POST /api/assistant/chat` that for now answers from the product's own data (use `/api/next-actions`, `/api/journey`, `/api/stages`). Show real "I do not know" text when there is nothing; never invent numbers. Keep the open/close animation, both themes.
6. **Home dashboard.** Port `DashboardPage` layout for `/` (portfolio) and for `/p/<pid>` (product). Real data only; show "—" and the empty state when a number has no source.

## KPI cards, filters, tables: use our data
| Widget | Where | Data (all existing endpoints) |
|---|---|---|
| Greeting + "what to do next" | product home | `GET /api/next-actions?limit=5`, `actor()` |
| KPI: stages signed off `n of 5` | product home | `GET /api/stages` -> `stages[].signed_off` |
| KPI: readiness % of current stage | product home | `GET /api/stages` -> `stages[current].readiness` |
| KPI: required items still needed | product home | `GET /api/stages/:n` -> `required_open` |
| KPI: waiting for approval | header + home | `GET /api/approvals` -> `waiting.length`, `for_you.length` |
| KPI: review inbox | home | `GET /api/inbox` -> `counts.proposed` |
| KPI: stories ready for developers | home | `GET /api/handoff/overview` -> `status.stories_ready` |
| Chart (area): readiness by stage | product home | `GET /api/stages` -> `stages[].readiness` |
| Chart (donut): items by status or by type | product home | `GET /api/items?limit=5000` (count in the browser by `status` / `type`) |
| Modules at a glance | product home | one tile per registry feature with a `count` (see `registry.ts`) |
| Recent activity table | product home | `GET /api/audit?limit=15` |
| Portfolio KPIs (products, by stage, ideas) | `/` | `GET /api/portfolio` -> `counts` |
| Portfolio table | `/` | `GET /api/portfolio` -> `products[]` |
| Filter bar | items, files, inbox, competitors, review | the extract's `filter-bar.tsx`; filters stay client-side over the list the screen already loads |
Rules: no number is typed in or sample-filled; if the call fails or is empty, show "—" and `EmptyState`. Do not use `SampleDataBadge` except for the demo product.

## Do not
- Do not rename routes or registry ids; features keep `/p/<pid>/<id>/...`.
- Do not use a bare `bg-white`, `text-gray-*` or `border-gray-*` class; use tokens or add the `dark:` pair.
- Do not add a second copy of the nav list or of a phase name.

## Acceptance (check in a real browser, both themes, then report)
- [ ] Hard reload with dark stored: no white flash. "System" follows the OS live.
- [ ] Every screen in the sidebar opens with no console error and no failed `/api` call (a Playwright pass over all routes is in `docs/FEATURES.md` order).
- [ ] Dialogs, dropdowns, selects, toasts are dark in dark mode (our `Modal`, `useConfirm`, `usePrompt`).
- [ ] Phone width: rail becomes a bottom tab bar, drawer opens as a sheet, no horizontal scroll.
- [ ] Assistant opens and closes, answers only from real data.
- [ ] KPI numbers equal the same numbers shown on the Gates, Approvals and Inbox screens.
- [ ] Update `docs/FEATURES.md` and each touched feature's README.
