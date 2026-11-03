import { useState } from 'react';

export type Theme = 'light' | 'dark';
// localStorage of the extension origin: the popup and the inline menu share it, and it is read synchronously (no flash)
const KEY = 'wpt-ext-theme';

const stored = (): Theme | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
};
const system = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** apply the chosen theme (or the system one) before the first render */
export function applyTheme() {
  document.documentElement.classList.toggle('dark', (stored() ?? system()) === 'dark');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system());
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the toggle still works for this popup */
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
    setTheme(next);
  };
  return [theme, toggle];
}
