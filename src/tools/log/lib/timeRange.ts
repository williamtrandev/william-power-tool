/**
 * The time-range filter typed in by hand. A range is [from, to) in ms, like the one picked on the histogram.
 * Inputs are Vietnamese "dd/mm/yyyy hh:mm:ss" text in local time — not `datetime-local`, whose format follows the
 * browser's language (mm/dd/yyyy on an English Chrome) — and never go through ISO (it shifts the time zone).
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const INPUT_HINT = 'dd/mm/yyyy hh:mm:ss';

/** ms → "dd/mm/yyyy hh:mm:ss" (local) */
export function toInput(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** puts the separators in while typing digits: "25112026143" → "25/11/2026 14:3" */
export function maskInput(s: string): string {
  const d = s.replace(/\D/g, '').slice(0, 14);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8), d.slice(8, 10), d.slice(10, 12), d.slice(12, 14)];
  const seps = ['', '/', '/', ' ', ':', ':'];
  return parts.reduce((out, p, i) => (p ? out + seps[i] + p : out), '');
}

/**
 * "dd/mm/yyyy[ hh[:mm[:ss]]]" (local) → its start in ms and how long the typed precision lasts (a whole day when
 * only the date is typed, a minute without seconds…), or null when it is not a real date.
 */
export function fromInput(s: string): { t: number; span: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y, h, mi, sec] = m.slice(1).map((x) => (x == null ? null : Number(x)));
  const date = new Date(y!, mo! - 1, d!, h ?? 0, mi ?? 0, sec ?? 0);
  // 31/02 rolls over to March: not a date
  if (date.getDate() !== d || date.getMonth() !== mo! - 1 || (h ?? 0) > 23 || (mi ?? 0) > 59 || (sec ?? 0) > 59) return null;
  const span = sec != null ? 1000 : mi != null ? 60_000 : h != null ? 3600_000 : 86400_000;
  return { t: date.getTime(), span };
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
 * The range for what was typed: "Đến" counts the whole of what it names (its second, or its day when only the date is
 * typed); an empty side means from the first / to the last line. Null when nothing is typed, a string when the input
 * is wrong.
 */
export function rangeOf(from: string, to: string, bounds: [number, number] | null): [number, number] | null | string {
  if (!from.trim() && !to.trim()) return null;
  const a = from.trim() ? fromInput(from) : bounds && { t: bounds[0], span: 0 };
  const b = to.trim() ? fromInput(to) : bounds && { t: bounds[1], span: 1 };
  if (!a || !b) return `Nhập theo dạng ${INPUT_HINT}`;
  const end = b.t + b.span;
  if (end <= a.t) return '“Từ” phải trước “Đến”';
  return [a.t, end];
}

/** quick picks, counted back from the latest line (logs are often read hours after they were written) */
export const PRESETS = [
  { label: '5 phút cuối', ms: 5 * 60_000 },
  { label: '15 phút cuối', ms: 15 * 60_000 },
  { label: '1 giờ cuối', ms: 3600_000 },
  { label: '6 giờ cuối', ms: 6 * 3600_000 },
  { label: '24 giờ cuối', ms: 24 * 3600_000 },
];
