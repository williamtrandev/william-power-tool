import clsx from 'clsx';
import { SearchX } from 'lucide-react';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { snippetOf, sumHasHit } from '../lib/search';
import { useRaw } from '../lib/rawCache';
import { SUS_MIN, type LogEntry, type LogFile } from '../lib/types';
import { fmtDate, fmtTime } from '../lib/format';
import { useLogDisplay, useMedia } from '../lib/useLogDisplay';
import { RAIL_W, ScrollRail } from './ScrollRail';
import { FileTag, Highlight, LevelBadge } from './ui';

/** Which optional columns are actually rendered (user prefs + screen width). */
interface Cols {
  time: boolean;
  date: boolean;
  level: boolean;
  source: boolean;
  trace: boolean;
}

/** Column widths scale with the log font size so larger text doesn't get clipped. */
function gridTemplate(c: Cols, fs: number): string {
  const k = fs / 12;
  const px = (n: number) => `${Math.round(n * k)}px`;
  return [
    '3px',
    c.time && px(c.date ? 104 : 64),
    c.level && px(50),
    c.source && px(112),
    c.trace && px(72),
    'minmax(0,1fr)',
  ]
    .filter(Boolean)
    .join(' ');
}

export interface LogTableHandle {
  focus: () => void;
}

interface Props {
  rows: LogEntry[];
  selected: LogEntry | null;
  onSelect: (e: LogEntry) => void;
  onMove: (delta: number) => void;
  fileById: Map<number, LogFile>;
  hl: RegExp | null;
  emptyHint: string;
  /** table scrolls back to the top when this changes (search / filters), not on data refresh */
  scrollKey: string;
}

const Row = memo(function Row({
  e,
  file,
  sel,
  hl,
  onSelect,
  cols,
  grid,
}: {
  e: LogEntry;
  file: LogFile | undefined;
  sel: boolean;
  hl: RegExp | null;
  onSelect: (e: LogEntry) => void;
  cols: Cols;
  grid: string;
}) {
  // the summary may not contain the hit — then read the entry text (visible rows only) for an excerpt
  const needsSnip = !sumHasHit(e, hl);
  const raw = useRaw(needsSnip ? e : null);
  const snip = needsSnip ? snippetOf(e, hl, raw) : '';
  return (
    <div
      role="row"
      aria-selected={sel}
      onClick={() => onSelect(e)}
      className={clsx(
        'fs-log grid h-full cursor-pointer items-center gap-2.5 border-b border-line pr-3 font-mono',
        sel ? 'bg-sel' : 'hover:bg-surface-2',
      )}
      style={{ gridTemplateColumns: grid }}
    >
      <span className={clsx('h-full', e.score >= 80 ? 'bg-error' : e.score >= SUS_MIN ? 'bg-warn' : '')} />
      {cols.time && (
        <span className="whitespace-nowrap text-muted tabular-nums">
          {cols.date && <span className="text-faint">{fmtDate(e.ts)} </span>}
          {fmtTime(e.ts)}
        </span>
      )}
      {cols.level && (
        <span>
          <LevelBadge level={e.level} />
        </span>
      )}
      {cols.source && (
        <span className="min-w-0">
          <FileTag file={file} className="max-w-full font-sans" />
        </span>
      )}
      {cols.trace && (
        <span className={clsx('truncate text-faint', e.ti && 'italic')} title={e.trace ? (e.ti ? 'Suy luận: ' : '') + e.trace : undefined}>
          {e.trace?.slice(0, 8)}
        </span>
      )}
      {snip ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className="max-w-[40%] shrink-0 truncate text-fg">{e.sum.slice(0, 200)}</span>
          <span className="min-w-0 truncate rounded bg-surface-3/70 px-1.5 py-px text-fg-2">
            <Highlight text={snip} hl={hl} />
          </span>
        </span>
      ) : (
        <span className="truncate text-fg">
          <Highlight text={e.sum.slice(0, 400)} hl={hl} />
        </span>
      )}
    </div>
  );
});

/**
 * Browsers cap element height (~33.5M px in Chrome, ~17.9M in Firefox), so a list of a few
 * million rows can't be one tall scrollable element. Above this height the scroll range is
 * kept fixed and scroll position maps proportionally onto row index ("scaled" mode).
 */
const MAX_SCROLL_H = 8_000_000;
const OVERSCAN = 12;

export const LogTable = forwardRef<LogTableHandle, Props>(function LogTable({ rows, selected, onSelect, onMove, fileById, hl, emptyHint, scrollKey }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => scroller.current?.focus() }), []);
  const display = useLogDisplay();
  const md = useMedia('(min-width: 768px)');
  const fs = display.fontSize;
  const rowH = Math.round(fs * 2.5);
  const cols = useMemo<Cols>(
    () => ({
      time: display.cols.time,
      date: md,
      level: display.cols.level,
      source: display.cols.source && md,
      trace: display.cols.trace && md,
    }),
    [display.cols, md],
  );
  const grid = useMemo(() => gridTemplate(cols, fs), [cols, fs]);

  // --- virtual scrolling (own implementation, see MAX_SCROLL_H) ---
  const [view, setView] = useState({ top: 0, h: 600 });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView((v) => ({ ...v, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // update straight from the scroll event (rAF is paused in background tabs, which left the
  // rendered rows out of sync with scrollTop after programmatic scrolls)
  const onScroll = () => {
    const el = scroller.current;
    if (el) setView({ top: el.scrollTop, h: el.clientHeight });
  };

  const n = rows.length;
  const full = n * rowH;
  const scaled = full > MAX_SCROLL_H;
  const scrollH = scaled ? MAX_SCROLL_H : full;
  const perView = view.h / rowH;
  const maxPos = Math.max(0, n - perView);
  const room = Math.max(1, scrollH - view.h);
  /** fractional index of the first visible row */
  const pos = scaled ? (Math.min(view.top, room) / room) * maxPos : view.top / rowH;

  const geo = useRef({ scaled, room, maxPos, rowH, perView, pos });
  geo.current = { scaled, room, maxPos, rowH, perView, pos };
  const scrollToPos = useCallback((p: number) => {
    const el = scroller.current;
    const g = geo.current;
    if (!el) return;
    const c = Math.min(Math.max(p, 0), g.maxPos);
    el.scrollTop = g.scaled ? (c / Math.max(1e-9, g.maxPos)) * g.room : c * g.rowH;
    // don't wait for the scroll event — it is deferred while the tab is in the background
    setView({ top: el.scrollTop, h: el.clientHeight });
  }, []);
  const scrollToIndex = useCallback(
    (i: number) => {
      const g = geo.current;
      if (i < g.pos) scrollToPos(i);
      else if (i + 1 > g.pos + g.perView) scrollToPos(i + 1 - g.perView);
    },
    [scrollToPos],
  );

  useEffect(() => {
    scrollToPos(0);
  }, [scrollKey, scrollToPos]);

  // computed once per (rows, selection) change — not on every scroll frame
  const selIdx = useMemo(() => (selected ? rows.indexOf(selected) : -1), [rows, selected]);
  const selIdxRef = useRef(selIdx);
  selIdxRef.current = selIdx;
  // Follow the selection only when the user picks another line or changes the search —
  // not when a watched file is re-read (the same line comes back as a new object).
  const selKey = selected ? `${selected.f}:${selected.ln}` : '';
  useEffect(() => {
    if (selIdxRef.current >= 0) scrollToIndex(selIdxRef.current);
  }, [selKey, scrollKey, scrollToIndex]);

  // Rows were inserted/removed around the same selection (another file loaded, a watched file
  // grew): keep what you are reading where it is instead of letting it slide away.
  const anchor = useRef({ rows, selIdx, selKey, scrollKey });
  useLayoutEffect(() => {
    const prev = anchor.current;
    // a watched file was re-read: for one render the selection is the stale object (index -1)
    // until it is re-found — keep the last good anchor until then
    if (selIdx < 0) return;
    anchor.current = { rows, selIdx, selKey, scrollKey };
    if (prev.rows === rows || prev.scrollKey !== scrollKey || !selKey || prev.selKey !== selKey) return;
    if (prev.selIdx < 0 || prev.selIdx === selIdx) return;
    const g = geo.current;
    const wasVisible = prev.selIdx >= g.pos && prev.selIdx < g.pos + g.perView;
    // at the very top and the selection is off-screen: stay on top, new lines stream in (tail -f)
    if (!wasVisible && g.pos < 0.5) return;
    scrollToPos(g.pos + (selIdx - prev.selIdx));
  }, [rows, selIdx, selKey, scrollKey, scrollToPos]);

  const first = Math.max(0, Math.floor(pos) - OVERSCAN);
  const last = Math.min(n, Math.ceil(pos + perView) + OVERSCAN);
  const items: React.ReactNode[] = [];
  for (let i = first; i < last; i++) {
    const e = rows[i];
    // unscaled: y === i * rowH; scaled: rows are laid out relative to the current viewport
    const y = scaled ? view.top + (i - pos) * rowH : i * rowH;
    items.push(
      <div key={i} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rowH, transform: `translateY(${y}px)` }}>
        <Row e={e} file={fileById.get(e.f)} sel={e === selected} hl={hl} onSelect={onSelect} cols={cols} grid={grid} />
      </div>,
    );
  }

  return (
    <section data-tour="log-table" className="flex min-h-0 min-w-0 flex-col bg-surface" aria-label="Danh sách log">
      <div
        className="grid h-9 shrink-0 items-center gap-2.5 border-b border-line pr-3 text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase"
        style={{ gridTemplateColumns: grid, marginRight: RAIL_W }}
      >
        <span />
        {cols.time && <span>Thời gian</span>}
        {cols.level && <span>Level</span>}
        {cols.source && <span>Nguồn</span>}
        {cols.trace && <span>Trace</span>}
        <span>Nội dung</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={scroller}
          tabIndex={0}
          role="grid"
          aria-rowcount={n}
          onScroll={onScroll}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onKeyDown={(ev) => {
            const d = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1, PageDown: 20, PageUp: -20, Home: -1e9, End: 1e9 }[ev.key];
            if (d) {
              ev.preventDefault();
              onMove(d);
            }
          }}
        >
          {n === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted">
              <SearchX size={22} className="text-faint" />
              <div className="font-medium text-fg-2">Không có dòng nào khớp</div>
              <div className="text-[12.5px]">{emptyHint}</div>
            </div>
          ) : (
            <div style={{ height: scrollH, position: 'relative' }}>{items}</div>
          )}
        </div>
        <ScrollRail rows={rows} pos={pos} perView={perView} selIdx={selIdx} onPos={scrollToPos} />
      </div>
    </section>
  );
});
