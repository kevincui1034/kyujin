// Single-line JSON logger. Each call emits exactly one Vercel log entry,
// which keeps log volume (and therefore Vercel log cost) bounded.
//
// Design:
//   - `kind` is a stable discriminant for filtering in Vercel's log UI.
//     Use a dotted namespace like `'cron.process_batch'` or
//     `'billing.stripe.subscription_updated'`.
//   - Errors carry a `cause` string (truncated to 500 chars), never a stack.
//     If you need the stack for a one-off investigation, attach it
//     temporarily; don't make it the default.
//   - Skip per-request logging. The cost adds up fast and Vercel already
//     records request metadata. Log only state transitions, cron summaries,
//     and recoverable errors that operations needs to see.

type Level = 'info' | 'warn' | 'error';

interface LogPayload {
  kind: string;
  [field: string]: unknown;
}

function emit(level: Level, payload: LogPayload): void {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...payload });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export const log = {
  info(payload: LogPayload): void {
    emit('info', payload);
  },
  warn(payload: LogPayload): void {
    emit('warn', payload);
  },
  // The error variant takes the same payload but coerces an optional `cause`
  // (Error | string | unknown) into a short string for safe logging.
  error(payload: LogPayload & { cause?: unknown }): void {
    const { cause, ...rest } = payload;
    const out: LogPayload = { ...rest };
    if (cause !== undefined) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      out.cause = truncate(msg, 500);
    }
    emit('error', out);
  },
};
