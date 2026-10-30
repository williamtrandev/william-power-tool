/**
 * Overtime log (supabase/setup.sql, "overtime log"): a roster of people kept apart from sign-in accounts,
 * one row per person per day, and a shared title per day.
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
  hours: number;
  note: string;
  updated_by: string | null;
  updated_at: string;
}

export type OtInput = Pick<OtEntry, 'person_id' | 'work_date' | 'hours' | 'note'>;

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
  /** after the change (null for a delete) */
  hours: number | null;
  note: string | null;
  /** before the change (null for an insert); person / date only when they changed */
  old_person_name: string | null;
  old_work_date: string | null;
  old_hours: number | null;
  old_note: string | null;
}

export interface OtDay {
  work_date: string;
  label: string;
}

export interface OtMonth {
  entries: OtEntry[];
  days: OtDay[];
}

// ── dates (always local YYYY-MM-DD strings, never Date → ISO, so nothing shifts a day across time zones) ──

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => ymd(new Date());

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

/** Solar public holidays (Tết and Giỗ Tổ follow the lunar calendar — give those days a title instead). */
const HOLIDAYS: Record<string, string> = { '01-01': 'Tết Dương lịch', '04-30': 'Giải phóng miền Nam', '05-01': 'Quốc tế Lao động', '09-02': 'Quốc khánh' };

/** OT pay differs by day type (Bộ luật Lao động: 150% / 200% / 300%), so the export splits hours this way */
export type DayKind = 'weekday' | 'weekend' | 'holiday';
export const dayKind = (s: string): DayKind => (HOLIDAYS[s.slice(5)] ? 'holiday' : [0, 6].includes(parseYmd(s).getDay()) ? 'weekend' : 'weekday');
export const holidayName = (s: string) => HOLIDAYS[s.slice(5)];
export const DAY_KIND_LABEL: Record<DayKind, string> = { weekday: 'Ngày thường', weekend: 'Cuối tuần', holiday: 'Ngày lễ' };

// ── numbers ──

/** 11.5 → "11,5" (the team writes hours the Vietnamese way) */
export const fmtHours = (h: number) => (Math.round(h * 100) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** accepts "11,5" as well as "11.5" */
export const parseHours = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

// ── people ──

export const fullName = (p: OtPerson) => p.full_name.trim() || p.name;
/** "Nguyễn Thị Quỳnh" → "Quỳnh", the way the sheet names people */
export const givenName = (full: string) => full.trim().split(/\s+/).pop() ?? '';
export const cleanEmail = (s: string) => s.trim().toLowerCase() || null;
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+$/.test(s.trim());
