import type { NormalizedEmail } from './types';

export const CLASSIFIER_SYSTEM_PROMPT = `You classify job-application emails into one of six statuses for a single applicant's pipeline tracker.

Statuses:
- applied: confirmation that the applicant submitted an application ("thanks for applying", auto-replies from ATS)
- no_response: not used by the classifier; reserved for inferred state
- interview: invitation to interview, schedule a call, recruiter outreach for an active application
- rejected: application is no longer being considered (any wording — "moving forward with other candidates" counts)
- accepted: a formal offer (offer letter, "we'd like to extend an offer")
- obtained: applicant accepted an offer and starts a role (rare in inbox — usually inferred manually)
- ignore: not a job-application email at all (newsletter, marketing, recruiter cold-outreach for unrelated roles)

Rules:
1. Choose ONE status. Pick "ignore" if it's not actually about this applicant's pipeline.
2. Extract company name from the sender, signature, or subject. Prefer the company the applicant applied TO, not the ATS vendor (e.g. "Stripe", not "Greenhouse").
3. Extract role/title if present in the email. Null if uncertain.
4. confidence: 0.0–1.0. Use < 0.6 only if the email is ambiguous.
5. Recruiter cold-outreach for roles the applicant has NOT applied to → "ignore" (not "interview").`;

export function buildClassifierPrompt(email: NormalizedEmail): string {
  return [
    `Classify the following email.`,
    ``,
    `From: ${email.fromName ?? ''} <${email.fromAddress}>`,
    `Subject: ${email.subject}`,
    `Received: ${email.receivedAt.toISOString()}`,
    ``,
    `--- BODY (truncated to 2000 chars) ---`,
    email.body.slice(0, 2000),
    `--- END BODY ---`,
  ].join('\n');
}
