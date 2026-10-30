import Papa from 'papaparse';

/**
 * CSV / TSV log exports (Kibana, Datadog, Graylog, CloudWatch, DB dumps…).
 * Each row becomes one entry; columns are matched by name.
 */

export interface CsvRow {
  ts: number | null;
  level: string;
  trace: string | null;
  /** message first, then the other columns as "name: value" lines */
  text: string;
  /** 1-based row number in the file (header = row 1) */
  row: number;
}

const TIME_COL = /^(@?timestamp|time|date|datetime|ts|created_?at|log_?time|event_?time|logged_?at|thời gian|ngày giờ)$/i;
const TIME_COL_LOOSE = /time|date/i;
const LEVEL_COL = /^(level|log_?level|severity|lvl|priority|status_?level|mức)$/i;
const MSG_COL = /^(message|msg|log|text|content|body|_raw|raw|description|detail|nội dung)$/i;
const TRACE_COL = /^(trace[._-]?id|request[._-]?id|correlation[._-]?id|x-request-id|traceid|requestid|span[._-]?id)$/i;

/** Parse common timestamp shapes; naive times are treated as local like the text log formats. */
export function parseTs(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{10}(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
  if (/^\d{13}$/.test(s)) return +s;
  // dd/MM/yyyy or dd-MM-yyyy [HH:mm[:ss[.fff]]]
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), m[7] ? +(m[7] + '00').slice(0, 3) : 0).getTime();
  // yyyy-MM-dd HH:mm:ss[.fff] without zone → local
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0), m[7] ? +(m[7] + '00').slice(0, 3) : 0).getTime();
  // Kibana "Oct 8, 2026 @ 08:45:06.719" and anything Date understands (ISO with zone…)
  const t = Date.parse(s.replace(/\s+@\s+/, ' '));
  return isNaN(t) ? null : t;
}

/** Match a column by full name or by its last dotted segment ("log.level" → "level", "@fields.message" → "message"). */
function pick(fields: string[], strict: RegExp, loose?: RegExp): string | undefined {
  const name = (f: string) => f.trim();
  const tail = (f: string) => f.trim().split('.').pop() ?? '';
  return (
    fields.find((f) => strict.test(name(f))) ??
    fields.find((f) => strict.test(tail(f))) ??
    (loose ? fields.find((f) => loose.test(f)) : undefined)
  );
}

/** Does this text look like a delimited table rather than a line-based log? */
export function looksLikeCsv(text: string): boolean {
  const head = text.slice(0, 20000);
  const r = Papa.parse<string[]>(head, { preview: 20, skipEmptyLines: true });
  const rows = r.data.filter((x) => Array.isArray(x));
  if (rows.length < 2 || rows[0].length < 3) return false;
  const n = rows[0].length;
  const consistent = rows.slice(1).filter((x) => x.length === n).length;
  return consistent >= Math.min(rows.length - 1, 3) && rows[0].some((h) => TIME_COL.test(h.trim()) || MSG_COL.test(h.trim()) || LEVEL_COL.test(h.trim()));
}

export function parseCsvLog(text: string, onProgress?: (p: number) => void): { rows: CsvRow[]; columns: { time?: string; level?: string; message?: string; trace?: string } } {
  const r = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' });
  const fields = (r.meta.fields ?? []).filter(Boolean);
  const data = r.data;
  const time = pick(fields, TIME_COL, TIME_COL_LOOSE);
  const level = pick(fields, LEVEL_COL);
  const trace = pick(fields, TRACE_COL);
  let message = pick(fields, MSG_COL);
  if (!message) {
    // fall back to the column with the longest text on average
    let best = 0;
    for (const f of fields) {
      if (f === time || f === level || f === trace) continue;
      const len = data.slice(0, 200).reduce((n, row) => n + (row[f]?.length ?? 0), 0);
      if (len > best) {
        best = len;
        message = f;
      }
    }
  }
  const rest = fields.filter((f) => f !== message);
  const rows: CsvRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const msg = message ? (row[message] ?? '') : '';
    const extra = rest
      .map((f) => [f, row[f]] as const)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([f, v]) => `${f}: ${v}`)
      .join('\n');
    rows.push({
      ts: time ? parseTs(row[time] ?? '') : null,
      level: level ? (row[level] ?? '') : '',
      trace: trace ? (row[trace] ?? '').trim() || null : null,
      text: extra ? `${msg}\n\n${extra}` : msg,
      row: i + 2,
    });
    if (onProgress && (i & 4095) === 0) onProgress((0.5 * i) / data.length);
  }
  return { rows, columns: { time, level, message, trace } };
}

export const fmtColumns = (c: { time?: string; level?: string; message?: string; trace?: string }) =>
  ['time', 'level', 'message', 'trace']
    .map((k) => c[k as keyof typeof c] && `${k}=${c[k as keyof typeof c]}`)
    .filter(Boolean)
    .join(', ');
