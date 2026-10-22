/** A real Nest app around a fake persistence, for tests of the engine routes (older table and typed controllers). */
import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PersistenceService } from '../persistence.service';

export async function engineApp(p: object): Promise<{ base: string; close(): Promise<void> }> {
  // tests make many calls from one address: lift the per-address allowance unless the test sets its own
  process.env.LEGACY_READ_LIMIT = process.env.LEGACY_READ_LIMIT || '1000000';
  process.env.LEGACY_WRITE_LIMIT = process.env.LEGACY_WRITE_LIMIT || '1000000';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused';
  const { mountEngine, configureApp } = await import('../main');
  void configureApp;
  const { EngineModule } = await import('../engine/engine.module');
  @Global()
  @Module({ providers: [{ provide: PersistenceService, useValue: p }], exports: [PersistenceService] })
  class TestPersistence {}
  @Module({ imports: [TestPersistence, EngineModule] })
  class Root {}
  const app = await NestFactory.create<NestExpressApplication>(Root, { bodyParser: false, logger: false });
  mountEngine(app, p as PersistenceService);
  await app.listen(0);
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { base: `http://localhost:${port}`, close: () => app.close() };
}
