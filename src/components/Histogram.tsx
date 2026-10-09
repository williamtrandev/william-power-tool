import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../lib/types';
import { histogram } from '../lib/search';
import { fmtDateTime, fmtStep, nf } from '../lib/format';

interface Props {
  rows: LogEntry[];
  range: [number, number] | null;
  onPick: (range: [number, number]) => void;
}

const H = 64;

export function Histogram({ rows, range, onPick }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxBuckets = Math.max(20, Math.min(160, Math.floor(width / 7)));
  const h = useMemo(() => histogram(rows, range, maxBuckets), [rows, range, maxBuckets]);

  return (
    <div ref={wrap} className="rounded-lg border border-line bg-surface px-3 pt-2 pb-1.5" onMouseLeave={() => setHover(null)}>
      {h && width > 0 ? renderBars() : <div style={{ height: H + 18 }} />}
    </div>
  );

  function renderBars() {
  if (!h) return null;
  const nb = h.all.length;
  const bw = width / nb;
  const max = Math.max(1, ...h.all);
  const scale = (n: number) => (n ? Math.max(2, Math.sqrt(n / max) * (H - 4)) : 0);
  const hv = hover != null ? { i: hover, t: h.start + hover * h.step } : null;

  return (
    <>
      <div className="relative">
        <svg width={width} height={H} className="block cursor-pointer" role="img" aria-label="Phân bố số dòng theo thời gian">
          {h.all.map((n, i) => {
            if (!n) return null;
            const tot = scale(n);
            const bad = h.bad[i] === n ? tot : (tot * h.bad[i]) / n;
            const ok = Math.max(0, tot - bad);
            const x = i * bw + 0.5;
            const w = Math.max(1, bw - (bw > 4 ? 1.5 : 0.5));
            return (
              <g key={i} opacity={hover == null || hover === i ? 1 : 0.55}>
                {ok > 0.01 && <rect x={x} y={H - tot} width={w} height={ok} rx={bw > 5 ? 1.5 : 0} fill="var(--bar)" />}
                {bad > 0 && <rect x={x} y={H - bad} width={w} height={bad} rx={bw > 5 ? 1.5 : 0} fill="var(--lv-error)" />}
              </g>
            );
          })}
          <rect
            width={width}
            height={H}
            fill="transparent"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHover(Math.min(nb - 1, Math.max(0, Math.floor((e.clientX - r.left) / bw))));
            }}
            onClick={() => {
              if (hover != null && h.all[hover]) onPick([h.start + hover * h.step, h.start + (hover + 1) * h.step]);
            }}
          />
        </svg>
        {hv && h.all[hv.i] > 0 && (
          <div
            className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full rounded-md bg-fg px-2 py-1 text-[11px] whitespace-nowrap text-bg shadow-lg"
            style={{ left: Math.min(Math.max(hv.i * bw + bw / 2, 90), width - 90) }}
          >
            <span className="font-medium">{fmtDateTime(hv.t)}</span> · {nf(h.all[hv.i])} dòng
            {h.bad[hv.i] > 0 && <span className="text-red-300 dark:text-red-600"> · {nf(h.bad[hv.i])} khả nghi</span>}
            <span className="opacity-60"> · bấm để zoom</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-faint tabular-nums">
        <span>{fmtDateTime(h.start)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm bg-error" /> khả nghi
          </span>
          <span>mỗi cột {fmtStep(h.step)}</span>
          <span>{fmtDateTime(h.start + nb * h.step)}</span>
        </span>
      </div>
    </>
  );
  }
}
