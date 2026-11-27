import clsx from 'clsx';
import { Clock, Hash, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Dropdown, Segmented } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { dayMonth, dayTasks, fmtHours, fullName, holidayName, parseHours, parsePeriods, periodHours, NO_TASK, periodsNote, QUICK_HOURS, weekdayLong, type OtChange, type OtEntry, type OtPerson } from '../../lib/ot';
import { OtPeriods } from './OtPeriods';
import { relTime } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { field, Label } from '../../components/form';

/** what the editor opens on: an existing entry, or a person + day to log */
export type Editing = OtEntry | { person_id: string; work_date: string };

/** Add or change one person's OT in one group on one day. */
export function OtEditor({
  backend,
  initial,
  people,
  avatars,
  mine,
  entries,
  find,
  findAll,
  history,
  actorName,
  onClose,
  onSaved,
  onToast,
}: {
  backend: Backend;
  /** an existing entry, or the person + day to start from */
  initial: Editing;
  /** who can be picked: the active roster */
  people: OtPerson[];
  avatars: Map<string, string | null | undefined>;
  /** your own roster row, marked in the picker */
  mine: string | undefined;
  /** the loaded month, for the groups already used on a day */
  entries: OtEntry[];
  /** the entry already logged for this person + day + group, if it is in the loaded month */
  find: (personId: string, date: string, task: string) => OtEntry | undefined;
  /** all of a person's groups on a day */
  findAll: (personId: string, date: string) => OtEntry[];
  /** the month's change log; the editor shows the part about this person + day */
  history: OtChange[];
  actorName: (email: string | null) => string;
  onClose: () => void;
  onSaved: (date: string) => void;
  onToast: (m: string) => void;
}) {
  // the row that moves when person / day / group is switched onto a free spot; none after "+ Thêm nhóm"
  const [origin, setOrigin] = useState<OtEntry | undefined>('id' in initial ? initial : findAll(initial.person_id, initial.work_date)[0]);
  const [entry, setEntry] = useState<OtEntry | undefined>(origin);
  const [personId, setPersonId] = useState(initial.person_id);
  const [date, setDate] = useState(initial.work_date);
  const [task, setTask] = useState(origin?.task ?? '');
  const [hours, setHours] = useState(entry ? fmtHours(entry.hours) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [periods, setPeriods] = useState(entry?.periods ?? '');
  // hours from start / end times when the entry has them; `loaded` remounts the periods on another entry
  const [timed, setTimed] = useState(!!entry?.periods);
  const [loaded, setLoaded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<HTMLInputElement>(null);

  // switching person / day / group onto one that is already logged edits that entry instead of adding a duplicate;
  // onto a free one, the entry being edited is moved there
  const pick = (u: string, d: string, t: string) => {
    setPersonId(u);
    setDate(d);
    setTask(t);
    const e = find(u, d, t.trim());
    setEntry(e ?? origin);
    if (e) load(e);
  };
  // another of this person's groups that day, or a new one
  const open = (e: OtEntry | undefined) => {
    setOrigin(e);
    setEntry(e);
    setTask(e?.task ?? '');
    load(e);
    setConfirmDel(false);
    if (!e) taskRef.current?.focus();
  };

  // the hours, times and note of an entry (none: a blank form)
  function load(e: OtEntry | undefined) {
    setHours(e ? fmtHours(e.hours) : '');
    setNote(e?.note ?? '');
    setPeriods(e?.periods ?? '');
    setTimed(!!e?.periods);
    setLoaded((n) => n + 1);
  }

  useEffect(() => hoursRef.current?.focus(), []);

  const h = parseHours(hours);
  const valid = h > 0 && h <= 24 && !!date;
  // two ways to give the hours: typed, or worked out from start / end times (then the hours and the note follow
  // the periods and cannot be typed over). Leaving the periods keeps their total and note as a starting point.
  // what was typed before switching to periods comes back if no period was filled in
  const typed = useRef({ hours: '', note: '' });
  const switchMode = (toPeriods: boolean) => {
    if (toPeriods === timed) return;
    setTimed(toPeriods);
    if (!toPeriods) {
      if (!periods) {
        setHours(typed.current.hours);
        setNote(typed.current.note);
      }
      return;
    }
    typed.current = { hours, note };
    const list = parsePeriods(periods);
    setHours(list.length ? fmtHours(periodHours(list)) : '');
    setNote(periodsNote(list));
    setLoaded((n) => n + 1);
  };

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await backend.otSave(entry?.id ?? null, { person_id: personId, work_date: date, task: task.trim(), hours: h, periods: timed ? periods : '', note: note.trim() });
      onToast(entry ? 'Đã cập nhật giờ OT' : 'Đã ghi giờ OT');
      onSaved(date);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      await backend.otDelete(entry.id);
      onToast('Đã xoá giờ OT');
      onSaved(date);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const person = people.find((p) => p.id === personId);
  // this person's groups that day (the open one included), and the names used that day by anyone, to pick from
  const mineToday = findAll(personId, date);
  const suggestions = dayTasks(entries, date).filter(Boolean);
  const face = (p: OtPerson, size: number) => <Avatar src={avatars.get(p.id)} name={fullName(p)} email={p.email ?? p.id} size={size} />;
  const special = holidayName(date) ?? (date && [0, 6].includes(new Date(date + 'T00:00').getDay()) ? 'Cuối tuần' : null);

  return (
    <Modal
      title={entry ? 'Sửa giờ OT' : 'Ghi giờ OT'}
      onClose={onClose}
      footer={
        <>
          {entry && (
            <Button variant={confirmDel ? 'danger' : 'ghost'} className="mr-auto" disabled={busy} onClick={() => (confirmDel ? remove() : setConfirmDel(true))}>
              <Trash2 size={15} />
              {confirmDel ? 'Bấm lần nữa để xoá' : 'Xoá'}
            </Button>
          )}
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {entry ? 'Lưu' : 'Ghi OT'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Người làm</Label>
            <Dropdown
              label="Người làm"
              align="left"
              value={personId}
              onChange={(u) => pick(u, date, task)}
              icon={person && face(person, 18)}
              options={people.map((p) => ({
                id: p.id,
                label: p.id === mine ? `${p.name} (bạn)` : p.name,
                hint: [p.full_name !== p.name && p.full_name, p.email ?? 'Chưa có tài khoản'].filter(Boolean).join(' · '),
              }))}
            />
          </div>
          <div>
            <Label hint={date ? (special ? `${weekdayLong(date)} · ${special}` : weekdayLong(date)) : undefined}>Ngày</Label>
            <input type="date" required className={field} value={date} onChange={(e) => pick(personId, e.target.value, task)} />
          </div>
        </div>

        {mineToday.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
            <span className="mr-1 text-[12px] text-muted">{person?.name ?? 'Người này'} ngày này:</span>
            {mineToday.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => open(e)}
                aria-pressed={e.id === entry?.id}
                className={clsx(
                  'focus-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]',
                  e.id === entry?.id ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-fg-2 hover:border-accent/50',
                )}
              >
                <span className="max-w-[160px] truncate">{e.task || NO_TASK}</span>
                <b className="font-semibold tabular-nums">{fmtHours(e.hours)}h</b>
              </button>
            ))}
            <button
              type="button"
              onClick={() => open(undefined)}
              aria-pressed={!entry}
              className={clsx(
                'focus-ring inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[12px]',
                !entry ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/50 hover:text-fg',
              )}
            >
              <Plus size={12} /> Thêm nhóm
            </button>
          </div>
        )}

        <div>
          <Label hint={suggestions.length ? 'chọn nhóm đã có hoặc gõ tên mới' : 'tuỳ chọn, cả team cùng việc thì đặt cùng tên'}>Nhóm / việc</Label>
          <input
            ref={taskRef}
            className={field}
            list="ot-day-tasks"
            value={task}
            maxLength={80}
            placeholder="VD: LIVE gencode, Dựng RL…"
            onChange={(e) => pick(personId, date, e.target.value)}
          />
          <datalist id="ot-day-tasks">
            {suggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {suggestions.map((t) => (
                <Button key={t} size="sm" active={task.trim() === t} onClick={() => pick(personId, date, task.trim() === t ? '' : t)}>
                  {t}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] font-medium text-fg-2">Thời gian OT</p>
            <Segmented
              label="Cách nhập giờ"
              value={timed ? 'periods' : 'hours'}
              onChange={(m) => switchMode(m === 'periods')}
              items={[
                { id: 'hours', label: 'Nhập số giờ', icon: <Hash size={13} /> },
                { id: 'periods', label: 'Giờ bắt đầu – kết thúc', icon: <Clock size={13} /> },
              ]}
            />
          </div>

          {timed ? (
            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <OtPeriods
                key={loaded}
                value={periods}
                onChange={(list, total, text) => {
                  setPeriods(list);
                  setNote(text);
                  setHours(total != null ? fmtHours(total) : '');
                }}
              />
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                <span className="text-[12.5px] text-muted">Tổng số giờ OT</span>
                <span className="font-mono text-[18px] font-semibold text-fg tabular-nums">
                  {valid ? fmtHours(h) : '—'} <span className="font-sans text-[12px] font-normal text-muted">giờ</span>
                </span>
              </div>
              {!!hours && !valid && <p className="mt-1 text-right text-[12px] text-error">Tổng phải lớn hơn 0 và không quá 24 giờ</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={hoursRef}
                  inputMode="decimal"
                  aria-label="Số giờ OT"
                  className={clsx(field.replace('w-full', 'w-28'), 'text-right font-mono tabular-nums')}
                  value={hours}
                  placeholder="0"
                  onChange={(e) => setHours(e.target.value)}
                  aria-invalid={!!hours && !valid}
                />
                <span className="text-[13px] text-muted">giờ</span>
                <div className="ml-auto flex flex-wrap gap-1">
                  {QUICK_HOURS.map((q) => (
                    <Button key={q} size="sm" active={h === q} onClick={() => setHours(String(q))}>
                      {q}h
                    </Button>
                  ))}
                </div>
              </div>
              {!!hours && !valid && <p className="mt-1 text-[12px] text-error">Số giờ phải lớn hơn 0 và không quá 24</p>}
            </>
          )}
        </div>

        <div>
          <Label hint={timed ? 'ghép từ các đợt ở trên' : 'làm gì trong buổi OT'}>Nội dung công việc</Label>
          {timed ? (
            <p className={clsx('min-h-10 rounded-lg border border-dashed border-line px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line', note ? 'text-fg-2' : 'text-faint')}>
              {note || 'Nhập giờ và việc làm của từng đợt — VD: 17h30 - 19h30: Golive hệ thống A'}
            </p>
          ) : (
            <textarea
              rows={3}
              className={clsx(field, 'h-auto resize-y py-2 leading-relaxed')}
              value={note}
              maxLength={2000}
              placeholder="VD: Hỗ trợ LIVE gencode, fix lỗi đối soát…"
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </div>

        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[12.5px] text-error">{err}</p>}
        {(() => {
          // changes to this cell, so whoever opens it sees who logged / edited it before
          const cellLog = history.filter((c) => c.person_id === personId && (c.work_date === date || c.old_work_date === date)).slice(0, 6);
          if (!cellLog.length) return null;
          const says = (c: OtChange) =>
            c.action === 'insert'
              ? `ghi ${fmtHours(c.hours ?? 0)}h`
              : c.action === 'delete'
                ? `xoá ${fmtHours(c.old_hours ?? 0)}h`
                : [
                    c.old_work_date && `chuyển ngày ${dayMonth(c.old_work_date)} → ${dayMonth(c.work_date)}`,
                    c.old_hours !== c.hours && `sửa ${fmtHours(c.old_hours ?? 0)}h → ${fmtHours(c.hours ?? 0)}h`,
                    (c.old_note ?? '') !== (c.note ?? '') && 'sửa nội dung',
                  ]
                    .filter(Boolean)
                    .join(', ') || 'sửa';
          return (
            <div className="rounded-lg border border-line px-3 py-2">
              <p className="mb-1 text-[11.5px] font-medium text-muted">Lịch sử ô này</p>
              <ul className="space-y-0.5 text-[12px] text-fg-2">
                {cellLog.map((c) => (
                  <li key={c.id} className="flex gap-1.5">
                    <span className="shrink-0 text-faint tabular-nums" title={new Date(c.at).toLocaleString('vi-VN')}>
                      {relTime(c.at)}
                    </span>
                    <span>
                      <b className="font-medium text-fg">{actorName(c.actor)}</b> {says(c)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
