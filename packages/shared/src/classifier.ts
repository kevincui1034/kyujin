import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import {
  hasJobApplicationSubjectMarker,
  isBlockedSenderDomain,
  isJobSenderDomain,
  looksLikeCareerSender,
} from './sender-domains';
import { buildClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from './prompts';
import { classifierLabel, type ClassificationResult, type NormalizedEmail } from './types';

// Handshake notification templates have rigid subject lines we can route
// without an LLM round-trip. Both patterns are noise that consistently
// confuses the model when it sees only the subject (DMs read like interview
// requests; job recommendations read like applied confirmations).
// Subjects on Handshake notification emails that should always be `ignore`.
// New patterns observed in real inbox data go here. The list is intentionally
// narrow — confirmation subjects ("Your application was sent to X", "✅ You
// applied to X") fall through to the LLM and become `applied`.
const HANDSHAKE_NOISE_SUBJECTS: RegExp[] = [
  /\bmessaged you about a job\b/i,
  /\bfollowed[- ]up about a job\b/i,
  /let'?s talk about your next career move/i,
  /^your saved job\b/i,
  /\b(?:is about to close|applications? closing|closing soon)\b/i,
  /^new\s.+\sat\s/i, // job recommendations: "New {Role} at {Company}"
  /\bapply here to\b/i, // "Apply here to teach Science at Uncommon"
  /^quick reminder\b/i, // generic reminder template
];

// Body signals that mark a Handshake DM regardless of how the subject reads.
// Handshake's messaging notification always opens the body with these
// phrasings, even when the subject is a recruiter-authored teaser.
const HANDSHAKE_DM_BODY: RegExp[] = [
  /\b(?:just )?messaged you about a job\b/i,
  /\b(?:just )?followed[- ]up about a job\b/i,
  /\byou have a new message from\b/i,
];

function classifyHandshakeTemplate(email: NormalizedEmail): ClassificationResult | null {
  if (!email.fromDomain.toLowerCase().endsWith('joinhandshake.com')) return null;
  const subject = email.subject ?? '';
  for (const rx of HANDSHAKE_NOISE_SUBJECTS) {
    if (rx.test(subject)) return { label: 'ignore', confidence: 1, method: 'regex' };
  }
  // Body fast-path: the DM-style notification has a fixed opening even when
  // the subject was authored by a recruiter and looks like a real email.
  const bodyHead = (email.body ?? '').slice(0, 400);
  for (const rx of HANDSHAKE_DM_BODY) {
    if (rx.test(bodyHead)) return { label: 'ignore', confidence: 1, method: 'regex' };
  }
  return null;
}

// Re-exported so other workspace packages (e.g. the chat agent) can reuse
// the same provider + default model without adding @ai-sdk/google as a
// direct dependency.
export { google };
export const AGENT_DEFAULT_MODEL_ID = 'gemini-2.5-flash-lite';
const MODEL_ID = AGENT_DEFAULT_MODEL_ID;
// Direct Google provider via @ai-sdk/google. Reads GOOGLE_GENERATIVE_AI_API_KEY
// (or GOOGLE_API_KEY) from env at call time — no Vercel AI Gateway in the path.
const MODEL = google(MODEL_ID);

const llmSchema = z.object({
  label: classifierLabel,
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  role: z.string().nullable(),
  jobId: z.string().nullable(),
});

export interface UserSenderRuleSet {
  allow: Set<string>;
  block: Set<string>;
}

// Every email past the sender filter goes through the LLM. We tried a subject-
// regex shortcut and a sender+subject template cache, but both produced wrong
// company/role: regex-path emails had no extraction at all, and the cache key
// collides across companies that share an ATS sender (Greenhouse, Ashby) when
// the subject doesn't carry the company name. The LLM call costs ~$0.0002 per
// email on Flash Lite, which is acceptable for the correctness gain.

// Cheap, no-network classification stage. Returns a ClassificationResult when
// the email can be decided from sender/subject/template alone (block/allow
// filter + Handshake template hits), or `null` when the email needs the LLM.
// Split out so callers can enforce per-user quotas before paying the token
// cost — the LLM call itself lives in classifyLlm().
export function preClassify(
  email: NormalizedEmail,
  userRules?: UserSenderRuleSet,
): ClassificationResult | null {
  const domain = email.fromDomain.toLowerCase();

  if (userRules?.block.has(domain)) {
    return { label: 'ignore', confidence: 1, method: 'filter' };
  }
  const userAllowed = userRules?.allow.has(domain) === true;

  if (!userAllowed) {
    if (process.env.CLASSIFIER_DISABLE_SENDER_FILTER) {
      if (isBlockedSenderDomain(domain)) {
        return { label: 'ignore', confidence: 1, method: 'filter' };
      }
    } else {
      // Default sender filter, with two escape hatches for company-direct mail
      // the static allowlist can't keep up with:
      //   (a) the domain has a careers/talent/recruiting label, or
      //   (b) the subject contains a strong job-application marker.
      // The blocklist still applies in both cases so obvious mass mailers
      // (mailchimp, etc.) can't sneak through.
      const isAllowed =
        isJobSenderDomain(domain) ||
        looksLikeCareerSender(domain) ||
        hasJobApplicationSubjectMarker(email.subject);
      if (!isAllowed || isBlockedSenderDomain(domain)) {
        return { label: 'ignore', confidence: 1, method: 'filter' };
      }
    }
  }

  // Handshake template pre-filter: DMs and job recommendations from
  // notifications.joinhandshake.com are noise that the LLM consistently
  // mislabels as interview/applied. Short-circuit them here.
  const templated = classifyHandshakeTemplate(email);
  if (templated) return templated;

  return null;
}

// LLM-only stage. Callers must have already run preClassify() and confirmed
// the per-user monthly cap has headroom; this function blindly calls the
// model and bills the tokens.
export async function classifyLlm(email: NormalizedEmail): Promise<ClassificationResult> {
  const { object, usage } = await generateObject({
    model: MODEL,
    schema: llmSchema,
    system: CLASSIFIER_SYSTEM_PROMPT,
    prompt: buildClassifierPrompt(email),
    temperature: 0,
  });

  return {
    label: object.label,
    confidence: object.confidence,
    method: 'llm',
    model: MODEL_ID,
    company: object.company,
    role: object.role,
    jobId: object.jobId,
    promptTokens: usage?.inputTokens,
    completionTokens: usage?.outputTokens,
    raw: object,
  };
}

// Convenience wrapper for callers that don't need quota gating (dev routes,
// tests). The production worker uses preClassify + classifyLlm directly so
// it can enforce the monthly cap between them.
export async function classify(
  email: NormalizedEmail,
  userRules?: UserSenderRuleSet,
): Promise<ClassificationResult> {
  const pre = preClassify(email, userRules);
  if (pre) return pre;
  return classifyLlm(email);
}
