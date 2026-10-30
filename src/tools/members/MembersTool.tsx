import clsx from 'clsx';
import { Ban, Check, Clock, Loader2, RefreshCw, Search, ShieldCheck, ShieldOff, UserCheck, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Segmented } from '../../components/ui';
import type { Backend, Member, MemberRole, MemberStatus } from '../../lib/backend';
import { relTime } from '../../lib/format';

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
  /** pending requests, for the badge on the tab */
  onPending: (n: number) => void;
}

const EMPTY: Record<MemberStatus, string> = {
  pending: 'Không có ai đang chờ duyệt.',
  approved: 'Chưa duyệt ai — người mới đăng ký sẽ nằm ở tab “Chờ duyệt”.',
  blocked: 'Chưa khoá tài khoản nào.',
};

/** Admin page: approve sign-ups, block accounts, grant admin. */
export function MembersTool({ active, backend, me, onToast, onPending }: Props) {
  const [rows, setRows] = useState<Member[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<MemberStatus>('pending');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await backend.members();
      setRows(r);
      setErr(null);
      onPending(r.filter((m) => m.status === 'pending').length);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [backend, onPending]);

  // keep the pending badge fresh even when the tab is closed
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    addEventListener('focus', load);
    return () => {
      clearInterval(t);
      removeEventListener('focus', load);
    };
  }, [load]);
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const set = async (m: Member, status: MemberStatus, role: MemberRole, msg: string) => {
    setBusy(m.user_id);
    try {
      await backend.setMember(m.user_id, status, role);
      onToast(msg);
      await load();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // you are shown on your own card, never in the lists you manage
  const self = rows?.find((m) => m.user_id === me.user_id) ?? me;
  const others = useMemo(() => (rows ?? []).filter((m) => m.user_id !== me.user_id), [rows, me.user_id]);
  const count = (s: MemberStatus) => others.filter((m) => m.status === s).length;
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return others.filter((m) => m.status === tab && (!w || m.email.includes(w) || (m.full_name ?? '').toLowerCase().includes(w)));
  }, [others, tab, q]);
  const admins = others.filter((m) => m.status === 'approved' && m.role === 'admin').length + 1;

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[920px] space-y-4 px-4 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="text-lg font-semibold tracking-tight">Thành viên</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Duyệt người mới đăng ký, khoá tài khoản, cấp quyền admin.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </Button>
        </div>

        {/* your own account */}
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-gradient-to-r from-accent-soft to-transparent px-4 py-3.5">
          <Avatar src={self.avatar_url} name={self.full_name} email={self.email} size={40} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              <span className="truncate">{self.full_name || self.email}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-white">
                <ShieldCheck size={11} /> Admin
              </span>
            </p>
            <p className="truncate text-[12px] text-muted">
              {self.full_name ? `${self.email} · ` : ''}Tài khoản của bạn — không tự đổi quyền được
            </p>
          </div>
          <div className="flex gap-5 text-center max-sm:w-full max-sm:justify-around max-sm:border-t max-sm:border-accent/15 max-sm:pt-2.5">
            {(
              [
                ['Thành viên', count('approved') + 1],
                ['Admin', admins],
                ['Chờ duyệt', count('pending')],
              ] as const
            ).map(([label, n]) => (
              <div key={label}>
                <p className={clsx('text-[17px] font-semibold tabular-nums', label === 'Chờ duyệt' && n > 0 ? 'text-error' : 'text-fg')}>{n}</p>
                <p className="text-[11px] text-faint">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Trạng thái"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'pending', label: `Chờ duyệt ${count('pending')}`, icon: <Clock size={15} /> },
              { id: 'approved', label: `Đã duyệt ${count('approved')}`, icon: <UserCheck size={15} /> },
              { id: 'blocked', label: `Đã khoá ${count('blocked')}`, icon: <Ban size={15} /> },
            ]}
          />
          <label className="relative ml-auto flex h-8 w-full items-center sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-2.5 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tên hoặc email…"
              aria-label="Tìm thành viên"
              className="focus-ring h-8 w-full rounded-md border border-line bg-surface pr-8 pl-8 text-[13px] text-fg placeholder:text-faint"
            />
            {q && (
              <button type="button" aria-label="Xoá tìm kiếm" onClick={() => setQ('')} className="absolute right-1.5 grid size-6 place-items-center rounded text-muted hover:text-fg">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        {err && <p className="rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">{err}</p>}
        {!rows && !err && (
          <p className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" /> Đang tải…
          </p>
        )}
        {rows && !shown.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-12 text-center text-[13px] text-muted">
            <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-faint">
              <Users size={20} />
            </span>
            {q ? 'Không có ai khớp tìm kiếm.' : EMPTY[tab]}
          </div>
        )}

        {!!shown.length && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {shown.map((m) => {
              const b = busy === m.user_id;
              return (
                <li key={m.user_id} className="animate-in flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2/50">
                  <Avatar src={m.avatar_url} name={m.full_name} email={m.email} size={36} />
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-fg">{m.full_name || m.email}</span>
                      {m.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                          <ShieldCheck size={12} /> admin
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[12px] text-muted">
                      {m.full_name && <>{m.email} · </>}
                      <span className="text-faint">
                        đăng ký {relTime(m.requested_at)}
                        {m.decided_by && m.decided_at && ` · ${m.status === 'blocked' ? 'khoá' : 'duyệt'} bởi ${m.decided_by.split('@')[0]} ${relTime(m.decided_at)}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {b && <Loader2 size={15} className="animate-spin text-muted" />}
                    {m.status === 'pending' && (
                      <>
                        <Button variant="primary" size="sm" disabled={b} onClick={() => set(m, 'approved', 'member', `Đã duyệt ${m.email}`)}>
                          <Check size={14} /> Duyệt
                        </Button>
                        <Button size="sm" disabled={b} onClick={() => set(m, 'blocked', 'member', `Đã từ chối ${m.email}`)}>
                          <Ban size={14} /> Từ chối
                        </Button>
                      </>
                    )}
                    {m.status === 'approved' &&
                      (m.role === 'admin' ? (
                        <Button size="sm" disabled={b} onClick={() => set(m, 'approved', 'member', `${m.email} không còn là admin`)}>
                          <ShieldOff size={14} /> Bỏ admin
                        </Button>
                      ) : (
                        <Button size="sm" disabled={b} onClick={() => set(m, 'approved', 'admin', `${m.email} là admin`)}>
                          <ShieldCheck size={14} /> Cấp admin
                        </Button>
                      ))}
                    {m.status === 'approved' && (
                      <Button size="sm" className="hover:text-error" disabled={b} onClick={() => set(m, 'blocked', 'member', `Đã khoá ${m.email}`)}>
                        <Ban size={14} /> Khoá
                      </Button>
                    )}
                    {m.status === 'blocked' && (
                      <Button size="sm" disabled={b} onClick={() => set(m, 'approved', 'member', `Đã mở khoá ${m.email}`)}>
                        <UserCheck size={14} /> Cho vào lại
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {tab === 'blocked' && !!shown.length && <p className="text-[11.5px] text-faint">Muốn xoá hẳn tài khoản: Supabase → Authentication → Users.</p>}
      </div>
    </div>
  );
}
