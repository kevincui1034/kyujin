import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import {
  getApplication,
  listEmailsForApplication,
  listGmailConnectionEmails,
  listOtherApplicationsForPicker,
} from '@/lib/data';
import { CompanyAvatar } from '@/components/yume/company-avatar';
import { Eyebrow } from '@/components/yume/eyebrow';
import { PillowCard } from '@/components/yume/pillow-card';
import { ApplicationManageControls } from './manage-controls';
import { SourceChanger } from './source-changer';
import { StatusChanger } from './status-changer';
import { TimelineList, type TimelineEmail } from './timeline-list';

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

  const [emails, otherApps, gmailConns] = await Promise.all([
    listEmailsForApplication(userId, app.id),
    listOtherApplicationsForPicker(userId, app.id),
    listGmailConnectionEmails(userId),
  ]);

  // Sibling-count map for the "move all in thread" checkbox on each row.
  const threadCounts: Record<string, number> = {};
  for (const e of emails) {
    if (e.applicationId !== app.id) continue;
    threadCounts[e.gmailThreadId] = (threadCounts[e.gmailThreadId] ?? 0) + 1;
  }

  // Resolve which Gmail account each email arrived in so the "Open in Gmail"
  // link targets the right inbox (`/mail/u/<email>/`). Legacy rows pre-date
  // multi-inbox tracking and have a null connectionId — fall back to the
  // user's oldest connection (listGmailConnectionEmails returns ASC by
  // createdAt). When the user has no connections at all, fall back to `0`
  // so the link still opens Gmail's default account.
  const connEmailById = new Map(gmailConns.map((c) => [c.id, c.emailAddress] as const));
  const fallbackConnEmail = gmailConns[0]?.emailAddress ?? '0';

  // Serialize Date fields for the client component.
  const serializedEmails: TimelineEmail[] = emails.map((e) => ({
    id: e.id,
    fromAddress: e.fromAddress,
    subject: e.subject,
    snippet: e.snippet,
    receivedAt: e.receivedAt.toISOString(),
    gmailThreadId: e.gmailThreadId,
    applicationId: e.applicationId,
    accountEmail: (e.connectionId && connEmailById.get(e.connectionId)) || fallbackConnEmail,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/app/applications"
          className="text-[12px] font-medium text-yume-ink-muted transition-colors hover:text-yume-pink-700"
        >
          ← All applications
        </Link>
      </div>

      <PillowCard>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CompanyAvatar company={app.company} size={48} />
            <div>
              <Eyebrow color="var(--yume-pink-600)">APPLICATION</Eyebrow>
              <h1
                className="serif mt-1"
                style={{
                  fontSize: 36,
                  lineHeight: 1.05,
                  letterSpacing: '-0.024em',
                  color: 'var(--yume-ink)',
                }}
              >
                {app.company}
              </h1>
              {app.role && (
                <p
                  className="serif-italic mt-1"
                  style={{ fontSize: 18, color: 'var(--yume-ink-soft)' }}
                >
                  {app.role}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusChanger applicationId={app.id} currentStatus={app.status} />
            <SourceChanger applicationId={app.id} currentSourceDomain={app.sourceDomain} />
          </div>
        </div>
        <div className="mt-4">
          <ApplicationManageControls applicationId={app.id} otherApps={otherApps} />
        </div>
      </PillowCard>

      {app.customFields && Object.keys(app.customFields).length > 0 && (
        <PillowCard>
          <Eyebrow>DETAILS</Eyebrow>
          <div className="mt-1.5 text-[11px]" style={{ color: 'var(--yume-ink-muted)' }}>
            Imported from CSV/XLSX. These fields aren't editable yet.
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {Object.entries(app.customFields).map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-[11px] uppercase tracking-wider text-yume-ink-muted">
                  {key}
                </dt>
                <dd className="serif text-sm text-yume-ink whitespace-pre-wrap break-words">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </PillowCard>
      )}

      <PillowCard>
        <Eyebrow>TIMELINE</Eyebrow>
        <div className="mt-1.5 text-[11px]" style={{ color: 'var(--yume-ink-muted)' }}>
          Drag rows by the <span className="font-mono">⋮⋮</span> handle on the right to reorder.
          Undo is in the audit log.
        </div>
        <div className="mt-4">
          <TimelineList
            applicationId={app.id}
            emails={serializedEmails}
            otherApps={otherApps}
            threadCounts={threadCounts}
          />
        </div>
      </PillowCard>
    </div>
  );
}
