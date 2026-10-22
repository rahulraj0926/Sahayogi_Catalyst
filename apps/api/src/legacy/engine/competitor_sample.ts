/**
 * engine/competitor_sample.ts - demo competitors for trying the dashboard out (POST /api/competitors/sample).
 *
 * Nine FICTIONAL companies (invented names, invented prices) with three plans each and 17 features, shaped so that the competitor
 * dashboard has something in every group: a few features nearly everyone offers (must-have), some that about half offer (common), and some that few offer.
 * It goes through the same importer as a file, so saving it twice changes nothing.
 */
import { importCompetitors, EXPORT_HEADERS } from './competitor_import';

export const SAMPLE_FEATURES = [
  'Requirement records', 'Traceability matrix', 'Phase sign-off gates', 'Document generation', 'Evidence library', 'Change impact alerts',
  'Roadmap view', 'Feedback board', 'Review comments', 'Approval workflow', 'Audit history', 'User story export',
  'Role-based access', 'Jira integration', 'Reports and dashboards', 'Competitor tracking', 'AI assistant',
];

/** name, tier, feature numbers of its best plan, price per user per month of [entry plan, top plan] in rupees */
const SAMPLE: [string, string, number[], [number, number]][] = [
  ['Boardly', 'Tier 1', [0, 8, 14, 6, 7, 9, 10, 12, 13, 1, 16], [499, 1499]],
  ['Plannova', 'Tier 1', [0, 8, 14, 6, 7, 9, 12, 13, 11, 16], [399, 1299]],
  ['Specwise', 'Tier 2', [0, 8, 14, 1, 9, 10, 12, 13, 11, 3], [299, 899]],
  ['SpecForge', 'Tier 2', [0, 8, 14, 6, 12, 13, 3, 5], [349, 999]],
  ['Trailmark', 'Tier 2', [0, 8, 14, 1, 4, 10, 12, 5, 6], [450, 1100]],
  ['Docuflow', 'Tier 3', [0, 8, 14, 9, 10, 4, 2], [199, 649]],
  ['NoteStack', 'Tier 3', [0, 14, 6, 7, 12, 16], [149, 499]],
  ['Sheetwise', 'Tier 3', [0, 8, 14, 7, 13, 15], [199, 549]],
  ['TrackerLite', 'Tier 3', [0, 8, 14, 15, 6, 9], [99, 399]],
];

export function sampleCsv(): string {
  const rows: string[][] = [EXPORT_HEADERS];
  for (const [name, tier, feats, [entry, top]] of SAMPLE) {
    const cut = (share: number) => feats.slice(0, Math.max(2, Math.round(feats.length * share))).map((i) => SAMPLE_FEATURES[i]).join('; ');
    const plans: [string, string, string, number, string][] = [
      ['Starter', 'free', '5', 0, cut(0.3)],
      ['Team', 'entry', '', entry, cut(0.7)],
      ['Business', 'top', '', top, cut(1)],
    ];
    plans.forEach(([plan, level, max, monthly, f], i) => rows.push([
      name, i === 0 ? tier : '', '', '', plan, level, 'per user', max,
      String(monthly), '', monthly ? String(Math.round(monthly * 12 * 0.85)) : '0', '', 'INR', 'no', f,
    ]));
  }
  const q = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

/** Saves the demo companies into this product (or only checks, with commit false). */
export function importSample(store, o: { commit: boolean; actor?: string }) {
  return importCompetitors(store, { filename: 'sample-competitors.csv', buffer: Buffer.from(sampleCsv(), 'utf-8') }, { commit: o.commit, createFeatures: true, actor: o.actor });
}
