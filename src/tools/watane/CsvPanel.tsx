import clsx from 'clsx';
import { AlertCircle, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { type CodecResult } from '../../lib/aesCodec';
import { fmtBytes, nf } from '../../lib/format';
import { Button } from '../../components/ui';

const DEFAULT_COL = 'EncryptedCode';
const PREVIEW = 300;
const B64ISH = /^[A-Za-z0-9+/]{16,}={0,2}$/;

interface Sheet {
  name: string;
  size: number;
  fields: string[];
  rows: Record<string, string>[];
}

interface Props {
  run: (s: string) => CodecResult;
  decrypting: boolean;
  keyReady: boolean;
  onToast: (m: string) => void;
}

export function CsvPanel({ run, decrypting, keyReady, onToast }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [col, setCol] = useState('');
  const [newCol, setNewCol] = useState('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [over, setOver] = useState(false);
  const defaultNewCol = decrypting ? 'Code giải mã' : 'Code mã hoá';
  const outCol = newCol.trim() || defaultNewCol;

  const load = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const fields = r.meta.fields ?? [];
        if (!fields.length) return onToast('Không đọc được header của file CSV');
        const guess =
          fields.find((f) => f === DEFAULT_COL) ??
          fields.find((f) => f.toLowerCase().includes('encrypt')) ??
          fields.find((f) => r.data.slice(0, 20).some((row) => B64ISH.test((row[f] ?? '').trim()))) ??
          fields[0];
        setSheet({ name: file.name, size: file.size, fields, rows: r.data });
        setCol(guess);
        setOnlyErrors(false);
      },
      error: (err) => onToast('Lỗi đọc CSV: ' + err.message),
    });
  };

  const dCol = useDeferredValue(col);
  const results = useMemo(() => {
    if (!sheet || !keyReady || !dCol) return null;
    return sheet.rows.map((row) => {
      const v = (row[dCol] ?? '').trim();
      if (!v) return null;
      const r = run(v);
      return r.ok ? r.value : `ERROR: ${r.error}`;
    });
  }, [sheet, dCol, run, keyReady]);

  const stats = useMemo(() => {
    const s = { ok: 0, err: 0, empty: 0 };
    results?.forEach((r) => (r == null ? s.empty++ : r.startsWith('ERROR: ') ? s.err++ : s.ok++));
    return s;
  }, [results]);

  const preview = useMemo(() => {
    if (!sheet) return [];
    const idx = sheet.rows.map((_, i) => i);
    const list = onlyErrors && results ? idx.filter((i) => results[i]?.startsWith('ERROR: ')) : idx;
    return list.slice(0, PREVIEW);
  }, [sheet, results, onlyErrors]);

  const download = () => {
    if (!sheet || !results) return;
    const data = sheet.rows.map((row, i) => ({ ...row, [outCol]: results[i] ?? '' }));
    const fields = sheet.fields.includes(outCol) ? sheet.fields : [...sheet.fields, outCol];
    // BOM so Excel opens Vietnamese text as UTF-8 (same as the script's utf-8-sig)
    const csv = '﻿' + Papa.unparse({ fields, data });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = sheet.name.replace(/\.csv$/i, '') + (decrypting ? '_decoded.csv' : '_encoded.csv');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".csv,text/csv"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) load(f);
        e.target.value = '';
      }}
    />
  );

  if (!sheet)
    return (
      <>
        {picker}
        <button
          type="button"
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
            <FileSpreadsheet size={22} strokeWidth={1.8} />
          </span>
          <span className="text-[15px] font-semibold">Chọn hoặc kéo thả file CSV</span>
          <span className="mt-1 text-[12.5px] text-muted">
            Tự chọn cột <code className="rounded bg-surface-2 px-1 font-mono text-[11.5px]">{DEFAULT_COL}</code>, thêm cột “{defaultNewCol}” và tải về file mới
          </span>
        </button>
      </>
    );

  return (
    <div className="space-y-4">
      {picker}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <FileSpreadsheet size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{sheet.name}</div>
            <div className="text-[12px] text-muted">
              {nf(sheet.rows.length)} dòng · {sheet.fields.length} cột · {fmtBytes(sheet.size)}
            </div>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[11.5px] font-medium text-muted">
          Cột {decrypting ? 'mã hoá' : 'cần mã hoá'}
          <select
            value={col}
            onChange={(e) => setCol(e.target.value)}
            className="focus-ring h-8 min-w-[160px] rounded-md border border-line bg-surface px-2 font-mono text-[12.5px] text-fg"
          >
            {sheet.fields.map((f) => (
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
          <Download size={14} /> Tải CSV kết quả
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
            <span className="text-muted">{keyReady ? 'Chọn cột để xử lý' : 'Nhập secret key hợp lệ để xử lý file'}</span>
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
                <th className="w-12 px-3 py-2 text-right">#</th>
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
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-faint tabular-nums">{i + 1}</td>
                    <td className="max-w-[340px] truncate px-3 py-1.5 font-mono text-[11.5px] text-muted" title={sheet.rows[i][col]}>
                      {sheet.rows[i][col]}
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
