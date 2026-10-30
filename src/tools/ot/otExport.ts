import type { Borders, Cell, Fill, Worksheet } from 'exceljs';
import { DAY_KIND_LABEL, dayKind, dayMonth, fullName, holidayName, monthLabel, weekdayLong, type MonthKey, type OtEntry, type OtPerson } from '../../lib/ot';

/**
 * The month as an .xlsx with three sheets:
 *  - "Tổng hợp": the team's usual sheet — one row per person, one column per OT day (titled), total in yellow
 *  - "Chi tiết": one row per person per day with what they did, filterable
 *  - "Theo người": hours split by weekday / weekend / holiday, which is what OT pay is computed from
 * exceljs is loaded on demand: it is only needed when someone exports.
 */
export async function exportOtMonth({ month, people, entries, labels }: { month: MonthKey; people: OtPerson[]; entries: OtEntry[]; labels: Map<string, string> }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'William Tool';
  wb.created = new Date();

  const byKey = new Map(entries.map((e) => [`${e.person_id}|${e.work_date}`, e]));
  const dates = [...new Set([...entries.map((e) => e.work_date), ...labels.keys()])].sort();
  const title = `BẢNG TỔNG HỢP GIỜ OT — ${monthLabel(month).toUpperCase()}`;

  // ── Tổng hợp ──
  const sum = wb.addWorksheet('Tổng hợp', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
  const lastCol = dates.length + 2;
  sum.mergeCells(1, 1, 1, lastCol);
  sum.getCell(1, 1).value = title;
  sum.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1F3864' } };
  sum.getRow(1).height = 24;

  const head = sum.getRow(3);
  head.height = dates.some((d) => labels.has(d)) ? 42 : 24;
  head.getCell(1).value = 'Tên';
  dates.forEach((d, i) => {
    const label = labels.get(d) ?? holidayName(d);
    head.getCell(i + 2).value = label ? `${dayMonth(d)}\n(${label})` : dayMonth(d);
  });
  head.getCell(lastCol).value = 'TỔNG (giờ)';
  for (let c = 1; c <= lastCol; c++) {
    const cell = head.getCell(c);
    const d = dates[c - 2];
    const special = d && dayKind(d) !== 'weekday';
    style(cell, {
      fill: c === lastCol ? YELLOW : BLUE,
      font: { bold: true, size: 12, color: { argb: c === lastCol ? 'FF000000' : special ? 'FFFFE699' : 'FFFFFFFF' } },
      align: 'center',
    });
  }

  people.forEach((p, r) => {
    const row = sum.getRow(4 + r);
    const band = r % 2 ? BAND : undefined;
    row.getCell(1).value = p.name;
    style(row.getCell(1), { fill: BLUE, font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } } });
    dates.forEach((d, i) => {
      const e = byKey.get(`${p.id}|${d}`);
      const cell = row.getCell(i + 2);
      cell.value = e?.hours ?? 0;
      if (e?.note) cell.note = e.note;
      style(cell, { fill: e && dayKind(d) !== 'weekday' ? GREEN : band, align: 'right' });
    });
    const total = row.getCell(lastCol);
    const hours = entries.filter((e) => e.person_id === p.id).reduce((a, e) => a + e.hours, 0);
    total.value = dates.length ? { formula: `SUM(${col(2)}${4 + r}:${col(lastCol - 1)}${4 + r})`, result: hours } : 0;
    style(total, { fill: YELLOW, font: { bold: true, size: 12, color: { argb: 'FFFF0000' } }, align: 'right' });
  });

  const foot = sum.getRow(4 + people.length);
  foot.getCell(1).value = 'Tổng';
  style(foot.getCell(1), { fill: BLUE, font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } } });
  for (let c = 2; c <= lastCol; c++) {
    const d = dates[c - 2];
    const hours = d ? entries.filter((e) => e.work_date === d).reduce((a, e) => a + e.hours, 0) : entries.reduce((a, e) => a + e.hours, 0);
    foot.getCell(c).value = people.length ? { formula: `SUM(${col(c)}4:${col(c)}${3 + people.length})`, result: hours } : 0;
    style(foot.getCell(c), { fill: c === lastCol ? YELLOW : BAND_STRONG, font: { bold: true, size: 12, color: { argb: c === lastCol ? 'FFFF0000' : 'FF000000' } }, align: 'right' });
  }
  sum.getColumn(1).width = 16;
  dates.forEach((d, i) => (sum.getColumn(i + 2).width = Math.max(9, Math.min(22, (labels.get(d)?.length ?? 0) + 4))));
  sum.getColumn(lastCol).width = 14;
  sum.getCell(5 + people.length, 1).value = 'Ô xanh: OT cuối tuần / ngày lễ. Di chuột vào ô để xem nội dung công việc.';
  sum.getCell(5 + people.length, 1).font = { italic: true, size: 10, color: { argb: 'FF7F7F7F' } };

  // ── Chi tiết ──
  const det = wb.addWorksheet('Chi tiết', { views: [{ state: 'frozen', ySplit: 1 }] });
  det.columns = [
    { header: 'Ngày', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Thứ', key: 'wd', width: 10 },
    { header: 'Loại ngày', key: 'kind', width: 12 },
    { header: 'Tên', key: 'short', width: 12 },
    { header: 'Họ tên', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Số giờ', key: 'hours', width: 9 },
    { header: 'Nội dung công việc', key: 'note', width: 60 },
    { header: 'Tiêu đề ngày', key: 'label', width: 22 },
    { header: 'Cập nhật bởi', key: 'by', width: 26 },
  ];
  const who = new Map(people.map((p) => [p.id, p]));
  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date) || (who.get(a.person_id)?.name ?? '').localeCompare(who.get(b.person_id)?.name ?? '', 'vi'));
  for (const e of sorted) {
    const p = who.get(e.person_id);
    const row = det.addRow({
      // a real date so the column sorts and filters as dates; exceljs writes Dates as UTC, so build it at UTC midnight
      date: new Date(e.work_date + 'T00:00:00Z'),
      wd: weekdayLong(e.work_date),
      kind: DAY_KIND_LABEL[dayKind(e.work_date)],
      short: p?.name ?? '',
      name: p ? fullName(p) : '(đã xoá)',
      email: p?.email ?? '',
      hours: e.hours,
      note: e.note,
      label: labels.get(e.work_date) ?? holidayName(e.work_date) ?? '',
      by: e.updated_by ?? '',
    });
    row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
    if (dayKind(e.work_date) !== 'weekday') row.getCell('kind').fill = GREEN;
  }
  const detTotal = det.addRow({ short: 'Tổng', hours: sorted.length ? { formula: `SUM(G2:G${sorted.length + 1})`, result: sorted.reduce((a, e) => a + e.hours, 0) } : 0 });
  detTotal.font = { bold: true };
  headerRow(det);
  det.autoFilter = { from: 'A1', to: `J${sorted.length + 1}` };

  // ── Theo người ──
  const per = wb.addWorksheet('Theo người', { views: [{ state: 'frozen', ySplit: 1 }] });
  per.columns = [
    { header: 'Tên', key: 'short', width: 12 },
    { header: 'Họ tên', key: 'name', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Số ngày OT', key: 'days', width: 12 },
    { header: 'Giờ ngày thường', key: 'weekday', width: 16 },
    { header: 'Giờ cuối tuần', key: 'weekend', width: 14 },
    { header: 'Giờ ngày lễ', key: 'holiday', width: 12 },
    { header: 'Tổng giờ', key: 'total', width: 11 },
    { header: 'TB giờ / ngày', key: 'avg', width: 13, style: { numFmt: '0.0' } },
  ];
  const stats = people
    .map((p) => {
      const mine = entries.filter((e) => e.person_id === p.id);
      const by = (k: string) => mine.filter((e) => dayKind(e.work_date) === k).reduce((a, e) => a + e.hours, 0);
      const total = mine.reduce((a, e) => a + e.hours, 0);
      return { short: p.name, name: fullName(p), email: p.email ?? '', days: mine.length, weekday: by('weekday'), weekend: by('weekend'), holiday: by('holiday'), total, avg: mine.length ? total / mine.length : 0 };
    })
    .sort((a, b) => b.total - a.total);
  stats.forEach((s) => per.addRow(s));
  const n = stats.length + 1;
  const perTotal = per.addRow({
    short: 'Tổng',
    ...Object.fromEntries((['days', 'weekday', 'weekend', 'holiday', 'total'] as const).map((k, i) => [k, { formula: `SUM(${col(4 + i)}2:${col(4 + i)}${n})`, result: stats.reduce((a, s) => a + s[k], 0) }])),
  });
  perTotal.font = { bold: true };
  per.getColumn('total').font = { bold: true, color: { argb: 'FFC00000' } };
  headerRow(per);

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `OT_${month.slice(5)}-${month.slice(0, 4)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// colours of the team's sheet
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BLUE = solid('FF4472C4');
const BAND = solid('FFDCE6F1');
const BAND_STRONG = solid('FFB4C6E7');
const YELLOW = solid('FFFFFF00');
const GREEN = solid('FFC6E0B4');
const THIN: Partial<Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

function style(cell: Cell, o: { fill?: Fill; font?: Cell['font']; align?: 'left' | 'center' | 'right' }) {
  if (o.fill) cell.fill = o.fill;
  cell.font = { size: 12, ...o.font };
  cell.border = THIN;
  cell.alignment = { horizontal: o.align ?? 'left', vertical: 'middle', wrapText: true };
}

function headerRow(ws: Worksheet) {
  const r = ws.getRow(1);
  r.height = 22;
  r.eachCell((c) => {
    c.fill = BLUE;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle' };
  });
}

/** 1 → "A", 27 → "AA" */
function col(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
