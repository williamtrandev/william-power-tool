import clsx from 'clsx';
import { Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Dropdown } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { dayMonth, fmtHours, fullName, holidayName, parseHours, weekdayLong, type OtChange, type OtEntry, type OtPerson } from '../../lib/ot';
import { relTime } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { field, Label } from '../../components/form';


const QUICK = [1, 2, 3, 4, 6, 8];

/** what the editor opens on: an existing entry, or a person + day to log */
export type Editing = OtEntry | { person_id: string; work_date: string };

/** Add or change one person's OT on one day, and the day's shared title. */
export function OtEditor({
  backend,
  initial,
  people,
  avatars,
  mine,
  labels,
  find,
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
  labels: Map<string, string>;
  /** the entry already logged for this person + day, if it is in the loaded month */
  find: (personId: string, date: string) => OtEntry | undefined;
  /** the month's change log; the editor shows the part about this person + day */
  history: OtChange[];
  actorName: (email: string | null) => string;
  onClose: () => void;
  onSaved: (date: string) => void;
  onToast: (m: string) => void;
}) {
  const origin = 'id' in initial ? initial : undefined;
  const [entry, setEntry] = useState<OtEntry | undefined>(origin ?? find(initial.person_id, initial.work_date));
  const [personId, setPersonId] = useState(initial.person_id);
  const [date, setDate] = useState(initial.work_date);
  const [hours, setHours] = useState(entry ? fmtHours(entry.hours) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [label, setLabel] = useState(labels.get(initial.work_date) ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const hoursRef = useRef<HTMLInputElement>(null);

  // switching person / day onto one that is already logged edits that entry instead of adding a duplicate;
  // onto a free day, an existing entry is moved there
  const pick = (u: string, d: string) => {
    setPersonId(u);
    setDate(d);
    const e = find(u, d);
    setEntry(e ?? origin);
    if (e) {
      setHours(fmtHours(e.hours));
      setNote(e.note);
    }
    setLabel(labels.get(d) ?? '');
  };

  useEffect(() => hoursRef.current?.focus(), []);

  const h = parseHours(hours);
  const valid = h > 0 && h <= 24 && !!date;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await backend.otSave(entry?.id ?? null, { person_id: personId, work_date: date, hours: h, note: note.trim() });
      if (label.trim() !== (labels.get(date) ?? '')) await backend.otSetDay(date, label);
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
              onChange={(u) => pick(u, date)}
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
            <input type="date" required className={field} value={date} onChange={(e) => pick(personId, e.target.value)} />
          </div>
        </div>

        <div>
          <Label hint="ví dụ 3 hoặc 11,5">Số giờ OT</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={hoursRef}
              inputMode="decimal"
              className={clsx(field.replace('w-full', 'w-28'), 'text-right font-mono tabular-nums')}
              value={hours}
              placeholder="0"
              onChange={(e) => setHours(e.target.value)}
              aria-invalid={!!hours && !valid}
            />
            <span className="text-[13px] text-muted">giờ</span>
            <div className="ml-auto flex flex-wrap gap-1">
              {QUICK.map((q) => (
                <Button key={q} size="sm" active={h === q} onClick={() => setHours(String(q))}>
                  {q}h
                </Button>
              ))}
            </div>
          </div>
          {!!hours && !valid && <p className="mt-1 text-[12px] text-error">Số giờ phải lớn hơn 0 và không quá 24</p>}
        </div>

        <div>
          <Label hint="làm gì trong buổi OT">Nội dung công việc</Label>
          <textarea
            rows={3}
            className={clsx(field, 'h-auto resize-y py-2 leading-relaxed')}
            value={note}
            maxLength={2000}
            placeholder="VD: Hỗ trợ LIVE gencode, fix lỗi đối soát…"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div>
          <Label hint="dùng chung cho cả cột ngày này, hiện trên file Excel">Tiêu đề ngày</Label>
          <input className={field} value={label} maxLength={80} placeholder="VD: LIVE gencode, Security, Dựng RL…" onChange={(e) => setLabel(e.target.value)} />
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

/** Edit only the shared title of a day (from the column header). */
export function DayLabelEditor({ backend, date, label, onClose, onSaved, onToast }: { backend: Backend; date: string; label: string; onClose: () => void; onSaved: () => void; onToast: (m: string) => void }) {
  const [v, setV] = useState(label);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await backend.otSetDay(date, v);
      onToast(v.trim() ? 'Đã đặt tiêu đề ngày' : 'Đã xoá tiêu đề ngày');
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Tiêu đề ngày ${date.slice(8)}/${date.slice(5, 7)} · ${weekdayLong(date)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy || v.trim() === label} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            Lưu
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Label hint="để trống để xoá">Cả team làm gì hôm đó</Label>
        <input autoFocus className={field} value={v} maxLength={80} placeholder="VD: LIVE gencode, Security, Dựng RL…" onChange={(e) => setV(e.target.value)} />
      </form>
    </Modal>
  );
}
