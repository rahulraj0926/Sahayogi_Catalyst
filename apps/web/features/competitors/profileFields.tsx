'use client';
/** The competitor details people can type in, with their labels and how each is shown and edited. Used by the profile and its overview. */
import { Badge } from '@/components/ui';

export const filled = (v: any) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

export type FD = { kind: 'text' | 'longtext' | 'enum' | 'list' | 'multi' | 'number'; label: string; options?: [string, string][] };
export const OVERLAP: [string, string][] = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
export const CUSTOMER_SIZES = ['Individuals', 'Small business', 'Mid-size companies', 'Large companies'];
export const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5000+'];
export const OWN: [string, string][] = [['private', 'Private'], ['public', 'Listed company'], ['subsidiary', 'Part of a bigger group'], ['state', 'State owned'], ['unknown', 'Not known']];
export const F: Record<string, FD> = {
  tier: { kind: 'enum', label: 'Tier', options: [['T1', 'Tier 1: head to head'], ['T2', 'Tier 2: nearby'], ['T3', 'Tier 3: watch'], ['S', 'Substitute or alternative']] },
  website: { kind: 'text', label: 'Website' }, legal_name: { kind: 'text', label: 'Legal name' },
  positioning: { kind: 'longtext', label: 'How they position themselves' }, target_customers: { kind: 'longtext', label: 'Target customers' }, customer_size: { kind: 'multi', label: 'Customer size', options: CUSTOMER_SIZES.map((x) => [x, x]) }, target_market: { kind: 'list', label: 'Target market' },
  segment_overlap: { kind: 'enum', label: 'Shared customers', options: OVERLAP },
  strengths: { kind: 'longtext', label: 'Strengths' }, weaknesses: { kind: 'longtext', label: 'Weaknesses' },
  gtm_channels: { kind: 'list', label: 'Sales channels' }, technology_notes: { kind: 'longtext', label: 'Technology notes' },
  certifications: { kind: 'list', label: 'Certifications' }, key_customers: { kind: 'list', label: 'Known customers' },
  founded_year: { kind: 'number', label: 'Founded' }, hq_country: { kind: 'text', label: 'Head office' },
  size_band: { kind: 'enum', label: 'Team size', options: SIZES.map((s) => [s, `${s} people`]) }, headcount_note: { kind: 'text', label: 'Size note' },
  funding_summary: { kind: 'longtext', label: 'Funding' }, ownership: { kind: 'enum', label: 'Ownership', options: OWN },
  pricing_na_reason: { kind: 'longtext', label: 'Why there is no price' },
  scopes: { kind: 'list', label: 'Competes with (part of our product)' },
};

export function Control({ d, value, onChange }: { d: FD; value: any; onChange: (v: any) => void }) {
  if (d.kind === 'enum') return <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Not filled in</option>{d.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  if (d.kind === 'multi') {
    const on: string[] = Array.isArray(value) ? value : [];
    return <div className="flex flex-wrap gap-x-4 gap-y-1">{d.options!.map(([v, l]) => <label key={v} className="inline-flex cursor-pointer items-center gap-1.5 text-[14px]"><input type="checkbox" checked={on.includes(v)} onChange={(e) => onChange(e.target.checked ? [...on, v] : on.filter((x) => x !== v))} />{l}</label>)}</div>;
  }
  if (d.kind === 'longtext') return <textarea rows={3} style={{ width: '100%' }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (d.kind === 'list') return <input type="text" style={{ width: '100%' }} value={Array.isArray(value) ? value.join(', ') : value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="separate with commas, for example India, Retail" />;
  if (d.kind === 'number') return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  return <input type="text" style={{ width: '100%' }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}
export const norm = (d: FD, v: any) => (d.kind === 'multi' ? (Array.isArray(v) && v.length ? v : '') : d.kind === 'number' ? (v === '' || v === undefined ? '' : Number(v)) : d.kind === 'list' ? (Array.isArray(v) ? v : String(v ?? '').trim() ? String(v).split(/[;,]/).map((s) => s.trim()).filter(Boolean) : '') : typeof v === 'string' ? v.trim() : v);
export const show = (k: string, v: any) => {
  if (!filled(v)) return <dd className="muted">Not filled in yet</dd>;
  const d = F[k];
  if (d?.kind === 'enum') return <dd>{d.options!.find(([x]) => x === v)?.[1] ?? String(v)}</dd>;
  if (k === 'website') return <dd><a href={/^https?:/.test(v) ? v : `https://${v}`} target="_blank" rel="noopener noreferrer">{v}</a></dd>;
  if (Array.isArray(v)) return <dd>{v.map((x) => <Badge key={x}>{x}</Badge>)}</dd>;
  return <dd>{String(v)}</dd>;
};

