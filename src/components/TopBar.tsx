import clsx from 'clsx';
import { Eye, EyeOff, Moon, Plus, Sun, X } from 'lucide-react';
import { useRef } from 'react';
import type { LogFile } from '../lib/types';
import { fmtBytes, nf, shortName } from '../lib/format';
import { Button } from './ui';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M9 11h14M9 16h9M9 21h11" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">Log Lens</span>
    </div>
  );
}

interface Props {
  files: LogFile[];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onAdd: (files: File[]) => void;
  onToggleFile: (id: number) => void;
  onRemoveFile: (id: number) => void;
}

export function TopBar({ files, theme, onToggleTheme, onAdd, onToggleFile, onRemoveFile }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
      <Logo />
      {files.length > 0 && <div className="hidden h-5 w-px bg-line sm:block" />}
      <div className="order-3 flex min-w-0 basis-full flex-wrap gap-1.5 sm:order-none sm:flex-1 sm:basis-auto">
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
      <div className="ml-auto flex items-center gap-1.5">
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
        {files.length > 0 && (
          <Button onClick={() => input.current?.click()}>
            <Plus size={14} />
            Thêm file
          </Button>
        )}
        <Button variant="ghost" className="w-8 px-0" aria-label="Đổi giao diện sáng/tối" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>
    </header>
  );
}
