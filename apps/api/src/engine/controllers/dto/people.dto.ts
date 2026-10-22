import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddPersonDto {
  /** The person's name. */
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  /** Sponsor, Delivery, Customer, End-user, Partner, Regulator/Legal, Security/Privacy, Operations, Finance or Commercial (anything else becomes Delivery). */
  @IsOptional() @IsString() category?: string;
  /** What they do, in their own words. */
  @IsOptional() @IsString() @MaxLength(200) role_title?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
  @IsOptional() @IsBoolean() is_sponsor?: boolean;
}
