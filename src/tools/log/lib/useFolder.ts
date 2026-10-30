import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteMeta, getMeta, setMeta } from './fileStore';

/**
 * Watch a local folder (File System Access API, Chromium only): list its files, keep the
 * ticked ones open in the Log tool, re-read them when they change on disk and optionally
 * open new log files as soon as they are copied in.
 */

export interface FolderFile {
  name: string;
  size: number;
  lastModified: number;
  selected: boolean;
  isNew: boolean;
  logLike: boolean;
}

interface Saved {
  handle: FileSystemDirectoryHandle;
  selected: string[];
  autoOpen: boolean;
}

interface Api {
  addExternal: (items: { key: string; name: string; blob: Blob }[]) => unknown;
  replaceFile: (key: string, blob: Blob) => void;
  removeByKey: (key: string) => void;
}

const META_KEY = 'log-folder';
const SCAN_MS = 3000;
/** big watched files are re-read at most this often (each re-read touches the whole entry list) */
const BIG_FILE = 50 * 1024 * 1024;
const BIG_REREAD_MS = 10_000;
/** .log/.txt/.csv… plus rotated names like app.log.1 or app.log.2026-10-08 */
export const LOG_LIKE = /\.(log|txt|csv|tsv|json|jsonl|out)(\.[\w-]+)?$/i;
export const folderKey = (name: string) => `folder:${name}`;

type Stat = { size: number; lastModified: number };

export function useFolder(api: Api, onToast: (m: string) => void) {
  const supported = typeof window !== 'undefined' && !!window.showDirectoryPicker && window.isSecureContext;
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [autoOpen, setAutoOpen] = useState(true);
  const [newNames, setNewNames] = useState<Set<string>>(new Set());
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restored = useRef(false);
  const busy = useRef(false);
  const again = useRef(false); // a scan was requested while one was running
  const scanRef = useRef<() => void>(() => {});
  const seen = useRef<Map<string, Stat> | null>(null); // every file seen in the last scan (null = first scan pending)
  const loaded = useRef(new Map<string, Stat>()); // files opened in the Log tool, with the stat they were read at
  const lastReread = useRef(new Map<string, number>());
  const selRef = useRef(selected);
  selRef.current = selected;
  const autoRef = useRef(autoOpen);
  autoRef.current = autoOpen;
  const apiRef = useRef(api);
  apiRef.current = api;

  // restore the folder chosen before the last reload
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    getMeta<Saved>(META_KEY)
      .then(async (s) => {
        if (!s?.handle) return;
        setHandle(s.handle);
        setSelected(s.selected ?? []);
        setAutoOpen(s.autoOpen ?? true);
        setPerm((await s.handle.queryPermission?.({ mode: 'read' })) ?? 'prompt');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (handle) setMeta(META_KEY, { handle, selected, autoOpen } satisfies Saved).catch(() => {});
  }, [handle, selected, autoOpen]);

  const scan = useCallback(async () => {
    if (!handle || perm !== 'granted') return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const stats = new Map<string, Stat>();
      const blobs = new Map<string, File>();
      for await (const [name, h] of handle.entries()) {
        if (h.kind !== 'file') continue;
        const f = await (h as FileSystemFileHandle).getFile();
        stats.set(name, { size: f.size, lastModified: f.lastModified });
        blobs.set(name, f);
      }

      // files copied in since the previous scan
      const prev = seen.current;
      const arrivals = prev ? [...stats.keys()].filter((n) => !prev.has(n) && LOG_LIKE.test(n)) : [];
      seen.current = stats;
      let sel = selRef.current.filter((n) => stats.has(n)); // drop files deleted from disk
      if (arrivals.length) {
        setNewNames((s) => new Set([...s, ...arrivals]));
        if (autoRef.current) {
          sel = [...new Set([...sel, ...arrivals])];
          onToast(`Đã mở ${arrivals.length} file mới: ${arrivals.slice(0, 3).join(', ')}${arrivals.length > 3 ? '…' : ''}`);
        }
      }
      if (sel.length !== selRef.current.length || sel.some((n, i) => n !== selRef.current[i])) {
        selRef.current = sel;
        setSelected(sel);
      }

      // reconcile what is open in the Log tool with what is ticked
      const { addExternal, replaceFile, removeByKey } = apiRef.current;
      const toAdd: { key: string; name: string; blob: Blob }[] = [];
      for (const name of sel) {
        const st = stats.get(name)!;
        const was = loaded.current.get(name);
        if (!was) toAdd.push({ key: folderKey(name), name, blob: blobs.get(name)! });
        else if (was.size !== st.size || was.lastModified !== st.lastModified) {
          if (st.size > BIG_FILE && Date.now() - (lastReread.current.get(name) ?? 0) < BIG_REREAD_MS) continue; // try again next scan
          replaceFile(folderKey(name), blobs.get(name)!);
          lastReread.current.set(name, Date.now());
        }
        loaded.current.set(name, st);
      }
      for (const name of [...loaded.current.keys()]) {
        if (!sel.includes(name)) {
          removeByKey(folderKey(name));
          loaded.current.delete(name);
        }
      }
      if (toAdd.length) addExternal(toAdd);

      setFiles(
        [...stats.entries()]
          .map(([name, st]) => ({ name, ...st, selected: sel.includes(name), isNew: false, logLike: LOG_LIKE.test(name) }))
          .sort((a, b) => b.lastModified - a.lastModified),
      );
      setLastScan(Date.now());
      setError(null);
    } catch (e) {
      // folder removed / permission revoked
      setError((e as Error).message);
      const p = await handle.queryPermission?.({ mode: 'read' }).catch(() => 'prompt' as PermissionState);
      if (p && p !== 'granted') setPerm(p);
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => scanRef.current(), 0);
      }
    }
  }, [handle, perm, onToast]);
  scanRef.current = scan;

  // poll while the folder is readable and the tab is visible
  useEffect(() => {
    if (!handle || perm !== 'granted') return;
    scan();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') scan();
    }, SCAN_MS);
    const onVis = () => document.visibilityState === 'visible' && scan();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [handle, perm, scan]);

  // re-run reconciliation right after the user ticks / unticks something
  const selKey = selected.join('\n');
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const closeAll = () => {
    for (const name of loaded.current.keys()) apiRef.current.removeByKey(folderKey(name));
    loaded.current.clear();
  };

  const connect = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const h = await window.showDirectoryPicker({ id: 'wpt-logs', mode: 'read' });
      closeAll();
      seen.current = null;
      setNewNames(new Set());
      setFiles([]);
      setSelected([]);
      setHandle(h);
      setPerm('granted');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onToast('Không mở được thư mục: ' + (e as Error).message);
    }
  }, [onToast]);

  const reconnect = useCallback(async () => {
    if (!handle) return;
    try {
      setPerm((await handle.requestPermission?.({ mode: 'read' })) ?? 'denied');
    } catch (e) {
      onToast('Không xin được quyền: ' + (e as Error).message);
    }
  }, [handle, onToast]);

  const disconnect = useCallback(() => {
    closeAll();
    seen.current = null;
    setHandle(null);
    setPerm(null);
    setFiles([]);
    setSelected([]);
    setNewNames(new Set());
    deleteMeta(META_KEY).catch(() => {});
  }, []);

  const toggle = useCallback((name: string) => {
    setNewNames((s) => {
      const n = new Set(s);
      n.delete(name);
      return n;
    });
    setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  }, []);

  const selectMany = useCallback((names: string[]) => setSelected((s) => [...new Set([...s, ...names])]), []);
  const unselect = useCallback((name: string) => setSelected((s) => s.filter((x) => x !== name)), []);
  const unselectAll = useCallback(() => setSelected([]), []);

  return {
    supported,
    connected: !!handle,
    name: handle?.name ?? '',
    perm,
    files: files.map((f) => ({ ...f, isNew: newNames.has(f.name) })),
    selectedCount: selected.length,
    autoOpen,
    setAutoOpen,
    lastScan,
    error,
    connect,
    reconnect,
    disconnect,
    toggle,
    selectMany,
    unselect,
    unselectAll,
  };
}

export type FolderState = ReturnType<typeof useFolder>;
