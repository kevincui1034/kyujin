import { NextResponse, type NextRequest } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import { google, AGENT_DEFAULT_MODEL_ID, APPLICATION_STATUSES } from '@kyujin/shared';
import { db } from '@kyujin/db/client';
import { chatUsage } from '@kyujin/db/schema';
import { auth } from '@/auth';
import { agentAction, type AgentAction, type AgentAppRow } from '@/lib/agent/tools';
import { fetchApplicationsForPrompt, resolveFilter } from '@/lib/agent/resolve';

export const dynamic = 'force-dynamic';

// Daily cap per user. One row in chat_usage per /api/agent/chat call; we
// reject when the rolling-24h count hits this. 50/day caps the redlined
// chat cost at ~$1/user/month on Gemini 2.5 Flash Lite.
const DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

// Cap on message history we forward to the model. Old turns add tokens and
// cost more than they add signal once the user has moved on.
const MESSAGE_HISTORY_LIMIT = 12;

interface ChatBody {
  messages?: unknown;
  context?: { currentApplicationId?: unknown };
}

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

// Top-level response schema. `action` is the structured tool call the model
// chose; null means it's responding with text only (small talk, clarifying
// question without a candidate picker, refusal, etc.).
const responseSchema = z.object({
  reply: z.string().min(1).max(2000),
  action: agentAction.nullable(),
});

function buildSystemPrompt(apps: AgentAppRow[], currentApplicationId: string | null): string {
  const appsCsv = apps
    .map((a) => {
      const role = a.role ?? '';
      const date = a.lastEventAt.slice(0, 10);
      return `${a.id},"${a.company.replace(/"/g, '""')}","${role.replace(/"/g, '""')}",${a.status},${date}`;
    })
    .join('\n');

  const currentBlock = currentApplicationId
    ? `\n\nThe user is currently viewing application id: ${currentApplicationId}. When they say "this", "this one", "this application", or refer to an application without naming a company, the target is this id.`
    : `\n\nThe user is NOT on a specific application detail page. If they say "this" without naming a company, emit a \`clarify\` action asking which application they mean.`;

  return [
    `You are the in-app assistant for a job-application tracker. The user will type corrections, bulk operations, or read-only queries about their applications. You MUST respond with structured JSON matching the response schema.`,
    ``,
    `Available actions (set in \`action\`):`,
    `- update_application: change one field on one application. fields: company | role | status | notes. status values: ${APPLICATION_STATUSES.join(', ')}.`,
    `- bulk_update: change one field across many applications matching a filter. field: status | notes ONLY (no bulk company/role). Filter supports { company, status, ghostedPastDays }.`,
    `- query_applications: read-only listing. Use for "show me X" questions.`,
    `- clarify: when a reference is ambiguous (multiple Stripe roles, "this" with no context, etc.). Include candidateIds when you can narrow to specific rows.`,
    ``,
    `Rules:`,
    `- Pick applicationId values ONLY from the embedded list below. NEVER invent ids.`,
    `- For status changes, value MUST be one of: ${APPLICATION_STATUSES.join(', ')}.`,
    `- If you cannot resolve a reference unambiguously, emit \`clarify\` rather than guessing.`,
    `- If the user just chats (no actionable request), set action=null and respond conversationally.`,
    `- \`reply\` is what the user sees — keep it under 2 sentences, no markdown.`,
    currentBlock,
    ``,
    `The user's applications (id,company,role,status,lastEventDate):`,
    appsCsv || '(none yet — the user has no applications)',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const parsedMessages = z.array(messageSchema).max(50).safeParse(body.messages);
  if (!parsedMessages.success) {
    return NextResponse.json({ error: 'invalid_messages' }, { status: 400 });
  }
  const messages = parsedMessages.data.slice(-MESSAGE_HISTORY_LIMIT);

  // Rate limit: count chat_usage rows from the last 24h. Race condition is
  // mild here — two concurrent requests at the boundary may both pass the
  // check and write rows, putting the user one over the cap. That's
  // acceptable; we'd rather slightly over-allow than serialize chat through
  // a row lock.
  const since = new Date(Date.now() - DAY_MS);
  const [usageRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatUsage)
    .where(and(eq(chatUsage.userId, userId), gte(chatUsage.createdAt, since)));
  const used = usageRow?.count ?? 0;
  if (used >= DAILY_LIMIT) {
    return NextResponse.json(
      {
        error: 'rate_limited',
        limit: DAILY_LIMIT,
        used,
        retryAfterSeconds: 60 * 60,
      },
      { status: 429 },
    );
  }
  await db.insert(chatUsage).values({ userId });

  // Validate currentApplicationId against the user's apps before passing it
  // to the model — prevents a malicious client from getting an arbitrary id
  // injected into the system prompt.
  const apps = await fetchApplicationsForPrompt(userId);
  const ownedIds = new Set(apps.map((a) => a.id));
  const requestedCurrent =
    typeof body.context?.currentApplicationId === 'string'
      ? body.context.currentApplicationId
      : null;
  const currentApplicationId =
    requestedCurrent && ownedIds.has(requestedCurrent) ? requestedCurrent : null;

  const system = buildSystemPrompt(apps, currentApplicationId);

  let object: z.infer<typeof responseSchema>;
  try {
    const result = await generateObject({
      model: google(AGENT_DEFAULT_MODEL_ID),
      schema: responseSchema,
      system,
      messages,
      temperature: 0,
    });
    object = result.object;
  } catch (err) {
    console.error('[agent/chat] generateObject failed', err);
    return NextResponse.json({ error: 'model_failure' }, { status: 502 });
  }

  let action: AgentAction | null = object.action;

  // Server-side guardrails: even with schema validation, the model can pick
  // an id it shouldn't or emit a tool call we want to reshape before the
  // client renders the preview.
  if (action?.type === 'update_application') {
    if (!ownedIds.has(action.args.applicationId)) {
      action = {
        type: 'clarify',
        args: {
          question: "I couldn't find that application — which one did you mean?",
        },
      };
    }
  }

  // For clarify with candidateIds, attach full rows so the picker can render
  // company/role/status without a second round-trip.
  let candidates: AgentAppRow[] | undefined;
  if (action?.type === 'clarify' && action.args.candidateIds?.length) {
    const owned = action.args.candidateIds.filter((id) => ownedIds.has(id));
    candidates = apps.filter((a) => owned.includes(a.id));
  }

  // For bulk_update and query_applications, pre-resolve so the preview can
  // render the affected row list without the client doing its own lookup.
  let resolvedRows: AgentAppRow[] | undefined;
  if (action?.type === 'bulk_update' || action?.type === 'query_applications') {
    resolvedRows = await resolveFilter(userId, action.args.filter, 100);
  }

  return NextResponse.json({
    reply: object.reply,
    action,
    candidates,
    resolvedRows,
  });
}
