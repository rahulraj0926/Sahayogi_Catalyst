import { Body, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as members from '../../legacy/engine/members';
import { AddMemberDto, MemberRoleDto } from './dto/members.dto';

/** Who is on the team: on the whole platform, on one project, or on one phase of a project. One list per install. Changing it needs an administrator. */
@EngineController('members', 'Members')
export class MembersController {
  @Get() @EngineRoute({ noProduct: true })
  list(@Ctx() c: EngineCtx, @Query('project') project?: string, @Query('scope') scope?: string) {
    return members.list(c.portfolio, { project, scope });
  }

  @Post() @EngineRoute({ noProduct: true, mutating: true, admin: true })
  add(@Ctx() c: EngineCtx, @Body() dto: AddMemberDto) {
    return { member: members.add(c.portfolio, dto, c.actor, c.portfolio.now()) };
  }

  @Post(':id/role') @EngineRoute({ noProduct: true, mutating: true, admin: true })
  role(@Ctx() c: EngineCtx, @Param('id') id: string, @Body() dto: MemberRoleDto) {
    return { member: members.setRole(c.portfolio, id, dto.role, c.actor) };
  }

  @Delete(':id') @EngineRoute({ noProduct: true, mutating: true, admin: true })
  remove(@Ctx() c: EngineCtx, @Param('id') id: string) {
    return { removed: members.remove(c.portfolio, id) };
  }
}
