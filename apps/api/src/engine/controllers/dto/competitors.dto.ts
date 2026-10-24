import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

/** A number written in a web address (?users=25). It stays text here; the code that reads it checks the range. */
const NumberText = () => applyDecorators(IsOptional(), Matches(/^-?\d*\.?\d*$/, { message: 'must be a number' }));
/** 1/0 or true/false written in a web address. */
const FlagText = () => applyDecorators(IsOptional(), IsIn(['1', '0', 'true', 'false', '']));

export const PLAN_LEVELS = ['free', 'entry', 'mid', 'top', 'enterprise'];

// ---- addresses: what each GET under /competitors accepts. `product` is read by the engine itself.
export class CompetitorQueryDto {
  /** Product id such as PRD-001, or its web address name. */
  @IsOptional() @IsString() product?: string;
}

export class ScopeQueryDto extends CompetitorQueryDto {
  /** Only competitors set against this part of our product (a module name). Empty means all. */
  @IsOptional() @IsString() scope?: string;
}

export class PlansQueryDto extends ScopeQueryDto {
  /** One competitor's plans (a competitor id). */
  @IsOptional() @IsString() competitor?: string;
}

export class PickFeaturesQueryDto extends PlansQueryDto {
  /** Only features offered in plans of this level. */
  @IsOptional() @IsIn([...PLAN_LEVELS, '']) tier?: string;
  /** Words the feature name must contain. */
  @IsOptional() @IsString() q?: string;
  /** Any value: return just the names (at most 5000), for "pick all". */
  @IsOptional() @IsString() names_only?: string;
  /** How many features to return (1 to 500, default 30). */
  @NumberText() limit?: string;
  @NumberText() offset?: string;
}

export class RecommendedQueryDto extends ScopeQueryDto {
  /** Share of competitors that must offer a feature, 1 to 100. */
  @NumberText() threshold?: string;
  /** Users in the price scenario. */
  @NumberText() users?: string;
}

export class ComparePlansQueryDto extends ScopeQueryDto {
  /** free, entry, mid, top or enterprise. Required. */
  @IsOptional() @IsIn([...PLAN_LEVELS, '']) level?: string;
  /** A level to show for a competitor that has no plan at `level`. */
  @IsOptional() @IsIn([...PLAN_LEVELS, '']) fallback?: string;
  @NumberText() users?: string;
}

export class NormalizedPricesQueryDto extends ScopeQueryDto {
  @NumberText() users?: string;
  @NumberText() units?: string;
  @NumberText() gb?: string;
}

export class MustHaveQueryDto extends ScopeQueryDto {
  /** Share of competitors that offer a feature for it to count, 1 to 100 (default 80). */
  @NumberText() threshold?: string;
}

export class OverviewQueryDto extends ScopeQueryDto {
  @NumberText() threshold?: string;
  @NumberText() users?: string;
  @NumberText() coverage?: string;
  @NumberText() must?: string;
  @NumberText() common?: string;
  @NumberText() compare_users?: string;
}

export class ImportQueryDto extends ScopeQueryDto {
  /** The file name, such as plans.csv. Its ending says whether it is CSV or Excel. */
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  /** 1 saves; 0 (the default) only checks and reports. */
  @FlagText() commit?: string;
  /** 1 replaces what is saved with what is in the file. */
  @FlagText() overwrite?: string;
  /** 0 does not add features that are not on our list yet. */
  @FlagText() create_features?: string;
  /** Put every row under this competitor. */
  @IsOptional() @IsString() competitor?: string;
  /** Tier to give new competitors. */
  @IsOptional() @IsString() tier?: string;
}

export class ExportQueryDto extends ScopeQueryDto {
  /** One competitor id. Empty exports all. */
  @IsOptional() @IsString() id?: string;
}

export class TemplateQueryDto extends CompetitorQueryDto {
  /** plans (the default) or another template name. */
  @IsOptional() @IsString() kind?: string;
}

// ---- bodies
export class CommonFeatureDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class AddCommonFeaturesDto {
  /** Features to add to every competitor's list (1 to 60). */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => CommonFeatureDto) features!: CommonFeatureDto[];
}

export class PlanFeatureRefDto {
  /** A feature on our list. Send this or rating_id. */
  @IsOptional() @IsString() capability_id?: string;
  /** The competitor's own rating of the feature. */
  @IsOptional() @IsString() rating_id?: string;
}

export class SetPlanFeatureDto {
  /** The competitor id. */
  @IsString() competitor!: string;
  /** The plans (prices of that competitor) to change. */
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) price_ids!: string[];
  /** True to include the feature(s) in those plans, false to take them out. */
  @IsBoolean() included!: boolean;
  /** One feature on our list ... */
  @IsOptional() @IsString() capability_id?: string;
  /** ... or one of the competitor's own ratings ... */
  @IsOptional() @IsString() rating_id?: string;
  /** ... or many at once (at most 500). */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PlanFeatureRefDto) features?: PlanFeatureRefDto[];
}

export class SetOurPlanFeatureDto {
  /** One of our plans. */
  @IsString() plan_id!: string;
  @IsBoolean() included!: boolean;
  /** One feature on our list ... */
  @IsOptional() @IsString() capability_id?: string;
  /** ... or many (at most 500). */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) capability_ids?: string[];
}

export class NewFeatureDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
}

export class AddOurFeaturesDto {
  /** New features for our own list (1 to 300). A name already on the list is not added twice. */
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => NewFeatureDto) features!: NewFeatureDto[];
  /** Our plans that should include them. */
  @IsOptional() @IsArray() @IsString({ each: true }) plan_ids?: string[];
}

export class BulkCompetitorsDto {
  /** Rows as in the import file: Competitor, Plan, Level, prices ... */
  @IsArray() @IsObject({ each: true }) rows!: Record<string, unknown>[];
  /** True saves; false (the default) only checks. */
  @IsOptional() @IsBoolean() commit?: boolean;
  @IsOptional() @IsBoolean() overwrite?: boolean;
  /** False does not add features that are not on our list yet. */
  @IsOptional() @IsBoolean() create_features?: boolean;
}
