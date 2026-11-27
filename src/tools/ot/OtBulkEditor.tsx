import clsx from 'clsx';
import { Clock, CopyPlus, Hash, Loader2, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { OtPeriods } from './OtPeriods';
import { field, fieldSm, Label } from '../../components/form';
import { Button, Segmented, Switch } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { dayMonth, dayTasks, fmtHours, holidayName, parseHours, QUICK_HOURS, shiftDay, weekdayLong, type OtEntry, type OtPerson } from '../../lib/ot';

type Row = { on: boolean; hours: string; note: string };

/** what the days around the chosen date already hold, fetched when the date changes */
interface Around {
  date: string;
  /** OT already logged that day, every group */
  existing: OtEntry[];
  /** the latest earlier day with OT (up to a month back), to copy from */
  prev?: { date: string; entries: OtEntry[] };
}

/**
 * Log the same day for several people at once — e.g. three people "Dựng RL" 8 h — or carry over
 * the previous OT day. Shared hours / note fill every ticked person; each row can still be changed.
 */
export function OtBulkEditor({
  backend,
  people,
  initialDate,
  face,
  onClose,
  onSaved,
  onToast,
}: {
  backend: Backend;
  /** the active roster, in display order */
  people: OtPerson[];
  initialDate: string;
  face: (p: OtPerson, size: number) => ReactNode;
  onClose: () => void;
  onSaved: (date: string) => void;
  onToast: (m: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  /** the group everyone here is logged under; '' = the day's title */
  const [task, setTask] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  // start / end times shared by everyone ticked: the hours and the note come from them, nobody's can be typed over
  const [timed, setTimed] = useState(false);
  const [periods, setPeriods] = useState('');
  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [periodNote, setPeriodNote] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [q, setQ] = useState('');
  const [around, setAround] = useState<Around | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // the chosen day and up to a month before it: who already has OT, and the last day to copy from
  useEffect(() => {
    if (!date) return;
    let alive = true;
    backend
      .otList(shiftDay(date, -31), date)
      .then(({ entries }) => {
        if (!alive) return;
        const before = entries.filter((e) => e.work_date < date);
        const last = before.reduce<string | undefined>((m, e) => (!m || e.work_date > m ? e.work_date : m), undefined);
        setAround({
          date,
          existing: entries.filter((e) => e.work_date === date),
          prev: last ? { date: last, entries: before.filter((e) => e.work_date === last) } : undefined,
        });
      })
      .catch(() => alive && setAround({ date, existing: [] }));
    return () => {
      alive = false;
    };
  }, [backend, date]);

  const row = (pid: string): Row => rows[pid] ?? { on: false, hours: '', note: '' };
  const patch = (pid: string, p: Partial<Row>) => setRows((r) => ({ ...r, [pid]: { ...row(pid), ...p } }));
  // shared fields fill every ticked person (a later per-row edit still wins)
  const applyAll = (p: Partial<Row>) => setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.on ? { ...v, ...p } : v])));
  const toggle = (pid: string, on: boolean) => {
    const cur = row(pid);
    patch(pid, on ? { on, hours: cur.hours || hours, note: cur.note || note } : { on });
  };
  const pickDate = (d: string) => {
    setDate(d);
    setAround(null);
  };

  const copyPrev = () => {
    const prev = around?.prev;
    if (!prev) return;
    setRows(Object.fromEntries(prev.entries.map((e) => [e.person_id, { on: true, hours: fmtHours(e.hours), note: e.note }])));
    // one shared value only when everyone had the same
    const same = <T,>(f: (e: OtEntry) => T) => (prev.entries.every((e) => f(e) === f(prev.entries[0])) ? f(prev.entries[0]) : undefined);
    const h = same((e) => e.hours);
    setHours(h != null ? fmtHours(h) : '');
    setNote(same((e) => e.note) ?? '');
    setTask(same((e) => e.task) ?? '');
    onToast(`Đã chép ${prev.entries.length} người từ ${dayMonth(prev.date)} — sửa lại nếu cần`);
  };

  const dayRows = around?.date === date ? around.existing : [];
  // only the same group counts as already logged: other groups that day stay as they are
  const existing = new Map(dayRows.filter((e) => e.task === task.trim()).map((e) => [e.person_id, e]));
  const otherGroups = dayTasks(dayRows, date).filter(Boolean);
  const chosen = people.filter((p) => row(p.id).on);
  const skipped = overwrite ? [] : chosen.filter((p) => existing.has(p.id));
  const toWrite = chosen.filter((p) => !skipped.includes(p));
  const okHours = (n: number | null) => n != null && n > 0 && n <= 24;
  // what each ticked person gets: the shared periods, or their own hours and note
  const valuesOf = (pid: string) => (timed ? { hours: periodTotal ?? NaN, periods, note: periodNote } : { hours: parseHours(row(pid).hours), periods: '', note: row(pid).note.trim() });
  const invalid = toWrite.filter((p) => !okHours(valuesOf(p.id).hours));
  const ready = !!date && toWrite.length > 0 && invalid.length === 0 && !busy;
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return w ? people.filter((p) => `${p.name} ${p.full_name}`.toLowerCase().includes(w)) : people;
  }, [people, q]);
  const allShownOn = shown.length > 0 && shown.every((p) => row(p.id).on);

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    setErr(null);
    try {
      const n = await backend.otSaveMany(
        toWrite.map((p) => ({ person_id: p.id, work_date: date, task: task.trim(), ...valuesOf(p.id) })),
        overwrite,
      );
      onToast(`Đã ghi OT ${dayMonth(date)} cho ${n} người${skipped.length ? ` · bỏ qua ${skipped.length} người đã có` : ''}`);
      onSaved(date);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const special = date && (holidayName(date) ?? ([0, 6].includes(new Date(date + 'T00:00').getDay()) ? 'Cuối tuần' : null));
  const h = parseHours(hours);

  return (
    <Modal
      wide
      title="Ghi OT hàng loạt"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">
            {chosen.length ? `${toWrite.length} người sẽ được ghi${skipped.length ? `, ${skipped.length} bỏ qua (đã có)` : ''}` : 'Chưa chọn ai'}
          </span>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={!ready} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Ghi cho {toWrite.length} người
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label hint={date ? (special ? `${weekdayLong(date)} · ${special}` : weekdayLong(date)) : undefined}>Ngày</Label>
            <input type="date" required className={field} value={date} onChange={(e) => pickDate(e.target.value)} />
          </div>
          <div>
            <Label hint="tuỳ chọn">Nhóm / việc</Label>
            <input className={field} list="ot-bulk-tasks" value={task} maxLength={80} placeholder="VD: Dựng RL, LIVE gencode…" onChange={(e) => setTask(e.target.value)} />
            <datalist id="ot-bulk-tasks">
              {otherGroups.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        {otherGroups.length > 0 && (
          <div className="-mt-2 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[12px] text-muted">Nhóm đã có ngày này:</span>
            {otherGroups.map((t) => (
              <Button key={t} size="sm" active={task.trim() === t} onClick={() => setTask(task.trim() === t ? '' : t)}>
                {t}
              </Button>
            ))}
          </div>
        )}

        {around?.prev && around.date === date && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-[12.5px]">
            <CopyPlus size={15} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Ngày OT gần nhất trước đó: <b className="font-semibold">{dayMonth(around.prev.date)}</b>
              {dayTasks(around.prev.entries, around.prev.date).some(Boolean) && (
                <span className="text-muted"> ({dayTasks(around.prev.entries, around.prev.date).filter(Boolean).join(', ')})</span>
              )}{' '}
              —{' '}
              {[...new Set(around.prev.entries.map((e) => e.person_id))].map((id) => people.find((p) => p.id === id)?.name ?? '?').join(', ')}
            </span>
            <Button size="sm" onClick={copyPrev}>
              Chép từ {dayMonth(around.prev.date)}
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-fg-2">Áp dụng cho mọi người được chọn</p>
            <Segmented
              label="Cách nhập giờ"
              value={timed ? 'periods' : 'hours'}
              onChange={(m) => setTimed(m === 'periods')}
              items={[
                { id: 'hours', label: 'Nhập số giờ', icon: <Hash size={13} /> },
                { id: 'periods', label: 'Giờ bắt đầu – kết thúc', icon: <Clock size={13} /> },
              ]}
            />
          </div>
          {timed ? (
            <>
              <OtPeriods
                value={periods}
                onChange={(list, total, text) => {
                  setPeriods(list);
                  setPeriodNote(text);
                  setPeriodTotal(total);
                }}
              />
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                <span className="text-[12.5px] text-muted">Mỗi người được ghi</span>
                <span className="font-mono text-[16px] font-semibold text-fg tabular-nums">
                  {periodTotal != null ? fmtHours(periodTotal) : '—'} <span className="font-sans text-[12px] font-normal text-muted">giờ</span>
                </span>
              </div>
              {periodNote && <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] whitespace-pre-line text-fg-2">{periodNote}</p>}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  inputMode="decimal"
                  className={clsx(fieldSm.replace('w-full', 'w-24'), 'text-right font-mono tabular-nums')}
                  value={hours}
                  placeholder="Số giờ"
                  aria-label="Số giờ cho mọi người"
                  onChange={(e) => {
                    setHours(e.target.value);
                    applyAll({ hours: e.target.value });
                  }}
                />
                {QUICK_HOURS.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    active={h === n}
                    onClick={() => {
                      setHours(String(n));
                      applyAll({ hours: String(n) });
                    }}
                  >
                    {n}h
                  </Button>
                ))}
              </div>
              <input
                className={clsx(fieldSm, 'mt-2')}
                value={note}
                maxLength={2000}
                placeholder="Nội dung công việc chung — VD: Dựng môi trường RL"
                aria-label="Nội dung cho mọi người"
                onChange={(e) => {
                  setNote(e.target.value);
                  applyAll({ note: e.target.value });
                }}
              />
            </>
          )}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
              <Users size={14} /> Người làm <span className="font-normal text-faint">{chosen.length}/{people.length}</span>
            </p>
            <label className="relative ml-auto w-full sm:w-48">
              <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
              <input className={clsx(fieldSm, 'h-8 pl-7')} value={q} placeholder="Tìm người…" onChange={(e) => setQ(e.target.value)} />
            </label>
            <Button size="sm" variant="ghost" onClick={() => shown.forEach((p) => toggle(p.id, !allShownOn))}>
              {allShownOn ? 'Bỏ chọn' : 'Chọn tất cả'}
            </Button>
          </div>
          <ul className="max-h-[42vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {shown.map((p) => {
              const r = row(p.id);
              const had = existing.get(p.id);
              const bad = r.on && !timed && !okHours(parseHours(r.hours)) && !(had && !overwrite);
              return (
                <li key={p.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2', r.on && 'bg-accent-soft/50')}>
                  <label className="flex min-w-0 flex-1 basis-[160px] cursor-pointer items-center gap-2.5">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={r.on} onChange={(e) => toggle(p.id, e.target.checked)} />
                    {face(p, 24)}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{p.name}</span>
                      {had && (
                        <span className={clsx('block text-[11px]', overwrite ? 'text-warn' : 'text-faint')} title={had.note}>
                          Đã có {fmtHours(had.hours)}h {task.trim() ? 'nhóm này' : 'ngày này'} — {overwrite ? 'sẽ ghi đè' : 'sẽ bỏ qua'}
                        </span>
                      )}
                    </span>
                  </label>
                  {r.on && timed && (
                    <span className="ml-auto shrink-0 font-mono text-[12.5px] font-semibold text-fg-2 tabular-nums">{periodTotal != null ? `${fmtHours(periodTotal)} giờ` : '—'}</span>
                  )}
                  {r.on && !timed && (
                    <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-[2]">
                      <input
                        inputMode="decimal"
                        aria-label={`Số giờ của ${p.name}`}
                        aria-invalid={bad}
                        className={clsx(fieldSm.replace('w-full', 'w-16'), 'h-8 shrink-0 px-2 text-right font-mono tabular-nums', bad && 'border-error/60')}
                        value={r.hours}
                        placeholder="giờ"
                        onChange={(e) => patch(p.id, { hours: e.target.value })}
                      />
                      <input
                        aria-label={`Nội dung của ${p.name}`}
                        className={clsx(fieldSm, 'h-8 min-w-0')}
                        value={r.note}
                        placeholder="Nội dung riêng (nếu khác)"
                        onChange={(e) => patch(p.id, { note: e.target.value })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="px-3 py-6 text-center text-[12.5px] text-muted">Không có ai khớp “{q}”</li>}
          </ul>
        </div>

        {existing.size > 0 && (
          <Switch checked={overwrite} onChange={setOverwrite} label={`Ghi đè người đã có OT ${task.trim() ? `nhóm “${task.trim()}” ` : ''}ngày ${dayMonth(date)}`} />
        )}
        {invalid.length > 0 &&
          (timed ? (
            <p className="text-[12px] text-error">Nhập ít nhất một đợt có đủ giờ bắt đầu và kết thúc (tổng không quá 24 giờ)</p>
          ) : (
            <p className="text-[12px] text-error">Nhập số giờ (0–24) cho: {invalid.map((p) => p.name).join(', ')}</p>
          ))}
        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[12.5px] text-error">{err}</p>}
      </div>
    </Modal>
  );
}
