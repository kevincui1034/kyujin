import { NextResponse } from 'next/server';
import { log } from './log';

// Stable, client-safe error codes. Add new ones here so the union stays
// closed and the iOS/web clients can switch on a known set.
export type ApiErrorCode =
  | 'invalid_body'
  | 'invalid_query'
  | 'invalid_params'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payment_required'
  | 'paid_plan_required'
  | 'misconfigured'
  | 'upstream_failed'
  | 'invalid_signature'
  | 'internal_error';

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  invalid_body: 400,
  invalid_query: 400,
  invalid_params: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payment_required: 402,
  paid_plan_required: 402,
  misconfigured: 500,
  upstream_failed: 502,
  invalid_signature: 400,
  internal_error: 500,
};

interface ApiErrorOptions {
  // Optional human-readable hint that's safe to show the user. NEVER pass a
  // raw exception message here — those go to the server log only.
  message?: string;
  // Optional structured payload (e.g. `{ field: 'company' }`). Must contain
  // only data the client already knows or controls.
  details?: Record<string, unknown>;
  // The underlying error to log server-side. Not returned in the response.
  cause?: unknown;
  // Optional response headers (e.g. `Retry-After`).
  headers?: HeadersInit;
}

// Build a uniform JSON error response. The shape is `{ error: <code>, ... }`
// so the existing clients (which already key off `error`) keep working.
//
// The `cause` is logged with a single structured line so we still have a
// trace without ever echoing exception text to the client.
export function apiError(
  code: ApiErrorCode,
  opts: ApiErrorOptions = {},
  status: number = DEFAULT_STATUS[code],
): NextResponse {
  if (opts.cause !== undefined) {
    // Go through the structured logger so api_error events sit alongside
    // billing/cron events in Vercel logs with the same shape.
    log.error({ kind: 'api_error', code, status, cause: opts.cause });
  }
  const body: Record<string, unknown> = { error: code };
  if (opts.message) body.message = opts.message;
  if (opts.details) body.details = opts.details;
  return NextResponse.json(body, { status, headers: opts.headers });
}
