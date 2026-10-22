import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from './config/env';
import { EngineModule } from './engine/engine.module';
import { EnginePortModule } from './engine-port/engine-port.module';
import { HealthController } from './health.controller';
import { HomeModule } from './home/home.module';
import { IdeasModule } from './ideas/ideas.module';
import { MeController } from './me/me.controller';
import { ProductsModule } from './products/products.module';
import { ClientErrorsController, MetricsController } from './observability.controller';
import { PersistenceService } from './persistence.service';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: loadEnv().THROTTLE_LIMIT }]),
    EnginePortModule,
    IdeasModule,
    HomeModule,
    ProductsModule,
    EngineModule,
  ],
  controllers: [HealthController, MeController, MetricsController, ClientErrorsController],
  providers: [PersistenceService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
  exports: [PersistenceService],
})
export class AppModule {}
