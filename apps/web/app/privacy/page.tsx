import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/marketing-shell';

export const metadata: Metadata = {
  title: 'Privacy — Kyujin',
  description:
    'What Kyujin reads from your Gmail, what we store, and what we never touch. Read-only scope, classification metadata only.',
};

export default function PrivacyPage() {
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
          PRIVACY · UPDATED 2026-05-16
        </div>

        <h1
          className="serif mt-6 text-[clamp(40px,6vw,68px)]"
          style={{ letterSpacing: '-0.028em', lineHeight: 1.05, color: 'var(--kyujin-ink)' }}
        >
          What we read,
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
            and what we don&apos;t.
          </span>
        </h1>

        <p
          className="mt-6 max-w-[640px] text-[15.5px] leading-[1.6]"
          style={{ color: 'var(--kyujin-ink-soft)' }}
        >
          Kyujin only does one thing with your Gmail: classify recruiting threads so you can see
          where each application stands. Below is exactly what that means in practice.
        </p>

        <div className="mt-10 flex flex-col gap-5">
          <PrivacySection eyebrow="GMAIL SCOPE" title="Read-only access.">
            <p>
              We request a single Google OAuth scope:{' '}
              <code
                className="mono rounded px-1.5 py-0.5"
                style={{
                  background: 'var(--kyujin-pink-50)',
                  color: 'var(--kyujin-pink-700)',
                  fontSize: 12,
                }}
              >
                gmail.readonly
              </code>
              . Kyujin cannot send, delete, draft, or modify any email on your behalf — Google
              enforces this at the API level.
            </p>
          </PrivacySection>

          <PrivacySection eyebrow="WHAT WE PROCESS" title="Application-shaped messages.">
            <p>
              When a new message arrives, Kyujin reads the sender, subject, and body to decide
              whether it&apos;s a job-application thread (confirmation, interview invite,
              rejection, offer). Non-application mail is ignored.
            </p>
          </PrivacySection>

          <PrivacySection eyebrow="WHAT WE STORE" title="Classification, not correspondence.">
            <p>
              For application threads, we persist: company name, role, status
              (applied/interview/rejected/offer/accepted), key event timestamps, and a short
              extracted snippet for the timeline view. Full message bodies are not retained after
              classification.
            </p>
          </PrivacySection>

          <PrivacySection eyebrow="WHAT WE NEVER TOUCH" title="Everything else in your inbox.">
            <p>
              Personal email, newsletters, financial statements, calendar invites, and anything
              that doesn&apos;t look like recruiting correspondence is filtered out before it
              reaches storage. We don&apos;t train models on your data and we don&apos;t sell it
              to anyone.
            </p>
          </PrivacySection>

          <PrivacySection eyebrow="DISCONNECT" title="Leave whenever you like.">
            <p>
              Disconnecting Gmail from{' '}
              <Link
                href="/app/settings"
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                Settings
              </Link>{' '}
              revokes the OAuth grant and stops all ingestion immediately. Deleting your account
              wipes every row associated with your user, including stored classifications and
              snippets.
            </p>
          </PrivacySection>

          <PrivacySection eyebrow="CONTACT" title="Questions about your data?">
            <p>
              Email{' '}
              <a
                href="mailto:support@kyujin.dev"
                style={{ color: 'var(--kyujin-pink-600)', textDecoration: 'underline' }}
              >
                support@kyujin.dev
              </a>{' '}
              and a human will get back to you.
            </p>
          </PrivacySection>
        </div>
      </section>
    </MarketingShell>
  );
}

function PrivacySection({
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
