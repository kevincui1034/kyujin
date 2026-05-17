import Link from 'next/link';
import Image from 'next/image';
import { auth } from '@/auth';
import { MarketingShell } from '@/components/marketing/marketing-shell';

export default async function HomePage() {
  const session = await auth();
  const ctaHref = session?.user ? '/app' : '/login';
  const ctaPrimary = session?.user ? 'Open dashboard' : 'Connect Gmail';

  return (
    <MarketingShell>
      <section className="my-auto grid grid-cols-1 items-center gap-12 py-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="max-w-xl">
          <EyebrowPill />

          <h1
            className="serif mt-7 text-[clamp(54px,7vw,92px)]"
            style={{ letterSpacing: '-0.028em', lineHeight: 1, color: 'var(--kyujin-ink)' }}
          >
            Your job hunt,
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
              quietly sorted.
            </span>
          </h1>

          <p
            className="mt-7 max-w-[460px] text-[15.5px] leading-[1.55]"
            style={{ color: 'var(--kyujin-ink-soft)' }}
          >
            Connect Gmail. Kyujin classifies every application thread — applied, interviewing,
            decided — and shows you where each conversation actually stands.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:-translate-y-[2px]"
              style={{
                background: 'var(--kyujin-ink)',
                boxShadow:
                  '0 14px 28px -10px rgba(31,20,24,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {ctaPrimary}
              <span aria-hidden style={{ fontSize: 16 }}>
                →
              </span>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14.5px] font-semibold transition-transform duration-200 hover:-translate-y-[2px]"
              style={{
                color: 'var(--kyujin-ink)',
                boxShadow:
                  '0 10px 22px -10px rgba(31,20,24,0.18), 0 1px 0 rgba(255,255,255,0.7), inset 0 1px 0 #fff',
                border: '1px solid var(--kyujin-line-soft)',
              }}
            >
              See pricing
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2">
            {['No spreadsheets', 'Read-only scope', 'Cancel anytime'].map((label) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
                  style={{
                    background: 'rgba(90,157,122,0.18)',
                    color: 'var(--kyujin-mint-deep)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
                <span
                  className="text-[13.5px]"
                  style={{ color: 'var(--kyujin-ink-soft)', fontWeight: 500 }}
                >
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <HeroPreview />
      </section>
    </MarketingShell>
  );
}

function EyebrowPill() {
  return (
    <span
      className="inline-flex items-center gap-3 rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md"
      style={{
        border: '1px solid var(--kyujin-line-soft)',
        boxShadow: '0 6px 16px -10px rgba(31,20,24,0.18)',
      }}
    >
      <span
        className="mono rounded-full px-2 py-0.5 text-white"
        style={{
          background: 'var(--kyujin-ink)',
          fontSize: 9.5,
          letterSpacing: '0.14em',
          fontWeight: 600,
        }}
      >
        NEW
      </span>
      <span
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '0.14em',
          fontWeight: 600,
          color: 'var(--kyujin-ink-soft)',
        }}
      >
        REAL-TIME GMAIL · PUB/SUB PUSH
      </span>
    </span>
  );
}

type PreviewRow = {
  initial: string;
  company: string;
  role: string;
  avatarBg: string;
  avatarFg: string;
  badge: { label: string; glyph: string; bg: string; border: string; fg: string };
};

const PREVIEW_ROWS: PreviewRow[] = [
  {
    initial: 'L',
    company: 'Linear',
    role: 'Design Engineer',
    avatarBg: 'linear-gradient(135deg, #6a6acb 0%, #5151bf 100%)',
    avatarFg: '#ffffff',
    badge: {
      label: 'Interview',
      glyph: '◆',
      bg: '#ffe2c4',
      border: 'rgba(201,122,58,0.3)',
      fg: '#8c5a1b',
    },
  },
  {
    initial: 'F',
    company: 'Figma',
    role: 'Sr. Product Designer',
    avatarBg: 'linear-gradient(135deg, #ff7a6b 0%, #e85a7a 100%)',
    avatarFg: '#ffffff',
    badge: {
      label: 'Applied',
      glyph: '+',
      bg: '#fde9b8',
      border: 'rgba(168,122,42,0.3)',
      fg: '#8c5a1b',
    },
  },
  {
    initial: 'S',
    company: 'Stripe',
    role: 'Sr. Designer · Brand',
    avatarBg: 'linear-gradient(135deg, #8a6db2 0%, #6b4fa0 100%)',
    avatarFg: '#ffffff',
    badge: {
      label: 'Accepted',
      glyph: '✓',
      bg: '#cce8d6',
      border: 'rgba(90,157,122,0.35)',
      fg: '#3f7d5b',
    },
  },
  {
    initial: 'A',
    company: 'Anthropic',
    role: 'Design Engineer',
    avatarBg: 'linear-gradient(135deg, #d99477 0%, #b96b51 100%)',
    avatarFg: '#ffffff',
    badge: {
      label: 'Obtained',
      glyph: '★',
      bg: '#1f1418',
      border: '#1f1418',
      fg: '#ffffff',
    },
  },
];

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="absolute z-20" style={{ top: -28, left: -28, transform: 'rotate(-6deg)' }}>
        <div
          className="overflow-hidden bg-white"
          style={{
            width: 92,
            height: 92,
            borderRadius: 22,
            border: '1px solid var(--kyujin-line)',
            boxShadow:
              '0 22px 40px -18px rgba(232,90,122,0.45), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          <Image
            src="/brand/calico-512.png"
            alt=""
            width={92}
            height={92}
            priority
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.12)' }}
          />
        </div>
      </div>

      <div
        className="absolute z-20 flex items-center gap-2.5 rounded-full bg-white px-4 py-2.5"
        style={{
          bottom: -22,
          right: -18,
          border: '1px solid var(--kyujin-line-soft)',
          boxShadow:
            '0 18px 36px -16px rgba(232,90,122,0.4), 0 1px 0 rgba(255,255,255,0.7), inset 0 1px 0 #fff',
        }}
      >
        <span
          aria-hidden
          className="inline-block h-[7px] w-[7px] rounded-full"
          style={{ background: 'var(--kyujin-mint-deep)' }}
        />
        <div className="flex flex-col leading-tight">
          <span
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '0.14em',
              fontWeight: 600,
              color: 'var(--kyujin-ink-muted)',
            }}
          >
            RESPONSE
          </span>
          <span
            className="serif"
            style={{
              fontSize: 20,
              color: 'var(--kyujin-ink)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            38%
          </span>
        </div>
      </div>

      <div
        className="pillow relative rounded-[28px] bg-white"
        style={{
          padding: '22px 24px',
          border: '1px solid var(--kyujin-line-soft)',
          transform: 'rotate(-1.2deg)',
        }}
      >
        <header className="flex items-center justify-between pb-4">
          <span
            className="serif"
            style={{
              fontSize: 22,
              letterSpacing: '-0.022em',
              color: 'var(--kyujin-ink)',
              lineHeight: 1,
            }}
          >
            <span className="serif-italic">this week</span>
          </span>
          <span
            className="mono rounded-full px-2.5 py-1"
            style={{
              background: '#ffe5cf',
              color: '#8c5a1b',
              fontSize: 10,
              letterSpacing: '0.12em',
              fontWeight: 700,
              border: '1px solid rgba(201,122,58,0.25)',
            }}
          >
            +4 NEW
          </span>
        </header>
        <ul className="flex flex-col">
          {PREVIEW_ROWS.map((row, i) => (
            <li
              key={row.company}
              className="flex items-center gap-3 py-3"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--kyujin-line-faint)' }}
            >
              <span
                aria-hidden
                className="flex items-center justify-center font-bold"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: row.avatarBg,
                  color: row.avatarFg,
                  fontSize: 15,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              >
                {row.initial}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className="text-[14px]"
                  style={{ color: 'var(--kyujin-ink)', fontWeight: 600, lineHeight: 1.2 }}
                >
                  {row.company}
                </span>
                <span
                  className="text-[12.5px]"
                  style={{ color: 'var(--kyujin-ink-muted)', lineHeight: 1.3 }}
                >
                  {row.role}
                </span>
              </div>
              <span
                className="inline-flex items-center font-semibold"
                style={{
                  background: row.badge.bg,
                  border: `1px solid ${row.badge.border}`,
                  color: row.badge.fg,
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontSize: 11,
                  gap: 5,
                  letterSpacing: '0.005em',
                }}
              >
                <span aria-hidden style={{ fontSize: 11 }}>
                  {row.badge.glyph}
                </span>
                {row.badge.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
