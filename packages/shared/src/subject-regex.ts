import type { ClassifierLabel } from './types';

interface Rule {
  label: ClassifierLabel;
  pattern: RegExp;
}

// Subject-line heuristics. Order matters — rejection patterns ran before
// "interview" because some rejection emails mention interviews in the past
// tense ("after your interview..."). Keep patterns conservative — false
// positives here mean misclassified applications, which is the most visible
// kind of failure.
const RULES: Rule[] = [
  // Rejections — strongest signal in the subject
  { label: 'rejected', pattern: /\b(unfortunately|regret to inform|not moving forward|other candidates|moved forward with other)\b/i },
  { label: 'rejected', pattern: /\bdecision (regarding|on) your application\b/i },
  { label: 'rejected', pattern: /\bapplication (update|status)\b.*\b(rejected|declined|unsuccessful)\b/i },

  // Interview / next steps
  { label: 'interview', pattern: /\b(schedule|invite|invitation).{0,40}\b(interview|call|chat)\b/i },
  { label: 'interview', pattern: /\b(phone|video|onsite|technical|recruiter)\s+(screen|interview|call)\b/i },
  { label: 'interview', pattern: /\bnext steps\b/i },
  { label: 'interview', pattern: /\blet'?s (chat|talk|connect)\b/i },

  // Offers
  { label: 'accepted', pattern: /\b(offer letter|job offer|we'?re (excited|pleased) to offer|extend(ing)? an offer)\b/i },

  // Applied confirmations — last because they're the noisiest
  { label: 'applied', pattern: /\b(thanks for|thank you for) (applying|your application)\b/i },
  { label: 'applied', pattern: /\bapplication (received|submitted|confirmation)\b/i },
  { label: 'applied', pattern: /\bwe(’|')?ve received your application\b/i },
];

export function matchSubjectRegex(subject: string): ClassifierLabel | null {
  for (const rule of RULES) {
    if (rule.pattern.test(subject)) return rule.label;
  }
  return null;
}

// Strip volatile bits from a subject so templates collide in the cache. For
// example, "Your application to Stripe for Senior Engineer" → "your application
// to {company} for {role}".
export function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[#\-_]+\s*\d+/g, '') // ticket numbers
    .replace(/\b(re|fwd?):\s*/gi, '')
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, '{email}')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '{date}')
    .trim();
}
