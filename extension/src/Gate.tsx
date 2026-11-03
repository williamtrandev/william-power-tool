import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../src/components/ui';
import type { User } from '../../src/lib/backend/types';
import { signIn } from './backend';
import { IS_DEMO, SIGN_IN_ERROR } from './config';
import type { Phase } from './vault';

/** every state but "ready": loading, sign-in, waiting for approval, errors */
export function Gate({ phase, error, user, onRetry }: { phase: Phase; error: string; user: User | null; onRetry: () => void }) {
  if (phase === 'loading')
    return (
      <Center>
        <Loader2 size={20} className="animate-spin text-accent" />
      </Center>
    );
  if (phase === 'no-config') return <Center>Bản build này chưa có cấu hình Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Center>;
  if (phase === 'signed-out') return <SignIn onDone={onRetry} />;
  if (phase === 'waiting') return <Center>Tài khoản {user?.email} chưa được duyệt. Mở William Tool để gửi yêu cầu, admin duyệt xong là dùng được.</Center>;
  return (
    <Center>
      <p className="text-error">{error}</p>
      <Button size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </Center>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!IS_DEMO)
      chrome.storage.session.get(SIGN_IN_ERROR).then((r) => {
        if (r[SIGN_IN_ERROR]) setError(r[SIGN_IN_ERROR] as string);
      });
  }, []);
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
      {error && <SignInHelp error={error} />}
      <p className="text-[11.5px] text-faint">Phiên đăng nhập mất khi đóng trình duyệt.</p>
    </Center>
  );
}

/** the usual cause: Supabase does not know the extension's redirect URL, so it sends the sign-in to the web app instead */
function SignInHelp({ error }: { error: string }) {
  const url = chrome.identity.getRedirectURL();
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full space-y-2 rounded-lg border border-error/30 bg-error/8 p-3 text-left text-[12px] text-fg-2">
      <p className="font-medium text-error">{error}</p>
      <p>Nếu đăng nhập xong mà cửa sổ mở ra trang William Tool thay vì quay lại đây: Supabase chưa cho phép địa chỉ của extension. Admin thêm địa chỉ này vào Supabase → Authentication → URL Configuration → Redirect URLs, rồi đăng nhập lại:</p>
      <div className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1.5">
        <code className="min-w-0 flex-1 font-mono text-[11px] break-all text-fg">{url}</code>
        <Button size="icon-sm" variant="ghost" title="Copy địa chỉ" aria-label="Copy địa chỉ" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
          {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-[12.5px] text-muted">{children}</div>;
}
