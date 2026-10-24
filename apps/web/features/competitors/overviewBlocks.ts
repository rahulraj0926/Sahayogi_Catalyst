/**
 * What the competitor overview shows. Every row is either a field someone typed in, or worked out from the plans,
 * files and notes already saved. Rows with nothing in them are left out, so the page has no empty lines.
 *
 * Naming rule: a heading names what the block holds (a noun), a row label is one or two plain nouns, and the same
 * word is used when the field is edited. Written up in docs/COMPETITOR_OVERVIEW.md.
 */
export type Row = {
  id: string;
  label: string;
  /** the competitor field this row reads from and saves to, so it can be edited here */
  key?: string;
};
export type BlockDef = { id: string; title: string; /** one line under the title saying what the card holds */ sub?: string; rows: Row[] };

/** The two sides of the head-to-head card at the top: what they do well, and where we can beat them. */
export const SIDES = [
  { key: 'strengths', title: 'Strengths', one: 'strength', tone: 'var(--status-healthy-fg)' },
  { key: 'weaknesses', title: 'Weaknesses', one: 'weakness', tone: 'var(--status-warning-fg)' },
] as const;

export const BLOCKS: BlockDef[] = [
  { id: 'customers', title: 'Customers & market', sub: 'Target segments and public references', rows: [
    { id: 'customer_size', label: 'Customer size', key: 'customer_size' },
    { id: 'target_market', label: 'Target market', key: 'target_market' },
    { id: 'target_customers', label: 'Target customers', key: 'target_customers' },
    { id: 'segment_overlap', label: 'Shared with us', key: 'segment_overlap' },
    { id: 'key_customers', label: 'Known customers', key: 'key_customers' },
    { id: 'gtm_channels', label: 'Sales channels', key: 'gtm_channels' },
  ] },
  { id: 'company', title: 'Company details', sub: 'Identity and verification', rows: [
    { id: 'website', label: 'Website', key: 'website' },
    { id: 'legal_name', label: 'Legal name', key: 'legal_name' },
    { id: 'products', label: 'Products' },
    { id: 'kind', label: 'Type' },
    { id: 'founded_year', label: 'Founded', key: 'founded_year' },
    { id: 'hq_country', label: 'Head office', key: 'hq_country' },
    { id: 'size_band', label: 'Team size', key: 'size_band' },
    { id: 'ownership', label: 'Ownership', key: 'ownership' },
    { id: 'funding_summary', label: 'Funding', key: 'funding_summary' },
  ] },
];

/** The threat level suggested by how close the competitor is (tier) and how much its customers overlap with ours. Undefined when neither is set. */
export function suggestThreat(tier?: string, overlap?: string): 'High' | 'Medium' | 'Low' | undefined {
  if (!tier && !overlap) return undefined;
  if (overlap === 'high' || (tier === 'T1' && overlap !== 'low' && overlap !== 'none')) return 'High';
  if (overlap === 'medium' || tier === 'T2') return 'Medium';
  return 'Low';
}
