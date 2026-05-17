import { NextResponse, type NextRequest } from 'next/server';
import { Resend } from 'resend';
import { auth } from '@/auth';
import { apiError } from '@/lib/api-errors';
import { enforceRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_MESSAGE_LEN = 4000;
const CATEGORIES = ['bug', 'idea', 'praise', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  // 5/hour keeps the inbox from being spammed by a single user. Genuine
  // feedback rarely needs more than one submission per session.
  const limited = await enforceRateLimit({
    userId: session.user.id,
    key: 'user:feedback',
    window: '1h',
    max: 5,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as {
    category?: string;
    message?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const category = isCategory(body.category) ? body.category : 'other';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length === 0) {
    return NextResponse.json(
      { error: 'message_required', hint: 'tell us what you want to share' },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: 'message_too_long', hint: `max ${MAX_MESSAGE_LEN} characters` },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!apiKey || !from || !to) {
    return NextResponse.json({ error: 'feedback_not_configured' }, { status: 503 });
  }

  const userEmail = session.user.email ?? 'unknown';
  const userId = session.user.id;
  const subject = `[Kyujin feedback · ${category}] from ${userEmail}`;
  const text = [
    `From: ${userEmail} (user ${userId})`,
    `Category: ${category}`,
    '',
    message,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:14px">
      <p><strong>From:</strong> ${escapeHtml(userEmail)} (user <code>${escapeHtml(userId)}</code>)</p>
      <p><strong>Category:</strong> ${escapeHtml(category)}</p>
      <hr />
      <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(message)}</pre>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      replyTo: userEmail !== 'unknown' ? userEmail : undefined,
      subject,
      text,
      html,
    });
    if (result.error) {
      return apiError('upstream_failed', { cause: result.error.message });
    }
  } catch (err) {
    return apiError('upstream_failed', { cause: err });
  }

  return NextResponse.json({ ok: true });
}
