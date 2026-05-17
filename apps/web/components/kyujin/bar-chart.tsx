'use client';

import { useState } from 'react';

export interface BarChartDatum {
  label: string;
  count: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  width?: number;
  height?: number;
  barColor?: string;
  hoverColor?: string;
  yTickCount?: number;
  emptyLabel?: string;
}

export function BarChart({
  data,
  width = 1040,
  height = 380,
  barColor = 'var(--kyujin-pink-400)',
  hoverColor = 'var(--kyujin-pink-600)',
  yTickCount = 4,
  emptyLabel = 'Not enough data yet.',
}: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-[13px]"
        style={{ color: 'var(--kyujin-ink-muted)' }}
      >
        {emptyLabel}
      </div>
    );
  }

  const padding = { top: 20, right: 24, bottom: 44, left: 44 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const max = Math.max(1, ...data.map((d) => d.count));
  const niceMax = niceCeiling(max);
  const ticks = Array.from({ length: yTickCount + 1 }, (_, i) =>
    Math.round((niceMax * i) / yTickCount),
  );

  const slotW = plotW / data.length;
  const barW = Math.max(8, Math.min(64, slotW * 0.62));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
    >
      {ticks.map((t, i) => {
        const y = padding.top + plotH - (t / niceMax) * plotH;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--kyujin-line-soft)"
              strokeDasharray={i === 0 ? undefined : '2 4'}
              strokeWidth={i === 0 ? 1 : 1}
              opacity={i === 0 ? 0.8 : 0.6}
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              style={{ fontSize: 11, fill: 'var(--kyujin-ink-soft)' }}
            >
              {t}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const cx = padding.left + slotW * i + slotW / 2;
        const h = (d.count / niceMax) * plotH;
        const y = padding.top + plotH - h;
        const isHover = hover === i;
        return (
          <g
            key={`${d.label}-${i}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={cx - slotW / 2}
              y={padding.top}
              width={slotW}
              height={plotH}
              fill="transparent"
            />
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={Math.max(0, h)}
              rx={4}
              ry={4}
              fill={isHover ? hoverColor : barColor}
              opacity={hover === null || isHover ? 1 : 0.45}
              style={{ transition: 'opacity 180ms, fill 180ms' }}
            />
            {(isHover || d.count > 0) && (
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                className="serif"
                style={{
                  fontSize: 13,
                  fill: isHover ? hoverColor : 'var(--kyujin-ink)',
                  letterSpacing: '-0.01em',
                  opacity: isHover ? 1 : 0.85,
                  transition: 'opacity 180ms, fill 180ms',
                }}
              >
                {d.count}
              </text>
            )}
            <text
              x={cx}
              y={height - padding.bottom + 18}
              textAnchor="middle"
              style={{
                fontSize: 11.5,
                fill: 'var(--kyujin-ink-soft)',
                fontWeight: isHover ? 600 : 500,
              }}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function niceCeiling(n: number): number {
  if (n <= 5) return Math.max(1, n);
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
