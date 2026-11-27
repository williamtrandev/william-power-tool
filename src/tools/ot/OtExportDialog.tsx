import clsx from 'clsx';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { field, Label } from '../../components/form';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { fullDate, maskDmy, monthLabel, monthRange, parseDmy, parseYmd, shiftDay, shiftMonth, today, type MonthKey, type OtPerson } from '../../lib/ot';

/** longest stretch one file holds: a year of OT days is already a very wide sheet */
const MAX_DAYS = 366;

/** Monday of the week `d` falls in */
const monday = (d: string) => shiftDay(d, -((parseYmd(d).getDay() + 6) % 7));

/** quick picks: the month on screen, the one before, this / last week, the year so far */
function presets(month: MonthKey): { label: string; from: string; to: string }[] {
  const t = today();
  const prev = shiftMonth(month, -1);
  return [
    { label: monthLabel(month), ...monthRange(month) },
    { label: monthLabel(prev), ...monthRange(prev) },
    { label: 'Tuần này', from: monday(t), to: shiftDay(monday(t), 6) },
    { label: 'Tuần trước', from: shiftDay(monday(t), -7), to: shiftDay(monday(t), -1) },
    { label: 'Từ đầu năm', from: `${t.slice(0, 4)}-01-01`, to: t },
  ];
}

/** Picks the days to export — typed as dd/mm/yyyy, or a quick pick — into one sheet. */
export function OtExportDialog({ backend, month, roster, onDone, onClose }: { backend: Backend; month: MonthKey; roster: OtPerson[]; onDone: (m: string) => void; onClose: () => void }) {
  const [from, setFrom] = useState(fullDate(monthRange(month).from));
  const [to, setTo] = useState(fullDate(monthRange(month).to));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const a = parseDmy(from);
  const b = parseDmy(to);
  const days = a && b ? Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400_000) + 1 : 0;
  const problem = !a || !b ? 'Nhập ngày theo dạng dd/mm/yyyy' : a > b ? '“Từ ngày” phải trước “Đến ngày”' : days > MAX_DAYS ? `Tối đa ${MAX_DAYS} ngày một lần xuất` : '';

  const run = async () => {
    if (problem || !a || !b) return;
    setBusy(true);
    setErr('');
    try {
      const d = await backend.otList(a, b);
      // people hidden from the table still count when they have OT in the range; the export drops the rest
      const sheet = roster.filter((p) => p.active || d.entries.some((e) => e.person_id === p.id)).sort((x, y) => x.name.localeCompare(y.name, 'vi'));
      if (!d.entries.length) throw new Error('không có ai ghi OT trong khoảng này');
      const { exportOt } = await import('./otExport');
      await exportOt({ from: a, to: b, roster: sheet, entries: d.entries, labels: new Map(d.days.map((x) => [x.work_date, x.label])) });
      onDone('Đã xuất file Excel');
      onClose();
    } catch (e) {
      setErr('Không xuất được file: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // typing or pasting adds the "/"; deleting leaves the text alone, else a removed "/" would come straight back
  const box = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <Label>{label}</Label>
      <input
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="dd/mm/yyyy"
        value={value}
        onChange={(e) => set((e.nativeEvent as InputEvent).inputType?.startsWith('delete') ? e.target.value : maskDmy(e.target.value))}
        className={clsx(field, 'font-mono tabular-nums')}
      />
    </div>
  );

  return (
    <Modal
      title="Xuất Excel giờ OT"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={run} disabled={busy || !!problem}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            Xuất Excel
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {presets(month).map((p) => (
            <Button
              key={p.label}
              size="sm"
              active={parseDmy(from) === p.from && parseDmy(to) === p.to}
              onClick={() => {
                setFrom(fullDate(p.from));
                setTo(fullDate(p.to));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {box('Từ ngày', from, setFrom)}
          {box('Đến ngày', to, setTo)}
        </div>
        <p className="text-[12.5px] text-muted">
          {problem ? (
            <span className="text-error">{problem}</span>
          ) : (
            <>
              <b className="font-semibold text-fg-2">{days} ngày</b> — mỗi ngày có OT một cột; ngày có nhiều nhóm thì mỗi nhóm một cột. Khoảng qua nhiều tháng có thêm dòng tên tháng phía trên.
            </>
          )}
        </p>
        {err && <p className="text-[12.5px] text-error">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
