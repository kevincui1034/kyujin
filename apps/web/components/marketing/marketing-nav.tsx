'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Pricing', href: '/pricing' },
] as const;

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <Link href="/" className="flex items-center gap-3 justify-self-start">
        <BrandPlate size={36} />
        <span
          className="serif"
          style={{
            fontSize: 24,
            letterSpacing: '-0.025em',
            color: 'var(--kyujin-ink)',
            lineHeight: 1,
          }}
        >
          Kyujin
        </span>
      </Link>

      <div
        className="hidden items-center gap-1 justify-self-center rounded-full bg-white/70 px-2 py-1.5 backdrop-blur-md md:flex"
        style={{
          border: '1px solid var(--kyujin-line-soft)',
          boxShadow: '0 8px 24px -14px rgba(31,20,24,0.18)',
        }}
      >
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="rounded-full px-4 py-2 text-[13.5px] transition-all"
              style={
                active
                  ? {
                      background: '#fff',
                      color: 'var(--kyujin-ink)',
                      fontWeight: 600,
                      border: '1px solid var(--kyujin-pink-200)',
                      boxShadow: '0 6px 16px -8px #f6a8b8',
                      transform: 'rotate(-1deg)',
                    }
                  : {
                      color: 'var(--kyujin-ink-soft)',
                      fontWeight: 500,
                    }
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        <Link
          href={signedIn ? '/app' : '/login'}
          className="rounded-full bg-white px-5 py-2.5 text-[13.5px] font-semibold transition-transform duration-200 hover:-translate-y-[1px]"
          style={{
            color: 'var(--kyujin-ink)',
            border: '1px solid var(--kyujin-line-soft)',
            boxShadow: '0 6px 16px -10px rgba(31,20,24,0.2)',
          }}
        >
          {signedIn ? 'Dashboard' : 'Sign in'}
        </Link>
        <Link
          href={signedIn ? '/app' : '/login'}
          className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white transition-transform duration-200 hover:-translate-y-[1px]"
          style={{
            background: 'var(--kyujin-ink)',
            boxShadow: '0 10px 22px -10px rgba(31,20,24,0.5)',
          }}
        >
          Get started
        </Link>
      </div>
    </nav>
  );
}

function BrandPlate({ size }: { size: number }) {
  const radius = Math.round(size * 0.32);
  return (
    <div
      aria-hidden
      className="relative overflow-hidden bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: '1px solid var(--kyujin-line)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px -8px rgba(232,90,122,0.35)',
      }}
    >
      <Image
        src="/brand/calico-512.png"
        alt=""
        width={size}
        height={size}
        priority
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.12)' }}
      />
    </div>
  );
}
