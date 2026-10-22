import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageMetaDto, PageQueryDto } from '../../common/dto/pagination.dto';
import { IdeaDto } from '../../ideas/dto/ideas.dto';

export const HEALTH = ['on_track', 'attention', 'blocked', 'idle'] as const;
export type Health = (typeof HEALTH)[number];
export const SORTS = ['name', 'stage', 'phase', 'readiness', 'owner', 'activity'] as const;
export const STAGES = ['P0', 'P1', 'P2', 'P3', 'P4', 'handoff', 'done', 'parked'] as const;

const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value);

// ---------------------------------------------------------------- KPI cards
export type KpiStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral';

export class KpiDto {
  key!: string;
  label!: string;
  value!: number;
  unit!: 'count' | 'percent' | 'minutes';
  status!: KpiStatus;
  /** One plain line under the number. */
  note!: string;
  /** Web route to open for the detail behind the number. */
  href?: string;
  group!: 'primary' | 'secondary';
}
export class KpisDto { asOf!: string; kpis!: KpiDto[] }

// ---------------------------------------------------------------- products table
export class PhaseRefDto { id!: number; name!: string; short!: string }

export class HomeProductDto {
  id!: string;
  /** Use this in web addresses: /products/<slug>. */
  slug!: string;
  name!: string;
  oneLiner!: string;
  /** software, hardware or service: which lifecycle template the product follows. */
  kind!: 'software' | 'hardware' | 'service';
  owner!: string;
  stage!: string;
  stageLabel!: string;
  /** The lifecycle phase (0 to 12) the product is in now. */
  phase!: PhaseRefDto;
  readinessPercent!: number;
  health!: Health;
  blockers!: number;
  openQuestions!: number;
  approvalsWaiting!: number;
  /** Facts that are out of date or due for a second look. */
  staleValues!: number;
  /** Minutes of people's time still needed for the listed work. */
  minutesOwed!: number;
  daysInStage!: number | null;
  daysSinceActivity!: number | null;
  lastActivity!: string | null;
  nextStep!: string;
  documents!: { approved: number; total: number };
}

export class ProductsQueryDto extends PageQueryDto {
  /** Search in name, one-liner and owner. */
  @IsOptional() @IsString() @MaxLength(80)
  q?: string;

  /** Comma list of stages: P0,P1,P2,P3,P4,handoff,done,parked. */
  @IsOptional() @Transform(csv) @IsIn(STAGES as unknown as string[], { each: true })
  stage?: string[];

  @IsOptional() @Transform(csv) @IsIn(['software', 'hardware', 'service'], { each: true })
  kind?: string[];

  @IsOptional() @IsString() @MaxLength(80)
  owner?: string;

  @IsOptional() @Transform(csv) @IsIn(HEALTH as unknown as string[], { each: true })
  health?: string[];

  @IsOptional() @IsIn(SORTS as unknown as string[])
  sort: (typeof SORTS)[number] = 'activity';

  @IsOptional() @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}

export class ProductsPageDto {
  data!: HomeProductDto[];
  meta!: PageMetaDto;
  /** Distinct owners across the portfolio, for the filter box. */
  owners!: string[];
}

// ---------------------------------------------------------------- calendar
export const EVENT_KINDS = ['approval_expires', 'gate_decision', 'stage_entered', 'idea_submitted', 'product_created'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export class CalendarEventDto {
  id!: string;
  /** YYYY-MM-DD */
  date!: string;
  kind!: EventKind;
  title!: string;
  productId?: string;
  productSlug?: string;
  productName?: string;
  href?: string;
}

export class CalendarQueryDto {
  /** First day, YYYY-MM-DD. Default: first of this month. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  /** Last day, YYYY-MM-DD. Default: last of this month. At most 93 days after from. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class CalendarDto {
  from!: string;
  to!: string;
  events!: CalendarEventDto[];
  /** True when more than 500 events matched and the list was cut. */
  truncated!: boolean;
}

// ---------------------------------------------------------------- activity
export class ActivityDto {
  id!: string;
  at!: string;
  actor!: string | null;
  action!: string;
  text!: string;
  productId!: string;
  productSlug!: string;
  productName!: string;
}

export class ActivityQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 15;
  /** Cursor from the previous page (`next`). */
  @IsOptional() @Matches(/^\d{1,18}$/, { message: 'cursor is not valid' })
  cursor?: string;
}

export class ActivityPageDto { data!: ActivityDto[]; next!: string | null }

// ---------------------------------------------------------------- one-call first paint
export class HomeDto {
  asOf!: string;
  kpis!: KpiDto[];
  products!: ProductsPageDto;
  ideas!: IdeaDto[];
  ideasTotal!: number;
  activity!: ActivityPageDto;
  calendar!: CalendarDto;
}
