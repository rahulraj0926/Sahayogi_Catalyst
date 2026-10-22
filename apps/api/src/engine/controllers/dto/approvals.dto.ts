import { IsOptional, IsString } from 'class-validator';

export class ApprovalNoteDto {
  @IsOptional() @IsString() note?: string;
}

export class DecideDto {
  /** approve (the default) or decline. */
  @IsOptional() @IsString() decision?: string;
  /** The approver's own name, typed by them. */
  @IsOptional() @IsString() name?: string;
  /** A note, required when declining. */
  @IsOptional() @IsString() note?: string;
}

export class SharingDto {
  /** The address approval links start with, for example http://192.168.1.20:4317. Empty clears it. */
  @IsOptional() @IsString() public_url?: string;
  /** How many days a link lives (1 to 365). */
  @IsOptional() approval_expiry_days?: number;
}
