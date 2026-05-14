import Link from 'next/link';
import { auth } from '@/auth';
import { listApplications, getGmailConnection } from '@/lib/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { formatRelative } from '@/lib/utils';
import type { ApplicationStatus } from '@kyujin/shared';
import { APPLICATION_STATUSES } from '@kyujin/shared';

interface SearchParams {
  status?: string;
}

function isStatus(value: string | undefined): value is ApplicationStatus {
  return !!value && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : undefined;
  const [apps, connection] = await Promise.all([
    listApplications(userId, status),
    getGmailConnection(userId),
  ]);

  if (!connection) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect Gmail to get started</CardTitle>
          <CardDescription>
            Kyujin reads job-application emails to build your tracker. Nothing is sent to recruiters,
            and you can disconnect anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/api/gmail/connect">Connect Gmail</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Applications</h1>
        <div className="flex gap-2 text-sm">
          <FilterPill href="/app" active={!status} label="All" />
          {APPLICATION_STATUSES.map((s) => (
            <FilterPill key={s} href={`/app?status=${s}`} active={status === s} label={s} />
          ))}
        </div>
      </div>

      {apps.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No applications yet. If you just connected Gmail, the cron job will populate this
            shortly (runs every 5 minutes).
          </CardContent>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last event</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/app/applications/${a.id}`} className="hover:underline">
                      {a.company}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.role ?? '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelative(a.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
        active ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label.replace('_', ' ')}
    </Link>
  );
}
