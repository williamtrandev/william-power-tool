import type { Alignment, Borders, Cell, Fill, Font } from 'exceljs';
import { dayKind, dayMonth, fullDate, holidayName, monthLabel, monthOf, monthRange, shiftMonth, type MonthKey, type OtEntry, type OtPerson } from '../../lib/ot';

/**
 * A range of days as one sheet laid out like the team's own: one column per OT day, the total in yellow, and under
 * each person's hours a second row saying what they did. The header has the date over what was done that day; a day
 * with several groups gets one column per group under a date cell merged across them. A range over several months
 * gets a row above the days naming the month.
 * exceljs is loaded on demand: it is only needed when someone exports.
 */
export async function exportOt({ from, to, roster, entries }: { from: string; to: string; roster: OtPerson[]; entries: OtEntry[] }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'William Tool';
  wb.created = new Date();

  entries = entries.filter((e) => e.work_date >= from && e.work_date <= to);
  const byKey = new Map(entries.map((e) => [`${e.person_id}|${e.work_date}|${e.task}`, e]));
  // only what has data: a column per day and group someone did OT in ('' — the day's title — first), people who did any
  const columns = [...new Map(entries.map((e) => [`${e.work_date}|${e.task}`, { d: e.work_date, task: e.task }])).values()].sort(
    (a, b) => a.d.localeCompare(b.d) || Number(!!a.task) - Number(!!b.task) || a.task.localeCompare(b.task, 'vi'),
  );
  const dates = columns.map((c) => c.d);
  const people = roster.filter((p) => entries.some((e) => e.person_id === p.id));
  // the columns of each day
  const spans = [...new Set(dates)].map((d) => ({ d, cols: dates.flatMap((x, i) => (x === d ? [i] : [])) }));
  const shared = (d: string) => dates.filter((x) => x === d).length > 1;
  // what was done: the group, else the holiday, else the note when everyone in the column wrote the same one
  const titleOf = ({ d, task }: (typeof columns)[number]) => {
    const named = task || holidayName(d);
    if (named) return named;
    const notes = new Set(entries.filter((e) => e.work_date === d && e.task === task).map((e) => e.note.trim().split('\n')[0]));
    const [only] = notes;
    return notes.size === 1 && only ? (only.length > 60 ? only.slice(0, 59) + '…' : only) : shared(d) ? 'Chung' : '';
  };
  // the date row over a row saying what was done, unless no column has anything to say
  const grouped = columns.some((c) => titleOf(c));
  const heading = (c: (typeof columns)[number]) => (grouped ? titleOf(c) : dayMonth(c.d));
  const entryAt = (p: OtPerson, j: number) => byKey.get(`${p.id}|${columns[j].d}|${columns[j].task}`);
  // what goes under the hours (with start / end times it already reads "17h30 - 19h30: Golive hệ thống A")
  const noteOf = (e: OtEntry | undefined) => e?.note ?? '';
  const lastCol = columns.length + 2;
  const months: MonthKey[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = shiftMonth(m, 1)) months.push(m);
  const first = months[0];
  const last = months[months.length - 1];
  const several = months.length > 1;
  // whole months are named as months; any other range by its days
  const wholeMonths = from === monthRange(first).from && to === monthRange(last).to;
  const period = wholeMonths ? (several ? `${monthLabel(first)} đến ${monthLabel(last)}` : monthLabel(first)) : from === to ? `ngày ${fullDate(from)}` : `${fullDate(from)} đến ${fullDate(to)}`;
  // the last header row: below the title, the month row (several months) and the date row (when days are titled)
  const HEAD = 3 + Number(several) + Number(grouped);
  const DAY = grouped ? HEAD - 1 : HEAD;
  const TOP = several ? DAY - 1 : DAY;
  const short = (m: MonthKey) => `T${Number(m.slice(5))}-${m.slice(0, 4)}`;
  const dashed = (d: string) => fullDate(d).replace(/\//g, '-');

  // sheet names cannot contain "/" and hold at most 31 characters
  const sheetName = wholeMonths ? (several ? `OT ${short(first)} đến ${short(last)}` : `OT ${short(first)}`) : from === to ? `OT ${dashed(from)}` : `OT ${dashed(from)} đến ${dashed(to)}`;
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    // no gridlines (the table draws its own) and nothing frozen: Excel draws a freeze split as a grey
    // line across the whole sheet, right through the table
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  // exceljs cannot autofit, so size every column from what it holds: wide enough for the day title
  // and for most notes on one line, capped so a long note wraps instead of making a huge column
  ws.getColumn(1).width = Math.max(10, ...people.map((p) => p.name.length * 1.15 + 3));
  const widths = columns.map((c, j) => {
    const head = Math.max(...[dayMonth(c.d), heading(c)].map((l) => l.length * 1.1 + 3));
    const notes = Math.max(0, ...people.map((p) => longestLine(noteOf(entryAt(p, j))) * 0.9 + 2));
    return Math.min(MAX_W, Math.max(9, head, notes));
  });
  widths.forEach((w, i) => (ws.getColumn(i + 2).width = w));
  ws.getColumn(lastCol).width = 13;

  // title
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `BẢNG TỔNG HỢP GIỜ OT — ${period.toUpperCase()}`;
  title.font = { ...FONT, bold: true, size: 15, color: { argb: 'FF1F3864' } };
  title.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 26;

  // header: "26/9" over what was done, like "Dựng RL"; a day with groups: "7/11" over one cell per group
  const head = ws.getRow(HEAD);
  head.height = Math.max(1, ...columns.map((c, i) => wrapped(heading(c), widths[i] / 1.1))) * 17 + 6;
  if (grouped) ws.getRow(DAY).height = 22;
  const dayFont = (d: string) => ({ ...WHITE_BOLD, color: { argb: dayKind(d) !== 'weekday' ? 'FFFFE699' : 'FFFFFFFF' } });
  for (const { d, cols } of spans) {
    const [a, b] = [cols[0] + 2, cols[cols.length - 1] + 2];
    if (DAY < HEAD && cols.length === 1 && !heading(columns[cols[0]])) {
      // nothing to say about the day: its date fills both rows
      ws.mergeCells(DAY, a, HEAD, a);
      put(ws.getCell(DAY, a), dayMonth(d), { fill: BLUE, font: dayFont(d), align: CENTER });
      cover(ws.getCell(HEAD, a), BLUE);
      continue;
    }
    if (b > a) ws.mergeCells(DAY, a, DAY, b);
    put(ws.getCell(DAY, a), dayMonth(d), { fill: BLUE, font: dayFont(d), align: CENTER });
    for (let c = a + 1; c <= b; c++) cover(ws.getCell(DAY, c), BLUE);
    if (DAY < HEAD) cols.forEach((i) => put(ws.getCell(HEAD, i + 2), heading(columns[i]), { fill: SUB, font: { ...dayFont(d), size: 11 }, align: CENTER }));
  }
  // "Tên" and the total span every header row
  for (const c of [1, lastCol]) {
    const look = c === 1 ? { fill: BLUE, font: WHITE_BOLD } : { fill: YELLOW, font: { ...FONT, bold: true } };
    if (TOP < HEAD) ws.mergeCells(TOP, c, HEAD, c);
    put(ws.getCell(TOP, c), c === 1 ? 'Tên' : 'TỔNG (giờ)', { ...look, align: CENTER });
    for (let r = TOP + 1; r <= HEAD; r++) cover(ws.getCell(r, c), look.fill);
  }
  if (several) {
    // each month's name spans its days
    ws.getRow(TOP).height = 22;
    for (const m of months) {
      const cols = dates.flatMap((d, i) => (d.startsWith(m) ? [i + 2] : []));
      if (!cols.length) continue;
      const [a, b] = [cols[0], cols[cols.length - 1]];
      if (b > a) ws.mergeCells(TOP, a, TOP, b);
      put(ws.getCell(TOP, a), monthLabel(m), { fill: NAVY, font: WHITE_BOLD, align: CENTER });
      for (let c = a + 1; c <= b; c++) cover(ws.getCell(TOP, c), NAVY);
    }
  }

  // two rows per person: hours, then what they did
  people.forEach((p, i) => {
    const r = HEAD + 1 + i * 2;
    const hoursRow = ws.getRow(r);
    const noteRow = ws.getRow(r + 1);
    const band = i % 2 ? BAND : WHITE;
    const mine = entries.filter((e) => e.person_id === p.id);

    ws.mergeCells(r, 1, r + 1, 1);
    put(ws.getCell(r, 1), p.name, { fill: BLUE, font: WHITE_BOLD, align: { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 } });
    cover(ws.getCell(r + 1, 1), BLUE);

    let lines = 1;
    dates.forEach((d, j) => {
      const e = entryAt(p, j);
      put(hoursRow.getCell(j + 2), e?.hours ?? 0, { fill: e && dayKind(d) !== 'weekday' ? GREEN : band, font: { ...FONT, bold: !!e, color: { argb: e ? 'FF000000' : 'FFA6A6A6' } }, align: RIGHT, edge: 'top' });
      put(noteRow.getCell(j + 2), noteOf(e), { fill: band, font: NOTE, align: { horizontal: 'left', vertical: 'top', wrapText: true }, edge: 'bottom' });
      const text = noteOf(e);
      if (text) lines = Math.max(lines, text.split('\n').reduce((n, l) => n + wrapped(l, widths[j] / 0.9), 0));
    });
    hoursRow.height = 20;
    // exceljs cannot autofit, so size the note row from the longest note
    noteRow.height = lines * 15 + 4;

    ws.mergeCells(r, lastCol, r + 1, lastCol);
    const total = ws.getCell(r, lastCol);
    total.value = dates.length ? { formula: `SUM(${col(2)}${r}:${col(lastCol - 1)}${r})`, result: sum(mine) } : 0;
    put(total, total.value, { fill: YELLOW, font: { ...FONT, bold: true, size: 13, color: { argb: 'FFFF0000' } }, align: { horizontal: 'center', vertical: 'middle' } });
    cover(ws.getCell(r + 1, lastCol), YELLOW);
  });

  // team total per day
  const foot = ws.getRow(HEAD + 1 + people.length * 2);
  foot.height = 22;
  put(foot.getCell(1), 'Tổng', { fill: BLUE, font: WHITE_BOLD, align: CENTER });
  const hourRows = people.map((_, i) => HEAD + 1 + i * 2);
  for (let c = 2; c <= lastCol; c++) {
    const k = columns[c - 2];
    const result = sum(k ? entries.filter((e) => e.work_date === k.d && e.task === k.task) : entries);
    const cell = foot.getCell(c);
    // only the hour rows: the note rows in between are text
    cell.value = hourRows.length ? { formula: `SUM(${hourRows.map((r) => `${col(c)}${r}`).join(',')})`, result } : 0;
    put(cell, cell.value, { fill: c === lastCol ? YELLOW : BAND_STRONG, font: { ...FONT, bold: true, color: { argb: c === lastCol ? 'FFFF0000' : 'FF000000' } }, align: c === lastCol ? CENTER : RIGHT });
  }

  const legend = ws.getCell(foot.number + 2, 1);
  legend.value = 'Dòng in nghiêng dưới mỗi người: nội dung công việc trong ngày. Ô xanh: OT cuối tuần / ngày lễ. Dưới mỗi ngày: việc làm hôm đó (ngày nhiều nhóm thì mỗi nhóm một cột).';
  legend.font = { ...FONT, italic: true, size: 10, color: { argb: 'FF7F7F7F' } };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  const name = (m: MonthKey) => `${m.slice(5)}-${m.slice(0, 4)}`;
  a.download = wholeMonths
    ? several
      ? `OT_${name(first)}_den_${name(last)}.xlsx`
      : `OT_${name(first)}.xlsx`
    : from === to
      ? `OT_${dashed(from)}.xlsx`
      : `OT_${dashed(from)}_den_${dashed(to)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// look of the team's sheet
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const BLUE = solid('FF4472C4');
/** what was done, under the date: a shade lighter than the date above it */
const SUB = solid('FF5B85D0');
const NAVY = solid('FF1F3864');
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

/**
 * Excel draws a merged range's outline from every cell in it, not just the first: give the hidden
 * cells the same fill and full border, or the merge shows the neighbouring rows' lines through it.
 */
function cover(cell: Cell, fill: Fill) {
  cell.fill = fill;
  cell.border = { top: LINE, left: LINE, bottom: LINE, right: LINE };
}

const sum = (list: OtEntry[]) => list.reduce((a, e) => a + e.hours, 0);

/** widest a day column gets (in Excel character units) before its notes wrap */
const MAX_W = 34;
const longestLine = (s: string) => Math.max(0, ...s.split('\n').map((l) => l.length));
/** lines a text takes when wrapped at `chars` characters per line, breaking at spaces like Excel */
function wrapped(text: string, chars: number): number {
  let lines = 1;
  let len = 0;
  for (const w of text.split(/\s+/)) {
    const add = (len ? 1 : 0) + w.length;
    if (len && len + add > chars) {
      lines++;
      len = w.length;
    } else len += add;
  }
  return lines;
}

/** 1 → "A", 27 → "AA" */
function col(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
