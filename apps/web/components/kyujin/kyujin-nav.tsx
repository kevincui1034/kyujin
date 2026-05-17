'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { KyujinLogo } from './kyujin-logo';

const TABS = [
  { id: 'home', label: 'Home', href: '/app' },
  { id: 'applications', label: 'Applications', href: '/app/applications' },
  { id: 'todos', label: 'To Do', href: '/app/todos' },
  { id: 'insights', label: 'Insights', href: '/app/insights' },
  { id: 'settings', label: 'Settings', href: '/app/settings' },
] as const;

function isActive(pathname: string, tabHref: string) {
  if (tabHref === '/app') return pathname === '/app';
  return pathname === tabHref || pathname.startsWith(`${tabHref}/`);
}

export function KyujinNav({
  email,
  displayName,
  signOut,
}: {
  email: string;
  displayName?: string | null;
  signOut: ReactNode;
}) {
  const pathname = usePathname() ?? '/app';
  const label = displayName?.trim() || email;
  const initial = (label.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="relative z-10 flex items-center justify-between px-9 pb-3.5 pt-4">
      <Link href="/app" aria-label="Kyujin — Job Tracker" className="shrink-0">
        <KyujinLogo size={32} withTag />
      </Link>

      <nav className="flex items-center gap-2">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <Link
              key={t.id}
              href={t.href}
              className="rounded-[14px] px-[18px] py-2 transition-transform"
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: active ? 'var(--kyujin-ink)' : 'var(--kyujin-ink-soft)',
                background: active ? 'var(--kyujin-paper)' : 'transparent',
                border: active
                  ? '1.5px solid var(--kyujin-pink-200)'
                  : '1.5px solid transparent',
                boxShadow: active ? '0 6px 16px -8px var(--kyujin-pink-300)' : 'none',
                transform: active ? 'rotate(-1deg)' : 'none',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <div
          className="inline-flex items-center gap-2 rounded-full bg-kyujin-paper py-[6px] pl-[6px] pr-[14px]"
          style={{
            border: '1.5px solid var(--kyujin-pink-200)',
            fontSize: 12.5,
            color: 'var(--kyujin-ink-soft)',
            fontWeight: 500,
            boxShadow: '0 4px 10px -6px var(--kyujin-pink-300)',
          }}
        >
          <span
            aria-hidden
            className="inline-flex items-center justify-center text-white"
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--kyujin-pink-400), var(--kyujin-coral))',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initial}
          </span>
          <span className="max-w-[180px] truncate" title={email}>
            {label}
          </span>
        </div>
        {signOut}
      </div>
    </div>
  );
}
