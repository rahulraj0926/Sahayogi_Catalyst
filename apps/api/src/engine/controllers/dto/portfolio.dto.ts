import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProductDto {
  /** The product's name. It must be unique among live products. */
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) one_liner?: string;
  /** software, hardware or service. */
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() @MaxLength(200) owner?: string;
  /** greenfield, existing_system, extend or replace. */
  @IsOptional() @IsString() mode?: string;
  /** How thorough the process is: L1, L2 or L3. */
  @IsOptional() @IsString() depth_level?: string;
  /** sold or internal. */
  @IsOptional() @IsString() audience?: string;
  /** single (one product) or modules (a suite whose modules each have their own competitors). */
  @IsOptional() @IsString() structure?: string;
}

export class PatchProductDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) one_liner?: string;
  @IsOptional() @IsString() @MaxLength(200) owner?: string;
  @IsOptional() @IsString() depth_level?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() audience?: string;
  @IsOptional() @IsString() structure?: string;
  /** A stage to hold the product in, or "auto" (or null) to let the tool decide. */
  @IsOptional() stage?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsBoolean() parked?: boolean;
  /** The idea behind it: { who_for, why_now, asked_by }. */
  @IsOptional() @IsObject() idea?: Record<string, unknown>;
}

export class AddIdeaDto {
  @IsOptional() @IsString() @MaxLength(500) one_liner?: string;
  /** Same as one_liner (older name). */
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsString() requester?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() created_on?: string;
}

export class PatchIdeaDto {
  @IsOptional() @IsString() @MaxLength(500) one_liner?: string;
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
  @IsOptional() @IsString() requester?: string;
  @IsOptional() @IsString() kind?: string;
  /** new, shortlisted or rejected. */
  @IsOptional() @IsString() status?: string;
}

export class PromoteIdeaDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() audience?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() mode?: string;
  @IsOptional() @IsString() depth_level?: string;
}
