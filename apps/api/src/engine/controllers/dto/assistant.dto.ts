import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class ChatDto {
  /** What the person asks. */
  @IsOptional() @IsString() message?: string;
}

export class AssistDto {
  /** What the assistant should look for (see the goals the file page offers). */
  @IsOptional() @IsString() goal?: string;
  /** The record the proposals are about, when the goal needs one. */
  @IsOptional() @IsString() target?: string;
  @IsOptional() @IsString() competitor_id?: string;
  /** Live mode only: the person saw the estimated cost and agreed to it. */
  @IsOptional() @IsBoolean() confirm_cost?: boolean;
  @IsOptional() confidence?: number | string;
}

export class SetCapDto {
  /** The most the paid assistant may cost in a month, in rupees. 0 switches it off. */
  @IsOptional() cap_inr?: number | string;
}

export class AcceptProposalDto {
  @IsOptional() @IsString() competitor_id?: string;
  /** Replace values that are already set. */
  @IsOptional() @IsBoolean() overwrite?: boolean;
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() @IsObject() overrides?: Record<string, unknown>;
}

export class EditProposalDto {
  /** The values to change; an empty value removes an optional field. */
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() @IsString() competitor_id?: string;
}

export class RejectProposalDto {
  @IsOptional() @IsString() reason?: string;
}
