import type { Source } from './sheetSource';

export interface CompareOptions {
  /** drop leading / trailing spaces and collapse inner runs of whitespace */
  trim: boolean;
  ignoreCase: boolean;
}

export type Group = 'both' | 'onlyA' | 'onlyB';
export const GROUPS: Group[] = ['both', 'onlyA', 'onlyB'];
export const GROUP_LABEL: Record<Group, string> = { both: 'Có ở cả hai', onlyA: 'Chỉ có ở A', onlyB: 'Chỉ có ở B' };

/** One distinct value as the UI shows it: its first sheet rows (1-based, as Excel shows them) and how often it occurs per file. */
export interface Entry {
  value: string;
  rowsA: number[];
  countA: number;
  rowsB: number[];
  countB: number;
}

export interface Summary {
  count: Record<Group, number>;
  dups: Record<Group, number>;
  /** empty cells in the chosen column, skipped */
  emptyA: number;
  emptyB: number;
}

/** The distinct values of one column, in the order they first appear. */
interface Index {
  keys: Map<string, number>;
  value: string[];
  /** first sheet row of each value */
  first: number[];
  /** every sheet row, only for values seen more than once */
  more: Map<number, number[]>;
  empty: number;
}

/** A finished comparison: groups hold indexes into the A index (both, onlyA) or the B index (onlyB). */
export interface Comparison {
  a: Index;
  b: Index;
  both: Int32Array;
  /** B index of each `both` value */
  bothB: Int32Array;
  onlyA: Int32Array;
  onlyB: Int32Array;
}

export const isDup = (e: Pick<Entry, 'countA' | 'countB'>) => e.countA > 1 || e.countB > 1;

export function normalize(v: string, o: CompareOptions): string {
  let s = o.trim ? v.trim().replace(/\s+/g, ' ') : v;
  // plain toLowerCase: Vietnamese has no locale-specific case rules and this is much faster on a million values
  if (o.ignoreCase) s = s.toLowerCase();
  return s;
}

function index(s: Source, col: number, o: CompareOptions): Index {
  const ix: Index = { keys: new Map(), value: [], first: [], more: new Map(), empty: 0 };
  const cells = s.cols[col] ?? [];
  for (const i of s.dataRows) {
    const raw = cells[i];
    const key = normalize(raw, o);
    if (!key.trim()) {
      ix.empty++;
      continue;
    }
    const row = s.rangeStart + i + 1;
    const d = ix.keys.get(key);
    if (d == null) {
      ix.keys.set(key, ix.value.length);
      ix.value.push(o.trim ? raw.trim() : raw);
      ix.first.push(row);
    } else {
      const m = ix.more.get(d);
      if (m) m.push(row);
      else ix.more.set(d, [ix.first[d], row]);
    }
  }
  return ix;
}

/** Compare column `colA` of `a` with column `colB` of `b` as sets of distinct values — one Map lookup per value. */
export function compareColumns(a: Source, colA: number, b: Source, colB: number, o: CompareOptions): Comparison {
  const A = index(a, colA, o);
  const B = index(b, colB, o);
  const both: number[] = [];
  const bothB: number[] = [];
  const onlyA: number[] = [];
  const onlyB: number[] = [];
  const hitB = new Uint8Array(B.value.length);
  for (const [key, d] of A.keys) {
    const e = B.keys.get(key);
    if (e == null) onlyA.push(d);
    else {
      both.push(d);
      bothB.push(e);
      hitB[e] = 1;
    }
  }
  for (let e = 0; e < hitB.length; e++) if (!hitB[e]) onlyB.push(e);
  return { a: A, b: B, both: Int32Array.from(both), bothB: Int32Array.from(bothB), onlyA: Int32Array.from(onlyA), onlyB: Int32Array.from(onlyB) };
}

const rowsOf = (ix: Index, d: number) => ix.more.get(d) ?? [ix.first[d]];

/** The A / B index pair behind position `i` of a group (-1 when the value is not in that file). */
function pair(c: Comparison, g: Group, i: number): [number, number] {
  if (g === 'both') return [c.both[i], c.bothB[i]];
  return g === 'onlyA' ? [c.onlyA[i], -1] : [-1, c.onlyB[i]];
}

export function valueAt(c: Comparison, g: Group, i: number): string {
  const [x, y] = pair(c, g, i);
  return x >= 0 ? c.a.value[x] : c.b.value[y];
}

/** Full entry; `max` caps the row lists (the counts stay exact). */
export function entryAt(c: Comparison, g: Group, i: number, max = Infinity): Entry {
  const [x, y] = pair(c, g, i);
  const ra = x >= 0 ? rowsOf(c.a, x) : [];
  const rb = y >= 0 ? rowsOf(c.b, y) : [];
  return { value: valueAt(c, g, i), rowsA: ra.slice(0, max), countA: ra.length, rowsB: rb.slice(0, max), countB: rb.length };
}

function dupAt(c: Comparison, g: Group, i: number): boolean {
  const [x, y] = pair(c, g, i);
  return (x >= 0 && c.a.more.has(x)) || (y >= 0 && c.b.more.has(y));
}

export function summarize(c: Comparison): Summary {
  const count = { both: c.both.length, onlyA: c.onlyA.length, onlyB: c.onlyB.length };
  const dups = { both: 0, onlyA: 0, onlyB: 0 };
  for (const g of GROUPS) for (let i = 0; i < count[g]; i++) if (dupAt(c, g, i)) dups[g]++;
  return { count, dups, emptyA: c.a.empty, emptyB: c.b.empty };
}

/** Positions in group `g` that match the search text and the duplicates-only switch. */
export function filterGroup(c: Comparison, g: Group, query: string, onlyDups: boolean): Int32Array {
  const n = c[g].length;
  const q = query.trim().toLowerCase();
  const out = new Int32Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (onlyDups && !dupAt(c, g, i)) continue;
    if (q && !valueAt(c, g, i).toLowerCase().includes(q)) continue;
    out[k++] = i;
  }
  return out.subarray(0, k);
}

/** "2, 5, 9 … (+12)" — row list kept short for a table cell */
export function fmtRows(rows: number[], count: number): string {
  if (!count) return '';
  const head = rows.join(', ');
  return count > rows.length ? `${head} … (+${count - rows.length})` : head;
}
