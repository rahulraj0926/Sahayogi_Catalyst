import { IsOptional, IsString } from 'class-validator';

export class CompleteStoryDto {
  @IsOptional() @IsString() persona?: string;
  @IsOptional() @IsString() want?: string;
  @IsOptional() @IsString() benefit?: string;
  @IsOptional() @IsString() requirement?: string;
  /** The rules the story must follow. */
  @IsOptional() rules?: unknown;
  /** How the story will be tested. */
  @IsOptional() tests?: unknown;
}

export class SubmitStoryDto {
  /** Who is asked to approve the story. */
  @IsOptional() @IsString() approver?: string;
}

export class DeliverDto {
  /** The story whose package is delivered. */
  @IsOptional() @IsString() story?: string;
}
