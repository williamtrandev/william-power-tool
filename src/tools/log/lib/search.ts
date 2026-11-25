import { GUID_SRC, normLevel } from './parser';
import { decodedText } from './rawCache';
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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `"key": value` as written in JSON, whatever the spacing: `"success": true` matches `"success":true` too.
 * A quoted value is matched whole; a bare one (true, 2, null) not as the start of a longer word.
 */
function jsonField(key: string, val: string): string {
  const v = val.startsWith('"') ? esc(val) : '"?' + esc(val) + '(?![\\w.])';
  return '"' + esc(key) + '"\\s*:\\s*' + v;
}

/** one thing to look for: plain text, or (`"key": value`) a regex source */
type Atom = { text: string } | { src: string };

export function parseQuery(q: string, regex: boolean): Query {
  // each term is a list of alternatives (a|b, a OR b); all terms must match (AND)
  const terms: Atom[][] = [];
  const ex: Atom[][] = [];
  const levels: Level[] = [];
  let trace: string | null = null;
  let file: string | null = null;
  let error: string | null = null;
  let or = false;
  // a regex is taken as typed: `"(code|message)": "[^"]+` is not a JSON field (its groups 2–3 never match, so
  // both patterns keep the same group numbers)
  const re = regex
    ? /(-?)(?:(?!)()())?(?:([A-Za-z_]+):)?(?:"([^"]*)"|(\S+))/g
    : /(-?)(?:"([^"]+)"\s*:\s*("[^"]*"|[^\s"|]+)|(?:([A-Za-z_]+):)?(?:"([^"]*)"|(\S+)))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const neg = !!m[1];
    let atoms: Atom[];
    if (m[2] != null) atoms = [{ src: jsonField(m[2], m[3]) }];
    else {
      const key = (m[4] || '').toLowerCase();
      const val = m[5] ?? m[6] ?? '';
      if (!val && !m[4]) continue;
      // AND / OR between words, as people type them in other log viewers (a quoted "and" is still a word)
      if (m[6] != null && !key && !neg) {
        if (/^(and|&&)$/i.test(val)) continue;
        if (/^(or|\|\|)$/i.test(val)) {
          or = terms.length > 0;
          continue;
        }
      }
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
      const t = key ? m[4] + ':' + val : val;
      atoms = regex ? [{ src: t }] : t.split('|').filter(Boolean).map((text) => ({ text }));
    }
    if (neg) ex.push(atoms);
    else if (or) terms[terms.length - 1].push(...atoms);
    else terms.push(atoms);
    or = false;
  }
  const srcOf = (a: Atom) => ('src' in a ? a.src : esc(a.text));
  const compile = (atoms: Atom[]): Term => {
    if (atoms.every((a) => 'text' in a)) return { alts: atoms.map((a) => (a as { text: string }).text.toLowerCase()) };
    try {
      return { rx: new RegExp(atoms.map((a) => '(?:' + srcOf(a) + ')').join('|'), 'i') };
    } catch (e) {
      error = (e as Error).message;
      return { rx: /(?!)/ };
    }
  };
  const inc = terms.map(compile);
  const exc = ex.map(compile);
  let hl: RegExp | null = null;
  const srcs = terms.flat().map(srcOf);
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

/** Does the one-line summary already show a search hit? (then no snippet is needed) */
export function sumHasHit(e: LogEntry, hl: RegExp | null): boolean {
  if (!hl) return true;
  hl.lastIndex = 0;
  const r = hl.test(e.sum);
  hl.lastIndex = 0;
  return r;
}

const snipCache = new WeakMap<LogEntry, { q: RegExp; s: string }>();
/** Short excerpt around the first hit in the entry text (read lazily from the file). */
export function snippetOf(e: LogEntry, hl: RegExp | null, raw: string | null): string {
  if (!hl || raw == null) return '';
  const c = snipCache.get(e);
  if (c && c.q === hl) return c.s;
  const text = decodedText(raw, e.head);
  hl.lastIndex = 0;
  const m = hl.exec(text);
  hl.lastIndex = 0;
  let s = '';
  if (m) {
    const a = Math.max(0, m.index - 24);
    const b = Math.min(text.length, m.index + m[0].length + 100);
    s = (a ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '');
  }
  snipCache.set(e, { q: hl, s });
  return s;
}
