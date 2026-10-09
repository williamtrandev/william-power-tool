import { useCallback, useMemo, useRef, useState } from 'react';
import ParseWorker from './parse.worker?worker&inline';
import type { ParseMessage } from './parse.worker';
import type { LogEntry, LogFile, ParseResult } from './types';
import { FILE_COLORS } from './format';

export interface LoadingState {
  name: string;
  size: number;
  progress: number;
  index: number;
  total: number;
}

function parseInWorker(file: File, fileId: number, onProgress: (p: number) => void): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const w = new ParseWorker();
    w.onmessage = (ev: MessageEvent<ParseMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') onProgress(m.value);
      else {
        w.terminate();
        if (m.type === 'done') resolve(m.result);
        else reject(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message));
    };
    w.postMessage({ file, fileId });
  });
}

export function useLogs(onError: (msg: string) => void) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState<LoadingState | null>(null);
  const nextId = useRef(0);

  const addFiles = useCallback(
    async (input: File[]) => {
      const list = input.filter((f) => f.size > 0);
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const id = nextId.current++;
        setLoading({ name: file.name, size: file.size, progress: 0, index: i + 1, total: list.length });
        try {
          const r = await parseInWorker(file, id, (p) => setLoading((s) => (s ? { ...s, progress: p } : s)));
          const lf: LogFile = {
            id,
            name: file.name,
            size: file.size,
            format: r.format,
            lines: r.lines,
            entries: r.entries,
            traced: r.entries.reduce((n, e) => n + (e.trace ? 1 : 0), 0),
            color: FILE_COLORS[id % FILE_COLORS.length],
            on: true,
          };
          setFiles((fs) => [...fs, lf]);
        } catch (err) {
          onError(`Không đọc được ${file.name}: ${(err as Error).message}`);
        }
      }
      setLoading(null);
    },
    [onError],
  );

  const removeFile = useCallback((id: number) => setFiles((fs) => fs.filter((f) => f.id !== id)), []);
  const toggleFile = useCallback(
    (id: number) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, on: !f.on } : f))),
    [],
  );

  // Only re-merge when the set of files changes, not when one is toggled on/off.
  const idsKey = files.map((f) => f.id).join(',');
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

  return { files, fileById, entries, traceIndex, loading, addFiles, removeFile, toggleFile };
}
