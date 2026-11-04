import clsx from 'clsx';
import { LogOut, Moon, Settings2, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Kbd, Segmented } from '../../src/components/ui';
import type { TeamAccount } from '../../src/lib/otp';
import { AccountPicker } from './AccountPicker';
import { getInlineMode, INLINE_KEY, type InlineMode } from './config';
import { fillTab } from './fillTab';
import { Gate } from './Gate';
import type { RememberOtp } from './messages';
import { hostOf } from './site';
import { useTheme } from './theme';
import { UpdateBanner } from './UpdateBanner';
import { OtpStatus } from './OtpStatus';
import { copyValue, secretsFor, useVault } from './vault';

interface Tab {
  id?: number;
  url: string;
  host: string | null;
}

export function Popup() {
  const vault = useVault();
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState<Tab>({ url: '', host: null });
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(0);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab({ id: t?.id, url: t?.url ?? '', host: t?.url && /^https?:/.test(t.url) ? hostOf(t.url) : null }));
  }, []);

  const say = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const fill = async (a: TeamAccount) => {
    if (tab.id == null || !/^(https?|file):/.test(tab.url)) return say('Trang này không cho điền tự động');
    try {
      const { password, otp } = await secretsFor(a);
      const r = await fillTab(tab.id, a.username, password, otp);
      // the OTP is often asked on the next screen: keep it on the clipboard, and put it in when that box shows up
      if (otp && !r.otp) {
        const ask: RememberOtp = { type: 'otp-remember', tabId: tab.id, accountId: a.id, username: a.username, hosts: [tab.host ?? '', hostOf(a.url) ?? ''] };
        await chrome.runtime.sendMessage(ask);
        await navigator.clipboard.writeText(otp).catch(() => {});
      }
      if (!r.user && !r.pass && !r.otp) return say('Không thấy ô đăng nhập trên trang — dùng các nút copy');
      window.close();
    } catch (e) {
      say((e as Error).message);
    }
  };

  return (
    <div className="flex max-h-[580px] min-h-[220px] flex-col bg-bg text-fg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <img src="icon.png" alt="" className="size-6 rounded-md" />
        <span className="text-[13.5px] font-semibold">William Tool</span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'} aria-label="Đổi giao diện sáng / tối" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </Button>
          <Button size="icon-sm" variant="ghost" active={settings} title="Cài đặt" aria-label="Cài đặt" aria-expanded={settings} onClick={() => setSettings((v) => !v)}>
            <Settings2 size={15} />
          </Button>
          {vault.user && (
            <>
              <span title={vault.user.email} className="ml-1">
                <Avatar src={vault.user.avatar} name={vault.user.name} email={vault.user.email} size={24} />
              </span>
              <Button size="icon-sm" variant="ghost" title="Đăng xuất" aria-label="Đăng xuất" onClick={vault.signOut}>
                <LogOut size={15} />
              </Button>
            </>
          )}
        </span>
      </header>

      <UpdateBanner />
      <OtpStatus tabId={tab.id} />
      {settings && <SettingsPanel />}

      {vault.phase === 'ready' ? (
        <>
          <AccountPicker
            accounts={vault.accounts}
            pageHost={tab.host}
            onFill={fill}
            onCopy={(a, what) => copyValue(a, what).then(say, (e: Error) => say(e.message))}
            onEscape={() => window.close()}
          />
          <footer className="flex shrink-0 items-center gap-1.5 border-t border-line bg-surface px-3 py-1.5 text-[11px] text-faint">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> chọn · <Kbd>Enter</Kbd> điền · mở nhanh <Kbd>Alt+Shift+W</Kbd>
          </footer>
        </>
      ) : (
        <Gate phase={vault.phase} error={vault.error} user={vault.user} onRetry={vault.reload} />
      )}

      {toast && <div className="animate-in fixed inset-x-3 bottom-10 rounded-lg bg-fg px-3 py-2 text-center text-[12.5px] text-bg shadow-lg">{toast}</div>}
    </div>
  );
}

const MODES: { id: InlineMode; label: string; hint: string }[] = [
  { id: 'all', label: 'Mọi trang', hint: 'Bấm vào ô đăng nhập ở bất kỳ trang nào là hiện menu chọn tài khoản.' },
  { id: 'matching', label: 'Trang có tài khoản', hint: 'Chỉ hiện ở trang có tài khoản gắn “Link đăng nhập” trùng tên miền.' },
  { id: 'off', label: 'Tắt', hint: 'Không hiện menu trong trang, chỉ dùng nút trên thanh công cụ.' },
];

function SettingsPanel() {
  const [mode, setMode] = useState<InlineMode | null>(null);
  useEffect(() => {
    getInlineMode().then(setMode);
  }, []);
  const pick = (m: InlineMode) => {
    setMode(m);
    chrome.storage.local.set({ [INLINE_KEY]: m });
  };
  return (
    <section className={clsx('animate-in shrink-0 space-y-2 border-b border-line bg-surface-2/60 px-3 py-2.5', !mode && 'invisible')}>
      <p className="text-[12px] font-medium text-fg-2">Menu gợi ý khi bấm vào ô đăng nhập</p>
      <Segmented label="Menu gợi ý" value={mode ?? 'all'} onChange={pick} items={MODES.map((m) => ({ id: m.id, label: m.label, icon: null }))} />
      <p className="text-[11.5px] text-muted">{MODES.find((m) => m.id === mode)?.hint}</p>
      <p className="text-[11px] text-faint">
        Phiên bản {chrome.runtime.getManifest().version} · build {__BUILD__}
      </p>
    </section>
  );
}
