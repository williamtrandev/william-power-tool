import { ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../lib/types';
import { buildTimeline, niceMax, type Slot } from '../lib/timeline';
import { fmtStep, nf } from '../lib/format';
import { Button } from './ui';

interface Props {
  rows: LogEntry[];
  range: [number, number] | null;
  onPick: (range: [number, number]) => void;
  onClear?: () => void;
}

const PLOT_H = 76;
const AXIS_W = 34; // y tick labels
const LABEL_H = 18; // x tick labels
const GAP_W = 18; // width of a collapsed "no logs" gap
const MAX_BAR = 24;
const R = 3; // rounded data-end

const pad = (n: number) => String(n).padStart(2, '0');

/** "6 ngày 3 giờ", "2 giờ 15 phút", "40 phút" */
function fmtLong(ms: number): string {
  const m = Math.round(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return h ? `${d} ngày ${h} giờ` : `${d} ngày`;
  if (h) return mm ? `${h} giờ ${mm} phút` : `${h} giờ`;
  return `${Math.max(1, mm)} phút`;
}
const compact = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));

function fmtTick(t: number, step: number, withDate: boolean): string {
  const d = new Date(t);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (step >= 86_400_000) return date;
  const time = step < 60_000 ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withDate ? `${date} ${time}` : time;
}

function fmtSpan(s: Slot, step: number): string {
  const a = fmtTick(s.t0, Math.min(step, 60_000), true);
  const sameDay = new Date(s.t0).toDateString() === new Date(s.t1 - 1).toDateString();
  return `${a} → ${fmtTick(s.t1, Math.min(step, 60_000), !sameDay)}`;
}

/** rect with only the top corners rounded (square on the baseline) */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function Histogram({ rows, range, onPick, onClear }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(0, width - AXIS_W);
  const maxSlots = Math.max(12, Math.min(120, Math.floor(plotW / 9)));
  const tl = useMemo(() => (width ? buildTimeline(rows, range, maxSlots) : null), [rows, range, maxSlots, width]);

  const layout = useMemo(() => {
    if (!tl) return null;
    const gaps = tl.slots.length - tl.bars;
    const slotW = tl.bars ? Math.max(1, (plotW - gaps * GAP_W) / tl.bars) : 0;
    let x = AXIS_W;
    const xs = tl.slots.map((s) => {
      const w = s.kind === 'gap' ? GAP_W : slotW;
      const r = { x, w };
      x += w;
      return r;
    });
    // when one burst dwarfs everything else, a linear scale flattens the rest to nothing:
    // switch to a labelled log scale (ticks 1 / 10 / 100 / 1K keep it honest)
    const counts = tl.slots.flatMap((s) => (s.kind === 'bar' && s.all ? [s.all] : [])).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)] ?? 1;
    const log = tl.max >= 50 && tl.max / Math.max(1, median) > 20;
    const top = log ? 10 ** Math.ceil(Math.log10(tl.max)) : niceMax(tl.max);
    return { slotW, xs, top, log };
  }, [tl, plotW]);

  const header = (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
      <span className="font-medium text-fg-2">Phân bố theo thời gian</span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-error" /> Khả nghi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm" style={{ background: 'var(--bar)' }} /> Bình thường
      </span>
      {tl && (
        <span className="text-faint">
          mỗi cột {fmtStep(tl.step)}
          {layout?.log ? ' · thang log' : ''}
          {tl.slots.some((s) => s.kind === 'gap') ? ' · ⋯ = khoảng không có log' : ''}
        </span>
      )}
      <span className="ml-auto text-faint">{range ? '' : 'Bấm một cột hoặc kéo chọn để zoom'}</span>
      {range && onClear && (
        <Button size="sm" variant="ghost" className="-my-1 h-6" onClick={onClear}>
          <ZoomOut size={14} /> Bỏ zoom
        </Button>
      )}
    </div>
  );

  if (!tl || !layout || !tl.slots.length)
    return (
      <div ref={wrap} data-tour="histogram" className="rounded-lg border border-line bg-surface px-3 pt-2 pb-1.5">
        {header}
        <div className="grid place-items-center text-[12px] text-faint" style={{ height: PLOT_H + LABEL_H }}>
          Không có dòng nào có thời gian
        </div>
      </div>
    );

  const { xs, slotW, top, log } = layout;
  const H = PLOT_H;
  const frac = (v: number) => (log ? Math.log10(1 + v) / Math.log10(1 + top) : v / top);
  const y = (v: number) => H - frac(v) * (H - 4);
  const gridVals = log
    ? Array.from({ length: Math.round(Math.log10(top)) + 1 }, (_, k) => (k === 0 ? 0 : 10 ** k)).filter((v, k, a) => a.length <= 4 || k % 2 === 0 || v === top)
    : [0, top / 2, top];
  const sel = drag ? [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] : null;

  // x tick labels: start of the chart, after every gap, then wherever there is room
  const ticks: { x: number; text: string }[] = [];
  const multiDay = new Date(tl.slots[0].t0).toDateString() !== new Date(tl.slots[tl.slots.length - 1].t1 - 1).toDateString();
  let lastEnd = -Infinity;
  let lastDay = '';
  tl.slots.forEach((s, i) => {
    if (s.kind !== 'bar') return;
    const first = i === 0 || tl.slots[i - 1].kind === 'gap';
    const day = new Date(s.t0).toDateString();
    // show the date on the first label of each new day
    const text = fmtTick(s.t0, tl.step, multiDay && day !== lastDay);
    const w = text.length * 6.2 + 10;
    const x = xs[i].x;
    if (x >= lastEnd && x + w <= AXIS_W + plotW + 4 && (first || x - lastEnd > 40)) {
      ticks.push({ x, text });
      lastEnd = x + w;
      lastDay = day;
    }
  });

  const idxAt = (clientX: number) => {
    const r = wrap.current!.querySelector('svg')!.getBoundingClientRect();
    const px = clientX - r.left;
    let i = xs.findIndex((s) => px >= s.x && px < s.x + s.w);
    if (i < 0) i = px < AXIS_W ? 0 : xs.length - 1;
    return i;
  };
  const barAt = (i: number) => (tl.slots[i]?.kind === 'bar' ? i : -1);

  const hv = hover != null ? tl.slots[hover] : null;
  const hx = hover != null ? xs[hover].x + xs[hover].w / 2 : 0;

  return (
    <div ref={wrap} data-tour="histogram" className="rounded-lg border border-line bg-surface px-3 pt-2 pb-1">
      {header}
      <div className="relative">
        <svg
          width={width}
          height={H + LABEL_H}
          className="block cursor-crosshair touch-none select-none"
          role="img"
          aria-label={`Số dòng log theo thời gian, mỗi cột ${fmtStep(tl.step)}`}
          onPointerMove={(e) => {
            const i = idxAt(e.clientX);
            setHover(i);
            if (drag && e.buttons) setDrag({ ...drag, b: barAt(i) >= 0 ? i : drag.b });
          }}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const i = barAt(idxAt(e.clientX));
            if (i < 0) return;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            setDrag({ a: i, b: i });
          }}
          onPointerUp={() => {
            if (!drag) return;
            const [a, b] = [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
            setDrag(null);
            const sa = tl.slots[a];
            const sb = tl.slots[b];
            const any = tl.slots.slice(a, b + 1).some((s) => s.kind === 'bar' && s.all > 0);
            if (any) onPick([sa.t0, sb.t1]);
          }}
        >
          {/* recessive grid: baseline, middle, top with compact tick labels */}
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={AXIS_W} x2={AXIS_W + plotW} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={AXIS_W - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {compact(Math.round(v))}
              </text>
            </g>
          ))}

          {sel && <rect x={xs[sel[0]].x} y={0} width={xs[sel[1]].x + xs[sel[1]].w - xs[sel[0]].x} height={H} fill="var(--accent)" opacity={0.12} rx={3} />}
          {hover != null && !drag && hv?.kind === 'bar' && <rect x={xs[hover].x} y={0} width={xs[hover].w} height={H} fill="var(--fg)" opacity={0.05} rx={3} />}

          {tl.slots.map((s, i) => {
            const { x, w } = xs[i];
            if (s.kind === 'gap')
              return (
                <g key={i} opacity={hover === i ? 1 : 0.7}>
                  <rect x={x + 3} y={4} width={w - 6} height={H - 4} rx={3} fill="var(--surface-2)" />
                  <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--faint)">
                    ⋯
                  </text>
                </g>
              );
            if (!s.all) return null;
            const gap = slotW > 6 ? 2 : slotW > 3 ? 1 : 0;
            const bw = Math.min(MAX_BAR, Math.max(1, slotW - gap));
            const bx = x + (w - bw) / 2;
            const hAll = Math.max(2, H - y(s.all));
            const hBad = s.bad ? Math.max(2, H - y(s.bad)) : 0;
            const dim = sel ? i < sel[0] || i > sel[1] : hover != null && hover !== i;
            if (log)
              // log scale: stacking would misstate the share, so the suspicious part is drawn
              // from the baseline over the total ("of which"), with a 2px surface gap on top
              return (
                <g key={i} opacity={dim ? 0.55 : 1}>
                  <path d={topRounded(bx, H - hAll, bw, hAll, R)} fill="var(--bar)" />
                  {hBad > 0 && (
                    <>
                      {hAll - hBad > 3 && <rect x={bx} y={H - hBad - 2} width={bw} height={2} fill="var(--surface)" />}
                      <path d={hAll - hBad > 3 ? `M${bx},${H}V${H - hBad}H${bx + bw}V${H}Z` : topRounded(bx, H - hBad, bw, hBad, R)} fill="var(--lv-error)" />
                    </>
                  )}
                </g>
              );
            const okH = Math.max(0, hAll - hBad - (hBad && hAll - hBad > 3 ? 2 : 0));
            return (
              <g key={i} opacity={dim ? 0.55 : 1}>
                {hBad > 0 && (
                  <path d={okH > 0 ? `M${bx},${H}V${H - hBad}H${bx + bw}V${H}Z` : topRounded(bx, H - hBad, bw, hBad, R)} fill="var(--lv-error)" />
                )}
                {okH > 0.5 && <path d={topRounded(bx, H - hAll, bw, Math.max(1, okH), R)} fill="var(--bar)" />}
              </g>
            );
          })}

          {ticks.map((t, k) => (
            <text key={k} x={t.x} y={H + 13} fontSize={10} fill="var(--faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {t.text}
            </text>
          ))}
        </svg>

        {hv && !drag && (
          <div
            className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full rounded-md bg-fg px-2.5 py-1.5 text-[11.5px] whitespace-nowrap text-bg shadow-lg"
            style={{ left: Math.min(Math.max(hx, 110), width - 110) }}
          >
            {hv.kind === 'gap' ? (
              <>Không có log trong {fmtLong(hv.t1 - hv.t0)}</>
            ) : (
              <>
                <div className="font-medium tabular-nums">{fmtSpan(hv, tl.step)}</div>
                <div className="mt-0.5 flex gap-3 tabular-nums opacity-90">
                  <span>{nf(hv.all)} dòng</span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-sm bg-error" />
                    {nf(hv.bad)} khả nghi
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
