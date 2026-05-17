import type { ApplicationStatus } from '@kyujin/shared';

interface Style {
  label: string;
  glyph: string;
  bg: string;
  border: string;
  fg: string;
}

const STATUS_STYLES: Record<ApplicationStatus, Style> = {
  applied: {
    label: 'Applied',
    glyph: '✦',
    bg: '#fff1e0',
    border: 'rgba(201,122,58,0.25)',
    fg: '#8c5a1b',
  },
  no_response: {
    label: 'No answer',
    glyph: '◌',
    bg: '#fde7ec',
    border: 'rgba(232,90,122,0.25)',
    fg: '#c64162',
  },
  interview: {
    label: 'Interview',
    glyph: '①',
    bg: '#cce8d6',
    border: 'rgba(90,157,122,0.3)',
    fg: '#5a9d7a',
  },
  rejected: {
    label: 'Rejected',
    glyph: '—',
    bg: '#ffd8d0',
    border: 'rgba(194,84,72,0.25)',
    fg: '#c25448',
  },
  accepted: {
    label: 'Offer',
    glyph: '♡',
    bg: '#fbd0d9',
    border: 'rgba(142,44,68,0.3)',
    fg: '#8e2c44',
  },
  obtained: {
    label: 'Accepted',
    glyph: '★',
    bg: '#1f1418',
    border: '#1f1418',
    fg: '#ffffff',
  },
};

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, { padding: string; fontSize: number; gap: number; radius: number }> = {
  sm: { padding: '3px 8px', fontSize: 10.5, gap: 4, radius: 8 },
  md: { padding: '4px 10px', fontSize: 11.5, gap: 5, radius: 10 },
  lg: { padding: '6px 12px', fontSize: 12.5, gap: 6, radius: 12 },
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: ApplicationStatus;
  size?: Size;
}) {
  const s = STATUS_STYLES[status];
  const sz = SIZE[size];
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.fg,
        borderRadius: sz.radius,
        padding: sz.padding,
        fontSize: sz.fontSize,
        gap: sz.gap,
        letterSpacing: '0.005em',
      }}
    >
      <span aria-hidden style={{ fontSize: sz.fontSize + 1 }}>
        {s.glyph}
      </span>
      {s.label}
    </span>
  );
}
