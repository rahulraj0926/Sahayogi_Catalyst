import { IsArray, IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SettingsDto {
  /** L1, L2 or L3: how thorough the process is for this product. */
  @IsOptional() @IsString() depth_level?: string;
  /** Pretend today is this date (YYYY-MM-DD); empty goes back to the real date. */
  @IsOptional() @IsString() asOf?: string | null;
  /** How many steps a change travels when the tool marks work as needing a second look (1 to 5). */
  @IsOptional() @IsNumber() suspectDepth?: number;
  /** Tuning numbers for the checks. */
  @IsOptional() @IsObject() params?: Record<string, any>;
}

export class CreateItemDto {
  @IsString() type!: string;
  /** The item's own fields (title, statement, ...). */
  @IsOptional() @IsObject() fields?: Record<string, any>;
  /** human or document; anything else counts as human. */
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() subtype?: string;
}

export class PatchItemDto {
  @IsOptional() @IsObject() fields?: Record<string, any>;
  /** Mark that a person looked at the change (used for work the tool drafted). */
  @IsOptional() reviewed?: boolean;
  /** The revision the caller was looking at. A different current revision gives 409 stale_edit. */
  @IsOptional() expected_rev?: number | string;
}

export class ItemStatusDto { @IsString() status!: string; }

export class NoteDto { @IsOptional() @IsString() @MaxLength(2000) note?: string; }

export class ReviewDto {
  @IsOptional() @IsArray() ids?: string[];
  @IsOptional() @IsString() status?: string;
}

export class CreateLinkDto {
  @IsString() type!: string;
  @IsString() source!: string;
  @IsString() target!: string;
  @IsOptional() @IsObject() attrs?: Record<string, any>;
}

export class ImportDto { @IsObject() data!: Record<string, any>; }

export class HandoffValidateDto {
  @IsOptional() @IsString() story?: string;
  @IsOptional() @IsObject() package?: Record<string, any>;
}

export class HandoffCreateDto { @IsString() story!: string; }

export class DemoGotoDto { @IsOptional() @IsNumber() index?: number; }

export class NaDto { @IsOptional() @IsString() @MaxLength(2000) reason?: string; }

export class FrameworkWeightsDto {
  /** Step id such as P5.3. Send together with `tier`. */
  @IsOptional() @IsString() step?: string;
  /** core, major, support or light: how much the step counts toward its phase. */
  @IsOptional() @IsString() tier?: string;
  /** Points per level, for example { core: 10 }. */
  @IsOptional() @IsObject() points?: Record<string, number>;
  /** Put the framework's own weights back. */
  @IsOptional() @IsBoolean() reset?: boolean;
}
