import { IsOptional } from 'class-validator';

export class NeededSendDto {
  /** Ask for every row of this stage that can be asked now (0-4). */
  @IsOptional() stage?: number | string;
  /** Or ask for just this one row. */
  @IsOptional() row?: string;
}
