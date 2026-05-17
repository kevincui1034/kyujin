import { NextResponse, type NextRequest } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { userSenderRules, type SenderRuleType } from '@kyujin/db/schema';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

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
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const rules = await db
    .select()
    .from(userSenderRules)
    .where(eq(userSenderRules.userId, session.user.id))
    .orderBy(asc(userSenderRules.type), asc(userSenderRules.domain));
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    domain?: string;
    type?: SenderRuleType;
    note?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { domain: raw, type, note } = body;
  if (type !== 'allow' && type !== 'block') {
    return NextResponse.json({ error: 'type must be "allow" or "block"' }, { status: 400 });
  }
  const domain = raw ? normalizeDomain(raw) : null;
  if (!domain) {
    return NextResponse.json(
      { error: 'invalid_domain', hint: 'expected something like "example.com"' },
      { status: 400 },
    );
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
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  await db
    .delete(userSenderRules)
    .where(and(eq(userSenderRules.id, id), eq(userSenderRules.userId, session.user.id)));
  return NextResponse.json({ ok: true });
}
