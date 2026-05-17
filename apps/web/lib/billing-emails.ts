import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { Resend } from 'resend';
import { db } from '@kyujin/db/client';
import { users } from '@kyujin/db/schema';
import { appUrlOrigin } from '@/lib/stripe';

// Centralized billing email sender. Today: trial-ending reminder, fired 3
// days before the auto-charge by the Stripe webhook. Required (not optional)
// per Visa/MC merchant rules for trials with stored payment methods; also
// the single biggest driver of trial-related chargeback risk.
//
// Resend is reused from the feedback route — same env vars (RESEND_API_KEY,
// FEEDBACK_FROM_EMAIL is reused as the From because we don't currently have
// a dedicated billing-from). All sends are best-effort: log failures and
// return without throwing so the webhook still 200s and Stripe doesn't
// retry the whole notification.

function envFromAddress(): string | null {
  return process.env.BILLING_FROM_EMAIL ?? process.env.FEEDBACK_FROM_EMAIL ?? null;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export async function sendTrialEndingEmail(subscription: Stripe.Subscription): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = envFromAddress();
  if (!apiKey || !from) {
    console.warn('[trial-ending email] skipped: RESEND_API_KEY or from-address not configured');
    return;
  }

  // trial_end is unix seconds. Stripe always populates it on a trialing sub;
  // bail loudly if it's missing because that means we mis-routed an event.
  if (!subscription.trial_end) {
    console.warn('[trial-ending email] subscription has no trial_end', subscription.id);
    return;
  }
  const trialEndsAt = new Date(subscription.trial_end * 1000);

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  if (!user?.email) {
    console.warn('[trial-ending email] no user for customer', customerId);
    return;
  }

  const item = subscription.items.data[0];
  const priceAmount = item?.price.unit_amount ?? 0;
  const currency = item?.price.currency ?? 'usd';
  const amountLabel = formatAmount(priceAmount, currency);
  const dateLabel = formatDate(trialEndsAt);
  const manageUrl = `${appUrlOrigin()}/app/settings/billing`;

  const subject = `Your Kyujin trial ends ${dateLabel}`;
  const greeting = user.name ? `Hi ${user.name},` : 'Hi,';
  const text = [
    greeting,
    '',
    `Your free trial of Kyujin ends on ${dateLabel}. After that, your card will be charged ${amountLabel} for the next billing period.`,
    '',
    `If you'd like to continue, no action is needed — your sync will keep running.`,
    `If you'd rather not be charged, cancel anytime before ${dateLabel} here:`,
    manageUrl,
    '',
    'Thanks for trying Kyujin.',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <p>${greeting}</p>
      <p>Your free trial of Kyujin ends on <strong>${dateLabel}</strong>. After that, your card will be charged <strong>${amountLabel}</strong> for the next billing period.</p>
      <p>If you'd like to continue, no action is needed — your sync will keep running.</p>
      <p>If you'd rather not be charged, you can cancel anytime before ${dateLabel}:</p>
      <p><a href="${manageUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Manage subscription</a></p>
      <p style="color:#666;font-size:12px">Thanks for trying Kyujin.</p>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: user.email,
      subject,
      text,
      html,
    });
    if (result.error) {
      console.error('[trial-ending email] resend error', result.error.message);
    }
  } catch (err) {
    console.error('[trial-ending email] send failed', err);
  }
}
