import clsx from 'clsx';
import { Clock, Layers, X } from 'lucide-react';
import { LEVELS, type Level } from '../lib/types';
import { fmtDateTime, nf } from '../lib/format';
import { LEVEL_META } from './ui';

interface Props {
  levelCounts: Record<Level, number>;
  levels: Set<Level>;
  onToggleLevel: (l: Level) => void;
  timeRange: [number, number] | null;
  onClearTime: () => void;
  sig: string | null;
  onClearSig: () => void;
  canClear: boolean;
  onClearAll: () => void;
  total: number;
  shown: number;
  suspicious: number;
}

function ActiveChip({ icon, children, onClear, label }: { icon: React.ReactNode; children: React.ReactNode; onClear: () => void; label: string }) {
  return (
    <span className="inline-flex h-7 max-w-[420px] items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft pr-1 pl-2 text-[12px] text-accent">
      {icon}
      <span className="truncate font-mono">{children}</span>
      <button type="button" aria-label={label} onClick={onClear} className="focus-ring grid size-5 place-items-center rounded hover:bg-accent/15">
        <X size={12} />
      </button>
    </span>
  );
}

export function FilterBar(p: Props) {
  const visible = LEVELS.filter((l) => p.levelCounts[l] || p.levels.has(l));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((l) => {
        const on = p.levels.has(l);
        const n = p.levelCounts[l];
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => p.onToggleLevel(l)}
            className={clsx(
              'focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium tabular-nums transition-colors',
              on ? 'border-fg/25 bg-surface-3 text-fg' : 'border-line bg-surface text-fg-2 hover:border-line-strong',
              !n && 'opacity-45',
            )}
          >
            <span className={clsx('size-1.5 rounded-full', LEVEL_META[l].dot)} />
            {l}
            <span className="text-muted">{nf(n)}</span>
          </button>
        );
      })}
      {p.timeRange && (
        <ActiveChip icon={<Clock size={12} />} onClear={p.onClearTime} label="Bỏ lọc thời gian">
          {fmtDateTime(p.timeRange[0])} → {fmtDateTime(p.timeRange[1])}
        </ActiveChip>
      )}
      {p.sig && (
        <ActiveChip icon={<Layers size={12} />} onClear={p.onClearSig} label="Bỏ lọc nhóm lỗi">
          {p.sig}
        </ActiveChip>
      )}
      {p.canClear && (
        <button type="button" onClick={p.onClearAll} className="focus-ring ml-1 h-7 rounded-md px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg">
          Xoá bộ lọc
        </button>
      )}
      <div className="ml-auto text-[12.5px] whitespace-nowrap text-muted tabular-nums">
        <span className="font-semibold text-fg">{nf(p.shown)}</span> / {nf(p.total)} dòng
        <span className="mx-1.5 text-faint">·</span>
        <span className="font-medium text-error">{nf(p.suspicious)} khả nghi</span>
      </div>
    </div>
  );
}
