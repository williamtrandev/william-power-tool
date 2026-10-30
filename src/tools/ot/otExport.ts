import type { Alignment, Borders, Cell, Fill, Font } from 'exceljs';
import { dayKind, dayMonth, holidayName, monthLabel, type MonthKey, type OtEntry, type OtPerson } from '../../lib/ot';

/**
 * The month as one sheet laid out like the team's own: one column per OT day (titled), the total in yellow,
 * and under each person's hours a second row saying what they did that day.
 * exceljs is loaded on demand: it is only needed when someone exports.
 */
export async function exportOtMonth({ month, people, entries, labels }: { month: MonthKey; people: OtPerson[]; entries: OtEntry[]; labels: Map<string, string> }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'William Tool';
  wb.created = new Date();

  const byKey = new Map(entries.map((e) => [`${e.person_id}|${e.work_date}`, e]));
  const dates = [...new Set([...entries.map((e) => e.work_date), ...labels.keys()])].sort();
  const lastCol = dates.length + 2;
  const HEAD = 3;

  // sheet names cannot contain "/"
  const ws = wb.addWorksheet(`OT T${Number(month.slice(5))}-${month.slice(0, 4)}`, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: HEAD }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.getColumn(1).width = 14;
  dates.forEach((_, i) => (ws.getColumn(i + 2).width = 18));
  ws.getColumn(lastCol).width = 14;

  // title
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `BẢNG TỔNG HỢP GIỜ OT — ${monthLabel(month).toUpperCase()}`;
  title.font = { ...FONT, bold: true, size: 15, color: { argb: 'FF1F3864' } };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 26;

  // header: "26/9" with the day's title under it, like "(Dựng RL)"
  const head = ws.getRow(HEAD);
  head.height = dates.some((d) => labels.has(d) || holidayName(d)) ? 40 : 26;
  put(head.getCell(1), 'Tên', { fill: BLUE, font: WHITE_BOLD, align: CENTER });
  dates.forEach((d, i) => {
    const label = labels.get(d) ?? holidayName(d);
    const off = dayKind(d) !== 'weekday';
    put(head.getCell(i + 2), label ? `${dayMonth(d)}\n(${label})` : dayMonth(d), { fill: BLUE, font: { ...WHITE_BOLD, color: { argb: off ? 'FFFFE699' : 'FFFFFFFF' } }, align: CENTER });
  });
  put(head.getCell(lastCol), 'TỔNG (giờ)', { fill: YELLOW, font: { ...FONT, bold: true }, align: CENTER });

  // two rows per person: hours, then what they did
  people.forEach((p, i) => {
    const r = HEAD + 1 + i * 2;
    const hoursRow = ws.getRow(r);
    const noteRow = ws.getRow(r + 1);
    const band = i % 2 ? BAND : WHITE;
    const mine = entries.filter((e) => e.person_id === p.id);

    ws.mergeCells(r, 1, r + 1, 1);
    put(ws.getCell(r, 1), p.name, { fill: BLUE, font: WHITE_BOLD, align: { horizontal: 'left', vertical: 'middle', wrapText: true } });

    let lines = 1;
    dates.forEach((d, j) => {
      const e = byKey.get(`${p.id}|${d}`);
      put(hoursRow.getCell(j + 2), e?.hours ?? 0, { fill: e && dayKind(d) !== 'weekday' ? GREEN : band, font: { ...FONT, bold: !!e, color: { argb: e ? 'FF000000' : 'FFA6A6A6' } }, align: RIGHT, edge: 'top' });
      put(noteRow.getCell(j + 2), e?.note ?? '', { fill: band, font: NOTE, align: { horizontal: 'left', vertical: 'top', wrapText: true }, edge: 'bottom' });
      if (e?.note) lines = Math.max(lines, wrappedLines(e.note, 18));
    });
    hoursRow.height = 20;
    // exceljs cannot autofit, so size the note row from the longest note
    noteRow.height = lines * 14 + 3;

    ws.mergeCells(r, lastCol, r + 1, lastCol);
    const total = ws.getCell(r, lastCol);
    total.value = dates.length ? { formula: `SUM(${col(2)}${r}:${col(lastCol - 1)}${r})`, result: sum(mine) } : 0;
    put(total, total.value, { fill: YELLOW, font: { ...FONT, bold: true, size: 13, color: { argb: 'FFFF0000' } }, align: { horizontal: 'right', vertical: 'middle' } });
  });

  // team total per day
  const foot = ws.getRow(HEAD + 1 + people.length * 2);
  foot.height = 22;
  put(foot.getCell(1), 'Tổng', { fill: BLUE, font: WHITE_BOLD, align: CENTER });
  const hourRows = people.map((_, i) => HEAD + 1 + i * 2);
  for (let c = 2; c <= lastCol; c++) {
    const d = dates[c - 2];
    const result = sum(d ? entries.filter((e) => e.work_date === d) : entries);
    const cell = foot.getCell(c);
    // only the hour rows: the note rows in between are text
    cell.value = hourRows.length ? { formula: `SUM(${hourRows.map((r) => `${col(c)}${r}`).join(',')})`, result } : 0;
    put(cell, cell.value, { fill: c === lastCol ? YELLOW : BAND_STRONG, font: { ...FONT, bold: true, color: { argb: c === lastCol ? 'FFFF0000' : 'FF000000' } }, align: RIGHT });
  }

  const legend = ws.getCell(foot.number + 2, 1);
  legend.value = 'Dòng in nghiêng dưới mỗi người: nội dung công việc trong ngày. Ô xanh: OT cuối tuần / ngày lễ.';
  legend.font = { ...FONT, italic: true, size: 10, color: { argb: 'FF7F7F7F' } };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `OT_${month.slice(5)}-${month.slice(0, 4)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// look of the team's sheet
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BLUE = solid('FF4472C4');
const WHITE = solid('FFFFFFFF');
const BAND = solid('FFDCE6F1');
const BAND_STRONG = solid('FFB4C6E7');
const YELLOW = solid('FFFFFF00');
const GREEN = solid('FFC6E0B4');
const FONT: Partial<Font> = { name: 'Times New Roman', size: 12 };
const WHITE_BOLD: Partial<Font> = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
const NOTE: Partial<Font> = { ...FONT, italic: true, size: 10.5, color: { argb: 'FF404040' } };
const CENTER: Partial<Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
const RIGHT: Partial<Alignment> = { horizontal: 'right', vertical: 'middle' };
const LINE = { style: 'thin' as const, color: { argb: 'FF000000' } };
const HAIR = { style: 'hair' as const, color: { argb: 'FFA6A6A6' } };

/** edge: the hours and note rows of one person read as one cell, split by a faint line */
function put(cell: Cell, value: Cell['value'], o: { fill: Fill; font: Partial<Font>; align: Partial<Alignment>; edge?: 'top' | 'bottom' }) {
  cell.value = value;
  cell.fill = o.fill;
  cell.font = o.font;
  cell.alignment = o.align;
  const b: Partial<Borders> = { top: LINE, left: LINE, bottom: LINE, right: LINE };
  if (o.edge === 'top') b.bottom = HAIR;
  if (o.edge === 'bottom') b.top = HAIR;
  cell.border = b;
}

const sum = (list: OtEntry[]) => list.reduce((a, e) => a + e.hours, 0);

/** rough line count of a note in a column `width` characters wide */
const wrappedLines = (s: string, width: number) => s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / (width * 1.4))), 0);

/** 1 → "A", 27 → "AA" */
function col(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
