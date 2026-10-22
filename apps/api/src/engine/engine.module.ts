import { Module } from '@nestjs/common';
import { ENGINE_CONTROLLERS } from './controllers';
import { EngineInterceptor } from './engine.interceptor';

/** The typed controllers of the lifecycle engine (F13). Each area moves here from legacy/routes/. */
@Module({ controllers: ENGINE_CONTROLLERS, providers: [EngineInterceptor] })
export class EngineModule {}
