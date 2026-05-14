import { createHash } from 'node:crypto';
import { generateObject } from 'ai';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@kyujin/db/client';
import { templateCache } from '@kyujin/db/schema';
import { isJobSenderDomain } from './sender-domains';
import { matchSubjectRegex, normalizeSubject } from './subject-regex';
import { buildClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from './prompts';
import {
  APPLICATION_STATUSES,
  classifierLabel,
  type ApplicationStatus,
  type ClassificationResult,
  type ClassifierLabel,
  type NormalizedEmail,
} from './types';

const MODEL = 'google/gemini-2.5-flash-lite';

const llmSchema = z.object({
  label: classifierLabel,
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  role: z.string().nullable(),
});

function buildCacheKey(senderDomain: string, normalizedSubject: string): string {
  return createHash('sha256').update(`${senderDomain}::${normalizedSubject}`).digest('hex').slice(0, 32);
}

function isPersistableLabel(label: ClassifierLabel): label is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(label);
}

export async function classify(email: NormalizedEmail): Promise<ClassificationResult> {
  // 1. Sender allowlist
  if (!isJobSenderDomain(email.fromDomain)) {
    return { label: 'ignore', confidence: 1, method: 'filter' };
  }

  // 2. Subject regex
  const regexHit = matchSubjectRegex(email.subject);
  if (regexHit) {
    return { label: regexHit, confidence: 0.9, method: 'regex' };
  }

  // 3. Template cache
  const normalized = normalizeSubject(email.subject);
  const cacheKey = buildCacheKey(email.fromDomain, normalized);

  const cached = await db
    .select()
    .from(templateCache)
    .where(eq(templateCache.cacheKey, cacheKey))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0]!;
    await db
      .update(templateCache)
      .set({ hits: sql`${templateCache.hits} + 1`, lastSeenAt: new Date() })
      .where(eq(templateCache.cacheKey, cacheKey));
    return { label: row.label, confidence: 0.85, method: 'cache' };
  }

  // 4. LLM fallback via AI Gateway
  const { object, usage } = await generateObject({
    model: MODEL,
    schema: llmSchema,
    system: CLASSIFIER_SYSTEM_PROMPT,
    prompt: buildClassifierPrompt(email),
    temperature: 0,
  });

  // Persist template cache so future identical templates skip the LLM
  if (isPersistableLabel(object.label)) {
    await db
      .insert(templateCache)
      .values({
        cacheKey,
        senderDomain: email.fromDomain,
        subjectPattern: normalized.slice(0, 500),
        label: object.label,
      })
      .onConflictDoNothing();
  }

  return {
    label: object.label,
    confidence: object.confidence,
    method: 'llm',
    model: MODEL,
    company: object.company,
    role: object.role,
    promptTokens: usage?.inputTokens,
    completionTokens: usage?.outputTokens,
    raw: object,
  };
}
