import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { loadEnv } from './config/env';
import { newestBackup } from './db/backup-age';
import { PersistenceService } from './persistence.service';

/** Unversioned and outside /api so load balancers and Docker can probe them. */
@ApiExcludeController()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly p: PersistenceService) {}

  /** Backwards compatible summary. */
  @Get()
  health() { return { ok: true, products: this.p.portfolio.list().length }; }

  /** The process is up. */
  @Get('live')
  live() { return { status: 'ok' }; }

  /** The process can serve traffic: the database answers and the portfolio is loaded. */
  @Get('ready')
  async ready() {
    try {
      await this.p.repo.ping();
      if (!this.p.portfolio) throw new Error('portfolio not loaded');
      // the newest backup file: a warning to look at, never a reason to stop serving
      const b = newestBackup();
      const backup = b ? { ...b, stale: b.age_hours > loadEnv().BACKUP_MAX_AGE_HOURS } : { last_at: null, stale: true, note: 'no backup file found in BACKUP_DIR' };
      return { status: 'ready', products: this.p.portfolio.list().length, backup };
    } catch (e) {
      throw new ServiceUnavailableException({ code: 'not_ready', message: `Not ready: ${(e as Error).message}` });
    }
  }
}
