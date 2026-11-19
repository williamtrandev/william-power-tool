import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Label, Select } from '../../components/form';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { monthLabel, monthOf, monthRange, shiftMonth, today, type MonthKey, type OtPerson } from '../../lib/ot';

/** longest stretch one file holds: a year of OT days is already a very wide sheet */
const MAX_MONTHS = 12;

/** Picks the months to export: one month as before, or several in one sheet with a merged title per month. */
export function OtExportDialog({ backend, month, roster, onDone, onClose }: { backend: Backend; month: MonthKey; roster: OtPerson[]; onDone: (m: string) => void; onClose: () => void }) {
  const latest = monthOf(today()) > month ? monthOf(today()) : month;
  const options = Array.from({ length: 36 }, (_, i) => shiftMonth(latest, -i));
  const [from, setFrom] = useState(month);
  const [to, setTo] = useState(month);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const months: MonthKey[] = [];
  for (let m = from; m <= to && months.length <= MAX_MONTHS; m = shiftMonth(m, 1)) months.push(m);
  const problem = from > to ? '“Từ tháng” phải trước “Đến tháng”' : months.length > MAX_MONTHS ? `Tối đa ${MAX_MONTHS} tháng một lần xuất` : '';

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const d = await backend.otList(monthRange(from).from, monthRange(to).to);
      // people hidden from the table still count when they have OT in the range; the export drops the rest
      const sheet = roster.filter((p) => p.active || d.entries.some((e) => e.person_id === p.id)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      const { exportOt } = await import('./otExport');
      await exportOt({ months, roster: sheet, entries: d.entries, labels: new Map(d.days.map((x) => [x.work_date, x.label])) });
      onDone('Đã xuất file Excel');
      onClose();
    } catch (e) {
      setErr('Không xuất được file: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (value: MonthKey, set: (m: MonthKey) => void) => (
    <Select value={value} onChange={(e) => set(e.target.value)}>
      {options.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </Select>
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Từ tháng</Label>
            {pick(from, (m) => {
              setFrom(m);
              if (m > to) setTo(m);
            })}
          </div>
          <div>
            <Label>Đến tháng</Label>
            {pick(to, setTo)}
          </div>
        </div>
        <p className="text-[12.5px] text-muted">
          {problem ? (
            <span className="text-error">{problem}</span>
          ) : months.length > 1 ? (
            <>
              Gộp <b className="font-semibold text-fg-2">{months.length} tháng</b> vào một sheet: mỗi tháng có một ô tiêu đề gộp phía trên các ngày của tháng đó, cột tổng cộng dồn cả khoảng.
            </>
          ) : (
            'Một tháng, một sheet như trước. Chọn “Đến tháng” khác để gộp nhiều tháng.'
          )}
        </p>
        {err && <p className="text-[12.5px] text-error">{err}</p>}
      </div>
    </Modal>
  );
}
