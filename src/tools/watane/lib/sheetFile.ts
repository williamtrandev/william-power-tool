import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * A table loaded from CSV or Excel. For Excel we keep the workbook and each row's sheet
 * position so the result column can be written back in place (other sheets, formats and
 * columns stay untouched).
 */
export interface Table {
  fileName: string;
  size: number;
  kind: 'csv' | 'excel';
  fields: string[];
  rows: Record<string, string>[];
  /** Excel only */
  wb?: XLSX.WorkBook;
  sheetNames?: string[];
  sheetName?: string;
  /** 0-based sheet row of the header, sheet column of the first field, sheet row of each data row */
  headerRow?: number;
  /** 0-based sheet row where the used range starts (headerRow - rangeStart = index passed to readSheet) */
  rangeStart?: number;
  firstCol?: number;
  rowNums?: number[];
}

export const isExcel = (name: string) => /\.(xlsx|xlsm|xls|xlsb|ods)$/i.test(name);
export const B64ISH = /^[A-Za-z0-9+/]{16,}={0,2}$/;
export const ACCEPT = '.csv,.xlsx,.xlsm,.xls,.xlsb,.ods,text/csv';

/** Make header names unique and non-empty ("Cột C", "Code (2)"…). */
function uniqueFields(raw: string[], firstCol: number): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, j) => {
    let name = String(h ?? '').trim() || `Cột ${XLSX.utils.encode_col(firstCol + j)}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return name;
  });
}

function readCsv(file: File): Promise<Table> {
  return new Promise((resolve, reject) =>
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const fields = r.meta.fields ?? [];
        if (!fields.length) return reject(new Error('Không đọc được header của file CSV'));
        resolve({ fileName: file.name, size: file.size, kind: 'csv', fields, rows: r.data });
      },
      error: (err) => reject(err),
    }),
  );
}

/**
 * Guess the header row: among the first rows, the first one with the most filled cells.
 * Skips title rows like "DANH SÁCH CODE" that sit above the real header.
 */
function guessHeader(aoa: string[][]): number {
  let best = -1;
  let bestN = 0;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const n = aoa[i].filter((c) => String(c).trim()).length;
    if (n > bestN) {
      best = i;
      bestN = n;
    }
  }
  return best;
}

/** Parse one sheet of a workbook into a Table. `headerAt` is a 0-based index into the sheet's used range. */
export function readSheet(t: Pick<Table, 'fileName' | 'size'> & { wb: XLSX.WorkBook }, sheetName: string, headerAt?: number): Table {
  const ws = t.wb.Sheets[sheetName];
  const base = { fileName: t.fileName, size: t.size, kind: 'excel' as const, wb: t.wb, sheetNames: t.wb.SheetNames, sheetName, rangeStart: 0 };
  if (!ws || !ws['!ref']) return { ...base, fields: [], rows: [], headerRow: 0, firstCol: 0, rowNums: [] };
  const range = XLSX.utils.decode_range(ws['!ref']);
  base.rangeStart = range.s.r;
  // raw:false → cell text as displayed, so codes like 00123 or long numbers are not mangled
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: true });
  const h = headerAt != null && headerAt >= 0 && headerAt < aoa.length ? headerAt : guessHeader(aoa);
  if (h < 0) return { ...base, fields: [], rows: [], headerRow: range.s.r, firstCol: range.s.c, rowNums: [] };
  const fields = uniqueFields(aoa[h], range.s.c);
  const rows: Record<string, string>[] = [];
  const rowNums: number[] = [];
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r.some((c) => String(c).trim())) continue;
    const o: Record<string, string> = {};
    fields.forEach((f, j) => (o[f] = String(r[j] ?? '')));
    rows.push(o);
    rowNums.push(range.s.r + i);
  }
  return { ...base, fields, rows, headerRow: range.s.r + h, firstCol: range.s.c, rowNums };
}

export async function readTable(file: File): Promise<Table> {
  if (!isExcel(file.name)) return readCsv(file);
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: false });
  const src = { fileName: file.name, size: file.size, wb };
  const sheets = wb.SheetNames.filter((n) => wb.Sheets[n]?.['!ref']).map((n) => readSheet(src, n));
  // prefer the sheet that looks like it holds encrypted codes, else the first non-empty one
  const looksEncrypted = (t: Table) =>
    t.fields.some((f) => /encrypt/i.test(f)) || t.rows.slice(0, 20).some((r) => Object.values(r).some((v) => B64ISH.test(v.trim())));
  return sheets.find(looksEncrypted) ?? sheets.find((t) => t.rows.length) ?? sheets[0] ?? readSheet(src, wb.SheetNames[0]);
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Download the table with `outCol` filled from `values` (same format as the input). */
export function exportTable(t: Table, outCol: string, values: (string | null)[], suffix: string) {
  const base = t.fileName.replace(/\.[^.]+$/, '');
  if (t.kind === 'csv' || !t.wb || !t.sheetName) {
    const data = t.rows.map((row, i) => ({ ...row, [outCol]: values[i] ?? '' }));
    const fields = t.fields.includes(outCol) ? t.fields : [...t.fields, outCol];
    // BOM so Excel opens Vietnamese text as UTF-8 (same as the script's utf-8-sig)
    save(new Blob(['﻿' + Papa.unparse({ fields, data })], { type: 'text/csv;charset=utf-8' }), `${base}${suffix}.csv`);
    return;
  }
  const ws = t.wb.Sheets[t.sheetName];
  const existing = t.fields.indexOf(outCol);
  const col = (t.firstCol ?? 0) + (existing >= 0 ? existing : t.fields.length);
  const set = (r: number, v: string) => {
    ws[XLSX.utils.encode_cell({ r, c: col })] = { t: 's', v };
  };
  set(t.headerRow ?? 0, outCol);
  t.rowNums?.forEach((r, i) => set(r, values[i] ?? ''));
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  range.e.c = Math.max(range.e.c, col);
  ws['!ref'] = XLSX.utils.encode_range(range);
  const ext = /\.xls$/i.test(t.fileName) ? 'xls' : 'xlsx';
  const out = XLSX.write(t.wb, { type: 'array', bookType: ext === 'xls' ? 'biff8' : 'xlsx' });
  save(new Blob([out], { type: 'application/octet-stream' }), `${base}${suffix}.${ext}`);
}
