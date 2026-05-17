import type { ReactNode } from 'react';
import { Eyebrow } from './eyebrow';
import { PillowCard } from './pillow-card';

interface KPITileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'pink-600' | 'mint-deep' | 'lilac-deep' | 'peach-deep' | 'butter-deep';
  span?: number;
}

const COLOR: Record<NonNullable<KPITileProps['tone']>, string> = {
  'pink-600': 'var(--kyujin-pink-600)',
  'mint-deep': 'var(--kyujin-mint-deep)',
  'lilac-deep': 'var(--kyujin-lilac-deep)',
  'peach-deep': 'var(--kyujin-peach-deep)',
  'butter-deep': 'var(--kyujin-butter-deep)',
};

export function KPITile({ label, value, sub, tone = 'pink-600', span = 3 }: KPITileProps) {
  return (
    <PillowCard span={span} padding="16px 18px">
      <Eyebrow>{label}</Eyebrow>
      <div
        className="serif mt-1"
        style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: '-0.026em', color: COLOR[tone] }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[12px]" style={{ color: 'var(--kyujin-ink-soft)' }}>
          {sub}
        </div>
      )}
    </PillowCard>
  );
}
