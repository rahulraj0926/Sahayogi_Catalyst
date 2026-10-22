import { Injectable } from '@nestjs/common';
import { PersistenceService } from '../persistence.service';
import type { PortfolioLike } from '../types/legacy';
import { ActivityEntry, ActivitySource, PortfolioSource } from './ports';

@Injectable()
export class PersistencePortfolioSource extends PortfolioSource {
  constructor(private readonly p: PersistenceService) { super(); }
  get(): PortfolioLike { return this.p.portfolio as PortfolioLike; }
  flush() { return this.p.flush(); }
}

@Injectable()
export class PgActivitySource extends ActivitySource {
  constructor(private readonly p: PersistenceService) { super(); }

  async recent(limit: number, before?: string): Promise<{ entries: ActivityEntry[]; next: string | null }> {
    const res = before
      ? await this.p.repo.pool.query('SELECT seq, product_id, at, action, subject, summary, actor FROM audit_log WHERE seq < $1 ORDER BY seq DESC LIMIT $2', [before, limit + 1])
      : await this.p.repo.pool.query('SELECT seq, product_id, at, action, subject, summary, actor FROM audit_log ORDER BY seq DESC LIMIT $1', [limit + 1]);
    const rows = res.rows;
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      entries: page.map((r) => ({ seq: String(r.seq), productId: r.product_id, at: r.at instanceof Date ? r.at.toISOString() : String(r.at), action: r.action, subject: r.subject, summary: r.summary, actor: r.actor })),
      next: more ? String(page[page.length - 1].seq) : null,
    };
  }
}
