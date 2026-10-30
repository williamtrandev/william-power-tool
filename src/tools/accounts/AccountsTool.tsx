import clsx from 'clsx';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  ImageUp,
  Layers,
  Loader2,
  Lock,
  MonitorUp,
  CopyPlus,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Button, Kbd, Segmented } from '../../components/ui';
import type { Backend, DirectoryEntry, Member } from '../../lib/backend';
import { envKey, envRank, isProd, parseOtpText, readQrFile, systemKey, type AccountActivity, type OtpDraft, type TeamAccount } from '../../lib/otp';
import { Modal } from '../commands/Modal';
import { AccountEditor, envDot, groupCode } from './AccountEditor';

const ACCENTS = ['#2563eb', '#7c3aed', '#0d9488', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#9333ea'];
const tint = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
};
const bare = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

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

function IconBtn({ label, onClick, children, busy, className }: { label: string; onClick: () => void; children: ReactNode; busy?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className={clsx('grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-50', className)}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}

function CopyBtn({ label, text, onCopied }: { label: string; text: string; onCopied?: () => void }) {
  const [done, copy] = useCopied();
  return (
    <IconBtn label={label} onClick={() => copy(text).then(onCopied)}>
      {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </IconBtn>
  );
}

/** countdown ring around the seconds left */
function Ring({ left, period }: { left: number; period: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const low = left <= 5;
  return (
    <span className="relative grid size-7 shrink-0 place-items-center">
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
      <span className={clsx('text-[10.5px] font-semibold tabular-nums', low ? 'text-error' : 'text-fg-2')}>{left}</span>
    </span>
  );
}

// ── data ─────────────────────────────────────────────────────────────────────

interface EnvGroup {
  key: string;
  label: string;
  items: TeamAccount[];
  /** the login link most accounts of this environment use */
  link: string;
}

interface SystemGroup {
  key: string;
  label: string;
  items: TeamAccount[];
  envs: EnvGroup[];
}

const commonest = (urls: string[]) => {
  const n = new Map<string, number>();
  for (const u of urls) if (u) n.set(u, (n.get(u) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

function groupEnvs(items: TeamAccount[]): EnvGroup[] {
  const map = new Map<string, EnvGroup>();
  for (const a of items) {
    const key = envKey(a.env);
    const g = map.get(key) ?? map.set(key, { key, label: a.env.trim(), items: [], link: '' }).get(key)!;
    g.items.push(a);
  }
  const out = [...map.values()].sort((a, b) => envRank(a.label) - envRank(b.label) || a.label.localeCompare(b.label, 'vi'));
  for (const g of out) g.link = commonest(g.items.map((a) => a.url));
  return out;
}

/** accounts of each system together, A→Z, accounts without a system last */
function groupBySystem(list: TeamAccount[]): SystemGroup[] {
  const map = new Map<string, SystemGroup>();
  for (const a of list) {
    const key = systemKey(a.system);
    const g = map.get(key) ?? map.set(key, { key, label: a.system.trim(), items: [], envs: [] }).get(key)!;
    g.items.push(a);
  }
  const out = [...map.values()].sort((a, b) => (!a.key ? 1 : !b.key ? -1 : a.label.localeCompare(b.label, 'vi', { sensitivity: 'base' })));
  for (const g of out) g.envs = groupEnvs(g.items);
  return out;
}

const haystack = (a: TeamAccount) => systemKey(`${a.system} ${a.env} ${a.username} ${a.note} ${a.url} ${a.has_otp ? 'otp' : ''}`);

// the environment last opened in each system, per viewer
const ENV_KEY = 'wpt-acct-env';
const readEnvPick = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(ENV_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const ALL = '*';
const defaultEnv = (s: SystemGroup) => (s.envs.find((e) => e.key === 'sbb') ?? s.envs.find((e) => e.key === 'uat') ?? s.envs[0])?.key ?? '';

// ── live OTP codes ───────────────────────────────────────────────────────────

interface Live {
  code: string;
  next: string;
  until: number;
  period: number;
}

function usePageVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** codes of the accounts on screen, fetched together and again as each window ends */
function useLiveCodes(backend: Backend, ids: string[], on: boolean) {
  const [codes, setCodes] = useState<Map<string, Live>>(new Map());
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const key = ids.join(',');
  useEffect(() => {
    if (!on || !key) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const rows = await backend.acctCodes(key.split(','));
        if (stop) return;
        const t = Date.now();
        setFailed(false);
        setCodes((prev) => {
          const m = new Map(prev);
          for (const r of rows) m.set(r.id, { code: r.code, next: r.next_code, until: t + r.remaining * 1000, period: r.period });
          return m;
        });
        // the next code is already here, so fetching right after a window ends is never late
        timer = setTimeout(load, (rows.length ? Math.min(...rows.map((r) => r.remaining)) : 30) * 1000 + 400);
      } catch {
        if (stop) return;
        setFailed(true);
        timer = setTimeout(load, 30000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [backend, key, on]);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return { codes, failed, now };
}

const liveCode = (l: Live | undefined, now: number) => {
  if (!l) return null;
  if (now < l.until) return { code: l.code, left: Math.ceil((l.until - now) / 1000), period: l.period };
  const end = l.until + l.period * 1000;
  return now < end ? { code: l.next, left: Math.ceil((end - now) / 1000), period: l.period } : null;
};

// ── rows ─────────────────────────────────────────────────────────────────────

function PasswordCell({ acc, backend, onToast }: { acc: TeamAccount; backend: Backend; onToast: (m: string) => void }) {
  const [pw, setPw] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, copy] = useCopied();
  if (!acc.has_password) return <span className="text-[12px] text-faint">Không có mật khẩu</span>;
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
    <div className="flex min-w-0 items-center gap-0.5">
      <span className={clsx('mr-1 min-w-0 truncate font-mono text-[13px]', show && pw ? 'text-fg' : 'tracking-widest text-muted')} title={show && pw ? pw : undefined}>
        {show && pw ? pw : '••••••••'}
      </span>
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
    </div>
  );
}

function OtpCell({ acc, live, failed, now, onCopy }: { acc: TeamAccount; live?: Live; failed: boolean; now: number; onCopy: (code: string) => void }) {
  const [done, setDone] = useState(false);
  if (!acc.has_otp) return <span className="text-[12px] text-faint">Không có OTP</span>;
  const c = liveCode(live, now);
  if (!c)
    return failed ? (
      <span className="flex items-center gap-1 text-[12px] text-error" title="Không lấy được mã — sẽ thử lại sau ít giây">
        <TriangleAlert size={13} /> Lỗi lấy mã
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-[12px] text-muted">
        <Loader2 size={13} className="animate-spin" /> Đang lấy mã…
      </span>
    );
  const copy = () => {
    onCopy(c.code);
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title="Bấm để copy"
        className="focus-ring rounded px-1 font-mono text-[18px] leading-tight font-semibold tracking-[0.1em] text-fg tabular-nums hover:bg-surface-3"
      >
        {groupCode(c.code)}
      </button>
      <IconBtn label="Copy mã OTP" onClick={copy}>
        {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </IconBtn>
      <Ring left={c.left} period={c.period} />
    </div>
  );
}

/** who can use an account: one colour each, so the three kinds tell apart at a glance */
const shareOf = (a: TeamAccount) =>
  a.is_private
    ? { icon: <Lock size={11} />, label: 'Chỉ mình tôi', hint: 'Chỉ bạn thấy — kể cả admin cũng không', cls: 'bg-violet-500/12 text-violet-700 dark:text-violet-300' }
    : !a.everyone
      ? { icon: <UserCheck size={11} />, label: 'Người được chọn', hint: 'Chỉ những thành viên được chọn', cls: 'bg-amber-500/14 text-amber-700 dark:text-amber-300' }
      : { icon: <Users size={11} />, label: 'Cả team', hint: 'Mọi thành viên đã duyệt', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' };

function AccountRow({
  acc,
  envLink,
  live,
  failed,
  now,
  backend,
  onToast,
  onCopyCode,
  onEdit,
  onClone,
  onDelete,
}: {
  acc: TeamAccount;
  envLink: string;
  live?: Live;
  failed: boolean;
  now: number;
  backend: Backend;
  onToast: (m: string) => void;
  onCopyCode: (code: string) => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const share = shareOf(acc);
  const ownLink = acc.url && acc.url !== envLink;
  return (
    <div data-acc className="group/row flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 hover:bg-surface-3/30 md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(12.5rem,auto)_5.5rem]">
      <div className="min-w-0 basis-full md:basis-auto">
        <div className="flex min-w-0 items-center gap-0.5">
          <span className="truncate font-mono text-[13.5px] font-semibold text-fg" title={acc.username}>
            {acc.username}
          </span>
          <CopyBtn label="Copy tên đăng nhập" text={acc.username} onCopied={() => onToast('Đã copy tên đăng nhập')} />
        </div>
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted" title={[acc.note, acc.created_by && `Thêm bởi ${acc.created_by}`].filter(Boolean).join('\n')}>
          <span className={clsx('flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium', share.cls)} title={share.hint}>
            {share.icon}
            {share.label}
          </span>
          {acc.note && <span className="truncate">{acc.note.split('\n')[0]}</span>}
          {ownLink && (
            <a href={acc.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 shrink items-center gap-1 text-accent hover:underline">
              <span className="truncate">Link riêng: {bare(acc.url)}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
        </div>
      </div>
      <PasswordCell acc={acc} backend={backend} onToast={onToast} />
      <OtpCell acc={acc} live={live} failed={failed} now={now} onCopy={onCopyCode} />
      <div className="ml-auto flex items-center justify-end opacity-60 transition-opacity group-hover/row:opacity-100 md:ml-0">
        {!confirm && (
          <IconBtn label="Nhân bản" onClick={onClone}>
            <CopyPlus size={14} />
          </IconBtn>
        )}
        {acc.can_manage &&
          (confirm ? (
            <Button variant="danger" size="sm" onClick={onDelete} onBlur={() => setConfirm(false)} autoFocus>
              Xoá?
            </Button>
          ) : (
            <>
              <IconBtn label="Sửa" onClick={onEdit}>
                <Pencil size={14} />
              </IconBtn>
              <IconBtn label="Xoá" className="hover:text-error" onClick={() => setConfirm(true)}>
                <Trash2 size={14} />
              </IconBtn>
            </>
          ))}
      </div>
    </div>
  );
}

function EnvSection({ env, single, children }: { env: EnvGroup; single: boolean; children: ReactNode }) {
  const prod = isProd(env.label);
  return (
    <section className={clsx('overflow-hidden rounded-xl border bg-surface', prod ? 'border-error/40' : 'border-line')}>
      <header className={clsx('flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-4 py-1.5 text-[12.5px]', prod ? 'border-error/30 bg-error/8' : 'border-line bg-surface-2/60')}>
        {env.label ? (
          <span className={clsx('flex items-center gap-1.5 font-semibold', prod ? 'text-error' : 'text-fg')}>
            <span className={clsx('size-2 rounded-full', envDot(env.label))} />
            {env.label}
          </span>
        ) : (
          <span className="font-medium text-fg-2">{single ? 'Link đăng nhập' : 'Chung'}</span>
        )}
        {env.link ? (
          <span className="flex min-w-0 items-center">
            <a href={env.link} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-center gap-1 text-accent hover:underline" title={env.link}>
              <span className="truncate">{bare(env.link)}</span>
              <ExternalLink size={11} className="shrink-0" />
            </a>
            <CopyBtn label="Copy link" text={env.link} />
          </span>
        ) : (
          <span className="text-faint">Chưa có link</span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[11.5px]">
          {prod ? (
            <span className="flex items-center gap-1 font-medium text-error">
              <TriangleAlert size={12} /> Môi trường thật
            </span>
          ) : (
            <span className="text-muted">{env.items.length} tài khoản</span>
          )}
        </span>
      </header>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

// ── activity ─────────────────────────────────────────────────────────────────

const ACTION: Record<AccountActivity['action'], { label: string; cls: string }> = {
  code: { label: 'xem mã OTP', cls: 'bg-accent-soft text-accent' },
  copy: { label: 'copy mã OTP', cls: 'bg-accent-soft text-accent' },
  password: { label: 'xem mật khẩu', cls: 'bg-warn/12 text-warn' },
  create: { label: 'thêm', cls: 'bg-surface-3 text-fg-2' },
  update: { label: 'sửa', cls: 'bg-surface-3 text-fg-2' },
  delete: { label: 'xoá', cls: 'bg-error/12 text-error' },
};

function ActivityDialog({ backend, admin, onClose }: { backend: Backend; admin: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<AccountActivity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    backend.acctActivity().then(setRows, (e: Error) => setErr(e.message));
  }, [backend]);
  return (
    <Modal wide title={admin ? 'Nhật ký — ai xem mật khẩu / mã của tài khoản nào' : 'Nhật ký các tài khoản bạn tạo'} onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted">Mã OTP hiện sẵn trên màn hình nên “xem mã” chỉ ghi tối đa 1 lần/giờ cho mỗi người và mỗi tài khoản. Copy mã thì lần nào cũng ghi.</p>
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

// ── page ─────────────────────────────────────────────────────────────────────

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
}

type NewIn = { system: string; env: string; startOtp?: boolean; drafts?: OtpDraft[]; from?: TeamAccount };
type Editing = { acc: TeamAccount } | NewIn;

/** Shared accounts by system and environment: find one fast, codes shown live, add straight into the open system. */
export function AccountsTool({ active, backend, me, onToast }: Props) {
  const admin = me.role === 'admin';
  const [list, setList] = useState<TeamAccount[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [envPick, setEnvPick] = useState(readEnvPick);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [members, setMembers] = useState<DirectoryEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [drag, setDrag] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (editing) backend.directory().then(setMembers, () => {});
  }, [editing, backend]);

  const systems = useMemo(() => groupBySystem(list ?? []), [list]);
  const words = useMemo(() => systemKey(q).split(' ').filter(Boolean), [q]);
  const searching = words.length > 0;
  // while searching: only systems with a matching account, and only those accounts
  const visible = useMemo(
    () =>
      searching
        ? systems
            .map((s) => {
              const items = s.items.filter((a) => words.every((w) => haystack(a).includes(w)));
              return items.length ? { ...s, items, envs: groupEnvs(items) } : null;
            })
            .filter((s): s is SystemGroup => !!s)
        : systems,
    [systems, words, searching],
  );
  const sel = visible.find((s) => s.key === selKey) ?? visible[0] ?? null;
  const full = sel ? (systems.find((s) => s.key === sel.key) ?? null) : null;

  const saved = full ? envPick[full.key] : undefined;
  const pickedEnv = full ? (saved === ALL || full.envs.some((e) => e.key === saved) ? saved! : defaultEnv(full)) : '';
  const sections = useMemo(
    () => (!sel ? [] : searching || sel.envs.length <= 1 || pickedEnv === ALL ? sel.envs : sel.envs.filter((e) => e.key === pickedEnv)),
    [sel, searching, pickedEnv],
  );
  // where "Thêm" adds to: the open system, and its environment when one is picked (or it only has one)
  const targetEnv = !full ? '' : full.envs.length === 1 ? full.envs[0].label : !searching && pickedEnv !== ALL ? (full.envs.find((e) => e.key === pickedEnv)?.label ?? '') : '';
  const where = sel ? [sel.label || 'Chưa đặt hệ thống', targetEnv].filter(Boolean).join(' · ') : '';
  const addHere = (opts: Partial<NewIn> = {}) => setEditing({ system: sel?.label ?? '', env: targetEnv, ...opts });

  const setEnv = (k: string) => {
    if (!full) return;
    const next = { ...envPick, [full.key]: k };
    setEnvPick(next);
    try {
      localStorage.setItem(ENV_KEY, JSON.stringify(next));
    } catch {
      /* per-viewer convenience only */
    }
  };
  const open = (key: string) => {
    setSelKey(key);
    setMobileDetail(true);
  };

  // codes of the accounts on screen, while this tab and the page are in view
  const pageVisible = usePageVisible();
  const otpIds = useMemo(() => sections.flatMap((e) => e.items.filter((a) => a.has_otp).map((a) => a.id)), [sections]);
  const { codes, failed, now } = useLiveCodes(backend, otpIds, active && pageVisible && !editing);
  const copyCode = (acc: TeamAccount, code: string) =>
    navigator.clipboard.writeText(code).then(
      () => {
        onToast('Đã copy mã OTP');
        backend.acctCopied(acc.id).catch(() => {});
      },
      () => {},
    );

  // a QR image pasted or dropped on the page opens the editor for the open system, OTP filled in
  const fromImage = useCallback(
    async (file: Blob) => {
      try {
        const drafts = parseOtpText(await readQrFile(file));
        setEditing({ system: sel?.label ?? '', env: targetEnv, drafts });
      } catch (e) {
        onToast((e as Error).message);
      }
    },
    [sel, targetEnv, onToast],
  );
  useEffect(() => {
    if (!active || editing) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable) return;
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (img) {
        e.preventDefault();
        fromImage(img);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener('paste', onPaste);
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('paste', onPaste);
      removeEventListener('keydown', onKey);
    };
  }, [active, editing, fromImage]);

  const onSearchKey = (e: ReactKeyboardEvent) => {
    const i = visible.findIndex((s) => s.key === sel?.key);
    if (e.key === 'Enter' && sel) open(sel.key);
    else if (e.key === 'ArrowDown' && visible.length) {
      e.preventDefault();
      setSelKey(visible[Math.min(visible.length - 1, i + 1)].key);
    } else if (e.key === 'ArrowUp' && visible.length) {
      e.preventDefault();
      setSelKey(visible[Math.max(0, i - 1)].key);
    } else if (e.key === 'Escape') setQ('');
  };

  const remove = async (a: TeamAccount) => {
    try {
      await backend.acctDelete(a.id);
      onToast('Đã xoá tài khoản');
      load();
    } catch (e) {
      onToast((e as Error).message);
    }
  };

  const total = visible.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden', !active && 'hidden')}>
      <div className="mx-auto flex w-full max-w-[1280px] min-h-0 flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="text-lg font-semibold tracking-tight">Tài khoản dùng chung</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Gom theo hệ thống và môi trường. Mật khẩu chỉ hiện khi bấm, mã OTP tự hiện và tự đổi — mọi lần xem / copy đều được ghi lại.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </Button>
            <Button onClick={() => setShowLog(true)} title={admin ? 'Ai xem mật khẩu / mã của tài khoản nào' : 'Ai đã dùng các tài khoản bạn tạo'}>
              <History size={15} /> Nhật ký
            </Button>
            <Button variant="primary" data-tour="a-add" onClick={() => setEditing({ system: '', env: '' })}>
              <Plus size={16} /> Thêm tài khoản
            </Button>
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-3 rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">
            <span className="flex-1">{err}</span>
            <Button size="sm" onClick={load}>
              Thử lại
            </Button>
          </div>
        )}

        <div className="grid min-h-[440px] flex-1 overflow-hidden rounded-xl border border-line bg-surface lg:min-h-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* systems */}
          <aside className={clsx('min-h-0 flex-col gap-0.5 overflow-y-auto border-line bg-surface-2/50 p-2.5 lg:flex lg:border-r', mobileDetail ? 'hidden' : 'flex')}>
            <label
              data-tour="a-search"
              className="group flex h-9 shrink-0 items-center rounded-lg border border-line bg-surface focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-ring)]"
            >
              <Search size={15} className="ml-2.5 shrink-0 text-faint group-focus-within:text-accent" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="Hệ thống, tài khoản, ghi chú…"
                aria-label="Tìm hệ thống hoặc tài khoản"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] text-fg outline-none placeholder:text-faint"
              />
              {q ? (
                <button type="button" aria-label="Xoá tìm kiếm" onClick={() => setQ('')} className="mr-1.5 grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
                  <X size={14} />
                </button>
              ) : (
                <span className="mr-2 hidden lg:inline">
                  <Kbd>/</Kbd>
                </span>
              )}
            </label>
            <p className="px-1.5 pt-2 pb-1 text-[11.5px] text-faint">{searching ? `${total} tài khoản khớp · ${visible.length} hệ thống` : `${systems.length} hệ thống`}</p>
            {!list && !err && (
              <p className="flex items-center gap-2 px-2 py-3 text-[12.5px] text-muted">
                <Loader2 size={14} className="animate-spin" /> Đang tải…
              </p>
            )}
            {visible.map((s) => {
              const on = s.key === sel?.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => open(s.key)}
                  className={clsx(
                    'flex w-full shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                    on ? 'bg-accent-soft font-medium text-accent' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg',
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: s.label ? tint(s.label) : 'var(--faint)' }}>
                    {s.label ? s.label[0].toUpperCase() : '?'}
                  </span>
                  <span className={clsx('min-w-0 flex-1 truncate', !s.label && 'text-muted italic')}>{s.label || 'Chưa đặt hệ thống'}</span>
                  {!searching && (
                    <span className="flex items-center gap-1">
                      {s.envs
                        .filter((e) => e.label)
                        .map((e) => (
                          <span key={e.key} title={e.label} className={clsx('size-1.5 rounded-full', envDot(e.label))} />
                        ))}
                    </span>
                  )}
                  <span className={clsx('w-5 text-right text-[11.5px] tabular-nums', searching ? 'font-semibold' : 'text-faint')}>{s.items.length}</span>
                </button>
              );
            })}
            {list && searching && !visible.length && <p className="px-2 py-3 text-[12.5px] text-muted">Không có tài khoản nào khớp “{q.trim()}”.</p>}
          </aside>

          {/* the open system */}
          <div
            className={clsx('relative min-h-0 overflow-y-auto lg:block', mobileDetail ? 'block' : 'hidden')}
            onDragOver={(e) => {
              if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) {
                e.preventDefault();
                setDrag(true);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
              if (f) fromImage(f);
            }}
          >
            {list && !sel && (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-faint">
                  <ShieldCheck size={22} />
                </span>
                <p className="text-[13.5px] font-medium text-fg-2">{list.length ? 'Không có tài khoản nào khớp' : 'Chưa có tài khoản nào'}</p>
                {!list.length && (
                  <>
                    <p className="max-w-sm text-[12.5px] text-muted">Thêm tài khoản đầu tiên: nhập link, tên đăng nhập, mật khẩu, và quét mã QR OTP nếu có.</p>
                    <Button variant="primary" className="mt-1" onClick={() => setEditing({ system: '', env: '' })}>
                      <Plus size={15} /> Thêm tài khoản
                    </Button>
                  </>
                )}
              </div>
            )}
            {sel && full && (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Danh sách hệ thống" onClick={() => setMobileDetail(false)}>
                    <ArrowLeft size={16} />
                  </Button>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[15px] font-bold text-white" style={{ background: sel.label ? tint(sel.label) : 'var(--faint)' }}>
                    {sel.label ? sel.label[0].toUpperCase() : '?'}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <h2 className="truncate text-[16px] font-semibold text-fg">{sel.label || 'Chưa đặt hệ thống'}</h2>
                    <p className="text-[12px] text-muted">
                      {searching
                        ? `${sel.items.length} tài khoản khớp “${q.trim()}” · xoá ô tìm để xem đủ`
                        : `${full.items.length} tài khoản · ${full.items.filter((a) => a.has_otp).length} có OTP`}
                    </p>
                  </div>
                  {!searching && full.envs.length > 1 && (
                    <Segmented
                      label="Môi trường"
                      value={pickedEnv}
                      onChange={setEnv}
                      items={[
                        { id: ALL, label: 'Tất cả', icon: <Layers size={13} /> },
                        ...full.envs.map((e) => ({
                          id: e.key,
                          label: `${e.label || 'Chung'} · ${e.items.length}`,
                          icon: <span className={clsx('size-2 rounded-full', e.label ? envDot(e.label) : 'bg-faint')} />,
                        })),
                      ]}
                    />
                  )}
                </div>

                <div data-tour="a-list" className="space-y-3">
                  {sections.map((env) => (
                    <EnvSection key={env.key} env={env} single={full.envs.length === 1}>
                      {env.items.map((a) => (
                        <AccountRow
                          key={a.id}
                          acc={a}
                          envLink={env.link}
                          live={codes.get(a.id)}
                          failed={failed}
                          now={now}
                          backend={backend}
                          onToast={onToast}
                          onCopyCode={(c) => copyCode(a, c)}
                          onEdit={() => setEditing({ acc: a })}
                          onClone={() => setEditing({ system: a.system, env: a.env, from: a })}
                          onDelete={() => remove(a)}
                        />
                      ))}
                    </EnvSection>
                  ))}
                </div>

                {/* add straight into this system / environment */}
                <div data-tour="a-drop" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
                  <QrCode size={22} className="shrink-0 text-muted" />
                  <div className="min-w-0 flex-1 basis-[220px] leading-snug">
                    <p className="text-[13px] text-fg">
                      Thêm vào <b className="font-semibold">{where}</b>
                    </p>
                    <p className="text-[11.5px] text-muted">
                      Dán ảnh QR (<Kbd>Ctrl</Kbd> <Kbd>V</Kbd>), kéo thả ảnh vào đây, hoặc quét QR đang mở — hệ thống và môi trường đã điền sẵn.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => addHere({ startOtp: true })}>
                    <MonitorUp size={14} /> Quét QR
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => addHere()}>
                    <Plus size={14} /> Nhập tay
                  </Button>
                </div>
              </div>
            )}
            {drag && (
              <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 text-[14px] font-medium text-accent">
                <span className="flex items-center gap-2">
                  <ImageUp size={18} /> Thả ảnh QR để thêm vào {where}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <AccountEditor
          key={'acc' in editing ? editing.acc.id : 'new'}
          backend={backend}
          initial={'acc' in editing ? editing.acc : null}
          members={members}
          meId={me.user_id}
          admin={admin}
          systems={systems.map((s) => s.label).filter(Boolean)}
          defaultSystem={'acc' in editing ? undefined : editing.system}
          defaultEnv={'acc' in editing ? undefined : editing.env}
          startOtp={'acc' in editing ? undefined : editing.startOtp}
          initialDrafts={'acc' in editing ? undefined : editing.drafts}
          cloneFrom={'acc' in editing ? undefined : editing.from}
          accounts={list ?? []}
          onSaved={(m) => {
            onToast(m);
            load();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {showLog && <ActivityDialog backend={backend} admin={admin} onClose={() => setShowLog(false)} />}
    </div>
  );
}
