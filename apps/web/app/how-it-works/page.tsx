import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { MarketingShell } from '@/components/marketing/marketing-shell';

export const metadata: Metadata = {
  title: 'How it works — Kyujin',
  description:
    'Connect Gmail, watch new threads land in real time, let AI classify each one, and read the funnel. Four steps, end to end.',
};

type Step = {
  n: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  halo: string;
  glyph: string;
  demo: ReactNode;
};

const STEPS: Step[] = [
  {
    n: '01',
    eyebrow: 'CONNECT',
    title: 'Sign in with Google.',
    glyph: '✦',
    accent: 'var(--kyujin-pink-600)',
    halo: 'rgba(232,90,122,0.14)',
    body: 'Read-only Gmail scope. Disconnect anytime.',
    demo: <ConnectDemo />,
  },
  {
    n: '02',
    eyebrow: 'WATCH',
    title: 'Pings in real time.',
    glyph: '◐',
    accent: 'var(--kyujin-mint-deep)',
    halo: 'rgba(90,157,122,0.16)',
    body: 'Gmail Pub/Sub pushes each new thread the moment it lands. No polling.',
    demo: <WatchDemo />,
  },
  {
    n: '03',
    eyebrow: 'CLASSIFY',
    title: 'AI tags the status.',
    glyph: '◆',
    accent: 'var(--kyujin-lilac-deep)',
    halo: 'rgba(138,109,178,0.16)',
    body: 'Applied · interview · rejected · offer · accepted. Non-recruiting mail is ignored.',
    demo: <ClassifyDemo />,
  },
  {
    n: '04',
    eyebrow: 'SEE',
    title: 'Read the funnel.',
    glyph: '★',
    accent: 'var(--kyujin-peach-deep)',
    halo: 'rgba(201,122,58,0.16)',
    body: 'Every application laid out as a flow — from sent to outcome.',
    demo: <FunnelDemo />,
  },
];

export default async function HowItWorksPage() {
  const session = await auth();
  const ctaHref = session?.user ? '/app' : '/login';
  const ctaLabel = session?.user ? 'Open dashboard' : 'Connect Gmail';

  return (
    <MarketingShell>
      <section className="mx-auto mt-10 max-w-5xl pb-16">
        <div className="text-center">
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
            HOW IT WORKS · FOUR STEPS
          </div>

          <h1
            className="serif mx-auto mt-6 max-w-3xl text-[clamp(40px,6vw,72px)]"
            style={{ letterSpacing: '-0.028em', lineHeight: 1.02, color: 'var(--kyujin-ink)' }}
          >
            From inbox to funnel,
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
              without you lifting a finger.
            </span>
          </h1>
        </div>

        <ol className="mt-14 flex flex-col gap-6">
          {STEPS.map((step, i) => (
            <li key={step.n}>
              <article
                className="pillow rounded-[28px] bg-white"
                style={{ padding: '28px 28px', border: '1px solid var(--kyujin-line-soft)' }}
              >
                <div
                  className={`grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-center ${
                    i % 2 === 1 ? 'lg:[&>:first-child]:order-2' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        style={{
                          color: step.accent,
                          fontSize: 18,
                          lineHeight: 1,
                          fontWeight: 700,
                        }}
                      >
                        {step.glyph}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.14em',
                          fontWeight: 700,
                          color: 'var(--kyujin-ink-muted)',
                        }}
                      >
                        STEP {step.n}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10.5,
                          letterSpacing: '0.14em',
                          fontWeight: 700,
                          color: step.accent,
                        }}
                      >
                        · {step.eyebrow}
                      </span>
                    </div>

                    <h2
                      className="serif mt-3 text-[28px]"
                      style={{
                        letterSpacing: '-0.022em',
                        color: 'var(--kyujin-ink)',
                        lineHeight: 1.15,
                      }}
                    >
                      {step.title}
                    </h2>

                    <p
                      className="mt-4 text-[14.5px] leading-[1.6]"
                      style={{ color: 'var(--kyujin-ink-soft)' }}
                    >
                      {step.body}
                    </p>
                  </div>

                  <div className="flex justify-center">{step.demo}</div>
                </div>
              </article>
            </li>
          ))}
        </ol>

        <VideoDemoCard />

        <div
          className="pillow mx-auto mt-14 max-w-2xl rounded-[28px]"
          style={{
            padding: '28px 28px',
            background: 'linear-gradient(155deg,var(--kyujin-pink-500) 0%,var(--kyujin-coral) 100%)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              letterSpacing: '0.14em',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            READY?
          </div>
          <h3
            className="serif mt-1 text-[28px]"
            style={{ letterSpacing: '-0.022em', lineHeight: 1.15 }}
          >
            <span className="serif-italic">Three minutes</span> from sign-in to first sorted
            thread.
          </h3>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-semibold transition-transform duration-200 hover:-translate-y-[2px]"
              style={{
                color: 'var(--kyujin-ink)',
                boxShadow:
                  '0 12px 24px -10px rgba(31,20,24,0.35), inset 0 1px 0 rgba(255,255,255,0.7)',
              }}
            >
              {ctaLabel}
              <span aria-hidden style={{ fontSize: 16 }}>
                →
              </span>
            </Link>
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold"
              style={{
                color: '#fff',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              How we handle your data
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

// ─── Video demo (placeholder until the real clip ships) ─────────────────────

function VideoDemoCard() {
  return (
    <div className="mt-14">
      <div
        className="pillow relative overflow-hidden rounded-[28px] bg-white"
        style={{ border: '1px solid var(--kyujin-line-soft)' }}
      >
        <div
          className="relative w-full"
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* Backdrop — soft pink/coral pillow wash with polka dots */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, #ffe5cf 0%, #fde2c9 28%, #fdeadd 56%, #fbeae6 78%, #f7e9ea 100%)',
            }}
          />
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={{ opacity: 0.5 }}
          >
            <defs>
              <pattern
                id="video-dots"
                x="0"
                y="0"
                width="32"
                height="32"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="4" cy="4" r="1.4" fill="var(--kyujin-pink-200)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#video-dots)" />
          </svg>

          {/* Eyebrow + label, top-left */}
          <div className="absolute left-6 top-6 flex items-center gap-2">
            <span
              aria-hidden
              className="relative flex"
            >
              <span
                className="absolute inline-block h-[8px] w-[8px] rounded-full"
                style={{
                  background: 'var(--kyujin-pink-500)',
                  opacity: 0.4,
                  animation: 'kyujin-dot 1.4s ease-in-out infinite',
                }}
              />
              <span
                className="inline-block h-[8px] w-[8px] rounded-full"
                style={{ background: 'var(--kyujin-pink-500)' }}
              />
            </span>
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: '0.14em',
                fontWeight: 700,
                color: 'var(--kyujin-pink-700)',
              }}
            >
              60-SECOND DEMO · COMING SOON
            </span>
          </div>

          {/* Centered play button + caption */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              aria-hidden
              className="flex items-center justify-center"
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                background:
                  'linear-gradient(155deg, var(--kyujin-pink-500) 0%, var(--kyujin-coral) 100%)',
                boxShadow:
                  '0 28px 56px -16px rgba(232,90,122,0.55), 0 6px 14px -6px rgba(232,90,122,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5.5v13l11-6.5-11-6.5z" fill="#fff" />
              </svg>
            </div>
            <div
              className="serif mt-6 text-[clamp(24px,3vw,36px)]"
              style={{
                letterSpacing: '-0.022em',
                color: 'var(--kyujin-ink)',
                lineHeight: 1.1,
                textAlign: 'center',
              }}
            >
              See it in <span className="serif-italic">motion.</span>
            </div>
            <div
              className="mt-2 text-[13.5px]"
              style={{ color: 'var(--kyujin-ink-soft)', textAlign: 'center' }}
            >
              Walkthrough video drops next week.
            </div>
          </div>

          {/* Corner ribbon */}
          <div
            className="mono absolute right-6 top-6 rounded-full px-2.5 py-1"
            style={{
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid var(--kyujin-line-soft)',
              color: 'var(--kyujin-ink-soft)',
              fontSize: 9.5,
              letterSpacing: '0.14em',
              fontWeight: 700,
              backdropFilter: 'blur(8px)',
            }}
          >
            PLACEHOLDER
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline demo mockups ─────────────────────────────────────────────────────

function DemoCard({ children, tilt = 0 }: { children: ReactNode; tilt?: number }) {
  return (
    <div
      className="pillow rounded-[20px] bg-white"
      style={{
        width: '100%',
        maxWidth: 360,
        padding: '18px 20px',
        border: '1px solid var(--kyujin-line-soft)',
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
      }}
    >
      {children}
    </div>
  );
}

function ConnectDemo() {
  return (
    <DemoCard tilt={-1}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '0.14em',
          fontWeight: 700,
          color: 'var(--kyujin-ink-muted)',
        }}
      >
        CONNECT GMAIL
      </div>
      <h4
        className="serif mt-1 text-[18px]"
        style={{ letterSpacing: '-0.018em', color: 'var(--kyujin-ink)', lineHeight: 1.2 }}
      >
        Sign in to start syncing.
      </h4>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold"
        style={{
          color: 'var(--kyujin-ink)',
          border: '1px solid var(--kyujin-line)',
          boxShadow: '0 4px 10px -6px rgba(31,20,24,0.18)',
        }}
        tabIndex={-1}
      >
        <GoogleG />
        Continue with Google
      </button>

      <ul className="mt-4 flex flex-col gap-1.5">
        {['Read-only Gmail scope', 'Disconnect anytime', 'No password stored'].map((label) => (
          <li
            key={label}
            className="flex items-center gap-2 text-[12.5px]"
            style={{ color: 'var(--kyujin-ink-soft)' }}
          >
            <span
              aria-hidden
              className="flex h-[14px] w-[14px] items-center justify-center rounded-full"
              style={{
                background: 'rgba(90,157,122,0.18)',
                color: 'var(--kyujin-mint-deep)',
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              ✓
            </span>
            {label}
          </li>
        ))}
      </ul>
    </DemoCard>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function WatchDemo() {
  const rows: Array<{ time: string; dot: string; label: ReactNode; mute?: boolean }> = [
    {
      time: '12:42',
      dot: 'var(--kyujin-pink-500)',
      label: (
        <>
          New thread · <strong>linear-hr@careers.linear.app</strong>
        </>
      ),
    },
    {
      time: '12:38',
      dot: 'var(--kyujin-mint-deep)',
      label: (
        <>
          New thread · <strong>talent@figma.com</strong>
        </>
      ),
    },
    {
      time: '12:31',
      dot: 'var(--kyujin-lilac-deep)',
      label: <>Pub/Sub watch refreshed (7d)</>,
      mute: true,
    },
    {
      time: '12:24',
      dot: 'var(--kyujin-pink-500)',
      label: (
        <>
          New thread · <strong>noreply@stripe.com</strong>
        </>
      ),
    },
  ];
  return (
    <DemoCard tilt={1}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="relative flex">
            <span
              className="absolute inline-block h-[8px] w-[8px] rounded-full"
              style={{
                background: 'var(--kyujin-mint-deep)',
                opacity: 0.4,
                animation: 'kyujin-dot 1.4s ease-in-out infinite',
              }}
            />
            <span
              className="inline-block h-[8px] w-[8px] rounded-full"
              style={{ background: 'var(--kyujin-mint-deep)' }}
            />
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              fontWeight: 700,
              color: 'var(--kyujin-mint-deep)',
            }}
          >
            LIVE
          </span>
        </div>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.12em',
            color: 'var(--kyujin-ink-muted)',
            fontWeight: 600,
          }}
        >
          INBOX EVENTS
        </span>
      </div>

      <ul className="mt-3 flex flex-col">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-center gap-3 py-2"
            style={{
              borderTop: i === 0 ? 'none' : '1px solid var(--kyujin-line-faint)',
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--kyujin-ink-muted)',
                letterSpacing: '0.04em',
              }}
            >
              {r.time}
            </span>
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: r.dot }}
            />
            <span
              className="text-[12px] leading-[1.35]"
              style={{
                color: r.mute ? 'var(--kyujin-ink-muted)' : 'var(--kyujin-ink-soft)',
                fontWeight: r.mute ? 500 : 500,
                fontStyle: r.mute ? 'italic' : undefined,
              }}
            >
              {r.label}
            </span>
          </li>
        ))}
      </ul>
    </DemoCard>
  );
}

function ClassifyDemo() {
  return (
    <DemoCard tilt={-0.8}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '0.14em',
          fontWeight: 700,
          color: 'var(--kyujin-ink-muted)',
        }}
      >
        INCOMING THREAD
      </div>

      <div
        className="mt-2 rounded-lg p-3"
        style={{ background: 'var(--kyujin-pink-50)', border: '1px solid var(--kyujin-line-soft)' }}
      >
        <div
          className="text-[11px]"
          style={{ color: 'var(--kyujin-ink-muted)', fontWeight: 600 }}
        >
          from <strong style={{ color: 'var(--kyujin-ink-soft)' }}>recruiting@stripe.com</strong>
        </div>
        <div
          className="mt-1 text-[13px]"
          style={{ color: 'var(--kyujin-ink)', fontWeight: 600, lineHeight: 1.3 }}
        >
          Re: Sr. Designer, Brand — phone screen
        </div>
        <div
          className="mt-1 text-[11.5px] leading-[1.4]"
          style={{ color: 'var(--kyujin-ink-soft)' }}
        >
          Hi — thanks for chatting last week. We&rsquo;d like to move forward and set up a 30-min
          intro call with Anya…
        </div>
      </div>

      <div className="my-3 flex items-center gap-2">
        <div className="h-px flex-1" style={{ background: 'var(--kyujin-line-faint)' }} />
        <span
          className="mono px-2"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.14em',
            fontWeight: 700,
            color: 'var(--kyujin-lilac-deep)',
          }}
        >
          AI · CLASSIFY ↓
        </span>
        <div className="h-px flex-1" style={{ background: 'var(--kyujin-line-faint)' }} />
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex items-center justify-center font-bold text-white"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'linear-gradient(135deg, #8a6db2 0%, #6b4fa0 100%)',
            fontSize: 13,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
          }}
        >
          S
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-[12.5px]"
            style={{ color: 'var(--kyujin-ink)', fontWeight: 600, lineHeight: 1.2 }}
          >
            Stripe
          </span>
          <span
            className="text-[11.5px]"
            style={{ color: 'var(--kyujin-ink-muted)', lineHeight: 1.3 }}
          >
            Sr. Designer · Brand
          </span>
        </div>
        <span
          className="inline-flex items-center font-semibold"
          style={{
            background: '#cce8d6',
            border: '1px solid rgba(90,157,122,0.35)',
            color: '#3f7d5b',
            borderRadius: 999,
            padding: '3px 9px',
            fontSize: 10.5,
            gap: 4,
          }}
        >
          <span aria-hidden style={{ fontSize: 10.5 }}>
            ①
          </span>
          Interview
        </span>
      </div>
    </DemoCard>
  );
}

function FunnelDemo() {
  const rows: Array<{ label: string; value: number; pct: number; color: string }> = [
    { label: 'Sent', value: 43, pct: 100, color: 'var(--kyujin-pink-300)' },
    { label: 'Replied', value: 15, pct: 35, color: 'var(--kyujin-peach-deep)' },
    { label: 'Interview', value: 5, pct: 12, color: 'var(--kyujin-mint-deep)' },
    { label: 'Offer', value: 1, pct: 3, color: 'var(--kyujin-pink-600)' },
  ];
  return (
    <DemoCard tilt={1.2}>
      <div className="flex items-center justify-between">
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            fontWeight: 700,
            color: 'var(--kyujin-ink-muted)',
          }}
        >
          FUNNEL
        </span>
        <span
          className="mono"
          style={{
            fontSize: 9.5,
            letterSpacing: '0.12em',
            fontWeight: 600,
            color: 'var(--kyujin-ink-muted)',
          }}
        >
          ALL TIME
        </span>
      </div>

      <h4
        className="serif mt-1 text-[18px]"
        style={{ letterSpacing: '-0.018em', color: 'var(--kyujin-ink)', lineHeight: 1.2 }}
      >
        How <span className="serif-italic">43</span> became{' '}
        <span className="serif-italic" style={{ color: 'var(--kyujin-pink-600)' }}>
          1
        </span>
        .
      </h4>

      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-center justify-between">
              <span
                className="text-[12px]"
                style={{ color: 'var(--kyujin-ink-soft)', fontWeight: 600 }}
              >
                {r.label}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: 'var(--kyujin-ink)',
                  letterSpacing: '0.02em',
                }}
              >
                {r.value}
              </span>
            </div>
            <div
              className="mt-1 h-[6px] w-full overflow-hidden rounded-full"
              style={{ background: 'var(--kyujin-line-faint)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${r.pct}%`,
                  background: r.color,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div
        className="mono mt-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1"
        style={{
          background: 'rgba(90,157,122,0.15)',
          color: 'var(--kyujin-mint-deep)',
          fontSize: 9.5,
          letterSpacing: '0.12em',
          fontWeight: 700,
        }}
      >
        RESPONSE 35%
      </div>
    </DemoCard>
  );
}
