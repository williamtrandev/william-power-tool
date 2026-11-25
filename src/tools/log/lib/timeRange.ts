/**
 * The time-range filter typed in by hand. A range is [from, to) in ms, like the one picked on the histogram.
 * Inputs are `datetime-local` strings to the second, in local time (never through ISO: it shifts the time zone).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** ms → "YYYY-MM-DDTHH:mm:ss" (local) */
export function toInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "YYYY-MM-DDTHH:mm[:ss]" (local) → ms, or null when empty / not a date */
export function fromInput(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = m.slice(1).map((x) => Number(x ?? 0));
  const t = new Date(y, mo - 1, d, h, mi, sec).getTime();
  return Number.isNaN(t) ? null : t;
}

/** earliest and latest timestamp of the loaded lines, or null when none has a time */
export function timeBounds(entries: { ts: number | null }[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of entries)
    if (e.ts != null) {
      if (e.ts < lo) lo = e.ts;
      if (e.ts > hi) hi = e.ts;
    }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * The range for what was typed: "Đến" counts its whole second; an empty side means from the first / to the last
 * line. Null when nothing is typed, a string when the input is wrong.
 */
export function rangeOf(from: string, to: string, bounds: [number, number] | null): [number, number] | null | string {
  if (!from && !to) return null;
  const a = from ? fromInput(from) : (bounds?.[0] ?? null);
  const b = to ? fromInput(to) : (bounds?.[1] ?? null);
  if (a == null || b == null) return 'Thời gian chưa đúng';
  const end = to ? b + 1000 : b + 1;
  if (end <= a) return '“Từ” phải trước “Đến”';
  return [a, end];
}

/** quick picks, counted back from the latest line (logs are often read hours after they were written) */
export const PRESETS = [
  { label: '5 phút cuối', ms: 5 * 60_000 },
  { label: '15 phút cuối', ms: 15 * 60_000 },
  { label: '1 giờ cuối', ms: 3600_000 },
  { label: '6 giờ cuối', ms: 6 * 3600_000 },
  { label: '24 giờ cuối', ms: 24 * 3600_000 },
];
