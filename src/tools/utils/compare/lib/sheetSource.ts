import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { guessHeader, isExcel, uniqueFields } from '../../lib/sheetFile';

/**
 * A file held column by column, so a million-row sheet costs one string per cell instead of a
 * row object. Excel keeps every column (re-parsing takes seconds); CSV keeps only the columns
 * being compared and streams the file again for another one (well under a second per 100 MB).
 * Lives in the compare worker.
 */
export interface Source {
  file: File;
  kind: 'csv' | 'excel';
  sheetNames: string[];
  sheetName?: string;
  /** cell text per column; for CSV only the loaded ones (see loadColumns) */
  cols: (string[] | undefined)[];
  /** the first rows, every column: header guess and header names */
  head: string[][];
  /** 1 for rows with at least one non-empty cell */
  filled: Uint8Array;
  nRows: number;
  /** 0-based sheet row / column of cols[*][0] / cols[0] */
  rangeStart: number;
  firstCol: number;
  /** index into cols[*] of the header row */
  headerAt: number;
  fields: string[];
  /** indexes of the non-blank rows below the header */
  dataRows: Int32Array;
}

/** What the UI needs to show a side (Source without the data). */
export interface SourceMeta {
  fileName: string;
  size: number;
  kind: 'csv' | 'excel';
  sheetNames: string[];
  sheetName?: string;
  fields: string[];
  rows: number;
  /** 0-based sheet row of the header and of the first used row */
  headerRow: number;
  rangeStart: number;
}

export const toMeta = (s: Source): SourceMeta => ({
  fileName: s.file.name,
  size: s.file.size,
  kind: s.kind,
  sheetNames: s.sheetNames,
  sheetName: s.sheetName,
  fields: s.fields,
  rows: s.dataRows.length,
  headerRow: s.rangeStart + s.headerAt,
  rangeStart: s.rangeStart,
});

/** Rows kept for the header: the guess looks at the first 20, a header typed by hand may sit lower. */
const HEAD_ROWS = 1000;

/** Point the source at header row `at` (guessed when missing): fields and data rows follow. */
export function setHeader(s: Source, at?: number) {
  if (at != null && at >= s.head.length) throw new Error(`Dòng header phải nằm trong ${HEAD_ROWS} dòng đầu`);
  const h = at != null && at >= 0 ? at : Math.max(0, guessHeader(s.head.slice(0, 20)));
  s.headerAt = h;
  s.fields = s.nRows ? uniqueFields(s.head[h] ?? [], s.firstCol) : [];
  const keep = new Int32Array(Math.max(0, s.nRows - h - 1));
  let n = 0;
  for (let i = h + 1; i < s.nRows; i++) if (s.filled[i]) keep[n++] = i;
  s.dataRows = keep.slice(0, n);
}

/**
 * Stream a CSV once. `want` lists the columns to keep (none on the first pass, which only
 * counts rows, notes the filled ones and keeps the first rows for the header).
 */
function streamCsv(file: File, want: number[], onProgress: (p: number) => void) {
  const cols = want.map(() => [] as string[]);
  const head: string[][] = [];
  const filled: number[] = [];
  let n = 0;
  return new Promise<{ cols: string[][]; head: string[][]; filled: Uint8Array; n: number }>((resolve, reject) =>
    Papa.parse<string[]>(file, {
      chunkSize: 4 << 20,
      chunk: (r) => {
        for (const row of r.data) {
          if (n === 0 && row[0]) row[0] = row[0].replace(/^\uFEFF/, '');
          if (n < HEAD_ROWS) head.push(row);
          if (row.some((c) => c.trim())) filled.push(n);
          for (let k = 0; k < want.length; k++) cols[k].push(row[want[k]] ?? '');
          n++;
        }
        onProgress(r.meta.cursor / (file.size || 1));
      },
      complete: () => {
        const f = new Uint8Array(n);
        for (const i of filled) f[i] = 1;
        resolve({ cols, head, filled: f, n });
      },
      error: (err) => reject(err),
    }),
  );
}

async function readCsv(file: File, onProgress: (p: number) => void): Promise<Source> {
  const { head, filled, n } = await streamCsv(file, [], onProgress);
  const s: Source = { file, kind: 'csv', sheetNames: [], cols: [], head, filled, nRows: n, rangeStart: 0, firstCol: 0, headerAt: 0, fields: [], dataRows: new Int32Array() };
  setHeader(s);
  return s;
}

/** Make sure columns `idx` are in memory; for CSV, columns not asked for are dropped. */
export async function loadColumns(s: Source, idx: number[], onProgress: (p: number) => void) {
  if (s.kind !== 'csv') return;
  const missing = idx.filter((j) => !s.cols[j]);
  s.cols = s.cols.map((c, j) => (idx.includes(j) ? c : undefined));
  if (!missing.length) return;
  const { cols } = await streamCsv(s.file, missing, onProgress);
  missing.forEach((j, k) => (s.cols[j] = cols[k]));
}

/** Parse one sheet only, dense and without styles, then keep just each cell's displayed text. */
async function readExcelSheet(file: File, sheetNames: string[], sheetName: string): Promise<Source> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true, sheets: sheetName, cellFormula: false, cellHTML: false, cellNF: false });
  const ws = wb.Sheets[sheetName];
  const s: Source = { file, kind: 'excel', sheetNames, sheetName, cols: [], head: [], filled: new Uint8Array(), nRows: 0, rangeStart: 0, firstCol: 0, headerAt: 0, fields: [], dataRows: new Int32Array() };
  const data = ws?.['!data'];
  if (!ws?.['!ref'] || !data) return s;
  const range = XLSX.utils.decode_range(ws['!ref']);
  s.rangeStart = range.s.r;
  s.firstCol = range.s.c;
  s.nRows = range.e.r - range.s.r + 1;
  s.filled = new Uint8Array(s.nRows);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const col = new Array<string>(s.nRows);
    for (let r = 0; r < s.nRows; r++) {
      // w = the text Excel shows, so codes like 00123 or long numbers are not mangled
      const cell = data[range.s.r + r]?.[c];
      const v = cell ? (cell.w ?? (cell.v == null ? '' : String(cell.v))) : '';
      col[r] = v;
      if (v.trim()) s.filled[r] = 1;
    }
    s.cols.push(col);
  }
  s.head = Array.from({ length: Math.min(s.nRows, HEAD_ROWS) }, (_, r) => s.cols.map((c) => c![r]));
  setHeader(s);
  return s;
}

/** Open a file: CSV whole, Excel at its first sheet that has data. */
export async function openSource(file: File, onProgress: (p: number) => void): Promise<Source> {
  if (!isExcel(file.name)) return readCsv(file, onProgress);
  const names = XLSX.read(await file.arrayBuffer(), { type: 'array', bookSheets: true }).SheetNames;
  let first: Source | null = null;
  for (const name of names) {
    const s = await readExcelSheet(file, names, name);
    if (s.dataRows.length) return s;
    first ??= s;
  }
  return first ?? readExcelSheet(file, names, names[0]);
}

export const openSheet = (s: Source, sheetName: string) => readExcelSheet(s.file, s.sheetNames, sheetName);
