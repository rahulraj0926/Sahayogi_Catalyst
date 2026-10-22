'use client';
/**
 * THE FEATURE LIST. One entry per screen of a product.
 *
 *   Add a screen    : create features/<id>/index.tsx (+ README.md), add one entry below.
 *   Remove a screen : delete its entry (and folder). Nothing else references it.
 *   Rename / move   : change label, icon or section here; the sidebar follows.
 *
 * The router (app/products/[pid]/[[...path]]/page.tsx) and the sidebar (components/Shell.tsx) both read this list.
 * See docs/FEATURES.md for what each feature does, which API it calls and which prototype page it came from.
 */
import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui';
import type { ComponentType } from 'react';
import type { FeatureDef, FeatureProps } from './types';

const lazy = (loader: () => Promise<{ default: ComponentType<FeatureProps> }>) => dynamic<FeatureProps>(loader, { loading: () => Loading() });

export const FEATURES: FeatureDef[] = [
  { id: 'overview', label: 'Dashboard', icon: '◉', section: 'product', hint: 'All 13 phases and what to do next', prototype: 'overview.js', component: lazy(() => import('./overview')) },
  { id: 'doc', label: 'Product document', icon: '▤', section: 'product', hint: 'The whole documentation of the product in one place', prototype: 'living.js', component: lazy(() => import('./doc')) },
  { id: 'next', label: 'What to do next', icon: '◉', section: 'product', hint: 'The best next steps, per minute of time', prototype: 'overview.js', component: lazy(() => import('./next')) },
  { id: 'report', label: 'Status report', icon: '▥', section: 'expert', hint: 'Status of this product, printable', prototype: 'reports.js', component: lazy(() => import('./report')) },
  { id: 'health', label: 'Stage health detail', icon: '◈', section: 'expert', hint: 'Readiness, stale values, second looks', prototype: 'dashboard.js', aliases: ['gate-health'], component: lazy(() => import('./health')) },
  { id: 'work', label: 'Work on it', icon: '✎', section: 'product', hint: 'Short guided sessions that fill in the records', prototype: 'work.js', component: lazy(() => import('./work')) },
  { id: 'documents', label: 'Documents', icon: '▭', section: 'product', hint: 'The 30 generated documents of phases 0–4', prototype: 'documents.js, docreader.js', component: lazy(() => import('./documents')) },
  { id: 'gates', label: 'Gates (sign-offs)', icon: '✓', section: 'product', hint: 'What blocks each phase sign-off', prototype: 'gates.js', component: lazy(() => import('./gates')) },
  { id: 'trace', label: 'Traceability', icon: '⇄', section: 'product', hint: 'Coverage rules: what traces to what', prototype: 'trace.js', component: lazy(() => import('./trace')) },
  { id: 'stories', label: 'Finish user stories', icon: '☑', section: 'expert', hint: 'Complete and approve each user story', prototype: 'stories.js', component: lazy(() => import('./stories')) },
  { id: 'files', label: 'Files', icon: '⎙', section: 'library', hint: 'Upload documents; the assistant reads them', prototype: 'files.js, fileviewer.js', component: lazy(() => import('./files')) },
  { id: 'competitors', label: 'Competitors', icon: '⚔', section: 'library', hint: 'Tiers, capability grid, prices, compare', prototype: 'cw_list.js, cw_compare.js, cw_profile.js', component: lazy(() => import('./competitors')) },
  { id: 'people', label: 'Who you need', icon: '☺', section: 'people', hint: 'Whose answer or sign-off is still missing', prototype: 'people.js', component: lazy(() => import('./people')) },
  { id: 'inbox', label: 'Review inbox', icon: '✓', section: 'people', hint: 'Check what the assistant proposed', prototype: 'inbox.js', count: 'inbox', component: lazy(() => import('./inbox')) },
  { id: 'approvals', label: 'Waiting for approval', icon: '⏳', section: 'people', hint: 'Approvals asked of someone', prototype: 'approvals_ui.js, approve.js', count: 'approvals', component: lazy(() => import('./approvals')) },
  { id: 'handoff', label: 'Hand over', icon: '↗', section: 'finish', hint: 'Send approved stories to developers', prototype: 'handoff.js', component: lazy(() => import('./handoff')) },
  { id: 'checks', label: 'Things to check', icon: '✔', section: 'expert', hint: 'Facts waiting for a second person', prototype: 'cw_checks.js', component: lazy(() => import('./checks')) },
  { id: 'review', label: 'Drafts to review', icon: '✓', section: 'expert', hint: 'Derived drafts waiting for a person', prototype: 'review.js', component: lazy(() => import('./review')) },
  { id: 'sheet', label: 'Quick answers', icon: '▦', section: 'expert', hint: 'The whole product on one page, with search', prototype: 'sheet.js', component: lazy(() => import('./sheet')) },
  { id: 'plan', label: 'All questions at a glance', icon: '☰', section: 'expert', hint: 'Every question the tool will ask', prototype: 'plan.js', component: lazy(() => import('./plan')) },
  { id: 'flows', label: 'Flows', icon: '⑂', section: 'expert', hint: 'View and edit flows and life cycles', prototype: 'flows.js, flowedit_ui.js', component: lazy(() => import('./flows')) },
  { id: 'existing', label: 'Existing system', icon: '▣', section: 'product', hint: 'Functions of the old system and what happens to each', prototype: 'existing.js', onlyMode: 'existing_system', component: lazy(() => import('./existing')) },
  { id: 'admin', label: 'History, import, export', icon: '⚙', section: 'expert', hint: 'Audit history, backups and settings', prototype: 'admin.js', component: lazy(() => import('./admin')) },
  { id: 'notes', label: 'Notes you left', icon: '✉', section: 'expert', hint: 'Notes about the tool itself', prototype: 'feedback.js', component: lazy(() => import('./notes')) },
  { id: 'demo', label: 'Sign-off walk-through', icon: '▶', section: 'expert', hint: 'Step through a sign-off on demo data', prototype: 'demo.js', component: lazy(() => import('./demo')) },
  { id: 'phase', label: 'Records by phase', icon: '≡', section: 'lifecycle', hint: 'Records and checks of one phase', prototype: 'workspace.js', component: lazy(() => import('./phase')) },
  { id: 'library', label: 'Documents and files', icon: '▭', section: 'expert', hint: 'The documents the tool writes and the files you upload, in one list', component: lazy(() => import('./library')) },
  { id: 'item', label: 'Record', icon: '▤', section: 'expert', hint: 'One record with its links and history', prototype: 'item.js', component: lazy(() => import('./item')) },
];

export const byId = (id: string) => FEATURES.find((f) => f.id === id || f.aliases?.includes(id));
export const inSection = (s: FeatureDef['section']) => FEATURES.filter((f) => f.section === s && f.id !== 'item' && f.id !== 'phase');
