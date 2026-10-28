import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles, RolesGuard } from '../common/auth/actor';
import { AcceptedIdeaDto, AcceptIdeaDto, AddCompetitorDto, IdeaCompetitorDto, IdeaDto, IdeaListDto, IdeaListQueryDto, RejectIdeaDto, SubmitIdeaDto, UpdateInnovationDto } from './dto/ideas.dto';
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
  @ApiOkResponse({ type: IdeaListDto, description: 'Ideas waiting for the CEO (or the statuses asked for), newest first. Drafts still in innovation only show with ?status=innovation.' })
  list(@Query() q: IdeaListQueryDto): IdeaListDto {
    const all = this.ideas.list(q.status ? (q.status.split(',') as IdeaStatus[]) : undefined);
    const { rows, next } = cursorPage(all, (i) => `${i.created_on}|${i.id}`, q.limit, q.cursor);
    return { total: all.length, data: rows, next };
  }

  @Post()
  @Roles('member')
  @ApiOkResponse({ type: IdeaDto, description: 'The idea was added. With draft: true it starts in innovation; otherwise it is in the CEO\'s inbox.' })
  submit(@Body() dto: SubmitIdeaDto, @Actor() actor: string) { return this.ideas.submit(dto, actor); }

  @Get(':id')
  @ApiOkResponse({ type: IdeaDto, description: 'One idea with its innovation case: problem, who it is for, competitors and, in innovation, what is still missing.' })
  get(@Param('id') id: string): IdeaDto { return this.ideas.get(id); }

  @Patch(':id/innovation')
  @Roles('member')
  @ApiOkResponse({ type: IdeaDto, description: 'The draft was updated. Only the person who pitched it can do this, and only while it is in innovation.' })
  updateInnovation(@Param('id') id: string, @Body() dto: UpdateInnovationDto, @Actor() actor: string) { return this.ideas.updateInnovation(id, dto, actor); }

  @Post(':id/competitors')
  @Roles('member')
  @ApiCreatedResponse({ type: IdeaCompetitorDto, description: 'The competitor was added after its website answered. Not kept when the site cannot be opened (422 competitor_unreachable), is not a public address (422 competitor_unsafe_address), is listed already (409) or the list is full (422 too_many_competitors).' })
  addCompetitor(@Param('id') id: string, @Body() dto: AddCompetitorDto, @Actor() actor: string) { return this.ideas.addCompetitor(id, dto, actor); }

  @Delete(':id/competitors/:competitorId')
  @Roles('member')
  @ApiOkResponse({ type: IdeaDto, description: 'The competitor was removed; the idea as it is now.' })
  removeCompetitor(@Param('id') id: string, @Param('competitorId') competitorId: string, @Actor() actor: string) { return this.ideas.removeCompetitor(id, competitorId, actor); }

  @Post(':id/send')
  @Roles('member') @HttpCode(200)
  @ApiOkResponse({ type: IdeaDto, description: 'The idea left innovation and now waits for the CEO. 422 innovation_not_ready (with details.door) while something is missing.' })
  send(@Param('id') id: string, @Actor() actor: string) { return this.ideas.send(id, actor); }

  @Post(':id/shortlist')
  @Roles('admin') @HttpCode(200)
  shortlist(@Param('id') id: string, @Actor() actor: string) { return this.ideas.shortlist(id, true, actor); }

  @Post(':id/unshortlist')
  @Roles('admin') @HttpCode(200)
  unshortlist(@Param('id') id: string, @Actor() actor: string) { return this.ideas.shortlist(id, false, actor); }

  @Post(':id/accept')
  @Roles('admin') @HttpCode(200)
  @ApiOkResponse({ type: AcceptedIdeaDto, description: 'The idea became a product at Phase 0. Its problem, who it is for and the rivals checked come across into the intake brief.' })
  accept(@Param('id') id: string, @Body() dto: AcceptIdeaDto, @Actor() actor: string) { return this.ideas.accept(id, dto, actor); }

  @Post(':id/reject')
  @Roles('admin') @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: RejectIdeaDto, @Actor() actor: string) { return this.ideas.reject(id, dto.reason, actor); }
}
