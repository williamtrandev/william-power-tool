import clsx from 'clsx';
import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { dayKind, dayMonth, fmtHours, fullDate, fullName, holidayName, monthDays, monthOf, today, weekday, weekdayLong, type MonthKey, type OtEntry, type OtPerson } from '../../lib/ot';
import type { Editing } from './OtEditor';

/**
 * The month as a person × day grid like the team's sheet: equal day columns, the day titles above,
 * a total per person and per day. Opens scrolled to today (or the month's last OT day).
 */
export function OtGrid({
  active,
  month,
  people,
  hasRoster,
  entries,
  labels,
  onlyOt,
  setOnlyOt,
  mineId,
  find,
  face,
  actorName,
  onEdit,
  onDay,
  onAdd,
  onManage,
}: {
  /** the tab is on screen (the scroll to today waits for it) */
  active: boolean;
  month: MonthKey;
  /** rows, in display order */
  people: OtPerson[];
  hasRoster: boolean;
  entries: OtEntry[];
  labels: Map<string, string>;
  onlyOt: boolean;
  setOnlyOt: (v: boolean) => void;
  mineId: string | undefined;
  find: (personId: string, date: string) => OtEntry | undefined;
  face: (p: OtPerson, size: number) => ReactNode;
  actorName: (email: string | null) => string;
  onEdit: (e: Editing) => void;
  onDay: (date: string) => void;
  onAdd: () => void;
  onManage: () => void;
}) {
  const days = useMemo(() => {
    const all = monthDays(month);
    return onlyOt ? all.filter((d) => entries.some((e) => e.work_date === d) || labels.has(d)) : all;
  }, [month, onlyOt, entries, labels]);
  const totalOf = (pred: (e: OtEntry) => boolean) => entries.filter(pred).reduce((a, e) => a + e.hours, 0);
  const total = totalOf(() => true);
  const isToday = (d: string) => d === today();

  // late in the month the first days are the least interesting: open the table on today
  // (or, for another month, its last OT day), sitting just right of the name column
  const scroller = useRef<HTMLDivElement>(null);
  const focusDay = monthOf(today()) === month ? today() : entries.reduce<string | undefined>((m, e) => (!m || e.work_date > m ? e.work_date : m), undefined);
  const scrollToDay = useCallback((d: string, smooth = false) => {
    const box = scroller.current;
    const th = box?.querySelector<HTMLElement>(`th[data-day="${d}"]`);
    if (!box || !th) return;
    const name = box.querySelector<HTMLElement>('thead th')?.offsetWidth ?? 0;
    const total = box.querySelector<HTMLElement>('thead th:last-child')?.offsetWidth ?? 0;
    // centre the day in the space between the sticky name and total columns
    const free = box.clientWidth - name - total;
    box.scrollTo({ left: Math.max(0, th.offsetLeft - name - (free - th.offsetWidth) / 2), behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !focusDay) return;
    scrollToDay(focusDay);
    // the titles strip too: end it on the latest title up to that day, earlier ones to its left
    const box = strip.current;
    const chip = [...(box?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].filter((c) => c.dataset.day! <= focusDay).at(-1);
    if (box && chip) box.scrollLeft = Math.max(0, chip.offsetLeft + chip.offsetWidth - box.clientWidth + 12);
  }, [active, focusDay, month, onlyOt, entries, scrollToDay]);
  // titled days of the month, readable in full above the table
  const titled = useMemo(() => [...labels].filter(([d]) => monthOf(d) === month).sort(([a], [b]) => a.localeCompare(b)), [labels, month]);

  return (
    <div data-tour="ot-table" className="overflow-hidden rounded-xl border border-line bg-surface">
      {titled.length > 0 && (
        <div className="flex items-center gap-2 border-b border-line py-2 pl-3">
          <span className="shrink-0 text-[11.5px] font-medium text-muted">
            Việc trong tháng <span className="text-faint">{titled.length}</span>
          </span>
          {/* one row however many titles there are: it scrolls sideways instead of pushing the table down */}
          <div ref={strip} className="relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-3 [scrollbar-width:thin] [&>*]:shrink-0">
            {titled.map(([d, label]) => (
              <button
                key={d}
                data-day={d}
                type="button"
                onClick={() => {
                  if (!days.includes(d)) setOnlyOt(false);
                  scrollToDay(d, true);
                }}
                onDoubleClick={() => onDay(d)}
                title={`${weekdayLong(d)} ${fullDate(d)}: ${label}\nBấm để tới cột này, bấm đúp để sửa tiêu đề`}
                className={clsx(
                  'focus-ring inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-[12px] whitespace-nowrap transition-colors hover:border-accent/50',
                  isToday(d) ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface-2/60',
                )}
              >
                <span className={clsx('shrink-0 font-semibold tabular-nums', dayKind(d) !== 'weekday' ? 'text-emerald-700 dark:text-emerald-400' : 'text-fg')}>{dayMonth(d)}</span>
                <span className="truncate text-fg-2">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!hasRoster ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted">
          Chưa có ai trong danh sách OT.{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => onManage()}>
            Thêm người
          </button>
        </div>
      ) : !days.length ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted">
          Tháng này chưa có ai ghi OT.{' '}
          <button type="button" className="text-accent hover:underline" onClick={onAdd}>
            Ghi OT
          </button>
        </div>
      ) : (
        <div ref={scroller} className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-[96px] border-b border-line bg-surface-2 px-3 py-2 text-left text-[11.5px] font-medium text-muted">Tên</th>
                {days.map((d) => {
                  const kind = dayKind(d);
                  const label = labels.get(d) ?? holidayName(d);
                  return (
                    <th
                      key={d}
                      data-day={d}
                      // every day the same width, titled or not, so the month reads as an even grid
                      className={clsx(
                        'border-b border-l border-line p-0 align-top font-normal',
                        isToday(d) ? 'bg-accent-soft' : kind !== 'weekday' ? 'bg-emerald-500/10' : 'bg-surface-2',
                        'w-[76px] min-w-[76px] max-w-[76px]',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onDay(d)}
                        title={`${weekdayLong(d)} ${fullDate(d)}${label ? ` · ${label}` : ''}\nBấm để đặt tiêu đề cho ngày này`}
                        className="focus-ring group/h flex w-full flex-col items-center gap-0.5 px-1 py-1.5 hover:bg-surface-3/60"
                      >
                        <span className={clsx('text-[10.5px]', kind !== 'weekday' ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-faint')}>{weekday(d)}</span>
                        <span className={clsx('grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold tabular-nums', isToday(d) ? 'bg-accent text-white' : 'text-fg')}>
                          {onlyOt ? dayMonth(d) : Number(d.slice(8))}
                        </span>
                        {label ? (
                          <span className="line-clamp-2 w-full rounded bg-accent-soft px-1 py-0.5 text-center text-[10px] leading-tight font-medium break-words text-accent">{label}</span>
                        ) : (
                          <Pencil size={9} className="text-faint opacity-0 group-hover/h:opacity-100" />
                        )}
                      </button>
                    </th>
                  );
                })}
                <th className="sticky right-0 z-20 w-[64px] min-w-[64px] border-b border-l border-line bg-amber-100 px-2 py-2 sm:w-[88px] sm:min-w-[88px] sm:px-3 text-right text-[11.5px] font-semibold text-fg dark:bg-[#3a3214]">Tổng<span className="hidden sm:inline"> (giờ)</span></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const sum = totalOf((e) => e.person_id === p.id);
                return (
                  <tr key={p.id} className="group/r">
                    <th className={clsx('sticky left-0 z-10 max-w-[120px] border-b border-line px-2 py-1.5 text-left font-medium sm:max-w-none sm:px-3 group-hover/r:bg-surface-2', p.id === mineId ? 'bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]' : 'bg-surface')}>
                      <span className={clsx('flex min-w-0 items-center gap-2', !p.active && 'opacity-60')} title={[fullName(p), p.email ?? 'Chưa có tài khoản', !p.active && 'Đã ẩn'].filter(Boolean).join('\n')}>
                        {face(p, 22)}
                        <span className="truncate">{p.name}</span>
                        {p.id === mineId && <span className="hidden text-[10.5px] font-normal text-faint sm:inline">bạn</span>}
                      </span>
                    </th>
                    {days.map((d) => {
                      const e = find(p.id, d);
                      const weekend = dayKind(d) !== 'weekday';
                      return (
                        <td key={d} className={clsx('border-b border-l border-line p-0 group-hover/r:bg-surface-2/60', isToday(d) ? 'bg-accent-soft/60' : weekend && 'bg-emerald-500/[0.04]')}>
                          <button
                            type="button"
                            onClick={() => onEdit(e ?? { person_id: p.id, work_date: d })}
                            title={e ? `${fmtHours(e.hours)} giờ${e.note ? `\n${e.note}` : ''}\n— sửa lần cuối: ${actorName(e.updated_by)}` : `Ghi OT ${dayMonth(d)} cho ${p.name}`}
                            className={clsx(
                              'focus-ring group/c relative flex h-9 w-full items-center justify-center font-mono tabular-nums',
                              'cursor-pointer hover:bg-accent-soft',
                            )}
                          >
                            {e ? (
                              <span className={clsx('rounded px-1.5 py-0.5 font-semibold', weekend ? 'bg-emerald-500/18 text-emerald-800 dark:text-emerald-300' : 'bg-accent-soft text-accent')}>
                                {fmtHours(e.hours)}
                              </span>
                            ) : (
                              <Plus size={12} className="text-faint opacity-0 group-hover/c:opacity-100" />
                            )}
                            {e?.note && <span className="absolute top-1 right-1 size-1 rounded-full bg-accent/70" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 border-b border-l border-line bg-amber-50 px-2 text-right sm:px-3 font-mono font-semibold text-red-600 tabular-nums dark:bg-[#2b2611] dark:text-red-400">
                      {fmtHours(sum)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky left-0 z-10 bg-surface-2 px-2 py-2 text-left text-[11.5px] font-semibold text-muted sm:px-3">Tổng ngày</th>
                {days.map((d) => {
                  const s = totalOf((e) => e.work_date === d);
                  return (
                    <td key={d} className="border-l border-line bg-surface-2 text-center font-mono text-[11.5px] font-semibold text-fg-2 tabular-nums">
                      {s ? fmtHours(s) : ''}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 border-l border-line bg-amber-100 px-2 text-right sm:px-3 font-mono font-bold text-red-600 tabular-nums dark:bg-[#3a3214] dark:text-red-400">{fmtHours(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11.5px] text-faint">
        <span>Ai trong team cũng ghi / sửa được: bấm vào ô để ghi giờ, bấm tiêu đề cột để đặt tên cho ngày. File Excel chỉ gồm người có OT trong tháng.</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500/25" /> Cuối tuần / ngày lễ
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1 rounded-full bg-accent/70" /> Có ghi chú
        </span>
      </p>
    </div>
  );
}
