import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { SearchX } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import { snippetOf } from '../lib/search';
import { SUS_MIN, type LogEntry, type LogFile } from '../lib/types';
import { fmtDate, fmtTime } from '../lib/format';
import { FileTag, Highlight, LevelBadge } from './ui';

const ROW_H = 30;
const COLS =
  'grid-cols-[3px_64px_50px_minmax(0,1fr)] md:grid-cols-[3px_104px_50px_108px_minmax(0,1fr)] 2xl:grid-cols-[3px_108px_50px_120px_72px_minmax(0,1fr)]';

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

const Row = memo(function Row({ e, file, sel, hl, onSelect }: { e: LogEntry; file: LogFile | undefined; sel: boolean; hl: RegExp | null; onSelect: (e: LogEntry) => void }) {
  const snip = snippetOf(e, hl);
  return (
    <div
      role="row"
      aria-selected={sel}
      onClick={() => onSelect(e)}
      className={clsx(
        'grid h-full cursor-pointer items-center gap-2.5 border-b border-line pr-3 font-mono text-[12px]',
        COLS,
        sel ? 'bg-sel' : 'hover:bg-surface-2',
      )}
    >
      <span className={clsx('h-full', e.score >= 80 ? 'bg-error' : e.score >= SUS_MIN ? 'bg-warn' : '')} />
      <span className="whitespace-nowrap text-muted tabular-nums">
        <span className="hidden text-faint md:inline">{fmtDate(e.ts)} </span>
        {fmtTime(e.ts)}
      </span>
      <span>
        <LevelBadge level={e.level} />
      </span>
      <span className="hidden min-w-0 md:block">
        <FileTag file={file} className="max-w-full font-sans text-[12px]" />
      </span>
      <span className={clsx('hidden truncate text-faint 2xl:block', e.ti && 'italic')} title={e.trace ? (e.ti ? 'Suy luận: ' : '') + e.trace : undefined}>
        {e.trace?.slice(0, 8)}
      </span>
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
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 20 });

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [rows]);

  const selIdx = selected ? rows.indexOf(selected) : -1;
  useEffect(() => {
    if (selIdx >= 0) v.scrollToIndex(selIdx, { align: 'auto' });
  }, [selIdx, v]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-surface" aria-label="Danh sách log">
      <div className={clsx('grid h-9 shrink-0 items-center gap-2.5 border-b border-line pr-3 text-[11px] font-semibold tracking-wider text-muted uppercase', COLS)}>
        <span />
        <span>Thời gian</span>
        <span>Level</span>
        <span className="hidden md:block">Nguồn</span>
        <span className="hidden 2xl:block">Trace</span>
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
                <div key={it.key} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${it.start}px)` }}>
                  <Row e={e} file={fileById.get(e.f)} sel={e === selected} hl={hl} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});
