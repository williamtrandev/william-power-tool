import { compareColumns, entryAt, filterGroup, summarize, valueAt, type CompareOptions, type Comparison, type Entry, type Group, type Summary } from './compare';
import { buildCompareXlsx } from './compareExport';
import { loadColumns, openSheet, openSource, setHeader, toMeta, type Source, type SourceMeta } from './sheetSource';

/**
 * Holds both files and the comparison off the main thread. The page only ever receives
 * file metadata, counts and one page of values at a time.
 */
export type Side = 'A' | 'B';
export type CompareRequest =
  | { type: 'open'; side: Side; file: File }
  | { type: 'sheet'; side: Side; sheet: string }
  | { type: 'header'; side: Side; row: number }
  | { type: 'clear'; side: Side }
  | { type: 'swap' }
  | { type: 'compare'; colA: string; colB: string; opts: CompareOptions }
  | { type: 'page'; group: Group; query: string; onlyDups: boolean; offset: number; limit: number }
  | { type: 'values'; group: Group; query: string; onlyDups: boolean }
  | { type: 'export'; nameA: string; nameB: string };

export type CompareReply = SourceMeta | Summary | null | { total: number; entries: Entry[] } | string | ArrayBuffer;

export type WorkerMessage =
  | { id: number; ok: true; value: CompareReply }
  | { id: number; ok: false; error: string }
  | { id: number; progress: number };

const sides: Partial<Record<Side, Source>> = {};
let result: Comparison | null = null;
let filtered: { key: string; list: Int32Array } | null = null;

/** Last filter is cached, so paging through it does not scan the group again. */
function view(group: Group, query: string, onlyDups: boolean): Int32Array {
  if (!result) throw new Error('Chưa có kết quả so sánh');
  const key = `${group}\u0000${onlyDups}\u0000${query}`;
  if (filtered?.key !== key) filtered = { key, list: filterGroup(result, group, query, onlyDups) };
  return filtered.list;
}

const ROW_CAP = 6;

async function handle(m: CompareRequest, progress: (p: number) => void): Promise<CompareReply> {
  switch (m.type) {
    case 'open':
      result = filtered = null;
      sides[m.side] = undefined;
      return toMeta((sides[m.side] = await openSource(m.file, progress)));
    case 'sheet': {
      const s = sides[m.side];
      if (!s) throw new Error('Chưa chọn file');
      result = filtered = null;
      return toMeta((sides[m.side] = await openSheet(s, m.sheet)));
    }
    case 'header': {
      const s = sides[m.side];
      if (!s) throw new Error('Chưa chọn file');
      setHeader(s, m.row - s.rangeStart);
      return toMeta(s);
    }
    case 'clear':
      sides[m.side] = undefined;
      result = filtered = null;
      return null;
    case 'swap':
      [sides.A, sides.B] = [sides.B, sides.A];
      result = filtered = null;
      return null;
    case 'compare': {
      const { A, B } = sides;
      const ca = A?.fields.indexOf(m.colA) ?? -1;
      const cb = B?.fields.indexOf(m.colB) ?? -1;
      result = filtered = null;
      if (!A || !B || ca < 0 || cb < 0) return null;
      await loadColumns(A, [ca], (p) => progress(p / 2));
      await loadColumns(B, [cb], (p) => progress(0.5 + p / 2));
      result = compareColumns(A, ca, B, cb, m.opts);
      return summarize(result);
    }
    case 'page': {
      const list = view(m.group, m.query, m.onlyDups);
      const end = Math.min(list.length, m.offset + m.limit);
      const entries: Entry[] = [];
      for (let k = m.offset; k < end; k++) entries.push(entryAt(result!, m.group, list[k], ROW_CAP));
      return { total: list.length, entries };
    }
    case 'values': {
      const list = view(m.group, m.query, m.onlyDups);
      return Array.from(list, (i) => valueAt(result!, m.group, i)).join('\n');
    }
    case 'export':
      if (!result) throw new Error('Chưa có kết quả so sánh');
      return buildCompareXlsx(result, m.nameA, m.nameB);
  }
}

self.onmessage = async (ev: MessageEvent<{ id: number; req: CompareRequest }>) => {
  const { id, req } = ev.data;
  let last = 0;
  const progress = (p: number) => {
    if (p - last < 0.02) return;
    last = p;
    self.postMessage({ id, progress: p } satisfies WorkerMessage);
  };
  try {
    const value = await handle(req, progress);
    self.postMessage({ id, ok: true, value } satisfies WorkerMessage, { transfer: value instanceof ArrayBuffer ? [value] : [] });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerMessage);
  }
};
