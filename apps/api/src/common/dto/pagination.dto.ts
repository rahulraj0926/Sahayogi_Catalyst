import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

export class PageQueryDto {
  /** 1-based page number. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  /** Rows per page (1 to 100). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  limit: number = 25;
}

export class PageMetaDto {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
}

export interface Paged<T> { data: T[]; meta: PageMetaDto }

export function paged<T>(all: T[], page: number, limit: number): Paged<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const p = Math.min(Math.max(1, page), totalPages);
  return { data: all.slice((p - 1) * limit, p * limit), meta: { page: p, limit, total, totalPages } };
}
