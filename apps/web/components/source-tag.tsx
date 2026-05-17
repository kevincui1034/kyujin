import type { ApplicationSource } from '@kyujin/shared/sender-domains';
import { APPLICATION_SOURCE_LABELS } from '@kyujin/shared/sender-domains';

const SOURCE_TAG_STYLE: Record<ApplicationSource, { bg: string; fg: string; border: string }> = {
  linkedin: { bg: '#dde9f3', fg: '#3d6e95', border: 'rgba(61,110,149,0.25)' },
  indeed: { bg: '#e0d2f0', fg: '#5a3d8a', border: 'rgba(90,61,138,0.25)' },
  glassdoor: { bg: '#cce8d6', fg: '#3a7a52', border: 'rgba(58,122,82,0.25)' },
  wellfound: { bg: '#fde9b8', fg: '#a87a2a', border: 'rgba(168,122,42,0.25)' },
  ycombinator: { bg: '#ffd8b8', fg: '#c97a3a', border: 'rgba(201,122,58,0.25)' },
  handshake: { bg: '#d3e6f7', fg: '#2257a5', border: 'rgba(34,87,165,0.25)' },
  company_site: { bg: '#fff5f7', fg: '#8e2c44', border: 'rgba(232,90,122,0.18)' },
  other: { bg: '#e8dccb', fg: '#6b5a4a', border: 'rgba(107,90,74,0.25)' },
};

export function SourceTag({ source }: { source: ApplicationSource }) {
  const s = SOURCE_TAG_STYLE[source];
  return (
    <span
      className="inline-flex items-center font-semibold"
      style={{
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        borderRadius: 8,
        padding: '2px 8px',
        fontSize: 10.5,
        letterSpacing: '0.005em',
      }}
    >
      {APPLICATION_SOURCE_LABELS[source]}
    </span>
  );
}
