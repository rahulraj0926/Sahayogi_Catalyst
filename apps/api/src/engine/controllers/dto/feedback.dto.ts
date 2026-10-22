import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AddNoteDto {
  /** What is wrong, in a few words (up to 4,000 characters). */
  @IsOptional() @IsString() text?: string;
  /** confusing, missing, broken, too much text. */
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  /** The page the person was on. */
  @IsOptional() @IsString() route?: string;
  /** Product id, when the note is about one product. */
  @IsOptional() @IsString() product?: string;
  @IsOptional() width?: number;
  @IsOptional() words?: number;
}

export class NoteDoneDto {
  /** true (the default) ticks the note as dealt with, false un-ticks it. */
  @IsOptional() @IsBoolean() done?: boolean;
}
