import { BadRequestException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Cursor pagination for lists that grow (F16). Pass the `next` of one answer as `cursor` to get the following rows. */
export class CursorQueryDto {
  /** Rows to return (1 to 100). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  /** Opaque value from the previous answer's `next`. Leave out for the first page. */
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,300}$/, { message: 'cursor is not valid' })
  cursor?: string;
}

const enc = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const dec = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

/**
 * `items` must already be sorted, newest first, by `key` (a string that sorts the same way, unique per row). The cursor holds the key of
 * the last row sent, so rows added or removed between requests never shift or repeat a page (unlike page numbers).
 */
export function cursorPage<T>(items: T[], key: (t: T) => string, limit: number, cursor?: string): { rows: T[]; next: string | null } {
  let start = 0;
  if (cursor) {
    let after: string;
    try { after = dec(cursor); } catch { throw new BadRequestException({ code: 'invalid_cursor', message: 'The cursor is not valid. Start again without one.' }); }
    start = items.findIndex((t) => key(t) < after); // first row after the cursor in descending order
    if (start < 0) start = items.length;
  }
  const rows = items.slice(start, start + limit);
  return { rows, next: start + limit < items.length && rows.length ? enc(key(rows[rows.length - 1])) : null };
}
