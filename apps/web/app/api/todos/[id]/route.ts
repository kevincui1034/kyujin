import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { todoJobs } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    company: z.string().max(200).nullable().optional(),
    position: z.string().max(200).nullable().optional(),
    notes: z.string().max(20_000).optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const parsed = await validateBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.company !== undefined) {
    updates.company = body.company === null ? null : body.company.trim() || null;
  }
  if (body.position !== undefined) {
    updates.position = body.position === null ? null : body.position.trim() || null;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length === 1) {
    return apiError('invalid_body', { message: 'no_fields' });
  }

  const [row] = await db
    .update(todoJobs)
    .set(updates)
    .where(and(eq(todoJobs.userId, userId), eq(todoJobs.id, id)))
    .returning();

  if (!row) return apiError('not_found');
  return NextResponse.json({ todo: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const userId = session.user.id;
  const { id } = await ctx.params;

  const [row] = await db
    .delete(todoJobs)
    .where(and(eq(todoJobs.userId, userId), eq(todoJobs.id, id)))
    .returning({ id: todoJobs.id });

  if (!row) return apiError('not_found');
  return NextResponse.json({ ok: true });
}
