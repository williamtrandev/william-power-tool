import { useEffect, useReducer } from 'react';
import { decode } from './parser';
import type { LogEntry, LogFile } from './types';

/**
 * Entry text is not kept in memory: each entry only knows its byte range in the file, and the
 * text is sliced from the Blob when something needs it (detail panel, search snippet, copy,
 * export). A small LRU keeps recently viewed entries.
 */

const blobs = new Map<number, Blob>();
const cache = new Map<LogEntry, string>();
const MAX = 400;

export function syncBlobs(files: LogFile[]) {
  blobs.clear();
  for (const f of files) blobs.set(f.id, f.blob);
}

export const peekRaw = (e: LogEntry): string | undefined => e.text ?? cache.get(e);

export async function loadRaw(e: LogEntry): Promise<string> {
  const hit = peekRaw(e);
  if (hit != null) return hit;
  const blob = blobs.get(e.f);
  if (!blob) return '';
  let t: string;
  try {
    t = (await blob.slice(e.bs, e.be).text()).replace(/\r\n/g, '\n').replace(/^﻿/, '').replace(/\s+$/, '');
  } catch {
    t = '[Không đọc được nội dung — file có thể đã bị thay đổi hoặc xoá trên ổ đĩa]';
  }
  cache.set(e, t);
  if (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return t;
}

/** Load many entries' text (export), a few hundred reads in flight at a time. */
export async function loadRaws(list: LogEntry[], onProgress?: (done: number) => void): Promise<string[]> {
  const out = new Array<string>(list.length);
  const BATCH = 256;
  for (let i = 0; i < list.length; i += BATCH) {
    const part = await Promise.all(list.slice(i, i + BATCH).map((e) => (e.text != null ? e.text : readUncached(e))));
    part.forEach((t, j) => (out[i + j] = t));
    onProgress?.(Math.min(list.length, i + BATCH));
  }
  return out;
}

async function readUncached(e: LogEntry): Promise<string> {
  const c = cache.get(e);
  if (c != null) return c;
  const blob = blobs.get(e.f);
  if (!blob) return '';
  try {
    return (await blob.slice(e.bs, e.be).text()).replace(/\r\n/g, '\n').replace(/\s+$/, '');
  } catch {
    return '';
  }
}

/** Entry text for rendering: null while it is being read from the file. */
export function useRaw(e: LogEntry | null): string | null {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const v = e ? peekRaw(e) : undefined;
  useEffect(() => {
    if (!e || v !== undefined) return;
    let alive = true;
    loadRaw(e).then(() => alive && rerender());
    return () => {
      alive = false;
    };
  }, [e, v]);
  return e ? (v ?? null) : null;
}

/** Header kept as-is, message part JSON-unescaped (what the detail panel shows by default). */
export const decodedText = (raw: string, head: number) => raw.slice(0, head) + decode(raw.slice(head));
