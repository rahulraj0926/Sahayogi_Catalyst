/* Writes docs/api/openapi.v1.json from the controllers (no database needed). Commit the file: its git history is the API history. */
import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unused';
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./main');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { preview: true, abortOnError: false, logger: false });
  configureApp(app);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const cfg = new DocumentBuilder().setTitle('Sahayogi Platform API').setDescription('Typed, versioned API under /api/v1, plus the older /api routes (deprecated) listed from the route table.').setVersion(pkg.version).addApiKey({ type: 'apiKey', name: 'X-Actor', in: 'header' }, 'actor').build();
  const { addLegacyPaths } = await import('./legacy-openapi');
  const { routes } = await import('./legacy/router');
  const doc = addLegacyPaths(SwaggerModule.createDocument(app, cfg), routes as any);
  const out = path.resolve(__dirname, '..', '..', '..', 'docs', 'api', 'openapi.v1.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${out}: ${Object.keys(doc.paths).length} paths`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
