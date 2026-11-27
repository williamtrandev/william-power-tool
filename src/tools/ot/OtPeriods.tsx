import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { fieldSm } from '../../components/form';
import { fmtHours, fmtPeriods, hoursBetween, maskHm, parseHm, parsePeriods, periodHours, periodsNote, type Period } from '../../lib/ot';

const blank = (): Period => ({ start: '', end: '', what: '' });

/**
 * The OT periods of a day and what was done in each — "12:00 → 13:00 Hỗ trợ khách", "17:30 → 19:30 Golive hệ thống
 * A" (24 h; an end before its start is the next morning). Every change hands `onChange` the complete periods as stored,
 * their total hours (null while none is complete) and the note they make, one line each:
 * "17h30 - 19h30: Golive hệ thống A". Seeded once from `value`: remount it (key) to load another entry.
 */
export function OtPeriods({ value, onChange }: { value: string; onChange: (periods: string, hours: number | null, note: string) => void }) {
  const [rows, setRows] = useState<Period[]>(() => {
    const list = parsePeriods(value);
    return list.length ? list : [blank()];
  });

  const complete = (p: Period) => parseHm(p.start) != null && parseHm(p.end) != null;
  const update = (next: Period[]) => {
    setRows(next);
    const done = next.filter(complete);
    onChange(fmtPeriods(done), done.length ? periodHours(done) : null, periodsNote(done));
  };
  const set = (i: number, p: Partial<Period>) => update(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const time = (i: number, k: 'start' | 'end', label: string) => {
    const v = rows[i][k];
    const bad = v.length >= 4 && parseHm(v) == null;
    return (
      <input
        aria-label={`${label} đợt ${i + 1}`}
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        value={v}
        // typing adds the ":"; deleting leaves the text alone
        onChange={(e) => set(i, { [k]: (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ? e.target.value : maskHm(e.target.value) })}
        aria-invalid={bad}
        className={clsx(fieldSm.replace('w-full', 'w-[68px]'), 'h-8 shrink-0 px-2 text-center font-mono tabular-nums', bad && 'border-error/60')}
      />
    );
  };
  return (
    <div className="space-y-2">
      {rows.map((p, i) => (
        // on a phone the "what" field wraps under the times: a line keeps each period together
        <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-muted max-sm:border-b max-sm:border-line max-sm:pb-2">

          {time(i, 'start', 'Bắt đầu')}
          <span>→</span>
          {time(i, 'end', 'Kết thúc')}
          <span className="w-[74px] shrink-0 tabular-nums">
            {complete(p) ? (
              <>
                {fmtHours(hoursBetween(parseHm(p.start)!, parseHm(p.end)!))} giờ
                {parseHm(p.end)! <= parseHm(p.start)! && <span className="block text-[11px] text-faint">qua đêm</span>}
              </>
            ) : (
              <span className="text-faint">— giờ</span>
            )}
          </span>
          <input
            aria-label={`Việc làm đợt ${i + 1}`}
            value={p.what}
            maxLength={300}
            placeholder="Làm gì — VD: Golive hệ thống A"
            onChange={(e) => set(i, { what: e.target.value })}
            className={clsx(fieldSm, 'h-8 min-w-[160px] flex-1')}
          />
          <button
            type="button"
            aria-label={`Bỏ đợt ${i + 1}`}
            disabled={rows.length === 1}
            onClick={() => update(rows.filter((_, j) => j !== i))}
            className="focus-ring grid size-7 shrink-0 place-items-center rounded text-faint hover:bg-surface-2 hover:text-fg disabled:invisible"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => update([...rows, blank()])} className="focus-ring inline-flex items-center gap-1 rounded text-[12.5px] text-accent hover:underline">
        <Plus size={13} /> Thêm đợt
      </button>
    </div>
  );
}
