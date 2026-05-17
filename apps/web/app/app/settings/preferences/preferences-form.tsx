'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@kyujin/shared/types';

type DashboardView = 'flow' | 'activity' | 'outcomes';
type AppSort = 'lastEvent' | 'company' | 'source';
type AppRange = 'all' | '7d' | '30d' | '90d' | '365d';
type AppDir = 'asc' | 'desc';

export interface PreferencesValues {
  dashboardView: DashboardView;
  applicationGoal: number;
  defaultAppSort: AppSort;
  defaultAppRange: AppRange;
  defaultAppDir: AppDir;
  hideStatuses: ApplicationStatus[];
}

const DASHBOARD_VIEWS: { key: DashboardView; label: string }[] = [
  { key: 'flow', label: 'Flow' },
  { key: 'activity', label: 'Activity' },
  { key: 'outcomes', label: 'Outcomes' },
];

const SORTS: { key: AppSort; label: string }[] = [
  { key: 'lastEvent', label: 'Last event' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Source' },
];

const RANGES: { key: AppRange; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '365d', label: 'Last year' },
];

const DIRS: { key: AppDir; label: string }[] = [
  { key: 'desc', label: 'Newest first' },
  { key: 'asc', label: 'Oldest first' },
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  no_response: 'No answer',
  interview: 'Interview',
  rejected: 'Rejected',
  accepted: 'Offer',
  obtained: 'Accepted',
};

interface Props {
  section: 'dashboard' | 'list';
  initial: PreferencesValues;
}

export function PreferencesForm({ section, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<PreferencesValues>(initial);
  const [pendingField, setPendingField] = useState<keyof PreferencesValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function save(patch: Partial<PreferencesValues>, field: keyof PreferencesValues) {
    setError(null);
    setPendingField(field);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
    if (!res.ok) {
      setPendingField(null);
      setError(json.hint ?? json.error ?? 'Failed to save');
      return;
    }
    setValues((v) => ({ ...v, ...patch }));
    startTransition(() => {
      router.refresh();
      setPendingField(null);
    });
  }

  const goalDirty = values.applicationGoal !== initial.applicationGoal;

  return (
    <div className="space-y-5">
      {section === 'dashboard' && (
        <>
          <div className="space-y-2">
            <Label>Default dashboard view</Label>
            <div className="flex flex-wrap gap-1">
              {DASHBOARD_VIEWS.map((v) => {
                const active = values.dashboardView === v.key;
                const pending = pendingField === 'dashboardView' && active;
                return (
                  <button
                    key={v.key}
                    type="button"
                    disabled={pendingField !== null}
                    onClick={() => save({ dashboardView: v.key }, 'dashboardView')}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      color: active ? 'var(--kyujin-pink-700)' : 'var(--kyujin-ink-soft)',
                      background: active ? 'rgba(232,90,122,0.10)' : 'transparent',
                      border: active
                        ? '1px solid rgba(232,90,122,0.22)'
                        : '1px solid var(--kyujin-line)',
                      opacity: pending ? 0.6 : 1,
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-goal">Application goal</Label>
            <div className="flex items-center gap-2">
              <Input
                id="app-goal"
                type="number"
                min={1}
                max={9999}
                className="w-32"
                value={values.applicationGoal}
                onChange={(e) =>
                  setValues((v) => ({ ...v, applicationGoal: Number(e.target.value) }))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!goalDirty || pendingField !== null}
                onClick={() =>
                  save({ applicationGoal: values.applicationGoal }, 'applicationGoal')
                }
              >
                {pendingField === 'applicationGoal' ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Target shown on the dashboard. Whole number, 1–9999.
            </p>
          </div>
        </>
      )}

      {section === 'list' && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Default sort</Label>
              <Select
                value={values.defaultAppSort}
                onValueChange={(v) =>
                  save({ defaultAppSort: v as AppSort }, 'defaultAppSort')
                }
                disabled={pendingField !== null}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default direction</Label>
              <Select
                value={values.defaultAppDir}
                onValueChange={(v) => save({ defaultAppDir: v as AppDir }, 'defaultAppDir')}
                disabled={pendingField !== null}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRS.map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default date range</Label>
              <Select
                value={values.defaultAppRange}
                onValueChange={(v) =>
                  save({ defaultAppRange: v as AppRange }, 'defaultAppRange')
                }
                disabled={pendingField !== null}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hide these statuses by default</Label>
            <div className="flex flex-wrap gap-2">
              {APPLICATION_STATUSES.map((s) => {
                const hidden = values.hideStatuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={pendingField !== null}
                    onClick={() => {
                      const next = hidden
                        ? values.hideStatuses.filter((x) => x !== s)
                        : [...values.hideStatuses, s];
                      save({ hideStatuses: next }, 'hideStatuses');
                    }}
                    className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      color: hidden ? 'var(--kyujin-ink-muted)' : 'var(--kyujin-pink-700)',
                      background: hidden ? 'transparent' : 'rgba(232,90,122,0.10)',
                      border: hidden
                        ? '1px solid var(--kyujin-line)'
                        : '1px solid rgba(232,90,122,0.22)',
                      textDecoration: hidden ? 'line-through' : 'none',
                    }}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Click to toggle. Hidden statuses are still reachable via the Status dropdown on the
              list.
            </p>
          </div>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
