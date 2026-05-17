// Brand → canonical parent-company mapping. ATS templates and rejection
// subjects often surface the consumer-facing brand ("TikTok: Application
// Update") while the application-receipt email signs as the parent
// ("ByteDance"). Without alias resolution, those two emails build distinct
// applications because no normalization tier in applications.ts can bridge
// the company string. Applied in canonicalizeCompany() before matchKey and
// before every match-tier comparison.
//
// Conservative entries only. A wrong alias collapses unrelated applications,
// which is worse than missing a merge. Add when the parent/brand pair has
// public, durable corporate ownership and the brand is rarely used as its
// own hiring entity. Each key is already in normalizeForMatch form
// (lowercase, punctuation stripped, single-spaced) so resolution is a single
// hash lookup with no per-call normalization.
const BRAND_TO_PARENT: Record<string, string> = {
  // ByteDance products
  tiktok: 'bytedance',
  capcut: 'bytedance',
  lark: 'bytedance',
  lemon8: 'bytedance',
  // Meta family
  instagram: 'meta',
  whatsapp: 'meta',
  facebook: 'meta',
  oculus: 'meta',
  'reality labs': 'meta',
  'meta platforms': 'meta',
  // Alphabet / Google
  youtube: 'google',
  waymo: 'google',
  'google cloud': 'google',
  alphabet: 'google',
  // Amazon family
  aws: 'amazon',
  'amazon web services': 'amazon',
  twitch: 'amazon',
  'whole foods': 'amazon',
  'whole foods market': 'amazon',
  audible: 'amazon',
  // Microsoft family
  azure: 'microsoft',
  github: 'microsoft',
  xbox: 'microsoft',
  // Apple family — Apple has few sub-brands, included for completeness
  // Disney family
  pixar: 'disney',
  'walt disney': 'disney',
  'walt disney company': 'disney',
  hulu: 'disney',
};

// Apply alias resolution to an already-normalized (lowercase, punctuation
// stripped) company string. Pass through when no alias exists — the caller
// is the single source of truth for normalization; this only canonicalizes.
export function resolveBrandAlias(normalized: string): string {
  if (!normalized) return normalized;
  return BRAND_TO_PARENT[normalized] ?? normalized;
}
