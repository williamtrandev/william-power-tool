import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, History, ListChecks, Loader2, Pencil, Plus, RefreshCw, Table2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, Segmented, Switch } from '../../components/ui';
import type { Backend, DirectoryEntry, Member } from '../../lib/backend';
import {
  dayKind,
  dayMonth,
  fmtHours,
  fullDate,
  fullName,
  holidayName,
  monthDays,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  today,
  weekday,
  weekdayLong,
  type OtChange,
  type OtEntry,
  type OtMonth,
  type OtPerson,
} from '../../lib/ot';
import { DayLabelEditor, OtEditor } from './OtEditor';
import { OtHistory } from './OtHistory';
import { PeopleManager } from './PeopleManager';

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
}

type View = 'table' | 'log' | 'history';
type Editing = OtEntry | { person_id: string; work_date: string };

/** Team overtime by month: a person × day table like the team's sheet, a day-by-day log, and an Excel export. */
export function OtTool({ active, backend, me, onToast }: Props) {
  const [month, setMonth] = useState(() => monthOf(today()));
  const [data, setData] = useState<OtMonth | null>(null);
  const [roster, setRoster] = useState<OtPerson[]>([]);
  const [dir, setDir] = useState<DirectoryEntry[]>([]);
  const [history, setHistory] = useState<OtChange[] | null>(null);
  const [managing, setManaging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('table');
  // a whole month does not fit a phone: start there with just the days that have OT
  const [onlyOt, setOnlyOt] = useState(() => matchMedia('(max-width: 639px)').matches);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dayEdit, setDayEdit] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = monthRange(month);
      const [d, people, members, changes] = await Promise.all([backend.otList(from, to), backend.otPeople(), backend.directory(), backend.otHistory(from, to)]);
      setData(d);
      setHistory(changes);
      setRoster(people);
      setDir(members);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [backend, month]);
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const labels = useMemo(() => new Map((data?.days ?? []).map((d) => [d.work_date, d.label])), [data]);
  const byKey = useMemo(() => new Map(entries.map((e) => [`${e.person_id}|${e.work_date}`, e])), [entries]);
  const find = useCallback((pid: string, d: string) => byKey.get(`${pid}|${d}`), [byKey]);

  // your roster row is the one carrying your sign-in email
  const myRow = roster.find((p) => p.email === me.email);
  const mineId = myRow?.id;
  // the sheet: only people who did OT this month (by name, as exported); others are logged via "Ghi OT"
  const sheet = useMemo(
    () => roster.filter((p) => entries.some((e) => e.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [roster, entries],
  );
  // on screen, you come first
  const people = useMemo(() => [...sheet].sort((a, b) => Number(b.id === mineId) - Number(a.id === mineId)), [sheet, mineId]);
  const avatars = useMemo(() => {
    const byEmail = new Map(dir.map((m) => [m.email, m.avatar_url]));
    return new Map(roster.map((p) => [p.id, p.email ? byEmail.get(p.email) : null]));
  }, [roster, dir]);
  // who made a change, by sign-in email: their name on the roster, else their Google name, else the email
  const actorName = useCallback(
    (email: string | null) => (email ? (roster.find((p) => p.email === email)?.name ?? dir.find((m) => m.email === email)?.full_name ?? email) : 'Không rõ'),
    [roster, dir],
  );
  const face = (p: OtPerson, size: number) => <Avatar src={avatars.get(p.id)} name={fullName(p)} email={p.email ?? p.id} size={size} />;

  const days = useMemo(() => {
    const all = monthDays(month);
    return onlyOt ? all.filter((d) => entries.some((e) => e.work_date === d) || labels.has(d)) : all;
  }, [month, onlyOt, entries, labels]);
  const totalOf = (pred: (e: OtEntry) => boolean) => entries.filter(pred).reduce((a, e) => a + e.hours, 0);
  const total = totalOf(() => true);
  const mine = totalOf((e) => e.person_id === mineId);
  const otPeople = new Set(entries.map((e) => e.person_id)).size;
  const otDays = new Set(entries.map((e) => e.work_date)).size;

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
    if (!active || view !== 'table' || !focusDay) return;
    scrollToDay(focusDay);
    // the titles strip too: end it on the latest title up to that day, earlier ones to its left
    const box = strip.current;
    const chip = [...(box?.querySelectorAll<HTMLElement>('[data-day]') ?? [])].filter((c) => c.dataset.day! <= focusDay).at(-1);
    if (box && chip) box.scrollLeft = Math.max(0, chip.offsetLeft + chip.offsetWidth - box.clientWidth + 12);
  }, [active, view, focusDay, month, onlyOt, data, scrollToDay]);
  // titled days of the month, readable in full above the table
  const titled = useMemo(() => [...labels].filter(([d]) => monthOf(d) === month).sort(([a], [b]) => a.localeCompare(b)), [labels, month]);

  const doExport = async () => {
    setExporting(true);
    try {
      const { exportOtMonth } = await import('./otExport');
      await exportOtMonth({ month, roster: sheet, entries, labels });
      onToast('Đã xuất file Excel');
    } catch (e) {
      onToast('Không xuất được file: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // the whole tab is shared: anyone logs OT for anyone; the form starts on you if you are on the roster
  const startAdd = () => {
    const pid = mineId ?? roster.find((p) => p.active)?.id;
    if (!pid) return setManaging(true);
    setEditing({ person_id: pid, work_date: monthOf(today()) === month ? today() : `${month}-01` });
  };
  const isToday = (d: string) => d === today();

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[260px]">
            <h1 className="text-lg font-semibold tracking-tight">Giờ OT</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Ghi giờ làm thêm của cả team theo ngày, kèm nội dung công việc. Cuối tháng xuất ra Excel.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </Button>
            <Button data-tour="ot-export" onClick={doExport} disabled={!data || exporting} title={`Xuất ${monthLabel(month).toLowerCase()} ra file .xlsx`}>
              {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} className="text-emerald-600 dark:text-emerald-400" />}
              Xuất Excel
            </Button>
            <Button data-tour="ot-people" onClick={() => setManaging(true)} title="Ai có trên bảng OT, tên hiển thị, người chưa có tài khoản">
              <Users size={15} />
              <span className="max-sm:hidden">Danh sách người</span>
              <span className="sm:hidden">Người</span>
            </Button>
            <Button data-tour="ot-add" variant="primary" onClick={startAdd} disabled={!data}>
              <Plus size={15} />
              Ghi OT
            </Button>
          </div>
        </div>

        {/* month + view */}
        <div className="flex flex-wrap items-center gap-2">
          <div data-tour="ot-month" className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5">
            <Button variant="ghost" size="icon-sm" aria-label="Tháng trước" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
              <ChevronLeft size={16} />
            </Button>
            <label className="relative flex h-7 min-w-[130px] cursor-pointer items-center justify-center gap-1.5 px-2 text-[13px] font-semibold tabular-nums">
              <CalendarDays size={14} className="text-muted" />
              {monthLabel(month)}
              <input type="month" aria-label="Chọn tháng" className="absolute inset-0 cursor-pointer opacity-0" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </label>
            <Button variant="ghost" size="icon-sm" aria-label="Tháng sau" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
              <ChevronRight size={16} />
            </Button>
          </div>
          {month !== monthOf(today()) && (
            <Button size="sm" variant="ghost" onClick={() => setMonth(monthOf(today()))}>
              Về tháng này
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {view === 'table' && <Switch checked={onlyOt} onChange={setOnlyOt} label="Chỉ ngày có OT" />}
            <Segmented
              label="Kiểu xem"
              value={view}
              onChange={setView}
              items={[
                { id: 'table', label: 'Bảng', icon: <Table2 size={14} /> },
                { id: 'log', label: 'Nhật ký', icon: <ListChecks size={14} /> },
                { id: 'history', label: 'Lịch sử', icon: <History size={14} /> },
              ]}
            />
          </div>
        </div>


        {/* summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ['Tổng giờ OT', fmtHours(total), 'giờ'],
              ['Giờ của bạn', fmtHours(mine), 'giờ'],
              ['Người có OT', String(otPeople), `/ ${roster.filter((p) => p.active).length}`],
              ['Ngày có OT', String(otDays), 'ngày'],
            ] as const
          ).map(([label, v, unit], i) => (
            <div key={label} className={clsx('rounded-xl border px-4 py-3', 'max-sm:px-3 max-sm:py-2.5', i === 0 ? 'border-accent/25 bg-gradient-to-br from-accent-soft to-transparent' : 'border-line bg-surface')}>
              <p className="text-[11.5px] text-muted">{label}</p>
              <p className="mt-0.5 text-[18px] font-semibold sm:text-[20px] tracking-tight tabular-nums">
                {v} <span className="text-[12px] font-normal text-faint">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[13px] text-error">{err}</p>}
        {!data && !err && (
          <div className="grid h-40 place-items-center text-muted">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {data && view === 'table' && (
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
                      onDoubleClick={() => setDayEdit(d)}
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
            {!roster.length ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted">
                Chưa có ai trong danh sách OT.{' '}
                <button type="button" className="text-accent hover:underline" onClick={() => setManaging(true)}>
                  Thêm người
                </button>
              </div>
            ) : !people.length || !days.length ? (
              <div className="px-4 py-10 text-center text-[13px] text-muted">
                Tháng này chưa có ai ghi OT.{' '}
                <button type="button" className="text-accent hover:underline" onClick={startAdd}>
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
                              onClick={() => setDayEdit(d)}
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
                                  onClick={() => setEditing(e ?? { person_id: p.id, work_date: d })}
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
              <span>Chỉ hiện người có OT trong tháng — người khác ghi qua nút “Ghi OT”. Ai trong team cũng ghi / sửa được: bấm vào ô để ghi giờ, bấm tiêu đề cột để đặt tên cho ngày.</span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500/25" /> Cuối tuần / ngày lễ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-accent/70" /> Có ghi chú
              </span>
            </p>
          </div>
        )}

        {data && view === 'history' && <OtHistory changes={history} people={roster} actorName={actorName} />}
        {data && view === 'log' && <OtLog entries={entries} labels={labels} people={roster} face={face} mineId={mineId} onEdit={setEditing} onDay={setDayEdit} />}
      </div>

      {editing && (
        <OtEditor
          key={'id' in editing ? editing.id : `${editing.person_id}|${editing.work_date}`}
          backend={backend}
          initial={editing}
          people={roster.filter((p) => p.active || p.id === editing.person_id)}
          avatars={avatars}
          mine={mineId}
          labels={labels}
          find={find}
          history={history ?? []}
          actorName={actorName}
          onClose={() => setEditing(null)}
          onToast={onToast}
          onSaved={(d) => {
            setEditing(null);
            if (monthOf(d) !== month) setMonth(monthOf(d));
            else load();
          }}
        />
      )}
      {managing && <PeopleManager backend={backend} people={roster} dir={dir} me={me} onClose={() => setManaging(false)} onChanged={load} onToast={onToast} />}
      {dayEdit && (
        <DayLabelEditor
          backend={backend}
          date={dayEdit}
          label={labels.get(dayEdit) ?? ''}
          onClose={() => setDayEdit(null)}
          onToast={onToast}
          onSaved={() => {
            setDayEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Day by day, newest first: who did OT and what they did. */
function OtLog({
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
