import { Module } from '@nestjs/common';
import { IdeasModule } from '../ideas/ideas.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({ imports: [IdeasModule], controllers: [HomeController], providers: [HomeService], exports: [HomeService] })
export class HomeModule {}
