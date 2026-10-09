import { useCallback, useEffect, useState } from 'react';

const KEY = 'loglens-detail-width';
const MIN = 340;

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v >= MIN) return v;
  } catch {
    /* storage unavailable */
  }
  return Math.round(Math.max(420, window.innerWidth * 0.36));
}

/** Width (px) of the detail panel, resizable by dragging its left edge and remembered across visits. */
export function usePanelWidth() {
  const [width, setWidth] = useState(load);

  const clamp = useCallback((w: number) => Math.round(Math.min(Math.max(w, MIN), window.innerWidth * 0.72)), []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(width));
    } catch {
      /* storage unavailable */
    }
  }, [width]);

  const startDrag = useCallback(
    (ev: React.PointerEvent) => {
      ev.preventDefault();
      const x0 = ev.clientX;
      const w0 = width;
      const move = (e: PointerEvent) => setWidth(clamp(w0 + (x0 - e.clientX)));
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    },
    [width, clamp],
  );

  const nudge = useCallback((d: number) => setWidth((w) => clamp(w + d)), [clamp]);
  const reset = useCallback(() => setWidth(clamp(window.innerWidth * 0.36)), [clamp]);

  return { width, startDrag, nudge, reset };
}
