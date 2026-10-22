import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ErrorResponseDto } from '../dto/error.dto';
import { metrics } from '../metrics/metrics';

export const CODES: Record<number, string> = {
  400: 'bad_request', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed',
  409: 'conflict', 413: 'payload_too_large', 422: 'unprocessable', 429: 'rate_limited',
};

/** extra facts the engine puts on an error (what is missing, the monthly cap ...) */
const ENGINE_EXTRAS = ['completeness', 'threshold', 'missing', 'hint', 'options', 'estimate', 'reason', 'month', 'cap_inr', 'current', 'current_sig'];

const clean = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * One error envelope for /api/v1: { code, message, details?, requestId, statusCode }.
 * Handles Nest HttpExceptions (incl. validation), engine errors that carry a numeric `status`, and unknown errors
 * (logged with the request id; the caller only sees a generic message).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('errors');

  catch(err: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const body = this.toBody(err, req.id || 'unknown');
    metrics.inc('sahayogi_errors_total', { code: body.code, status: body.statusCode }, 1, 'Error answers by code and status');
    if (body.statusCode >= 500 && body.statusCode !== 503) this.log.error(`${body.requestId} ${req.method} ${req.originalUrl}: ${(err as Error)?.stack || err}`);
    if (body.statusCode === 429 || body.statusCode === 503) res.setHeader('Retry-After', String((err as { retryAfter?: number })?.retryAfter || 5));
    res.status(body.statusCode).json(body);
  }

  private toBody(err: unknown, requestId: string): ErrorResponseDto {
    if (err instanceof HttpException) {
      const statusCode = err.getStatus();
      const r = err.getResponse() as string | { message?: string | string[]; code?: string; error?: string; details?: unknown };
      if (typeof r === 'object' && Array.isArray(r.message)) {
        return { code: 'validation_failed', message: 'Some fields are not valid.', details: r.message, requestId, statusCode };
      }
      const message = typeof r === 'string' ? r : clean(r.message) || err.message;
      return { code: (typeof r === 'object' && r.code) || CODES[statusCode] || 'error', message, details: typeof r === 'object' ? r.details : undefined, requestId, statusCode };
    }
    const e = err as { status?: unknown; statusCode?: unknown; message?: string; code?: string; errors?: unknown } | null;
    const status = Number(e?.status ?? e?.statusCode);
    if (Number.isInteger(status) && ((status >= 400 && status < 500) || status === 503)) {
      // engine errors: the older fields (error, errors, validation, eligible and the extras) are sent next to the envelope, because the web app still reads them
      const x = err as Record<string, unknown>;
      const extra: Record<string, unknown> = {};
      for (const k of ENGINE_EXTRAS) if (x[k] !== undefined) extra[k] = x[k];
      const isValidation = (err as Error)?.name === 'ValidationError';
      return {
        code: (typeof e?.code === 'string' && e.code) || (isValidation ? 'validation_failed' : CODES[status]) || 'error',
        message: e?.message || 'Request failed.', details: e?.errors || x.validation || undefined, requestId, statusCode: status,
        error: e?.message, errors: x.errors, validation: x.validation, eligible: x.eligible, ...extra,
      } as ErrorResponseDto;
    }
    return { code: 'internal_error', message: 'Something went wrong on our side. Quote the request id if you report it.', requestId, statusCode: HttpStatus.INTERNAL_SERVER_ERROR };
  }
}
