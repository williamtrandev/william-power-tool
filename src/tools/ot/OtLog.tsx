import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Button } from '../../components/ui';
import { dayKind, fmtHours, fullDate, fullName, holidayName, weekdayLong, type OtEntry, type OtPerson } from '../../lib/ot';

/** Day by day, newest first: who did OT and what they did. */
export function OtLog({
  entries,
  labels,
  people,
  face,
  mineId,
  onEdit,
  onDay,
}: {
  entries: OtEntry[];
  labels: Map<string, string>;
  people: OtPerson[];
  face: (p: OtPerson, size: number) => ReactNode;
  mineId: string | undefined;
  onEdit: (e: OtEntry) => void;
  onDay: (d: string) => void;
}) {
  const who = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const groups = useMemo(() => {
    const m = new Map<string, OtEntry[]>();
    for (const e of [...entries].sort((a, b) => b.work_date.localeCompare(a.work_date))) m.set(e.work_date, [...(m.get(e.work_date) ?? []), e]);
    return [...m];
  }, [entries]);
  if (!groups.length) return <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Tháng này chưa có ai ghi OT.</p>;
  return (
    <div className="space-y-3">
      {groups.map(([d, list]) => {
        const label = labels.get(d) ?? holidayName(d);
        const weekend = dayKind(d) !== 'weekday';
        return (
          <section key={d} className="overflow-hidden rounded-xl border border-line bg-surface">
            <header className={clsx('flex flex-wrap items-center gap-2 border-b border-line px-4 py-2', weekend ? 'bg-emerald-500/8' : 'bg-surface-2/60')}>
              <span className="text-[13px] font-semibold tabular-nums">{fullDate(d)}</span>
              <span className={clsx('text-[12px]', weekend ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted')}>{weekdayLong(d)}</span>
              <button type="button" onClick={() => onDay(d)} className="focus-ring flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] hover:bg-surface-3">
                {label ? <span className="font-medium text-accent">{label}</span> : <span className="text-faint">+ tiêu đề ngày</span>}
              </button>
              <span className="ml-auto font-mono text-[12px] font-semibold text-fg-2 tabular-nums">{fmtHours(list.reduce((a, e) => a + e.hours, 0))} giờ</span>
            </header>
            <ul className="divide-y divide-line">
              {list.map((e) => {
                const p = who.get(e.person_id);
                return (
                  <li key={e.id} className="group/l flex items-start gap-3 px-4 py-2.5">
                    {p && <span className="mt-0.5">{face(p, 26)}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {p ? fullName(p) : '(đã xoá)'}
                        {e.person_id === mineId && <span className="ml-1.5 text-[11px] font-normal text-faint">bạn</span>}
                      </p>
                      <p className={clsx('text-[12.5px] whitespace-pre-wrap', e.note ? 'text-fg-2' : 'text-faint italic')}>{e.note || 'Chưa ghi nội dung'}</p>
                    </div>
                    <span className={clsx('shrink-0 rounded-md px-2 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums', weekend ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-accent-soft text-accent')}>
                      {fmtHours(e.hours)}h
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label="Sửa" title="Sửa" className="opacity-60 group-hover/l:opacity-100" onClick={() => onEdit(e)}>
                      <Pencil size={14} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
