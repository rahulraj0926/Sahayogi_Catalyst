import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddMemberDto {
  /** The person's name, as it should be shown. */
  @IsString() name!: string;
  /** Optional email address. */
  @IsOptional() @IsString() email?: string;
  /** Owner, Lead, Contributor, Reviewer or Viewer (the default is Contributor). */
  @IsOptional() @IsString() role?: string;
  /** Where the person is added: the whole platform, one project, or one phase of a project. */
  @IsIn(['platform', 'project', 'phase']) scope!: 'platform' | 'project' | 'phase';
  /** The product id (such as PRD-001). Needed for "project" and "phase". */
  @IsOptional() @IsString() product_id?: string;
  /** The phase number, 0 to 12. Needed for "phase". */
  @IsOptional() @IsInt() @Min(0) @Max(12) phase?: number;
}

export class MemberRoleDto {
  /** Owner, Lead, Contributor, Reviewer or Viewer. */
  @IsString() role!: string;
}
