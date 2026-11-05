import { ArrowLeftRight, CaseSensitive, Loader2, Space } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadBlob } from '../lib/sheetFile';
import type { Summary } from './lib/compare';
import { CompareClient } from './lib/compareClient';
import type { Side as SideId } from './lib/compare.worker';
import type { SourceMeta } from './lib/sheetSource';
import { CompareResultView } from './CompareResultView';
import { FileSide } from './FileSide';
import { Button, Switch } from '../../../components/ui';

interface Side {
  meta: SourceMeta | null;
  col: string;
  /** 0..1 while the file is being read */
  loading: number | null;
}
const EMPTY: Side = { meta: null, col: '', loading: null };

/** Keep the picked column when the new header still has it, else the other side's, else the first. */
const pickCol = (m: SourceMeta, mine: string, other: string) => (m.fields.includes(mine) ? mine : m.fields.includes(other) ? other : (m.fields[0] ?? ''));

/**
 * Compare one column of two CSV / Excel files: values in both, only in A, only in B.
 * Files are read and compared in a worker, so large files do not freeze the page.
 */
export function CompareSection({ onToast }: { onToast: (m: string) => void }) {
  const [client] = useState(() => new CompareClient());
  const [sides, setSides] = useState<Record<SideId, Side>>({ A: EMPTY, B: EMPTY });
  const [trim, setTrim] = useState(true);
  const [ignoreCase, setIgnoreCase] = useState(true);
  /** last finished comparison and the inputs it was made from */
  const [done, setDone] = useState<{ input: unknown[]; summary: Summary | null } | null>(null);
  const [exporting, setExporting] = useState(false);
  const { A: a, B: b } = sides;

  useEffect(() => () => client.dispose(), [client]);

  const patch = (id: SideId, p: Partial<Side>) => setSides((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const other = (id: SideId) => sides[id === 'A' ? 'B' : 'A'];

  /** run a worker call that replaces this side's file / sheet / header */
  const reload = async (id: SideId, req: Parameters<CompareClient['call']>[0]) => {
    // a header change only re-slices data the worker holds: no progress bar
    if (req.type !== 'header') patch(id, { loading: 0 });
    try {
      const meta = await client.call<SourceMeta>(req, (p) => patch(id, { loading: p }));
      setSides((s) => ({ ...s, [id]: { meta, col: pickCol(meta, s[id].col, other(id).col), loading: null } }));
    } catch (e) {
      patch(id, { loading: null });
      onToast('Không đọc được file: ' + (e as Error).message);
    }
  };

  const ready = !!(a.meta && b.meta && a.col && b.col && a.loading == null && b.loading == null);
  const input = [a.meta, b.meta, a.col, b.col, trim, ignoreCase];
  const comparing = ready && !(done && done.input.every((v, i) => v === input[i]));
  // while a new comparison runs the previous result stays on screen
  const summary = ready ? (done?.summary ?? null) : null;
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const input = [a.meta, b.meta, a.col, b.col, trim, ignoreCase];
    client
      .call<Summary | null>({ type: 'compare', colA: a.col, colB: b.col, opts: { trim, ignoreCase } })
      .then((summary) => live && setDone({ input, summary }))
      .catch((e: Error) => {
        if (!live) return;
        setDone({ input, summary: null });
        onToast('Không so sánh được: ' + e.message);
      });
    return () => {
      live = false;
    };
  }, [client, ready, a.meta, b.meta, a.col, b.col, trim, ignoreCase, onToast]);

  const doExport = async () => {
    if (!a.meta || !b.meta) return;
    setExporting(true);
    try {
      const buf = await client.call<ArrayBuffer>({ type: 'export', nameA: `${a.meta.fileName} · ${a.col}`, nameB: `${b.meta.fileName} · ${b.col}` });
      downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'so-sanh-excel.xlsx');
    } catch (e) {
      onToast('Không tạo được file: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const side = (id: SideId) => (
    <FileSide
      side={id}
      meta={sides[id].meta}
      col={sides[id].col}
      loading={sides[id].loading}
      onFile={(file) => reload(id, { type: 'open', side: id, file })}
      onSheet={(sheet) => reload(id, { type: 'sheet', side: id, sheet })}
      onHeader={(row) => reload(id, { type: 'header', side: id, row })}
      onCol={(col) => patch(id, { col })}
    />
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {side('A')}
        {side('B')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Switch checked={trim} onChange={setTrim} label="Bỏ khoảng trắng thừa" icon={<Space size={15} />} />
        <Switch checked={ignoreCase} onChange={setIgnoreCase} label="Không phân biệt hoa/thường" icon={<CaseSensitive size={15} />} />
        <Button
          className="ml-auto"
          disabled={(!a.meta && !b.meta) || a.loading != null || b.loading != null}
          onClick={() => client.call({ type: 'swap' }).then(() => setSides({ A: b, B: a }))}
          title="Đổi chỗ file A và B"
        >
          <ArrowLeftRight size={15} /> Đổi A ↔ B
        </Button>
      </div>

      {summary ? (
        <CompareResultView client={client} summary={summary} busy={comparing} exporting={exporting} onExport={doExport} onToast={onToast} />
      ) : (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-muted">
          {comparing ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Đang so sánh…
            </>
          ) : (
            'Chọn đủ hai file và cột cần so để xem kết quả. File chỉ được đọc trên trình duyệt, không tải lên server.'
          )}
        </p>
      )}
    </div>
  );
}
