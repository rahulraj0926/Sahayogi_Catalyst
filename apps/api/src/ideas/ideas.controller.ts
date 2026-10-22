import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles, RolesGuard } from '../common/auth/actor';
import { AcceptedIdeaDto, AcceptIdeaDto, IdeaDto, IdeaListDto, IdeaListQueryDto, RejectIdeaDto, SubmitIdeaDto } from './dto/ideas.dto';
import { cursorPage } from '../common/dto/cursor.dto';
import { IdeasService } from './ideas.service';
import type { IdeaStatus } from '../types/legacy';

@ApiTags('Ideas')
@ApiHeader({ name: 'X-Actor', required: false, description: 'Who is acting. Required for every change. Replaced by login in the auth step.' })
@Controller('ideas')
@UseGuards(RolesGuard)
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  @ApiOkResponse({ type: IdeaListDto, description: 'Ideas waiting for a decision (or the statuses asked for), newest first.' })
  list(@Query() q: IdeaListQueryDto): IdeaListDto {
    const all = this.ideas.list(q.status ? (q.status.split(',') as IdeaStatus[]) : undefined);
    const { rows, next } = cursorPage(all, (i) => `${i.created_on}|${i.id}`, q.limit, q.cursor);
    return { total: all.length, data: rows, next };
  }

  @Post()
  @Roles('member')
  @ApiOkResponse({ type: IdeaDto, description: 'The idea was added to the inbox.' })
  submit(@Body() dto: SubmitIdeaDto, @Actor() actor: string) { return this.ideas.submit(dto, actor); }

  @Post(':id/shortlist')
  @Roles('admin') @HttpCode(200)
  shortlist(@Param('id') id: string, @Actor() actor: string) { return this.ideas.shortlist(id, true, actor); }

  @Post(':id/unshortlist')
  @Roles('admin') @HttpCode(200)
  unshortlist(@Param('id') id: string, @Actor() actor: string) { return this.ideas.shortlist(id, false, actor); }

  @Post(':id/accept')
  @Roles('admin') @HttpCode(200)
  @ApiOkResponse({ type: AcceptedIdeaDto, description: 'The idea became a product at Phase 0.' })
  accept(@Param('id') id: string, @Body() dto: AcceptIdeaDto, @Actor() actor: string) { return this.ideas.accept(id, dto, actor); }

  @Post(':id/reject')
  @Roles('admin') @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RejectIdeaDto, @Actor() actor: string) { return this.ideas.reject(id, dto.reason, actor); }
}
