/* F20: structured logs, /metrics, backup freshness and browser-error reports. No database needed. Run: npm run test:unit -w apps/api */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JsonLogger, oneLine } from '../common/logging/json-logger';
import { Metrics } from '../common/metrics/metrics';
import { newestBackup } from '../db/backup-age';
import { PersistenceService } from '../persistence.service';
import { done, ok } from './helpers';

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused';

  await ok('json logs: one object per line with time, level, context and the fields; errors carry the stack', () => {
    const lines: string[] = [];
    const log = new JsonLogger((l) => lines.push(l));
    log.log({ msg: 'request', requestId: 'abc', status: 200 }, 'http');
    log.error('boom', 'Error: boom\n at x', 'errors');
    const a = JSON.parse(lines[0]), b = JSON.parse(lines[1]);
    assert.equal(a.level, 'info'); assert.equal(a.context, 'http'); assert.equal(a.requestId, 'abc'); assert.ok(a.time);
    assert.equal(b.level, 'error'); assert.equal(b.msg, 'boom'); assert.match(b.stack, /at x/); assert.equal(b.context, 'errors');
  });

  await ok('a caller cannot forge a second log line with line breaks', () => {
    assert.equal(oneLine('hello\nFAKE {"level":"info"}\r\n'), 'hello FAKE {"level":"info"} ');
  });

  await ok('metrics: counters, histogram and gauges print in the Prometheus text format; labels are escaped', () => {
    const m = new Metrics();
    m.inc('t_total', { route: '/a"b', status: 200 }); m.inc('t_total', { route: '/a"b', status: 200 });
    m.observe('t_seconds', { route: '/a' }, 0.03);
    m.gauge('t_up', 'up', () => 1);
    const text = m.render();
    assert.match(text, /# TYPE t_total counter/);
    assert.match(text, /t_total\{route="\/a\\"b",status="200"\} 2/);
    assert.match(text, /t_seconds_bucket\{le="0.025",route="\/a"\} 0/);
    assert.match(text, /t_seconds_bucket\{le="0.05",route="\/a"\} 1/);
    assert.match(text, /t_seconds_bucket\{le="\+Inf",route="\/a"\} 1/);
    assert.match(text, /t_up 1/);
  });

  await ok('newest backup: finds the latest sahayogi-*.ndjson.gz and its age; none gives null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-bk-'));
    assert.equal(newestBackup(dir), null);
    fs.writeFileSync(path.join(dir, 'sahayogi-20260101-000000.ndjson.gz'), 'x');
    fs.writeFileSync(path.join(dir, 'other.txt'), 'x');
    const old = new Date(Date.now() - 50 * 3600_000); fs.utimesSync(path.join(dir, 'sahayogi-20260101-000000.ndjson.gz'), old, old);
    const b = newestBackup(dir)!;
    assert.ok(b.age_hours >= 49.9 && b.age_hours <= 50.1, String(b.age_hours));
    assert.equal(newestBackup(path.join(dir, 'missing')), null);
  });

  // a small real app with the two controllers and the request middleware
  const { MetricsController, ClientErrorsController } = await import('../observability.controller');
  const { configureApp } = await import('../main');
  const p: any = { portfolio: { list: () => [1, 2, 3] }, repo: { ping: async () => undefined } };
  @Global() @Module({ providers: [{ provide: PersistenceService, useValue: p }], exports: [PersistenceService] }) class TestPersistence {}
  @Module({ imports: [TestPersistence], controllers: [MetricsController, ClientErrorsController] }) class Root {}
  const app = await NestFactory.create<NestExpressApplication>(Root, { bodyParser: false, logger: false });
  configureApp(app);
  await app.listen(0);
  const base = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
  try {
    await ok('/metrics: counts requests by route (ids taken out), errors by code, and shows the database and product gauges', async () => {
      await fetch(base + '/api/v1/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'bad\nthing', source: 'error-page' }) });
      await fetch(base + '/api/v1/nothing-here/PRD-12');
      const r = await fetch(base + '/metrics');
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type') || '', /text\/plain/);
      const t = await r.text();
      assert.match(t, /sahayogi_http_requests_total\{method="POST",route="\/api\/v1\/client-errors",status="204"\} 1/);
      assert.match(t, /sahayogi_http_requests_total\{method="GET",route="\/api\/v1\/nothing-here\/:id",status="404"\} 1/);
      assert.match(t, /sahayogi_errors_total\{code="not_found",status="404"\} 1/);
      assert.match(t, /sahayogi_client_errors_total\{source="error-page"\} 1/);
      assert.match(t, /sahayogi_db_up 1/); assert.match(t, /sahayogi_products 3/);
    });

    await ok('browser error reports: 204 with no body; an unknown field or a missing message is refused with the single error envelope', async () => {
      const post = (b: unknown) => fetch(base + '/api/v1/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      const good = await post({ message: 'x is not a function', stack: 's', url: '/products/PRD-001', request_id: 'r1' });
      assert.equal(good.status, 204);
      const bad = await post({ message: 'x', extra: 1 });
      assert.equal(bad.status, 400); assert.equal((await bad.json()).code, 'validation_failed');
      assert.equal((await post({})).status, 400);
    });

    await ok('/metrics with METRICS_TOKEN set needs the bearer token; in production it is off (404) until a token is set', async () => {
      process.env.METRICS_TOKEN = 'a-long-enough-token-1';
      assert.equal((await fetch(base + '/metrics')).status, 401);
      assert.equal((await fetch(base + '/metrics', { headers: { authorization: 'Bearer wrong-token-wrong' } })).status, 401);
      assert.equal((await fetch(base + '/metrics', { headers: { authorization: 'Bearer a-long-enough-token-1' } })).status, 200);
      delete process.env.METRICS_TOKEN;
      const nodeEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
      try { assert.equal((await fetch(base + '/metrics')).status, 404); } finally { process.env.NODE_ENV = nodeEnv; }
    });
  } finally { await app.close(); }
  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
