/**
 * Overtime log (supabase/setup.sql, "overtime log"): a roster of people kept apart from sign-in accounts,
 * one row per person per day per group.
 */

/** someone on the OT sheet — may or may not have an account */
export interface OtPerson {
  id: string;
  /** what the sheet shows, e.g. "Quỳnh" — set by the team, never taken from Google */
  name: string;
  full_name: string;
  /** links the row to the member who signs in with this email; null for people without an account */
  email: string | null;
  /** off: hidden from the table and the export (past OT is kept) */
  active: boolean;
}

export type OtPersonInput = Pick<OtPerson, 'name' | 'full_name' | 'email' | 'active'>;

export interface OtEntry {
  id: string;
  person_id: string;
  /** YYYY-MM-DD */
  work_date: string;
  /** the group or job it was for ("Dựng RL"); '' when none was given */
  task: string;
  hours: number;
  /** when it was worked, "12:00-13:00, 18:00-21:30"; '' when only the hours were typed */
  periods: string;
  note: string;
  updated_by: string | null;
  updated_at: string;
}

export type OtInput = Pick<OtEntry, 'person_id' | 'work_date' | 'task' | 'hours' | 'periods' | 'note'>;

/** one change to an OT row, written by the database (ot_log) — never edited */
export interface OtChange {
  id: number;
  at: string;
  /** email of whoever made the change */
  actor: string | null;
  action: 'insert' | 'update' | 'delete';
  person_id: string | null;
  person_name: string | null;
  work_date: string;
  /** null in history written before groups existed */
  task: string | null;
  /** after the change (null for a delete) */
  hours: number | null;
  note: string | null;
  /** null in history written before periods existed */
  periods: string | null;
  /** before the change (null for an insert); person / date only when they changed */
  old_person_name: string | null;
  old_work_date: string | null;
  old_task: string | null;
  old_hours: number | null;
  old_note: string | null;
  old_periods: string | null;
}

export interface OtMonth {
  entries: OtEntry[];
}

// ── dates (always local YYYY-MM-DD strings, never Date → ISO, so nothing shifts a day across time zones) ──

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());
/** "2026-11-02" + -1 → "2026-11-01" */
export const shiftDay = (s: string, by: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + by);
  return ymd(d);
};

/** "2026-10" */
export type MonthKey = string;
export const monthOf = (s: string): MonthKey => s.slice(0, 7);
export const shiftMonth = (m: MonthKey, by: number): MonthKey => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const monthRange = (m: MonthKey) => {
  const [y, mo] = m.split('-').map(Number);
  return { from: `${m}-01`, to: ymd(new Date(y, mo, 0)) };
};
export const monthDays = (m: MonthKey): string[] => {
  const { to } = monthRange(m);
  const n = Number(to.slice(8));
  return Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`);
};
export const monthLabel = (m: MonthKey) => `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAYS_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const weekday = (s: string) => WEEKDAYS[parseYmd(s).getDay()];
export const weekdayLong = (s: string) => WEEKDAYS_LONG[parseYmd(s).getDay()];
/** "26/9", like the team's sheet */
export const dayMonth = (s: string) => `${Number(s.slice(8))}/${Number(s.slice(5, 7))}`;
export const fullDate = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
/** "25/11/2026" (as typed, 1-digit day / month too) → "2026-11-25", or null when it is not a real date */
export const parseDmy = (s: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const out = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  // 31/02 rolls over to March: not a date
  return ymd(parseYmd(out)) === out ? out : null;
};
/**
 * Puts the "/" in while typing or pasting: "07112026" → "07/11/2026". A "/" typed by hand ends the day or month
 * early, so "7/11/2026" stays as it is.
 */
export const maskDmy = (s: string) => {
  const parts: string[] = [];
  let cur = '';
  for (const ch of s) {
    const digit = /\d/.test(ch);
    if (digit && parts.length === 2 && cur.length === 4) break;
    if (digit) cur += ch;
    // day and month end at 2 digits, or at a "/"
    if (parts.length < 2 && cur && (cur.length === 2 || ch === '/')) {
      parts.push(cur);
      cur = '';
    }
  }
  return parts.map((p) => p + '/').join('') + cur;
};

/** Solar public holidays (Tết and Giỗ Tổ follow the lunar calendar — give those days a title instead). */
const HOLIDAYS: Record<string, string> = { '01-01': 'Tết Dương lịch', '04-30': 'Giải phóng miền Nam', '05-01': 'Quốc tế Lao động', '09-02': 'Quốc khánh' };

/** OT pay differs by day type (Bộ luật Lao động: 150% / 200% / 300%), so the export splits hours this way */
export type DayKind = 'weekday' | 'weekend' | 'holiday';
export const dayKind = (s: string): DayKind => (HOLIDAYS[s.slice(5)] ? 'holiday' : [0, 6].includes(parseYmd(s).getDay()) ? 'weekend' : 'weekday');
export const holidayName = (s: string) => HOLIDAYS[s.slice(5)];
export const DAY_KIND_LABEL: Record<DayKind, string> = { weekday: 'Ngày thường', weekend: 'Cuối tuần', holiday: 'Ngày lễ' };

// ── groups ──

/** what a row without a group is called on screen */
export const NO_TASK = 'Chưa đặt nhóm';
/** the day's groups, in the order they were first logged ('' — no group — first) */
export const dayTasks = (entries: OtEntry[], date: string) => {
  const list = [...new Set(entries.filter((e) => e.work_date === date).map((e) => e.task))];
  return list.sort((a, b) => Number(!!a) - Number(!!b));
};

// ── numbers ──

/** one-tap hour buttons in the OT editors */
export const QUICK_HOURS = [1, 2, 3, 4, 6, 8];

/** 11.5 → "11,5" (the team writes hours the Vietnamese way) */
export const fmtHours = (h: number) => (Math.round(h * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** accepts "11,5" as well as "11.5" */
export const parseHours = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** "18:30", "18h30", "1830", "18" → minutes after midnight, or null */
export const parseHm = (s: string): number | null => {
  const m = /^(\d{1,2})(?:[:hH.]?(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  return h <= 23 && mi <= 59 ? h * 60 + mi : null;
};
/** puts the ":" in while typing: "1830" → "18:30" */
export const maskHm = (s: string) => {
  const d = s.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};
/** hours from start to end; an end at or before the start is the next morning (22:00 → 02:00 = 4) */
export const hoursBetween = (start: number, end: number) => Math.round((((end - start + 1440) % 1440 || 1440) / 60) * 100) / 100;

/** one stretch of OT and what was done in it: "17:30" → "19:30", "Golive hệ thống A" */
export type Period = { start: string; end: string; what: string };
const completePeriod = (p: Period) => parseHm(p.start) != null && parseHm(p.end) != null;
/** the stored JSON → the periods ('' or anything unreadable: none) */
export const parsePeriods = (s: string): Period[] => {
  try {
    const list: unknown = s ? JSON.parse(s) : [];
    return Array.isArray(list) ? list.map((p: Partial<Period>) => ({ start: String(p.start ?? ''), end: String(p.end ?? ''), what: String(p.what ?? '') })).filter(completePeriod) : [];
  } catch {
    return [];
  }
};
/** the complete periods as stored ('' when none) */
export const fmtPeriods = (list: Period[]) => {
  const done = list.filter(completePeriod).map((p) => ({ ...p, what: p.what.trim() }));
  return done.length ? JSON.stringify(done) : '';
};
/** 1050 → "17h30", 1140 → "19h" (how the team writes times) */
const hm = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;
/** the note the periods make, one line each: "17h30 - 19h30: Golive hệ thống A" */
export const periodsNote = (list: Period[]) =>
  list
    .filter(completePeriod)
    .map((p) => `${hm(parseHm(p.start)!)} - ${hm(parseHm(p.end)!)}${p.what.trim() ? `: ${p.what.trim()}` : ''}`)
    .join('\n');
/** total hours of the periods that are complete */
export const periodHours = (list: Period[]) =>
  Math.round(list.reduce((a, p) => a + hoursBetween(parseHm(p.start)!, parseHm(p.end)!), 0) * 100) / 100;

// ── people ──

export const fullName = (p: OtPerson) => p.full_name.trim() || p.name;
/** "Nguyễn Thị Quỳnh" → "Quỳnh", the way the sheet names people */
export const givenName = (full: string) => full.trim().split(/\s+/).pop() ?? '';
export const cleanEmail = (s: string) => s.trim().toLowerCase() || null;
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+$/.test(s.trim());
