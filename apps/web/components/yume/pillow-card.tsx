import type { CSSProperties, ReactNode } from 'react';

type Tone = 'paper' | 'pink' | 'cream' | 'coral';

const TONE: Record<Tone, string> = {
  paper: 'bg-yume-paper border-[var(--yume-line-soft)] text-yume-ink',
  pink: 'bg-[#fff1f5] border-[rgba(232,90,122,0.15)] text-yume-ink',
  cream: 'bg-[#fff8e8] border-[rgba(168,122,42,0.12)] text-yume-ink',
  coral:
    'bg-[linear-gradient(155deg,var(--yume-pink-500)_0%,var(--yume-coral)_100%)] border-[rgba(255,255,255,0.2)] text-white',
};

interface PillowCardProps {
  children: ReactNode;
  tone?: Tone;
  span?: number;
  rowSpan?: number;
  className?: string;
  style?: CSSProperties;
  padding?: string;
}

export function PillowCard({
  children,
  tone = 'paper',
  span,
  rowSpan,
  className = '',
  style,
  padding,
}: PillowCardProps) {
  const shadowClass = tone === 'coral' ? 'pillow-coral' : 'pillow';
  const gridStyle: CSSProperties = {
    gridColumn: span && span > 1 ? `span ${span}` : undefined,
    gridRow: rowSpan && rowSpan > 1 ? `span ${rowSpan}` : undefined,
    padding: padding ?? '20px',
    ...style,
  };
  return (
    <div
      className={`relative rounded-pillow border ${TONE[tone]} ${shadowClass} ${className}`}
      style={gridStyle}
    >
      {children}
    </div>
  );
}
