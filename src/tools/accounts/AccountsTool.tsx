import clsx from 'clsx';
import { Check, Copy, ExternalLink, Eye, EyeOff, History, KeySquare, Loader2, Lock, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Segmented } from '../../components/ui';
import type { Backend, Member } from '../../lib/backend';
import type { AccountActivity, TeamAccount } from '../../lib/otp';
import { Modal } from '../commands/Modal';
import { AccountEditor, groupCode } from './AccountEditor';

const ACCENTS = ['#2563eb', '#7c3aed', '#0d9488', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#9333ea'];
const tint = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
};
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

function useCopied() {
  const [done, setDone] = useState(false);
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      },
      () => {},
    );
  return [done, copy] as const;
}

function IconBtn({ label, onClick, children, busy }: { label: string; onClick: () => void; children: ReactNode; busy?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}

/** label · value · actions, the same row shape as a note */
function Row({ label, children, actions }: { label: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="group/row flex min-h-9 items-center gap-3 px-3 py-0.5 hover:bg-surface-3/40">
      <span className="w-[5.5rem] shrink-0 text-[12px] text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      <span className="flex shrink-0 items-center opacity-70 transition-opacity group-hover/row:opacity-100">{actions}</span>
    </div>
  );
}

/** countdown ring around the seconds left */
function Ring({ left, period }: { left: number; period: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const low = left <= 5;
  return (
    <span className="relative grid size-8 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={low ? 'var(--lv-error)' : 'var(--accent)'}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left / period)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className={clsx('text-[11px] font-semibold tabular-nums', low ? 'text-error' : 'text-fg-2')}>{left}</span>
    </span>
  );
}

function PasswordRow({ acc, backend, onToast }: { acc: TeamAccount; backend: Backend; onToast: (m: string) => void }) {
  const [pw, setPw] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, copy] = useCopied();
  // fetched (and logged) only when asked for; forgotten again after a minute
  const fetchPw = async () => {
    if (pw) return pw;
    setBusy(true);
    try {
      const p = await backend.acctPassword(acc.id);
      setPw(p);
      setTimeout(() => {
        setPw(null);
        setShow(false);
      }, 60000);
      return p;
    } catch (e) {
      onToast((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row
      label="Mật khẩu"
      actions={
        <>
          <IconBtn
            label={show ? 'Ẩn' : 'Hiện mật khẩu'}
            busy={busy && !show}
            onClick={async () => {
              if (show) return setShow(false);
              if (await fetchPw()) setShow(true);
            }}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconBtn>
          <IconBtn
            label="Copy mật khẩu"
            onClick={async () => {
              const p = await fetchPw();
              if (p) copy(p).then(() => onToast('Đã copy mật khẩu'));
            }}
          >
            {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </IconBtn>
        </>
      }
    >
      <span className={clsx('font-mono text-[13px] break-all', show && pw ? 'text-fg' : 'tracking-widest text-muted')}>{show && pw ? pw : '••••••••••'}</span>
    </Row>
  );
}

type Shown = { code: string; until: number; period: number; next?: { code: string; until: number } };

function OtpRow({ acc, backend, onToast }: { acc: TeamAccount; backend: Backend; onToast: (m: string) => void }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [done, copy] = useCopied();

  // each request is logged, so a code is fetched on demand and kept for its own window plus the next one
  const get = async () => {
    setBusy(true);
    try {
      const r = await backend.acctCode(acc.id);
      const until = Date.now() + r.remaining * 1000;
      setShown({ code: r.code, until, period: r.period, next: { code: r.next_code, until: until + r.period * 1000 } });
      copy(r.code).then(() => onToast('Đã copy mã OTP'));
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [shown]);
  useEffect(() => {
    if (!shown || now < shown.until) return;
    setShown(shown.next ? { code: shown.next.code, until: shown.next.until, period: shown.period } : null);
  }, [now, shown]);
  const left = shown ? Math.max(0, Math.ceil((shown.until - now) / 1000)) : 0;

  return (
    <Row
      label="Mã OTP"
      actions={
        shown && (
          <>
            <IconBtn label="Copy mã" onClick={() => copy(shown.code)}>
              {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </IconBtn>
            <Ring left={left} period={shown.period} />
          </>
        )
      }
    >
      {shown ? (
        <button type="button" onClick={() => copy(shown.code)} title="Bấm để copy" className="focus-ring rounded font-mono text-[20px] leading-tight font-semibold tracking-[0.12em] text-fg tabular-nums">
          {groupCode(shown.code)}
        </button>
      ) : (
        <Button variant="primary" size="sm" disabled={busy} onClick={get}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeySquare size={14} />} Lấy mã
        </Button>
      )}
    </Row>
  );
}

function AccountCard({
  acc,
  backend,
  admin,
  onToast,
  onEdit,
  onDelete,
}: {
  acc: TeamAccount;
  backend: Backend;
  admin: boolean;
  onToast: (m: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [doneUser, copyUser] = useCopied();
  const title = acc.system || acc.username;
  return (
    <article className="group flex flex-col rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
      <header className="flex items-start gap-3 p-4 pb-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-white" style={{ background: tint(title) }}>
          {title.trim()[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-fg">{title}</p>
          {acc.url ? (
            <a href={acc.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 text-[12px] text-accent hover:underline" title={acc.url}>
              <span className="truncate">{acc.url.replace(/^https?:\/\//, '')}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
          ) : (
            <p className="text-[12px] text-faint">Chưa có link</p>
          )}
        </div>
        {admin && (
          <div className="-mt-1 -mr-1 flex items-center opacity-60 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" aria-label="Sửa" title="Sửa" onClick={onEdit}>
              <Pencil size={15} />
            </Button>
            {confirm ? (
              <>
                <Button variant="danger" size="sm" onClick={onDelete}>
                  Xoá
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                  Huỷ
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon-sm" aria-label="Xoá" title="Xoá" className="hover:text-error" onClick={() => setConfirm(true)}>
                <Trash2 size={15} />
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="mx-3 rounded-lg border border-line bg-surface-2 py-1">
        <Row
          label="Đăng nhập"
          actions={
            <IconBtn label="Copy tên đăng nhập" onClick={() => copyUser(acc.username).then(() => onToast('Đã copy tên đăng nhập'))}>
              {doneUser ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </IconBtn>
          }
        >
          <span className="font-mono text-[13px] break-all text-fg">{acc.username}</span>
        </Row>
        {acc.has_password && <PasswordRow acc={acc} backend={backend} onToast={onToast} />}
        {acc.has_otp && <OtpRow acc={acc} backend={backend} onToast={onToast} />}
      </div>

      {acc.note && <p className="mx-4 mt-2.5 text-[12.5px] whitespace-pre-line text-muted">{acc.note}</p>}
      <p className="mt-auto flex items-center gap-1.5 px-4 pt-3 pb-3 text-[11.5px] text-faint">
        {acc.everyone ? <Users size={12} /> : <Lock size={12} />}
        {acc.everyone ? 'Cả team' : 'Người được chọn'}
        {!acc.has_otp && <span className="ml-auto">Không có OTP</span>}
      </p>
    </article>
  );
}

const ACTION: Record<AccountActivity['action'], { label: string; cls: string }> = {
  code: { label: 'lấy mã OTP', cls: 'bg-accent-soft text-accent' },
  password: { label: 'xem mật khẩu', cls: 'bg-warn/12 text-warn' },
  create: { label: 'thêm', cls: 'bg-surface-3 text-fg-2' },
  update: { label: 'sửa', cls: 'bg-surface-3 text-fg-2' },
  delete: { label: 'xoá', cls: 'bg-error/12 text-error' },
};

function ActivityDialog({ backend, onClose }: { backend: Backend; onClose: () => void }) {
  const [rows, setRows] = useState<AccountActivity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    backend.acctActivity().then(setRows, (e: Error) => setErr(e.message));
  }, [backend]);
  return (
    <Modal wide title="Nhật ký — ai xem mật khẩu / lấy mã của tài khoản nào" onClose={onClose}>
      {err && <p className="text-[13px] text-error">{err}</p>}
      {!rows && !err && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={15} className="animate-spin" /> Đang tải…
        </p>
      )}
      {rows && !rows.length && <p className="text-[13px] text-muted">Chưa có hoạt động nào.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11.5px] text-faint">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Thời gian</th>
              <th className="py-1.5 pr-3 font-medium">Người</th>
              <th className="py-1.5 pr-3 font-medium">Hành động</th>
              <th className="py-1.5 font-medium">Tài khoản</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{new Date(r.at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td className="py-1.5 pr-3 text-fg-2">{r.user_email?.split('@')[0] ?? '—'}</td>
                <td className="py-1.5 pr-3">
                  <span className={clsx('rounded px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap', ACTION[r.action].cls)}>{ACTION[r.action].label}</span>
                </td>
                <td className="py-1.5 text-fg">{r.account}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

type Filter = 'all' | 'otp' | 'password';

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
}

/** Shared accounts: link, username, password and OTP in one card; secrets revealed on demand, logged. */
export function AccountsTool({ active, backend, me, onToast }: Props) {
  const admin = me.role === 'admin';
  const [list, setList] = useState<TeamAccount[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<TeamAccount | 'new' | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await backend.acctList());
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [backend]);
  useEffect(() => {
    if (active && !list && !loading && !err) load();
  }, [active, list, loading, err, load]);
  useEffect(() => {
    if (admin && editing) backend.members().then((m) => setMembers(m.filter((x) => x.status === 'approved')), () => {});
  }, [admin, editing, backend]);

  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return (list ?? []).filter(
      (a) =>
        (filter === 'all' || (filter === 'otp' ? a.has_otp : a.has_password)) &&
        words.every((w) => fold(`${a.system} ${a.username} ${a.url} ${a.note}`).includes(w)),
    );
  }, [list, q, filter]);
  const count = (f: Filter) => (list ?? []).filter((a) => f === 'all' || (f === 'otp' ? a.has_otp : a.has_password)).length;

  const remove = async (a: TeamAccount) => {
    try {
      await backend.acctDelete(a.id);
      onToast('Đã xoá tài khoản');
      load();
    } catch (e) {
      onToast((e as Error).message);
    }
  };

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[300px]">
            <h1 className="text-lg font-semibold tracking-tight">Tài khoản dùng chung</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Mỗi tài khoản gom đủ link, tên đăng nhập, mật khẩu và mã OTP. Mật khẩu và secret OTP được giữ trên máy chủ — chỉ hiện khi bạn bấm, và mỗi lần đều được ghi lại.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </Button>
            {admin && (
              <>
                <Button onClick={() => setShowLog(true)}>
                  <History size={15} /> Nhật ký
                </Button>
                <Button variant="primary" data-tour="a-add" onClick={() => setEditing('new')}>
                  <Plus size={16} /> Thêm tài khoản
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            data-tour="a-search"
            className="group relative flex h-9 min-w-[240px] flex-1 items-center rounded-lg border border-line bg-surface focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-ring)] sm:max-w-md"
          >
            <Search size={16} className="ml-3 shrink-0 text-faint group-focus-within:text-accent" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm hệ thống, tên đăng nhập, link, ghi chú…"
              aria-label="Tìm tài khoản"
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13.5px] text-fg outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" aria-label="Xoá tìm kiếm" onClick={() => setQ('')} className="mr-1.5 grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
                <X size={14} />
              </button>
            )}
          </label>
          <Segmented
            label="Lọc"
            value={filter}
            onChange={setFilter}
            items={[
              { id: 'all', label: `Tất cả · ${count('all')}`, icon: <Users size={15} /> },
              { id: 'otp', label: `Có OTP · ${count('otp')}`, icon: <KeySquare size={15} /> },
              { id: 'password', label: `Có mật khẩu · ${count('password')}`, icon: <Lock size={15} /> },
            ]}
          />
        </div>

        {err && (
          <div className="flex items-center gap-3 rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">
            <span className="flex-1">{err}</span>
            <Button size="sm" onClick={load}>
              Thử lại
            </Button>
          </div>
        )}
        {!list && !err && (
          <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
            <Loader2 size={16} className="animate-spin" /> Đang tải…
          </p>
        )}
        {list && !shown.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-faint">
              <ShieldCheck size={22} />
            </span>
            <p className="text-[13.5px] font-medium text-fg-2">{list.length ? 'Không có tài khoản nào khớp' : 'Chưa có tài khoản nào'}</p>
            <p className="max-w-sm text-[12.5px] text-muted">
              {list.length
                ? ''
                : admin
                  ? 'Bấm “Thêm tài khoản”: nhập link, tên đăng nhập, mật khẩu, và quét mã QR OTP nếu có.'
                  : 'Nhờ admin thêm tài khoản cần dùng.'}
            </p>
          </div>
        )}

        <div data-tour="a-list" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <AccountCard key={a.id} acc={a} backend={backend} admin={admin} onToast={onToast} onEdit={() => setEditing(a)} onDelete={() => remove(a)} />
          ))}
        </div>
      </div>

      {editing && (
        <AccountEditor
          key={editing === 'new' ? 'new' : editing.id}
          backend={backend}
          initial={editing === 'new' ? null : editing}
          members={members}
          onSaved={(m) => {
            onToast(m);
            load();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {showLog && <ActivityDialog backend={backend} onClose={() => setShowLog(false)} />}
    </div>
  );
}
