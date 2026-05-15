import { auth } from '@/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getStats, getTimeToRejectionHistogram } from '@/lib/data';
import { FunnelChart } from './funnel-chart';
import { RejectionHistogram } from './rejection-histogram';

export default async function InsightsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [stats, histogram] = await Promise.all([
    getStats(userId),
    getTimeToRejectionHistogram(userId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Insights</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          title="Total applications"
          value={stats.total.toString()}
          description={`Across all sources`}
        />
        <KpiCard
          title="Response rate"
          value={`${Math.round(stats.responseRate * 100)}%`}
          description="Any response (interview, rejection, or offer)"
        />
        <KpiCard
          title="Ghost rate"
          value={`${Math.round(stats.ghostRate * 100)}%`}
          description={`${stats.ghosted} applied >30 days ago with no response`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funnel</CardTitle>
          <CardDescription>Applied → Interview → Offer</CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelChart
            applied={stats.total}
            interview={stats.byStatus.interview + stats.byStatus.accepted + stats.byStatus.obtained}
            offer={stats.byStatus.accepted + stats.byStatus.obtained}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time to rejection</CardTitle>
          <CardDescription>
            Days between first application email and rejection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RejectionHistogram buckets={histogram} />
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
