import type { Role } from '../../common/auth/actor';

export class MeDto {
  actor!: string | null;
  roles!: Role[];
  /** The screens use this to show or hide the accept / reject buttons. */
  canDecideIdeas!: boolean;
}
