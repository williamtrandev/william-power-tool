import clsx from 'clsx';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { field } from '../../components/form';
import { Button } from '../../components/ui';
import { fullDate, today, weekdayLong } from '../../lib/ot';
import { RangeCalendar } from './RangeCalendar';

const POP_W = 296;

/**
 * One day, picked on the same calendar as the export range instead of the browser's own date popup (which ignores
 * the app's theme and language). Days in `marked` (with OT) get a dot. The calendar is drawn over the page (a
 * portal), so a dialog's scrolling body cannot clip it; it opens upward when there is no room below.
 */
export function OtDateField({ value, onChange, marked, label }: { value: string; onChange: (d: string) => void; marked?: Set<string>; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // under the field, its right edge on the field's (left edge on a phone); above it when the page ends first
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      const h = pop.current?.offsetHeight ?? 360;
      if (!r) return;
      const w = Math.min(POP_W, innerWidth - 24);
      const left = Math.max(12, Math.min(innerWidth >= 640 ? r.right - w : r.left, innerWidth - w - 12));
      const below = r.bottom + 6 + h <= innerHeight - 8;
      setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - h) });
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => {
      removeEventListener('resize', place);
      removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    // Esc closes the calendar, not the dialog around it
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

  const set = (d: string) => {
    onChange(d);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={clsx(field, 'flex items-center gap-2 text-left', open && 'border-accent/60 shadow-[0_0_0_3px_var(--accent-ring)]')}
      >
        <CalendarDays size={16} className="shrink-0 text-muted" />
        <span className="font-mono tabular-nums">{value ? fullDate(value) : 'Chọn ngày'}</span>
        {value === today() && <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-medium text-accent">Hôm nay</span>}
        <ChevronDown size={15} className={clsx('ml-auto shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={label}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: Math.min(POP_W, innerWidth - 24) }}
            className="animate-in fixed z-[60] rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/20"
          >
            <RangeCalendar single from={value || null} to={value || null} onPick={set} marked={marked ?? new Set()} />
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <span className="text-[11.5px] text-faint">{value ? weekdayLong(value) : ''}</span>
              <Button size="sm" variant="ghost" onClick={() => set(today())}>
                Hôm nay
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
