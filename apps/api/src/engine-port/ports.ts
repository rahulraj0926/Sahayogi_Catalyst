import type { AuditRecord, PortfolioLike } from '../types/legacy';

/** Where the typed modules get the engine portfolio from. Production: PersistenceService. Tests: a seeded in-memory portfolio. */
export abstract class PortfolioSource {
  abstract get(): PortfolioLike;
  /** Write pending engine changes to the database (no-op in tests). */
  abstract flush(): Promise<void>;
}

export interface ActivityEntry extends AuditRecord { seq: string; productId: string }

/** Cross-product audit trail, newest first. Production reads PostgreSQL (indexed), so it never loads every product. */
export abstract class ActivitySource {
  abstract recent(limit: number, before?: string): Promise<{ entries: ActivityEntry[]; next: string | null }>;
}
