import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import type { Group } from '../lib/search';
import type { LogFile } from '../lib/types';
import { fmtTime, nf } from '../lib/format';
import { Highlight, LEVEL_META } from './ui';

interface Props {
  groups: Group[];
  active: string | null;
  onPick: (sig: string | null) => void;
  fileById: Map<number, LogFile>;
  hl: RegExp | null;
  className?: string;
}

export function GroupsPanel({ groups, active, onPick, fileById, hl, className }: Props) {
  return (
    <aside className={clsx('min-h-0 flex-col border-r border-line bg-surface', className)}>
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Nhóm lỗi</h2>
        <span className="text-[11px] text-faint tabular-nums">{groups.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[12.5px] text-muted">
            <CheckCircle2 size={20} className="text-emerald-500" />
            Không có dòng khả nghi trong kết quả hiện tại
          </div>
        ) : (
          <ul>
            {groups.map((g) => {
              const on = active === g.sig;
              return (
                <li key={g.sig}>
                  <button
                    type="button"
                    onClick={() => onPick(on ? null : g.sig)}
                    aria-pressed={on}
                    className={clsx(
                      'focus-ring block w-full border-b border-line px-3 py-2.5 text-left transition-colors',
                      on ? 'bg-sel shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-surface-2',
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={clsx('size-1.5 shrink-0 rounded-full', LEVEL_META[g.level].dot)} />
                      <span className="text-[13px] font-semibold tabular-nums">{nf(g.count)}×</span>
                      <span className="flex min-w-0 gap-1">
                        {g.files.map((id) => {
                          const f = fileById.get(id);
                          return f ? <span key={id} className="size-2 shrink-0 rounded-[3px]" style={{ background: f.color }} title={f.name} /> : null;
                        })}
                      </span>
                      <span className="ml-auto text-[11px] whitespace-nowrap text-faint tabular-nums">
                        {fmtTime(g.t0)}
                        {g.t1 !== g.t0 && <> – {fmtTime(g.t1)}</>}
                      </span>
                    </div>
                    <div className="line-clamp-3 font-mono text-[11.5px] leading-[1.5] break-all text-fg-2">
                      <Highlight text={g.sig} hl={hl} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
