import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SAMPLE_COMMANDS, type Command, type CommandInput, type HistoryRow } from './commands';

/**
 * Accounts + shared command library on Supabase (schema and access rules: supabase/setup.sql).
 * The project is chosen at build time with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (.env.local, never committed). VITE_SUPABASE_URL=demo runs a local fake for development.
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
}

export interface User {
  id: string;
  email: string;
}

export interface Backend {
  mode: 'supabase' | 'demo';
  /** signed-in user, or null */
  session(): Promise<User | null>;
  onAuthChange(cb: (u: User | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  /** true when the account still has to confirm its email */
  signUp(email: string, password: string): Promise<{ confirmEmail: boolean }>;
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
}

const env = import.meta.env as Record<string, string | undefined>;

/** null when the build has no Supabase settings */
export function createBackend(): Backend | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  if (!url) return null;
  if (url === 'demo') return demoBackend();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  return key ? supabaseBackend(url, key) : null;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

/** Turn Supabase / PostgREST errors into something a support agent can act on. */
function friendly(e: { message?: string; code?: string } | null | undefined): Error {
  const m = e?.message ?? 'Lỗi không xác định';
  if (/invalid login credentials/i.test(m)) return new Error('Sai email hoặc mật khẩu');
  if (/email not confirmed/i.test(m)) return new Error('Email chưa được xác nhận — mở thư xác nhận Supabase gửi cho bạn rồi đăng nhập lại');
  if (/user already registered/i.test(m)) return new Error('Email này đã có tài khoản — hãy đăng nhập');
  if (/password should be at least/i.test(m)) return new Error('Mật khẩu quá ngắn (tối thiểu 6 ký tự)');
  if (/signups? not allowed|signup is disabled/i.test(m)) return new Error('Hệ thống đang tắt đăng ký — nhờ admin tạo tài khoản');
  if (/rate limit/i.test(m)) return new Error('Thao tác quá nhiều lần, thử lại sau ít phút');
  if (/relation .* does not exist|could not find the (table|function)|schema cache/i.test(m)) return new Error('Database chưa được cài — admin cần chạy supabase/setup.sql');
  if (/row-level security|permission denied|not allowed/i.test(m) || e?.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này');
  if (/cannot change your own account/i.test(m)) return new Error('Không thể tự đổi quyền của chính mình');
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error('Không kết nối được máy chủ — kiểm tra mạng');
  return new Error(m);
}

function supabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, storageKey: 'wpt-auth', flowType: 'implicit' } });
  const toUser = (u: { id: string; email?: string } | undefined | null): User | null => (u ? { id: u.id, email: (u.email ?? '').toLowerCase() } : null);
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
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw friendly(error);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw friendly(error);
      return { confirmEmail: !data.session };
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
      const { data, error } = await table().select('*').order('uses', { ascending: false }).limit(2000);
      if (error) throw friendly(error);
      return (data ?? []) as Command[];
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
  };
}

// ── demo (local only, for development) ───────────────────────────────────────

function demoBackend(): Backend {
  const KEY = 'wpt-demo-db';
  const SESSION = 'wpt-demo-session';
  type Store = { members: Member[]; commands: Command[]; history: HistoryRow[] };
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
    const m = (email: string, status: MemberStatus, role: MemberRole): Member => ({ user_id: email, email, status, role, requested_at: t, decided_by: null, decided_at: null });
    return {
      members: [m('admin@demo', 'approved', 'admin'), m('qc@demo', 'approved', 'member'), m('newbie@demo', 'pending', 'member')],
      commands: SAMPLE_COMMANDS.map((c, i) => {
        const by = i % 3 === 2 ? 'qc@demo' : 'admin@demo';
        return { ...c, id: id(), uses: [12, 9, 6, 4, 1, 15, 7, 2][i] ?? 0, owner_id: by, created_by: by, updated_by: by, created_at: t, updated_at: t };
      }),
      history: [],
    };
  };
  const write = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s));
  const listeners = new Set<(u: User | null) => void>();
  const sessionEmail = () => localStorage.getItem(SESSION);
  const user = (): User | null => {
    const e = sessionEmail();
    return e ? { id: e, email: e } : null;
  };
  const emit = () => listeners.forEach((l) => l(user()));
  const meRow = (s: Store) => s.members.find((m) => m.user_id === sessionEmail());
  const member = (s: Store) => meRow(s)?.status === 'approved';
  const admin = (s: Store) => member(s) && meRow(s)?.role === 'admin';
  const deny = () => new Error('Bạn không có quyền thực hiện thao tác này');
  const log = (s: Store, c: Command, action: HistoryRow['action']) =>
    s.history.unshift({ id: Date.now() + Math.random(), command_id: c.id, action, data: c, changed_by: sessionEmail(), changed_at: now() });
  const own = (s: Store, c: Command) => admin(s) || (member(s) && c.owner_id === sessionEmail());

  return {
    mode: 'demo',
    async session() {
      return user();
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signIn(email) {
      const e = email.trim().toLowerCase();
      const s = read();
      if (!s.members.some((m) => m.email === e)) throw new Error('Sai email hoặc mật khẩu (demo: admin@demo, qc@demo, newbie@demo)');
      localStorage.setItem(SESSION, e);
      emit();
    },
    async signUp(email) {
      const e = email.trim().toLowerCase();
      const s = read();
      if (s.members.some((m) => m.email === e)) throw new Error('Email này đã có tài khoản — hãy đăng nhập');
      s.members.push({ user_id: e, email: e, status: 'pending', role: 'member', requested_at: now(), decided_by: null, decided_at: null });
      write(s);
      localStorage.setItem(SESSION, e);
      emit();
      return { confirmEmail: false };
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
      return member(s) ? s.commands.sort((a, b) => b.uses - a.uses) : [];
    },
    async create(input) {
      const s = read();
      if (!member(s)) throw deny();
      const me = sessionEmail();
      const c: Command = { ...input, id: id(), uses: 0, owner_id: me, created_by: me, updated_by: me, created_at: now(), updated_at: now() };
      s.commands.push(c);
      log(s, c, 'insert');
      write(s);
      return c;
    },
    async update(cid, input) {
      const s = read();
      const i = s.commands.findIndex((c) => c.id === cid);
      if (i < 0 || !own(s, s.commands[i])) throw new Error('Bạn chỉ sửa được lệnh do mình tạo');
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
      return member(s) ? s.history.filter((h) => h.command_id === cid) : [];
    },
  };
}
