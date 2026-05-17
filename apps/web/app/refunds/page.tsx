import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/marketing-shell';

export const metadata: Metadata = {
  title: 'Refund Policy — Kyujin',
  description:
    'Cancellation takes effect at the end of your current billing period. No refunds for partial periods or unused time.',
};

const EFFECTIVE_DATE = '2026-05-16';
const CONTACT_EMAIL = 'support@kyujin.dev';

export default function RefundsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto mt-10 max-w-3xl pb-16">
        <div
          className="mono inline-block rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md"
          style={{
            border: '1px solid var(--kyujin-line-soft)',
            boxShadow: '0 6px 16px -10px rgba(31,20,24,0.18)',
            fontSize: 10.5,
            letterSpacing: '0.14em',
            fontWeight: 600,
            color: 'var(--kyujin-ink-soft)',
          }}
        >
          REFUND POLICY · EFFECTIVE {EFFECTIVE_DATE}
        </div>

        <h1
          className="serif mt-6 text-[clamp(40px,6vw,68px)]"
          style={{ letterSpacing: '-0.028em', lineHeight: 1.05, color: 'var(--kyujin-ink)' }}
        >
          Cancel anytime.
          <br />
          <span
            className="serif-italic"
            style={{
              background: 'linear-gradient(95deg, #d77a3a 0%, #d8624a 45%, #c64162 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            No refunds.
          </span>
        </h1>

        <p
          className="mt-6 max-w-[640px] text-[15.5px] leading-[1.6]"
          style={{ color: 'var(--kyujin-ink-soft)' }}
        >
          We keep this short on purpose. You can cancel your Kyujin subscription at any time and we
          will not charge you again — but we don&rsquo;t issue refunds for the period you&rsquo;re
          already in.
        </p>

        <div className="mt-10 flex flex-col gap-5">
          <Section eyebrow="01" title="How cancellation works.">
            <p>
              Cancel from the Stripe customer portal — you can reach it from the &ldquo;Manage
              subscription&rdquo; button in your billing settings. Cancellation takes effect at
              the end of your current billing period:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Monthly plans:</strong> you keep access until your next monthly renewal
                date, then the subscription stops.
              </li>
              <li>
                <strong>Annual plans:</strong> you keep access until your next annual renewal
                date, then the subscription stops.
              </li>
            </ul>
            <p className="mt-3">
              We don&rsquo;t pro-rate, downgrade-mid-cycle, or issue partial refunds for the time
              you don&rsquo;t end up using.
            </p>
          </Section>

          <Section eyebrow="02" title="No refunds for partial periods.">
            <p>
              Kyujin is a subscription service. Because you pay in advance for a defined billing
              period, we treat that period as fully earned once it starts. We do not refund:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>partial months or partial years;</li>
              <li>time after you stop using the Service but before cancellation;</li>
              <li>downgrades from Premium to Standard mid-period;</li>
              <li>charges you didn&rsquo;t notice or use.</li>
            </ul>
          </Section>

          <Section eyebrow="03" title="Exceptions.">
            <p>
              We will refund a charge in two cases:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>
                <strong>Duplicate or technical billing errors</strong> on our side (for example,
                if our system charged you twice for the same period).
              </li>
              <li>
                <strong>Mandatory consumer-protection law</strong> in your country of residence
                requires a refund (for example, certain EU/UK statutory rights for digital
                services). If that applies to you, contact us and we&rsquo;ll process the refund
                you&rsquo;re entitled to under the law.
              </li>
            </ul>
            <p className="mt-3">
              Outside of these two cases, refund requests will be declined.
            </p>
          </Section>

          <Section eyebrow="04" title="Chargebacks.">
            <p>
              If you believe you were charged in error, please contact us first at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>{' '}
              before opening a chargeback. We can usually resolve billing problems faster than
              the card-network dispute process. Fraudulent chargebacks may result in immediate
              account termination.
            </p>
          </Section>

          <Section eyebrow="05" title="Free trials and promotional offers.">
            <p>
              Kyujin does not currently offer a free tier. Any time-limited promotional pricing
              will be disclosed clearly at the point of checkout — once the promotional period
              ends, your subscription renews at the standard plan rate shown on the{' '}
              <Link href="/pricing" style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}>
                Pricing
              </Link>{' '}
              page until you cancel.
            </p>
          </Section>

          <Section eyebrow="06" title="Account deletion.">
            <p>
              Cancelling your subscription stops billing. If you also want your account and
              stored classifications deleted, request deletion from{' '}
              <Link
                href="/app/settings"
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                Settings
              </Link>{' '}
              or email us. Deletion is permanent and does not retroactively refund prior charges.
            </p>
          </Section>

          <Section eyebrow="07" title="Contact.">
            <p>
              Billing questions? Email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>{' '}
              with your account email and (if possible) the Stripe charge ID. We aim to reply
              within two business days.
            </p>
          </Section>
        </div>
      </section>
    </MarketingShell>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article
      className="pillow rounded-[28px] bg-white"
      style={{ padding: '24px 26px', border: '1px solid var(--kyujin-line-soft)' }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '0.14em',
          fontWeight: 600,
          color: 'var(--kyujin-ink-muted)',
        }}
      >
        {eyebrow}
      </div>
      <h2
        className="serif mt-2 text-[24px]"
        style={{ letterSpacing: '-0.022em', color: 'var(--kyujin-ink)', lineHeight: 1.15 }}
      >
        {title}
      </h2>
      <div
        className="mt-3 text-[14.5px] leading-[1.6]"
        style={{ color: 'var(--kyujin-ink-soft)' }}
      >
        {children}
      </div>
    </article>
  );
}
