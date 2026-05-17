import Link from 'next/link';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { MarketingNav } from './marketing-nav';

export async function MarketingShell({ children }: { children: ReactNode }) {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(135deg, #ffe5cf 0%, #fde2c9 22%, #fdeadd 46%, #fbeae6 68%, #f7e9ea 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 z-0 h-[520px] w-[520px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,196,150,0.55) 0%, rgba(255,196,150,0) 70%)',
          filter: 'blur(10px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-[-10%] z-0 h-[560px] w-[560px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(253,231,236,0.7) 0%, rgba(253,231,236,0) 70%)',
          filter: 'blur(10px)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1280px] flex-col px-7 py-6">
        <MarketingNav signedIn={signedIn} />
        <div className="flex flex-1 flex-col">{children}</div>
        <MarketingFooter />
      </div>
    </main>
  );
}

function MarketingFooter() {
  const monoStyle = {
    fontSize: 10.5,
    letterSpacing: '0.14em',
    fontWeight: 600,
    color: 'var(--yume-ink-muted)',
  } as const;
  return (
    <footer className="mt-16 flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
      <span className="mono" style={monoStyle}>
        © 2026 YUME
      </span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/privacy" className="mono hover:text-yume-ink" style={monoStyle}>
          PRIVACY
        </Link>
        <Link href="/terms" className="mono hover:text-yume-ink" style={monoStyle}>
          TERMS
        </Link>
        <Link href="/refunds" className="mono hover:text-yume-ink" style={monoStyle}>
          REFUNDS
        </Link>
        <Link href="/pricing" className="mono hover:text-yume-ink" style={monoStyle}>
          PRICING
        </Link>
      </div>
      <span className="mono" style={monoStyle}>
        V1.0 · READ-ONLY GMAIL
      </span>
    </footer>
  );
}
