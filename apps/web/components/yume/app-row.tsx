import Link from 'next/link';
import type { ApplicationStatus } from '@kyujin/shared';
import { CompanyAvatar } from './company-avatar';
import { StatusBadge } from '../status-badge';

interface AppRowProps {
  id: string;
  company: string;
  role: string | null;
  status: ApplicationStatus;
  dense?: boolean;
  showDivider?: boolean;
}

export function AppRow({ id, company, role, status, dense = false, showDivider = true }: AppRowProps) {
  return (
    <Link
      href={`/app/applications/${id}`}
      className="flex items-center justify-between rounded-2xl px-2 py-2 transition-colors hover:bg-yume-pink-50"
      style={{
        borderTop: showDivider ? '1px solid var(--yume-line-faint)' : 'none',
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CompanyAvatar company={company} size={dense ? 28 : 32} />
        <div className="min-w-0">
          <div
            className="truncate font-semibold"
            style={{ fontSize: dense ? 13 : 14, color: 'var(--yume-ink)' }}
          >
            {company}
          </div>
          {role && (
            <div
              className="truncate"
              style={{ fontSize: 12, color: 'var(--yume-ink-soft)' }}
            >
              {role}
            </div>
          )}
        </div>
      </div>
      <StatusBadge status={status} size="sm" />
    </Link>
  );
}
