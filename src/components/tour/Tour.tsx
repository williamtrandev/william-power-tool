import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui';

export interface TourStep {
  /** `data-tour` value of the element to highlight; omitted → centred card */
  target?: string;
  title: string;
  body: ReactNode;
  /** preferred side of the card relative to the target */
  placement?: 'bottom' | 'top' | 'left' | 'right';
  /** skip the step unless this returns true when reached */
  show?: () => boolean;
  /** primary button that does something (e.g. load sample logs) before moving on */
  action?: { label: string; run: () => Promise<void> | void };
}

const PAD = 6;
const CARD_W = 340;
const GAP = 12;

const find = (t?: string) => (t ? document.querySelector<HTMLElement>(`[data-tour="${t}"]`) : null);

/** A step is shown when its condition holds and its target (if any) is on screen. */
function visible(s: TourStep): boolean {
  if (s.show && !s.show()) return false;
  if (!s.target) return true;
  const el = find(s.target);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function placeCard(r: DOMRect | null, pref: TourStep['placement'], cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  if (!r) return { left: (vw - w) / 2, top: Math.max(16, (vh - cardH) / 2), w };
  const fits = {
    bottom: r.bottom + GAP + cardH < vh - 8,
    top: r.top - GAP - cardH > 8,
    right: r.right + GAP + w < vw - 8,
    left: r.left - GAP - w > 8,
  };
  const order = [pref ?? 'bottom', 'bottom', 'top', 'right', 'left'] as const;
  const side = order.find((s) => fits[s]) ?? 'bottom';
  let left = side === 'right' ? r.right + GAP : side === 'left' ? r.left - GAP - w : r.left + r.width / 2 - w / 2;
  let top = side === 'bottom' ? r.bottom + GAP : side === 'top' ? r.top - GAP - cardH : r.top + r.height / 2 - cardH / 2;
  left = Math.min(Math.max(left, 12), vw - w - 12);
  top = Math.min(Math.max(top, 12), vh - cardH - 12);
  return { left, top, w };
}

interface Props {
  steps: TourStep[];
  onClose: (finished: boolean) => void;
}

/** Spotlight walkthrough: dims the page, cuts out the target element and explains it. */
export function Tour({ steps, onClose }: Props) {
  const [i, setI] = useState(() => steps.findIndex(visible));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardH, setCardH] = useState(200);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[i];

  const go = useCallback(
    (dir: 1 | -1) => {
      for (let j = i + dir; j >= 0 && j < steps.length; j += dir) {
        if (visible(steps[j])) return setI(j);
      }
      if (dir === 1) onClose(true);
    },
    [i, steps, onClose],
  );

  // follow the target while layout changes (panels open, lists render, window resizes)
  useLayoutEffect(() => {
    if (!step) return;
    const el = find(step.target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      const e = find(step.target);
      setRect(e ? e.getBoundingClientRect() : null);
      if (card.current) setCardH(card.current.offsetHeight);
    };
    measure();
    const t = setInterval(measure, 250);
    addEventListener('resize', measure);
    addEventListener('scroll', measure, true);
    return () => {
      clearInterval(t);
      removeEventListener('resize', measure);
      removeEventListener('scroll', measure, true);
    };
  }, [step]);

  // keyboard: ← → Enter Esc (captured so the page's own shortcuts don't fire underneath)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      const k = e.key;
      if (k === 'Escape') onClose(false);
      else if (k === 'ArrowRight' || k === 'Enter') go(1);
      else if (k === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [go, onClose, busy]);

  useEffect(() => {
    if (i < 0) onClose(true);
  }, [i, onClose]);

  if (!step) return null;

  const shown = steps.filter(visible);
  const pos = Math.max(0, shown.indexOf(step));
  const r = step.target ? rect : null;
  const { left, top, w } = placeCard(r, step.placement, cardH);
  // cut-out around the target, kept inside the viewport (targets can touch the screen edges)
  const hole =
    r &&
    (() => {
      const x = Math.max(2, r.left - PAD);
      const y = Math.max(2, r.top - PAD);
      const right = Math.min(window.innerWidth - 2, r.right + PAD);
      const bottom = Math.min(window.innerHeight - 2, r.bottom + PAD);
      return { x, y, w: right - x, h: bottom - y };
    })();
  const last = !steps.slice(i + 1).some(visible);

  const runAction = async () => {
    if (!step.action) return;
    setBusy(true);
    try {
      await step.action.run();
    } finally {
      setBusy(false);
    }
    go(1);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={`Hướng dẫn: ${step.title}`}>
      {/* dimmed page with a cut-out around the target */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={10} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.55)" mask="url(#tour-hole)" />
      </svg>
      {hole && (
        <div
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-accent transition-all duration-200 ease-out"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, boxShadow: '0 0 0 4px var(--accent-ring)' }}
        />
      )}

      <div
        ref={card}
        key={i}
        className="animate-in absolute rounded-xl border border-line bg-surface p-4 shadow-2xl shadow-black/30 transition-[left,top] duration-200 ease-out"
        style={{ left, top, width: w }}
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent tabular-nums">
            {pos + 1}/{shown.length}
          </span>
          <h2 className="min-w-0 flex-1 text-[14px] font-semibold tracking-tight">{step.title}</h2>
          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Đóng hướng dẫn"
            className="focus-ring grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
        <div className="text-[13px] leading-relaxed text-fg-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-fg [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-line [&_kbd]:border-b-2 [&_kbd]:bg-surface-2 [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[11px] [&_li]:mt-1 [&_ul]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-4">
          {step.body}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5">
          {/* fixed-width progress bar (a dot per step overflowed the card on long tours) */}
          <div className="mr-auto h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${((pos + 1) / shown.length) * 100}%` }} />
          </div>
          {pos > 0 && (
            <Button size="sm" variant="ghost" onClick={() => go(-1)} disabled={busy}>
              <ArrowLeft size={14} /> Quay lại
            </Button>
          )}
          {step.action ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => go(1)} disabled={busy}>
                Bỏ qua
              </Button>
              <Button size="sm" variant="primary" onClick={runAction} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {step.action.label}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" onClick={() => go(1)} autoFocus>
              {last ? (
                <>
                  <Check size={14} /> Xong
                </>
              ) : (
                <>
                  Tiếp <ArrowRight size={14} />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
