import clsx from 'clsx';
import { Check, ChevronRight, ClipboardCopy, Clock, Loader2, Plus, Route, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildJourney, journeyText, parseIds, stepFailed, type Journey, type JourneyStep } from '../lib/journey';
import { fmtDateTime, fmtDuration, fmtTime, nf, shortName } from '../../../lib/format';
import type { LogEntry, LogFile } from '../lib/types';
import { Button } from '../../../components/ui';
import { Highlight, LEVEL_META } from './logUi';

interface Props {
  entries: LogEntry[];
  traceIndex: Map<string, LogEntry[]>;
  fileById: Map<number, LogFile>;
  /** time range currently zoomed in the histogram, offered as an option */
  timeRange: [number, number] | null;
  initial?: string;
  onOpenEntry: (e: LogEntry) => void;
  onClose: () => void;
  onToast: (m: string) => void;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function Step({ s, open, onToggle, fileById, hl, onOpenEntry }: { s: JourneyStep; open: boolean; onToggle: () => void; fileById: Map<number, LogFile>; hl: RegExp | null; onOpenEntry: (e: LogEntry) => void }) {
  const failed = stepFailed(s);
  const dur = s.t0 != null && s.t1 != null ? s.t1 - s.t0 : 0;
  const title = s.path ? `${s.method ?? ''} ${s.path}`.trim() : (s.entries.find((e) => e.score > 0) ?? s.entries[0])?.sum.slice(0, 160);
  return (
    <li className="relative pl-7">
      <span
        className={clsx(
          'absolute top-3.5 left-[5px] size-3 rounded-full ring-4 ring-surface',
          failed ? 'bg-error' : s.level === 'WARN' ? 'bg-warn' : s.ok === true || (s.status != null && s.status < 400) ? 'bg-emerald-500' : 'bg-debug',
        )}
      />
      <div className={clsx('rounded-lg border transition-colors', failed ? 'border-error/40 bg-error/[0.04]' : 'border-line', open && 'shadow-sm')}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3 py-2 text-left">
          <div className="w-[74px] shrink-0 font-mono text-[12px] text-muted tabular-nums">
            {fmtTime(s.t0)}
            {dur > 0 && <div className="text-[11px] text-faint">{fmtDuration(dur)}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-mono text-[13px] font-medium text-fg">{title}</span>
              {s.status != null && (
                <span className={clsx('rounded px-1.5 py-px font-mono text-[11px] font-semibold', s.status >= 400 ? 'bg-error/12 text-error' : 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400')}>
                  {s.status}
                </span>
              )}
              {s.status == null && s.ok != null && (
                <span className={clsx('rounded px-1.5 py-px text-[11px] font-semibold', s.ok ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-error/12 text-error')}>
                  {s.ok ? 'thành công' : 'thất bại'}
                </span>
              )}
            </div>
            {failed && s.error && <div className="mt-0.5 line-clamp-2 font-mono text-[12px] break-all text-error">{s.error}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-faint">
              <span className="flex items-center gap-1.5">
                {s.files.map((f) => {
                  const file = fileById.get(f);
                  return file ? (
                    <span key={f} className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-[3px]" style={{ background: file.color }} />
                      {shortName(file.name)}
                    </span>
                  ) : null;
                })}
              </span>
              <span>{nf(s.entries.length)} dòng log</span>
              {s.trace && <span className="font-mono">trace {s.trace.slice(0, 8)}</span>}
            </div>
          </div>
          <ChevronRight size={16} className={clsx('mt-0.5 shrink-0 text-faint transition-transform', open && 'rotate-90')} />
        </button>
        {open && (
          <ol className="border-t border-line py-1">
            {s.entries.map((e) => {
              const f = fileById.get(e.f);
              return (
                <li key={`${e.f}:${e.k}`}>
                  <button
                    type="button"
                    onClick={() => onOpenEntry(e)}
                    title="Mở dòng này trong danh sách log"
                    className="fs-log-sm grid w-full grid-cols-[6.8em_3.8em_minmax(0,1fr)] items-baseline gap-2 px-3 py-1 text-left font-mono hover:bg-surface-2"
                  >
                    <span className="text-muted tabular-nums">{fmtTime(e.ts, true)}</span>
                    <span className={clsx('text-[0.85em] font-semibold', LEVEL_META[e.level].text)}>{LEVEL_META[e.level].short}</span>
                    <span className="truncate text-fg-2">
                      {f && <span className="mr-1.5 inline-block size-2 rounded-[3px] align-middle" style={{ background: f.color }} />}
                      <Highlight text={e.sum.slice(0, 300)} hl={hl} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </li>
  );
}

/** Customer / merchant / order journey across every loaded log. */
export function JourneyPanel({ entries, traceIndex, fileById, timeRange, initial = '', onOpenEntry, onClose, onToast }: Props) {
  const [input, setInput] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [useRange, setUseRange] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [journey, setJourney] = useState<Journey | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const ids = useMemo(() => parseIds(query), [query]);
  // run off the click so the "searching" state can paint first (big logs take a moment)
  useEffect(() => {
    if (!ids.length) return setJourney(null);
    setBusy(true);
    const t = setTimeout(() => {
      const j = buildJourney(ids, entries, traceIndex, useRange ? timeRange : null);
      setJourney(j);
      setOpen(new Set(j.steps.filter(stepFailed).slice(0, 3).map((s) => s.key)));
      setBusy(false);
    }, 30);
    return () => clearTimeout(t);
  }, [ids, entries, traceIndex, useRange, timeRange]);

  const hl = useMemo(() => (ids.length ? new RegExp(ids.map(escapeRe).join('|'), 'gi') : null), [ids]);
  const steps = journey ? (onlyErrors ? journey.steps.filter(stepFailed) : journey.steps) : [];

  const run = (v = input) => setQuery(v.trim());
  const addId = (v: string) => {
    const next = [input.trim(), v].filter(Boolean).join(', ');
    setInput(next);
    run(next);
  };
  const copy = async () => {
    if (!journey) return;
    try {
      await navigator.clipboard.writeText(journeyText(journey, fileById));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onToast('Không copy được');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex bg-black/45 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tra cứu hành trình"
        data-tour="journey-panel"
        className="animate-in mx-auto flex min-h-0 w-full max-w-[980px] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line p-4">
          <div className="mb-3 flex items-center gap-2">
            <Route size={18} className="text-accent" />
            <h2 className="text-[15px] font-semibold tracking-tight">Tra cứu hành trình</h2>
            <span className="hidden text-[12px] text-muted sm:inline">— mọi request của một khách hàng / merchant / đơn hàng, xuyên mọi file</span>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Đóng" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <div className="relative min-w-[240px] flex-1">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="SĐT, email, mã merchant, mã đơn, user id, mã voucher… (nhiều mã: cách nhau dấu phẩy)"
                aria-label="Mã cần tra cứu"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)]"
              />
            </div>
            <Button type="submit" variant="primary" className="h-10 px-4">
              Tra cứu
            </Button>
          </form>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
            {timeRange && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
                <Clock size={13} /> Chỉ trong khoảng {fmtDateTime(timeRange[0])} → {fmtDateTime(timeRange[1])}
              </label>
            )}
            {journey && journey.errors > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 select-none">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
                Chỉ bước lỗi
              </label>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!ids.length ? (
            <div className="grid h-full min-h-[240px] place-items-center text-center text-[13px] text-muted">
              <div>
                <Route size={28} className="mx-auto mb-3 text-faint" />
                Nhập một mã để xem khách hàng / merchant đó đã làm gì, ở bước nào bị lỗi.
                <div className="mt-1 text-[12px] text-faint">Tool tự gom các dòng cùng request (trace id) giữa gateway, core… thành từng bước.</div>
              </div>
            </div>
          ) : busy && !journey ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted">
              <Loader2 size={16} className="animate-spin" /> Đang tra cứu…
            </div>
          ) : journey && journey.steps.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-muted">
              Không thấy dòng log nào chứa <b className="font-mono text-fg">{ids.join(', ')}</b>.
              <div className="mt-1 text-[12px] text-faint">Mã phải khớp nguyên vẹn (tìm “3042” sẽ không khớp “13042”).</div>
            </div>
          ) : journey ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {[
                  ['Bước', nf(journey.steps.length), ''],
                  ['Bước lỗi', nf(journey.errors), journey.errors ? 'text-error' : 'text-emerald-600 dark:text-emerald-400'],
                  ['Dòng log', nf(journey.entries), ''],
                  ['Khoảng', journey.t0 != null ? `${fmtDateTime(journey.t0)} → ${fmtTime(journey.t1)}` : '—', ''],
                ].map(([k, v, cls]) => (
                  <div key={k} className="rounded-lg border border-line px-3 py-1.5">
                    <div className="text-[11px] text-muted">{k}</div>
                    <div className={clsx('text-[14px] font-semibold tabular-nums', cls)}>{v}</div>
                  </div>
                ))}
                <Button className="ml-auto" onClick={copy} title="Copy tóm tắt dạng văn bản để trả lời khách / dán vào ticket">
                  {copied ? <Check size={15} className="text-emerald-500" /> : <ClipboardCopy size={15} />}
                  {copied ? 'Đã copy' : 'Copy tóm tắt'}
                </Button>
              </div>

              {journey.related.length > 0 && (
                <div className="mb-4">
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Mã liên quan tìm thấy — bấm để tra thêm</div>
                  <div className="flex flex-wrap gap-1.5">
                    {journey.related.map((r) => (
                      <button
                        key={`${r.label}|${r.value}`}
                        type="button"
                        onClick={() => addId(r.value)}
                        title={`${r.label}=${r.value}`}
                        className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] hover:border-accent hover:text-accent"
                      >
                        <Plus size={12} className="shrink-0" />
                        <span className="shrink-0 text-faint">{r.label}=</span>
                        <span className="min-w-0 truncate">{r.value}</span>
                        <span className="shrink-0 text-faint">×{r.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ol className="relative space-y-2 before:absolute before:top-2 before:bottom-2 before:left-[10px] before:w-px before:bg-line">
                {steps.map((s) => (
                  <Step
                    key={s.key}
                    s={s}
                    open={open.has(s.key)}
                    onToggle={() =>
                      setOpen((o) => {
                        const n = new Set(o);
                        if (n.has(s.key)) n.delete(s.key);
                        else n.add(s.key);
                        return n;
                      })
                    }
                    fileById={fileById}
                    hl={hl}
                    onOpenEntry={onOpenEntry}
                  />
                ))}
              </ol>
              {journey.hits >= 5000 && <p className="mt-3 text-[12px] text-faint">Đã dừng ở 5.000 dòng khớp đầu tiên — thêm mã cụ thể hơn hoặc chọn khoảng thời gian.</p>}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

