import clsx from 'clsx';
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import type { LogFile } from '../lib/types';
import { fmtBytes, nf, shortName } from '../lib/format';
import { Button } from './ui';

interface Props {
  files: LogFile[];
  onAdd: (files: File[]) => void;
  onToggleFile: (id: number) => void;
  onRemoveFile: (id: number) => void;
}

/** Loaded log files of the Log tool: toggle visibility, remove, add more. */
export function FileBar({ files, onAdd, onToggleFile, onRemoveFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {files.map((f) => (
          <div
            key={f.id}
            className={clsx(
              'group flex h-7 min-w-0 max-w-full items-center gap-2 rounded-md border border-line bg-surface-2 pr-1 pl-2.5 transition-opacity',
              !f.on && 'opacity-50',
            )}
            title={`${f.name}\n${f.format} · ${nf(f.lines)} dòng · ${fmtBytes(f.size)}\n${nf(f.traced)} entry có trace id`}
          >
            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: f.on ? f.color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${f.color}` }} />
            <span className="truncate text-[12.5px] font-medium">{shortName(f.name)}</span>
            <span className="hidden shrink-0 text-[11px] text-muted md:inline">
              {f.format} · {nf(f.entries.length)}
            </span>
            <button
              type="button"
              aria-label={f.on ? `Ẩn ${f.name}` : `Hiện ${f.name}`}
              onClick={() => onToggleFile(f.id)}
              className="focus-ring grid size-5 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg"
            >
              {f.on ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button
              type="button"
              aria-label={`Bỏ ${f.name}`}
              onClick={() => onRemoveFile(f.id)}
              className="focus-ring grid size-5 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onAdd([...e.target.files]);
          e.target.value = '';
        }}
      />
      <Button size="sm" onClick={() => input.current?.click()}>
        <Plus size={13} />
        Thêm file
      </Button>
    </div>
  );
}
