import Link from 'next/link';
import { auth } from '@/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getGmailConnection } from '@/lib/data';
import { DisconnectGmailButton } from './disconnect-button';
import { BackfillButton } from './backfill-button';
import { StartWatchButton } from './start-watch-button';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; gmail_error?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const connection = await getGmailConnection(userId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {params.gmail === 'connected' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-4 text-sm">
            Gmail connected. The 90-day backfill will run on the next cron tick (every 5 minutes).
          </CardContent>
        </Card>
      )}
      {params.gmail_error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm">
            Gmail connect failed: {params.gmail_error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Gmail</CardTitle>
          <CardDescription>
            Kyujin reads job-application emails only — and never sends mail on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connection ? (
            <>
              <div className="text-sm">
                Connected as <span className="font-medium">{connection.emailAddress}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <BackfillButton />
                <StartWatchButton />
                <DisconnectGmailButton />
              </div>
            </>
          ) : (
            <Button asChild>
              <Link href="/api/gmail/connect">Connect Gmail</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Signed in as {session!.user.email}
        </CardContent>
      </Card>
    </div>
  );
}
