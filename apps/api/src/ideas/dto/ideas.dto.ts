import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
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

  /** true: the idea starts in innovation (status "innovation"), a draft the CEO does not see until it is sent. Default: it goes straight to the CEO's inbox. */
  @IsOptional() @IsBoolean()
  draft?: boolean;
}

/** What the pitcher adds to a draft: the problem, who it is for, and an optional demo or sketch link. Only the fields sent are changed. */
export class UpdateInnovationDto {
  /** The pain today, in plain words (at least 10 characters before the idea can be sent). */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(600)
  problem?: string;

  /** Who has this problem (at least 3 characters before the idea can be sent). */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  who_for?: string;

  /** The pitcher's own demo, prototype or sketch (an http or https address). null or empty clears it. */
  @IsOptional() @IsString() @MaxLength(300)
  demo_url?: string | null;
}

/** A real competitor. The server opens the website before storing it; nothing is ever filled in for the person. */
export class AddCompetitorDto {
  @Transform(trim) @IsString() @Length(2, 80)
  name!: string;

  /** The competitor's website, with or without https://. */
  @Transform(trim) @IsString() @Length(3, 300)
  website!: string;

  /** What it does, in a line. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  note?: string;

  /** A demo, trial or product-tour page of the competitor (an http or https address, not opened by the server). */
  @IsOptional() @IsString() @MaxLength(300)
  demo_url?: string | null;
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

/** The result of opening the competitor's website. verified: it answered normally. responded: it answered with an error such as 403 because it blocks automated visits, so it is real but could not be read. */
export class IdeaCompetitorCheckDto {
  status!: 'verified' | 'responded';
  http_status!: number;
  title!: string | null;
  final_url!: string;
  checked_at!: string;
}

export class IdeaCompetitorDto {
  /** CMP-1, CMP-2 ...: unique within the idea. */
  id!: string;
  name!: string;
  website!: string;
  note!: string | null;
  demo_url!: string | null;
  check!: IdeaCompetitorCheckDto;
}

export class IdeaCompetitorsNeededDto {
  have!: number;
  need!: number;
}

/** What a draft still lacks before it can be sent to the CEO. */
export class IdeaDoorDto {
  problem!: boolean;
  who_for!: boolean;
  competitors!: IdeaCompetitorsNeededDto;
  ready!: boolean;
}

export class IdeaDto {
  id!: string;
  one_liner!: string;
  text!: string;
  requester!: string;
  created_on!: string;
  /** innovation: a draft the pitcher is filling in. new or shortlisted: waiting for the CEO. */
  status!: 'innovation' | 'new' | 'shortlisted' | 'rejected' | 'promoted';
  kind!: 'software' | 'hardware' | 'service';
  product_id!: string | null;
  decided_by?: string;
  decided_at?: string;
  reject_reason?: string;
  problem!: string | null;
  who_for!: string | null;
  demo_url!: string | null;
  /** Real competitors, each with the result of the check that proved its website exists. Always a list. */
  competitors!: IdeaCompetitorDto[];
  /** Only while status is innovation: what is still missing. Otherwise null. */
  door!: IdeaDoorDto | null;
}

export class IdeaListQueryDto extends CursorQueryDto {
  /** Comma-separated: innovation, new, shortlisted, rejected, promoted. Default: the ones still waiting for a decision (new and shortlisted). */
  @IsOptional() @IsString() @Matches(/^(innovation|new|shortlisted|rejected|promoted)(,(innovation|new|shortlisted|rejected|promoted))*$/, { message: 'status must be a comma-separated list of: innovation, new, shortlisted, rejected, promoted' })
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
