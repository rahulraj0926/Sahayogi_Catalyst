import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Actor, rolesOf } from '../common/auth/actor';
import { MeDto } from './dto/me.dto';

@ApiTags('Me')
@Controller('me')
export class MeController {
  @Get()
  @ApiOkResponse({ type: MeDto, description: 'Who the API thinks you are (from X-Actor until login exists) and what you may do.' })
  me(@Actor() actor: string | null): MeDto {
    const roles = rolesOf(actor);
    return { actor, roles, canDecideIdeas: roles.includes('admin') };
  }
}
