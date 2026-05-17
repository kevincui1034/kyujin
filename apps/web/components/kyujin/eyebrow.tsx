import type { ReactNode } from 'react';

export function Eyebrow({
  children,
  color,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div className={`eyebrow ${className}`} style={color ? { color } : undefined}>
      {children}
    </div>
  );
}
