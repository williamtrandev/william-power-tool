import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ParseWorker from './parse.worker?worker&inline';
import type { ParseMessage } from './parse.worker';
import type { LogEntry, LogFile, ParseResult, ResumeFrom } from './types';
import { syncBlobs } from './rawCache';
import { inferTraces } from './parser';
import { FILE_COLORS } from './format';
import { clearStored, deleteStored, listStored, newStoreId, putStored, setStoredOn } from './fileStore';

export interface LoadingState {
  name: string;
  size: number;
  progress: number;
  index: number;
  total: number;
  /** re-reading files saved before the last reload */
  restoring: boolean;
}

interface Source {
  blob: Blob;
  name: string;
  storeId: string;
  on: boolean;
  addedAt: number;
  /** save to IndexedDB after parsing (false when it came from there) */
  persist: boolean;
}

function parseInWorker(file: Blob, name: string, fileId: number, onProgress: (p: number) => void, from?: ResumeFrom): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const w = new ParseWorker();
    // entries arrive in batches while the worker parses (keeps peak memory ~1x the result)
    const parts: LogEntry[][] = [];
    w.onmessage = (ev: MessageEvent<ParseMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress(m.value);
      else if (m.type === 'batch') parts.push(m.entries);
      else {
        w.terminate();
        if (m.type === 'done') {
          parts.push(m.result.entries);
          const entries = parts.length === 1 ? parts[0] : parts.flat();
          inferTraces(entries);
          resolve({ ...m.result, entries });
        } else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message));
    };
    w.postMessage({ file, fileId, name, from });
  });
}

export function useLogs(onError: (msg: string) => void) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState<LoadingState | null>(null);
  const nextId = useRef(0);

  const filesRef = useRef(files);
  filesRef.current = files;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const warnedStore = useRef(false);
  const storeFailed = useCallback(
    (err: unknown) => {
      if (warnedStore.current) return;
      warnedStore.current = true;
      onError(`Không lưu được file vào trình duyệt (${(err as Error)?.message || 'không rõ lỗi'}) — file sẽ mất khi tải lại trang.`);
    },
    [onError],
  );

  // Parse sources one after another; drops during a restore wait their turn.
  const load = useCallback(
    (sources: Source[], restoring: boolean) => {
      queue.current = queue.current.then(async () => {
        for (let i = 0; i < sources.length; i++) {
          const src = sources[i];
          const id = nextId.current++;
          setLoading({ name: src.name, size: src.blob.size, progress: 0, index: i + 1, total: sources.length, restoring });
          try {
            const r = await parseInWorker(src.blob, src.name, id, (p) => setLoading((s) => (s ? { ...s, progress: p } : s)));
            const lf: LogFile = {
              id,
              name: src.name,
              size: src.blob.size,
              format: r.format,
              note: r.note,
              lines: r.lines,
              entries: r.entries,
              traced: r.entries.reduce((n, e) => n + (e.trace ? 1 : 0), 0),
              blob: src.blob,
              fmtId: r.fmtId,
              color: FILE_COLORS[id % FILE_COLORS.length],
              on: src.on,
              storeId: src.storeId,
            };
            setFiles((fs) => [...fs, lf]);
            if (src.persist) putStored({ id: src.storeId, name: src.name, blob: src.blob, on: src.on, addedAt: src.addedAt }).catch(storeFailed);
          } catch (err) {
            onError(`Không đọc được ${src.name}: ${(err as Error).message}`);
          }
        }
        setLoading(null);
      });
      return queue.current;
    },
    [onError, storeFailed],
  );

  /** Load files that live in a connected folder: not copied to IndexedDB, keyed "folder:<name>". */
  const addExternal = useCallback(
    (items: { key: string; name: string; blob: Blob }[]) => {
      const fresh = items.filter((it) => it.blob.size > 0 && !filesRef.current.some((f) => f.storeId === it.key));
      if (!fresh.length) return queue.current;
      return load(
        fresh.map((it, i) => ({ blob: it.blob, name: it.name, storeId: it.key, on: true, addedAt: Date.now() + i, persist: false })),
        false,
      );
    },
    [load],
  );

  /**
   * A loaded file changed on disk: re-read it in the background, keeping id, colour and visibility.
   * When it only grew (log being appended), parse just the tail from its last entry onwards.
   */
  const replaceFile = useCallback(
    (key: string, blob: Blob) => {
      queue.current = queue.current.then(async () => {
        const f = filesRef.current.find((x) => x.storeId === key);
        if (!f) return;
        const last = f.entries[f.entries.length - 1];
        const append = f.fmtId !== 'csv' && last && blob.size > f.size && last.text == null;
        try {
          const from: ResumeFrom | undefined = append
            ? { byte: last.bs, k: last.k, ln: last.ln, lastTs: f.entries[f.entries.length - 2]?.ts ?? null, fmtId: f.fmtId }
            : undefined;
          const r = await parseInWorker(blob, f.name, f.id, () => {}, from);
          const entries = append ? f.entries.slice(0, -1).concat(r.entries) : r.entries;
          setFiles((fs) =>
            fs.map((x) =>
              x.storeId === key
                ? {
                    ...x,
                    blob,
                    size: blob.size,
                    format: append ? x.format : r.format,
                    fmtId: append ? x.fmtId : r.fmtId,
                    note: append ? x.note : r.note,
                    lines: r.lines,
                    entries,
                    traced: entries.reduce((n, e) => n + (e.trace ? 1 : 0), 0),
                    rev: (x.rev ?? 0) + 1,
                  }
                : x,
            ),
          );
        } catch (err) {
          onError(`Không đọc lại được ${f.name}: ${(err as Error).message}`);
        }
      });
    },
    [onError],
  );

  const addFiles = useCallback(
    (input: File[]) =>
      load(
        input
          .filter((f) => f.size > 0)
          .map((f, i) => ({ blob: f, name: f.name, storeId: newStoreId(), on: true, addedAt: Date.now() + i, persist: true })),
        false,
      ),
    [load],
  );

  // Restore files saved before the last reload (once, even under StrictMode's double effects).
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    listStored()
      .then((recs) => {
        if (recs.length) load(recs.map((r) => ({ blob: r.blob, name: r.name, storeId: r.id, on: r.on, addedAt: r.addedAt, persist: false })), true);
      })
      .catch(() => {
        /* IndexedDB unavailable (private mode…) — start empty */
      })
      .finally(() => setReady(true));
  }, [load]);

  const storeIdOf = (id: number) => filesRef.current.find((f) => f.id === id)?.storeId;

  const removeFile = useCallback((id: number) => {
    const sid = storeIdOf(id);
    if (sid && !sid.startsWith('folder:')) deleteStored(sid).catch(() => {});
    setFiles((fs) => fs.filter((f) => f.id !== id));
  }, []);

  const removeByKey = useCallback((key: string) => setFiles((fs) => fs.filter((f) => f.storeId !== key)), []);

  const toggleFile = useCallback((id: number) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (f && !f.storeId.startsWith('folder:')) setStoredOn(f.storeId, !f.on).catch(() => {});
    setFiles((fs) => fs.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  }, []);

  const clearFiles = useCallback(() => {
    clearStored().catch(() => {});
    setFiles([]);
  }, []);

  // Only re-merge when the set of files changes, not when one is toggled on/off.
  // entry text is sliced lazily from each file's Blob
  syncBlobs(files);

  const idsKey = files.map((f) => `${f.id}.${f.rev ?? 0}`).join(',');
  const { entries, traceIndex, byId } = useMemo(() => {
    const all: LogEntry[] = [];
    const byId = new Map<number, LogFile>();
    for (const f of files) {
      byId.set(f.id, f);
      for (const e of f.entries) all.push(e);
    }
    all.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0) || a.f - b.f || a.k - b.k);
    const traceIndex = new Map<string, LogEntry[]>();
    for (const e of all)
      if (e.trace) {
        const key = e.trace.toLowerCase();
        const arr = traceIndex.get(key);
        if (arr) arr.push(e);
        else traceIndex.set(key, [e]);
      }
    return { entries: all, traceIndex, byId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const fileById = useMemo(() => {
    const m = new Map(byId);
    for (const f of files) m.set(f.id, f);
    return m;
  }, [byId, files]);

  return { ready, files, fileById, entries, traceIndex, loading, addFiles, addExternal, replaceFile, removeFile, removeByKey, toggleFile, clearFiles };
}
