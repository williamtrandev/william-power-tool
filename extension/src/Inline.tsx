import { CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../src/components/ui';
import type { TeamAccount } from '../../src/lib/otp';
import { AccountPicker } from './AccountPicker';
import { backend } from './backend';
import { Gate } from './Gate';
import type { FillAsk, FillReply, FrameSignal, InfoReply, PendingOtp } from './messages';
import { hostOf } from './site';
import { copyValue, secretsFor, useVault } from './vault';

const token = location.hash.slice(1);
const signal = (s: FrameSignal) => parent.postMessage(s, '*');
const send = async (ask: FillAsk) => {
  const r = (await chrome.runtime.sendMessage(ask)) as FillReply;
  if ('error' in r) throw new Error(r.error);
  return r;
};

/** the menu under a login box: an extension page framed by the content script */
export function Inline() {
  // undefined: still asking the background which page this menu serves
  const [info, setInfo] = useState<InfoReply | undefined>(undefined);
  const [note, setNote] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'inline-info', token }).then((r: InfoReply & { error?: string }) => (r.error ? setNote(r.error) : setInfo(r)));
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

  return (
    <div ref={root} className="flex max-h-[380px] flex-col overflow-hidden rounded-[10px] border border-line bg-bg text-fg">
      <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line bg-surface pr-1 pl-2.5">
        <img src="icon.png" alt="" className="size-4 rounded" />
        <span className="text-[12px] font-semibold">William Tool</span>
        {!info?.auto && <span className="text-[11.5px] text-faint">· chọn tài khoản để điền</span>}
        <Button size="icon-sm" variant="ghost" className="ml-auto size-6" aria-label="Đóng" title="Đóng (Esc)" onClick={() => signal({ wpt: 'close' })}>
          <X size={14} />
        </Button>
      </header>
      {note && <p className="shrink-0 border-b border-line bg-error/8 px-3 py-1.5 text-[12px] text-error">{note}</p>}
      {info?.auto ? <AutoOtp p={info.auto} onError={setNote} /> : info && <Menu host={info.host ?? null} onNote={setNote} />}
    </div>
  );
}

function Menu({ host, onNote }: { host: string | null; onNote: (m: string) => void }) {
  const vault = useVault();

  const fill = async (a: TeamAccount) => {
    onNote('');
    try {
      const { password, otp } = await secretsFor(a);
      // copied first: the menu closes as soon as the page is filled
      if (otp) await navigator.clipboard.writeText(otp).catch(() => {});
      const r = await send({
        type: 'inline-fill',
        token,
        username: a.username,
        password,
        otp,
        otpFor: a.has_otp ? { accountId: a.id, username: a.username, host: hostOf(a.url) } : undefined,
      });
      if (!r.user && !r.pass && !r.otp) onNote('Không thấy ô đăng nhập để điền');
    } catch (e) {
      onNote((e as Error).message);
    }
  };

  if (vault.phase !== 'ready') return <Gate phase={vault.phase} error={vault.error} user={vault.user} onRetry={vault.reload} />;
  return (
    <AccountPicker
      compact
      autoFocus={false}
      accounts={vault.accounts}
      pageHost={host}
      onFill={fill}
      onCopy={(a, what) => copyValue(a, what).then(onNote, (e: Error) => onNote(e.message))}
      onEscape={() => signal({ wpt: 'close' })}
    />
  );
}

/** opened by itself on the OTP step after a fill: fetches the current code and puts it in */
function AutoOtp({ p, onError }: { p: PendingOtp; onError: (m: string) => void }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { code } = await backend!.acctCode(p.accountId);
        const r = await send({ type: 'inline-fill', token, username: p.username, password: null, otp: code, otpOnly: true });
        if (!r.otp) throw new Error('Không điền được ô OTP');
        setDone(true);
      } catch (e) {
        onError((e as Error).message);
      }
    })();
  }, [p, onError]);

  return (
    <div className="flex items-center gap-2.5 px-3 py-3 text-[12.5px]">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        {done ? <CheckCircle2 size={17} /> : <ShieldCheck size={17} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-fg">{done ? 'Đã điền mã OTP' : 'Đang điền mã OTP…'}</div>
        <div className="truncate font-mono text-[11.5px] text-muted">{p.username}</div>
      </div>
      {!done && <Loader2 size={15} className="shrink-0 animate-spin text-accent" />}
    </div>
  );
}
