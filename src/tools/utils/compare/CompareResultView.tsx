import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Copy, Download, Loader2, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { nf } from '../../../lib/format';
import { fmtRows, GROUP_LABEL, GROUPS, isDup, type Entry, type Group, type Summary } from './lib/compare';
import type { CompareClient } from './lib/compareClient';
import { Button } from '../../../components/ui';

const PAGE = 200;
const GROUP_CLS: Record<Group, string> = {
  both: 'text-emerald-600 dark:text-emerald-400',
  onlyA: 'text-amber-600 dark:text-amber-400',
  onlyB: 'text-sky-600 dark:text-sky-400',
};

interface Props {
  client: CompareClient;
  summary: Summary;
  /** a new comparison is running; the shown one is about to be replaced */
  busy: boolean;
  exporting: boolean;
  onExport: () => void;
  onToast: (m: string) => void;
}

/** Counts per group (also the group switcher), then the picked group's values one page at a time from the worker. */
export function CompareResultView({ client, summary, busy, exporting, onExport, onToast }: Props) {
  const [group, setGroup] = useState<Group>('both');
  const [query, setQuery] = useState('');
  const [onlyDups, setOnlyDups] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; entries: Entry[] } | null>(null);
  const q = useDeferredValue(query);

  // a new filter or a new comparison starts from the first page
  const key = `${group}|${onlyDups}|${q}`;
  const [seen, setSeen] = useState({ key, summary });
  if (seen.key !== key || seen.summary !== summary) {
    setSeen({ key, summary });
    setPage(0);
  }

  useEffect(() => {
    if (busy) return;
    let live = true;
    client
      .call<{ total: number; entries: Entry[] }>({ type: 'page', group, query: q, onlyDups, offset: page * PAGE, limit: PAGE })
      .then((d) => live && setData(d))
      .catch((e: Error) => live && onToast(e.message));
    return () => {
      live = false;
    };
  }, [client, summary, busy, group, q, onlyDups, page, onToast]);

  const copy = async () => {
    const text = client.call<string>({ type: 'values', group, query: q, onlyDups });
    try {
      // the clipboard item takes a promise, so the copy keeps the click's user activation while the worker joins the values
      if (typeof ClipboardItem !== 'undefined')
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      else await navigator.clipboard.writeText(await text);
      onToast(`Đã copy ${nf(data?.total ?? 0)} giá trị`);
    } catch {
      onToast('Không copy được');
    }
  };

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const from = page * PAGE;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Nhóm kết quả" className="grid grid-cols-3 gap-2">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={group === g}
            onClick={() => setGroup(g)}
            className={clsx(
              'focus-ring rounded-xl border bg-surface px-3 py-2.5 text-left transition-colors',
              group === g ? 'border-accent/60 ring-2 ring-accent/20' : 'border-line hover:border-line-strong',
            )}
          >
            <div className="truncate text-[11.5px] font-medium text-muted">{GROUP_LABEL[g]}</div>
            <div className={clsx('text-xl font-semibold tabular-nums', GROUP_CLS[g], busy && 'opacity-50')}>{nf(summary.count[g])}</div>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-[12px]">
          <div className="relative min-w-0 flex-1 basis-40">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm giá trị…"
              aria-label="Tìm giá trị"
              className="focus-ring h-7 w-full rounded-md border border-line bg-surface pr-2 pl-7 text-[12.5px] text-fg placeholder:text-faint"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted select-none">
            <input type="checkbox" checked={onlyDups} onChange={(e) => setOnlyDups(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
            Chỉ giá trị trùng lặp ({nf(summary.dups[group])})
          </label>
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" onClick={copy} disabled={busy || !total} title="Copy danh sách đang xem (mọi trang), mỗi giá trị một dòng">
              <Copy size={14} /> Copy
            </Button>
            <Button size="sm" variant="primary" onClick={onExport} disabled={busy || exporting} title="Tải file .xlsx gồm cả ba nhóm">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Xuất Excel
            </Button>
          </div>
        </div>
        <div className={clsx('max-h-[58vh] overflow-auto', busy && 'opacity-50')}>
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Giá trị</th>
                <th className="px-3 py-2 whitespace-nowrap">Dòng ở A</th>
                <th className="px-3 py-2 whitespace-nowrap">Dòng ở B</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e, i) => (
                <tr key={from + i} className="border-t border-line align-top hover:bg-surface-2/60">
                  <td className="px-3 py-1.5 font-mono break-all text-fg">
                    {e.value}
                    {isDup(e) && (
                      <span className="ml-1.5 inline-block rounded bg-amber-500/15 px-1 align-[1px] font-sans text-[10.5px] font-semibold text-amber-700 dark:text-amber-300" title="Giá trị xuất hiện nhiều lần">
                        trùng {[e.countA > 1 && `A×${nf(e.countA)}`, e.countB > 1 && `B×${nf(e.countB)}`].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </td>
                  <td className="min-w-20 px-3 py-1.5 font-mono text-[11.5px] text-muted tabular-nums">{fmtRows(e.rowsA, e.countA) || <span className="text-faint">—</span>}</td>
                  <td className="min-w-20 px-3 py-1.5 font-mono text-[11.5px] text-muted tabular-nums">{fmtRows(e.rowsB, e.countB) || <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !total && <div className="px-3 py-8 text-center text-[12.5px] text-muted">Không có giá trị nào</div>}
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-[12px] text-muted">
            <span className="tabular-nums">
              {nf(from + 1)}–{nf(Math.min(total, from + PAGE))} / {nf(total)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="Trang trước" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={16} />
              </Button>
              <span className="tabular-nums">
                {nf(page + 1)} / {nf(pages)}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label="Trang sau" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </section>
      {(summary.emptyA > 0 || summary.emptyB > 0) && (
        <p className="text-[12px] text-faint">
          Bỏ qua ô trống: {nf(summary.emptyA)} ở A, {nf(summary.emptyB)} ở B.
        </p>
      )}
    </div>
  );
}
