import { Module } from '@nestjs/common';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { SafeUrlChecker, UrlChecker } from './url-checker';

@Module({ controllers: [IdeasController], providers: [IdeasService, { provide: UrlChecker, useClass: SafeUrlChecker }], exports: [IdeasService] })
export class IdeasModule {}
