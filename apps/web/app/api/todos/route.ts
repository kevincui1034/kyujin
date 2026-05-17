import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { todoJobs } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';
import { extractJobMetadata } from '@/lib/todo-extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const createSchema = z
  .object({
    url: z.string().max(2000).nullable().optional(),
    company: z.string().max(200).nullable().optional(),
    position: z.string().max(200).nullable().optional(),
    notes: z.string().max(20_000).optional(),
  })
  .strict();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const rows = await db
    .select()
    .from(todoJobs)
    .where(eq(todoJobs.userId, session.user.id))
    .orderBy(desc(todoJobs.createdAt));
  return NextResponse.json({ todos: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;

  const parsed = await validateBody(req, createSchema);
  if (!parsed.ok) return parsed.response;

  const rawUrl = parsed.data.url?.trim() || null;
  let company: string | null = parsed.data.company?.trim() || null;
  let position: string | null = parsed.data.position?.trim() || null;

  if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
    return apiError('invalid_body', { message: 'url_must_be_http' });
  }

  // Require at least one identifying field. An entry with neither URL, company,
  // nor position is just an empty row.
  if (!rawUrl && !company && !position) {
    return apiError('invalid_body', { message: 'need_url_or_details' });
  }

  // Re-pasting an existing URL surfaces the prior row instead of failing with
  // a 409. Skipped for URL-less entries: multiple "Acme — Engineer" referrals
  // are legitimately distinct rows and Postgres treats each NULL as unique.
  if (rawUrl) {
    const [existing] = await db
      .select()
      .from(todoJobs)
      .where(and(eq(todoJobs.userId, userId), eq(todoJobs.url, rawUrl)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ todo: existing, existed: true });
    }
  }

  // Only run extraction when we have a URL and the user didn't fill both
  // fields manually. Saves the fetch + LLM round-trip in the common
  // "fully manual" path.
  if (rawUrl && (!company || !position)) {
    const meta = await extractJobMetadata(rawUrl);
    company = company ?? meta.company;
    position = position ?? meta.position;
  }

  const [row] = await db
    .insert(todoJobs)
    .values({
      userId,
      url: rawUrl,
      company,
      position,
      notes: parsed.data.notes ?? '',
    })
    .returning();

  return NextResponse.json({ todo: row });
}
