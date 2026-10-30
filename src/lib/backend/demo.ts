import { SAMPLE_COMMANDS, type Command, type HistoryRow } from '../commands';
import type { OtChange, OtDay, OtEntry, OtPerson } from '../ot';
import { cleanSecret, secondsLeft, totp, type AccountActivity, type AccountCode, type AccountInput, type TeamAccount } from '../otp';
import type { Backend, Member, MemberRole, MemberStatus, User } from './types';

/** In-memory stand-in kept in localStorage, for `npm run dev` with VITE_SUPABASE_URL=demo. Never in production builds. */
export function demoBackend(): Backend {
  const KEY = 'wpt-demo-db';
  const SESSION = 'wpt-demo-session';
  type DemoAccount = Omit<TeamAccount, 'has_password' | 'has_otp' | 'can_manage'> & { password: string | null; otp_secret: string | null; otp_algorithm: AccountInput['otp_algorithm']; members: string[] };
  type Store = { members: Member[]; commands: Command[]; history: HistoryRow[]; accounts?: DemoAccount[]; accountLog?: AccountActivity[]; ot?: OtEntry[]; otDays?: OtDay[]; otPeople?: OtPerson[]; otLog?: OtChange[] };
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
  // stands in for the ot_audit trigger
  const logOt = (s: Store, before: OtEntry | undefined, after: OtEntry | undefined) => {
    const name = (pid: string) => s.otPeople?.find((p) => p.id === pid)?.name ?? null;
    const row = after ?? before!;
    if (before && after && before.person_id === after.person_id && before.work_date === after.work_date && before.hours === after.hours && before.note === after.note) return;
    (s.otLog ??= []).unshift({
      id: Date.now() + Math.random(),
      at: now(),
      actor: sessionEmail(),
      action: !before ? 'insert' : !after ? 'delete' : 'update',
      person_id: row.person_id,
      person_name: name(row.person_id),
      work_date: row.work_date,
      hours: after?.hours ?? null,
      note: after?.note ?? null,
      old_person_name: before && after && before.person_id !== after.person_id ? name(before.person_id) : null,
      old_work_date: before && after && before.work_date !== after.work_date ? before.work_date : null,
      old_hours: before?.hours ?? null,
      old_note: before?.note ?? null,
    });
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
      if (!member(s)) throw deny();
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
      if (!member(s)) throw deny();
      const list = s.ot!;
      if (list.some((e) => e.id !== oid && e.person_id === input.person_id && e.work_date === input.work_date)) throw new Error('Người này đã có OT ngày đó — mở ô đó để sửa');
      let e = oid ? list.find((x) => x.id === oid) : undefined;
      if (oid && !e) throw new Error('Không tìm thấy giờ OT này — tải lại trang');
      const before = e && { ...e };
      if (e) Object.assign(e, input, { updated_by: sessionEmail(), updated_at: now() });
      else list.push((e = { ...input, id: id(), updated_by: sessionEmail(), updated_at: now() }));
      logOt(s, before, e);
      write(s);
      return e;
    },
    async otDelete(oid) {
      const s = read();
      seedOt(s);
      const e = s.ot!.find((x) => x.id === oid);
      if (!e || !member(s)) throw deny();
      s.ot = s.ot!.filter((x) => x.id !== oid);
      logOt(s, e, undefined);
      write(s);
    },
    async otHistory(from, to) {
      const s = read();
      if (!member(s)) throw deny();
      const inRange = (d: string | null) => !!d && d >= from && d <= to;
      return (s.otLog ?? []).filter((c) => inRange(c.work_date) || inRange(c.old_work_date)).slice(0, 500);
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
