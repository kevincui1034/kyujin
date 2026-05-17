import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/marketing-shell';

export const metadata: Metadata = {
  title: 'Terms of Service — Kyujin',
  description:
    'The terms governing your use of Kyujin — accounts, subscriptions, acceptable use, disclaimers, and liability.',
};

const EFFECTIVE_DATE = '2026-05-16';
const CONTACT_EMAIL = 'support@kyujin.dev';

export default function TermsPage() {
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
          TERMS · EFFECTIVE {EFFECTIVE_DATE}
        </div>

        <h1
          className="serif mt-6 text-[clamp(40px,6vw,68px)]"
          style={{ letterSpacing: '-0.028em', lineHeight: 1.05, color: 'var(--kyujin-ink)' }}
        >
          Terms of
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
            Service.
          </span>
        </h1>

        <p
          className="mt-6 max-w-[640px] text-[15.5px] leading-[1.6]"
          style={{ color: 'var(--kyujin-ink-soft)' }}
        >
          These Terms govern your use of Kyujin (the &ldquo;Service&rdquo;), a job-application
          tracker provided by the operator of kyujin.dev (&ldquo;Kyujin,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;). By creating an account or connecting Gmail, you agree to these
          Terms. If you do not agree, do not use the Service.
        </p>

        <div className="mt-10 flex flex-col gap-5">
          <Section eyebrow="01" title="Eligibility and accounts.">
            <p>
              You must be at least 13 years old (or the minimum digital-consent age in your
              jurisdiction) to use the Service. You are responsible for keeping your account
              credentials and any connected Google account secure, and for all activity that
              occurs under your account.
            </p>
          </Section>

          <Section eyebrow="02" title="What the Service does.">
            <p>
              Kyujin connects to your Gmail under the read-only{' '}
              <code
                className="mono rounded px-1.5 py-0.5"
                style={{
                  background: 'var(--kyujin-pink-50)',
                  color: 'var(--kyujin-pink-700)',
                  fontSize: 12,
                }}
              >
                gmail.readonly
              </code>{' '}
              scope, classifies recruiting threads using large language models, and presents the
              result as a dashboard. The Service is provided on a subscription basis — see our{' '}
              <Link href="/pricing" style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}>
                Pricing
              </Link>{' '}
              page.
            </p>
          </Section>

          <Section eyebrow="03" title="Subscriptions and billing.">
            <p>
              Paid plans are billed through Stripe in advance — monthly or annual at your option.
              Subscriptions renew automatically at the end of each billing period at the
              then-current rate until you cancel. You authorize us (through Stripe) to charge the
              payment method on file for each renewal.
            </p>
          </Section>

          <Section eyebrow="04" title="Cancellation and no refunds.">
            <p>
              You can cancel anytime from the Stripe customer portal linked in your billing
              settings. Cancellation takes effect at the end of your current billing period — you
              keep access until then, and your subscription does not renew. Except where required
              by law, we do not issue refunds for partial billing periods, unused time, or
              downgrades. See our{' '}
              <Link href="/refunds" style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}>
                Refund Policy
              </Link>{' '}
              for details.
            </p>
          </Section>

          <Section eyebrow="05" title="Acceptable use.">
            <p>You agree not to:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>access the Service using credentials that are not yours;</li>
              <li>reverse-engineer, decompile, or attempt to extract our source code;</li>
              <li>use the Service to violate any law or third-party right;</li>
              <li>
                resell, sublicense, or run an automated scraper against the Service or its API;
              </li>
              <li>upload or trigger classification on email that you do not lawfully control.</li>
            </ul>
            <p className="mt-3">
              We may suspend or terminate access if we reasonably believe you have violated these
              Terms.
            </p>
          </Section>

          <Section eyebrow="06" title="Your data and Google&rsquo;s policies.">
            <p>
              How we handle Gmail data is described in our{' '}
              <Link href="/privacy" style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}>
                Privacy Policy
              </Link>
              . You retain all rights in the underlying Gmail content. Your use of Google
              services through Kyujin is also governed by the{' '}
              <a
                href="https://policies.google.com/terms"
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
                rel="noreferrer"
                target="_blank"
              >
                Google Terms of Service
              </a>
              . You can revoke our Gmail access at any time from{' '}
              <a
                href="https://myaccount.google.com/permissions"
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
                rel="noreferrer"
                target="_blank"
              >
                your Google account permissions
              </a>
              .
            </p>
          </Section>

          <Section eyebrow="07" title="Third-party services.">
            <p>
              We rely on third parties to run the Service — including Google (Gmail API, OAuth),
              Stripe (payments), Vercel (hosting), and large-language-model providers (for
              classification). Their availability and policies are outside our control, and an
              outage or change on their side may affect the Service.
            </p>
          </Section>

          <Section eyebrow="08" title="Intellectual property.">
            <p>
              The Service, including its design, code, brand, and the calico mark, is owned by
              Kyujin and protected by applicable IP laws. Nothing in these Terms grants you any
              right in our marks or software beyond the limited license to use the Service
              described here.
            </p>
          </Section>

          <Section eyebrow="09" title="Disclaimers.">
            <p
              className="rounded-lg p-3"
              style={{
                background: 'var(--kyujin-pink-50)',
                color: 'var(--kyujin-pink-700)',
                fontWeight: 600,
              }}
            >
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE
              SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR PRODUCE ACCURATE CLASSIFICATIONS.
            </p>
            <p className="mt-3">
              Kyujin uses LLMs to classify email and is not a system of record. You should not rely
              on Kyujin as your sole tracker for legally or financially material decisions (offer
              acceptance, deadlines, etc.). Verify directly against the source email.
            </p>
          </Section>

          <Section eyebrow="10" title="Limitation of liability.">
            <p
              className="rounded-lg p-3"
              style={{
                background: 'var(--kyujin-pink-50)',
                color: 'var(--kyujin-pink-700)',
                fontWeight: 600,
              }}
            >
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, KYUJIN WILL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS,
              REVENUE, DATA, GOODWILL, OR OPPORTUNITIES — INCLUDING ANY MISSED INTERVIEW, OFFER,
              OR DEADLINE — ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
            <p className="mt-3">
              Our total cumulative liability for any claim arising out of or related to the
              Service is limited to the greater of (a) the amount you paid Kyujin in the twelve
              months immediately preceding the event giving rise to the claim, or (b) USD $50.
            </p>
          </Section>

          <Section eyebrow="11" title="Indemnification.">
            <p>
              You agree to defend, indemnify, and hold harmless Kyujin and its operators from any
              claim, loss, or expense (including reasonable attorneys&rsquo; fees) arising from
              your use of the Service, your violation of these Terms, or your violation of any
              law or third-party right.
            </p>
          </Section>

          <Section eyebrow="12" title="Termination.">
            <p>
              You may stop using the Service and delete your account at any time. We may suspend
              or terminate your access if you breach these Terms or if continued operation poses
              a legal, security, or operational risk. On termination, your subscription stops
              renewing and the disclaimers and limitations in these Terms survive.
            </p>
          </Section>

          <Section eyebrow="13" title="Changes to the Service or Terms.">
            <p>
              We may update the Service and these Terms over time. If we make a material change,
              we&rsquo;ll surface it in the app or by email before it takes effect. Continued use
              after the effective date means you accept the updated Terms.
            </p>
          </Section>

          <Section eyebrow="14" title="Governing law.">
            <p>
              These Terms are governed by the laws of the jurisdiction in which Kyujin operates,
              without regard to conflict-of-law principles. Disputes will be resolved exclusively
              in the courts of that jurisdiction, unless mandatory consumer-protection law in
              your country of residence requires otherwise.
            </p>
          </Section>

          <Section eyebrow="15" title="Contact.">
            <p>
              Questions about these Terms? Email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>
              .
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
