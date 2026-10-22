import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientErrorDto {
  /** What went wrong, as the browser reported it. */
  @IsString() @MaxLength(1000) message!: string;
  @IsOptional() @IsString() @MaxLength(6000) stack?: string;
  /** Next.js's short code for a server-side render error. */
  @IsOptional() @IsString() @MaxLength(200) digest?: string;
  /** The address of the page. */
  @IsOptional() @IsString() @MaxLength(500) url?: string;
  /** The request id the server gave the failed call, when there was one. */
  @IsOptional() @IsString() @MaxLength(200) request_id?: string;
  @IsOptional() @IsIn(['error-page', 'global-error', 'window', 'page']) source?: string;
}
