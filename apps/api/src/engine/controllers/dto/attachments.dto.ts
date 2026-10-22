import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class PasteTextDto {
  /** The words of a file that could not be read, typed or pasted by a person. */
  @IsOptional() @IsString() text?: string;
}

export class AcceptSuggestionsDto {
  /** Which competitor the suggestions belong to, when the file is not already attached to one. */
  @IsOptional() @IsString() competitor_id?: string;
  /** The file describes the person's own product, not a competitor. */
  @IsOptional() own_product?: boolean | string;
  /** Replace values that are already set. */
  @IsOptional() @IsBoolean() overwrite?: boolean;
  /** The candidates the person chose from the suggestions: { id?, kind, fields, location, snippet, confidence, competitor_id?, overrides? }. */
  @IsOptional() @IsArray() @IsObject({ each: true }) candidates?: Record<string, unknown>[];
}
