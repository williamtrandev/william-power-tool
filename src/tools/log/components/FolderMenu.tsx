import clsx from 'clsx';
import { Check, FolderOpen, FolderSync, KeyRound, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FolderState } from '../lib/useFolder';
import { fmtBytes } from '../../../lib/format';
import { Button, Switch } from '../../../components/ui';

function ago(ts: number | null, now: number): string {
  if (ts == null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'vừa xong';
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Connect / manage the watched log folder. */
export function FolderMenu({ folder, compact }: { folder: FolderState; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearInterval(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!folder.supported)
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled
        title="Kết nối thư mục cần Chrome hoặc Edge trên máy tính, và trang phải mở qua https, localhost hoặc file index.html"
      >
        <FolderSync size={15} /> Thư mục
      </Button>
    );

  if (!folder.connected)
    return (
      <Button size="sm" onClick={folder.connect} title="Chọn một thư mục trên máy để tự mở và theo dõi file log trong đó">
        <FolderSync size={15} /> {compact ? 'Thư mục' : 'Kết nối thư mục'}
      </Button>
    );

  const granted = folder.perm === 'granted';
  const logFiles = folder.files.filter((f) => f.logLike);
  const others = folder.files.filter((f) => !f.logLike);
  const unopened = logFiles.filter((f) => !f.selected).map((f) => f.name);

  return (
    <div className="relative" ref={ref}>
      <Button size="sm" active={open} aria-expanded={open} onClick={() => setOpen((o) => !o)} title={`Thư mục đang theo dõi: ${folder.name}`}>
        <span className={clsx('size-2 shrink-0 rounded-full', granted ? (folder.error ? 'bg-warn' : 'bg-emerald-500') : 'bg-warn')} />
        <FolderOpen size={15} />
        <span className="max-w-[140px] truncate">{folder.name}</span>
        {folder.files.some((f) => f.isNew) && <span className="rounded bg-accent px-1 text-[10px] font-semibold text-white">mới</span>}
      </Button>

      {open && (
        <div role="dialog" aria-label="Thư mục log" className="animate-in absolute top-9 right-0 z-30 w-[380px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface shadow-xl shadow-black/10">
          <div className="border-b border-line p-3">
            <div className="flex items-center gap-2">
              <FolderOpen size={17} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
              {granted ? (
                <>
                  <RefreshCw size={12} className={clsx(!folder.error && 'text-emerald-500')} />
                  {folder.error ? `Lỗi đọc thư mục: ${folder.error}` : `Đang theo dõi · quét ${ago(folder.lastScan, now)}`}
                </>
              ) : (
                <>Trình duyệt cần bạn cho phép đọc lại thư mục này.</>
              )}
            </div>
            {granted ? (
              <div className="mt-2.5">
                <Switch checked={folder.autoOpen} onChange={folder.setAutoOpen} label="Tự mở file log mới" />
              </div>
            ) : (
              <Button variant="primary" size="sm" className="mt-2.5" onClick={folder.reconnect}>
                <KeyRound size={15} /> Cho phép đọc thư mục
              </Button>
            )}
          </div>

          {granted && (
            <div className="max-h-[320px] overflow-y-auto py-1">
              {logFiles.length === 0 && others.length === 0 && <div className="px-3 py-6 text-center text-[12.5px] text-faint">Thư mục đang trống</div>}
              {[...logFiles, ...others].map((f) => (
                <button
                  key={f.name}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={f.selected}
                  aria-label={f.name}
                  onClick={() => folder.toggle(f.name)}
                  className={clsx('flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2', !f.logLike && 'opacity-60')}
                >
                  <span
                    className={clsx(
                      'grid size-4 shrink-0 place-items-center rounded border',
                      f.selected ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface',
                    )}
                  >
                    {f.selected && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-fg">{f.name}</span>
                      {f.isNew && <span className="shrink-0 rounded bg-accent px-1 text-[10px] font-semibold text-white">mới</span>}
                    </span>
                    <span className="block text-[11.5px] text-faint tabular-nums">
                      {fmtBytes(f.size)} · sửa {ago(f.lastModified, now)}
                    </span>
                  </span>
                  {f.selected && <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">đang mở</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 border-t border-line p-2">
            {granted && unopened.length > 0 && (
              <Button size="sm" onClick={() => folder.selectMany(unopened)}>
                Mở tất cả file log ({unopened.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={folder.connect}>
              <FolderSync size={15} /> Đổi thư mục
            </Button>
            <Button size="sm" variant="ghost" onClick={folder.disconnect} title="Ngừng theo dõi và đóng các file mở từ thư mục này">
              <Unplug size={15} /> Ngắt kết nối
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
