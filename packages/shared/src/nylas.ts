// Nylas adapter — wraps the Nylas Node SDK v8 (Nylas v3 API).
//
// Why we went Nylas: skips Google CASA verification for the restricted
// `gmail.readonly` scope. Users authenticate through Nylas's CASA-verified
// shared Google app; the consent screen shows "Nylas" instead of "Yume".
//
// Mirrors the public surface of `./gmail.ts` (same function names where the
// shapes line up) so the consumer migration is a name-for-name swap.

import crypto from 'node:crypto';
import Nylas from 'nylas';
import type { Message } from 'nylas';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { nylasConnections, type NylasConnection } from '@kyujin/db/schema';
import type { NormalizedEmail } from './types';

function requireNylasEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `${name} is not set. Sign up at https://dashboard-v3.nylas.com, create an app, and copy the credentials into .env.local.`,
    );
  }
  return v;
}

let _nylas: Nylas | null = null;
function nylas(): Nylas {
  if (_nylas) return _nylas;
  _nylas = new Nylas({
    apiKey: requireNylasEnv('NYLAS_API_KEY'),
    apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com',
  });
  return _nylas;
}

// ── OAuth (hosted) ────────────────────────────────────────────────────────
// Users land on Nylas's hosted page (Shared GCP App). `state` round-trips
// back to the callback so we can correlate to a userId — same pattern as
// gmail.ts. `accessType: 'offline'` is required to get a refresh-capable
// grant so Nylas keeps the underlying Google tokens fresh indefinitely.

export function buildAuthUrl(state: string): string {
  return nylas().auth.urlForOAuth2({
    clientId: requireNylasEnv('NYLAS_CLIENT_ID'),
    redirectUri: requireNylasEnv('NYLAS_REDIRECT_URI'),
    provider: 'google',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    accessType: 'offline',
    // No `prompt` param: Nylas v3's prompt enum is narrow (we tried
    // `select_account consent`, then `login`, both rejected with 400/703).
    // Omitting it falls back to Nylas's default, which forwards the user
    // to Google's standard OAuth screen — Google itself surfaces the
    // account picker / consent UI, which is what we wanted anyway.
    includeGrantScopes: true,
    state,
  });
}

export interface NylasGrant {
  grantId: string;
  emailAddress: string;
}

export async function exchangeCode(code: string): Promise<NylasGrant> {
  // clientSecret is omitted on purpose — when absent, the SDK uses the
  // API key for the server-side exchange (the v3 hosted-auth pattern).
  const { grantId, email } = await nylas().auth.exchangeCodeForToken({
    clientId: requireNylasEnv('NYLAS_CLIENT_ID'),
    redirectUri: requireNylasEnv('NYLAS_REDIRECT_URI'),
    code,
  });
  return { grantId, emailAddress: email };
}

// ── Client handles ────────────────────────────────────────────────────────
// Mirrors GmailClientHandle. The "client" here is the row + a reference
// back to the shared Nylas SDK; the SDK is stateless across grants
// (every call takes `identifier: grantId`).

export interface NylasClientHandle {
  nylas: Nylas;
  grantId: string;
  emailAddress: string;
  connectionId: string;
}

function handleFromRow(row: NylasConnection): NylasClientHandle {
  return {
    nylas: nylas(),
    grantId: row.grantId,
    emailAddress: row.emailAddress,
    connectionId: row.id,
  };
}

export async function getNylasClient(userId: string): Promise<NylasClientHandle> {
  const [row] = await db
    .select()
    .from(nylasConnections)
    .where(eq(nylasConnections.userId, userId))
    .limit(1);
  if (!row) throw new Error(`No Nylas connection for user ${userId}`);
  return handleFromRow(row);
}

export async function listNylasClients(userId: string): Promise<NylasClientHandle[]> {
  const rows = await db
    .select()
    .from(nylasConnections)
    .where(eq(nylasConnections.userId, userId));
  return rows.map(handleFromRow);
}

export async function getNylasClientById(
  userId: string,
  connectionId: string,
): Promise<NylasClientHandle> {
  const [row] = await db
    .select()
    .from(nylasConnections)
    .where(and(eq(nylasConnections.userId, userId), eq(nylasConnections.id, connectionId)))
    .limit(1);
  if (!row) throw new Error(`No Nylas connection ${connectionId} for user ${userId}`);
  return handleFromRow(row);
}

// Resolve a webhook payload back to a user. Webhooks identify the mailbox
// by grant_id, not user_id, so this is how the webhook handler finds who
// owns the new message.
export async function getNylasConnectionByGrantId(grantId: string): Promise<NylasConnection | null> {
  const [row] = await db
    .select()
    .from(nylasConnections)
    .where(eq(nylasConnections.grantId, grantId))
    .limit(1);
  return row ?? null;
}

// ── Message ops ───────────────────────────────────────────────────────────
// Nylas decodes the body for us; HTML messages arrive with HTML in `body`
// already (not base64-encoded MIME parts the way Gmail returns them).

export function normalizeNylasMessage(message: Message): NormalizedEmail | null {
  if (!message.id || !message.threadId) return null;
  const fromEntry = message.from?.[0];
  const address = (fromEntry?.email ?? '').toLowerCase();
  const domain = address.split('@')[1] ?? '';
  // Nylas returns HTML in `body` for HTML emails. Strip tags + collapse
  // whitespace for the classifier — same treatment gmail.ts gave to
  // HTML-only messages. `body` is optional on drafts; default to empty.
  const body = (message.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    // The DB column is historically named gmailMessageId — we keep the
    // name and just store Nylas's message ID in it. Same for threadId.
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    fromAddress: address,
    fromDomain: domain,
    fromName: fromEntry?.name ?? null,
    subject: message.subject ?? '',
    snippet: message.snippet ?? '',
    body,
    // Nylas's `date` is unix seconds (not milliseconds).
    receivedAt: new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000),
  };
}

export async function listJobMessageIds(
  handle: NylasClientHandle,
  query: string,
  maxResults = 500,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < maxResults) {
    const limit = Math.min(100, maxResults - ids.length);
    const { data, nextCursor } = await handle.nylas.messages.list({
      identifier: handle.grantId,
      queryParams: {
        // Nylas accepts Gmail's search syntax verbatim via `searchQueryNative`
        // when the underlying provider is Google. Outlook would need KQL here.
        searchQueryNative: query,
        limit,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    for (const m of data) if (m.id) ids.push(m.id);
    if (!nextCursor) break;
    pageToken = nextCursor;
  }
  return ids;
}

export async function getMessage(handle: NylasClientHandle, messageId: string): Promise<Message> {
  const { data } = await handle.nylas.messages.find({
    identifier: handle.grantId,
    messageId,
  });
  return data;
}

// Revokes the grant on Nylas's side, which also drops the underlying
// provider OAuth grant. Idempotent — if the grant already doesn't exist
// (user revoked from Google directly, prior delete), swallow the 404.
export async function revokeGrant(grantId: string): Promise<void> {
  try {
    await nylas().grants.destroy({ grantId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Treat "already gone" as success — the caller's intent (no active
    // grant for this id) is satisfied either way.
    if (!/404|not.?found|invalid_grant/i.test(msg)) throw err;
  }
}

// ── Backfill query / windows ─────────────────────────────────────────────
// Same constants as gmail.ts so plan caps stay consistent across providers.

export const BACKFILL_WINDOWS = [30, 90, 120, 240, 365] as const;
export type BackfillWindow = (typeof BACKFILL_WINDOWS)[number];
export const FREE_PLAN_MAX_DAYS = 90;

export function buildBackfillQuery(days: number): string {
  // Identical to gmail.ts's query — passed through to Gmail unchanged via
  // Nylas's `searchQueryNative`. An Outlook port would need KQL here.
  return [
    `newer_than:${days}d`,
    '(from:greenhouse.io OR from:lever.co OR from:myworkday.com OR from:ashbyhq.com',
    'OR from:workable.com OR from:smartrecruiters.com OR from:bamboohr.com OR from:jobvite.com',
    'OR from:taleo.net OR from:icims.com OR from:linkedin.com OR from:indeed.com',
    'OR from:joinhandshake.com',
    'OR subject:application OR subject:interview OR subject:"thank you for applying"',
    'OR subject:"your application was sent")',
  ].join(' ');
}

export const BACKFILL_QUERY = buildBackfillQuery(90);

// ── Webhook ──────────────────────────────────────────────────────────────
// Replaces /api/gmail/pubsub. Nylas POSTs JSON for events like
// `message.created`. Verification is HMAC-SHA256 over the raw body using
// NYLAS_WEBHOOK_SECRET. The signature arrives in `X-Nylas-Signature`.

// Nylas v3 webhook payloads use snake_case on the wire (`grant_id`, `thread_id`),
// not the camelCase the Node SDK exposes in its own typed surfaces. Accept both
// shapes so we're resilient if Nylas ever normalizes its delivery format.
export interface NylasWebhookEvent {
  type: 'message.created' | 'message.updated' | 'grant.expired' | 'grant.deleted' | string;
  data: {
    object: {
      id: string;
      grant_id?: string;
      grantId?: string;
      thread_id?: string;
      threadId?: string;
    };
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = requireNylasEnv('NYLAS_WEBHOOK_SECRET');
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex');
  // Constant-time compare; lengths must match to avoid an early-exit leak.
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// Wraps the SDK's challenge extractor. Used during webhook URL verification
// — Nylas GETs the endpoint with ?challenge=<value> and expects the value
// echoed back as plain text. The route handler reads request.url and passes
// it here to pull the challenge out.
export function extractChallenge(requestUrl: string): string | null {
  try {
    return nylas().webhooks.extractChallengeParameter(requestUrl);
  } catch {
    return null;
  }
}
