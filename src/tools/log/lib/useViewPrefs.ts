import { useSyncExternalStore } from 'react';

/** Display preferences for the log content viewer, shared by every DetailPanel instance and remembered. */
export interface ViewPrefs {
  view: 'text' | 'json' | 'raw';
  wrap: boolean;
  fold: boolean;
  /** truncate very long strings / lines behind a "…+N ký tự" button */
  collapse: boolean;
}

const KEY = 'loglens-view';
const DEFAULTS: ViewPrefs = { view: 'text', wrap: true, fold: true, collapse: false };

let prefs: ViewPrefs = DEFAULTS;
try {
  prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* storage unavailable */
}
const listeners = new Set<() => void>();

export function setViewPrefs(patch: Partial<ViewPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function useViewPrefs(): ViewPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
