import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { userSenderRules } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { validateBody, z } from '@/lib/with-validated-body';

export const dynamic = 'force-dynamic';

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const bodySchema = z.object({
  domain: z.string().min(1).max(253),
  type: z.enum(['allow', 'block']),
  note: z.string().max(200).optional(),
});

function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  if (d.startsWith('@')) d = d.slice(1);
  // Allow users to paste a full address; keep only the domain part.
  const at = d.lastIndexOf('@');
  if (at >= 0) d = d.slice(at + 1);
  // Strip surrounding angle brackets / whitespace artifacts.
  d = d.replace(/^[<>"\s]+|[<>"\s]+$/g, '');
  if (!DOMAIN_RE.test(d)) return null;
  return d;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const rules = await db
    .select()
    .from(userSenderRules)
    .where(eq(userSenderRules.userId, session.user.id))
    .orderBy(asc(userSenderRules.type), asc(userSenderRules.domain));
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const parsed = await validateBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { domain: raw, type, note } = parsed.data;

  const domain = normalizeDomain(raw);
  if (!domain) {
    return apiError('invalid_body', {
      message: 'invalid_domain',
      details: { hint: 'expected something like "example.com"' },
    });
  }
  const [inserted] = await db
    .insert(userSenderRules)
    .values({
      userId: session.user.id,
      domain,
      type,
      note: note?.slice(0, 200) ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return NextResponse.json({ rule: inserted ?? { domain, type, duplicate: true } });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return apiError('unauthenticated');
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return apiError('invalid_query', { message: 'id required' });
  }
  await db
    .delete(userSenderRules)
    .where(and(eq(userSenderRules.id, id), eq(userSenderRules.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
