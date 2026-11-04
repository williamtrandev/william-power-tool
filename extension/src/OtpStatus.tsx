import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PendingOtp, StatusAsk } from './messages';

/** "waiting for the OTP box of qc_test": shows that the next step will be filled, and for how long */
export function OtpStatus({ tabId }: { tabId?: number }) {
  const [p, setP] = useState<PendingOtp | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tabId == null) return;
    const ask: StatusAsk = { type: 'otp-status', tabId };
    chrome.runtime.sendMessage(ask).then((r: PendingOtp | null) => setP(r));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tabId]);

  const left = p ? Math.round((p.until - now) / 1000) : 0;
  if (!p || left <= 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-[12px] text-fg-2">
      <ShieldCheck size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">
        Đang chờ ô OTP cho <b className="font-mono text-fg">{p.username}</b> — sẽ tự điền
      </span>
      <span className="shrink-0 text-faint tabular-nums">{left}s</span>
    </div>
  );
}
