import { google, type gmail_v1 } from 'googleapis';
import { eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { gmailConnections } from '@kyujin/db/schema';
import type { NormalizedEmail } from './types';

const SKEW_MS = 60_000;

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI must all be set');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildAuthUrl(state: string): string {
  return getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string) {
  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);
  return tokens;
}

export async function getGmailClient(userId: string): Promise<{
  gmail: gmail_v1.Gmail;
  emailAddress: string;
  connectionId: string;
}> {
  const rows = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .limit(1);

  const connection = rows[0];
  if (!connection) {
    throw new Error(`No Gmail connection for user ${userId}`);
  }

  const oauth = getOAuthClient();
  oauth.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.expiresAt.getTime(),
    scope: connection.scope,
    token_type: 'Bearer',
  });

  if (connection.expiresAt.getTime() < Date.now() + SKEW_MS) {
    const { credentials } = await oauth.refreshAccessToken();
    if (credentials.access_token && credentials.expiry_date) {
      await db
        .update(gmailConnections)
        .set({
          accessToken: credentials.access_token,
          expiresAt: new Date(credentials.expiry_date),
          updatedAt: new Date(),
        })
        .where(eq(gmailConnections.id, connection.id));
      oauth.setCredentials(credentials);
    }
  }

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth }),
    emailAddress: connection.emailAddress,
    connectionId: connection.id,
  };
}

function decodeHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    // Prefer text/plain over text/html
    const text = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (text?.body?.data) return decodeBase64Url(text.body.data);
    const html = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html?.body?.data) {
      return decodeBase64Url(html.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Recurse into multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function parseFromAddress(raw: string): { address: string; name: string | null; domain: string } {
  // "Foo Bar" <foo@bar.com>
  const match = raw.match(/^\s*(?:"?([^"<]*?)"?\s+)?<([^>]+)>\s*$/) ?? raw.match(/^\s*([^<\s]+@[^>\s]+)\s*$/);
  let name: string | null = null;
  let address = raw.trim();
  if (match) {
    if (match.length === 3) {
      name = match[1]?.trim() || null;
      address = match[2]!.trim();
    } else {
      address = match[1]!.trim();
    }
  }
  const domain = address.split('@')[1]?.toLowerCase() ?? '';
  return { address: address.toLowerCase(), name, domain };
}

export function normalizeGmailMessage(message: gmail_v1.Schema$Message): NormalizedEmail | null {
  if (!message.id || !message.threadId) return null;
  const headers = message.payload?.headers;
  const fromRaw = decodeHeader(headers, 'from');
  const { address, name, domain } = parseFromAddress(fromRaw);
  const subject = decodeHeader(headers, 'subject');
  const dateRaw = decodeHeader(headers, 'date');
  const receivedAt = dateRaw ? new Date(dateRaw) : new Date(Number(message.internalDate ?? Date.now()));
  const body = extractBody(message.payload);
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    fromAddress: address,
    fromDomain: domain,
    fromName: name,
    subject,
    snippet: message.snippet ?? '',
    body,
    receivedAt,
  };
}

export async function listJobMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults = 500,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < maxResults) {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(100, maxResults - ids.length),
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    if (!res.data.nextPageToken) break;
    pageToken = res.data.nextPageToken;
  }
  return ids;
}

export const BACKFILL_QUERY = [
  'newer_than:90d',
  '(from:greenhouse.io OR from:lever.co OR from:myworkday.com OR from:ashbyhq.com',
  'OR from:workable.com OR from:smartrecruiters.com OR from:bamboohr.com OR from:jobvite.com',
  'OR from:taleo.net OR from:icims.com OR from:linkedin.com OR from:indeed.com',
  'OR subject:application OR subject:interview OR subject:"thank you for applying")',
].join(' ');
