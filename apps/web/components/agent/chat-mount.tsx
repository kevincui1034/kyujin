'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ChatPanel } from './chat-panel';

// Match /app/applications/<uuid> and capture the id so the chat can use it
// as implicit context when the user says "this" without naming a company.
const APP_DETAIL_RX = /^\/app\/applications\/([0-9a-f-]{36})\b/i;

const FAB_SIZE = 60;
const EDGE_PAD = 16;
// Pointer movement under this many CSS px is treated as a click, not a drag.
// Anything past it engages drag mode and skips the open/close toggle on
// release.
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = 'yume-fab-pos';

// Idle cat-sound rotation. Every IDLE_INTERVAL_MS the FAB pops a random
// sound for IDLE_VISIBLE_MS, sourced from this list at random (no
// no-repeats guard — duplicates are rare enough not to feel scripted).
const CAT_SOUNDS = [
  'Meow!',
  'Purr…',
  'Mrrp?',
  'Mew!',
  'Nyaa~',
  'Mreow?',
  'Meep!',
  'Brrrt',
  'Prrrrt~',
  'Hmph.',
];
const IDLE_INTERVAL_MS = 10 * 60 * 1000;
const IDLE_VISIBLE_MS = 4000;

interface Pos {
  x: number;
  y: number;
}

// Prefer the visual viewport on mobile so the FAB doesn't end up under the
// URL bar / soft keyboard / pinch-zoom inset (where innerWidth/innerHeight
// would happily place it).
function viewportSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 0, h: 0 };
  const vv = window.visualViewport;
  return {
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
  };
}

function clamp(p: Pos): Pos {
  if (typeof window === 'undefined') return p;
  const { w, h } = viewportSize();
  // If the viewport is so small that EDGE_PAD + FAB > viewport, prefer
  // pinning to the top/left edge over generating an invalid range.
  const maxX = Math.max(EDGE_PAD, w - FAB_SIZE - EDGE_PAD);
  const maxY = Math.max(EDGE_PAD, h - FAB_SIZE - EDGE_PAD);
  return {
    x: Math.min(maxX, Math.max(EDGE_PAD, p.x)),
    y: Math.min(maxY, Math.max(EDGE_PAD, p.y)),
  };
}

function defaultPos(): Pos {
  const { w, h } = viewportSize();
  return {
    x: w - FAB_SIZE - 24,
    y: h - FAB_SIZE - 24,
  };
}

export function ChatMount() {
  const pathname = usePathname() ?? '';
  const match = pathname.match(APP_DETAIL_RX);
  const currentApplicationId = match?.[1] ?? null;

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [idleMeow, setIdleMeow] = useState<string | null>(null);

  // Drag state lives in a ref so pointermove handlers don't trigger re-renders
  // until we actually update position.
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startFabX: number;
    startFabY: number;
    moved: boolean;
  } | null>(null);

  // Restore persisted position on mount; default to bottom-right.
  useEffect(() => {
    let initial: Pos | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Pos>;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          initial = clamp({ x: parsed.x, y: parsed.y });
        }
      }
    } catch {
      /* corrupted storage — fall through to default */
    }
    setPos(initial ?? defaultPos());

    // Re-clamp whenever the viewport bounds change so the FAB never gets
    // stranded off-screen. `resize` covers desktop window changes;
    // `visualViewport.resize` + `orientationchange` cover mobile cases
    // (URL bar showing/hiding, soft keyboard, rotation) that don't always
    // fire a plain `resize`.
    const onResize = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', onResize);
    };
  }, []);

  // Idle meow: every IDLE_INTERVAL_MS, pop a random cat sound for a few
  // seconds. Skipped when the tab isn't visible so we don't waste a meow on
  // an invisible page. Cleared on unmount.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const sound = CAT_SOUNDS[Math.floor(Math.random() * CAT_SOUNDS.length)] ?? 'Meow!';
      setIdleMeow(sound);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setIdleMeow(null), IDLE_VISIBLE_MS);
    };
    const interval = setInterval(tick, IDLE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pos) return;
      // Ignore non-primary buttons (right-click, etc.) so they don't fight
      // browser context menus.
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startFabX: pos.x,
        startFabY: pos.y,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
    }
    setPos(clamp({ x: d.startFabX + dx, y: d.startFabY + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may have already been released */
    }
    if (d?.moved) {
      setDragging(false);
      setPos((p) => {
        if (!p) return p;
        const clamped = clamp(p);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
        } catch {
          /* private mode / quota — best effort */
        }
        return clamped;
      });
      return;
    }
    setOpen((v) => !v);
  }, []);

  const onPointerCancel = useCallback(() => {
    if (dragRef.current?.moved) {
      setDragging(false);
    }
    dragRef.current = null;
  }, []);

  if (!pos) return null;

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close Kitty' : 'Talk to Kitty'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`pillow fixed z-50 inline-flex items-center justify-center overflow-hidden ${
          dragging ? '' : 'transition-transform hover:-translate-y-0.5 active:translate-y-0'
        }`}
        style={{
          left: pos.x,
          top: pos.y,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: 22,
          background: 'var(--yume-paper)',
          border: '1.5px solid var(--yume-line)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <Image
          src="/brand/calico-512.png"
          alt=""
          width={FAB_SIZE}
          height={FAB_SIZE}
          priority
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.14)',
            opacity: open ? 0.35 : 1,
            transition: 'opacity 160ms ease',
            pointerEvents: 'none',
          }}
        />
        {open && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: 'var(--yume-ink)', pointerEvents: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6l-12 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </span>
        )}
      </button>
      {!open && !dragging && (hovered || idleMeow) && (
        <HoverBubble
          anchor={pos}
          anchorSize={FAB_SIZE}
          text={hovered ? 'Need a hand?' : idleMeow!}
        />
      )}
      {open && !dragging && (
        <ChatPanel
          onClose={() => setOpen(false)}
          currentApplicationId={currentApplicationId}
          anchor={pos}
          anchorSize={FAB_SIZE}
        />
      )}
    </>
  );
}

// Speech bubble that pops out of the cat on hover or on the idle meow
// timer. Tail points back at the FAB; placement flips below the FAB when
// there's no room above.
function HoverBubble({
  anchor,
  anchorSize,
  text,
}: {
  anchor: Pos;
  anchorSize: number;
  text: string;
}) {
  // ~80px is enough for the (bigger) bubble + gap; if the FAB is glued to
  // the top of the viewport, flip the bubble below it.
  const above = anchor.y > 80;
  const tailSize = 12;

  return (
    <div
      role="tooltip"
      aria-hidden
      className="pointer-events-none fixed z-50"
      style={{
        left: anchor.x + anchorSize / 2,
        top: above ? anchor.y - 10 : anchor.y + anchorSize + 10,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        whiteSpace: 'nowrap',
        background: 'var(--yume-paper)',
        border: '1.5px solid var(--yume-line)',
        color: 'var(--yume-ink)',
        padding: '10px 18px',
        borderRadius: 18,
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        boxShadow:
          '0 14px 32px -10px rgba(232,90,122,0.35), 0 3px 8px -3px rgba(31,20,24,0.12)',
        animation: 'yume-bubble-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1) both',
      }}
    >
      {text}
      <span
        aria-hidden
        className="absolute"
        style={{
          left: '50%',
          width: tailSize,
          height: tailSize,
          marginLeft: -tailSize / 2,
          background: 'var(--yume-paper)',
          // Rotate a square and only show the two outward-facing borders so it
          // reads as a small triangle stitched to the bubble's edge.
          transform: 'rotate(45deg)',
          ...(above
            ? {
                bottom: -tailSize / 2 - 1,
                borderRight: '1.5px solid var(--yume-line)',
                borderBottom: '1.5px solid var(--yume-line)',
              }
            : {
                top: -tailSize / 2 - 1,
                borderLeft: '1.5px solid var(--yume-line)',
                borderTop: '1.5px solid var(--yume-line)',
              }),
        }}
      />
    </div>
  );
}
