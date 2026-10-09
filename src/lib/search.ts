import { decode, GUID_SRC, normLevel } from './parser';
import { LEVELS, SUS_MIN, type Level, type LogEntry, type LogFile } from './types';

type Term = { rx: RegExp } | { alts: string[] };

export interface Query {
  inc: Term[];
  exc: Term[];
  levels: Level[];
  trace: string | null;
  file: string | null;
  error: string | null;
  /** global, case-insensitive regex for highlighting hits */
  hl: RegExp | null;
}

export function parseQuery(q: string, regex: boolean): Query {
  const terms: string[] = [];
  const ex: string[] = [];
  const levels: Level[] = [];
  let trace: string | null = null;
  let file: string | null = null;
  let error: string | null = null;
  const re = /(-?)(?:([A-Za-z_]+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const neg = !!m[1];
    const key = (m[2] || '').toLowerCase();
    const val = m[3] ?? m[4] ?? '';
    if (!val && !m[2]) continue;
    if (key === 'level' || key === 'lv') {
      val.split(/[,|]/).forEach((v) => v && levels.push(normLevel(v)));
      continue;
    }
    if (key === 'trace' || key === 'id') {
      trace = val.toLowerCase();
      continue;
    }
    if (key === 'file') {
      file = val.toLowerCase();
      continue;
    }
    // "09:30:44" or "https://…" parse as key:value — put them back together
    (neg ? ex : terms).push(key ? m[2] + ':' + val : val);
  }
  const compile = (t: string): Term => {
    if (regex) {
      try {
        return { rx: new RegExp(t, 'i') };
      } catch (e) {
        error = (e as Error).message;
        return { rx: /(?!)/ };
      }
    }
    return { alts: t.toLowerCase().split('|').filter(Boolean) };
  };
  const inc = terms.map(compile);
  const exc = ex.map(compile);
  let hl: RegExp | null = null;
  const srcs = regex
    ? terms
    : terms
        .flatMap((t) => t.split('|'))
        .filter(Boolean)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (srcs.length && !error) {
    try {
      hl = new RegExp(srcs.map((s) => '(?:' + s + ')').join('|'), 'gi');
    } catch {
      hl = null;
    }
  }
  return { inc, exc, levels, trace, file, error, hl };
}

const matchTerm = (t: Term, lc: string) => ('rx' in t ? t.rx.test(lc) : t.alts.some((a) => lc.includes(a)));

export interface Filters {
  query: Query;
  levels: Set<Level>;
  suspiciousOnly: boolean;
  timeRange: [number, number] | null;
  sig: string | null;
  sort: 'asc' | 'desc' | 'score';
}

export interface SearchResult {
  rows: LogEntry[];
  levelCounts: Record<Level, number>;
  suspicious: number;
}

export function runSearch(entries: LogEntry[], files: LogFile[], f: Filters): SearchResult {
  const q = f.query;
  const lvSet = new Set<Level>([...f.levels, ...q.levels]);
  const levelCounts = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<Level, number>;
  const fileOn = new Map(files.map((x) => [x.id, x.on && (!q.file || x.name.toLowerCase().includes(q.file))]));
  const tr = f.timeRange;
  const rows: LogEntry[] = [];
  let suspicious = 0;
  outer: for (const e of entries) {
    if (!fileOn.get(e.f)) continue;
    if (f.suspiciousOnly && e.score < SUS_MIN) continue;
    if (tr && (e.ts == null || e.ts < tr[0] || e.ts >= tr[1])) continue;
    if (q.trace && !(e.trace && e.trace.toLowerCase().startsWith(q.trace)) && !e.lc.includes(q.trace)) continue;
    for (const t of q.inc) if (!matchTerm(t, e.lc)) continue outer;
    for (const t of q.exc) if (matchTerm(t, e.lc)) continue outer;
    if (f.sig && sigOf(e) !== f.sig) continue;
    levelCounts[e.level]++;
    if (lvSet.size && !lvSet.has(e.level)) continue;
    rows.push(e);
    if (e.score >= SUS_MIN) suspicious++;
  }
  if (f.sort === 'desc') rows.reverse();
  else if (f.sort === 'score') rows.sort((a, b) => b.score - a.score || (a.ts ?? 0) - (b.ts ?? 0));
  return { rows, levelCounts, suspicious };
}

const GUID_G = new RegExp(GUID_SRC, 'gi');
/** Normalized signature: same error with different ids/numbers groups together. */
export function sigOf(e: LogEntry): string {
  if (e.sig) return e.sig;
  return (e.sig = e.sum
    .replace(GUID_G, '‹id›')
    .replace(/\b[0-9a-f]{16,}\b/gi, '‹hex›')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '‹jwt›')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160));
}

export interface Group {
  sig: string;
  count: number;
  level: Level;
  files: number[];
  t0: number | null;
  t1: number | null;
}

export function groupSuspicious(rows: LogEntry[], limit = 80): Group[] {
  const map = new Map<string, Group & { fset: Set<number> }>();
  for (const e of rows) {
    if (e.score < SUS_MIN) continue;
    const s = sigOf(e);
    let g = map.get(s);
    if (!g) map.set(s, (g = { sig: s, count: 0, level: e.level, files: [], fset: new Set(), t0: e.ts, t1: e.ts }));
    g.count++;
    g.fset.add(e.f);
    if (LEVELS.indexOf(e.level) < LEVELS.indexOf(g.level)) g.level = e.level;
    if (e.ts != null) {
      if (g.t0 == null || e.ts < g.t0) g.t0 = e.ts;
      if (g.t1 == null || e.ts > g.t1) g.t1 = e.ts;
    }
  }
  return [...map.values()]
    .map((g) => ({ ...g, files: [...g.fset] }))
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || b.count - a.count)
    .slice(0, limit);
}

const STEPS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 10800, 21600, 43200, 86400, 604800].map((s) => s * 1000);

export interface Histogram {
  start: number;
  step: number;
  all: number[];
  bad: number[];
}

export function histogram(rows: LogEntry[], range: [number, number] | null, maxBuckets: number): Histogram | null {
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const e of rows)
    if (e.ts != null) {
      if (e.ts < t0) t0 = e.ts;
      if (e.ts > t1) t1 = e.ts;
    }
  if (range) {
    t0 = range[0];
    t1 = range[1] - 1;
  }
  if (!isFinite(t0)) return null;
  const step = STEPS.find((s) => (t1 - t0) / s < maxBuckets) ?? STEPS[STEPS.length - 1];
  const start = Math.floor(t0 / step) * step;
  const nb = Math.floor((t1 - start) / step) + 1;
  const all = new Array<number>(nb).fill(0);
  const bad = new Array<number>(nb).fill(0);
  for (const e of rows)
    if (e.ts != null) {
      const b = Math.floor((e.ts - start) / step);
      if (b >= 0 && b < nb) {
        all[b]++;
        if (e.score >= SUS_MIN) bad[b]++;
      }
    }
  return { start, step, all, bad };
}

const snipCache = new WeakMap<LogEntry, { q: RegExp; s: string }>();
/** Short excerpt around the first hit, for rows whose summary doesn't contain it. */
export function snippetOf(e: LogEntry, hl: RegExp | null): string {
  if (!hl) return '';
  const c = snipCache.get(e);
  if (c && c.q === hl) return c.s;
  let s = '';
  hl.lastIndex = 0;
  if (!hl.test(e.sum)) {
    const text = fullText(e);
    hl.lastIndex = 0;
    const m = hl.exec(text);
    if (m) {
      const a = Math.max(0, m.index - 24);
      const b = Math.min(text.length, m.index + m[0].length + 100);
      s = (a ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '');
    }
  }
  hl.lastIndex = 0;
  snipCache.set(e, { q: hl, s });
  return s;
}

export const fullText = (e: LogEntry) => e.raw.slice(0, e.head) + decode(e.raw.slice(e.head));
