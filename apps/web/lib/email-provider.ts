// Server-side helper for resolving which mailbox provider the app is on.
// Mirrors the same EMAIL_PROVIDER env var the worker reads in process-batch.ts.
// Imported by server components / route handlers to pick the right API prefix.
//
// Not safe to import from client components (process.env isn't available at
// runtime there). Pass the resolved values down as props instead.

export type EmailProvider = 'gmail' | 'nylas';

export const EMAIL_PROVIDER: EmailProvider =
  process.env.EMAIL_PROVIDER === 'nylas' ? 'nylas' : 'gmail';

// Path prefix for the active provider's connect/callback/backfill/disconnect
// routes. Templates as `${EMAIL_API_PREFIX}/connect`, etc.
export const EMAIL_API_PREFIX = EMAIL_PROVIDER === 'nylas' ? '/api/email' : '/api/gmail';

export const isNylasProvider = EMAIL_PROVIDER === 'nylas';
