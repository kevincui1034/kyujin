import Link from 'next/link';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { MarketingShell } from '@/components/marketing/marketing-shell';
import { PLANS, type PlanId } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Pricing — Yume',
  description:
    'Two plans — Standard and Premium. Monthly or annual. Cancel anytime, effective at the end of your current billing period.',
};

const ORDER: PlanId[] = ['standard', 'premium'];

const TONE: Record<PlanId, { accent: string; halo: string }> = {
  standard: { accent: 'var(--yume-pink-600)', halo: 'rgba(232,90,122,0.12)' },
  premium: { accent: 'var(--yume-lilac-deep)', halo: 'rgba(138,109,178,0.14)' },
};

export default async function PricingPage() {
  const session = await auth();
  const ctaHref = session?.user ? '/app/settings/billing' : '/login';

  return (
    <MarketingShell>
      <section className="mx-auto mt-10 max-w-5xl pb-16">
        <div className="text-center">
          <div
            className="mono inline-block rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md"
            style={{
              border: '1px solid var(--yume-line-soft)',
              boxShadow: '0 6px 16px -10px rgba(31,20,24,0.18)',
              fontSize: 10.5,
              letterSpacing: '0.14em',
              fontWeight: 600,
              color: 'var(--yume-ink-soft)',
            }}
          >
            PRICING · CANCEL ANYTIME
          </div>

          <h1
            className="serif mx-auto mt-6 max-w-3xl text-[clamp(40px,6vw,72px)]"
            style={{ letterSpacing: '-0.028em', lineHeight: 1.02, color: 'var(--yume-ink)' }}
          >
            One job hunt,
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
              two ways to pay for it.
            </span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-[560px] text-[15.5px] leading-[1.6]"
            style={{ color: 'var(--yume-ink-soft)' }}
          >
            Start with a 7-day free trial of Standard — card on file, cancel anytime before the
            trial ends to avoid being charged. Pick monthly or annual (roughly two months off on
            annual). Cancel from the customer portal at any time.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
          {ORDER.map((id) => {
            const plan = PLANS[id];
            const tone = TONE[id];
            const isFeatured = id === 'premium';
            return (
              <article
                key={id}
                className="pillow relative flex flex-col rounded-[28px] bg-white"
                style={{
                  padding: '28px 26px',
                  border: `1px solid ${isFeatured ? 'rgba(138,109,178,0.3)' : 'var(--yume-line-soft)'}`,
                  transform: isFeatured ? 'translateY(-6px)' : undefined,
                }}
              >
                {isFeatured && (
                  <span
                    className="mono absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-white"
                    style={{
                      background: 'var(--yume-lilac-deep)',
                      fontSize: 9.5,
                      letterSpacing: '0.14em',
                      fontWeight: 700,
                      boxShadow: '0 8px 18px -8px rgba(138,109,178,0.55)',
                    }}
                  >
                    BEST VALUE
                  </span>
                )}
                {id === 'standard' && (
                  <span
                    className="mono absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-white"
                    style={{
                      background: tone.accent,
                      fontSize: 9.5,
                      letterSpacing: '0.14em',
                      fontWeight: 700,
                      boxShadow: '0 8px 18px -8px rgba(232,90,122,0.45)',
                    }}
                  >
                    7-DAY FREE TRIAL
                  </span>
                )}

                <div
                  className="mono"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    fontWeight: 600,
                    color: 'var(--yume-ink-muted)',
                  }}
                >
                  {plan.name.toUpperCase()}
                </div>

                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className="serif"
                    style={{
                      fontSize: 52,
                      letterSpacing: '-0.028em',
                      color: tone.accent,
                      lineHeight: 1,
                    }}
                  >
                    {plan.priceLabelMonthly}
                  </span>
                  <span
                    className="text-[13px]"
                    style={{ color: 'var(--yume-ink-muted)', fontWeight: 500 }}
                  >
                    / month
                  </span>
                </div>

                <div
                  className="mono mt-1"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: 'var(--yume-ink-muted)',
                  }}
                >
                  OR {plan.priceLabelAnnual}/YR · ~{Math.round((plan.priceCentsMonthly * 12 - plan.priceCentsAnnual) / plan.priceCentsMonthly)} MONTHS FREE
                </div>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-2.5 text-[13.5px] leading-[1.45]"
                      style={{ color: 'var(--yume-ink-soft)' }}
                    >
                      <span
                        aria-hidden
                        className="mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: tone.halo,
                          color: tone.accent,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={ctaHref}
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-semibold transition-transform duration-200 hover:-translate-y-[2px]"
                  style={
                    isFeatured
                      ? {
                          background: 'var(--yume-ink)',
                          color: '#fff',
                          boxShadow: '0 12px 24px -10px rgba(31,20,24,0.5)',
                        }
                      : {
                          background: '#fff',
                          color: 'var(--yume-ink)',
                          border: '1px solid var(--yume-line-soft)',
                          boxShadow: '0 8px 18px -10px rgba(31,20,24,0.18)',
                        }
                  }
                >
                  {id === 'standard' ? 'Start 7-day free trial' : `Choose ${plan.name}`}
                  <span aria-hidden style={{ fontSize: 14 }}>
                    →
                  </span>
                </Link>
              </article>
            );
          })}
        </div>

        <div
          className="pillow mx-auto mt-12 max-w-2xl rounded-[28px] bg-white"
          style={{ padding: '22px 26px', border: '1px solid var(--yume-line-soft)' }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              letterSpacing: '0.14em',
              fontWeight: 600,
              color: 'var(--yume-ink-muted)',
            }}
          >
            CANCELLATION &amp; REFUNDS
          </div>
          <p
            className="mt-2 text-[14px] leading-[1.6]"
            style={{ color: 'var(--yume-ink-soft)' }}
          >
            You can cancel from the Stripe customer portal at any time. If you cancel during your
            7-day Standard trial, you won&apos;t be charged at all. After the trial, cancellation
            takes effect at the end of your current billing period — you keep access until then,
            and your subscription simply doesn&apos;t renew. We don&apos;t issue refunds for
            partial months or unused time. Full details are in our{' '}
            <Link href="/refunds" style={{ color: 'var(--yume-pink-600)', textDecoration: 'underline' }}>
              Refund Policy
            </Link>{' '}
            and{' '}
            <Link href="/terms" style={{ color: 'var(--yume-pink-600)', textDecoration: 'underline' }}>
              Terms of Service
            </Link>
            .
          </p>
        </div>

        <p
          className="mx-auto mt-8 max-w-[600px] text-center text-[13px] leading-[1.55]"
          style={{ color: 'var(--yume-ink-muted)' }}
        >
          Billed securely through Stripe. Yume is read-only and never sells your data — see our{' '}
          <Link href="/privacy" style={{ color: 'var(--yume-pink-600)', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </MarketingShell>
  );
}
