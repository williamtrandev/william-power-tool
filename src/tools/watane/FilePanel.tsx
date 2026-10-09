import clsx from 'clsx';
import { AlertCircle, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { type CodecResult } from '../../lib/aesCodec';
import { fmtBytes, nf } from '../../lib/format';
import { ACCEPT, B64ISH, exportTable, readSheet, readTable, type Table } from '../../lib/sheetFile';
import { Button } from '../../components/ui';

const DEFAULT_COL = 'EncryptedCode';
const PREVIEW = 300;

function guessColumn(t: Table): string {
  return (
    t.fields.find((f) => f === DEFAULT_COL) ??
    t.fields.find((f) => f.toLowerCase().includes('encrypt')) ??
    t.fields.find((f) => t.rows.slice(0, 20).some((row) => B64ISH.test((row[f] ?? '').trim()))) ??
    t.fields[0] ??
    ''
  );
}

interface Props {
  run: (s: string) => CodecResult;
  decrypting: boolean;
  keyReady: boolean;
  onToast: (m: string) => void;
}

export function FilePanel({ run, decrypting, keyReady, onToast }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [col, setCol] = useState('');
  const [newCol, setNewCol] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const defaultNewCol = decrypting ? 'Code giải mã' : 'Code mã hoá';
  const outCol = newCol.trim() || defaultNewCol;

  const use = (t: Table) => {
    setTable(t);
    setCol(guessColumn(t));
    setOnlyErrors(false);
  };

  const load = async (file: File) => {
    setBusy(true);
    try {
      use(await readTable(file));
    } catch (e) {
      onToast('Không đọc được file: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dCol = useDeferredValue(col);
  const results = useMemo(() => {
    if (!table || !keyReady || !dCol) return null;
    return table.rows.map((row) => {
      const v = (row[dCol] ?? '').trim();
      if (!v) return null;
      const r = run(v);
      return r.ok ? r.value : `ERROR: ${r.error}`;
    });
  }, [table, dCol, run, keyReady]);

  const stats = useMemo(() => {
    const s = { ok: 0, err: 0, empty: 0 };
    results?.forEach((r) => (r == null ? s.empty++ : r.startsWith('ERROR: ') ? s.err++ : s.ok++));
    return s;
  }, [results]);

  const preview = useMemo(() => {
    if (!table) return [];
    const idx = table.rows.map((_, i) => i);
    const list = onlyErrors && results ? idx.filter((i) => results[i]?.startsWith('ERROR: ')) : idx;
    return list.slice(0, PREVIEW);
  }, [table, results, onlyErrors]);

  const download = () => {
    if (!table || !results) return;
    try {
      exportTable(table, outCol, results, decrypting ? '_decoded' : '_encoded');
    } catch (e) {
      onToast('Không tạo được file: ' + (e as Error).message);
    }
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) load(f);
        e.target.value = '';
      }}
    />
  );

  if (!table)
    return (
      <>
        {picker}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) load(f);
          }}
          className={clsx(
            'focus-ring flex w-full flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors',
            over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-accent',
          )}
        >
          <span className="mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent">
            {busy ? <Loader2 size={22} className="animate-spin" /> : <FileSpreadsheet size={22} strokeWidth={1.8} />}
          </span>
          <span className="text-[15px] font-semibold">{busy ? 'Đang đọc file…' : 'Chọn hoặc kéo thả file CSV / Excel'}</span>
          <span className="mt-1 text-[12.5px] text-muted">
            .csv, .xlsx, .xls · chọn sheet và cột, thêm cột “{defaultNewCol}” rồi tải về đúng định dạng gốc
          </span>
        </button>
      </>
    );

  const multiSheet = (table.sheetNames?.length ?? 0) > 1;

  return (
    <div className="space-y-4">
      {picker}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <FileSpreadsheet size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{table.fileName}</span>
              <span className="shrink-0 rounded bg-surface-2 px-1.5 text-[10.5px] font-semibold text-muted uppercase">{table.kind === 'excel' ? 'Excel' : 'CSV'}</span>
            </div>
            <div className="text-[12px] text-muted">
              {nf(table.rows.length)} dòng · {table.fields.length} cột · {fmtBytes(table.size)}
            </div>
          </div>
        </div>
        {multiSheet && (
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
            Sheet
            <select
              value={table.sheetName}
              onChange={(e) => table.wb && use(readSheet({ fileName: table.fileName, size: table.size, wb: table.wb }, e.target.value))}
              className="focus-ring h-8 min-w-[130px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-fg"
            >
              {table.sheetNames!.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {table.kind === 'excel' && table.wb && (
          <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted" title="Dòng chứa tên cột (đánh số như trong Excel)">
            Dòng header
            <input
              type="number"
              min={(table.rangeStart ?? 0) + 1}
              value={(table.headerRow ?? 0) + 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 1) use(readSheet({ fileName: table.fileName, size: table.size, wb: table.wb! }, table.sheetName!, n - 1 - (table.rangeStart ?? 0)));
              }}
              className="focus-ring h-8 w-[84px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-fg tabular-nums"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
          Cột {decrypting ? 'cần giải mã' : 'cần mã hoá'}
          <select
            value={col}
            onChange={(e) => setCol(e.target.value)}
            disabled={!table.fields.length}
            className="focus-ring h-8 min-w-[170px] rounded-md border border-line bg-surface px-2 font-mono text-[12.5px] text-fg"
          >
            {table.fields.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
          Tên cột kết quả
          <input
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            placeholder={defaultNewCol}
            className="focus-ring h-8 w-[160px] rounded-md border border-line bg-surface px-2 text-[12.5px] text-fg placeholder:text-faint"
          />
        </label>
        <Button onClick={() => input.current?.click()}>
          <RefreshCw size={13} /> Đổi file
        </Button>
        <Button variant="primary" onClick={download} disabled={!results}>
          <Download size={14} /> Tải {table.kind === 'excel' ? 'Excel' : 'CSV'} kết quả
        </Button>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
          {results ? (
            <>
              <Stat label="Thành công" n={stats.ok} cls="text-emerald-600 dark:text-emerald-400" />
              <Stat label="Lỗi" n={stats.err} cls="text-error" />
              <Stat label="Trống" n={stats.empty} cls="text-muted" />
            </>
          ) : (
            <span className="text-muted">
              {!keyReady ? 'Chọn một key hợp lệ để xử lý file' : !table.fields.length ? 'Sheet này không có dữ liệu' : 'Chọn cột để xử lý'}
            </span>
          )}
          {stats.err > 0 && (
            <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-muted select-none">
              <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
              Chỉ hiện dòng lỗi
            </label>
          )}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="w-14 px-3 py-2 text-right">{table.kind === 'excel' ? 'Dòng' : '#'}</th>
                <th className="px-3 py-2 font-mono normal-case">{col}</th>
                <th className="px-3 py-2 normal-case">{outCol}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((i) => {
                const r = results?.[i];
                const err = r?.startsWith('ERROR: ');
                return (
                  <tr key={i} className="border-t border-line align-top hover:bg-surface-2/60">
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-faint tabular-nums">{table.rowNums ? table.rowNums[i] + 1 : i + 1}</td>
                    <td className="max-w-[340px] truncate px-3 py-1.5 font-mono text-[11.5px] text-muted" title={table.rows[i][col]}>
                      {table.rows[i][col]}
                    </td>
                    <td className={clsx('px-3 py-1.5 font-mono break-all', err ? 'text-error' : 'text-fg')}>
                      {err && <AlertCircle size={12} className="mr-1 inline align-[-1px]" />}
                      {r == null ? <span className="text-faint">—</span> : err ? r.slice(7) : r}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {preview.length === PREVIEW && (
            <div className="border-t border-line px-3 py-2 text-[12px] text-faint">Đang xem trước {nf(PREVIEW)} dòng đầu — file tải về có đủ tất cả.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, n, cls }: { label: string; n: number; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-0.5">
      <span className="text-muted">{label}</span>
      <span className={clsx('font-semibold tabular-nums', cls)}>{nf(n)}</span>
    </span>
  );
}
