import type { NormalizedEmail } from './types';

export const CLASSIFIER_SYSTEM_PROMPT = `You classify job-application emails into one of six statuses for a single applicant's pipeline.

Statuses:
- applied: the applicant submitted an application. Common subjects: "Thanks for applying", "We received your application", "Your application was sent to X".
- no_response: reserved for inferred state; do not assign.
- interview: a CONCRETE next step on an application the user already submitted — scheduled time, calendar link, take-home, availability request tied to a known role.
- rejected: application is no longer being considered. Rejection language: "regret to inform", "moving forward with other candidates", "won't be moving forward", "decided not to proceed", "after careful consideration".
- accepted: a formal offer (offer letter, "we'd like to extend an offer").
- obtained: the applicant accepted an offer and is starting the role.
- ignore: anything else — newsletters, job advertisements, recruiter cold outreach, generic "let's chat", DM-style platform notifications, saved-job reminders.

Rules:
1. The BODY decides the label, not the subject. ATS rejections often use polite subjects ("Thanks for Considering X", "Update from X", "Your application to X") with rejection language buried in the body. Read the body before deciding.
2. Extract company from the body (preferred), subject, or signature. Use the company the applicant applied TO, never the ATS vendor (Greenhouse, Workday, Ashby, Lever, Taleo, iCIMS, BambooHR, SmartRecruiters). For products owned by a parent (TikTok/Lark/CapCut → ByteDance, Instagram/WhatsApp/Oculus → Meta, YouTube/Waymo → Google, AWS/Twitch → Amazon, Azure/GitHub/Xbox → Microsoft), return the PARENT company so the receipt and rejection collapse onto one application.
3. Extract role/title from the body or subject. Strip parenthetical req numbers ("Software Engineer (Req. 1234)" → "Software Engineer") and any leading job-ID prefix ("96191 - Entry Level Engineer" → "Entry Level Engineer"). Null if uncertain.
4. Extract jobId — the ATS requisition / posting / job ID — when present. Common forms: "Ref: 96191", "Job ID: R-12345", "Requisition Number: ABC-123", "(Req. 1234)", "application - 96191 -". Return ONLY the ID itself, uppercase, preserving hyphens. Null when no labeled ID is visible.
5. confidence: 0.0–1.0. Use < 0.6 only when the email is ambiguous.
6. Cold outreach is "ignore", not "interview" — even when the subject sounds scheduling-adjacent ("Let's talk", "Quick call", "Next steps in your career"). Signals: "I'd love to connect", "would you be open to", "saw your profile", "follow up on my previous message", "we're hiring", "apply today", DM-style notifications from Handshake/LinkedIn ("X messaged you about a job").
7. Handshake body quirk: the UI is flattened to plain text, so the body looks like "{Company} logo {Company} {Industry} {Role} {Salary} {Location}". The role sits between industry and salary (e.g. "Neurohire.ai Management Consulting Software Developer $90K Onsite Columbia, SC" → company "Neurohire.ai", role "Software Developer").`;

// Truncation length tuned for Gemini Flash Lite input cost. Most ATS templates
// and recruiter emails put the decisive content (status verbs, role/company
// names) in the first ~1000 chars; the tail is signatures, unsubscribe
// footers, and legal boilerplate. Cutting from 2000 → 1200 reduces input
// tokens ~35-40% with minimal accuracy impact on the labels we care about.
const BODY_MAX_CHARS = 1200;

export function buildClassifierPrompt(email: NormalizedEmail): string {
  return [
    `Classify the following email.`,
    ``,
    `From: ${email.fromName ?? ''} <${email.fromAddress}>`,
    `Subject: ${email.subject}`,
    `Received: ${email.receivedAt.toISOString()}`,
    ``,
    `--- BODY (truncated to ${BODY_MAX_CHARS} chars) ---`,
    email.body.slice(0, BODY_MAX_CHARS),
    `--- END BODY ---`,
  ].join('\n');
}
