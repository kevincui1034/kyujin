import { auth } from '@/auth';
import {
  getActivityOverTime,
  getFunnel,
  getRejectionMedianDays,
  getStats,
  getTimeToRejectionHistogram,
  type InsightsRangeKey,
} from '@/lib/data';
import { Eyebrow } from '@/components/yume/eyebrow';
import { PillowCard } from '@/components/yume/pillow-card';
import { Sankey } from '@/components/yume/sankey';
import { BarChart } from '@/components/yume/bar-chart';

const RANGES = ['Week', 'Month', 'All'] as const;
type RangeLabel = (typeof RANGES)[number];

const RANGE_TO_KEY: Record<RangeLabel, InsightsRangeKey> = {
  Week: 'week',
  Month: 'month',
  All: 'all',
};

const RANGE_EYEBROW: Record<RangeLabel, string> = {
  Week: 'LAST 7 DAYS',
  Month: 'LAST 30 DAYS',
  All: 'ALL TIME',
};

const VIEWS = [
  { key: 'flow', label: 'Flow' },
  { key: 'activity', label: 'Activity' },
  { key: 'outcomes', label: 'Outcomes' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

function isRange(value: string | undefined): value is RangeLabel {
  return !!value && (RANGES as readonly string[]).includes(value);
}

function isView(value: string | undefined): value is ViewKey {
  return !!value && VIEWS.some((v) => v.key === value);
}

function buildHref(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '/app/insights';
  const qs = entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
  return `/app/insights?${qs}`;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const range: RangeLabel = isRange(params.range) ? params.range : 'All';
  const view: ViewKey = isView(params.view) ? params.view : 'flow';
  const rangeKey = RANGE_TO_KEY[range];

  const [stats, funnel, medianRejectDays, activity, rejectHist] = await Promise.all([
    getStats(userId, rangeKey),
    getFunnel(userId, rangeKey),
    getRejectionMedianDays(userId, rangeKey),
    view === 'activity' ? getActivityOverTime(userId, rangeKey) : Promise.resolve([]),
    view === 'outcomes' ? getTimeToRejectionHistogram(userId, rangeKey) : Promise.resolve([]),
  ]);

  const interviewCount = stats.byStatus.interview + stats.byStatus.accepted + stats.byStatus.obtained;
  const offerCount = stats.byStatus.accepted + stats.byStatus.obtained;
  const interviewRate = stats.total > 0 ? (interviewCount / stats.total) * 100 : 0;

  const rangeQuery = range === 'All' ? undefined : range;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow color="var(--yume-pink-600)">
            {RANGE_EYEBROW[range]} · {stats.total} APPLICATION{stats.total === 1 ? '' : 'S'}
          </Eyebrow>
          <h1
            className="serif mt-1"
            style={{ fontSize: 56, lineHeight: 1, letterSpacing: '-0.028em', color: 'var(--yume-ink)' }}
          >
            Your <span className="serif-italic" style={{ color: 'var(--yume-pink-500)' }}>insights.</span>
          </h1>
        </div>
        <RangeControl active={range} view={view} />
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
          gridAutoRows: 'minmax(120px, auto)',
        }}
      >
        <PillowCard span={9} padding="22px 26px 22px" className="flex flex-col" style={{ minHeight: 460 }}>
          <ChartHeader view={view} range={range} rangeQuery={rangeQuery} />
          <div className="mt-2 flex flex-1 items-center">
            {view === 'flow' &&
              (funnel.links.length === 0 ? (
                <EmptyState />
              ) : (
                <Sankey
                  data={funnel}
                  width={1080}
                  height={420}
                  padding={{ top: 24, right: 180, bottom: 24, left: 140 }}
                />
              ))}
            {view === 'activity' && (
              <BarChart
                data={activity}
                width={1080}
                height={400}
                emptyLabel="No applications in this window yet."
              />
            )}
            {view === 'outcomes' && (
              <BarChart
                data={rejectHist}
                width={1080}
                height={400}
                barColor="var(--yume-peach)"
                hoverColor="var(--yume-peach-deep)"
                emptyLabel="No rejections in this window yet."
              />
            )}
          </div>
        </PillowCard>

        <PillowCard span={3} tone="pink" padding="22px 24px 22px" className="flex flex-col gap-1.5">
          <Eyebrow color="var(--yume-pink-600)">BIG NUMBERS</Eyebrow>
          <div className="mt-1">
            <div
              className="serif"
              style={{ fontSize: 60, color: 'var(--yume-ink)', lineHeight: 1, letterSpacing: '-0.028em' }}
            >
              {stats.total}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--yume-ink-soft)' }}>applications sent</div>
          </div>
          <div className="my-3 h-px" style={{ background: 'rgba(232,90,122,0.15)' }} />
          <div className="grid grid-cols-2 gap-2.5">
            <BigStat value={interviewCount} suffix="" color="var(--yume-lilac-deep)" label="interviews" />
            <BigStat value={offerCount} suffix="" color="var(--yume-mint-deep)" label={offerCount === 1 ? 'offer' : 'offers'} />
            <BigStat
              value={interviewRate.toFixed(1)}
              suffix="%"
              color="var(--yume-peach-deep)"
              label="interview rate"
            />
            <BigStat
              value={medianRejectDays ?? '—'}
              suffix={medianRejectDays != null ? 'd' : ''}
              color="var(--yume-pink-600)"
              label="median rejection"
            />
          </div>
        </PillowCard>

        <PillowCard span={4} padding="14px 18px">
          <Eyebrow color="var(--yume-mint-deep)">WIN OF THE MOMENT</Eyebrow>
          <div className="mt-1.5 text-[14px] leading-[1.5]" style={{ color: 'var(--yume-ink)' }}>
            {winNarrative(stats, offerCount, interviewCount)}
          </div>
        </PillowCard>

        <PillowCard span={4} padding="14px 18px" tone="cream">
          <Eyebrow color="var(--yume-peach-deep)">WATCH OUT</Eyebrow>
          <div className="mt-1.5 text-[14px] leading-[1.5]" style={{ color: 'var(--yume-ink)' }}>
            {watchOutNarrative(stats)}
          </div>
        </PillowCard>

        <PillowCard span={4} padding="14px 18px">
          <Eyebrow color="var(--yume-lilac-deep)">PATTERN</Eyebrow>
          <div className="mt-1.5 text-[14px] leading-[1.5]" style={{ color: 'var(--yume-ink)' }}>
            {patternNarrative(stats, medianRejectDays)}
          </div>
        </PillowCard>
      </div>
    </div>
  );
}

function ChartHeader({
  view,
  range,
  rangeQuery,
}: {
  view: ViewKey;
  range: RangeLabel;
  rangeQuery: string | undefined;
}) {
  const meta = chartHeading(view, range);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Eyebrow color="var(--yume-pink-600)">{meta.eyebrow}</Eyebrow>
        <div
          className="serif mt-1"
          style={{ fontSize: 28, color: 'var(--yume-ink)', lineHeight: 1.05, letterSpacing: '-0.024em' }}
        >
          {meta.titleStart}{' '}
          <span className="serif-italic" style={{ color: 'var(--yume-pink-500)' }}>
            {meta.titleAccent}
          </span>{' '}
          {meta.titleEnd}
        </div>
      </div>
      <ViewTabs active={view} rangeQuery={rangeQuery} />
    </div>
  );
}

function chartHeading(view: ViewKey, range: RangeLabel) {
  if (view === 'activity') {
    return {
      eyebrow: 'APPLICATIONS OVER TIME',
      titleStart: 'When you',
      titleAccent: 'showed up',
      titleEnd: range === 'Week' ? 'this week.' : range === 'Month' ? 'this month.' : 'over time.',
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
    eyebrow: 'APPLICATION FLOW',
    titleStart: 'Where each',
    titleAccent: 'story',
    titleEnd: 'went.',
  };
}

function EmptyState() {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-[13px]"
      style={{ color: 'var(--yume-ink-muted)' }}
    >
      Not enough data yet.
    </div>
  );
}

function BigStat({
  value,
  suffix,
  color,
  label,
}: {
  value: number | string;
  suffix?: string;
  color: string;
  label: string;
}) {
  return (
    <div>
      <div className="serif" style={{ fontSize: 30, color, lineHeight: 1.05, letterSpacing: '-0.024em' }}>
        {value}
        {suffix && <span style={{ fontSize: 18 }}>{suffix}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--yume-ink-soft)' }}>{label}</div>
    </div>
  );
}

function RangeControl({ active, view }: { active: RangeLabel; view: ViewKey }) {
  return (
    <div
      className="flex gap-0.5 rounded-full border bg-yume-paper p-1"
      style={{
        borderColor: 'var(--yume-line-soft)',
        boxShadow: 'inset 0 1px 0 #fff',
      }}
    >
      {RANGES.map((t) => {
        const isActive = t === active;
        return (
          <a
            key={t}
            href={buildHref({
              range: t === 'All' ? undefined : t,
              view: view === 'flow' ? undefined : view,
            })}
            className="rounded-full px-4 py-1.5 transition-colors"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              background: isActive
                ? 'linear-gradient(180deg, var(--yume-pink-50), var(--yume-pink-100))'
                : 'transparent',
              color: isActive ? 'var(--yume-pink-700)' : 'var(--yume-ink-soft)',
              border: isActive ? '1px solid rgba(232,90,122,0.2)' : '1px solid transparent',
            }}
          >
            {t}
          </a>
        );
      })}
    </div>
  );
}

function ViewTabs({ active, rangeQuery }: { active: ViewKey; rangeQuery: string | undefined }) {
  return (
    <div className="flex gap-1" style={{ fontSize: 12.5 }}>
      {VIEWS.map((v) => {
        const isActive = v.key === active;
        return (
          <a
            key={v.key}
            href={buildHref({
              range: rangeQuery,
              view: v.key === 'flow' ? undefined : v.key,
            })}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              fontWeight: 600,
              color: isActive ? 'var(--yume-pink-700)' : 'var(--yume-ink-soft)',
              background: isActive ? 'rgba(232,90,122,0.10)' : 'transparent',
              border: isActive ? '1px solid rgba(232,90,122,0.22)' : '1px solid transparent',
            }}
          >
            {v.label}
          </a>
        );
      })}
    </div>
  );
}

function winNarrative(
  stats: { total: number; byStatus: Record<string, number> },
  offers: number,
  interviews: number,
): string {
  if (offers > 0) {
    return offers === 1
      ? 'One offer in the pipeline. The hard part is over — the rest is choosing.'
      : `${offers} offers in the pipeline. You have leverage now.`;
  }
  if (interviews > 0) {
    return `${interviews} interview${interviews === 1 ? '' : 's'} active. Keep momentum — replies snowball.`;
  }
  if (stats.total > 0) {
    return `${stats.total} applications out. Every reply you get is a signal — keep going.`;
  }
  return 'No applications yet. Send one — small motion creates momentum.';
}

function watchOutNarrative(stats: { ghosted: number; ghostRate: number }): string {
  if (stats.ghosted === 0) return 'Nothing past day 30 yet. Healthy pipeline.';
  return `${stats.ghosted} thread${stats.ghosted === 1 ? '' : 's'} silent past day 30 — consider archiving on Sunday.`;
}

function patternNarrative(
  stats: { responseRate: number; total: number },
  medianRejectDays: number | null,
): string {
  if (stats.total === 0) return 'Patterns will surface as your data grows.';
  if (medianRejectDays != null) {
    return `Rejections land around day ${medianRejectDays} on average. Anything past that is usually a soft maybe.`;
  }
  return `${Math.round(stats.responseRate * 100)}% of recruiters respond at all. The rest is noise — keep aiming.`;
}
