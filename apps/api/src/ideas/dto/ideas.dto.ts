import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CursorQueryDto } from '../../common/dto/cursor.dto';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SubmitIdeaDto {
  /** The idea in one line. */
  @Transform(trim) @IsString() @Length(3, 200)
  one_liner!: string;

  /** Optional longer description. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000)
  text?: string;

  @IsOptional() @IsIn(['software', 'hardware', 'service'])
  kind?: 'software' | 'hardware' | 'service';
}

export class AcceptIdeaDto {
  /** Product name (defaults to the idea line). */
  @IsOptional() @Transform(trim) @IsString() @Length(2, 80)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(80)
  owner?: string;

  @IsOptional() @IsIn(['software', 'hardware', 'service'])
  kind?: 'software' | 'hardware' | 'service';

  @IsOptional() @IsIn(['greenfield', 'existing_system'])
  mode?: 'greenfield' | 'existing_system';

  @IsOptional() @IsIn(['L1', 'L2', 'L3'])
  depth_level?: 'L1' | 'L2' | 'L3';
}

export class RejectIdeaDto {
  /** Why the idea is turned down; kept with the idea and shown to the person who submitted it. */
  @Transform(trim) @IsString() @Length(3, 500)
  reason!: string;
}

export class IdeaDto {
  id!: string;
  one_liner!: string;
  text!: string;
  requester!: string;
  created_on!: string;
  status!: 'new' | 'shortlisted' | 'rejected' | 'promoted';
  kind!: 'software' | 'hardware' | 'service';
  product_id!: string | null;
  decided_by?: string;
  decided_at?: string;
  reject_reason?: string;
}

export class IdeaListQueryDto extends CursorQueryDto {
  /** Comma-separated: new, shortlisted, rejected, promoted. Default: the ones still waiting for a decision. */
  @IsOptional() @IsString() @Matches(/^(new|shortlisted|rejected|promoted)(,(new|shortlisted|rejected|promoted))*$/, { message: 'status must be a comma-separated list of: new, shortlisted, rejected, promoted' })
  status?: string;
}

export class IdeaListDto {
  /** How many ideas match in all (not only on this page). */
  total!: number;
  data!: IdeaDto[];
  /** Pass as `cursor` to get the next page; null when this is the last one. */
  next!: string | null;
}
export class AcceptedIdeaDto { idea!: IdeaDto; productId!: string; productSlug!: string; productName!: string }
