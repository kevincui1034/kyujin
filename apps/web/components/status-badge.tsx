import { Badge } from './ui/badge';
import type { ApplicationStatus } from '@kyujin/shared';

const LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  no_response: 'No response',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Obtained',
};

const VARIANTS: Record<ApplicationStatus, 'default' | 'muted' | 'warning' | 'destructive' | 'success' | 'secondary'> = {
  applied: 'default',
  no_response: 'muted',
  interview: 'warning',
  rejected: 'destructive',
  accepted: 'success',
  obtained: 'success',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
