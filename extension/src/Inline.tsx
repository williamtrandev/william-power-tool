import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../src/components/ui';
import type { TeamAccount } from '../../src/lib/otp';
import { AccountPicker } from './AccountPicker';
import { Gate } from './Gate';
import type { FillAsk, FillReply, FrameSignal, InfoReply } from './messages';
import { copyValue, secretsFor, useVault } from './vault';

const token = location.hash.slice(1);
const signal = (s: FrameSignal) => parent.postMessage(s, '*');

/** the menu under a login box: an extension page framed by the content script */
export function Inline() {
  const vault = useVault();
  // undefined: still asking the background which page this menu serves
  const [host, setHost] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'inline-info', token }).then((r: InfoReply & { error?: string }) => (r.error ? setNote(r.error) : setHost(r.host ?? null)));
  }, []);

  // the content script sizes the frame to the menu
  useEffect(() => {
    const el = root.current!;
    const ro = new ResizeObserver(() => signal({ wpt: 'size', h: el.offsetHeight }));
    ro.observe(el);
    // ↓ in the login box moves into the menu
    const onMsg = (e: MessageEvent<FrameSignal>) => e.source === parent && e.data?.wpt === 'focus' && el.querySelector('input')?.focus();
    addEventListener('message', onMsg);
    return () => {
      ro.disconnect();
      removeEventListener('message', onMsg);
    };
  }, []);

  const fill = async (a: TeamAccount) => {
    setNote('');
    try {
      const { password, otp } = await secretsFor(a);
      // copied first: the menu closes as soon as the page is filled
      if (otp) await navigator.clipboard.writeText(otp).catch(() => {});
      const ask: FillAsk = { type: 'inline-fill', token, username: a.username, password, otp };
      const r = (await chrome.runtime.sendMessage(ask)) as FillReply;
      if ('error' in r) throw new Error(r.error);
      if (!r.user && !r.pass && !r.otp) setNote('Không thấy ô đăng nhập để điền');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <div ref={root} className="flex max-h-[380px] flex-col overflow-hidden rounded-[10px] border border-line bg-bg text-fg">
      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line bg-surface pr-1 pl-2.5">
        <img src="icon.png" alt="" className="size-4 rounded" />
        <span className="text-[12px] font-semibold">William Tool</span>
        <span className="text-[11.5px] text-faint">· chọn tài khoản để điền</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto size-6" aria-label="Đóng" title="Đóng (Esc)" onClick={() => signal({ wpt: 'close' })}>
          <X size={14} />
        </Button>
      </header>
      {note && <p className="shrink-0 border-b border-line bg-error/8 px-3 py-1.5 text-[12px] text-error">{note}</p>}
      {vault.phase === 'ready' && host !== undefined ? (
        <AccountPicker
          compact
          autoFocus={false}
          accounts={vault.accounts}
          pageHost={host}
          onFill={fill}
          onCopy={(a, what) => copyValue(a, what).then(setNote, (e: Error) => setNote(e.message))}
          onEscape={() => signal({ wpt: 'close' })}
        />
      ) : (
        vault.phase !== 'ready' && <Gate phase={vault.phase} error={vault.error} user={vault.user} onRetry={vault.reload} />
      )}
    </div>
  );
}
