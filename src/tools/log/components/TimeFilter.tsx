import clsx from 'clsx';
import { Clock, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { INPUT_HINT, maskInput, PRESETS, rangeOf, toInput } from '../lib/timeRange';
import { fmtDateTime } from '../../../lib/format';
import { fieldSm, Label } from '../../../components/form';
import { Button } from '../../../components/ui';

interface Props {
  range: [number, number] | null;
  onRange: (r: [number, number] | null) => void;
  /** first and last time in the loaded logs */
  bounds: [number, number] | null;
}

/** "Thời gian" filter: type a from / to time, or take the last minutes / hours of the logs. Shows the histogram pick too. */
export function TimeFilter({ range, onRange, bounds }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
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
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // start from the current range, else from the whole span of the logs — usually only the time needs changing
      const r = range ?? bounds;
      setFrom(r ? toInput(r[0]) : '');
      setTo(r ? toInput(range ? range[1] - 1 : r[1]) : '');
    }
    setOpen((o) => !o);
  };

  const picked = rangeOf(from, to, bounds);
  const problem = typeof picked === 'string' ? picked : '';
  const apply = (r: [number, number] | null) => {
    onRange(r);
    setOpen(false);
  };
  // typing adds the separators; deleting leaves the text alone, else a removed "/" would come straight back
  const typed = (prev: string, set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.length > prev.length ? maskInput(e.target.value) : e.target.value);
  const box = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <Label compact>{label}</Label>
      <input aria-label={label} inputMode="numeric" autoComplete="off" spellCheck={false} placeholder={INPUT_HINT} value={value} onChange={typed(value, set)} className={clsx(fieldSm, 'font-mono tabular-nums')} />
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      {range ? (
        <span className="inline-flex h-7 max-w-[420px] items-center rounded-md border border-accent/40 bg-accent-soft text-[12px] text-accent">
          <button type="button" onClick={toggle} aria-expanded={open} title="Sửa khoảng thời gian" className="focus-ring inline-flex h-full min-w-0 items-center gap-1.5 rounded-md pl-2">
            <Clock size={14} className="shrink-0" />
            <span className="truncate font-mono">
              {fmtDateTime(range[0])} → {fmtDateTime(range[1] - 1)}
            </span>
          </button>
          <button type="button" aria-label="Bỏ lọc thời gian" onClick={() => onRange(null)} className="focus-ring mx-1 grid size-5 shrink-0 place-items-center rounded hover:bg-accent/15">
            <X size={14} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          disabled={!bounds}
          title={bounds ? 'Lọc theo khoảng thời gian' : 'Các dòng log không có thời gian'}
          className={clsx(
            'focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors disabled:opacity-45',
            open ? 'border-fg/25 bg-surface-3 text-fg' : 'border-line bg-surface text-fg-2 hover:border-line-strong',
          )}
        >
          <Clock size={14} /> Thời gian
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Lọc theo thời gian"
          className="animate-in absolute top-9 left-0 z-30 w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10"
        >
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.ms}
                type="button"
                disabled={!bounds}
                onClick={() => bounds && apply([bounds[1] - p.ms, bounds[1] + 1])}
                className="focus-ring h-7 rounded-md border border-line px-2 text-[12px] text-fg-2 hover:border-line-strong hover:bg-surface-2"
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-faint">Tính lùi từ dòng log cuối cùng ({fmtDateTime(bounds?.[1] ?? null)}).</p>

          <form
            className="mt-3 space-y-2.5 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!problem) apply(picked as [number, number] | null);
            }}
          >
            {box('Từ', from, setFrom)}
            {box('Đến', to, setTo)}
            <p className={clsx('text-[11.5px]', problem ? 'text-error' : 'text-faint')}>
              {problem || 'Có thể bỏ giây, giờ (lấy cả ngày). Để trống một ô: tính từ dòng đầu / đến dòng cuối.'}
            </p>
            <div className="flex justify-end gap-2">
              {range && (
                <Button size="sm" variant="ghost" type="button" onClick={() => apply(null)}>
                  Bỏ lọc
                </Button>
              )}
              <Button size="sm" variant="primary" type="submit" disabled={!!problem}>
                Áp dụng
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
