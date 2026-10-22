import type { ComponentType } from 'react';

/** Props every product screen receives from the router. */
export interface FeatureProps {
  /** product id, e.g. PRD-003 */
  pid: string;
  /** path after the feature id: /products/PRD-003/stories/STY-001 -> ['STY-001'] */
  args: string[];
  /** query string, e.g. ?tab=accepted */
  query: URLSearchParams;
}

export type Section = 'product' | 'library' | 'people' | 'finish' | 'lifecycle' | 'expert';

/** One screen of the product. Add a feature = add a folder + one entry in registry.ts. */
export interface FeatureDef {
  /** url segment: /products/:pid/<id>/... */
  id: string;
  label: string;
  icon: string;
  section: Section;
  /** one line used on the features list and in the sidebar tooltip */
  hint: string;
  /** which prototype page it replaces (for Claude Code to compare against) */
  prototype?: string;
  /** shows a live count badge in the sidebar: 'inbox' | 'approvals' */
  count?: 'inbox' | 'approvals';
  /** show in the sidebar only for products of this mode (the page still opens for any product) */
  onlyMode?: 'existing_system';
  /** extra url ids that open this same feature (old links) */
  aliases?: string[];
  component: ComponentType<FeatureProps>;
}
