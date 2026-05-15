import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { getApplication, listEmailsForApplication } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { formatRelative } from '@/lib/utils';

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const { id } = await params;

  const app = await getApplication(userId, id);
  if (!app) notFound();

  const emails = await listEmailsForApplication(app.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">
          ← All applications
        </Link>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{app.company}</h1>
          {app.role && <p className="text-muted-foreground">{app.role}</p>}
        </div>
        <StatusBadge status={app.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">No emails linked yet.</p>
          ) : (
            emails.map((m) => (
              <div key={m.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{m.fromAddress}</span>
                  <span>{formatRelative(m.receivedAt)}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{m.subject}</div>
                {m.snippet && (
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.snippet}</div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
