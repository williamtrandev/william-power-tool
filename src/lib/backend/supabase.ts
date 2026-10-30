import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Command, HistoryRow } from '../commands';
import type { OtChange, OtDay, OtEntry, OtPerson } from '../ot';
import type { AccountActivity, AccountCode, OtpCode, TeamAccount } from '../otp';
import { friendly } from './errors';
import type { Backend, DirectoryEntry, Member, User } from './types';

/** The real backend: Supabase auth + tables / RPCs (schema and access rules: supabase/setup.sql). */
export function supabaseBackend(url: string, anonKey: string): Backend {
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
      if (!data) throw new Error('Không lưu được — tải lại trang rồi thử lại');
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
      if (!data) throw new Error('Không lưu được giờ OT — tải lại trang rồi thử lại');
      return { ...data, hours: Number(data.hours) } as OtEntry;
    },
    async otDelete(id) {
      const { data, error } = await sb.from('ot_entries').delete().eq('id', id).select('id');
      if (error) throw friendly(error);
      if (!data?.length) throw new Error('Không xoá được giờ OT — tải lại trang rồi thử lại');
    },
    async otHistory(from, to) {
      // a row moved between days belongs to both the old and the new day
      const range = `and(work_date.gte.${from},work_date.lte.${to}),and(old_work_date.gte.${from},old_work_date.lte.${to})`;
      const { data, error } = await sb.from('ot_log').select('*').or(range).order('at', { ascending: false }).limit(500);
      if (error) throw friendly(error);
      const num = (v: unknown) => (v == null ? null : Number(v));
      return (data ?? []).map((r) => ({ ...r, hours: num(r.hours), old_hours: num(r.old_hours) })) as OtChange[];
    },
    async otSetDay(date, label) {
      const { error } = label.trim()
        ? await sb.from('ot_days').upsert({ work_date: date, label: label.trim() })
        : await sb.from('ot_days').delete().eq('work_date', date);
      if (error) throw friendly(error);
    },
  };
}
