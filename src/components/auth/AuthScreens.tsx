import clsx from 'clsx';
import { Ban, Clock, Loader2, LogIn, LogOut, MailCheck, Moon, RefreshCw, Settings, Sun, TriangleAlert, UserPlus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Backend } from '../../lib/backend';
import { Logo } from '../AppHeader';
import { Button, Segmented } from '../ui';

const input = 'focus-ring h-10 w-full rounded-md border border-line bg-surface px-3 text-[13.5px] text-fg placeholder:text-faint';

function Shell({ children, theme, onToggleTheme }: { children: ReactNode; theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center px-4">
        <Logo />
        <Button variant="ghost" size="icon" className="ml-auto" aria-label="Đổi giao diện sáng/tối" onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </Button>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-10">
        <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-6 shadow-sm">{children}</div>
      </main>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <h1 className="mt-3 text-[16px] font-semibold">{title}</h1>
      <div className="mt-1.5 text-[13px] text-muted">{children}</div>
    </div>
  );
}

type ShellProps = { theme: 'light' | 'dark'; onToggleTheme: () => void };

export function LoadingScreen(p: ShellProps) {
  return (
    <Shell {...p}>
      <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
        <Loader2 size={16} className="animate-spin" /> Đang kiểm tra đăng nhập…
      </p>
    </Shell>
  );
}

export function UnconfiguredScreen(p: ShellProps) {
  return (
    <Shell {...p}>
      <Notice icon={<Settings size={22} />} title="Chưa cấu hình máy chủ">
        Bản build này chưa có thông tin Supabase. Người triển khai cần đặt <code className="text-fg-2">VITE_SUPABASE_URL</code> và{' '}
        <code className="text-fg-2">VITE_SUPABASE_ANON_KEY</code> trong file <code className="text-fg-2">.env.local</code> rồi build lại.
      </Notice>
    </Shell>
  );
}

export function LoginScreen({ backend, ...p }: ShellProps & { backend: Backend }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const demo = backend.mode === 'demo';
  const up = mode === 'up';
  const mismatch = up && !!pw2 && pw !== pw2;
  const ok = email.includes('@') && (demo || pw.length >= 6) && (!up || demo || pw === pw2);

  if (sent)
    return (
      <Shell {...p}>
        <Notice icon={<MailCheck size={22} />} title="Kiểm tra hộp thư">
          Đã gửi thư xác nhận tới <b className="text-fg">{sent}</b>. Bấm link trong thư, sau đó đăng nhập — tài khoản sẽ chờ admin duyệt.
        </Notice>
        <Button className="mt-5 w-full" onClick={() => (setSent(null), setMode('in'))}>
          Quay lại đăng nhập
        </Button>
      </Shell>
    );

  return (
    <Shell {...p}>
      <h1 className="text-[17px] font-semibold tracking-tight">{up ? 'Đăng ký tài khoản' : 'Đăng nhập'}</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        {up ? 'Sau khi đăng ký, admin cần duyệt thì bạn mới dùng được hệ thống.' : 'Chỉ tài khoản đã được admin duyệt mới vào được hệ thống.'}
      </p>
      <div className="mt-4">
        <Segmented
          label="Đăng nhập hoặc đăng ký"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setErr(null);
          }}
          items={[
            { id: 'in', label: 'Đăng nhập', icon: <LogIn size={15} /> },
            { id: 'up', label: 'Đăng ký', icon: <UserPlus size={15} /> },
          ]}
        />
      </div>
      <form
        className="mt-4 space-y-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          setErr(null);
          try {
            if (up) {
              const r = await backend.signUp(email, pw);
              if (r.confirmEmail) setSent(email.trim());
            } else await backend.signIn(email, pw);
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@congty.vn" aria-label="Email" autoComplete="username" autoFocus />
        {!demo && (
          <input
            className={input}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={up ? 'Mật khẩu (ít nhất 6 ký tự)' : 'Mật khẩu'}
            aria-label="Mật khẩu"
            autoComplete={up ? 'new-password' : 'current-password'}
          />
        )}
        {up && !demo && (
          <input
            className={clsx(input, mismatch && 'border-error')}
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Nhập lại mật khẩu"
            aria-label="Nhập lại mật khẩu"
            autoComplete="new-password"
          />
        )}
        {mismatch && <p className="text-[12.5px] text-error">Mật khẩu nhập lại không khớp</p>}
        {err && <p className="text-[12.5px] text-error">{err}</p>}
        <Button type="submit" variant="primary" className="h-10 w-full" disabled={busy || !ok}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : up ? <UserPlus size={16} /> : <LogIn size={16} />}
          {up ? 'Đăng ký' : 'Đăng nhập'}
        </Button>
        {demo && <p className="text-center text-[11.5px] text-faint">Chế độ demo: admin@demo, qc@demo, newbie@demo — không cần mật khẩu.</p>}
        {!up && !demo && <p className="text-center text-[11.5px] text-faint">Quên mật khẩu? Nhờ admin đặt lại trong Supabase.</p>}
      </form>
    </Shell>
  );
}

export function WaitingScreen({ kind, email, onSignOut, onRefresh, message, ...p }: ShellProps & { kind: 'pending' | 'blocked' | 'error'; email?: string; message?: string; onSignOut: () => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Shell {...p}>
      {kind === 'pending' && (
        <Notice icon={<Clock size={22} />} title="Đang chờ admin duyệt">
          Tài khoản <b className="text-fg">{email}</b> đã được ghi nhận. Khi admin duyệt, trang sẽ tự vào hệ thống — không cần tải lại.
        </Notice>
      )}
      {kind === 'blocked' && (
        <Notice icon={<Ban size={22} />} title="Tài khoản không có quyền truy cập">
          Tài khoản <b className="text-fg">{email}</b> đã bị từ chối hoặc khoá. Liên hệ admin nếu cần mở lại.
        </Notice>
      )}
      {kind === 'error' && (
        <Notice icon={<TriangleAlert size={22} />} title="Không kiểm tra được quyền truy cập">
          {message}
        </Notice>
      )}
      <div className="mt-5 flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onRefresh();
            setBusy(false);
          }}
        >
          <RefreshCw size={15} className={clsx(busy && 'animate-spin')} /> Kiểm tra lại
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onSignOut}>
          <LogOut size={15} /> Đăng xuất
        </Button>
      </div>
    </Shell>
  );
}
