import { Global, Module } from '@nestjs/common';
import { PersistencePortfolioSource, PgActivitySource } from './persistence.adapters';
import { ActivitySource, PortfolioSource } from './ports';

/** Binds the abstract engine ports to the PostgreSQL-backed implementations. Tests bind in-memory ones instead. */
@Global()
@Module({
  providers: [
    { provide: PortfolioSource, useClass: PersistencePortfolioSource },
    { provide: ActivitySource, useClass: PgActivitySource },
  ],
  exports: [PortfolioSource, ActivitySource],
})
export class EnginePortModule {}
