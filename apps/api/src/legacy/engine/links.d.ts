import type { Link, LinkDef, LinkDescribe } from './types';

export declare const LINKS: LinkDef[];
export declare const LINK_MAP: Record<string, LinkDef>;
export declare const SETS: Record<string, string[]>;
export declare const TYPES_COUNT: number;

/** Context required to validate a would-be link; satisfied by `Store`. */
export interface LinkValidationCtx {
  getType(id: string): string | null;
  linksOf(id: string): Link[];
}

export declare function validateLink(
  ctx: LinkValidationCtx,
  type: string,
  source: string,
  target: string,
  attrs?: Record<string, unknown>,
): string[];
export declare function describe(): LinkDescribe[];
export declare function ends(link: Link): Array<{ driver: string; dependent: string }>;
export declare function virtualType(id: string): 'Gate' | 'FlowEdge' | null;
