import clsx from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, History, ListChecks, Loader2, Plus, RefreshCw, Table2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Segmented, Switch } from '../../components/ui';
import type { Backend, DirectoryEntry, Member } from '../../lib/backend';
import {
  fmtHours,
  fullName,
  monthLabel,
  monthOf,
  monthRange,
  shiftMonth,
  today,
  type OtChange,
  type OtEntry,
  type OtMonth,
  type OtPerson,
} from '../../lib/ot';
import { DayLabelEditor, OtEditor, type Editing } from './OtEditor';
import { OtGrid } from './OtGrid';
import { OtHistory } from './OtHistory';
import { OtLog } from './OtLog';
import { PeopleManager } from './PeopleManager';

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
}

type View = 'table' | 'log' | 'history';

/** Team overtime by month: header, month picker and totals; the grid, day log and history are their own components. */
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
  // the grid: everyone on the roster, plus anyone hidden who still has OT this month (by name); the
  // export drops people without OT on its own
  const sheet = useMemo(
    () => roster.filter((p) => p.active || entries.some((e) => e.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
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

  const totalOf = (pred: (e: OtEntry) => boolean) => entries.filter(pred).reduce((a, e) => a + e.hours, 0);
  const total = totalOf(() => true);
  const mine = totalOf((e) => e.person_id === mineId);
  const otPeople = new Set(entries.map((e) => e.person_id)).size;
  const otDays = new Set(entries.map((e) => e.work_date)).size;


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
          <OtGrid
            active={active}
            month={month}
            people={people}
            hasRoster={roster.length > 0}
            entries={entries}
            labels={labels}
            onlyOt={onlyOt}
            setOnlyOt={setOnlyOt}
            mineId={mineId}
            find={find}
            face={face}
            actorName={actorName}
            onEdit={setEditing}
            onDay={setDayEdit}
            onAdd={startAdd}
            onManage={() => setManaging(true)}
          />
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
