// Last-resort body extractor for ATS-template emails (Greenhouse, Lever,
// Ashby, Workday, etc.) used as a fallback in upsertApplicationFromClassification
// when the LLM left company/role null. The From header on ATS emails is the
// vendor (no-reply@greenhouse-mail.io), not the actual company, so without
// this we'd stamp applications with "greenhouse-mail" as the company.

const ATS_DOMAINS_EXACT = new Set<string>([
  'greenhouse.io',
  'no-reply.greenhouse.io',
  'lever.co',
  'hire.lever.co',
  'ashbyhq.com',
  'myworkday.com',
  'workable.com',
  'smartrecruiters.com',
  'jobvite.com',
  'icims.com',
]);

const ATS_DOMAIN_SUFFIXES: string[] = [
  '.greenhouse-mail.io',
  '.greenhouse.io',
  '.lever.co',
  '.ashbyhq.com',
  '.myworkday.com',
  '.myworkdayjobs.com',
  '.workable.com',
  '.smartrecruiters.com',
];

export function isAtsSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (ATS_DOMAINS_EXACT.has(d)) return true;
  return ATS_DOMAIN_SUFFIXES.some((s) => d.endsWith(s));
}

// ATS vendor names the LLM sometimes mistakenly puts in `company`. When the
// model fills the field with the platform instead of the real employer, we
// drop the value and let the body/subject extractor try instead.
const ATS_VENDOR_NAMES = new Set<string>([
  'workday',
  'myworkday',
  'greenhouse',
  'greenhouse-mail',
  'greenhouse mail',
  'lever',
  'ashby',
  'ashbyhq',
  'workable',
  'smartrecruiters',
  'jobvite',
  'icims',
  'bamboohr',
  'bamboo hr',
  'taleo',
  'breezy',
  'recruitee',
  'jazzhr',
  'eightfold',
  'linkedin',
  'indeed',
  'indeed apply',
  'indeedapply',
  'glassdoor',
  'wellfound',
  'angellist',
  'hired',
  'otta',
]);

// Substrings that indicate the value is a vendor mash-up like "Workday@Cisco"
// or "myworkday – Stripe". These are kept narrow on purpose; bare "lever"
// would match real companies like "Leverage", so only multi-char specifics.
const VENDOR_SUBSTRINGS = [
  'workday',
  'myworkday',
  'greenhouse-mail',
  'indeedapply',
  'indeed apply',
];

export function isAtsVendorName(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.toLowerCase().trim();
  if (ATS_VENDOR_NAMES.has(t)) return true;
  // Real company names never contain `@` — that's a sender-address artifact.
  if (t.includes('@')) return true;
  return VENDOR_SUBSTRINGS.some((sub) => t.includes(sub));
}

export interface AtsExtraction {
  company: string | null;
  role: string | null;
}

// ── Job-ID extraction ─────────────────────────────────────────────────────
// ATS templates almost always quote a requisition/posting/job ID somewhere.
// When the same ID appears on the application-receipt AND the rejection, it's
// a near-deterministic merge signal that survives wildly different role
// formatting ("96191 - Entry Level Technical Support Engineer - Austin,
// Lowell, San Jose, Durham" vs "Entry Level Technical Support Engineer").
// Run as a fallback after the LLM — the model is asked to extract jobId
// directly, but it's inconsistent across templates, so the regex provides
// a deterministic floor.

// Patterns try most-specific first. Each MUST anchor on a label ("Ref:",
// "Job ID:", "Requisition:") or a structural cue (the IBM "application -
// 96191 -" sandwich) so that incidental 5-digit numbers in body text — dates,
// zip codes, phone fragments — don't get captured.
const JOB_ID_PATTERNS: RegExp[] = [
  // Parenthetical requisition IDs: "(Req. 1234)", "(Job ID R-12345)", "(#12345)"
  /\(\s*(?:req\.?|requisition|job\s*id|posting\s*id|id|ref(?:erence)?\.?|#)\s*[:#-]?\s*([A-Z]?\d[A-Z0-9-]{1,18})\s*\)/i,
  // Labeled IDs on their own: "Ref: 96191", "Job ID: R-12345", "Requisition Number: ABC-123"
  /\b(?:job\s*id|job\s*#|jobid|requisition(?:\s*(?:id|number|no\.?|#))?|posting\s*(?:id|number|no\.?|#)|position\s*(?:id|number|no\.?|#)|req(?:uisition)?\.?\s*(?:id|no\.?|#)?|ref(?:erence)?\.?(?:\s*(?:id|no\.?|#))?)\s*[:#=-]\s*([A-Z]?\d[A-Z0-9-]{1,18})\b/i,
  // IBM "application - 96191 -" sandwich. The flanking hyphens make this
  // specific to the "application - <id> -" template rather than any dash
  // bracketed number.
  /\b(?:application|posting|listing)\s*[-–]\s*(\d{3,12})\s*[-–]/i,
  // Workday-style standalone IDs: "R-12345", "JR-12345", "REQ-12345" preceded
  // by a colon, paren, or sentence boundary. Letters-then-digits, hyphenated.
  /(?:^|[\s(:,])((?:R|JR|REQ|JOB)-\d{3,10})(?:[\s),.]|$)/i,
];

// A job ID must contain a digit, fall within a reasonable length, and look
// like an ID rather than a sentence fragment.
function isPlausibleJobId(id: string): boolean {
  if (!id || id.length < 3 || id.length > 20) return false;
  if (!/\d/.test(id)) return false;
  if (!/^[A-Z0-9-]+$/i.test(id)) return false;
  // Single year-like numbers in isolation ("2024", "2025") are almost always
  // dates or version markers, not job IDs. The labeled patterns above usually
  // disambiguate, but belt-and-suspenders.
  if (/^(?:19|20)\d{2}$/.test(id)) return false;
  return true;
}

export function extractJobId(params: { subject: string; body: string }): string | null {
  const haystack = `${params.subject}\n${params.body}`;
  for (const p of JOB_ID_PATTERNS) {
    const m = haystack.match(p);
    if (!m || !m[1]) continue;
    const id = m[1].trim().toUpperCase();
    if (isPlausibleJobId(id)) return id;
  }
  return null;
}

// Normalize an ID coming from any source (LLM, regex, manual) into the
// canonical form stored on applications.job_id: trimmed, uppercased, with
// surrounding label noise stripped. Returns null if the result is implausible.
export function normalizeJobId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  // The LLM sometimes returns the label too ("REF: 96191"). Take the last
  // ID-shaped run of chars.
  const m = trimmed.match(/[A-Z]?\d[A-Z0-9-]{1,18}$/);
  const id = m ? m[0] : trimmed;
  return isPlausibleJobId(id) ? id : null;
}

// Patterns that capture BOTH role and company in one go. Listed most-specific
// first. Each entry names the capture-group index for company/role.
const COMBINED_BODY_PATTERNS: Array<{ pattern: RegExp; role: number; company: number }> = [
  // "applying to the {role} role at {company}" — Greenhouse-mail
  // "applying for the {role} position at {company}" — Lever variant
  {
    pattern:
      /\b(?:applying|apply)\s+(?:for|to)\s+the\s+([^.!?\n]+?)\s+(?:role|position|opportunity|opening|job)\s+at\s+([^.!?\n]+?)[.!?\n]/i,
    role: 1,
    company: 2,
  },
  // "for the {role} role at {company}" — common in body recap
  {
    pattern:
      /\bfor\s+the\s+([^.!?\n]+?)\s+(?:role|position|opportunity|opening|job)\s+at\s+([^.!?\n]+?)[.!?\n]/i,
    role: 1,
    company: 2,
  },
  // "applied for the role of {role} at {company}" — Cadence/Workday
  {
    pattern: /\bapplied\s+for\s+the\s+role\s+of\s+(.+?)\s+at\s+([^.!?\n]+?)[.!?\n]/i,
    role: 1,
    company: 2,
  },
  // "interview for the {role} role at {company}"
  {
    pattern:
      /\binterview(?:ing)?\s+for\s+the\s+([^.!?\n]+?)\s+(?:role|position)\s+at\s+([^.!?\n]+?)[.!?\n]/i,
    role: 1,
    company: 2,
  },
];

// Company-only patterns, body. Tried after the combined patterns.
// Each pattern must point at the company, never at a role. Rejection-style
// emails often say "interest in the {role}" — that form is excluded here on
// purpose; only "interest in joining {company}" is allowed below.
const COMPANY_BODY_PATTERNS: RegExp[] = [
  // "applying to {company}" / "application to {company}"
  /\b(?:applying|apply|application)\s+(?:to|with|at)\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "interest in joining {company}" — require "joining" so we don't grab
  // "interest in the Software Engineer (Req...)" which is a role, not a company.
  /\b(?:your\s+)?interest\s+in\s+joining\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "team here at {company}" / "the team at {company}"
  /\b(?:team\s+here\s+at|the\s+team\s+at)\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "opening at {company}" / "position at {company}" — terminal-only
  /\b(?:opening|position|role|opportunity)\s+at\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "join {company}" (no role mention)
  /\b(?:joining|join)\s+(?:the\s+team\s+at\s+|us\s+at\s+)([^.!?,\n]+?)[.!?,\n]/i,
];

const ROLE_BODY_PATTERNS: RegExp[] = [
  /\bfor\s+the\s+([^.!?\n]+?)\s+(?:role|position|opportunity|opening|job)\b/i,
  /\bthe\s+([^.!?\n]+?)\s+(?:role|position)\s+at\b/i,
  // "for the position of {role}" — SmartRecruiters template
  /\bfor\s+the\s+position\s+of\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "applied for the role of {role}" — Workday confirmation template
  /\bapplied\s+for\s+the\s+role\s+of\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "received your (job) application for {role}" — Workday CrowdStrike-style.
  // Also terminate at " and " connector to avoid swallowing conjoined clauses
  // (e.g. "...AI Runtime and are delighted that you are ready to build...").
  /\breceived\s+your\s+(?:job\s+)?application\s+for\s+(?:the\s+)?(.+?)(?:\s+and\b|[.!?\n])/i,
  // Generic "(your) application for {role}" — Ashby (LangChain)
  /\b(?:your\s+)?application\s+for\s+(?:the\s+)?(.+?)(?:\s+and\b|[.!?\n])/i,
  // "interest in the {role}" — common in rejection emails that name the role.
  /\b(?:your\s+)?interest\s+in\s+the\s+([^.!?,\n]+?)[.!?,\n]/i,
  // "candidacy for the {role}" / "candidacy for {role}"
  /\bcandidacy\s+for\s+(?:the\s+)?([^.!?,\n]+?)(?:\s+(?:opening|position|role)\b|[.!?,\n])/i,
];

// Role patterns to try against the subject when body didn't yield one.
const SUBJECT_ROLE_PATTERNS: RegExp[] = [
  // "Indeed Application: {role}"
  /\bindeed\s+application:\s*(.+?)\s*$/i,
  // "Application Received for {role}" — Cadence/Workday subject
  /\bapplication\s+received\s+for\s+(.+?)\s*$/i,
];

const SUBJECT_COMPANY_PATTERNS: RegExp[] = [
  // "Thank you for applying to {company}"
  /\b(?:thank you for|thanks for)\s+(?:applying to|your application to)\s+(.+?)\s*$/i,
  // "Thanks for considering {company}" / "Thank you for considering {company}"
  /\b(?:thank you for|thanks for)\s+considering\s+(.+?)\s*$/i,
  // "Your application to {company}"
  /\byour\s+application\s+(?:to|for|at)\s+(.+?)\s*$/i,
  // "Update from {company}" / "Update on your application to {company}"
  /\bupdate\s+(?:from|on\s+your\s+application\s+(?:to|for|at))\s+(.+?)\s*$/i,
  // "Application received - {company}"
  /\bapplication\s+(?:received|submitted|confirmation)\s*[-–—:]\s*(.+?)\s*$/i,
];

// Reject capture-group results that are obviously not company/role strings.
// These come up because the patterns are intentionally loose — the prompt-level
// LLM is a fine fallback, but a wrong extracted name is worse than null.
const STOPWORDS = new Set<string>([
  'us',
  'you',
  'our team',
  'the team',
  'the company',
  'the position',
  'the role',
  'this position',
  'this role',
  'a position',
  'the opportunity',
]);

function clean(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    // Strip parenthetical req/job IDs: "Software Engineer (Req. 1234)" → "Software Engineer"
    .replace(/\s*\((?:Req\.?|Requisition|Job\s*ID|ID|#)[^)]*\)\s*$/i, '')
    // Strip unbalanced trailing parens (the lazy regex sometimes terminates
    // at the period inside "Req." leaving "Software Engineer (Req").
    .replace(/\s*\([^)]*$/, '')
    .replace(/[!.,;:]+$/, '')
    .trim();
}

function isPlausibleCompany(s: string): boolean {
  if (!s) return false;
  if (s.length < 2 || s.length > 80) return false;
  if (STOPWORDS.has(s.toLowerCase())) return false;
  // A company name shouldn't be a full sentence.
  if (/\s+(is|are|was|were|will|has|have)\s+/i.test(s)) return false;
  return true;
}

function isPlausibleRole(s: string): boolean {
  if (!s) return false;
  if (s.length < 2 || s.length > 120) return false;
  if (STOPWORDS.has(s.toLowerCase())) return false;
  return true;
}

export function extractAtsCompanyRole(params: { subject: string; body: string }): AtsExtraction {
  const { subject, body } = params;
  let company: string | null = null;
  let role: string | null = null;

  for (const { pattern, role: rIdx, company: cIdx } of COMBINED_BODY_PATTERNS) {
    const m = body.match(pattern);
    if (!m) continue;
    const r = m[rIdx] ? clean(m[rIdx]!) : '';
    const c = m[cIdx] ? clean(m[cIdx]!) : '';
    if (isPlausibleRole(r)) role = r;
    if (isPlausibleCompany(c)) company = c;
    if (company && role) break;
  }

  if (!company) {
    for (const p of SUBJECT_COMPANY_PATTERNS) {
      const m = subject.match(p);
      if (m && m[1]) {
        const c = clean(m[1]);
        if (isPlausibleCompany(c)) {
          company = c;
          break;
        }
      }
    }
  }

  if (!company) {
    for (const p of COMPANY_BODY_PATTERNS) {
      const m = body.match(p);
      if (m && m[1]) {
        const c = clean(m[1]);
        if (isPlausibleCompany(c)) {
          company = c;
          break;
        }
      }
    }
  }

  if (!role) {
    for (const p of ROLE_BODY_PATTERNS) {
      const m = body.match(p);
      if (m && m[1]) {
        const r = clean(m[1]);
        if (isPlausibleRole(r)) {
          role = r;
          break;
        }
      }
    }
  }

  if (!role) {
    for (const p of SUBJECT_ROLE_PATTERNS) {
      const m = subject.match(p);
      if (m && m[1]) {
        const r = clean(m[1]);
        if (isPlausibleRole(r)) {
          role = r;
          break;
        }
      }
    }
  }

  return { company, role };
}
