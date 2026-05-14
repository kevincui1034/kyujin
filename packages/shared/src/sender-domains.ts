// Sender-domain allowlist. Email NOT matching one of these is `ignore` without
// further work. This is the most important cost-control lever in the pipeline —
// keep it tight, expand from observed inbox data, not speculation.

export const JOB_SENDER_DOMAINS = new Set<string>([
  // ATS platforms
  'greenhouse.io',
  'lever.co',
  'myworkday.com',
  'wd1.myworkdayjobs.com',
  'wd5.myworkdayjobs.com',
  'ashbyhq.com',
  'workable.com',
  'smartrecruiters.com',
  'bamboohr.com',
  'jobvite.com',
  'taleo.net',
  'icims.com',
  'breezy.hr',
  'recruitee.com',
  'jazzhr.com',
  'eightfold.ai',
  // Job boards that proxy through their own domain
  'notify.linkedin.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'angel.co',
  'wellfound.com',
  'hired.com',
  'otta.com',
  'ycombinator.com', // Work at a Startup
  // Some companies send direct
  'no-reply.greenhouse.io',
]);

// Suffix match — covers subdomains like "careers.stripe.com" if we choose to add
// company-direct addresses later. For now we still gate the main allowlist on
// exact match because adding wildcards explodes the LLM-fallback set.
const SUFFIX_DOMAINS: string[] = [
  '.greenhouse-mail.io',
  '.myworkdayjobs.com',
  '.ashbyhq.com',
  '.lever.co',
];

export function isJobSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (JOB_SENDER_DOMAINS.has(d)) return true;
  return SUFFIX_DOMAINS.some((suffix) => d.endsWith(suffix));
}
