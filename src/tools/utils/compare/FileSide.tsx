import clsx from 'clsx';
import { FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fmtBytes, nf } from '../../../lib/format';
import { ACCEPT } from '../lib/sheetFile';
import type { SourceMeta } from './lib/sheetSource';
import { Button } from '../../../components/ui';
import { Select } from '../../../components/form';

const ctl = 'focus-ring h-8 w-full rounded-md border border-line bg-surface pl-2 text-[12.5px] text-fg';

interface Props {
  side: 'A' | 'B';
  meta: SourceMeta | null;
  col: string;
  /** 0..1 while the file is being read */
  loading: number | null;
  onFile: (f: File) => void;
  onSheet: (name: string) => void;
  /** 0-based sheet row */
  onHeader: (row: number) => void;
  onCol: (c: string) => void;
}

/** "Đang đọc… 42%" for CSV (streamed), seconds elapsed for Excel (parsed in one go) */
function Reading({ progress }: { progress: number }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((now - start) / 1000);
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] text-muted">
        Đang đọc file{progress > 0 ? ` · ${Math.round(progress * 100)}%` : '…'}
        {secs > 0 && ` · ${secs}s`}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={clsx('h-full rounded-full bg-accent transition-[width]', progress > 0 ? '' : 'w-1/3 animate-pulse')}
          style={progress > 0 ? { width: `${progress * 100}%` } : undefined}
        />
      </div>
    </div>
  );
}

/** One file of the comparison: pick / drop a file, then its sheet, header row and column. */
export function FileSide({ side, meta, col, loading, onFile, onSheet, onHeader, onCol }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const busy = loading != null;

  const badge = (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-[15px] font-bold text-accent">
      {busy ? <Loader2 size={18} className="animate-spin" /> : side}
    </span>
  );

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );

  if (!meta)
    return (
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => !busy && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) onFile(f);
        }}
        className={clsx(
          'focus-ring flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-accent',
          busy && 'cursor-default',
        )}
      >
        {picker}
        {badge}
        {busy ? (
          <div className="mt-3 w-full max-w-60">
            <Reading progress={loading} />
          </div>
        ) : (
          <>
            <span className="mt-3 text-[14px] font-semibold">Chọn hoặc kéo thả file {side}</span>
            <span className="mt-1 flex items-center gap-1 text-[12px] text-muted">
              <FileSpreadsheet size={13} /> .xlsx, .xls, .csv · file lớn vẫn được
            </span>
          </>
        )}
      </div>
    );

  const multiSheet = meta.sheetNames.length > 1;

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {picker}
      <div className="flex items-center gap-3">
        {badge}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={meta.fileName}>
            {meta.fileName}
          </div>
          <div className="text-[12px] text-muted">
            {nf(meta.rows)} dòng · {meta.fields.length} cột · {fmtBytes(meta.size)}
          </div>
        </div>
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()} title="Chọn file khác">
          <RefreshCw size={14} /> Đổi
        </Button>
      </div>
      {busy ? (
        <Reading progress={loading} />
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {multiSheet && (
            <label className="col-span-2 flex flex-col gap-1 text-[11.5px] font-medium text-muted">
              Sheet
              <Select value={meta.sheetName} onChange={(e) => onSheet(e.target.value)} className={ctl}>
                {meta.sheetNames.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex min-w-0 flex-col gap-1 text-[11.5px] font-medium text-muted">
            Cột cần so
            <Select value={col} onChange={(e) => onCol(e.target.value)} disabled={!meta.fields.length} className={clsx(ctl, 'font-mono')}>
              {meta.fields.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted" title="Dòng chứa tên cột (đánh số như trong Excel)">
            Dòng header
            <input
              type="number"
              min={meta.rangeStart + 1}
              value={meta.headerRow + 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1) onHeader(n - 1);
              }}
              className="focus-ring h-8 w-[84px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-fg tabular-nums"
            />
          </label>
        </div>
      )}
      {!busy && !meta.fields.length && <p className="text-[12px] text-muted">Sheet này không có dữ liệu</p>}
    </section>
  );
}
