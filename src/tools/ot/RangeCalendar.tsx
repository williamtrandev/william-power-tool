import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { dayKind, monthDays, monthLabel, monthOf, parseYmd, shiftMonth, today, type MonthKey } from '../../lib/ot';

const HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/**
 * A month to pick a range of days on: the first click starts the range, the second ends it (either order); while
 * waiting for the end, hovering shows what would be picked. Days in `marked` (with OT) get a dot. `onMonth` says
 * which month is on screen, so the marks can be fetched for it.
 */
export function RangeCalendar({
  from,
  to,
  onPick,
  marked,
  onMonth,
}: {
  from: string | null;
  to: string | null;
  onPick: (from: string, to: string) => void;
  marked: Set<string>;
  onMonth: (m: MonthKey) => void;
}) {
  const [month, setMonth] = useState<MonthKey>(() => monthOf(to ?? from ?? today()));
  // the start of a range being picked, until its end is clicked
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const go = (m: MonthKey) => {
    setMonth(m);
    onMonth(m);
  };
  const days = monthDays(month);
  // Monday-first: blanks before the 1st
  const lead = (parseYmd(days[0]).getDay() + 6) % 7;
  const [lo, hi] = anchor ? [anchor, hover ?? anchor].sort() : [from, to];
  const click = (d: string) => {
    if (!anchor) {
      setAnchor(d);
      onPick(d, d);
      return;
    }
    const [a, b] = [anchor, d].sort();
    setAnchor(null);
    onPick(a, b);
  };

  return (
    <div className="select-none" onMouseLeave={() => setHover(null)}>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" aria-label="Tháng trước" onClick={() => go(shiftMonth(month, -1))}>
          <ChevronLeft size={16} />
        </Button>
        <span className="text-[13px] font-semibold">{monthLabel(month)}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Tháng sau" onClick={() => go(shiftMonth(month, 1))}>
          <ChevronRight size={16} />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {HEAD.map((h) => (
          <span key={h} className={clsx('pb-1 text-[11px] font-medium', h === 'T7' || h === 'CN' ? 'text-emerald-700 dark:text-emerald-400' : 'text-faint')}>
            {h}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((d) => {
          const inRange = !!lo && !!hi && d >= lo && d <= hi;
          const edge = d === lo || d === hi;
          const isToday = d === today();
          return (
            <button
              key={d}
              type="button"
              onClick={() => click(d)}
              onMouseEnter={() => anchor && setHover(d)}
              aria-pressed={inRange}
              aria-label={`${Number(d.slice(8))}/${Number(d.slice(5, 7))}${marked.has(d) ? ', có OT' : ''}`}
              className={clsx(
                'focus-ring relative my-0.5 grid h-9 place-items-center text-[13px] tabular-nums transition-colors',
                // the range reads as one band, rounded at its two ends
                inRange && !edge && 'bg-accent-soft text-fg',
                edge && 'z-[1] rounded-lg bg-accent font-semibold text-white',
                !inRange && 'rounded-lg hover:bg-surface-2',
                !inRange && (dayKind(d) !== 'weekday' ? 'text-emerald-700 dark:text-emerald-400' : 'text-fg-2'),
                d === lo && d !== hi && 'rounded-r-none',
                d === hi && d !== lo && 'rounded-l-none',
                isToday && !edge && 'font-semibold underline decoration-accent decoration-2 underline-offset-4',
              )}
            >
              {Number(d.slice(8))}
              {marked.has(d) && <span className={clsx('absolute bottom-1 size-1 rounded-full', edge ? 'bg-white' : 'bg-accent')} />}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11.5px] text-faint">{anchor ? 'Bấm ngày kết thúc' : 'Bấm ngày bắt đầu rồi ngày kết thúc · chấm xanh: ngày có OT'}</p>
    </div>
  );
}
