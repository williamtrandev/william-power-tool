import clsx from 'clsx';
import { CalendarRange, FileSpreadsheet, Loader2, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fieldSm, Label } from '../../components/form';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { fmtHours, fullDate, maskDmy, monthLabel, monthRange, parseDmy, parseYmd, shiftDay, shiftMonth, today, weekdayLong, type MonthKey, type OtEntry, type OtPerson } from '../../lib/ot';
import { RangeCalendar } from './RangeCalendar';

/** longest stretch one file holds: a year of OT days is already a very wide sheet */
const MAX_DAYS = 366;

/** Monday of the week `d` falls in */
const monday = (d: string) => shiftDay(d, -((parseYmd(d).getDay() + 6) % 7));
const span = (a: string, b: string) => Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400_000) + 1;

type Preset = { id: string; label: string; from: string; to: string };
/** quick picks: the month on screen, the one before, this / last week, the year so far */
function presets(month: MonthKey): Preset[] {
  const t = today();
  const prev = shiftMonth(month, -1);
  return [
    { id: 'month', label: monthLabel(month), ...monthRange(month) },
    { id: 'prev', label: monthLabel(prev), ...monthRange(prev) },
    { id: 'week', label: 'Tuần này', from: monday(t), to: shiftDay(monday(t), 6) },
    { id: 'lastweek', label: 'Tuần trước', from: shiftDay(monday(t), -7), to: shiftDay(monday(t), -1) },
    { id: 'year', label: 'Từ đầu năm', from: `${t.slice(0, 4)}-01-01`, to: t },
  ];
}

/**
 * Picks the days to export: a quick pick, shown as a fixed range, or "Tuỳ chọn" — a calendar to drag out a range on
 * (days with OT dotted) plus two dd/mm/yyyy fields. Below, what the file will hold, so an empty range is caught
 * before exporting.
 */
export function OtExportDialog({ backend, month, roster, onDone, onClose }: { backend: Backend; month: MonthKey; roster: OtPerson[]; onDone: (m: string) => void; onClose: () => void }) {
  const quick = useMemo(() => presets(month), [month]);
  const [mode, setMode] = useState<string>('month');
  const [from, setFrom] = useState<string | null>(quick[0].from);
  const [to, setTo] = useState<string | null>(quick[0].to);
  // the typed fields of "Tuỳ chọn"; a valid date there moves the range
  const [fromText, setFromText] = useState(fullDate(quick[0].from));
  const [toText, setToText] = useState(fullDate(quick[0].to));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
    setFromText(fullDate(a));
    setToText(fullDate(b));
  };
  const choose = (p: Preset | null) => {
    setMode(p?.id ?? 'custom');
    if (p) pick(p.from, p.to);
  };

  // OT rows by month, fetched once each: the calendar dots and the summary come from them
  const [byMonth, setByMonth] = useState<Record<MonthKey, OtEntry[]>>({});
  const asked = useRef(new Set<MonthKey>());
  const need = useCallback(
    (m: MonthKey) => {
      if (asked.current.has(m)) return;
      asked.current.add(m);
      const { from: a, to: b } = monthRange(m);
      backend
        .otList(a, b)
        .then((d) => setByMonth((x) => ({ ...x, [m]: d.entries })))
        // a failed month is asked again next time it is needed
        .catch(() => asked.current.delete(m));
    },
    [backend],
  );
  const months = useMemo(() => {
    if (!from || !to || from > to || span(from, to) > MAX_DAYS) return [];
    const list: MonthKey[] = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, 1)) list.push(m);
    return list;
  }, [from, to]);
  useEffect(() => months.forEach(need), [months, need]);
  const pending = months.some((m) => !byMonth[m]);
  const inRange = months.flatMap((m) => byMonth[m] ?? []).filter((e) => !!from && !!to && e.work_date >= from && e.work_date <= to);
  const marked = useMemo(() => new Set(Object.values(byMonth).flat().map((e) => e.work_date)), [byMonth]);
  const stats = {
    days: new Set(inRange.map((e) => e.work_date)).size,
    people: new Set(inRange.map((e) => e.person_id)).size,
    hours: inRange.reduce((a, e) => a + e.hours, 0),
    groups: new Set(inRange.filter((e) => e.task).map((e) => e.task)).size,
  };

  const problem = !from || !to ? 'Nhập ngày theo dạng dd/mm/yyyy' : from > to ? '“Từ ngày” phải trước “Đến ngày”' : span(from, to) > MAX_DAYS ? `Tối đa ${MAX_DAYS} ngày một lần xuất` : '';
  const empty = !problem && !pending && !inRange.length;

  const run = async () => {
    if (problem || empty || !from || !to) return;
    setBusy(true);
    setErr('');
    try {
      const d = await backend.otList(from, to);
      // people hidden from the table still count when they have OT in the range; the export drops the rest
      const sheet = roster.filter((p) => p.active || d.entries.some((e) => e.person_id === p.id)).sort((x, y) => x.name.localeCompare(y.name, 'vi'));
      if (!d.entries.length) throw new Error('không có ai ghi OT trong khoảng này');
      const { exportOt } = await import('./otExport');
      await exportOt({ from, to, roster: sheet, entries: d.entries });
      onDone('Đã xuất file Excel');
      onClose();
    } catch (e) {
      setErr('Không xuất được file: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // typing or pasting adds the "/"; deleting leaves the text alone, else a removed "/" would come straight back
  const box = (label: string, value: string, set: (v: string) => void, apply: (d: string | null) => void) => (
    <div>
      <Label compact>{label}</Label>
      <input
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="dd/mm/yyyy"
        value={value}
        onChange={(e) => {
          const v = (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ? e.target.value : maskDmy(e.target.value);
          set(v);
          apply(parseDmy(v));
        }}
        aria-invalid={value.length >= 8 && !parseDmy(value)}
        className={clsx(fieldSm, 'font-mono tabular-nums')}
      />
    </div>
  );
  const custom = mode === 'custom';
  const chip = (key: string, active: boolean, onClick: () => void, children: ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
        active ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );

  return (
    <Modal
      title="Xuất Excel giờ OT"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={run} disabled={busy || !!problem || empty || pending}>
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
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-fg-2">Khoảng thời gian</p>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((p) => chip(p.id, mode === p.id, () => choose(p), p.label))}
            {chip(
              'custom',
              custom,
              () => choose(null),
              <>
                <CalendarRange size={14} /> Tuỳ chọn
              </>,
            )}
          </div>
        </div>

        {custom ? (
          <div className="rounded-xl border border-line p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {box('Từ ngày', fromText, setFromText, setFrom)}
              {box('Đến ngày', toText, setToText, setTo)}
            </div>
            <RangeCalendar from={from} to={to} onPick={pick} marked={marked} onMonth={need} />
          </div>
        ) : (
          from &&
          to && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/50 px-3 py-2.5">
              <CalendarRange size={18} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px] font-semibold text-fg tabular-nums">
                  {fullDate(from)} <span className="text-faint">→</span> {fullDate(to)}
                </p>
                <p className="text-[12px] text-muted">
                  {weekdayLong(from)} → {weekdayLong(to)} · {span(from, to)} ngày
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => choose(null)}>
                <Pencil size={13} /> Đổi ngày
              </Button>
            </div>
          )
        )}

        {problem ? (
          <p className="text-[12.5px] text-error">{problem}</p>
        ) : (
          <div className={clsx('rounded-xl border px-3 py-2.5', empty ? 'border-warn/40 bg-warn/5' : 'border-accent/25 bg-accent-soft/40')}>
            <p className="mb-1.5 text-[11.5px] font-medium text-muted">File sẽ gồm</p>
            {pending ? (
              <p className="flex items-center gap-2 text-[12.5px] text-muted">
                <Loader2 size={14} className="animate-spin" /> Đang đếm…
              </p>
            ) : empty ? (
              <p className="text-[12.5px] text-warn">Không ai ghi OT trong khoảng này — chọn khoảng khác.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    [stats.days, 'ngày có OT'],
                    [stats.people, 'người'],
                    [fmtHours(stats.hours), 'giờ'],
                    [stats.groups, 'nhóm'],
                  ] as const
                ).map(([v, unit]) => (
                  <p key={unit} className="text-[12px] text-muted">
                    <b className="block font-mono text-[17px] font-semibold text-fg tabular-nums">{v}</b>
                    {unit}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {err && <p className="text-[12.5px] text-error">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
