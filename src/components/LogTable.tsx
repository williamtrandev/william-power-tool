import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { SearchX } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { snippetOf } from '../lib/search';
import { SUS_MIN, type LogEntry, type LogFile } from '../lib/types';
import { fmtDate, fmtTime } from '../lib/format';
import { useLogDisplay, useMedia } from '../lib/useLogDisplay';
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
  const snip = snippetOf(e, hl);
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

export const LogTable = forwardRef<LogTableHandle, Props>(function LogTable({ rows, selected, onSelect, onMove, fileById, hl, emptyHint }, ref) {
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
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => rowH, overscan: 20 });
  // row height follows the font size — drop cached measurements when it changes
  useEffect(() => {
    v.measure();
  }, [rowH, v]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [rows]);

  const selIdx = selected ? rows.indexOf(selected) : -1;
  useEffect(() => {
    if (selIdx >= 0) v.scrollToIndex(selIdx, { align: 'auto' });
  }, [selIdx, v]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface" aria-label="Danh sách log">
      <div
        className="grid h-9 shrink-0 items-center gap-2.5 border-b border-line pr-3 text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase"
        style={{ gridTemplateColumns: grid }}
      >
        <span />
        {cols.time && <span>Thời gian</span>}
        {cols.level && <span>Level</span>}
        {cols.source && <span>Nguồn</span>}
        {cols.trace && <span>Trace</span>}
        <span>Nội dung</span>
      </div>
      <div
        ref={scroller}
        tabIndex={0}
        role="grid"
        aria-rowcount={rows.length}
        className="relative min-h-0 flex-1 overflow-y-auto outline-none"
        onKeyDown={(ev) => {
          const d = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1, PageDown: 20, PageUp: -20 }[ev.key];
          if (d) {
            ev.preventDefault();
            onMove(d);
          }
        }}
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted">
            <SearchX size={22} className="text-faint" />
            <div className="font-medium text-fg-2">Không có dòng nào khớp</div>
            <div className="text-[12.5px]">{emptyHint}</div>
          </div>
        ) : (
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map((it) => {
              const e = rows[it.index];
              return (
                <div key={it.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rowH, transform: `translateY(${it.start}px)` }}>
                  <Row e={e} file={fileById.get(e.f)} sel={e === selected} hl={hl} onSelect={onSelect} cols={cols} grid={grid} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});
