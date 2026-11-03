import { Loader2, LogOut, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, Kbd } from '../../src/components/ui';
import type { User } from '../../src/lib/backend/types';
import type { TeamAccount } from '../../src/lib/otp';
import { AccountRow, type CopyWhat } from './AccountRow';
import { backend, signIn } from './backend';
import { fillLogin, type FillResult } from './fill';
import { hostOf, matches, search } from './site';

type Phase = 'loading' | 'no-config' | 'signed-out' | 'waiting' | 'ready' | 'error';
interface Tab {
  id?: number;
  url: string;
  host: string | null;
}

export function Popup() {
  const [phase, setPhase] = useState<Phase>(backend ? 'loading' : 'no-config');
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<TeamAccount[]>([]);
  const [tab, setTab] = useState<Tab>({ url: '', host: null });
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);

  const say = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const load = async () => {
    if (!backend) return;
    try {
      const u = await backend.session();
      setUser(u);
      if (!u) return setPhase('signed-out');
      const me = await backend.me();
      if (me?.status !== 'approved') return setPhase('waiting');
      const [list, [t]] = await Promise.all([backend.acctList(), chrome.tabs.query({ active: true, currentWindow: true })]);
      setAccounts(list);
      setTab({ id: t?.id, url: t?.url ?? '', host: t?.url && /^https?:/.test(t.url) ? hostOf(t.url) : null });
      setPhase('ready');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };
  useEffect(() => {
    load();
  }, []);

  // accounts for the open page first, then the rest; typing narrows both
  const { mine, others } = useMemo(() => {
    const found = search(accounts, query);
    return { mine: found.filter((a) => matches(a, tab.host)), others: found.filter((a) => !matches(a, tab.host)) };
  }, [accounts, query, tab.host]);
  const rows = useMemo(() => [...mine, ...others], [mine, others]);

  const fill = async (a: TeamAccount, force = false) => {
    if (tab.id == null || !/^(https?|file):/.test(tab.url)) return say('Trang này không cho điền tự động');
    if (!force && !matches(a, tab.host)) return setConfirm(a.id);
    setConfirm(null);
    setBusy(a.id);
    try {
      const password = a.has_password ? await backend!.acctPassword(a.id) : null;
      const otp = a.has_otp ? (await backend!.acctCode(a.id)).code : null;
      const run = (allFrames: boolean) => chrome.scripting.executeScript({ target: { tabId: tab.id!, allFrames }, func: fillLogin, args: [a.username, password, otp] });
      // frames from other sites are off limits without host permission; the page itself is enough then
      const done = await run(true).catch(() => run(false));
      const r = done.reduce<FillResult>((s, f) => (f.result ? { user: s.user || f.result.user, pass: s.pass || f.result.pass, otp: s.otp || f.result.otp } : s), { user: false, pass: false, otp: false });
      // the OTP is often asked on the next screen: keep it on the clipboard, like Bitwarden
      if (otp && !r.otp) await navigator.clipboard.writeText(otp);
      if (!r.user && !r.pass && !r.otp) return say('Không thấy ô đăng nhập trên trang — dùng các nút copy');
      window.close();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (a: TeamAccount, what: CopyWhat) => {
    try {
      const v = what === 'user' ? a.username : what === 'pass' ? await backend!.acctPassword(a.id) : (await backend!.acctCode(a.id)).code;
      await navigator.clipboard.writeText(v);
      say({ user: 'Đã copy tên đăng nhập', pass: 'Đã copy mật khẩu', otp: `Đã copy mã OTP ${v}` }[what]);
    } catch (e) {
      say((e as Error).message);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && rows[sel]) {
      e.preventDefault();
      if (confirm === rows[sel].id) fill(rows[sel], true);
      else fill(rows[sel]);
    } else if (e.key === 'Escape' && confirm) {
      e.preventDefault();
      setConfirm(null);
    }
  };

  const signOut = async () => {
    await backend?.signOut();
    setAccounts([]);
    setPhase('signed-out');
  };

  const row = (a: TeamAccount, i: number) => (
    <AccountRow
      key={a.id}
      a={a}
      selected={i === sel}
      confirming={confirm === a.id}
      busy={busy === a.id}
      pageHost={tab.host}
      onFill={(force) => fill(a, force)}
      onCancel={() => setConfirm(null)}
      onCopy={(what) => copy(a, what)}
      onHover={() => setSel(i)}
    />
  );

  return (
    <div className="flex max-h-[580px] min-h-[200px] flex-col bg-bg text-fg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <img src="icon.png" alt="" className="size-6 rounded-md" />
        <span className="text-[13.5px] font-semibold">William Tool</span>
        <span className="text-[12px] text-muted">Điền tài khoản</span>
        {user && (
          <span className="ml-auto flex items-center gap-1">
            <span title={user.email}>
              <Avatar src={user.avatar} name={user.name} email={user.email} size={24} />
            </span>
            <Button size="icon-sm" variant="ghost" title="Đăng xuất" aria-label="Đăng xuất" onClick={signOut}>
              <LogOut size={15} />
            </Button>
          </span>
        )}
      </header>

      {phase === 'loading' && (
        <Center>
          <Loader2 size={20} className="animate-spin text-accent" />
        </Center>
      )}
      {phase === 'no-config' && <Center>Bản build này chưa có cấu hình Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Center>}
      {phase === 'error' && (
        <Center>
          <p className="text-error">{error}</p>
          <Button size="sm" onClick={() => (setPhase('loading'), load())}>
            Thử lại
          </Button>
        </Center>
      )}
      {phase === 'signed-out' && <SignIn onDone={() => (setPhase('loading'), load())} />}
      {phase === 'waiting' && <Center>Tài khoản {user?.email} chưa được duyệt. Mở William Tool để gửi yêu cầu, admin duyệt xong là dùng được.</Center>}

      {phase === 'ready' && (
        <>
          <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
            <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-bg px-2.5 focus-within:border-accent/60">
              <Search size={14} className="shrink-0 text-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSel(0);
                  setConfirm(null);
                }}
                onKeyDown={onKey}
                placeholder="Tìm theo hệ thống, tên đăng nhập, link…"
                aria-label="Tìm tài khoản"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
              />
            </label>
            <p className="mt-1.5 truncate text-[11.5px] text-faint">Trang đang mở: {tab.host ?? 'không phải trang web'}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!rows.length && <Center>{accounts.length ? 'Không có tài khoản nào khớp.' : 'Bạn chưa được chia sẻ tài khoản nào.'}</Center>}
            {mine.length > 0 && <Group>Dùng cho trang này</Group>}
            {mine.map((a, i) => row(a, i))}
            {others.length > 0 && <Group>{mine.length ? 'Tài khoản khác' : query ? 'Kết quả' : 'Tất cả tài khoản'}</Group>}
            {others.map((a, i) => row(a, mine.length + i))}
          </div>
          <footer className="flex shrink-0 items-center gap-1.5 border-t border-line bg-surface px-3 py-1.5 text-[11px] text-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> chọn · <Kbd>Enter</Kbd> điền · mở nhanh <Kbd>Alt+Shift+W</Kbd>
          </footer>
        </>
      )}

      {toast && <div className="animate-in fixed inset-x-3 bottom-10 rounded-lg bg-fg px-3 py-2 text-center text-[12.5px] text-bg shadow-lg">{toast}</div>}
    </div>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Center>
      <p className="text-fg-2">Đăng nhập bằng tài khoản Google dùng cho William Tool để lấy danh sách tài khoản được chia sẻ cho bạn.</p>
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await signIn();
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 size={15} className="animate-spin" />} Đăng nhập bằng Google
      </Button>
      {error && <p className="text-[12px] text-error">{error}</p>}
      <p className="text-[11.5px] text-faint">Phiên đăng nhập mất khi đóng trình duyệt.</p>
    </Center>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-[12.5px] text-muted">{children}</div>;
}

function Group({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-10 border-b border-line bg-surface-2 px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{children}</div>;
}
