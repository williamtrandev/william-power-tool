import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SAMPLE_COMMANDS, type Command, type CommandInput, type HistoryRow } from './commands';
import type { OtDay, OtEntry, OtInput, OtMonth, OtPerson, OtPersonInput } from './ot';
import { cleanSecret, secondsLeft, totp, type AccountActivity, type AccountCode, type AccountInput, type OtpCode, type TeamAccount } from './otp';

/**
 * Google sign-in, accounts and the shared command library on Supabase (schema and access rules: supabase/setup.sql).
 * The project is chosen at build time with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (.env.local, never committed). VITE_SUPABASE_URL=demo runs a local fake, `npm run dev` only.
 */

export type MemberStatus = 'pending' | 'approved' | 'blocked';
export type MemberRole = 'member' | 'admin';

export interface Member {
  user_id: string;
  email: string;
  status: MemberStatus;
  role: MemberRole;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

/** an approved member, as anyone may see them (to share an account with) */
export type DirectoryEntry = Pick<Member, 'user_id' | 'email' | 'full_name' | 'avatar_url'>;

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  /** when the person last actually signed in (token refreshes do not count) */
  signedInAt?: string;
}

export interface Backend {
  mode: 'supabase' | 'demo';
  /** signed-in user, or null */
  session(): Promise<User | null>;
  onAuthChange(cb: (u: User | null) => void): () => void;
  /** redirects to Google; the session is picked up when the browser comes back */
  signInWithGoogle(): Promise<void>;
  /** demo only: switch to one of the fake accounts */
  signInAs?(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** this user's access row (created as "pending" on sign-up) */
  me(): Promise<Member | null>;
  // admin
  members(): Promise<Member[]>;
  setMember(userId: string, status: MemberStatus, role: MemberRole): Promise<void>;
  // commands
  list(): Promise<Command[]>;
  create(input: CommandInput): Promise<Command>;
  update(id: string, input: CommandInput): Promise<Command>;
  remove(id: string): Promise<void>;
  bump(id: string): Promise<void>;
  history(id: string): Promise<HistoryRow[]>;
  // shared accounts — password and OTP secret stay in the database; each reveal is logged
  acctList(): Promise<TeamAccount[]>;
  acctPassword(id: string): Promise<string>;
  acctCode(id: string): Promise<OtpCode>;
  /** current + next code of every given account the user may use; seeing is logged at most hourly */
  acctCodes(ids: string[]): Promise<AccountCode[]>;
  /** log that a code was copied */
  acctCopied(id: string): Promise<void>;
  /** admin; returns the account id */
  acctSave(id: string | null, input: AccountInput): Promise<string>;
  acctDelete(id: string): Promise<void>;
  acctMembers(id: string): Promise<string[]>;
  acctActivity(): Promise<AccountActivity[]>;
  /** approved members, for sharing an account with selected people */
  directory(): Promise<DirectoryEntry[]>;
  // overtime — everyone reads the team's hours; members write their own, admins anyone's
  /** the OT roster, people without an account included */
  otPeople(): Promise<OtPerson[]>;
  /** id null adds someone; members may only add / rename themselves */
  otPersonSave(id: string | null, input: OtPersonInput): Promise<OtPerson>;
  /** admin; refused while the person still has OT logged */
  otPersonDelete(id: string): Promise<void>;
  otList(from: string, to: string): Promise<OtMonth>;
  /** id null adds a new day */
  otSave(id: string | null, input: OtInput): Promise<OtEntry>;
  otDelete(id: string): Promise<void>;
  /** shared title of a day; empty clears it */
  otSetDay(date: string, label: string): Promise<void>;
}

const env = import.meta.env as Record<string, string | undefined>;

/** null when the build has no Supabase settings */
export function createBackend(): Backend | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  if (!url) return null;
  // the fake backend has no passwords — only ever available on a local dev server, and
  // stripped from production builds
  if (url === 'demo') return import.meta.env.DEV ? demoBackend() : null;
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  return key ? supabaseBackend(url, key) : null;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

/** Turn Supabase / PostgREST errors into something a support agent can act on. */
function friendly(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message ?? 'Lỗi không xác định';
  if (/signups? not allowed|signup is disabled/i.test(m)) return new Error('Supabase đang tắt đăng ký người dùng mới — admin cần bật “Allow new users to sign up”');
  if (/provider is not enabled|unsupported provider/i.test(m)) return new Error('Đăng nhập Google chưa được bật — admin cần cấu hình Google trong Supabase');
  if (/invalid base32 secret/i.test(m)) return new Error('Secret OTP không hợp lệ');
  if (/no password stored/i.test(m)) return new Error('Tài khoản này chưa lưu mật khẩu');
  if (/only the owner can make an account private/i.test(m)) return new Error('Chỉ người tạo mới đặt tài khoản thành riêng tư được');
  if (/no otp stored/i.test(m)) return new Error('Tài khoản này chưa có OTP');
  if (/acct_|team_account/i.test(m) && /not find|does not exist/i.test(m)) return new Error('Database chưa có phần Tài khoản — admin cần chạy lại supabase/setup.sql');
  if (/ot_entries_person_day_key/i.test(m)) return new Error('Người này đã có OT ngày đó — mở ô đó để sửa');
  if (/ot_people_email_key/i.test(m)) return new Error('Email này đã gắn với một người khác trong danh sách OT');
  if (/ot_entries_person_id_fkey/i.test(m)) return new Error('Người này còn giờ OT đã ghi — tắt “Đang làm” để ẩn thay vì xoá');
  if (/ot_entries|ot_days|ot_people/i.test(m) && /not find|does not exist/i.test(m)) return new Error('Database chưa có phần OT — admin cần chạy lại supabase/setup.sql');
  if (/rate limit/i.test(m)) return new Error('Thao tác quá nhiều lần, thử lại sau ít phút');
  if (/is_private|could not find the .* column/i.test(m)) return new Error('Database chưa cập nhật — admin cần chạy lại supabase/setup.sql');
  if (/only the owner can make a command private/i.test(m)) return new Error('Chỉ người tạo mới đặt lệnh thành riêng tư được');
  if (/relation .* does not exist|could not find the (table|function)|schema cache/i.test(m)) return new Error('Database chưa được cài — admin cần chạy supabase/setup.sql');
  if (/row-level security|permission denied|not allowed/i.test(m) || e?.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này');
  if (/cannot change your own account/i.test(m)) return new Error('Không thể tự đổi quyền của chính mình');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error('Không kết nối được máy chủ — kiểm tra mạng');
  return new Error(m);
}

function supabaseBackend(url: string, anonKey: string): Backend {
  // PKCE: the provider sends back ?code=…, which does not collide with the #tool hash routing
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, storageKey: 'wpt-auth', flowType: 'pkce' } });
  type AuthUser = { id: string; email?: string; last_sign_in_at?: string; user_metadata?: Record<string, unknown> };
  const toUser = (u: AuthUser | undefined | null): User | null => {
    if (!u) return null;
    const m = u.user_metadata ?? {};
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    return {
      id: u.id,
      email: (u.email ?? '').toLowerCase(),
      name: str(m.full_name) ?? str(m.name),
      avatar: str(m.avatar_url) ?? str(m.picture),
      signedInAt: u.last_sign_in_at,
    };
  };
  const table = () => sb.from('commands');
  return {
    mode: 'supabase',
    async session() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      // the callback must not await other supabase calls (it runs inside the auth lock)
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw friendly(error);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async me() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return null;
      const get = () => sb.from('app_members').select('*').eq('user_id', u.user!.id).maybeSingle();
      let { data, error } = await get();
      if (!error && !data) {
        // account created before the sign-up trigger existed
        await sb.rpc('request_access');
        ({ data, error } = await get());
      }
      if (error) throw friendly(error);
      return data as Member | null;
    },
    async members() {
      const { data, error } = await sb.from('app_members').select('*').order('requested_at', { ascending: false });
      if (error) throw friendly(error);
      return (data ?? []) as Member[];
    },
    async setMember(userId, status, role) {
      const { error } = await sb.rpc('set_member', { target: userId, new_status: status, new_role: role });
      if (error) throw friendly(error);
    },
    async list() {
      // PostgREST caps a response at 1000 rows — page through until a short page comes back
      const STEP = 1000;
      const all: Command[] = [];
      for (let from = 0; ; from += STEP) {
        const { data, error } = await table().select('*').order('id').range(from, from + STEP - 1);
        if (error) throw friendly(error);
        all.push(...((data ?? []) as Command[]));
        if (!data || data.length < STEP) return all;
      }
    },
    async create(input) {
      const { data, error } = await table().insert(input).select().single();
      if (error) throw friendly(error);
      return data as Command;
    },
    async update(id, input) {
      // RLS turns an update on someone else's command into "0 rows"
      const { data, error } = await table().update(input).eq('id', id).select().maybeSingle();
      if (error) throw friendly(error);
      if (!data) throw new Error('Bạn chỉ sửa được lệnh do mình tạo');
      return data as Command;
    },
    async remove(id) {
      const { data, error } = await table().delete().eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Bạn chỉ xoá được lệnh do mình tạo');
    },
    async bump(id) {
      await sb.rpc('bump_command_use', { cid: id });
    },
    async history(id) {
      const { data, error } = await sb.from('command_history').select('*').eq('command_id', id).order('changed_at', { ascending: false }).limit(50);
      if (error) throw friendly(error);
      return (data ?? []) as HistoryRow[];
    },
    async acctList() {
      const { data, error } = await sb.rpc('acct_list');
      if (error) throw friendly(error);
      return (data ?? []) as TeamAccount[];
    },
    async acctPassword(id) {
      const { data, error } = await sb.rpc('acct_password', { aid: id });
      if (error) throw friendly(error);
      return data as string;
    },
    async acctCode(id) {
      const { data, error } = await sb.rpc('acct_code', { aid: id });
      if (error) throw friendly(error);
      const row = (Array.isArray(data) ? data[0] : data) as OtpCode | undefined;
      if (!row) throw new Error('Không lấy được mã');
      return row;
    },
    async acctCodes(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.rpc('acct_codes', { ids });
      if (error) throw friendly(error);
      return (data ?? []) as AccountCode[];
    },
    async acctCopied(id) {
      const { error } = await sb.rpc('acct_copied', { aid: id });
      if (error) throw friendly(error);
    },
    async acctSave(id, i) {
      const { data, error } = await sb.rpc('acct_save', {
        aid: id,
        p_system: i.system,
        p_env: i.env,
        p_username: i.username,
        p_url: i.url,
        p_note: i.note,
        p_password: i.password,
        p_otp_secret: i.otp_secret,
        p_otp_algorithm: i.otp_algorithm,
        p_otp_digits: i.otp_digits,
        p_otp_period: i.otp_period,
        p_everyone: i.everyone,
        p_members: i.members,
        p_private: i.is_private,
      });
      if (error) throw friendly(error);
      return data as string;
    },
    async acctDelete(id) {
      const { error } = await sb.rpc('acct_delete', { aid: id });
      if (error) throw friendly(error);
    },
    async acctMembers(id) {
      const { data, error } = await sb.rpc('acct_members', { aid: id });
      if (error) throw friendly(error);
      return ((data ?? []) as (string | { acct_members: string })[]).map((r) => (typeof r === 'string' ? r : r.acct_members));
    },
    async acctActivity() {
      const { data, error } = await sb.rpc('acct_activity', { max_rows: 200 });
      if (error) throw friendly(error);
      return (data ?? []) as AccountActivity[];
    },
    async directory() {
      const { data, error } = await sb.rpc('member_directory');
      if (error) throw friendly(error);
      return (data ?? []) as DirectoryEntry[];
    },
    async otPeople() {
      const { data, error } = await sb.from('ot_people').select('id, name, full_name, email, active').order('name');
      if (error) throw friendly(error);
      return (data ?? []) as OtPerson[];
    },
    async otPersonSave(id, input) {
      const q = id ? sb.from('ot_people').update(input).eq('id', id) : sb.from('ot_people').insert(input);
      const { data, error } = await q.select('id, name, full_name, email, active').maybeSingle();
      if (error) throw friendly(error);
      if (!data) throw new Error('Bạn chỉ sửa được tên của chính mình');
      return data as OtPerson;
    },
    async otPersonDelete(id) {
      const { data, error } = await sb.from('ot_people').delete().eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Chỉ admin xoá được người khỏi danh sách');
    },
    async otList(from, to) {
      const [e, d] = await Promise.all([
        sb.from('ot_entries').select('*').gte('work_date', from).lte('work_date', to).order('work_date'),
        sb.from('ot_days').select('work_date, label').gte('work_date', from).lte('work_date', to),
      ]);
      if (e.error) throw friendly(e.error);
      if (d.error) throw friendly(d.error);
      // numeric comes back as a string
      return { entries: (e.data ?? []).map((r) => ({ ...r, hours: Number(r.hours) })) as OtEntry[], days: (d.data ?? []) as OtDay[] };
    },
    async otSave(id, input) {
      const q = id ? sb.from('ot_entries').update(input).eq('id', id) : sb.from('ot_entries').insert(input);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw friendly(error);
      if (!data) throw new Error('Bạn chỉ sửa được giờ OT của mình');
      return { ...data, hours: Number(data.hours) } as OtEntry;
    },
    async otDelete(id) {
      const { data, error } = await sb.from('ot_entries').delete().eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Bạn chỉ xoá được giờ OT của mình');
    },
    async otSetDay(date, label) {
      const { error } = label.trim()
        ? await sb.from('ot_days').upsert({ work_date: date, label: label.trim() })
        : await sb.from('ot_days').delete().eq('work_date', date);
      if (error) throw friendly(error);
    },
  };
}

// ── demo (local only, for development) ───────────────────────────────────────

function demoBackend(): Backend {
  const KEY = 'wpt-demo-db';
  const SESSION = 'wpt-demo-session';
  type DemoAccount = Omit<TeamAccount, 'has_password' | 'has_otp' | 'can_manage'> & { password: string | null; otp_secret: string | null; otp_algorithm: AccountInput['otp_algorithm']; members: string[] };
  type Store = { members: Member[]; commands: Command[]; history: HistoryRow[]; accounts?: DemoAccount[]; accountLog?: AccountActivity[]; ot?: OtEntry[]; otDays?: OtDay[]; otPeople?: OtPerson[] };
  const now = () => new Date().toISOString();
  const id = () => crypto.randomUUID();
  const read = (): Store => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Store | null;
      if (s) return s;
    } catch {
      /* fall through to seed */
    }
    const t = now();
    const m = (email: string, full_name: string, status: MemberStatus, role: MemberRole): Member => ({ user_id: email, email, full_name, status, role, requested_at: t, decided_by: null, decided_at: null });
    const seed: Store = {
      members: [m('admin@demo', 'Admin Demo', 'approved', 'admin'), m('qc@demo', 'Lan QC', 'approved', 'member'), m('newbie@demo', 'Minh Newbie', 'pending', 'member')],
      commands: SAMPLE_COMMANDS.map((c, i) => {
        const by = i % 3 === 2 ? 'qc@demo' : 'admin@demo';
        return { ...c, is_private: false, id: id(), uses: [12, 9, 6, 4, 1, 15, 7, 2][i] ?? 0, owner_id: by, created_by: by, updated_by: by, created_at: t, updated_at: t };
      }),
      history: [],
      // well-known test secret (shown in many TOTP tutorials) — demo only
      accounts: [
        { id: id(), system: 'Demo SBB', env: 'SBB', username: 'qc_test', url: 'https://sbb-uat.example.vn', note: 'Maker, dùng chung cho QC', password: 'Uat@2026', otp_secret: 'JBSWY3DPEHPK3PXP', otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo SBB', env: 'SBB', username: 'qc_checker', url: 'https://sbb-uat.example.vn', note: 'Checker, duyệt giao dịch', password: 'Chk@2026', otp_secret: null, otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo SBB', env: 'SBB', username: 'qc_admin', url: 'https://sbb-uat.example.vn/admin', note: 'Quyền admin trên SBB', password: 'Adm@2026', otp_secret: null, otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo SBB', env: 'SBD', username: 'dev_test', url: 'https://sbb-dev.example.vn', note: 'Tài khoản dev chung', password: 'dev123', otp_secret: null, otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo SBB', env: 'Live', username: 'ops_root', url: 'https://sbb.example.vn', note: 'Chỉ dùng khi xử lý sự cố', password: 'Prod!demo', otp_secret: 'KRSXG5CTMVRXEZLU', otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo Evoucher', env: 'SBB', username: 'ev_qc', url: 'https://evoucher-uat.example.vn', note: 'QC chung', password: 'ev123', otp_secret: 'MFRGGZDFMZTWQ2LK', otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo Evoucher', env: 'Live', username: 'ev_support', url: 'https://evoucher.example.vn', note: 'Hỗ trợ khách hàng', password: 'evp!demo', otp_secret: null, otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Demo AWS', env: '', username: 'root', url: 'https://console.aws.amazon.com', note: 'Chỉ admin + qc', password: 'Root!demo', otp_secret: 'GEZDGNBVGY3TQOJQ', otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: false, members: ['qc@demo'], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
        { id: id(), system: 'Wiki nội bộ', env: '', username: 'team', url: 'https://wiki.example.vn', note: '', password: 'wiki123', otp_secret: null, otp_algorithm: 'SHA1', otp_digits: 6, otp_period: 30, everyone: true, members: [], is_private: false, owner_id: 'admin@demo', created_by: 'admin@demo', updated_at: t },
      ],
      accountLog: [],
    };
    // persist right away so ids stay stable between reads
    localStorage.setItem(KEY, JSON.stringify(seed));
    return seed;
  };
  const write = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s));
  const listeners = new Set<(u: User | null) => void>();
  const sessionEmail = () => localStorage.getItem(SESSION);
  const user = (): User | null => {
    const e = sessionEmail();
    return e ? { id: e, email: e, name: read().members.find((m) => m.email === e)?.full_name ?? undefined } : null;
  };
  const emit = () => listeners.forEach((l) => l(user()));
  const meRow = (s: Store) => s.members.find((m) => m.user_id === sessionEmail());
  const member = (s: Store) => meRow(s)?.status === 'approved';
  const admin = (s: Store) => member(s) && meRow(s)?.role === 'admin';
  const deny = () => new Error('Bạn không có quyền thực hiện thao tác này');
  const log = (s: Store, c: Command, action: HistoryRow['action']) =>
    s.history.unshift({ id: Date.now() + Math.random(), command_id: c.id, action, data: c, changed_by: sessionEmail(), changed_at: now() });
  const visible = (c: Command) => !c.is_private || c.owner_id === sessionEmail();
  const canUse = (s: Store, a: DemoAccount) =>
    member(s) && (a.owner_id === sessionEmail() || (!a.is_private && (admin(s) || a.everyone || a.members.includes(sessionEmail() ?? ''))));
  const canManage = (s: Store, a: DemoAccount) => member(s) && (a.owner_id === sessionEmail() || (admin(s) && !a.is_private));
  const logAcct = (s: Store, a: DemoAccount, action: AccountActivity['action']) => {
    (s.accountLog ??= []).unshift({ id: Date.now() + Math.random(), account_id: a.id, account: [a.system, a.env, a.username].filter(Boolean).join(' · '), action, user_email: sessionEmail(), at: now() });
    write(s);
  };
  const own = (s: Store, c: Command) => member(s) && (c.owner_id === sessionEmail() || (admin(s) && !c.is_private));

  return {
    mode: 'demo',
    async session() {
      return user();
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signInAs(email) {
      localStorage.setItem(SESSION, email);
      emit();
    },
    async signInWithGoogle() {
      // stands in for a first Google sign-in: a fresh account waiting for approval
      await new Promise((r) => setTimeout(r, 700));
      const s = read();
      const e = 'google.user@demo';
      if (!s.members.some((m) => m.email === e))
        s.members.push({ user_id: e, email: e, status: 'pending', role: 'member', requested_at: now(), decided_by: null, decided_at: null, full_name: 'Google User', avatar_url: null });
      write(s);
      localStorage.setItem(SESSION, e);
      emit();
    },
    async signOut() {
      localStorage.removeItem(SESSION);
      emit();
    },
    async me() {
      return meRow(read()) ?? null;
    },
    async members() {
      const s = read();
      return admin(s) ? [...s.members].sort((a, b) => b.requested_at.localeCompare(a.requested_at)) : s.members.filter((m) => m.user_id === sessionEmail());
    },
    async setMember(userId, status, role) {
      const s = read();
      if (!admin(s)) throw deny();
      if (userId === sessionEmail()) throw new Error('Không thể tự đổi quyền của chính mình');
      const m = s.members.find((x) => x.user_id === userId);
      if (m) Object.assign(m, { status, role, decided_by: sessionEmail(), decided_at: now() });
      write(s);
    },
    async list() {
      const s = read();
      return member(s) ? s.commands.filter(visible).sort((a, b) => b.uses - a.uses) : [];
    },
    async create(input) {
      const s = read();
      if (!member(s)) throw deny();
      const me = sessionEmail();
      const c: Command = { ...input, is_private: !!input.is_private, id: id(), uses: 0, owner_id: me, created_by: me, updated_by: me, created_at: now(), updated_at: now() };
      s.commands.push(c);
      log(s, c, 'insert');
      write(s);
      return c;
    },
    async update(cid, input) {
      const s = read();
      const i = s.commands.findIndex((c) => c.id === cid);
      if (i < 0 || !own(s, s.commands[i])) throw new Error('Bạn chỉ sửa được lệnh do mình tạo');
      if (input.is_private && !s.commands[i].is_private && s.commands[i].owner_id !== sessionEmail()) throw new Error('Chỉ người tạo mới đặt lệnh thành riêng tư được');
      log(s, s.commands[i], 'update');
      s.commands[i] = { ...s.commands[i], ...input, updated_by: sessionEmail(), updated_at: now() };
      write(s);
      return s.commands[i];
    },
    async remove(cid) {
      const s = read();
      const c = s.commands.find((x) => x.id === cid);
      if (!c || !own(s, c)) throw new Error('Bạn chỉ xoá được lệnh do mình tạo');
      log(s, c, 'delete');
      s.commands = s.commands.filter((x) => x.id !== cid);
      write(s);
    },
    async bump(cid) {
      const s = read();
      const c = s.commands.find((x) => x.id === cid);
      if (c && member(s)) c.uses++;
      write(s);
    },
    async history(cid) {
      const s = read();
      return member(s) ? s.history.filter((h) => h.command_id === cid && visible(h.data)) : [];
    },
    async acctList() {
      const s = read();
      return (s.accounts ?? []).filter((a) => canUse(s, a)).map(({ password, otp_secret, otp_algorithm: _a, members: _m, ...a }) => ({ ...a, env: a.env ?? '', has_password: !!password, has_otp: !!otp_secret, can_manage: canManage(s, a as DemoAccount) }));
    },
    async acctPassword(aid) {
      const s = read();
      const a = (s.accounts ?? []).find((x) => x.id === aid);
      if (!a || !canUse(s, a)) throw deny();
      if (!a.password) throw new Error('Tài khoản này chưa lưu mật khẩu');
      logAcct(s, a, 'password');
      return a.password;
    },
    async acctCode(aid) {
      const s = read();
      const a = (s.accounts ?? []).find((x) => x.id === aid);
      if (!a || !canUse(s, a)) throw deny();
      if (!a.otp_secret) throw new Error('Tài khoản này chưa có OTP');
      logAcct(s, a, 'code');
      const opt = { algorithm: a.otp_algorithm, digits: a.otp_digits, period: a.otp_period };
      return { code: await totp(a.otp_secret, opt), next_code: await totp(a.otp_secret, { ...opt, at: Date.now() + a.otp_period * 1000 }), remaining: secondsLeft(a.otp_period), period: a.otp_period };
    },
    async acctCodes(ids) {
      const s = read();
      if (!member(s)) throw deny();
      const out: AccountCode[] = [];
      for (const a of (s.accounts ?? []).filter((x) => ids.includes(x.id) && x.otp_secret && canUse(s, x))) {
        const hour = Date.now() - 3600_000;
        if (!(s.accountLog ?? []).some((l) => l.account_id === a.id && l.user_email === sessionEmail() && l.action === 'code' && +new Date(l.at) > hour)) logAcct(s, a, 'code');
        const opt = { algorithm: a.otp_algorithm, digits: a.otp_digits, period: a.otp_period };
        out.push({ id: a.id, code: await totp(a.otp_secret!, opt), next_code: await totp(a.otp_secret!, { ...opt, at: Date.now() + a.otp_period * 1000 }), remaining: secondsLeft(a.otp_period), period: a.otp_period });
      }
      return out;
    },
    async acctCopied(aid) {
      const s = read();
      const a = (s.accounts ?? []).find((x) => x.id === aid);
      if (!a || !canUse(s, a)) throw deny();
      logAcct(s, a, 'copy');
    },
    async acctSave(aid, i) {
      const s = read();
      if (!member(s)) throw deny();
      const list = (s.accounts ??= []);
      const keep = <T,>(v: string | null, old: T) => (v === null ? old : v === '' ? null : v);
      const base = { system: i.system, env: i.env, username: i.username, url: i.url, note: i.note, otp_algorithm: i.otp_algorithm, otp_digits: i.otp_digits, otp_period: i.otp_period, everyone: i.everyone && !i.is_private, is_private: i.is_private, members: i.everyone || i.is_private ? [] : i.members, updated_at: now() };
      let a = aid ? list.find((x) => x.id === aid) : undefined;
      if (a && !canManage(s, a)) throw deny();
      if (a && i.is_private && !a.is_private && a.owner_id !== sessionEmail()) throw new Error('Chỉ người tạo mới đặt tài khoản thành riêng tư được');
      if (a) Object.assign(a, base, { password: keep(i.password, a.password), otp_secret: keep(i.otp_secret && cleanSecret(i.otp_secret), a.otp_secret) });
      else {
        a = { ...base, id: id(), password: i.password || null, otp_secret: i.otp_secret ? cleanSecret(i.otp_secret) : null, owner_id: sessionEmail(), created_by: sessionEmail() };
        list.push(a);
      }
      logAcct(s, a, aid ? 'update' : 'create');
      return a.id;
    },
    async acctDelete(aid) {
      const s = read();
      const a = (s.accounts ?? []).find((x) => x.id === aid);
      if (!a || !canManage(s, a)) throw deny();
      s.accounts = (s.accounts ?? []).filter((x) => x.id !== aid);
      if (a) logAcct(s, a, 'delete');
      else write(s);
    },
    async acctMembers(aid) {
      const s = read();
      const a = (s.accounts ?? []).find((x) => x.id === aid);
      if (!a || !canManage(s, a)) throw deny();
      return a.members;
    },
    async acctActivity() {
      const s = read();
      if (!member(s)) throw deny();
      const byId = new Map((s.accounts ?? []).map((a) => [a.id, a]));
      return (s.accountLog ?? []).filter((l) => {
        const a = l.account_id ? byId.get(l.account_id) : undefined;
        return a ? canManage(s, a) : admin(s);
      });
    },
    async directory() {
      const s = read();
      return member(s) ? s.members.filter((m) => m.status === 'approved') : [];
    },
    async otPeople() {
      const s = read();
      if (!member(s)) throw deny();
      seedOt(s);
      return [...s.otPeople!].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    },
    async otPersonSave(pid, input) {
      const s = read();
      seedOt(s);
      const list = s.otPeople!;
      const p = pid ? list.find((x) => x.id === pid) : undefined;
      const self = (e: string | null) => !!e && e === sessionEmail();
      if (!member(s) || (!admin(s) && (!self(input.email) || (p && !self(p.email))))) throw new Error('Bạn chỉ sửa được tên của chính mình');
      if (input.email && list.some((x) => x.id !== pid && x.email === input.email)) throw new Error('Email này đã gắn với một người khác trong danh sách OT');
      const out = p ? Object.assign(p, input) : { ...input, id: id() };
      if (!p) list.push(out);
      write(s);
      return out;
    },
    async otPersonDelete(pid) {
      const s = read();
      if (!admin(s)) throw new Error('Chỉ admin xoá được người khỏi danh sách');
      seedOt(s);
      if (s.ot!.some((e) => e.person_id === pid)) throw new Error('Người này còn giờ OT đã ghi — tắt “Đang làm” để ẩn thay vì xoá');
      s.otPeople = s.otPeople!.filter((x) => x.id !== pid);
      write(s);
    },
    async otList(from, to) {
      const s = read();
      if (!member(s)) throw deny();
      seedOt(s);
      const inRange = (d: string) => d >= from && d <= to;
      return { entries: s.ot!.filter((e) => inRange(e.work_date)), days: (s.otDays ?? []).filter((d) => inRange(d.work_date)) };
    },
    async otSave(oid, input) {
      const s = read();
      seedOt(s);
      const mine = (pid: string) => admin(s) || s.otPeople!.find((p) => p.id === pid)?.email === sessionEmail();
      if (!member(s) || !mine(input.person_id)) throw new Error('Bạn chỉ sửa được giờ OT của mình');
      const list = s.ot!;
      if (list.some((e) => e.id !== oid && e.person_id === input.person_id && e.work_date === input.work_date)) throw new Error('Người này đã có OT ngày đó — mở ô đó để sửa');
      let e = oid ? list.find((x) => x.id === oid) : undefined;
      if (oid && (!e || !mine(e.person_id))) throw new Error('Bạn chỉ sửa được giờ OT của mình');
      if (e) Object.assign(e, input, { updated_by: sessionEmail(), updated_at: now() });
      else list.push((e = { ...input, id: id(), updated_by: sessionEmail(), updated_at: now() }));
      write(s);
      return e;
    },
    async otDelete(oid) {
      const s = read();
      seedOt(s);
      const e = s.ot!.find((x) => x.id === oid);
      const mine = e && (admin(s) || s.otPeople!.find((p) => p.id === e.person_id)?.email === sessionEmail());
      if (!e || !member(s) || !mine) throw new Error('Bạn chỉ xoá được giờ OT của mình');
      s.ot = s.ot!.filter((x) => x.id !== oid);
      write(s);
    },
    async otSetDay(date, label) {
      const s = read();
      if (!member(s)) throw deny();
      s.otDays = (s.otDays ?? []).filter((d) => d.work_date !== date);
      if (label.trim()) s.otDays.push({ work_date: date, label: label.trim() });
      write(s);
    },
  };
}

/** a roster (one person without an account) and a few OT days this month, so the demo table is not empty */
function seedOt(s: { members: Member[]; ot?: OtEntry[]; otPeople?: OtPerson[] }) {
  if (s.otPeople && s.ot) return;
  // OT rows from before the roster existed point at nobody
  if (!s.otPeople) s.ot = undefined;
  const p = (name: string, full_name: string, email: string | null): OtPerson => ({ id: crypto.randomUUID(), name, full_name, email, active: true });
  const people = (s.otPeople ??= [p('Demo', 'Admin Demo', 'admin@demo'), p('Lan', 'Lan QC', 'qc@demo'), p('Thông', 'Trần Văn Thông', null)]);
  const d = new Date();
  const day = (n: number) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
  const rows: [number, number, number, string][] = [
    [0, 3, 4, 'Fix lỗi đối soát cuối ngày'],
    [0, 7, 3, 'LIVE gencode'],
    [1, 7, 2.5, 'Test gencode trên Live'],
    [0, 10, 8, 'Dựng môi trường RL'],
    [2, 10, 8, 'Dựng môi trường RL'],
    [1, 11, 6, 'Rà soát security'],
  ];
  s.ot ??= rows.map(([i, n, hours, note]) => ({ id: crypto.randomUUID(), person_id: people[i].id, work_date: day(n), hours, note, updated_by: 'admin@demo', updated_at: new Date().toISOString() }));
  localStorage.setItem('wpt-demo-db', JSON.stringify(s));
}
