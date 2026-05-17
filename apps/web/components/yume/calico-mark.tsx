import Image from 'next/image';

export function CalicoMark({ size = 32 }: { size?: number }) {
  const radius = Math.round(size * 0.32);
  return (
    <div
      aria-hidden
      className="relative overflow-hidden bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: '1px solid var(--yume-line)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.7), 0 4px 12px -6px rgba(232,90,122,0.35)',
      }}
    >
      <Image
        src="/brand/calico-512.png"
        alt=""
        width={size}
        height={size}
        priority
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: 'scale(1.12)',
        }}
      />
    </div>
  );
}
