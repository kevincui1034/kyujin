import { CalicoMark } from './calico-mark';

export function YumeLogo({ size = 32, withTag = true }: { size?: number; withTag?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <CalicoMark size={size} />
      <div className="leading-none">
        <div
          className="serif"
          style={{ fontSize: size * 0.95, letterSpacing: '-0.025em', color: 'var(--yume-ink)' }}
        >
          Yume
        </div>
        {withTag && (
          <div
            className="mono mt-1"
            style={{
              fontSize: 9.5,
              letterSpacing: '0.14em',
              color: 'var(--yume-ink-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            Job Tracker
          </div>
        )}
      </div>
    </div>
  );
}
