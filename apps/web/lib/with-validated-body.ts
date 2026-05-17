import { type NextRequest, type NextResponse } from 'next/server';
import { z, type ZodSchema } from 'zod';
import { apiError } from './api-errors';

// Parse and validate `req.json()` against a zod schema. On failure returns a
// 400 with `{ error: 'invalid_body', details: { issues: [...] } }`. On success
// returns `{ ok: true, data }`. Use the result as a guard:
//
//   const parsed = await validateBody(req, schema);
//   if (!parsed.ok) return parsed.response;
//   const body = parsed.data;
//
// We intentionally don't echo the unsanitized exception text from JSON parse
// errors. Issue paths are safe to surface — they identify which field the
// client got wrong — but the messages are zod's, not the user's input.
export type ValidatedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
): Promise<ValidatedBody<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: apiError('invalid_body') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError('invalid_body', {
        details: {
          issues: parsed.error.issues.map((i) => ({
            path: i.path,
            code: i.code,
            message: i.message,
          })),
        },
      }),
    };
  }
  return { ok: true, data: parsed.data };
}

// Re-export zod so route handlers can import schema + helper from one path.
export { z };
