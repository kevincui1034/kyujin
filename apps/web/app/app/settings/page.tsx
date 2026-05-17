import Link from 'next/link';
import { auth } from '@/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserProfile, listInboxConnections } from '@/lib/data';
import { NON_PREMIUM_INBOX_LIMIT, PREMIUM_INBOX_LIMIT, inboxLimitForPlan } from '@/lib/plan';
import { DisconnectGmailButton } from './disconnect-button';
import { BackfillButton } from './backfill-button';
import { StartWatchButton } from './start-watch-button';
import { DevCronCard } from './dev-cron-card';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; gmail_error?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const [connections, profile] = await Promise.all([
    listInboxConnections(userId),
    getUserProfile(userId),
  ]);
  const isPremium = profile?.plan === 'premium';
  const inboxLimit = inboxLimitForPlan(profile?.plan);
  const canAddInbox = connections.length < inboxLimit;

  return (
    <div className="space-y-6">
      {params.gmail === 'connected' && (
        <Alert variant="success">
          <AlertDescription>
            Gmail connected. The 90-day backfill will run on the next cron tick (every 5 minutes).
          </AlertDescription>
        </Alert>
      )}
      {params.gmail_error === 'premium_required' && (
        <Alert variant="warning">
          <AlertDescription>
            Multi-inbox is Premium-only. Standard supports {NON_PREMIUM_INBOX_LIMIT} Gmail inbox;
            Premium supports up to {PREMIUM_INBOX_LIMIT}.
          </AlertDescription>
        </Alert>
      )}
      {params.gmail_error === 'inbox_limit_reached' && (
        <Alert variant="warning">
          <AlertDescription>
            You've reached the {PREMIUM_INBOX_LIMIT}-inbox limit. Remove an existing connection to
            add a different one.
          </AlertDescription>
        </Alert>
      )}
      {params.gmail_error &&
        params.gmail_error !== 'premium_required' &&
        params.gmail_error !== 'inbox_limit_reached' && (
          <Alert variant="destructive">
            <AlertDescription>Gmail connect failed: {params.gmail_error}</AlertDescription>
          </Alert>
        )}

      <Card>
        <CardHeader>
          <CardTitle>Gmail inboxes</CardTitle>
          <CardDescription>
            Kyujin reads job-application emails only — and never sends mail on your behalf.
            {isPremium
              ? ` Premium supports up to ${PREMIUM_INBOX_LIMIT} inboxes (${connections.length}/${PREMIUM_INBOX_LIMIT} used).`
              : ` Single inbox — multi-inbox is Premium-only (${connections.length}/${NON_PREMIUM_INBOX_LIMIT}).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connections.length === 0 ? (
            <Button asChild>
              <Link href="/api/gmail/connect">Connect Gmail</Link>
            </Button>
          ) : (
            <>
              <ul className="space-y-2">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{c.emailAddress}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.watchExpiration
                          ? `Push active until ${new Date(c.watchExpiration).toLocaleString()}`
                          : 'Push not enabled'}
                      </div>
                    </div>
                    <DisconnectGmailButton connectionId={c.id} label="Remove" />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 pt-1">
                {canAddInbox ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/api/gmail/connect">+ Add another inbox</Link>
                  </Button>
                ) : isPremium ? (
                  <div className="text-xs text-muted-foreground">
                    Inbox limit reached ({PREMIUM_INBOX_LIMIT}). Remove one to add another.
                  </div>
                ) : (
                  <div
                    className="text-xs text-muted-foreground"
                    title={`Premium supports up to ${PREMIUM_INBOX_LIMIT} inboxes`}
                  >
                    🔒 Add another inbox — premium only
                  </div>
                )}
              </div>
              <BackfillButton isPremium={isPremium} />
              <div className="flex flex-wrap gap-3 pt-2">
                <StartWatchButton />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {process.env.NODE_ENV !== 'production' && <DevCronCard />}
    </div>
  );
}
