import clsx from 'clsx';
import {
  Ban,
  Check,
  GitMerge,
  Hourglass,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Sun,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Backend, User } from '../../lib/backend';
import { Logo } from '../AppHeader';
import { Avatar, Button } from '../ui';

type ShellProps = { theme: 'light' | 'dark'; onToggleTheme: () => void };

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

// ── backdrop + frame ─────────────────────────────────────────────────────────

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="auth-blob absolute -top-[18%] -left-[10%] size-[42rem] rounded-full bg-accent opacity-[0.16] blur-[110px] dark:opacity-[0.22]"
        style={{ '--t': '24s' } as CSSProperties}
      />
      <div
        className="auth-blob absolute top-[30%] -right-[12%] size-[36rem] rounded-full bg-violet-500 opacity-[0.12] blur-[110px] dark:opacity-[0.18]"
        style={{ '--t': '28s', '--d': '-6s' } as CSSProperties}
      />
      <div
        className="auth-blob absolute -bottom-[25%] left-[25%] size-[34rem] rounded-full bg-teal-400 opacity-[0.10] blur-[110px] dark:opacity-[0.12]"
        style={{ '--t': '32s', '--d': '-12s' } as CSSProperties}
      />
      <div className="auth-grid absolute inset-0" />
    </div>
  );
}

function Frame({ children, theme, onToggleTheme }: ShellProps & { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg">
      <Backdrop />
      <header className="relative z-10 flex h-14 shrink-0 items-center px-5 sm:px-8">
        <Logo />
        <Button variant="ghost" size="icon" className="ml-auto" aria-label="Đổi giao diện sáng/tối" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pt-4 pb-12 sm:px-8">{children}</main>
    </div>
  );
}

function Card({ children, className, d = 0 }: { children: ReactNode; className?: string; d?: number }) {
  return (
    <div
      style={delay(d)}
      className={clsx(
        'auth-rise w-full rounded-2xl border border-line/80 bg-surface/85 p-7 shadow-[0_24px_80px_-24px_rgb(0_0_0/0.35)] backdrop-blur-xl sm:p-8',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── marketing side of the sign-in page ───────────────────────────────────────

const FEATURES = [
  { icon: ScrollText, title: 'Đọc log siêu nhanh', text: 'File hàng trăm MB, lọc lỗi, ghép request theo trace id giữa các hệ thống.' },
  { icon: KeyRound, title: 'Giải mã Watane', text: 'AES ngay trên trình duyệt, cả file Excel / CSV — key không rời máy bạn.' },
  { icon: SquareTerminal, title: 'Kho lệnh dùng chung', text: 'Lệnh server và SQL của team, điền biến rồi copy là chạy.' },
];

const PREVIEW: { t: string; lv: 'INFO' | 'WARN' | 'ERROR'; sys: string; msg: string }[] = [
  { t: '10:42:01.208', lv: 'INFO', sys: 'gateway', msg: 'POST /api/orders 200 · 84ms' },
  { t: '10:42:01.611', lv: 'WARN', sys: 'core', msg: 'retry redis tcp://redis:6403 (2/3)' },
  { t: '10:42:02.034', lv: 'ERROR', sys: 'core', msg: 'Connection refused [tcp://redis:6403]' },
  { t: '10:42:02.190', lv: 'INFO', sys: 'bo', msg: 'trace 7f3c9a… · 3 hệ thống · 412ms' },
];
const LV_CLS = { INFO: 'text-info bg-info/10', WARN: 'text-warn bg-warn/12', ERROR: 'text-error bg-error/12' };

function Showcase() {
  return (
    <div className="hidden max-w-xl lg:block">
      <span
        style={delay(0)}
        className="auth-rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[12px] font-medium text-muted backdrop-blur"
      >
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Công cụ nội bộ cho IT · QC · vận hành
      </span>
      <h1 style={delay(80)} className="auth-rise mt-5 text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-fg">
        Truy lỗi, giải mã, chạy lệnh —{' '}
        <span className="bg-gradient-to-r from-accent via-violet-500 to-teal-500 bg-clip-text text-transparent">gọn trong một chỗ.</span>
      </h1>
      <p style={delay(160)} className="auth-rise mt-4 max-w-md text-[15px] leading-relaxed text-muted">
        William Tool gom những việc lặp lại mỗi ngày của team vào một trang. Log được đọc ngay trên máy bạn, không tải lên đâu cả.
      </p>

      <ul className="mt-8 space-y-4">
        {FEATURES.map((f, i) => (
          <li key={f.title} style={delay(240 + i * 80)} className="auth-rise flex gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface/80 text-accent shadow-sm">
              <f.icon size={19} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-fg">{f.title}</p>
              <p className="text-[13px] text-muted">{f.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div style={delay(520)} className="auth-rise mt-9 overflow-hidden rounded-xl border border-line bg-surface/80 shadow-xl backdrop-blur">
        <div className="flex items-center gap-1.5 border-b border-line px-3.5 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 flex items-center gap-1.5 text-[11.5px] text-faint">
            <GitMerge size={13} /> trace 7f3c9a · gateway → core → bo
          </span>
        </div>
        <div className="space-y-1.5 px-3.5 py-3 font-mono text-[11.5px]">
          {PREVIEW.map((l, i) => (
            <div key={i} style={delay(900 + i * 420)} className={clsx('auth-line flex items-center gap-2.5 whitespace-nowrap', l.lv === 'ERROR' && 'rounded bg-error/6 -mx-1.5 px-1.5')}>
              <span className="text-faint">{l.t}</span>
              <span className={clsx('w-12 rounded px-1 text-center text-[10.5px] font-semibold', LV_CLS[l.lv])}>{l.lv}</span>
              <span className="w-14 text-muted">{l.sys}</span>
              <span className="truncate text-fg-2">{l.msg}</span>
            </div>
          ))}
          <div style={delay(900 + PREVIEW.length * 420)} className="auth-line flex items-center gap-1 text-faint">
            <span className="text-accent">❯</span> <span className="inline-block h-3.5 w-1.5 animate-pulse bg-accent/70" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── sign-in ──────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** error passed back in the URL when the Google round-trip fails */
function takeUrlError(): string | null {
  const q = new URLSearchParams(location.search);
  const msg = q.get('error_description') || q.get('error');
  if (!msg) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  return /access_denied/i.test(msg) ? 'Bạn đã huỷ đăng nhập Google' : decodeURIComponent(msg.replace(/\+/g, ' '));
}

const FLOW = [
  { icon: GoogleIcon, label: 'Đăng nhập bằng Google' },
  { icon: () => <Hourglass size={15} />, label: 'Admin duyệt tài khoản' },
  { icon: () => <Check size={15} strokeWidth={2.5} />, label: 'Bắt đầu dùng' },
];

const DEMO_ACCOUNTS = ['admin@demo', 'qc@demo', 'newbie@demo'];

export function LoginScreen({ backend, ...p }: ShellProps & { backend: Backend }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; n: number } | null>(() => {
    const m = takeUrlError();
    return m ? { msg: m, n: 0 } : null;
  });

  const google = async () => {
    setBusy(true);
    setErr(null);
    try {
      await backend.signInWithGoogle(); // the page navigates away on success
    } catch (e) {
      setErr((x) => ({ msg: (e as Error).message, n: (x?.n ?? 0) + 1 }));
      setBusy(false);
    }
  };

  return (
    <Frame {...p}>
      <div className="grid w-full max-w-6xl items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
        <Showcase />
        <Card d={120} className="mx-auto max-w-[420px]">
          <h2 className="text-[22px] font-semibold tracking-tight">Đăng nhập William Tool</h2>
          <p className="mt-1.5 text-[13.5px] text-muted">Dùng tài khoản Google của bạn. Lần đầu đăng nhập sẽ tự tạo tài khoản và chờ admin duyệt.</p>

          <button
            type="button"
            onClick={google}
            disabled={busy}
            className="focus-ring auth-shine relative mt-7 flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-line bg-white text-[15px] font-medium text-zinc-800 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-lg active:translate-y-0 disabled:pointer-events-none disabled:opacity-60 dark:border-transparent"
          >
            {busy ? <Loader2 size={19} className="animate-spin text-zinc-500" /> : <GoogleIcon />}
            {busy ? 'Đang chuyển tới Google…' : 'Tiếp tục với Google'}
          </button>

          {err && (
            <div key={err.n} role="alert" className="auth-shake mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/8 px-3 py-2.5 text-[13px] text-error">
              <TriangleAlert size={16} className="mt-px shrink-0" />
              {err.msg}
            </div>
          )}

          {backend.signInAs && (
            <div className="mt-4 rounded-lg border border-dashed border-warn/50 bg-warn/8 p-3">
              <p className="text-[12px] font-medium text-warn">Chế độ demo (chỉ chạy trên máy dev) — vào nhanh bằng:</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((e) => (
                  <Button key={e} size="sm" onClick={() => backend.signInAs!(e)}>
                    {e}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <ol className="mt-7 flex items-start justify-between gap-2 border-t border-line pt-6">
            {FLOW.map((f, i) => (
              <li key={f.label} style={delay(400 + i * 120)} className="auth-rise relative flex flex-1 flex-col items-center gap-2 text-center">
                {i < FLOW.length - 1 && <span className="absolute top-[18px] left-[calc(50%+24px)] h-px w-[calc(100%-48px)] bg-line" />}
                <span className="grid size-9 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                  <f.icon />
                </span>
                <span className="text-[11.5px] leading-tight text-muted">{f.label}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-start gap-2 rounded-lg bg-surface-2/70 px-3 py-2.5 text-[12px] text-muted">
            <ShieldCheck size={15} className="mt-px shrink-0 text-emerald-500" />
            <span>Chỉ tài khoản được admin duyệt mới vào được hệ thống. William Tool không thấy và không lưu mật khẩu Google của bạn.</span>
          </div>
        </Card>
      </div>
    </Frame>
  );
}

// ── waiting / blocked / loading ──────────────────────────────────────────────

function UserChip({ user }: { user: User }) {
  return (
    <div className="mx-auto mt-5 flex w-fit max-w-full items-center gap-2.5 rounded-full border border-line bg-surface-2/70 py-1 pr-4 pl-1">
      <Avatar src={user.avatar} name={user.name} email={user.email} size={28} />
      <div className="min-w-0 text-left leading-tight">
        {user.name && <p className="truncate text-[12.5px] font-medium text-fg">{user.name}</p>}
        <p className={clsx('truncate text-muted', user.name ? 'text-[11.5px]' : 'text-[12.5px]')}>{user.email}</p>
      </div>
    </div>
  );
}

function StatusIcon({ tone, children }: { tone: 'accent' | 'error' | 'warn'; children: ReactNode }) {
  const ring = { accent: 'bg-accent/25', error: 'bg-error/25', warn: 'bg-warn/25' }[tone];
  const core = { accent: 'bg-accent-soft text-accent', error: 'bg-error/12 text-error', warn: 'bg-warn/12 text-warn' }[tone];
  return (
    <div className="relative mx-auto grid size-16 place-items-center">
      {tone === 'accent' && (
        <>
          <span className={clsx('auth-ring absolute inset-0 rounded-full', ring)} />
          <span className={clsx('auth-ring absolute inset-0 rounded-full', ring)} style={{ '--d': '1.2s' } as CSSProperties} />
        </>
      )}
      <span className={clsx('relative grid size-16 place-items-center rounded-full', core)}>{children}</span>
    </div>
  );
}

const STEPS = ['Đăng nhập thành công', 'Admin duyệt tài khoản', 'Vào hệ thống'];

function PendingSteps() {
  return (
    <ol className="mt-6 space-y-0 text-left">
      {STEPS.map((s, i) => {
        const done = i === 0;
        const now = i === 1;
        return (
          <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
            {i < STEPS.length - 1 && <span className={clsx('absolute top-6 bottom-0 left-[11px] w-px', done ? 'bg-emerald-500/50' : 'bg-line')} />}
            <span
              className={clsx(
                'relative grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                done && 'bg-emerald-500 text-white',
                now && 'bg-accent-soft text-accent ring-2 ring-accent/40',
                !done && !now && 'bg-surface-3 text-faint',
              )}
            >
              {done ? <Check size={13} strokeWidth={3} /> : now ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : i + 1}
            </span>
            <div className="pt-0.5">
              <p className={clsx('text-[13.5px]', now ? 'font-semibold text-fg' : done ? 'text-fg-2' : 'text-faint')}>{s}</p>
              {now && <p className="text-[12px] text-muted">Đang chờ — trang sẽ tự vào khi được duyệt</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface WaitingProps extends ShellProps {
  kind: 'pending' | 'blocked' | 'error';
  user?: User;
  message?: string;
  onSignOut: () => void;
  onRefresh: () => Promise<void> | void;
}

export function WaitingScreen({ kind, user, message, onSignOut, onRefresh, ...p }: WaitingProps) {
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  // restart the countdown bar whenever the user checks by hand
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!checked) return;
    const t = setTimeout(() => setChecked(false), 2500);
    return () => clearTimeout(t);
  }, [checked]);

  const check = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
    setChecked(true);
    setCycle((c) => c + 1);
  };

  return (
    <Frame {...p}>
      <Card className="max-w-[440px] text-center">
        {kind === 'pending' && (
          <>
            <StatusIcon tone="accent">
              <Hourglass size={26} />
            </StatusIcon>
            <h2 className="mt-5 text-[21px] font-semibold tracking-tight">Đang chờ admin duyệt</h2>
            <p className="mt-1.5 text-[13.5px] text-muted">Yêu cầu truy cập của bạn đã được gửi. Admin duyệt xong là bạn vào được ngay, không cần tải lại trang.</p>
            {user && <UserChip user={user} />}
            <PendingSteps />
            <div className="mt-6 overflow-hidden rounded-full bg-surface-3">
              <div key={cycle} className="auth-progress h-1 rounded-full bg-accent/70" style={{ '--t': '20s' } as CSSProperties} />
            </div>
            <p className="mt-1.5 text-[11.5px] text-faint">{checked ? 'Vẫn đang chờ duyệt — sẽ tiếp tục tự kiểm tra' : 'Tự kiểm tra mỗi 20 giây'}</p>
          </>
        )}
        {kind === 'blocked' && (
          <>
            <StatusIcon tone="error">
              <Ban size={26} />
            </StatusIcon>
            <h2 className="mt-5 text-[21px] font-semibold tracking-tight">Không có quyền truy cập</h2>
            <p className="mt-1.5 text-[13.5px] text-muted">Tài khoản này đã bị từ chối hoặc khoá. Liên hệ admin nếu bạn nghĩ đây là nhầm lẫn.</p>
            {user && <UserChip user={user} />}
          </>
        )}
        {kind === 'error' && (
          <>
            <StatusIcon tone="warn">
              <TriangleAlert size={26} />
            </StatusIcon>
            <h2 className="mt-5 text-[21px] font-semibold tracking-tight">Không kiểm tra được quyền truy cập</h2>
            <p className="mt-1.5 text-[13.5px] text-muted">{message}</p>
          </>
        )}
        <div className="mt-6 flex gap-2">
          {kind !== 'blocked' && (
            <Button className="h-10 flex-1" disabled={busy} onClick={check}>
              <RefreshCw size={15} className={clsx(busy && 'animate-spin')} /> Kiểm tra ngay
            </Button>
          )}
          <Button variant="ghost" className="h-10 flex-1" onClick={onSignOut}>
            <LogOut size={15} /> {kind === 'error' ? 'Đăng xuất' : 'Dùng tài khoản khác'}
          </Button>
        </div>
      </Card>
    </Frame>
  );
}

export function LoadingScreen(p: ShellProps) {
  return (
    <Frame {...p}>
      <div className="auth-rise flex flex-col items-center gap-4 text-[13px] text-muted">
        <StatusIcon tone="accent">
          <Loader2 size={24} className="animate-spin" />
        </StatusIcon>
        Đang kiểm tra đăng nhập…
      </div>
    </Frame>
  );
}

export function UnconfiguredScreen(p: ShellProps) {
  return (
    <Frame {...p}>
      <Card className="max-w-[440px] text-center">
        <StatusIcon tone="warn">
          <Settings size={26} />
        </StatusIcon>
        <h2 className="mt-5 text-[21px] font-semibold tracking-tight">Chưa cấu hình máy chủ</h2>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Bản build này chưa có thông tin Supabase. Đặt <code className="text-fg-2">VITE_SUPABASE_URL</code> và <code className="text-fg-2">VITE_SUPABASE_ANON_KEY</code> (trên Vercel:
          Settings → Environment Variables) rồi deploy lại.
        </p>
      </Card>
    </Frame>
  );
}
