import type { Item, ItemTypeDef, FieldDef, SchemaDescribe } from './types';

export declare const ENUMS: Record<string, readonly (string | number)[]>;
export declare const TYPES: Record<string, ItemTypeDef>;
export declare const TERMINAL_STATUSES: ReadonlySet<string>;
export declare const APPROVED_LIKE: ReadonlySet<string>;
export declare const DOC_STATUSES: readonly string[];
export declare const PREFIX_TO_TYPE: Record<string, string>;

export declare function idPrefix(type: string, subtype?: string): string;
export declare function typeOfId(id: string | null | undefined): string | null;
export declare function fieldsFor(type: string, subtype?: string): FieldDef[];
export declare function requiredFor(type: string, subtype?: string): string[];
export declare function isEmpty(v: unknown): boolean;
export declare function validateItem(item: Item, opts?: { strictRequired?: boolean }): string[];
export declare function describe(): SchemaDescribe;
