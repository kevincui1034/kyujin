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
  'joinhandshake.com',
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
  '.joinhandshake.com',
];

export function isJobSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (JOB_SENDER_DOMAINS.has(d)) return true;
  return SUFFIX_DOMAINS.some((suffix) => d.endsWith(suffix));
}

// Heuristic for company-direct senders (e.g. careers.tiktok.com,
// talent-acquisition.example.com). Companies that run their own ATS or send
// confirmations from a custom subdomain almost always use one of these tokens
// as a label in the hostname. The check is intentionally narrow to avoid
// false positives on transactional mail.
const CAREER_LABEL_RX =
  /(?:^|\.)(careers?|talent|recruit(?:ing|ment)?|jobs|hiring|hr|people)(?:[-.])/i;

export function looksLikeCareerSender(domain: string): boolean {
  return CAREER_LABEL_RX.test(domain.toLowerCase());
}

// Strong-signal job-application subject markers. When any of these match,
// the classifier lets the email through to the LLM regardless of sender. The
// LLM's prompt rules and the blocklist still keep noise out — this just stops
// us from silently dropping company-direct mail with an obvious subject.
const JOB_SUBJECT_MARKERS: RegExp[] = [
  /\bthank(?:s| you) for applying\b/i,
  /\bthank(?:s| you) for your application\b/i,
  /\bwe('?ve| have)? received your application\b/i,
  /\byour application (?:was|has been) (?:sent|received|submitted)\b/i,
  /\bapplication (?:update|received|status|confirmation|complete)\b/i,
  /\binterview (?:invitation|with|scheduled|request)\b/i,
  /\b(?:job )?offer (?:letter|of employment)\b/i,
  /\b(?:regarding|update on) your application\b/i,
];

export function hasJobApplicationSubjectMarker(subject: string | null | undefined): boolean {
  if (!subject) return false;
  return JOB_SUBJECT_MARKERS.some((rx) => rx.test(subject));
}

// Blocklist mode (used when CLASSIFIER_DISABLE_SENDER_FILTER=1). Drops obvious
// mass-mailer infrastructure cheaply so the LLM only sees plausibly-job mail.
// The LLM's prompt already handles long-tail newsletters; this list is just
// for high-volume senders where it isn't worth even one LLM call.
const BLOCKED_SENDER_DOMAINS = new Set<string>([
  // Email service providers / marketing automation
  'mailchimpapp.net',
  'mcsv.net',
  'sendgrid.net',
  'constantcontact.com',
  'hubspot.com',
  'hubspotemail.net',
  'mailgun.org',
  'klaviyo.com',
  'iterable.com',
  'customer.io',
  'braze.com',
  'brazemail.com',
  'intercom-mail.com',
  'intercom-messages.com',
  'marketo.com',
  'mktomail.com',
  'salesforce.com',
  'salesforcemarketing.com',
  'exacttarget.com',
  'pardot.com',
  'campaign-archive.com',
  'sendinblue.com',
  'sib.email',
  'amazonses.com',
  // Social / community
  'em.twitter.com',
  'reply.twitter.com',
  'communications.twitter.com',
  'facebookmail.com',
  'mail.instagram.com',
  'instagram.com',
  'youtube.com',
  'reddit.com',
  'pinterest.com',
  'discord.com',
  'discordapp.com',
  'slack.com',
  // News / publishing / content
  'substack.com',
  'medium.com',
  'quora.com',
  'nytimes.com',
  'wsj.com',
  'theatlantic.com',
  'newyorker.com',
  'bloomberg.net',
  // Shopping / receipts
  'amazon.com',
  'amazonprime.com',
  'paypal.com',
  'venmo.com',
  'stripe.com',
  'doordash.com',
  'ubereats.com',
  'uber.com',
  'lyftmail.com',
  // Travel
  'airbnb.com',
  'booking.com',
  'expedia.com',
  // Productivity tools
  'notion.so',
  'asana.com',
  'monday.com',
  'figma.com',
  'atlassian.com',
  'github.com',
  'dropbox.com',
  'zoom.us',
  // Misc high-volume
  'mailer.spotify.com',
  'spotify.com',
  'apple.com',
  'icloud.com', // personal forwards usually
]);

const BLOCKED_SUFFIXES: string[] = [
  '.mailchimp.com',
  '.list-manage.com',
  '.mkt.com',
  '.bnc.salesforce.com',
  '.marketingcloudapps.com',
  '.e.linkedin.com', // engagement digests, not job alerts
];

export function isBlockedSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (BLOCKED_SENDER_DOMAINS.has(d)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

// ── Application source (where the user applied from) ─────────────────────
// Derived from the email sender domain. Surfaces in the applications table
// as a Source column + filter. No DB migration: we map domain → source at
// read time.

export const APPLICATION_SOURCES = [
  'linkedin',
  'indeed',
  'glassdoor',
  'wellfound',
  'ycombinator',
  'handshake',
  'company_site',
  'other',
] as const;

export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: 'LinkedIn',
  indeed: 'Indeed',
  glassdoor: 'Glassdoor',
  wellfound: 'Wellfound',
  ycombinator: 'Y Combinator',
  handshake: 'Handshake',
  company_site: 'Company site',
  other: 'Other',
};

// Canonical sourceDomain to persist when the user manually picks a source on
// an application. Chosen so that getApplicationSource() round-trips back to
// the same key. 'other' clears the domain (null round-trips to 'other').
export const APPLICATION_SOURCE_CANONICAL_DOMAIN: Record<
  Exclude<ApplicationSource, 'other'>,
  string
> = {
  linkedin: 'linkedin.com',
  indeed: 'indeed.com',
  glassdoor: 'glassdoor.com',
  wellfound: 'wellfound.com',
  ycombinator: 'ycombinator.com',
  handshake: 'joinhandshake.com',
  company_site: 'greenhouse.io',
};

// Domain substrings (lowercased) → source. Order is significant: the first
// matching rule wins, so put the job-board domains BEFORE company_site.
// company_site is the catch-all for ATS vendors hosting the company's own
// careers page (Workday, Greenhouse, Ashby, etc).
const SOURCE_RULES: Array<{ key: Exclude<ApplicationSource, 'other'>; substrings: string[] }> = [
  { key: 'linkedin', substrings: ['linkedin.com'] },
  { key: 'indeed', substrings: ['indeed.com', 'indeedapply'] },
  { key: 'glassdoor', substrings: ['glassdoor.com'] },
  { key: 'wellfound', substrings: ['wellfound.com', 'angel.co'] },
  { key: 'ycombinator', substrings: ['ycombinator.com'] },
  { key: 'handshake', substrings: ['joinhandshake.com'] },
  {
    key: 'company_site',
    substrings: [
      'greenhouse',
      'myworkday',
      'workday.com',
      'ashbyhq.com',
      'lever.co',
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
    ],
  },
];

export function getApplicationSource(sourceDomain: string | null | undefined): ApplicationSource {
  if (!sourceDomain) return 'other';
  const d = sourceDomain.toLowerCase();
  for (const r of SOURCE_RULES) {
    if (r.substrings.some((s) => d.includes(s))) return r.key;
  }
  return 'other';
}

// Returns the ILIKE patterns drizzle should use to filter applications by
// source. For 'other' we return the inverse — emit a NOT_IN list of every
// other source's substring rules and the caller can negate.
export function sourceMatchPatterns(source: ApplicationSource): string[] {
  if (source === 'other') {
    return SOURCE_RULES.flatMap((r) => r.substrings.map((s) => `%${s}%`));
  }
  const rule = SOURCE_RULES.find((r) => r.key === source);
  return rule ? rule.substrings.map((s) => `%${s}%`) : [];
}
