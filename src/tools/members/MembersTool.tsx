import clsx from 'clsx';
import { Ban, Check, Clock, Loader2, RefreshCw, ShieldCheck, ShieldOff, UserCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Segmented } from '../../components/ui';
import type { Backend, Member, MemberRole, MemberStatus } from '../../lib/backend';
import { relTime } from '../commands/CommandCard';

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
  /** pending requests, for the badge on the tab */
  onPending: (n: number) => void;
}

/** Admin page: approve sign-ups, block accounts, grant admin. */
export function MembersTool({ active, backend, me, onToast, onPending }: Props) {
  const [rows, setRows] = useState<Member[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<MemberStatus>('pending');

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

  const count = (s: MemberStatus) => rows?.filter((m) => m.status === s).length ?? 0;
  const shown = useMemo(() => (rows ?? []).filter((m) => m.status === tab), [rows, tab]);

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[900px] space-y-3 px-4 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="text-lg font-semibold tracking-tight">Thành viên</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Duyệt tài khoản mới đăng ký, khoá tài khoản, cấp quyền admin. Chỉ admin thấy trang này.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
          </Button>
        </div>

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

        {err && <p className="rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">{err}</p>}
        {!rows && !err && (
          <p className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" /> Đang tải…
          </p>
        )}
        {rows && !shown.length && (
          <div className="flex flex-col items-center gap-2 py-10 text-[13px] text-muted">
            <Users size={22} className="text-faint" />
            {tab === 'pending' ? 'Không có yêu cầu nào đang chờ.' : 'Chưa có tài khoản nào.'}
          </div>
        )}

        {!!shown.length && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {shown.map((m) => {
              const self = m.user_id === me.user_id;
              const b = busy === m.user_id;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-fg">{m.email}</span>
                      {m.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                          <ShieldCheck size={12} /> admin
                        </span>
                      )}
                      {self && <span className="text-[11.5px] text-faint">(bạn)</span>}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      Đăng ký {relTime(m.requested_at)}
                      {m.decided_by && ` · ${m.status === 'blocked' ? 'khoá' : 'duyệt'} bởi ${m.decided_by} ${m.decided_at ? relTime(m.decided_at) : ''}`}
                    </p>
                  </div>
                  {!self && (
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
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {rows && !!shown.length && tab === 'blocked' && <p className="text-[11.5px] text-faint">Muốn xoá hẳn tài khoản: Supabase → Authentication → Users.</p>}
      </div>
    </div>
  );
}
