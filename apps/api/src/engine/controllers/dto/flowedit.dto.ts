import { Type } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class FlowStepDto {
  /** Keep the id of a step that already exists; leave it out for a new step. */
  @IsOptional() @IsString() id?: string;
  /** What happens in this step, in a few words. */
  @IsOptional() @IsString() text?: string;
  /** Who does it. */
  @IsOptional() @IsString() actor?: string;
  /** What happens next: auto (the next step in the list), end, or the id of another step. */
  @IsOptional() @IsString() next?: string;
  /** What happens when it fails: { text, condition?, test }. */
  @IsOptional() @IsObject() fail?: Record<string, unknown> | null;
}

export class SaveFlowDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() goal?: string;
  @IsOptional() @IsString() trigger?: string;
  @IsOptional() @IsString() end_text?: string;
  /** The whole list of steps, in order. At least one is needed. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FlowStepDto) steps?: FlowStepDto[];
}
