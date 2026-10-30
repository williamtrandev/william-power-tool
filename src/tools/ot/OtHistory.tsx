import clsx from 'clsx';
import { ArrowRight, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { dayMonth, fmtHours, type OtChange, type OtPerson } from '../../lib/ot';
import { relTime } from '../commands/CommandCard';

const ACTION = {
  insert: { icon: <Plus size={13} />, cls: 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300' },
  update: { icon: <Pencil size={12} />, cls: 'bg-accent-soft text-accent' },
  delete: { icon: <Trash2 size={12} />, cls: 'bg-error/12 text-error' },
} as const;

const fullTime = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Who changed which OT row and how, newest first. Comes from the database's own log, so it also covers
 * changes made for someone else ("ghi hộ"), and stays readable after the entry is deleted.
 */
export function OtHistory({ changes, people, actorName }: { changes: OtChange[] | null; people: OtPerson[]; actorName: (email: string | null) => string }) {
  // the roster email tells whether the change was made by the person themself or on their behalf
  const emailOf = useMemo(() => new Map(people.map((p) => [p.id, p.email])), [people]);
  const groups = useMemo(() => {
    const m = new Map<string, OtChange[]>();
    for (const c of changes ?? []) {
      const day = new Date(c.at).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      m.set(day, [...(m.get(day) ?? []), c]);
    }
    return [...m];
  }, [changes]);

  if (!changes) return <p className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">Đang tải lịch sử…</p>;
  if (!changes.length)
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-muted">
        <History size={20} className="mx-auto mb-2 text-faint" />
        Chưa có thay đổi nào cho các ngày trong tháng này.
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-muted">Mọi lần thêm / sửa / xoá giờ OT đều được ghi lại tự động — không ai sửa hay xoá được lịch sử này.</p>
      {groups.map(([day, list]) => (
        <section key={day} className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="border-b border-line bg-surface-2/60 px-4 py-2 text-[12.5px] font-semibold first-letter:uppercase">{day}</header>
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const a = ACTION[c.action];
              const who = <b className="font-semibold text-fg">{actorName(c.actor)}</b>;
              const person = <b className="font-semibold text-fg">{c.person_name ?? '(đã xoá)'}</b>;
              const date = <b className="font-semibold text-fg tabular-nums">{dayMonth(c.work_date)}</b>;
              const forOther = !!c.actor && c.person_id != null && emailOf.get(c.person_id) !== c.actor;
              const diffs: ReactNode[] = [];
              if (c.action === 'update') {
                if (c.old_person_name) diffs.push(<Diff key="p" label="Người" from={c.old_person_name} to={c.person_name ?? '?'} />);
                if (c.old_work_date) diffs.push(<Diff key="d" label="Ngày" from={dayMonth(c.old_work_date)} to={dayMonth(c.work_date)} />);
                if (c.old_hours !== c.hours) diffs.push(<Diff key="h" label="Số giờ" from={`${fmtHours(c.old_hours ?? 0)}h`} to={`${fmtHours(c.hours ?? 0)}h`} />);
              }
              const noteChanged = c.action === 'update' && (c.old_note ?? '') !== (c.note ?? '');
              return (
                <li key={c.id} className="flex gap-3 px-4 py-2.5">
                  <span className={clsx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full', a.cls)}>{a.icon}</span>
                  <div className="min-w-0 flex-1 text-[13px] text-fg-2">
                    <p>
                      {c.action === 'insert' && (
                        <>
                          {who} đã ghi <b className="font-semibold text-fg">{fmtHours(c.hours ?? 0)}h</b> cho {person} ngày {date}
                        </>
                      )}
                      {c.action === 'update' && (
                        <>
                          {who} đã sửa OT của {person} ngày {date}
                        </>
                      )}
                      {c.action === 'delete' && (
                        <>
                          {who} đã xoá <b className="font-semibold text-fg">{fmtHours(c.old_hours ?? 0)}h</b> của {person} ngày {date}
                        </>
                      )}
                      {forOther && <span className="ml-1.5 rounded-full bg-amber-500/14 px-1.5 py-px text-[10.5px] font-medium text-amber-700 dark:text-amber-300">ghi hộ</span>}
                      <span className="ml-2 text-[11.5px] text-faint" title={fullTime(c.at)}>
                        {relTime(c.at)} · {new Date(c.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                    {diffs.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{diffs}</div>}
                    {c.action === 'insert' && c.note && <p className="mt-0.5 text-[12.5px] whitespace-pre-wrap text-muted">{c.note}</p>}
                    {c.action === 'delete' && c.old_note && <p className="mt-0.5 text-[12.5px] whitespace-pre-wrap text-faint line-through">{c.old_note}</p>}
                    {noteChanged && (
                      <div className="mt-1 space-y-0.5 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-[12.5px] whitespace-pre-wrap">
                        <p className="text-faint line-through">{c.old_note || '(trống)'}</p>
                        <p className="text-fg-2">{c.note || '(trống)'}</p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Diff({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="text-faint line-through">{from}</span>
      <ArrowRight size={11} className="text-faint" />
      <span className="font-semibold text-fg">{to}</span>
    </span>
  );
}
