import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { loadEnv } from './config/env';
import { oldAddressFallback } from './engine/old-address';
import { idempotency } from './common/middleware/idempotency';
import { addLegacyPaths } from './legacy-openapi';
import { routes as legacyRoutes } from './legacy/router';
import { PersistenceService } from './persistence.service';
import { makeLogger } from './common/logging/json-logger';

export const API_PREFIX = 'api/v1';

/** Everything that is the same in production and in tests. */
export function configureApp(app: NestExpressApplication) {
  const env = loadEnv();
  const rid = new RequestIdMiddleware();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  app.use(rid.use.bind(rid));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: env.WEB_ORIGIN.split(','), credentials: true, exposedHeaders: ['X-Product', 'X-Request-Id', 'Content-Disposition'] });
  app.use(oldAddressFallback()); // routes that moved into typed controllers: /api/people -> /api/v1/people (deprecated address)
  // the web app asks who is signed in; there is no login yet, so the answer is always "nobody, none needed" (kept at both addresses)
  app.use(['/api/auth/me', `/${API_PREFIX}/auth/me`], (req: Request, res: Response, next: NextFunction) => (req.method === 'GET' ? void res.set('Cache-Control', 'no-store').json({ required: false, setup_needed: false, user: null }) : next()));
  // JSON bodies for the typed API only; the legacy bridge reads its own bodies (it also handles file uploads).
  // (the file upload reads its own bytes, whatever the file's type is, so the JSON parser must not touch it)
  const jsonBody = json({ limit: '1mb' });
  app.use(`/${API_PREFIX}`, (req: Request, res: Response, next: NextFunction) => (req.method === 'POST' && req.path === '/attachments' ? next() : jsonBody(req, res, next)));
  app.use(`/${API_PREFIX}`, (err: { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    const statusCode = err.status && err.status < 500 ? err.status : 400;
    res.status(statusCode).json({ code: err.type === 'entity.too.large' ? 'payload_too_large' : 'invalid_json', message: err.type === 'entity.too.large' ? 'The request body is too large.' : 'The request body is not valid JSON.', requestId: req.id, statusCode });
  });
  // F16: answers are revalidated with ETag / If-None-Match (Express adds the ETag; this makes browsers and proxies ask again before reuse)
  app.use(`/${API_PREFIX}`, (req: Request, res: Response, next: NextFunction) => { if (req.method === 'GET') res.setHeader('Cache-Control', 'private, no-cache'); next(); });
  app.use(`/${API_PREFIX}`, idempotency()); // F17
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/live', 'health/ready', 'metrics'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
}

export function setupSwagger(app: NestExpressApplication) {
  const cfg = new DocumentBuilder()
    .setTitle('Sahayogi Catalyst API')
    .setDescription('Typed, versioned API. Everything under /api/v1. Every route of the lifecycle engine is served here too (/api/v1/items, /api/v1/gates ...); the same routes at their old addresses (/api/items ...) still work but are deprecated and stop on the Sunset date (see the Sunset header). Every GET answer has an ETag (send it back as If-None-Match to get 304). Send an Idempotency-Key header (8-100 characters) on a POST, PUT, PATCH or DELETE to make a retry safe: the first answer is replayed with Idempotent-Replayed: true. Lists that grow use a cursor: pass the answer\'s next as cursor. Changes are listed in docs/api/CHANGELOG.md.')
    .setVersion(process.env.npm_package_version || '1.0.0')
    .addApiKey({ type: 'apiKey', name: 'X-Actor', in: 'header' }, 'actor')
    .build();
  SwaggerModule.setup('api/docs', app, addLegacyPaths(SwaggerModule.createDocument(app, cfg), legacyRoutes as any), { jsonDocumentUrl: 'api/docs-json' });
}

/** The lifecycle engine's routes are typed controllers (src/engine/controllers). The /api addresses from before /api/v1 are sent to them by oldAddressFallback, with deprecation headers. */
export function mountEngine(app: NestExpressApplication, _persistence?: PersistenceService) {
  configureApp(app);
}

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: makeLogger() });
  const persistence = app.get(PersistenceService);
  mountEngine(app, persistence);
  if (env.NODE_ENV !== 'production' || env.SWAGGER === '1') setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger('bootstrap').log(`Sahayogi API on http://localhost:${env.PORT}  (${persistence.portfolio.list().length} products)  docs: /api/docs`);
}

if (require.main === module) bootstrap().catch((e) => { console.error(e); process.exit(1); });
