import clsx from 'clsx';
import { CopyPlus, Loader2, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '../../components/Modal';
import { field, fieldSm, Label } from '../../components/form';
import { Button, Switch } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { dayMonth, fmtHours, holidayName, parseHours, QUICK_HOURS, shiftDay, weekdayLong, type OtEntry, type OtPerson } from '../../lib/ot';

type Row = { on: boolean; hours: string; note: string };

/** what the days around the chosen date already hold, fetched when the date changes */
interface Around {
  date: string;
  /** OT already logged that day, by person */
  existing: Map<string, OtEntry>;
  /** the latest earlier day with OT (up to a month back), to copy from */
  prev?: { date: string; entries: OtEntry[]; label?: string };
}

/**
 * Log the same day for several people at once — e.g. three people "Dựng RL" 8 h — or carry over
 * the previous OT day. Shared hours / note fill every ticked person; each row can still be changed.
 */
export function OtBulkEditor({
  backend,
  people,
  initialDate,
  labels,
  face,
  onClose,
  onSaved,
  onToast,
}: {
  backend: Backend;
  /** the active roster, in display order */
  people: OtPerson[];
  initialDate: string;
  labels: Map<string, string>;
  face: (p: OtPerson, size: number) => ReactNode;
  onClose: () => void;
  onSaved: (date: string) => void;
  onToast: (m: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [label, setLabel] = useState(labels.get(initialDate) ?? '');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
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
      .then(({ entries, days }) => {
        if (!alive) return;
        const before = entries.filter((e) => e.work_date < date);
        const last = before.reduce<string | undefined>((m, e) => (!m || e.work_date > m ? e.work_date : m), undefined);
        setAround({
          date,
          existing: new Map(entries.filter((e) => e.work_date === date).map((e) => [e.person_id, e])),
          prev: last ? { date: last, entries: before.filter((e) => e.work_date === last), label: days.find((d) => d.work_date === last)?.label } : undefined,
        });
      })
      .catch(() => alive && setAround({ date, existing: new Map() }));
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
    if (!label.trim() || label === labels.get(date)) setLabel(labels.get(d) ?? '');
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
    if (!label.trim() && prev.label) setLabel(prev.label);
    onToast(`Đã chép ${prev.entries.length} người từ ${dayMonth(prev.date)} — sửa lại nếu cần`);
  };

  const existing = around?.date === date ? around.existing : new Map<string, OtEntry>();
  const chosen = people.filter((p) => row(p.id).on);
  const skipped = overwrite ? [] : chosen.filter((p) => existing.has(p.id));
  const toWrite = chosen.filter((p) => !skipped.includes(p));
  const invalid = toWrite.filter((p) => {
    const h = parseHours(row(p.id).hours);
    return !(h > 0 && h <= 24);
  });
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
        toWrite.map((p) => ({ person_id: p.id, work_date: date, hours: parseHours(row(p.id).hours), note: row(p.id).note.trim() })),
        overwrite,
      );
      if (label.trim() !== (labels.get(date) ?? '')) await backend.otSetDay(date, label);
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
            <Label hint="dùng chung cho cả cột">Tiêu đề ngày</Label>
            <input className={field} value={label} maxLength={80} placeholder="VD: Dựng RL, LIVE gencode…" onChange={(e) => setLabel(e.target.value)} />
          </div>
        </div>

        {around?.prev && around.date === date && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-[12.5px]">
            <CopyPlus size={15} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Ngày OT gần nhất trước đó: <b className="font-semibold">{dayMonth(around.prev.date)}</b>
              {around.prev.label && <span className="text-muted"> ({around.prev.label})</span>} —{' '}
              {around.prev.entries.map((e) => people.find((p) => p.id === e.person_id)?.name ?? '?').join(', ')}
            </span>
            <Button size="sm" onClick={copyPrev}>
              Chép từ {dayMonth(around.prev.date)}
            </Button>
          </div>
        )}

        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <p className="mb-2 text-[12px] font-medium text-fg-2">Áp dụng cho mọi người được chọn</p>
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
              const bad = r.on && !(parseHours(r.hours) > 0 && parseHours(r.hours) <= 24) && !(had && !overwrite);
              return (
                <li key={p.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2', r.on && 'bg-accent-soft/50')}>
                  <label className="flex min-w-0 flex-1 basis-[160px] cursor-pointer items-center gap-2.5">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={r.on} onChange={(e) => toggle(p.id, e.target.checked)} />
                    {face(p, 24)}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{p.name}</span>
                      {had && (
                        <span className={clsx('block text-[11px]', overwrite ? 'text-warn' : 'text-faint')} title={had.note}>
                          Đã có {fmtHours(had.hours)}h ngày này — {overwrite ? 'sẽ ghi đè' : 'sẽ bỏ qua'}
                        </span>
                      )}
                    </span>
                  </label>
                  {r.on && (
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
          <Switch checked={overwrite} onChange={setOverwrite} label={`Ghi đè người đã có OT ngày ${dayMonth(date)}`} />
        )}
        {invalid.length > 0 && <p className="text-[12px] text-error">Nhập số giờ (0–24) cho: {invalid.map((p) => p.name).join(', ')}</p>}
        {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[12.5px] text-error">{err}</p>}
      </div>
    </Modal>
  );
}
