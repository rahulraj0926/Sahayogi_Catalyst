import type { Item, Link, StoreData } from './types';

export declare class ValidationError extends Error {
  errors: string[];
  status: number;
  constructor(errors: string[], message?: string);
}

export declare function emptyData(): StoreData;

export declare class Store {
  data: StoreData;
  filePath: string | null;

  constructor(data?: StoreData, filePath?: string | null);
  static fresh(): Store;
  static load(filePath: string): Store;
  static validateData(d: unknown): string[];

  now(): string;
  today(): string;
  save(): boolean;
  replaceData(data: StoreData): void;
  nextId(prefix: string): string;
  audit(action: string, subject: string | null, summary: string, extra?: Record<string, unknown>): void;

  get(id: string): Item | null;
  has(id: string): boolean;
  all(): Item[];
  list(type: string, pred?: (item: Item) => boolean): Item[];
  product(): Item | null;
  getType(id: string): string | null;

  create(
    type: string,
    fields?: Record<string, unknown>,
    opts?: { actor?: string | null; origin?: string; subtype?: string; id?: string; strict?: boolean; silent?: boolean },
  ): Item;
  update(
    id: string,
    patch: Record<string, unknown>,
    opts?: { actor?: string | null; reviewed?: boolean; strict?: boolean; silent?: boolean },
  ): Item;
  setStatus(id: string, status: string, opts?: { actor?: string | null; silent?: boolean }): Item;
  remove(id: string, opts?: { actor?: string | null }): number;

  links(): Link[];
  linkById(id: string): Link | null;
  linksOf(id: string): Link[];
  out(id: string, type?: string): Link[];
  inn(id: string, type?: string): Link[];
  link(
    type: string,
    source: string,
    target: string,
    attrs?: Record<string, unknown>,
    opts?: { actor?: string | null; silent?: boolean },
  ): Link;
  unlink(id: string, opts?: { actor?: string | null }): Link;
  ensureLink(
    type: string,
    source: string,
    target: string,
    attrs?: Record<string, unknown>,
    opts?: { actor?: string | null; silent?: boolean },
  ): Link;

  exportData(): StoreData;
}
