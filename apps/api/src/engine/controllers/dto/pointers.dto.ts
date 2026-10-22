import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreatePointerDto {
  /** The attachment (file) the evidence comes from. */
  @IsOptional() @IsString() attachment?: string;
  /** Where in the file: { kind: "slide" | "page" | "sheet" ..., index, ... }. */
  @IsOptional() @IsObject() locator?: Record<string, unknown>;
  /** The exact words at that place. They are checked against the file. */
  @IsOptional() @IsString() quote?: string;
  /** An existing record this evidence supports. Send this or create, not both. */
  @IsOptional() @IsString() target?: string;
  /** A new record to create from the evidence: { type, subtype?, fields }. */
  @IsOptional() @IsObject() create?: Record<string, unknown>;
  /** proposed, confirmed or rejected. */
  @IsOptional() @IsString() status?: string;
  /** human (the default) or assistant. */
  @IsOptional() @IsString() origin?: string;
  @IsOptional() confidence?: number | string;
  @IsOptional() @IsString() reason?: string;
}

export class PatchPointerDto {
  /** Move the evidence to another record. */
  @IsOptional() @IsString() target?: string;
  /** proposed, confirmed or rejected. */
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() reason?: string;
}
