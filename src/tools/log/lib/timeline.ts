import { SUS_MIN, type LogEntry } from './types';

/**
 * Time histogram for the log list. Logs often cover a few busy hours spread over many days,
 * so long runs of empty buckets are collapsed into a narrow "gap" slot instead of eating the
 * width — the bars that have data stay readable.
 */

export type Slot = { kind: 'bar'; t0: number; t1: number; all: number; bad: number } | { kind: 'gap'; t0: number; t1: number };

export interface Timeline {
  slots: Slot[];
  step: number;
  max: number;
  bars: number;
}

const STEPS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 10800, 21600, 43200, 86400, 604800].map((s) => s * 1000);
/** this many empty buckets or more in a row become one gap slot */
const GAP_RUN = 4;
/** more breaks than this fragments the chart — prefer a coarser step */
const MAX_GAPS = 6;

/** timestamps (ascending) + suspicious flags, whatever order the list is sorted in */
function series(rows: LogEntry[]) {
  const n = rows.length;
  let ts = new Float64Array(n);
  let bad = new Uint8Array(n);
  let k = 0;
  for (const e of rows)
    if (e.ts != null) {
      ts[k] = e.ts;
      bad[k++] = e.score >= SUS_MIN ? 1 : 0;
    }
  ts = ts.subarray(0, k);
  bad = bad.subarray(0, k);
  let asc = true;
  let desc = true;
  for (let i = 1; i < k && (asc || desc); i++) {
    if (ts[i] < ts[i - 1]) asc = false;
    if (ts[i] > ts[i - 1]) desc = false;
  }
  if (asc) return { ts, bad };
  if (desc) return { ts: ts.slice().reverse(), bad: bad.slice().reverse() };
  const idx = Array.from({ length: k }, (_, i) => i).sort((a, b) => ts[a] - ts[b]);
  return { ts: Float64Array.from(idx, (i) => ts[i]), bad: Uint8Array.from(idx, (i) => bad[i]) };
}

/** does this step fit: slots after collapsing empty runs ≤ cap, and not too many breaks */
function fits(ts: Float64Array, step: number, cap: number): boolean {
  const origin = Math.floor(ts[0] / step) * step;
  let prev = -1;
  let slots = 0;
  let gaps = 0;
  for (let i = 0; i < ts.length; i++) {
    const b = Math.floor((ts[i] - origin) / step);
    if (b === prev) continue;
    if (prev < 0) slots = 1;
    else {
      const d = b - prev;
      if (d > GAP_RUN) {
        slots += 2;
        gaps++;
      } else slots += d;
    }
    prev = b;
    if (slots > cap || gaps > MAX_GAPS) return false;
  }
  return true;
}

export function buildTimeline(rows: LogEntry[], range: [number, number] | null, maxSlots: number): Timeline | null {
  const { ts, bad } = series(rows);
  if (!ts.length && !range) return null;

  // zoomed into a range: keep the time axis continuous across it
  if (range) {
    const span = range[1] - range[0];
    const step = STEPS.find((s) => span / s <= maxSlots) ?? STEPS[STEPS.length - 1];
    const origin = Math.floor(range[0] / step) * step;
    const nb = Math.max(1, Math.ceil((range[1] - origin) / step));
    const slots: Slot[] = Array.from({ length: nb }, (_, i) => ({ kind: 'bar', t0: origin + i * step, t1: origin + (i + 1) * step, all: 0, bad: 0 }));
    for (let i = 0; i < ts.length; i++) {
      const s = slots[Math.floor((ts[i] - origin) / step)];
      if (s && s.kind === 'bar') {
        s.all++;
        s.bad += bad[i];
      }
    }
    return finish(slots, step);
  }

  const step = STEPS.find((s) => fits(ts, s, maxSlots)) ?? STEPS[STEPS.length - 1];
  const origin = Math.floor(ts[0] / step) * step;
  const slots: Slot[] = [];
  let prev = -1;
  let cur: Extract<Slot, { kind: 'bar' }> | null = null;
  for (let i = 0; i < ts.length; i++) {
    const b = Math.floor((ts[i] - origin) / step);
    if (b !== prev) {
      if (prev >= 0) {
        const d = b - prev;
        if (d > GAP_RUN) slots.push({ kind: 'gap', t0: origin + (prev + 1) * step, t1: origin + b * step });
        else for (let j = prev + 1; j < b; j++) slots.push({ kind: 'bar', t0: origin + j * step, t1: origin + (j + 1) * step, all: 0, bad: 0 });
      }
      cur = { kind: 'bar', t0: origin + b * step, t1: origin + (b + 1) * step, all: 0, bad: 0 };
      slots.push(cur);
      prev = b;
    }
    cur!.all++;
    cur!.bad += bad[i];
  }
  return finish(slots, step);
}

function finish(slots: Slot[], step: number): Timeline {
  let max = 0;
  let bars = 0;
  for (const s of slots)
    if (s.kind === 'bar') {
      bars++;
      if (s.all > max) max = s.all;
    }
  return { slots, step, max, bars };
}

/** a "nice" axis maximum: 1, 2, 2.5, 5 × 10^n */
export function niceMax(v: number): number {
  if (v <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
