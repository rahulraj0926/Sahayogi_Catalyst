# App shell (Boss layout)

Rail + drawer + header + footer + assistant, wired to Sahayogi data. Screens live in `features/`; do not edit the shell to change a screen.

- `../Shell.tsx` composes everything. Product screens render as `children` inside `<main>`.
- `groups.ts` builds the product sidebar from `features/registry.ts` (order in `LAYOUT`, one lucide icon per screen in `FEATURE_ICON`) plus the 13 phases. A screen not listed in `LAYOUT` still appears under "More tools".
- `Rail.tsx` the six main places only: Home, Product, Task, Notes, Approval, Report (bottom tab bar on phones). `Drawer.tsx` the product's own 232px sidebar, shown only inside a product (a sheet on phones, opened from the menu button in the header). `Header.tsx` product picker, search (`/api/search`), Acting-as, approvals bell (`/api/approvals`), theme toggle.
- `AssistantHost.tsx` assistant panel → `POST /api/assistant/chat` (`apps/api/src/legacy/routes/assistant.js`). It answers only from saved records and says "I do not know" otherwise.
- Theme: `theme/` (light / dark / system, key `sahayogi.theme`, one `.dark` class on `<html>`). Tokens in `theme/globals.css`; legacy names (`--sd-accent`, `--panel`, ...) map onto them in `app/globals.css`.
- Shared UI: `components/ui/*` (shadcn), `components/dashboard/*` (KPITile, Card, charts). Older `components/ui.tsx` and `kit.tsx` stay for the screens.
