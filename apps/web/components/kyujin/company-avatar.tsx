function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function CompanyAvatar({ company, size = 28 }: { company: string; size?: number }) {
  const initial = (company.trim()[0] ?? '?').toUpperCase();
  const hue = hashHue(company);
  const bg = `linear-gradient(135deg, hsl(${hue} 65% 78%), hsl(${(hue + 30) % 360} 70% 70%))`;
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        fontSize: size * 0.42,
        fontWeight: 700,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
      }}
    >
      {initial}
    </span>
  );
}
