import { useEffect, useState, useSyncExternalStore } from 'react';

/** Layout / readability preferences of the Log tool, shared app-wide and remembered. */
export interface LogDisplay {
  cols: { time: boolean; level: boolean; source: boolean; trace: boolean };
  groups: boolean;
  histogram: boolean;
  /** px size of log text (table, detail, JSON, timeline) */
  fontSize: number;
}

export const FONT_SIZES = [
  { px: 11, label: 'Nhỏ' },
  { px: 12, label: 'Vừa' },
  { px: 14, label: 'Lớn' },
  { px: 16, label: 'Rất lớn' },
];

const KEY = 'wpt-log-display';
const DEFAULTS: LogDisplay = {
  cols: { time: true, level: true, source: true, trace: false },
  groups: true,
  histogram: true,
  fontSize: 12,
};

let state: LogDisplay = DEFAULTS;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  state = { ...DEFAULTS, ...saved, cols: { ...DEFAULTS.cols, ...saved.cols } };
} catch {
  /* storage unavailable */
}
const listeners = new Set<() => void>();

export function setLogDisplay(patch: Partial<LogDisplay>) {
  state = { ...state, ...patch, cols: { ...state.cols, ...patch.cols } };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export const resetLogDisplay = () => setLogDisplay(DEFAULTS);

export function useLogDisplay(): LogDisplay {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    on();
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}
