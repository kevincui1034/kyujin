import type { ReactNode } from 'react';

export function MonoTag({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`mono ${className}`}
      style={{ fontSize: 10.5, letterSpacing: '0.04em', fontWeight: 500 }}
    >
      {children}
    </span>
  );
}
