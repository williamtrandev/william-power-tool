import { fmtColumns, looksLikeCsv, parseCsvLog } from './csvLog';
import type { Level, LogEntry, ParseResult, ResumeFrom } from './types';

export const GUID_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const GUID_START = new RegExp('^(' + GUID_SRC + ')\\b', 'i');
const REQ_GUID = new RegExp('^(?:request|response)\\s+(' + GUID_SRC + ')\\b', 'i');
const KV_TRACE =
  /["']?\b(?:trace[_-]?id|request[_-]?id|correlation[_-]?id|x-request-id|traceid|requestid)["']?\s*[:=]\s*["']?([\w.:-]{6,})/i;

export function normLevel(l: string | undefined | null): Level {
  const s = String(l || '').toUpperCase();
  if (/^(FTL|FATAL|CRIT|EMERG|ALERT|PANIC)/.test(s)) return 'FATAL';
  if (/^(ERR|EXC)/.test(s)) return 'ERROR';
  if (/^(WRN|WARN)/.test(s)) return 'WARN';
  if (/^(INF|NOTICE|NTC)/.test(s)) return 'INFO';
  if (/^(DBG|DEBUG)/.test(s)) return 'DEBUG';
  if (/^(VRB|VERBOSE|TRC|TRACE)/.test(s)) return 'TRACE';
  return 'OTHER';
}

function mk(y: string, mo: string, d: string, h: string, mi: string, s: string, ms?: string) {
  return new Date(+y, +mo - 1, +d, +h, +mi, +s, ms ? +(ms + '00').slice(0, 3) : 0).getTime();
}

interface RegexFormat {
  id: string;
  name: string;
  re: RegExp;
  ts: (m: RegExpExecArray) => number;
  lv: (m: RegExpExecArray) => string;
  json?: false;
}
interface JsonFormat {
  id: 'json';
  name: string;
  json: true;
}
type Format = RegexFormat | JsonFormat;

const LV_WORDS = '(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|FATAL|CRITICAL|INF|WRN|ERR|DBG|FTL|VRB|EXC)';
const isoTs = (m: RegExpExecArray) => mk(m[1], m[2], m[3], m[4], m[5], m[6], m[7]);

const FORMATS: Format[] = [
  {
    id: 'laravel',
    name: 'Laravel',
    re: /^\[(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:\.(\d+))?[^\]]*\] ([\w-]+)\.(\w+): ?/,
    ts: isoTs,
    lv: (m) => m[9],
  },
  {
    id: 'dmy',
    name: '.NET',
    re: /^\[(\d\d)[-/.](\d\d)[-/.](\d{4}) (\d\d):(\d\d):(\d\d)(?:[.,](\d+))? ([A-Za-z]{3,11})\] ?/,
    ts: (m) => mk(m[3], m[2], m[1], m[4], m[5], m[6], m[7]),
    lv: (m) => m[8],
  },
  {
    id: 'serilog',
    name: 'Serilog',
    re: /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:[.,](\d+))?(?: ?(?:[+-]\d\d:?\d\d|Z))? \[([A-Za-z]{3,11})\] ?/,
    ts: isoTs,
    lv: (m) => m[8],
  },
  {
    id: 'iso-level',
    name: 'ISO + level',
    re: new RegExp(
      '^\\[?(\\d{4})-(\\d\\d)-(\\d\\d)[ T](\\d\\d):(\\d\\d):(\\d\\d)(?:[.,](\\d+))?(?:Z|[+-]\\d\\d:?\\d\\d)?\\]?\\s+[\\[(]?' +
        LV_WORDS +
        '[\\])]?:?\\s*',
      'i',
    ),
    ts: isoTs,
    lv: (m) => m[8],
  },
  {
    id: 'iso',
    name: 'ISO time',
    re: /^\[?(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)(?:[.,](\d+))?\S*\]?\s*/,
    ts: isoTs,
    lv: () => '',
  },
  { id: 'json', name: 'JSON lines', json: true },
];

function jsonLine(line: string): Record<string, unknown> | null {
  if (line.charCodeAt(0) !== 123) return null;
  try {
    const o = JSON.parse(line);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function detectFormat(lines: string[]): Format | null {
  let best: Format | null = null;
  let bestN = 0;
  const sample = lines.slice(0, 800);
  for (const f of FORMATS) {
    let n = 0;
    for (const l of sample) if (f.json ? jsonLine(l) : f.re.test(l)) n++;
    if (n > bestN) {
      best = f;
      bestN = n;
    }
  }
  return best;
}

/** Decode JSON-escaped text so "Ch\\u1eef k\\u00fd" becomes readable & searchable. */
export function decode(s: string): string {
  if (s.indexOf('\\') < 0) return s;
  return s
    .replace(/\\+u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\+([/"])/g, '$1')
    .replace(/\\+r\\+n|\\+n(?=#\d)/g, '\n')
    .replace(/\\{2,}/g, '\\');
}

const SUS_RULES: [RegExp, number, string][] = [
  [/exception|\[stacktrace\]|stack ?trace|\n\s+at [\w.$<>`]+[.(]|\n#\d+ [/[{]/, 30, 'exception'],
  [/timed? ?out|timeout|refused|unreachable|could not|couldn't|cannot|can't connect|unable to|không thể/, 25, 'timeout / kết nối'],
  [/on null|nullreference|null reference|object reference not set|undefined (?:index|array key|variable|offset|property|method)/, 30, 'null / undefined'],
  [/sqlstate|deadlock|duplicate entry|syntax error|integrity constraint/, 30, 'database'],
  [/"success"\s*:\s*false|"(?:status|ok)"\s*:\s*false|"retstatus"\s*:\s*[^01]/, 25, 'success: false'],
  [/\b(?:fail(?:ed|ure|s)?|errors?|lỗi|thất bại)\b/, 20, 'từ khoá lỗi'],
  [/unauthori[sz]ed|forbidden|denied|not matched|invalid|_failed|\bexpired\b|không hợp lệ|không phù hợp/, 15, 'auth / invalid'],
];
const HTTP_STATUS = /(?:\bresponded|\bstatus(?:code|_code)?["']?\s*[:=]|\s-)\s*([45]\d\d)\b/;
const LV_SCORE: Partial<Record<Level, number>> = { FATAL: 100, ERROR: 80, WARN: 40 };

export type Reason = [label: string, weight: number];

export function scoreOf(level: Level, lcMsg: string, reasons?: Reason[]): number {
  let s = LV_SCORE[level] || 0;
  if (reasons && s) reasons.push(['level ' + level, s]);
  const t = lcMsg.length > 12000 ? lcMsg.slice(0, 12000) : lcMsg;
  for (const [re, w, name] of SUS_RULES)
    if (re.test(t)) {
      s += w;
      reasons?.push([name, w]);
    }
  const hm = HTTP_STATUS.exec(t);
  if (hm) {
    const w = hm[1][0] === '5' ? 45 : 25;
    s += w;
    reasons?.push(['HTTP ' + hm[1], w]);
  }
  return s;
}

function summarize(dec: string): string {
  const head = dec.length > 20000 ? dec.slice(0, 20000) : dec;
  const extras: string[] = [];
  const kre = /"(code|message|error|error_message|errorMessage|exception)"\s*:\s*"([^"]{1,160})"/gi;
  let m: RegExpExecArray | null;
  while ((m = kre.exec(head)) && extras.length < 2) extras.push(m[1] + ': ' + m[2]);
  // Request dumps (e.g. Laravel app.requests): "label · METHOD /path" instead of raw JSON braces.
  const um = /"(?:url|uri|path|endpoint)"\s*:\s*"([^"]{1,300})"/i.exec(head);
  const mm = /"(?:method|http_method)"\s*:\s*"(\w{3,7})"/i.exec(head);
  const brace = dec.indexOf('{');
  if (um && brace >= 0 && brace < 80) {
    const label = dec.slice(0, brace).trim();
    const path = um[1].replace(/^\w+:\/\/[^/]+/, '') || um[1];
    return [label, (mm ? mm[1].toUpperCase() + ' ' : '') + path, ...extras].filter(Boolean).join(' · ');
  }
  let out = '';
  let i = 0;
  for (const l of dec.split('\n', 12)) {
    const t = l.trim();
    // a blank line ends the headline (CSV rows put "column: value" lines after one)
    if (!t) {
      if (out) break;
      continue;
    }
    out += (out ? ' ' : '') + t;
    if (out.length > 120 || ++i > 6) break;
  }
  out = out.replace(/\s+/g, ' ');
  // only prefix code/message extras that are not already in the (untruncated) headline
  const whole = out;
  if (out.length > 300) out = out.slice(0, 300);
  const ex = extras.filter((x) => !whole.includes(x.slice(x.indexOf(': ') + 2)));
  if (ex.length) out = ex.join(' · ') + '  ⟵  ' + out;
  return out;
}

/** Derive everything search/list needs from the entry text; the text itself is then dropped. */
function finalize(e: LogEntry, raw: string, msg: string) {
  const dec = decode(msg);
  const lcMsg = dec.toLowerCase();
  e.score = scoreOf(e.level, lcMsg);
  e.sum = summarize(dec);
  e.lc = raw.slice(0, e.head).toLowerCase() + lcMsg;
  if (!e.trace) {
    const first = dec.slice(0, 400);
    const m = GUID_START.exec(first) || REQ_GUID.exec(first) || KV_TRACE.exec(dec.length > 4000 ? dec.slice(0, 4000) : dec);
    if (m) e.trace = m[1];
  }
  if (e.trace && e.sum.startsWith(e.trace)) e.sum = e.sum.slice(e.trace.length).trim();
}

/* Request blocks (ASP.NET style): attach the request id to surrounding lines that lack one. */
const REQ_START = /^request starting\b/i;
const REQ_END = /^(?:request finished\b|http \w+ \S+ responded \d{3})/i;
const NOT_REQ = /(?:job|worker|hosted service)\b/i;

export function inferTraces(list: LogEntry[]) {
  let inReq = false;
  let cur: string | null = null;
  let pending: LogEntry[] = [];
  let t0 = 0;
  for (const e of list) {
    const first = e.sum;
    if (REQ_START.test(first)) {
      inReq = true;
      cur = null;
      pending = [e];
      t0 = e.ts || 0;
      continue;
    }
    if (!inReq) continue;
    if (e.ts && t0 && e.ts - t0 > 120000) {
      inReq = false;
      cur = null;
      pending = [];
      continue;
    }
    if (e.trace && !e.ti) {
      for (const p of pending)
        if (!p.trace) {
          p.trace = e.trace;
          p.ti = true;
        }
      pending = [];
      cur = e.trace;
    } else if (!NOT_REQ.test(first)) {
      if (cur) {
        e.trace = cur;
        e.ti = true;
      } else if (pending.length < 40) pending.push(e);
    }
    if (REQ_END.test(first)) {
      inReq = false;
      cur = null;
      pending = [];
    }
  }
}

function newEntry(f: number, ln: number, bs: number, head: number, ts: number | null, level: Level, trace: string | null = null): LogEntry {
  return { f, k: 0, ln, bs, be: bs, head, ts, level, trace, score: 0, sum: '', lc: '' };
}

const LEVEL_IN_TEXT = /\b(fatal|critical|error|exception|warn(?:ing)?|info|debug|trace)\b/i;

function parseCsvText(text: string, fileId: number, onProgress?: (p: number) => void): ParseResult {
  const { rows, columns } = parseCsvLog(text, onProgress);
  let lastTs: number | null = null;
  const list = rows.map((r, k) => {
    const lv = r.level || (LEVEL_IN_TEXT.exec(r.text.slice(0, 120)) || [])[1] || '';
    const e = newEntry(fileId, r.row, 0, 0, r.ts, normLevel(lv), r.trace);
    e.text = r.text;
    e.k = k;
    if (e.ts == null) e.ts = lastTs;
    else lastTs = e.ts;
    finalize(e, r.text, r.text);
    if (onProgress && (k & 2047) === 0) onProgress(0.5 + (0.5 * k) / rows.length);
    return e;
  });
  return { format: 'CSV', fmtId: 'csv', note: 'Cột: ' + (fmtColumns(columns) || 'không nhận ra cột nào'), lines: rows.length + 1, entries: list };
}

/**
 * Read a Blob line by line with exact byte offsets, a chunk at a time — the whole file is
 * never materialised as one string (that is what made 300MB logs crash the tab).
 */
async function eachLine(blob: Blob, from: number, onLine: (line: string, start: number, end: number) => void, onBytes?: (done: number) => void) {
  const reader = blob.slice(from).stream().getReader();
  const dec = new TextDecoder();
  let carry = new Uint8Array(0);
  let base = from; // file offset of carry[0]
  const emit = (buf: Uint8Array, s: number, nl: number) => {
    let e = nl;
    if (e > s && buf[e - 1] === 13) e--; // CRLF
    onLine(dec.decode(buf.subarray(s, e)), base + s, base + nl + 1);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    let buf: Uint8Array;
    if (carry.length) {
      buf = new Uint8Array(carry.length + value.length);
      buf.set(carry);
      buf.set(value, carry.length);
    } else buf = value;
    let s = 0;
    for (let nl = buf.indexOf(10); nl !== -1; nl = buf.indexOf(10, s)) {
      emit(buf, s, nl);
      s = nl + 1;
    }
    carry = buf.slice(s);
    base += s;
    onBytes?.(base - from);
  }
  if (carry.length) {
    let e = carry.length;
    if (carry[e - 1] === 13) e--;
    onLine(dec.decode(carry.subarray(0, e)), base, base + carry.length);
  }
}

const FMT_BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
const SAMPLE = 512 * 1024;

export interface ParseOptions {
  fileId: number;
  name?: string;
  /** continue a growing file from its last entry */
  from?: ResumeFrom;
  /**
   * Receive entries in batches while parsing, so the worker never holds the whole result
   * (and the final copy to the page doesn't double memory). Callers run inferTraces themselves.
   */
  onBatch?: (entries: LogEntry[]) => void;
}

const BATCH = 4000;

export async function parseBlob(blob: Blob, o: ParseOptions, onProgress?: (p: number) => void): Promise<ParseResult> {
  const { fileId } = o;
  let fmt: Format | null;
  let fmtId: string;
  if (o.from) {
    fmtId = o.from.fmtId;
    fmt = FMT_BY_ID.get(fmtId) ?? null;
  } else {
    if (/\.(csv|tsv)$/i.test(o.name ?? '')) return parseCsvText(await blob.text(), fileId, onProgress);
    const sample = await blob.slice(0, SAMPLE).text();
    const sampleLines = sample.split(/\r?\n/);
    if (blob.size > SAMPLE) sampleLines.pop(); // cut mid-line
    fmt = detectFormat(sampleLines);
    // a CSV whose first column is a timestamp also matches the loose "ISO time" format
    if ((!fmt || fmt.id === 'iso') && looksLikeCsv(sample)) return parseCsvText(await blob.text(), fileId, onProgress);
    fmtId = fmt ? fmt.id : 'plain';
  }

  const from = o.from?.byte ?? 0;
  const total = Math.max(1, blob.size - from);
  const list: LogEntry[] = [];
  let k = o.from?.k ?? 0;
  let ln = (o.from?.ln ?? 1) - 1;
  let lastTs = o.from?.lastTs ?? null;
  let cur: LogEntry | null = null;
  let curLines: string[] = [];

  const push = () => {
    if (!cur) return;
    const raw = curLines.join('\n').replace(/\s+$/, '');
    cur.k = k++;
    if (cur.ts == null) cur.ts = lastTs;
    else lastTs = cur.ts;
    finalize(cur, raw, fmt?.json ? raw : raw.slice(cur.head));
    list.push(cur);
    cur = null;
    curLines = [];
    if (o.onBatch && list.length >= BATCH) o.onBatch(list.splice(0));
  };
  const begin = (e: LogEntry, line: string, end: number) => {
    push();
    e.be = end;
    cur = e;
    curLines = [line];
  };
  const cont = (line: string, end: number) => {
    cur!.be = end;
    curLines.push(line);
  };

  await eachLine(
    blob,
    from,
    (line, start, end) => {
      ln++;
      if (ln === 1) line = line.replace(/^\ufeff/, '');
      if (fmt?.json) {
        const obj = jsonLine(line);
        if (obj) {
          const tsv = (obj['@t'] ?? obj.timestamp ?? obj.time ?? obj.ts ?? obj['@timestamp'] ?? obj.date) as unknown;
          const ts = typeof tsv === 'number' ? (tsv < 1e12 ? tsv * 1000 : tsv) : Date.parse(String(tsv));
          const tr = obj.trace_id ?? obj.traceId ?? obj.TraceId ?? obj.request_id ?? obj.requestId ?? obj.RequestId ?? obj.correlation_id;
          const lv = normLevel(String(obj['@l'] ?? obj.level ?? obj.severity ?? obj.lvl ?? obj.levelname ?? 'INFO'));
          begin(newEntry(fileId, ln, start, 0, isNaN(ts) ? null : ts, lv, tr ? String(tr) : null), line, end);
        } else if (cur) cont(line, end);
        else if (line.trim()) begin(newEntry(fileId, ln, start, 0, null, 'OTHER'), line, end);
      } else if (fmt) {
        const m = fmt.re.exec(line);
        if (m) {
          let lv = fmt.lv(m);
          if (!lv) {
            const lm = LEVEL_IN_TEXT.exec(line.slice(m[0].length, m[0].length + 60));
            lv = lm ? lm[1] : '';
          }
          begin(newEntry(fileId, ln, start, m[0].length, fmt.ts(m), normLevel(lv)), line, end);
        } else if (cur) cont(line, end);
        else if (line.trim()) begin(newEntry(fileId, ln, start, 0, null, 'OTHER'), line, end);
      } else if (line.trim()) {
        begin(newEntry(fileId, ln, start, 0, null, normLevel((/\b(fatal|error|warn|info|debug)\b/i.exec(line) || [])[1])), line, end);
      }
    },
    (done) => onProgress?.(done / total),
  );
  push();
  if (!o.onBatch) inferTraces(list);
  return { format: fmt ? fmt.name : 'Plain text', fmtId, lines: ln, entries: list };
}

/** Parse the JSON payload embedded in a log message, unwrapping JSON-in-string values. */
export function embeddedJson(raw: string): object | null {
  const i = raw.indexOf('{');
  const j = raw.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  const cand = raw.slice(i, j + 1);
  let obj: unknown = null;
  for (const c of [cand, cand.replace(/\r?\n/g, '\\n')]) {
    try {
      obj = JSON.parse(c);
      break;
    } catch {
      /* try next */
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const deep = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const t = v.trim();
      if ((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']'))) {
        try {
          return deep(JSON.parse(t));
        } catch {
          /* keep string */
        }
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const k in v as Record<string, unknown>) o[k] = deep((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return deep(obj) as object;
}
