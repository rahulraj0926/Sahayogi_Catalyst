import { BookOpen, Building2, FileBarChart, Files, Gauge, Grid3x3, History, HeartPulse, Layers, LayoutDashboard, ListChecks, ListTree, PenLine, PlayCircle, Rocket, ShieldCheck, Swords, UserRound, Waypoints, Workflow, type LucideIcon } from 'lucide-react';
import { FEATURES } from '@/features/registry';

export const PHASE_SHORT = ['Intake', 'Market', 'Scope', 'Requirements', 'Flows', 'Design', 'Architecture', 'Specification', 'Build', 'Quality', 'Release', 'Operate', 'Improve'];

export interface NavLinkDef { also?: string[]; href: string; label: string; hint?: string; icon?: LucideIcon; glyph?: string; count?: 'inbox' | 'approvals' | 'people'; match?: 'exact' | 'prefix'; isOn?: (path: string) => boolean }
export interface NavGroupDef { key: string; label: string; icon?: LucideIcon; hint?: string; collapsible?: boolean; defaultOpen?: boolean; items: NavLinkDef[]; /** the 13 phases (the "Phases" group lists them and nothing else) */ phases?: NavLinkDef[] }

/**
 * The product sidebar: one plain link per entry, in the order a person uses them. An entry with several screens opens as ONE page
 * with a section per screen (components/shell/HubPage.tsx), so there are no tabs and nothing is listed twice.
 *
 *   Dashboard · Lifecycle · Work · Documents · People & approvals · History (always last)
 * Every screen in features/registry.ts belongs to one entry below (as a section or a member), so nothing is lost.
 */
export interface HubSection { id: string; label: string; plain: string; onlyMode?: 'existing_system' }
export interface Hub { key: string; label: string; icon: LucideIcon; hint: string; /** 'menu': the sidebar lists every screen under it. 'page': one sidebar link that opens one page with a section per screen. */ style: 'menu' | 'page'; /** the address of the one page: /products/:pid/<route> ('overview' is the dashboard) */ route: string; sections: HubSection[]; /** other screens that belong here and open on their own address */ members?: string[]; count?: 'people' }
export const HUBS: Hub[] = [
  { key: 'dashboard', style: 'page', label: 'Dashboard', icon: LayoutDashboard, hint: 'Where this product stands and what to do next', route: 'overview', sections: [{ id: 'overview', label: 'Dashboard', plain: '' }] },
  { key: 'lifecycle', style: 'menu', label: 'Lifecycle', icon: Workflow, hint: 'Sign-offs, what is not covered yet, and the status report, all in one place', route: 'lifecycle', members: ['gates', 'trace', 'report', 'health', 'demo', 'existing', 'phase'],
    sections: [
      { id: 'gates', label: 'Sign-offs', plain: 'Each phase, what still blocks it, and the button to sign it off.' },
      { id: 'trace', label: 'Traceability', plain: 'Checks that every requirement has a story, a test and a reason. Shows what is not covered yet.' },
      { id: 'report', label: 'Status report', plain: 'The status of the whole product on one page. You can print it.' },
      { id: 'existing', label: 'Existing systems', plain: 'What the old system does and what happens to each part.', onlyMode: 'existing_system' },
      { id: 'health', label: 'Health detail', plain: 'Readiness, values that may be out of date, and items waiting for a second look.' },
      { id: 'demo', label: 'Practice walk-through', plain: 'Try a sign-off on sample data. Nothing real is changed.' },
    ] },
  { key: 'work', style: 'menu', label: 'Work', icon: ListChecks, hint: 'What to do next, user stories and hand-over', route: 'work', members: ['next'],
    sections: [
      { id: 'work', label: 'Work on it', plain: 'Short guided sessions that fill in the product, starting with the most useful one.' },
      { id: 'stories', label: 'User stories', plain: 'Finish each story. A second person approves it.' },
      { id: 'plan', label: 'All questions', plain: 'Every question the tool needs answered, who answers it and in what order.' },
      { id: 'handoff', label: 'Hand over', plain: 'Send the approved stories to the developers.' },
    ] },
  { key: 'documents', style: 'page', label: 'Documents', icon: Files, hint: 'Documents and uploaded files in one list, plus step-by-step flows and a one-page summary', route: 'documents', members: ['files', 'doc'],
    sections: [
      { id: 'library', label: 'Documents and files', plain: 'The documents the tool writes and the files you upload, in one list.' },
      { id: 'flows', label: 'Step-by-step flows', plain: 'Pictures of how a task goes, step by step, including what happens when something goes wrong.' },
      { id: 'sheet', label: 'Product on one page', plain: 'Every fact about the product on one page. You can search it.' },
    ] },
  { key: 'people', style: 'page', label: 'People & approvals', icon: UserRound, hint: 'Approvals, things waiting for someone to check, and who is needed', route: 'people', count: 'people', members: ['inbox', 'checks', 'review', 'approvals'],
    sections: [
      { id: 'approvals', label: 'Approvals', plain: 'Decisions someone has been asked to approve.' },
      { id: 'inbox', label: 'Proposed by the assistant', plain: 'Check what the assistant suggested before it counts.' },
      { id: 'checks', label: 'Facts to check', plain: 'A different person confirms each fact. Until then it does not count.' },
      { id: 'review', label: 'Drafts to review', plain: 'Everything the system wrote waits here for a person.' },
      { id: 'people', label: 'Who is needed', plain: 'Whose answer or sign-off is still missing.' },
    ] },
  { key: 'history', style: 'page', label: 'History', icon: History, hint: 'Every change, backups, and notes about the tool', route: 'history', members: ['admin', 'notes'],
    sections: [
      { id: 'admin', label: 'Every change and backups', plain: 'Who changed what and when. Back up or restore.' },
      { id: 'notes', label: 'Notes about the tool', plain: 'Notes you left about the tool itself.' },
    ] },
];

/** Addresses that belong to a hub without being one of its sections (the document reader, one phase page). */
const EXTRA: Record<string, string> = { doc: 'documents', phase: 'lifecycle', 'gate-health': 'lifecycle', files: 'documents', documents: 'documents' };

export const hubOf = (featureId: string): Hub | undefined => {
  const id = featureId === 'gate-health' ? 'health' : featureId;
  return HUBS.find((h) => h.style === 'page' && h.route === id) || HUBS.find((h) => h.sections.some((t) => t.id === id) || h.members?.includes(id)) || HUBS.find((h) => h.key === EXTRA[id]);
};

/** The path after the product, as a screen id: '' and 'overview' are the dashboard. */
export const screenOfPath = (path: string) => /^\/products\/[^/]+\/?([^/?#]*)/.exec(path)?.[1] || 'overview';

const SECTION_ICON: Record<string, LucideIcon> = { gates: ShieldCheck, trace: Waypoints, report: FileBarChart, existing: Building2, health: HeartPulse, demo: PlayCircle, work: PenLine, stories: BookOpen, plan: ListTree, handoff: Rocket };

/** Old addresses that open inside one of the listed screens. */
const SAME: Record<string, string> = { 'gate-health': 'health', next: 'work' };

function hubLink(pid: string, h: Hub): NavLinkDef {
  return { href: h.route === 'overview' ? `/products/${pid}` : `/products/${pid}/${h.route}`, label: h.label, hint: h.hint, icon: h.icon, count: h.count, isOn: (path) => hubOf(screenOfPath(path))?.key === h.key };
}

/** Sidebar groups for one product. A 'menu' entry lists all its screens; a 'page' entry is one plain link. History is always last. */
export function productGroups(pid: string, mode?: string): NavGroupDef[] {
  const phaseGroup: NavGroupDef = {
    key: 'phases', label: 'Phases', icon: Layers, hint: 'The 13 phases, from Intake to Improve', collapsible: true, defaultOpen: true, items: [],
    phases: PHASE_SHORT.map((name, i): NavLinkDef => ({ href: `/products/${pid}/phase/${i}`, label: name, hint: `Phase ${i}: ${name}`, glyph: String(i), match: 'prefix' })),
  };
  const groups = HUBS.map((h): NavGroupDef => {
    if (h.style === 'page') return { key: h.key, label: '', items: [hubLink(pid, h)] };
    return {
      key: h.key, label: h.label, icon: h.icon, hint: h.hint, collapsible: true, defaultOpen: true,
      items: h.sections.filter((x) => !x.onlyMode || x.onlyMode === mode).map((x) => ({ href: `/products/${pid}/${x.id}`, label: x.label, hint: x.plain, icon: SECTION_ICON[x.id], isOn: (path: string) => { const sc = screenOfPath(path); return (SAME[sc] || sc) === x.id; } })),
    };
  });
  const at = groups.findIndex((g) => g.key === 'lifecycle');
  groups.splice(at + 1, 0, phaseGroup);
  return groups;
}

/** Which sidebar entry a screen sits under. The breadcrumb bar uses this so it always matches the sidebar. */
export function sectionFor(featureId: string): { label: string; firstId: string } {
  const h = hubOf(featureId);
  if (!h) return { label: 'Dashboard', firstId: 'overview' };
  return { label: h.label, firstId: h.style === 'page' ? h.route : h.sections[0].id };
}

/** The plain name a screen has: its name in the hub, else the name in the registry. */
export function screenLabel(featureId: string): string {
  const id = featureId === 'gate-health' ? 'health' : featureId;
  const t = HUBS.flatMap((h) => h.sections).find((x) => x.id === id);
  if (t) return t.label;
  const f = FEATURES.find((x) => x.id === id || x.aliases?.includes(id));
  return f?.label || featureId;
}

export function isActive(path: string, l: NavLinkDef) {
  if (l.isOn) return l.isOn(path);
  if (l.also?.some((a) => path === a || path.startsWith(a + '/'))) return true;
  return l.match === 'exact' ? path === l.href : path === l.href || path.startsWith(l.href + '/');
}

/** True on any Competitors screen of a product. The main rail and the Competitors sidebar both use this. */
export const isCompetitorsPath = (path: string) => /^\/products\/[^/]+\/competitors(\/|$)/.test(path);

export const COMPETITOR_VIEWS = ['list', 'plans', 'planner', 'grid', 'catalog', 'prices', 'compare', 'sources', 'queue', 'effort'];

/** Sidebar for the Competitors area (its own entry in the main rail). The views are routes under /products/:pid/competitors. */
export function competitorGroups(pid: string): NavGroupDef[] {
  const base = `/products/${pid}/competitors`;
  /** '' for the dashboard, the first word after /competitors otherwise, null outside the area. */
  const view = (path: string) => { if (path !== base && !path.startsWith(base + '/')) return null; return path.slice(base.length + 1).split('/')[0] || ''; };
  const on = (v: string) => (path: string) => view(path) === v;
  return [
    { key: 'browse', label: 'Browse', items: [
      { href: base, label: 'Dashboard', icon: Gauge, hint: 'Where we stand against competitors', isOn: on('') },
      { href: `${base}/list`, label: 'All competitors', icon: Swords, hint: 'Each competitor, with its plans and prices', isOn: (p) => { const v = view(p); return v === 'list' || (!!v && !COMPETITOR_VIEWS.includes(v)); } },
      { href: `${base}/planner`, label: 'Plans and features', icon: Layers, hint: 'Our own plans and the features each one gives', isOn: on('planner') },
      { href: `${base}/grid`, label: 'Compare competitors', icon: Grid3x3, hint: 'Every competitor and the features it provides', isOn: on('grid') },
    ] },
  ];
}
