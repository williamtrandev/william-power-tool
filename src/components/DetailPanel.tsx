import clsx from 'clsx';
import {
  Braces,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Filter,
  FoldVertical,
  GitBranch,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  MousePointerClick,
  ScrollText,
  WrapText,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { decode, embeddedJson, scoreOf, type Reason } from '../lib/parser';
import { fullText } from '../lib/search';
import { setViewPrefs, useViewPrefs, type ViewPrefs } from '../lib/useViewPrefs';
import { SUS_MIN, type LogEntry, type LogFile } from '../lib/types';
import { fmtDuration, fmtFull, fmtTime, nf, shortName } from '../lib/format';
import { ContentViewer } from './ContentViewer';
import { JsonTree, type ExpandMode } from './JsonTree';
import { Button, FileTag, Highlight, LevelBadge, LEVEL_META } from './ui';

export type DetailTab = 'detail' | 'ctx' | 'trace';

interface Props {
  entry: LogEntry | null;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  fileById: Map<number, LogFile>;
  traceIndex: Map<string, LogEntry[]>;
  hl: RegExp | null;
  onSelect: (e: LogEntry) => void;
  onFilterTrace: (id: string) => void;
  onFilterSig: (e: LogEntry) => void;
  onToast: (msg: string) => void;
  onClose?: () => void;
  /** toggles the full-screen detail view; omitted where it makes no sense (mobile sheet) */
  onExpand?: () => void;
  expanded?: boolean;
  className?: string;
}

const MAX_RENDER = 200_000;

export function DetailPanel(p: Props) {
  const { entry: e } = p;
  const trace = e?.trace ? p.traceIndex.get(e.trace.toLowerCase()) ?? [] : [];
  const tab = p.tab === 'trace' && !trace.length ? 'detail' : p.tab;
  const tabs: { id: DetailTab; label: string; icon: ReactNode; count?: number; disabled?: boolean }[] = [
    { id: 'detail', label: 'Chi tiết', icon: <ScrollText size={15} /> },
    { id: 'ctx', label: 'Ngữ cảnh', icon: <ListTree size={15} /> },
    { id: 'trace', label: 'Trace', icon: <GitBranch size={15} />, count: trace.length, disabled: !trace.length },
  ];

  return (
    <section className={clsx('flex min-h-0 min-w-0 flex-col border-l border-line bg-surface', p.className)} aria-label="Chi tiết log">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <div role="tablist" className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              disabled={t.disabled || !e}
              onClick={() => p.onTab(t.id)}
              className={clsx(
                'focus-ring inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-35',
                tab === t.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t.icon}
              {t.label}
              {!!t.count && <span className="rounded bg-surface-2 px-1 text-[10.5px] text-muted tabular-nums">{t.count}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          {p.onExpand && e && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={p.expanded ? 'Thu nhỏ' : 'Phóng to toàn màn hình'}
              title={p.expanded ? 'Thu nhỏ (Esc)' : 'Phóng to toàn màn hình'}
              onClick={p.onExpand}
            >
              {p.expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </Button>
          )}
          {p.onClose && (
            <Button variant="ghost" size="icon-sm" aria-label="Đóng chi tiết" onClick={p.onClose}>
              <X size={17} />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!e ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <MousePointerClick size={22} className="text-faint" />
            Chọn một dòng để xem chi tiết
          </div>
        ) : tab === 'detail' ? (
          <DetailTabView {...p} entry={e} traceCount={trace.length} />
        ) : tab === 'ctx' ? (
          <ContextView entry={e} file={p.fileById.get(e.f)} hl={p.hl} onSelect={p.onSelect} />
        ) : (
          <TraceView entry={e} list={trace} fileById={p.fileById} hl={p.hl} onSelect={p.onSelect} onFilterTrace={p.onFilterTrace} />
        )}
      </div>
    </section>
  );
}

type View = ViewPrefs['view'];

const HAS_FRAME = /\n\s*(?:at\s+\S|#\d+\s)/;

function DetailTabView(p: Props & { entry: LogEntry; traceCount: number }) {
  const e = p.entry;
  const file = p.fileById.get(e.f);
  const { view, wrap, fold, collapse } = useViewPrefs();
  const setView = (v: View) => setViewPrefs({ view: v });
  const setWrap = (f: (w: boolean) => boolean) => setViewPrefs({ wrap: f(wrap) });
  const setFold = (f: (w: boolean) => boolean) => setViewPrefs({ fold: f(fold) });
  const [expand, setExpand] = useState<{ mode: ExpandMode; gen: number }>({ mode: 'auto', gen: 0 });
  const [copied, setCopied] = useState(false);
  const reasons = useMemo(() => {
    const r: Reason[] = [];
    scoreOf(e.level, decode(e.raw.slice(e.head)).toLowerCase(), r);
    return r;
  }, [e]);
  const json = useMemo(() => (e.raw.length < 2_000_000 ? embeddedJson(e.raw.slice(e.head)) : null), [e]);
  const v: View = view === 'json' && !json ? 'text' : view;
  const text = useMemo(() => {
    const t = v === 'raw' ? e.raw : fullText(e);
    return t.length > MAX_RENDER ? t.slice(0, MAX_RENDER) : t;
  }, [e, v]);
  const truncated = (v === 'raw' ? e.raw.length : text.length) >= MAX_RENDER;
  const hasFrames = useMemo(() => HAS_FRAME.test(text), [text]);
  const sus = e.score >= SUS_MIN;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v === 'json' && json ? JSON.stringify(json, null, 2) : e.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      p.onToast('Không copy được');
    }
  };

  const views: [View, string][] = [['text', 'Văn bản'], ...(json ? [['json', 'JSON'] as [View, string]] : []), ['raw', 'Raw']];

  return (
    <div className="animate-in space-y-4 p-4" key={`${e.f}:${e.k}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px]">
          <LevelBadge level={e.level} />
        </span>
        <span className="font-mono text-[12.5px] text-fg-2 tabular-nums">{fmtFull(e.ts)}</span>
        <span className="text-faint">·</span>
        <FileTag file={file} className="text-[12.5px]" />
        <span className="text-[12px] text-faint">dòng {nf(e.ln)}</span>
      </div>

      <div className={clsx('rounded-lg border p-3', sus ? 'border-error/30 bg-error/5' : 'border-line bg-surface-2/60')}>
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-muted">Điểm khả nghi</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={clsx('h-full rounded-full', e.score >= 80 ? 'bg-error' : sus ? 'bg-warn' : 'bg-debug')}
              style={{ width: Math.min(100, (e.score / 150) * 100) + '%' }}
            />
          </div>
          <span className={clsx('font-mono text-[13px] font-semibold tabular-nums', sus ? 'text-error' : 'text-muted')}>{e.score}</span>
        </div>
        {reasons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {reasons.map(([n, w]) => (
              <span key={n} className={clsx('rounded px-1.5 py-0.5 text-[11px] font-medium', w >= 30 ? 'bg-error/12 text-error' : 'bg-warn/14 text-warn')}>
                {n} <span className="opacity-70">+{w}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]">
        <dt className="text-muted">Trace</dt>
        <dd className="min-w-0 font-mono break-all">
          {e.trace ? (
            <>
              <button type="button" className="text-accent hover:underline" onClick={() => p.onFilterTrace(e.trace!)}>
                {e.trace}
              </button>
              {e.ti && <span className="ml-2 font-sans text-[11.5px] text-faint italic">suy luận theo khối request</span>}
            </>
          ) : (
            <span className="font-sans text-faint">không có — xem tab Ngữ cảnh</span>
          )}
        </dd>
        <dt className="text-muted">File</dt>
        <dd className="min-w-0 truncate" title={file?.name}>
          {file?.name} <span className="text-faint">· {file?.format}</span>
        </dd>
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {e.trace && (
          <Button size="sm" onClick={() => p.onTab('trace')}>
            <GitBranch size={15} /> Xem cả trace ({p.traceCount})
          </Button>
        )}
        {e.trace && (
          <Button size="sm" onClick={() => p.onFilterTrace(e.trace!)}>
            <Filter size={15} /> Lọc theo trace
          </Button>
        )}
        <Button size="sm" onClick={() => p.onTab('ctx')}>
          <ListTree size={15} /> Ngữ cảnh
        </Button>
        <Button size="sm" onClick={() => p.onFilterSig(e)}>
          <Layers size={15} /> Dòng giống
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface-2 px-2 py-1.5">
          <div role="tablist" aria-label="Chế độ xem" className="flex rounded-md border border-line bg-surface p-0.5">
            {views.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={v === id}
                onClick={() => setView(id)}
                className={clsx(
                  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-medium',
                  v === id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {id === 'json' && <Braces size={13} />}
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            {v === 'json' ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setExpand((x) => ({ mode: 'all', gen: x.gen + 1 }))}>
                  <ChevronsUpDown size={15} /> Mở hết
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setExpand((x) => ({ mode: 'none', gen: x.gen + 1 }))}>
                  <ChevronsDownUp size={15} /> Thu hết
                </Button>
              </>
            ) : (
              <>
                {hasFrames && v === 'text' && (
                  <Button variant="ghost" size="sm" active={fold} aria-pressed={fold} onClick={() => setFold((f) => !f)} title="Thu gọn các frame của framework / thư viện trong stacktrace">
                    <FoldVertical size={15} /> Gọn stack
                  </Button>
                )}
                <Button variant="ghost" size="sm" active={wrap} aria-pressed={wrap} onClick={() => setWrap((w) => !w)} title="Tự xuống dòng">
                  <WrapText size={15} /> Xuống dòng
                </Button>
              </>
            )}
            <label
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted select-none hover:bg-surface-3 hover:text-fg"
              title="Rút gọn chuỗi / dòng quá dài thành nút …+N ký tự"
            >
              <input
                type="checkbox"
                checked={collapse}
                onChange={(ev) => setViewPrefs({ collapse: ev.target.checked })}
                className="size-3.5 cursor-pointer accent-[var(--accent)]"
              />
              Thu gọn
            </label>
            <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy">
              {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
              {copied ? 'Đã copy' : 'Copy'}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto bg-surface px-2 py-2.5">
          {v === 'json' && json ? (
            <JsonTree key={`${e.f}:${e.k}:${expand.gen}`} value={json} mode={expand.mode} hl={p.hl} collapse={collapse} />
          ) : (
            <ContentViewer key={`${e.f}:${e.k}:${v}`} text={text} hl={p.hl} onId={p.onFilterTrace} wrap={wrap} fold={fold && v === 'text'} collapse={collapse} />
          )}
          {truncated && v !== 'json' && <div className="mt-2 px-1 text-[12px] text-faint">… đã cắt bớt vì quá dài, bấm Copy để lấy đầy đủ</div>}
        </div>
      </div>
    </div>
  );
}

function MiniRow({ e, file, cur, hl, onSelect, time }: { e: LogEntry; file?: LogFile; cur: boolean; hl: RegExp | null; onSelect: (e: LogEntry) => void; time: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className={clsx(
        'fs-log-sm grid w-full grid-cols-[6.8em_3.8em_minmax(0,1fr)] items-baseline gap-2 border-b border-line px-3 py-1.5 text-left font-mono transition-colors',
        cur ? 'bg-sel shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-surface-2',
        e.ti && 'italic',
      )}
      title={file ? `${file.name}:${e.ln}` : undefined}
    >
      <span className="text-muted tabular-nums">{time}</span>
      <span className={clsx('text-[0.85em] font-semibold', LEVEL_META[e.level].text)}>{LEVEL_META[e.level].short}</span>
      <span className="truncate text-fg-2">
        {file && <span className="mr-1.5 inline-block size-2 rounded-[3px] align-middle" style={{ background: file.color }} />}
        <Highlight text={e.sum.slice(0, 300)} hl={hl} />
      </span>
    </button>
  );
}

function ContextView({ entry, file, hl, onSelect }: { entry: LogEntry; file?: LogFile; hl: RegExp | null; onSelect: (e: LogEntry) => void }) {
  const curRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: 'center' });
  }, [entry]);
  if (!file) return null;
  const from = Math.max(0, entry.k - 25);
  const list = file.entries.slice(from, entry.k + 26);
  return (
    <div>
      <div className="border-b border-line px-3 py-2 text-[12px] text-muted">
        ±25 entry quanh dòng <span className="font-medium text-fg">{nf(entry.ln)}</span> trong <span className="font-medium text-fg">{shortName(file.name)}</span>
      </div>
      {list.map((x) => (
        <div key={x.k} ref={x === entry ? curRef : undefined}>
          <MiniRow e={x} file={file} cur={x === entry} hl={hl} onSelect={onSelect} time={fmtTime(x.ts, true)} />
        </div>
      ))}
    </div>
  );
}

function TraceView({ entry, list, fileById, hl, onSelect, onFilterTrace }: { entry: LogEntry; list: LogEntry[]; fileById: Map<number, LogFile>; hl: RegExp | null; onSelect: (e: LogEntry) => void; onFilterTrace: (id: string) => void }) {
  const t0 = list[0]?.ts ?? 0;
  const dur = (list[list.length - 1]?.ts ?? t0) - t0;
  const files = [...new Set(list.map((x) => x.f))];
  const errors = list.filter((x) => x.score >= SUS_MIN).length;
  return (
    <div className="p-4">
      <div className="mb-4 rounded-lg border border-line bg-surface-2/60 p-3">
        <button type="button" onClick={() => onFilterTrace(entry.trace!)} className="font-mono text-[12.5px] break-all text-accent hover:underline">
          {entry.trace}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ['Entry', nf(list.length)],
            ['Thời lượng', fmtDuration(dur)],
            ['Khả nghi', nf(errors)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-surface px-2 py-1.5">
              <div className={clsx('text-[14px] font-semibold tabular-nums', k === 'Khả nghi' && errors ? 'text-error' : 'text-fg')}>{v}</div>
              <div className="text-[11px] text-muted">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          {files.map((id) => (
            <FileTag key={id} file={fileById.get(id)} />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-faint italic">Dòng in nghiêng được gán theo khối request (không có id trực tiếp).</p>
      </div>
      <ol className="relative ml-1.5 border-l border-line">
        {list.map((x) => {
          const cur = x === entry;
          const f = fileById.get(x.f);
          return (
            <li key={`${x.f}:${x.k}`} className="relative pl-4">
              <span
                className={clsx('absolute top-[11px] -left-[4.5px] size-2 rounded-full ring-2 ring-surface', LEVEL_META[x.level].dot, cur && 'ring-accent')}
              />
              <button
                type="button"
                onClick={() => onSelect(x)}
                className={clsx('w-full rounded-md px-2 py-1.5 text-left transition-colors', cur ? 'bg-sel' : 'hover:bg-surface-2', x.ti && 'italic')}
              >
                <div className="flex items-center gap-2 text-[11px] text-muted tabular-nums">
                  <span className="font-mono">+{fmtDuration((x.ts ?? t0) - t0)}</span>
                  <LevelBadge level={x.level} />
                  {f && (
                    <span className="flex items-center gap-1">
                      <span className="size-2 rounded-[3px]" style={{ background: f.color }} />
                      {shortName(f.name)}
                    </span>
                  )}
                </div>
                <div className="fs-log-sm mt-0.5 line-clamp-2 font-mono break-all text-fg-2">
                  <Highlight text={x.sum.slice(0, 400)} hl={hl} />
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
