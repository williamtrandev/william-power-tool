import { SUS_MIN, LEVELS, type Level, type LogEntry, type LogFile } from './types';
import { fmtTime } from './format';

/**
 * "Hành trình": everything that happened for a customer / merchant / order id across all files.
 * 1. entries whose text contains the id (whole-token match),
 * 2. widened to every entry of the same request (trace id) — the id is often only in the
 *    gateway request line while the actual failure is logged by another service,
 * 3. grouped into steps (one per request) on a timeline.
 */

export interface JourneyStep {
  key: string;
  trace: string | null;
  entries: LogEntry[];
  /** entries that contain one of the searched ids */
  hits: number;
  t0: number | null;
  t1: number | null;
  method: string | null;
  path: string | null;
  status: number | null;
  ok: boolean | null;
  level: Level;
  error: string | null;
  files: number[];
}

export interface Journey {
  ids: string[];
  steps: JourneyStep[];
  hits: number;
  entries: number;
  errors: number;
  t0: number | null;
  t1: number | null;
  files: number[];
  related: { label: string; value: string; count: number }[];
}

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

/** whole-token match so "3042" doesn't hit "13042" */
function containsToken(lc: string, id: string): boolean {
  let i = lc.indexOf(id);
  while (i >= 0) {
    if (!isWord(lc[i - 1]) && !isWord(lc[i + id.length])) return true;
    i = lc.indexOf(id, i + 1);
  }
  return false;
}

export function parseIds(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,;\n\t]+|\s{2,}/)
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length >= 2)
        .map((s) => s.toLowerCase()),
    ),
  ];
}

const HTTP = /\b(GET|POST|PUT|DELETE|PATCH)\s+(?:https?:\/\/[^\s/]+)?(\/[^\s?"']+)/i;
const PATH_ONLY = /\bhttps?\s+\S+?(\/api\/[^\s?"']+)/i;
const STATUS = /\bresponded (\d{3})\b|\s-\s(\d{3})\s|"(?:status|statusCode)"\s*:\s*(\d{3})/i;
const SUCCESS = /"success"\s*:\s*(true|false)/i;

function describe(list: LogEntry[]) {
  let method: string | null = null;
  let path: string | null = null;
  let status: number | null = null;
  let ok: boolean | null = null;
  for (const e of list) {
    if (!path) {
      const m = HTTP.exec(e.sum);
      if (m) {
        method = m[1].toUpperCase();
        path = m[2];
      } else {
        const p = PATH_ONLY.exec(e.sum);
        if (p) path = p[1];
      }
    }
    const s = STATUS.exec(e.sum);
    if (s) status = Number(s[1] ?? s[2] ?? s[3]);
    const k = SUCCESS.exec(e.sum);
    if (k) ok = k[1].toLowerCase() === 'true' && ok !== false;
  }
  return { method, path, status, ok };
}

/** "key=value" ids found in the journey's lines, to suggest widening the search */
const KV = /"?\b(merchant_?id|user_?id|customer_?id|order_?id|order_?code|transaction_?id|transfer_?code|voucher_?code|purchaser_?id|account_?id|phone(?:_?number)?|email|mobile)"?\s*[:=]\s*"?([\w.@+-]{3,60})"?/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE = /(?<![\w])(?:\+?84|0)(?:3|5|7|8|9)\d{8}(?![\w])/g;

function relatedIds(entries: LogEntry[], ids: string[]) {
  const counts = new Map<string, { label: string; value: string; count: number }>();
  const add = (label: string, value: string) => {
    const v = value.toLowerCase();
    if (ids.includes(v) || v === 'null' || v === 'undefined') return;
    const k = `${label}|${v}`;
    const c = counts.get(k);
    if (c) c.count++;
    else counts.set(k, { label, value, count: 1 });
  };
  for (const e of entries.slice(0, 3000)) {
    const t = e.lc.length > 20000 ? e.lc.slice(0, 20000) : e.lc;
    for (const m of t.matchAll(KV)) add(m[1].replace(/_/g, '').toLowerCase(), m[2]);
    for (const m of t.matchAll(EMAIL)) add('email', m[0]);
    for (const m of t.matchAll(PHONE)) add('phone', m[0]);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}

export function buildJourney(
  ids: string[],
  entries: LogEntry[],
  traceIndex: Map<string, LogEntry[]>,
  range: [number, number] | null,
  limit = 5000,
): Journey {
  const hitSet = new Set<LogEntry>();
  for (const e of entries) {
    if (range && (e.ts == null || e.ts < range[0] || e.ts >= range[1])) continue;
    for (const id of ids)
      if (containsToken(e.lc, id)) {
        hitSet.add(e);
        break;
      }
    if (hitSet.size >= limit) break;
  }

  // widen each hit to its whole request (trace)
  const groups = new Map<string, { trace: string | null; set: Set<LogEntry>; hits: number }>();
  for (const e of hitSet) {
    const key = e.trace ? `t:${e.trace.toLowerCase()}` : `e:${e.f}:${e.k}`;
    let g = groups.get(key);
    if (!g) {
      g = { trace: e.trace, set: new Set(e.trace ? (traceIndex.get(e.trace.toLowerCase()) ?? [e]) : [e]), hits: 0 };
      groups.set(key, g);
    }
    g.hits++;
  }

  const steps: JourneyStep[] = [...groups.entries()].map(([key, g]) => {
    const list = [...g.set].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || a.f - b.f || a.k - b.k);
    const d = describe(list);
    const bad = list.filter((e) => e.score >= SUS_MIN);
    let level: Level = 'OTHER';
    for (const e of list) if (LEVELS.indexOf(e.level) < LEVELS.indexOf(level)) level = e.level;
    const err = bad.sort((a, b) => b.score - a.score)[0];
    return {
      key,
      trace: g.trace,
      entries: list,
      hits: g.hits,
      t0: list[0]?.ts ?? null,
      t1: list[list.length - 1]?.ts ?? null,
      ...d,
      level,
      error: err ? err.sum : null,
      files: [...new Set(list.map((e) => e.f))],
    };
  });
  steps.sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0));

  const all = steps.flatMap((s) => s.entries);
  const isError = (s: JourneyStep) => !!s.error || (s.status != null && s.status >= 400) || s.ok === false;
  return {
    ids,
    steps,
    hits: hitSet.size,
    entries: all.length,
    errors: steps.filter(isError).length,
    t0: steps[0]?.t0 ?? null,
    t1: steps.reduce<number | null>((m, s) => (s.t1 != null && (m == null || s.t1 > m) ? s.t1 : m), null),
    files: [...new Set(all.map((e) => e.f))],
    related: relatedIds(all, ids),
  };
}

export const stepFailed = (s: JourneyStep) => !!s.error || (s.status != null && s.status >= 400) || s.ok === false;

/** Plain-text summary to paste into a ticket or a reply to the customer. */
export function journeyText(j: Journey, fileById: Map<number, LogFile>): string {
  const d = (ts: number | null) => (ts == null ? '—' : new Date(ts).toLocaleString('vi-VN'));
  const lines = [
    `Hành trình: ${j.ids.join(', ')}`,
    `Thời gian: ${d(j.t0)} → ${d(j.t1)}`,
    `Tổng: ${j.steps.length} bước, ${j.errors} bước lỗi · hệ thống: ${j.files.map((f) => fileById.get(f)?.name ?? f).join(', ')}`,
    '',
  ];
  for (const s of j.steps) {
    const what = s.path ? `${s.method ?? ''} ${s.path}`.trim() : (s.entries[0]?.sum.slice(0, 90) ?? '');
    const res = s.status ? ` → ${s.status}` : s.ok === true ? ' → OK' : s.ok === false ? ' → thất bại' : '';
    const dur = s.t0 != null && s.t1 != null && s.t1 > s.t0 ? ` (${s.t1 - s.t0} ms)` : '';
    lines.push(`- ${fmtTime(s.t0)} ${what}${res}${dur}${stepFailed(s) && s.error ? ` — LỖI: ${s.error.slice(0, 140)}` : ''}${s.trace ? ` [trace ${s.trace}]` : ''}`);
  }
  return lines.join('\n');
}
