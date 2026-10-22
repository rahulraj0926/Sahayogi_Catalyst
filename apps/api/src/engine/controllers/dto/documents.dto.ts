import { IsObject, IsOptional, IsString } from 'class-validator';

export class DocumentStatusDto {
  /** draft, in_review or approved. */
  @IsOptional() @IsString() status?: string;
  /** Who is making the change (a named person, never an agent). Defaults to the person acting. */
  @IsOptional() @IsString() by?: string;
  /** Their role, for example Product Owner or Sponsor. */
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() note?: string;
  /** The request this status change answers, when it comes from an approval. */
  @IsOptional() @IsString() request?: string;
  /** A second person's name, when the document needs two approvers. */
  @IsOptional() @IsString() second_approver?: string;
  /** An exception when the document is below the approval threshold: { reason, approver }. */
  @IsOptional() @IsObject() waiver?: Record<string, unknown>;
}
