import Link from 'next/link';
import { auth } from '@/auth';
import {
  getActiveThreads,
  getActivityOverTime,
  getFunnel,
  listInboxConnections,
  getRecentEvents,
  getStats,
  getTimeToRejectionHistogram,
  getUserProfile,
} from '@/lib/data';
import { formatRelative } from '@/lib/utils';
import { AppRow } from '@/components/kyujin/app-row';
import { BarChart } from '@/components/kyujin/bar-chart';
import { CalicoMark } from '@/components/kyujin/calico-mark';
import { Eyebrow } from '@/components/kyujin/eyebrow';
import { KPITile } from '@/components/kyujin/kpi-tile';
import { PillowCard } from '@/components/kyujin/pillow-card';
import { Sankey } from '@/components/kyujin/sankey';
import { GoalCard } from './goal-card';
import { ViewTabs, type DashboardView } from './view-tabs';

function isDashboardView(v: unknown): v is DashboardView {
  return v === 'flow' || v === 'activity' || v === 'outcomes';
}

function chartHeading(
  view: DashboardView,
  stats: { total: number; byStatus: { obtained: number } },
) {
  if (view === 'activity') {
    return {
      eyebrow: 'ACTIVITY',
      titleStart: 'When you',
      titleAccent: 'showed up',
      titleEnd: 'over time.',
    };
  }
  if (view === 'outcomes') {
    return {
      eyebrow: 'TIME TO REJECTION',
      titleStart: 'How fast',
      titleAccent: 'the noes',
      titleEnd: 'arrive.',
    };
  }
  return {
    eyebrow: 'FUNNEL',
    titleStart: `How ${stats.total} became`,
    titleAccent: String(stats.byStatus.obtained),
    titleEnd: '.',
  };
}

const EVENT_COLORS = [
  'var(--kyujin-pink-500)',
  'var(--kyujin-lilac-deep)',
  'var(--kyujin-mint-deep)',
  'var(--kyujin-coral-deep)',
  'var(--kyujin-butter-deep)',
];

function dateEyebrow(now = new Date()) {
  const wkday = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mon = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const week = isoWeek(now);
  return `${wkday} · ${mon} ${now.getDate()} · WEEK ${week}`;
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +start) / 86400000 + 1) / 7);
}

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Hi';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameFromEmail(email: string | null | undefined) {
  if (!email) return 'there';
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[._-]+/g, ' ').split(' ')[0] ?? '';
  const first = cleaned[0];
  return first ? first.toUpperCase() + cleaned.slice(1) : 'there';
}

function firstNameFromDisplayName(name: string) {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first || null;
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [connections, profile] = await Promise.all([
    listInboxConnections(userId),
    getUserProfile(userId),
  ]);
  const connection = connections[0] ?? null;
  const userEmail = profile?.email ?? session!.user.email;
  const greetingName =
    (profile?.name && firstNameFromDisplayName(profile.name)) || firstNameFromEmail(userEmail);
  if (!connection) {
    return (
      <div className="mx-auto max-w-2xl pt-10">
        <PillowCard>
          <Eyebrow>GET STARTED</Eyebrow>
          <h1 className="serif mt-2" style={{ fontSize: 32, letterSpacing: '-0.024em', lineHeight: 1.1 }}>
            Connect <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>Gmail</span> to begin.
          </h1>
          <p className="mt-3" style={{ color: 'var(--kyujin-ink-soft)', fontSize: 14, lineHeight: 1.5 }}>
            Kyujin reads job-application emails to build your tracker. Nothing is sent to recruiters
            and you can disconnect anytime.
          </p>
          <div className="mt-5">
            <Link
              href="/api/gmail/connect"
              className="inline-flex items-center rounded-full px-5 py-2.5 text-[13px] font-semibold text-white"
              style={{
                background: 'var(--kyujin-pink-500)',
                boxShadow:
                  '0 14px 26px -10px rgba(232,90,122,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              Connect Gmail
            </Link>
          </div>
        </PillowCard>
      </div>
    );
  }

  const dashboardView: DashboardView = isDashboardView(profile?.dashboardView)
    ? profile.dashboardView
    : 'flow';
  const applicationGoal = profile?.applicationGoal ?? 50;

  const [stats, funnel, activeThreads, recentEvents, activity, rejectHist] = await Promise.all([
    getStats(userId),
    dashboardView === 'flow' ? getFunnel(userId) : Promise.resolve(null),
    getActiveThreads(userId, 4),
    getRecentEvents(userId, 7, 4),
    dashboardView === 'activity' ? getActivityOverTime(userId, 'all') : Promise.resolve([]),
    dashboardView === 'outcomes' ? getTimeToRejectionHistogram(userId, 'all') : Promise.resolve([]),
  ]);

  const respondedTotal =
    stats.byStatus.interview + stats.byStatus.rejected + stats.byStatus.accepted + stats.byStatus.obtained;
  const activeCount = stats.byStatus.interview + stats.byStatus.accepted;
  const offerCount = stats.byStatus.accepted + stats.byStatus.obtained;

  const chartMeta = chartHeading(dashboardView, stats);

  return (
    <div className="flex flex-col gap-5 px-1">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Eyebrow color="var(--kyujin-pink-600)">{dateEyebrow()}</Eyebrow>
          <h1
            className="serif mt-1"
            style={{ fontSize: 50, lineHeight: 1, letterSpacing: '-0.028em', color: 'var(--kyujin-ink)' }}
          >
            {greeting()},{' '}
            <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>
              {greetingName}.
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="mono"
            style={{ fontSize: 11.5, color: 'var(--kyujin-ink-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
          >
            Synced {formatRelative(connection.updatedAt ?? connection.createdAt ?? new Date())}
          </span>
          <Link
            href="/app/applications"
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
            style={{
              background: 'var(--kyujin-pink-500)',
              boxShadow:
                '0 14px 26px -10px rgba(232,90,122,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            View all →
          </Link>
        </div>
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridAutoRows: 'minmax(110px, auto)',
        }}
      >
        <KPITile label="Sent" tone="pink-600" value={stats.total} sub="all time" />
        <KPITile
          label="Response"
          tone="mint-deep"
          value={`${Math.round(stats.responseRate * 100)}%`}
          sub={`${respondedTotal} replies`}
        />
        <KPITile
          label="Active"
          tone="lilac-deep"
          value={activeCount}
          sub={offerCount > 0 ? `${offerCount} close to offer` : 'open threads'}
        />
        <KPITile
          label="Ghosted"
          tone="peach-deep"
          value={stats.ghosted}
          sub="past day 30"
        />

        {/* Row 2 */}
        <GoalCard total={stats.total} goal={applicationGoal} />

        <PillowCard
          span={5}
          padding="16px 20px 16px"
          className="flex flex-col"
        >
          <div className="flex items-center justify-between">
            <Eyebrow color="var(--kyujin-pink-600)">ACTIVE THREADS</Eyebrow>
            <span style={{ fontSize: 11.5, color: 'var(--kyujin-ink-soft)' }}>
              {activeCount} open
            </span>
          </div>
          <div className="-mx-1 mt-1 flex-1 overflow-auto">
            {activeThreads.length === 0 ? (
              <div
                className="px-1 py-3 text-[13px]"
                style={{ color: 'var(--kyujin-ink-soft)' }}
              >
                No active threads. New ones land here once a recruiter replies.
              </div>
            ) : (
              activeThreads.map((a, i) => (
                <AppRow
                  key={a.id}
                  id={a.id}
                  company={a.company}
                  role={a.role ?? null}
                  status={a.status}
                  dense
                  showDivider={i > 0}
                />
              ))
            )}
          </div>
        </PillowCard>

        <PillowCard
          span={3}
          tone="pink"
          className="flex flex-col items-center justify-center text-center"
        >
          <CalicoMark size={56} />
          <div
            className="serif mt-2.5"
            style={{ fontSize: 20, color: 'var(--kyujin-ink)', lineHeight: 1.15, letterSpacing: '-0.022em' }}
          >
            <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>
              nyaa
            </span>{' '}
            — keep going.
          </div>
          <div className="mt-1" style={{ fontSize: 11.5, color: 'var(--kyujin-ink-soft)' }}>
            {stats.total} sent · {activeCount} active
          </div>
        </PillowCard>

        {/* Row 3 */}
        <PillowCard
          span={8}
          padding="18px 22px 18px"
          className="flex flex-col"
          style={{ minHeight: 280 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow color="var(--kyujin-pink-600)">{chartMeta.eyebrow}</Eyebrow>
              <div
                className="serif mt-1"
                style={{ fontSize: 22, color: 'var(--kyujin-ink)', lineHeight: 1.05, letterSpacing: '-0.022em' }}
              >
                {chartMeta.titleStart}{' '}
                <span className="serif-italic" style={{ color: 'var(--kyujin-pink-500)' }}>
                  {chartMeta.titleAccent}
                </span>{' '}
                {chartMeta.titleEnd}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <ViewTabs active={dashboardView} />
              <Link
                href="/app/insights"
                style={{ fontSize: 12.5, color: 'var(--kyujin-pink-600)', fontWeight: 600 }}
              >
                Open full →
              </Link>
            </div>
          </div>
          <div className="mt-1 flex-1">
            {dashboardView === 'flow' &&
              (funnel && funnel.links.length > 0 ? (
                <Sankey
                  data={funnel}
                  width={940}
                  height={300}
                  padding={{ top: 16, right: 150, bottom: 12, left: 120 }}
                />
              ) : (
                <div
                  className="flex h-full items-center justify-center text-[13px]"
                  style={{ color: 'var(--kyujin-ink-muted)' }}
                >
                  Not enough data yet. Send a few applications to see your funnel.
                </div>
              ))}
            {dashboardView === 'activity' && (
              <BarChart
                data={activity}
                width={940}
                height={300}
                emptyLabel="No applications yet. Send one to start the timeline."
              />
            )}
            {dashboardView === 'outcomes' && (
              <BarChart
                data={rejectHist}
                width={940}
                height={300}
                barColor="var(--kyujin-peach)"
                hoverColor="var(--kyujin-peach-deep)"
                emptyLabel="No rejections yet — quiet is a kind of progress."
              />
            )}
          </div>
        </PillowCard>

        <PillowCard span={4} padding="18px 20px 18px" className="flex flex-col overflow-hidden">
          <Eyebrow color="var(--kyujin-pink-600)">THIS WEEK</Eyebrow>
          <div
            className="serif mt-1"
            style={{ fontSize: 20, color: 'var(--kyujin-ink)', lineHeight: 1.1, letterSpacing: '-0.022em' }}
          >
            {recentEvents.length} {recentEvents.length === 1 ? 'new event' : 'new events'}
          </div>
          <div className="mt-3 flex flex-1 flex-col gap-2.5 overflow-auto" style={{ fontSize: 13, minHeight: 0 }}>
            {recentEvents.length === 0 ? (
              <div style={{ color: 'var(--kyujin-ink-soft)', fontSize: 13 }}>
                Quiet week. New activity shows up here as recruiters reply.
              </div>
            ) : (
              recentEvents.map((e, i) => {
                const color = EVENT_COLORS[i % EVENT_COLORS.length];
                return (
                  <Link
                    key={e.id}
                    href={`/app/applications/${e.id}`}
                    className="flex items-start gap-2.5 rounded-xl px-1 py-1 -mx-1 transition-colors hover:bg-kyujin-pink-50"
                  >
                    <span
                      className="mt-1.5 flex-none"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: color,
                        boxShadow: `0 0 0 3px ${color}22`,
                      }}
                    />
                    <div className="flex-1">
                      <div style={{ color: 'var(--kyujin-ink)' }}>
                        <strong>{e.company}</strong> · {e.status.replace('_', ' ')}
                      </div>
                      <div className="mono mt-0.5" style={{ fontSize: 10.5, color: 'var(--kyujin-ink-muted)' }}>
                        {formatRelative(e.lastEventAt)}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </PillowCard>
      </div>
    </div>
  );
}
