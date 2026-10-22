/** The one error shape every /api/v1 endpoint returns. */
export class ErrorResponseDto {
  /** Machine-readable code, e.g. validation_failed, not_found, forbidden. */
  code!: string;
  /** Plain-language message for the person. */
  message!: string;
  /** Extra detail: field errors for validation_failed. */
  details?: unknown;
  /** Same value as the X-Request-Id response header; quote it when reporting a problem. */
  requestId!: string;
  statusCode!: number;
}
