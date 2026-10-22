import clsx from 'clsx';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fmtDateTime } from '../lib/format';
import { SUS_MIN, type LogEntry } from '../lib/types';

export const RAIL_W = 14;
const BTN = 18;
const MIN_THUMB = 28;

interface Props {
  rows: LogEntry[];
  /** fractional index of the first visible row */
  pos: number;
  /** rows that fit in the viewport */
  perView: number;
  selIdx: number;
  onPos: (pos: number) => void;
}

/**
 * Wide, easy-to-grab scrollbar for very long lists, doubling as a minimap: red/amber ticks show
 * where errors / warnings are, the accent tick is the selected line. Click jumps there, drag scrubs.
 */
export function ScrollRail({ rows, pos, perView, selIdx, onPos }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [h, setH] = useState(0);
  const [hover, setHover] = useState<{ y: number; idx: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const n = rows.length;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // severity minimap: one pixel row per bucket, worst severity wins
  useEffect(() => {
    const c = canvas.current;
    if (!c || !h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = RAIL_W * dpr;
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!n) return;
    const buckets = c.height;
    const sev = new Uint8Array(buckets);
    for (let i = 0; i < n; i++) {
      const s = rows[i].score;
      if (s < SUS_MIN) continue;
      const b = Math.min(buckets - 1, Math.floor((i / n) * buckets));
      const v = s >= 80 ? 2 : 1;
      if (v > sev[b]) sev[b] = v;
    }
    const css = getComputedStyle(document.documentElement);
    const colors = ['', css.getPropertyValue('--lv-warn').trim(), css.getPropertyValue('--lv-error').trim()];
    const minH = Math.max(1, Math.round(dpr * 2)); // keep single errors visible
    for (let b = 0; b < buckets; b++) {
      if (!sev[b]) continue;
      ctx.fillStyle = colors[sev[b]];
      ctx.globalAlpha = sev[b] === 2 ? 0.9 : 0.7;
      // right half only, so the thumb stays readable over dense marks
      ctx.fillRect(c.width / 2, b, c.width / 2 - dpr * 2, minH);
    }
    ctx.globalAlpha = 1;
  }, [rows, n, h]);

  const thumbH = n ? Math.max(MIN_THUMB, (perView / n) * h) : h;
  const maxPos = Math.max(0, n - perView);
  const thumbTop = maxPos ? (pos / maxPos) * (h - thumbH) : 0;
  const yToPos = (y: number, grab: number) => (maxPos * Math.min(Math.max(y - grab, 0), h - thumbH)) / Math.max(1, h - thumbH);
  const yToIdx = (y: number) => Math.min(n - 1, Math.max(0, Math.floor((y / Math.max(1, h)) * n)));

  const onPointerDown = (ev: React.PointerEvent) => {
    if (!n || ev.button !== 0) return;
    const r = track.current!.getBoundingClientRect();
    const y = ev.clientY - r.top;
    // grabbing the thumb keeps the grab point; clicking the track centres the thumb there
    const grab = y >= thumbTop && y <= thumbTop + thumbH ? y - thumbTop : thumbH / 2;
    onPos(yToPos(y, grab));
    setDragging(true);
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => onPos(yToPos(e.clientY - r.top, grab));
    const up = () => {
      setDragging(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const selY = selIdx >= 0 && n ? (selIdx / n) * h : -1;
  // the list can shrink under a hovering pointer (new search) — never index past its end
  const hoverIdx = hover ? Math.min(hover.idx, n - 1) : -1;
  const hoverRow = hoverIdx >= 0 ? rows[hoverIdx] : undefined;

  return (
    <div data-tour="scroll-rail" className="flex h-full shrink-0 flex-col border-l border-line bg-surface-2/60" style={{ width: RAIL_W }}>
      <button
        type="button"
        title="Lên đầu danh sách (Home)"
        aria-label="Lên đầu danh sách"
        onClick={() => onPos(0)}
        className="grid shrink-0 place-items-center text-faint hover:bg-surface-3 hover:text-fg"
        style={{ height: BTN }}
      >
        <ChevronsUp size={12} />
      </button>
      <div
        ref={track}
        role="scrollbar"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={n}
        aria-valuenow={Math.round(pos)}
        className="relative min-h-0 flex-1 cursor-pointer touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          const r = track.current!.getBoundingClientRect();
          const y = e.clientY - r.top;
          if (n) setHover({ y, idx: yToIdx(y) });
        }}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
        {selY >= 0 && <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-accent" style={{ top: Math.min(selY, h - 2) }} />}
        <div
          className={clsx(
            'pointer-events-none absolute inset-x-[2px] rounded-full border transition-colors',
            dragging ? 'border-accent bg-accent/30' : 'border-fg/20 bg-fg/15',
          )}
          style={{ top: thumbTop, height: thumbH }}
        />
        {hoverRow && hover && (
          <div
            className="pointer-events-none absolute right-full z-20 mr-1.5 -translate-y-1/2 rounded-md bg-fg px-2 py-1 text-[11px] whitespace-nowrap text-bg shadow-lg tabular-nums"
            style={{ top: Math.min(Math.max(hover.y, 12), h - 12) }}
          >
            {fmtDateTime(hoverRow.ts)} · dòng {(hoverIdx + 1).toLocaleString('vi-VN')}/{n.toLocaleString('vi-VN')}
          </div>
        )}
      </div>
      <button
        type="button"
        title="Xuống cuối danh sách (End)"
        aria-label="Xuống cuối danh sách"
        onClick={() => onPos(Number.MAX_SAFE_INTEGER)}
        className="grid shrink-0 place-items-center text-faint hover:bg-surface-3 hover:text-fg"
        style={{ height: BTN }}
      >
        <ChevronsDown size={12} />
      </button>
    </div>
  );
}
