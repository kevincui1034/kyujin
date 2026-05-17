// Per-plan caps. Kept here so the connect route, the callback, the
// settings UI, and the classifier worker all agree on the same numbers
// without duplicating literals.
//
// Multi-inbox is Premium-only: Standard and unsubscribed accounts both
// resolve to NON_PREMIUM_INBOX_LIMIT (1). The historical FREE_INBOX_LIMIT
// alias is preserved for compatibility with any external imports.

import { PLANS, isPaidPlan } from './plans';

export const NON_PREMIUM_INBOX_LIMIT = 1;
export const PREMIUM_INBOX_LIMIT = PLANS.premium.inboxLimit;

// Back-compat alias — old name implied free-only, but Standard hits the
// same cap. Prefer NON_PREMIUM_INBOX_LIMIT in new code.
export const FREE_INBOX_LIMIT = NON_PREMIUM_INBOX_LIMIT;

export function inboxLimitForPlan(plan: string | null | undefined): number {
  return plan === 'premium' ? PREMIUM_INBOX_LIMIT : NON_PREMIUM_INBOX_LIMIT;
}

// Rolling-30-day cap on LLM classifier calls. Returns 0 for non-paid plans
// so an unentitled account that somehow has queue items can't burn tokens.
export function classifierCapForPlan(plan: string | null | undefined): number {
  if (!isPaidPlan(plan)) return 0;
  return PLANS[plan].monthlyClassifierCap;
}
