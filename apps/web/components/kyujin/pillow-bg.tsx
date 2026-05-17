export function PillowBG({ id = 'e' }: { id?: string }) {
  const dotsId = `pillow-dots-${id}`;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(180deg, #fffbf8 0%, #fdeef1 100%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          top: -100,
          right: -120,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, var(--kyujin-pink-200) 0%, rgba(251,208,217,0) 70%)',
          filter: 'blur(10px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute z-0"
        style={{
          bottom: -120,
          left: -120,
          width: 380,
          height: 380,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, var(--kyujin-pink-100) 0%, rgba(253,231,236,0) 70%)',
          filter: 'blur(10px)',
        }}
      />
      <svg
        aria-hidden
        width="100%"
        height="100%"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ opacity: 0.55 }}
      >
        <defs>
          <pattern id={dotsId} x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.4" fill="var(--kyujin-pink-200)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${dotsId})`} />
      </svg>
    </>
  );
}
