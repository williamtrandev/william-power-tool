import clsx from 'clsx';
import { Eye, EyeOff, HardDriveDownload, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LogFile } from '../lib/types';
import { fmtBytes, nf, shortName } from '../lib/format';
import { Button } from './ui';

interface Props {
  files: LogFile[];
  onAdd: (files: File[]) => void;
  onToggleFile: (id: number) => void;
  onRemoveFile: (id: number) => void;
  onClearAll: () => void;
}

/** Loaded log files of the Log tool: toggle visibility, remove, add more. */
export function FileBar({ files, onAdd, onToggleFile, onRemoveFile, onClearAll }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  // close the confirm popover on outside click / Esc
  useEffect(() => {
    if (!confirm) return;
    const onDown = (e: MouseEvent) => {
      if (!confirmRef.current?.contains(e.target as Node)) setConfirm(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirm(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [confirm]);
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
            title={`${f.name}\n${f.format} · ${nf(f.lines)} dòng · ${fmtBytes(f.size)}\n${nf(f.traced)} entry có trace id${f.note ? '\n' + f.note : ''}`}
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
              {f.on ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              type="button"
              aria-label={`Bỏ ${f.name}`}
              onClick={() => onRemoveFile(f.id)}
              className="focus-ring grid size-5 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg"
            >
              <X size={15} />
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
      <span className="hidden items-center gap-1 text-[11.5px] text-faint lg:inline-flex" title="File được lưu trong trình duyệt này (IndexedDB) và tự mở lại khi tải lại trang">
        <HardDriveDownload size={14} /> Đã lưu, reload không mất
      </span>
      <div className="relative" ref={confirmRef}>
        <Button
          size="sm"
          variant="ghost"
          active={confirm}
          aria-expanded={confirm}
          onClick={() => setConfirm((c) => !c)}
          title="Bỏ tất cả file và xoá bản lưu trong trình duyệt"
        >
          <Trash2 size={15} /> Xoá tất cả
        </Button>
        {confirm && (
          <div role="dialog" aria-label="Xác nhận xoá tất cả file" className="animate-in absolute top-9 right-0 z-30 w-[260px] rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10">
            <p className="text-[13px] font-medium text-fg">Xoá {files.length} file khỏi trình duyệt?</p>
            <p className="mt-0.5 text-[12px] text-muted">File log sẽ bị bỏ khỏi trang và không tự mở lại khi reload.</p>
            <div className="mt-3 flex justify-end gap-1.5">
              <Button size="sm" onClick={() => setConfirm(false)}>
                Huỷ
              </Button>
              <Button
                size="sm"
                variant="danger"
                autoFocus
                onClick={() => {
                  setConfirm(false);
                  onClearAll();
                }}
              >
                <Trash2 size={15} /> Xoá tất cả
              </Button>
            </div>
          </div>
        )}
      </div>
      <Button size="sm" onClick={() => input.current?.click()}>
        <Plus size={15} />
        Thêm file
      </Button>
    </div>
  );
}
