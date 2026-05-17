'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EmailRowActions } from './email-row-actions';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/utils';

export interface TimelineEmail {
  id: string;
  fromAddress: string;
  subject: string;
  snippet: string | null;
  receivedAt: string;
  gmailThreadId: string;
  applicationId: string | null;
  // Gmail account this email arrived in — used to route the "Open in Gmail"
  // link to the right `/mail/u/<email>/` inbox so users with multiple Gmail
  // accounts signed into the browser land in the correct one.
  accountEmail: string;
}

interface OtherApp {
  id: string;
  company: string;
  role: string | null;
}

interface Props {
  applicationId: string;
  emails: TimelineEmail[];
  otherApps: OtherApp[];
  threadCounts: Record<string, number>;
}

export function TimelineList({ applicationId, emails, otherApps, threadCounts }: Props) {
  const router = useRouter();
  // Local optimistic order. Server is the source of truth; refreshing the
  // page re-reads display_order from the DB.
  const [order, setOrder] = useState<TimelineEmail[]>(emails);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // The <li> itself has no background — it sits inside the outer
    // PillowCard. Using it directly as the drag image gives the user just
    // floating text + handle. Clone the row, style it as a self-contained
    // card off-screen, snapshot it as the drag image, then clean up next
    // tick (the browser only needs the node alive long enough to rasterize).
    const li = (e.currentTarget as HTMLElement).closest('li') as HTMLElement | null;
    if (li) {
      const rect = li.getBoundingClientRect();
      const clone = li.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '-1000px';
      clone.style.left = '-1000px';
      clone.style.width = `${rect.width}px`;
      clone.style.boxSizing = 'border-box';
      clone.style.padding = '14px 18px';
      clone.style.background = 'var(--yume-paper, #fffaf5)';
      clone.style.border = '1px solid var(--yume-line-soft, rgba(0,0,0,0.08))';
      clone.style.borderRadius = '18px';
      clone.style.boxShadow = '0 18px 40px -12px rgba(0,0,0,0.18), 0 4px 12px -6px rgba(232,90,122,0.25)';
      clone.style.opacity = '1';
      // Hide the row's connector dot (positioned absolutely on the left) and
      // the connector-line ancestor styling — they belong to the column, not
      // to the card.
      const dot = clone.querySelector<HTMLElement>(':scope > span[aria-hidden]');
      if (dot) dot.style.display = 'none';
      clone.style.paddingLeft = '18px';
      document.body.appendChild(clone);
      e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
      // Remove after the browser has captured the snapshot.
      setTimeout(() => {
        if (clone.parentNode) clone.parentNode.removeChild(clone);
      }, 0);
    }
    setDraggingId(id);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  }, [overId]);

  const onDragLeave = useCallback(() => {
    setOverId(null);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverId(null);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain') || draggingId;
      setOverId(null);
      setDraggingId(null);
      if (!sourceId || sourceId === targetId) return;

      // Compute new order: remove source, insert before target.
      const next = [...order];
      const srcIdx = next.findIndex((em) => em.id === sourceId);
      const tgtIdx = next.findIndex((em) => em.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return;
      const [moved] = next.splice(srcIdx, 1);
      // After removing source, indices shift. tgtIdx is the visual landing
      // index in the NEW array; we insert before the target row.
      const adjustedTarget = next.findIndex((em) => em.id === targetId);
      next.splice(adjustedTarget, 0, moved!);
      setOrder(next);
      setSaveError(null);

      // Fire to the server. Failure is non-fatal — we keep the optimistic
      // order in place but surface a small error so the user can refresh.
      try {
        const res = await fetch(`/api/applications/${applicationId}/reorder-emails`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderedEmailIds: next.map((em) => em.id) }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setSaveError(data.error ?? `Reorder failed (${res.status})`);
          return;
        }
        startTransition(() => router.refresh());
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Reorder failed');
      }
    },
    [applicationId, draggingId, order, router],
  );

  if (order.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: 'var(--yume-ink-soft)' }}>
        No emails linked yet.
      </p>
    );
  }

  return (
    <>
      {saveError && (
        <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {saveError}
        </div>
      )}
      <ol className="relative">
        <span
          aria-hidden
          className="absolute left-[7px] top-2 bottom-2 w-px"
          style={{ background: 'var(--yume-line-soft)' }}
        />
        {order.map((m, i) => {
          const isDragging = draggingId === m.id;
          const isOver = overId === m.id && draggingId && draggingId !== m.id;
          return (
            <li
              key={m.id}
              // Drop target — the whole row accepts drops, but drags can only
              // be INITIATED from the handle below (it's the only element with
              // `draggable`). That makes scrolling and text-selection work
              // normally on the rest of the row.
              onDragOver={(e) => onDragOver(e, m.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, m.id)}
              onDragEnd={onDragEnd}
              className="relative flex items-stretch gap-2 pl-8 pb-6 last:pb-0"
              style={{
                opacity: isDragging ? 0.4 : 1,
                borderTop: isOver ? '2px solid var(--yume-pink-500)' : '2px solid transparent',
                transition: 'border-color 80ms, opacity 80ms',
              }}
            >
              <span
                aria-hidden
                className="absolute left-0 top-[6px] h-[15px] w-[15px] rounded-full border-2"
                style={{
                  background:
                    i === order.length - 1 ? 'var(--yume-pink-500)' : 'var(--yume-paper)',
                  borderColor: 'var(--yume-pink-500)',
                  boxShadow: '0 0 0 3px var(--yume-paper)',
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div
                    className="font-semibold"
                    style={{ fontSize: 13, color: 'var(--yume-ink)' }}
                  >
                    {m.fromAddress}
                  </div>
                  <div
                    className="shrink-0"
                    style={{
                      fontSize: 11,
                      color: 'var(--yume-ink-muted)',
                      marginRight: 12,
                    }}
                    title={new Date(m.receivedAt).toLocaleString()}
                  >
                    {formatRelative(new Date(m.receivedAt))}
                  </div>
                </div>
                <div className="mt-1" style={{ fontSize: 14, color: 'var(--yume-ink)' }}>
                  {m.subject}
                </div>
                {m.snippet && (
                  <div
                    className="mt-1.5 whitespace-pre-wrap"
                    style={{ fontSize: 12.5, color: 'var(--yume-ink-soft)', lineHeight: 1.5 }}
                  >
                    {m.snippet}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-[11.5px]">
                    <a
                      href={`https://mail.google.com/mail/u/0/?authuser=${encodeURIComponent(m.accountEmail)}#all/${m.gmailThreadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 7 9 6 9-6" />
                      </svg>
                      Open in Gmail
                    </a>
                  </Button>
                  <EmailRowActions
                    emailId={m.id}
                    currentApplicationId={applicationId}
                    threadSiblingCount={threadCounts[m.gmailThreadId] ?? 1}
                    otherApps={otherApps}
                  />
                </div>
              </div>
              {/* Drag handle — only this element initiates a drag. Aligned
                  to the top of the row so it sits next to the from-address
                  line rather than centering across the full multi-line card.
                  Width/font sized up so it's an obvious grab target. */}
              <div
                draggable
                onDragStart={(e) => onDragStart(e, m.id)}
                aria-label="Drag to reorder"
                title="Drag to reorder"
                className="flex shrink-0 select-none items-center justify-center rounded-md text-yume-ink-muted transition-colors hover:bg-yume-pink-50 hover:text-yume-pink-700"
                style={{
                  cursor: isDragging ? 'grabbing' : 'grab',
                  fontSize: 22,
                  lineHeight: 1,
                  width: 36,
                  height: 32,
                  alignSelf: 'flex-start',
                  marginTop: -4,
                }}
              >
                ⋮⋮
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
