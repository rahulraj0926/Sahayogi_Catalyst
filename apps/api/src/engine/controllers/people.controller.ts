import { Body, Get, Headers, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AddPersonDto } from './dto/people.dto';
import { Ctx, EngineController, EngineCtx, EngineRoute } from '../engine.decorators';
import * as people from '../../legacy/engine/people';

@EngineController('people', 'People')
export class PeopleController {
  @Get() @EngineRoute({ optionalProduct: true })
  list(@Ctx() c: EngineCtx, @Headers('x-me') me?: string) {
    return { people: people.list(c.store, c.actor, me), categories: people.CATEGORIES, role_words: people.ROLE_WORD };
  }

  @Post() @EngineRoute({ optionalProduct: true })
  @ApiOperation({ summary: 'Add a person' })
  add(@Ctx() c: EngineCtx, @Body() dto: AddPersonDto, @Headers('x-me') me?: string) {
    return people.add(c.store, { ...dto, __me: me }, c.actor);
  }
}
