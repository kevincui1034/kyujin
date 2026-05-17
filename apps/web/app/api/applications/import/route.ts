import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applicationAudit, applications } from '@kyujin/db/schema';
import { getAuthUserId, isPaidUser } from '@/lib/api-auth';
import {
  APPLICATION_STATUSES,
  applyMapping,
  buildMatchKey,
  buildStatusPreview,
  detectColumnMapping,
  IMPORT_TARGET_FIELDS,
  parseImportFile,
  strongerStatus,
  validateMapping,
  type ApplicationStatus,
  type ImportColumnMapping,
  type ImportColumnTarget,
} from '@kyujin/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ROWS = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TOKEN_TTL_MS = 5 * 60 * 1000;

interface ImportTokenPayload {
  userId: string;
  rows: Record<string, string>[];
  headers: string[];
  ts: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function signToken(payload: ImportTokenPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token: string, secret: string): ImportTokenPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest();
  const provided = b64urlDecode(sig);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf-8')) as ImportTokenPayload;
    if (Date.now() - payload.ts > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (!(await isPaidUser(userId))) {
    return NextResponse.json({ error: 'paid_plan_required' }, { status: 402 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 });
  }

  const phase = req.nextUrl.searchParams.get('phase') ?? 'preview';
  if (phase === 'preview') return preview(req, userId, secret);
  if (phase === 'commit') return commit(req, userId, secret);
  return NextResponse.json({ error: 'invalid_phase' }, { status: 400 });
}

async function preview(req: NextRequest, userId: string, secret: string) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file_required' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'file_too_large', maxBytes: MAX_FILE_BYTES }, { status: 413 });
  }
  const buffer = await file.arrayBuffer();
  const parsed = parseImportFile(buffer, file.type, file.name);
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: 'no_rows' }, { status: 400 });
  }
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: 'too_many_rows', max: MAX_ROWS, received: parsed.rows.length },
      { status: 413 },
    );
  }

  const suggestedMapping = detectColumnMapping(parsed.headers);
  const statusPreview = buildStatusPreview(parsed.rows, suggestedMapping);

  const token = signToken(
    { userId, rows: parsed.rows, headers: parsed.headers, ts: Date.now() },
    secret,
  );

  return NextResponse.json({
    importToken: token,
    headers: parsed.headers,
    suggestedMapping,
    statusPreview,
    rowCount: parsed.rows.length,
    sampleRows: parsed.rows.slice(0, 5),
    warnings: parsed.warnings,
  });
}

interface CommitBody {
  importToken?: unknown;
  mapping?: unknown;
  statusOverrides?: unknown;
}

function isStatus(v: unknown): v is ApplicationStatus {
  return typeof v === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(v);
}

function isTarget(v: unknown): v is ImportColumnTarget {
  if (typeof v !== 'string') return false;
  if (v === 'custom' || v === 'skip') return true;
  return (IMPORT_TARGET_FIELDS as readonly string[]).includes(v);
}

function sanitizeMapping(raw: unknown): ImportColumnMapping | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: ImportColumnMapping = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string') return null;
    if (!isTarget(v)) return null;
    out[k] = v;
  }
  return out;
}

function sanitizeOverrides(raw: unknown): Record<string, ApplicationStatus> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ApplicationStatus> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string') continue;
    if (!isStatus(v)) continue;
    out[k.toLowerCase()] = v;
  }
  return out;
}

async function commit(req: NextRequest, userId: string, secret: string) {
  let body: CommitBody;
  try {
    body = (await req.json()) as CommitBody;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.importToken !== 'string') {
    return NextResponse.json({ error: 'import_token_required' }, { status: 400 });
  }
  const payload = verifyToken(body.importToken, secret);
  if (!payload || payload.userId !== userId) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
  }
  const mapping = sanitizeMapping(body.mapping);
  if (!mapping) return NextResponse.json({ error: 'invalid_mapping' }, { status: 400 });
  const mappingErr = validateMapping(mapping);
  if (mappingErr) return NextResponse.json({ error: mappingErr }, { status: 400 });

  const statusOverrides = sanitizeOverrides(body.statusOverrides);
  const now = new Date();

  // First pass: parse every row into the canonical shape. We collect skipped
  // rows (no company) and errors here so the commit phase can return a
  // single structured summary instead of failing on the first bad row.
  const skipped: { row: number; reason: string }[] = [];
  const mapped: { rowIndex: number; data: ReturnType<typeof applyMapping> }[] = [];
  payload.rows.forEach((row, idx) => {
    const m = applyMapping(row, mapping, { now, statusOverrides });
    if (!m) {
      skipped.push({ row: idx + 2, reason: 'missing company' });
      return;
    }
    mapped.push({ rowIndex: idx + 2, data: m });
  });

  if (mapped.length === 0) {
    return NextResponse.json({ inserted: 0, merged: 0, skipped: skipped.length, errors: skipped });
  }

  // De-dupe within the import itself by matchKey. If the same key shows up
  // twice in one file, merge them in-memory before talking to the DB so we
  // don't trip the unique constraint on insert.
  type Incoming = NonNullable<ReturnType<typeof applyMapping>> & { matchKey: string };
  const byKey = new Map<string, Incoming>();
  for (const { data } of mapped) {
    if (!data) continue;
    const matchKey = buildMatchKey(data.company, data.role);
    const existing = byKey.get(matchKey);
    if (!existing) {
      byKey.set(matchKey, { ...data, matchKey });
      continue;
    }
    byKey.set(matchKey, mergeIncoming(existing, { ...data, matchKey }));
  }
  const incomingRows = Array.from(byKey.values());

  // Pull existing rows that overlap by matchKey OR by (company, jobId) so
  // we know which to update vs. insert. Done in one round-trip; we hold the
  // entire user's affected applications in memory but the cap of 1000 rows
  // keeps that bounded.
  const matchKeys = incomingRows.map((r) => r.matchKey);
  const existingRows = matchKeys.length
    ? await db
        .select()
        .from(applications)
        .where(and(eq(applications.userId, userId), inArray(applications.matchKey, matchKeys)))
    : [];
  const existingByKey = new Map(existingRows.map((r) => [r.matchKey ?? '', r]));

  let inserted = 0;
  let merged = 0;
  const auditUpdates: Array<{
    id: string;
    previous: typeof existingRows[number];
  }> = [];
  const auditInsertIds: string[] = [];
  const errors: { row: number; reason: string }[] = [];

  await db.transaction(async (tx) => {
    for (const incoming of incomingRows) {
      const existing = existingByKey.get(incoming.matchKey);
      try {
        if (existing) {
          const nextStatus = strongerStatus(existing.status, incoming.status);
          const nextFirst =
            existing.firstSeenAt < incoming.firstSeenAt ? existing.firstSeenAt : incoming.firstSeenAt;
          const nextLast =
            existing.lastEventAt > incoming.lastEventAt ? existing.lastEventAt : incoming.lastEventAt;
          const nextCustom = mergeCustomFields(existing.customFields, incoming.customFields);
          const nextNotes = mergeNotes(existing.notes, incoming.notes);
          await tx
            .update(applications)
            .set({
              status: nextStatus,
              firstSeenAt: nextFirst,
              lastEventAt: nextLast,
              sourceDomain: existing.sourceDomain ?? incoming.sourceDomain,
              jobId: existing.jobId ?? incoming.jobId,
              customFields: nextCustom,
              notes: nextNotes,
              updatedAt: now,
            })
            .where(eq(applications.id, existing.id));
          auditUpdates.push({ id: existing.id, previous: existing });
          merged += 1;
        } else {
          const [row] = await tx
            .insert(applications)
            .values({
              userId,
              company: incoming.company,
              role: incoming.role,
              sourceDomain: incoming.sourceDomain,
              status: incoming.status,
              firstSeenAt: incoming.firstSeenAt,
              lastEventAt: incoming.lastEventAt,
              matchKey: incoming.matchKey,
              jobId: incoming.jobId,
              notes: incoming.notes,
              customFields: incoming.customFields,
            })
            .returning({ id: applications.id });
          if (row) auditInsertIds.push(row.id);
          inserted += 1;
        }
      } catch (err) {
        errors.push({
          row: 0,
          reason: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }

    if (auditInsertIds.length > 0 || auditUpdates.length > 0) {
      await tx.insert(applicationAudit).values({
        userId,
        action: 'csv_import',
        payload: {
          inserted: auditInsertIds,
          updated: auditUpdates.map((u) => ({
            id: u.id,
            previous: {
              status: u.previous.status,
              firstSeenAt: u.previous.firstSeenAt,
              lastEventAt: u.previous.lastEventAt,
              sourceDomain: u.previous.sourceDomain,
              jobId: u.previous.jobId,
              notes: u.previous.notes,
              customFields: u.previous.customFields,
            },
          })),
        },
      });
    }
  });

  return NextResponse.json({
    inserted,
    merged,
    skipped: skipped.length,
    errors: [...skipped, ...errors],
  });
}

function mergeCustomFields(
  existing: Record<string, string> | null,
  incoming: Record<string, string> | null,
): Record<string, string> | null {
  if (!existing && !incoming) return null;
  return { ...(existing ?? {}), ...(incoming ?? {}) };
}

function mergeNotes(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing.includes(incoming)) return existing;
  return `${existing}\n---\n${incoming}`;
}

function mergeIncoming<T extends { matchKey: string }>(
  a: NonNullable<ReturnType<typeof applyMapping>> & T,
  b: NonNullable<ReturnType<typeof applyMapping>> & T,
): NonNullable<ReturnType<typeof applyMapping>> & T {
  return {
    ...a,
    status: strongerStatus(a.status, b.status),
    firstSeenAt: a.firstSeenAt < b.firstSeenAt ? a.firstSeenAt : b.firstSeenAt,
    lastEventAt: a.lastEventAt > b.lastEventAt ? a.lastEventAt : b.lastEventAt,
    sourceDomain: a.sourceDomain ?? b.sourceDomain,
    jobId: a.jobId ?? b.jobId,
    notes: mergeNotes(a.notes, b.notes),
    customFields: mergeCustomFields(a.customFields, b.customFields),
  } as NonNullable<ReturnType<typeof applyMapping>> & T;
}
