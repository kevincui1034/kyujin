import { and, eq } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { applications, emailMessages, classifications } from '@kyujin/db/schema';
import type { ApplicationStatus, ClassificationResult, NormalizedEmail } from './types';

const STATUS_PRECEDENCE: Record<ApplicationStatus, number> = {
  applied: 0,
  no_response: 1,
  interview: 2,
  rejected: 3,
  accepted: 4,
  obtained: 5,
};

function strongerStatus(a: ApplicationStatus, b: ApplicationStatus): ApplicationStatus {
  return STATUS_PRECEDENCE[b] > STATUS_PRECEDENCE[a] ? b : a;
}

// Apply a classification result to the applications table: upsert by
// (userId, company, role) and bump status if the new label is stronger.
// Rejection always wins over interview (status precedence handles this), but
// interview does NOT downgrade a rejection — once rejected, stays rejected.
export async function upsertApplicationFromClassification(params: {
  userId: string;
  email: NormalizedEmail;
  emailMessageRowId: string;
  classification: ClassificationResult;
}): Promise<string | null> {
  const { userId, email, emailMessageRowId, classification } = params;
  if (classification.label === 'ignore') return null;

  const label = classification.label;
  // The classifier may emit `no_response`, but that's only meaningful as a
  // derived state. Treat it as applied for the purpose of creating a row.
  const status: ApplicationStatus = label === 'no_response' ? 'applied' : label;

  const company = classification.company?.trim() || fallbackCompany(email);
  const role = classification.role?.trim() || null;

  const existing = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.company, company),
        role ? eq(applications.role, role) : eq(applications.role, ''),
      ),
    )
    .limit(1);

  let applicationId: string;

  if (existing.length === 0) {
    const inserted = await db
      .insert(applications)
      .values({
        userId,
        company,
        role,
        sourceDomain: email.fromDomain,
        status,
        firstSeenAt: email.receivedAt,
        lastEventAt: email.receivedAt,
      })
      .returning({ id: applications.id });
    applicationId = inserted[0]!.id;
  } else {
    const row = existing[0]!;
    const newStatus = strongerStatus(row.status, status);
    await db
      .update(applications)
      .set({
        status: newStatus,
        lastEventAt: row.lastEventAt < email.receivedAt ? email.receivedAt : row.lastEventAt,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, row.id));
    applicationId = row.id;
  }

  await db
    .update(emailMessages)
    .set({ applicationId, classifiedAt: new Date() })
    .where(eq(emailMessages.id, emailMessageRowId));

  await db.insert(classifications).values({
    emailMessageId: emailMessageRowId,
    label: status,
    confidence: classification.confidence,
    method: classification.method,
    model: classification.model,
    promptTokens: classification.promptTokens,
    completionTokens: classification.completionTokens,
    company,
    role,
    raw: classification.raw as object | undefined,
  });

  return applicationId;
}

function fallbackCompany(email: NormalizedEmail): string {
  if (email.fromName && email.fromName.length > 1) return email.fromName;
  const parts = email.fromDomain.split('.');
  return parts.length > 1 ? parts[parts.length - 2]! : email.fromDomain;
}
