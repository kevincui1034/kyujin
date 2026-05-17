'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalicoMark } from '@/components/kyujin/calico-mark';
import type { AgentAction, AgentAppRow } from '@/lib/agent/tools';
import { PreviewCard } from './preview-card';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  // Assistant messages may carry a structured action the user can confirm.
  action?: AgentAction | null;
  candidates?: AgentAppRow[];
  resolvedRows?: AgentAppRow[];
}

interface ChatResponse {
  reply: string;
  action: AgentAction | null;
  candidates?: AgentAppRow[];
  resolvedRows?: AgentAppRow[];
}

interface ChatPanelProps {
  onClose: () => void;
  currentApplicationId: string | null;
  anchor: { x: number; y: number };
  anchorSize: number;
}

const PANEL_W = 460;
const PANEL_H = 660;
const PANEL_GAP = 12;
const PANEL_PAD = 12;

// Place the panel adjacent to the FAB, aligned to whichever side has more
// room. Falls back to clamping inside the viewport when neither side fits
// cleanly. Recomputed on resize so the panel stays usable after the window
// changes size while it's open.
function computePanelPos(anchor: { x: number; y: number }, anchorSize: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const anchorRight = anchor.x + anchorSize;

  // Horizontal: if the FAB sits in the right half of the viewport, align
  // the panel's right edge to the FAB's right edge. Otherwise align lefts.
  let left =
    anchorRight > vw / 2 ? anchorRight - PANEL_W : anchor.x;

  // Vertical: prefer above the FAB if there's room; otherwise place below.
  const roomAbove = anchor.y - PANEL_GAP;
  let top =
    roomAbove >= PANEL_H + PANEL_PAD
      ? anchor.y - PANEL_H - PANEL_GAP
      : anchor.y + anchorSize + PANEL_GAP;

  left = Math.max(PANEL_PAD, Math.min(left, vw - PANEL_W - PANEL_PAD));
  top = Math.max(PANEL_PAD, Math.min(top, vh - PANEL_H - PANEL_PAD));
  return { left, top };
}

export function ChatPanel({
  onClose,
  currentApplicationId,
  anchor,
  anchorSize,
}: ChatPanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [panelPos, setPanelPos] = useState(() => computePanelPos(anchor, anchorSize));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Recompute placement whenever the FAB moves or the viewport resizes.
  useEffect(() => {
    setPanelPos(computePanelPos(anchor, anchorSize));
    const onResize = () => setPanelPos(computePanelPos(anchor, anchorSize));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [anchor, anchorSize]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const userMsg: Message = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setDraft('');
    setSending(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: { currentApplicationId },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { error?: string; limit?: number; used?: number }
          | null;
        const content =
          err?.error === 'rate_limited'
            ? `You've hit today's chat limit (${err.limit ?? 50} messages). Try again tomorrow!`
            : err?.error === 'model_failure'
              ? "I couldn't reach my brain — try again in a moment?"
              : 'Something went sideways. Try rephrasing?';
        setMessages((prev) => [...prev, { role: 'assistant', content }]);
        return;
      }
      const data = (await res.json()) as ChatResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          action: data.action,
          candidates: data.candidates,
          resolvedRows: data.resolvedRows,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network hiccup — try again?' },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, messages, sending, currentApplicationId]);

  const onApplied = useCallback(
    (summary: string) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: summary }]);
      router.refresh();
    },
    [router],
  );

  const onDismiss = useCallback(() => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      if (last.role !== 'assistant' || !last.action) return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, action: null, candidates: undefined, resolvedRows: undefined },
      ];
    });
  }, []);

  const sendFollowup = useCallback(
    (text: string) => {
      setDraft(text);
      setTimeout(() => {
        inputRef.current?.focus();
        void send();
      }, 0);
    },
    [send],
  );

  return (
    <div
      className="pillow fixed z-50 flex flex-col overflow-hidden"
      style={{
        left: panelPos.left,
        top: panelPos.top,
        width: PANEL_W,
        height: PANEL_H,
        background: 'var(--kyujin-paper)',
        borderRadius: 22,
        border: '1.5px solid var(--kyujin-line)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          borderBottom: '1px solid var(--kyujin-line-soft)',
          background: 'var(--kyujin-bg-alt)',
        }}
      >
        <CalicoMark size={36} />
        <div className="flex-1 min-w-0">
          <div
            className="serif"
            style={{
              fontSize: 18,
              lineHeight: 1.05,
              letterSpacing: '-0.012em',
              color: 'var(--kyujin-ink)',
            }}
          >
            Kitty
          </div>
          <div
            className="serif-italic"
            style={{ fontSize: 11.5, color: 'var(--kyujin-ink-muted)' }}
          >
            here to help with your applications
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 transition-colors hover:bg-kyujin-pink-50"
          style={{ color: 'var(--kyujin-ink-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6l-12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'var(--kyujin-bg)',
        }}
      >
        {messages.length === 0 && <EmptyState />}
        {messages.map((m, i) => (
          <MessageRow
            key={i}
            message={m}
            onApplied={onApplied}
            onDismiss={onDismiss}
            onPickCandidate={(row) =>
              sendFollowup(
                `I meant the one with id ${row.id} (${row.company}${row.role ? ' — ' + row.role : ''}).`,
              )
            }
          />
        ))}
        {sending && (
          <div className="flex items-end gap-2">
            <CalicoMark size={24} />
            <div
              className="text-[12px]"
              style={{
                color: 'var(--kyujin-ink-muted)',
                padding: '6px 11px',
                background: 'var(--kyujin-paper)',
                border: '1px solid var(--kyujin-line-soft)',
                borderRadius: 14,
                borderBottomLeftRadius: 4,
              }}
            >
              <span className="inline-flex gap-1">
                <Dot delay={0} />
                <Dot delay={120} />
                <Dot delay={240} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className="flex items-end gap-2 px-3 py-3"
        style={{
          borderTop: '1px solid var(--kyujin-line-soft)',
          background: 'var(--kyujin-paper)',
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Kitty to fix or find something…"
          rows={1}
          className="flex-1 resize-none rounded-lg bg-transparent px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-kyujin-pink-200"
          style={{
            border: '1px solid var(--kyujin-line)',
            color: 'var(--kyujin-ink)',
            maxHeight: 100,
            background: 'var(--kyujin-bg)',
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!draft.trim() || sending}
          className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, var(--kyujin-pink-500), var(--kyujin-coral))',
            boxShadow: '0 4px 10px -6px var(--kyujin-pink-300)',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageRow({
  message,
  onApplied,
  onDismiss,
  onPickCandidate,
}: {
  message: Message;
  onApplied: (summary: string) => void;
  onDismiss: () => void;
  onPickCandidate: (row: AgentAppRow) => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] text-[12.5px] leading-relaxed"
          style={{
            background: 'var(--kyujin-pink-100)',
            border: '1px solid var(--kyujin-pink-200)',
            color: 'var(--kyujin-ink)',
            padding: '7px 12px',
            borderRadius: 14,
            borderBottomRightRadius: 4,
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="pt-0.5">
        <CalicoMark size={24} />
      </div>
      <div className="flex flex-col gap-2 max-w-[82%]">
        <div
          className="text-[12.5px] leading-relaxed"
          style={{
            background: 'var(--kyujin-paper)',
            border: '1px solid var(--kyujin-line-soft)',
            color: 'var(--kyujin-ink)',
            padding: '7px 12px',
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          {message.content}
        </div>
        {message.action && (
          <PreviewCard
            action={message.action}
            candidates={message.candidates}
            resolvedRows={message.resolvedRows}
            onApplied={onApplied}
            onDismiss={onDismiss}
            onPickCandidate={onPickCandidate}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-start gap-2">
      <div className="pt-0.5">
        <CalicoMark size={24} />
      </div>
      <div
        className="text-[12.5px] leading-relaxed"
        style={{
          background: 'var(--kyujin-paper)',
          border: '1px solid var(--kyujin-line-soft)',
          color: 'var(--kyujin-ink-soft)',
          padding: '9px 12px',
          borderRadius: 14,
          borderBottomLeftRadius: 4,
        }}
      >
        <span style={{ color: 'var(--kyujin-ink)' }}>Hi! Tell me what to fix.</span>
        <ul className="mt-2 list-none space-y-1" style={{ color: 'var(--kyujin-ink-muted)' }}>
          <li>&ldquo;The role on Stripe is blank, it&apos;s Senior SWE&rdquo;</li>
          <li>&ldquo;Mark all my Acme applications as rejected&rdquo;</li>
          <li>&ldquo;Show me everything ghosted past 30 days&rdquo;</li>
        </ul>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: 'var(--kyujin-pink-300)',
        animation: `kyujin-dot 1s ${delay}ms infinite ease-in-out`,
        display: 'inline-block',
      }}
    />
  );
}
