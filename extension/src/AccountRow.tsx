import clsx from 'clsx';
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../src/components/ui';
import { isProd, type TeamAccount } from '../../src/lib/otp';
import { hostOf } from './site';

export type CopyWhat = 'user' | 'pass' | 'otp';

interface Props {
  a: TeamAccount;
  selected: boolean;
  /** asking whether to fill a page the account is not for */
  confirming: boolean;
  busy: boolean;
  pageHost: string | null;
  onFill: (force?: boolean) => void;
  onCancel: () => void;
  onCopy: (what: CopyWhat) => void;
  onHover: () => void;
}

export function AccountRow({ a, selected, confirming, busy, pageHost, onFill, onCancel, onCopy, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const host = hostOf(a.url);

  return (
    <div ref={ref} onMouseEnter={onHover} className={clsx('border-b border-line last:border-b-0', selected && 'bg-sel')}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => onFill()} className="focus-ring min-w-0 flex-1 rounded text-left" title="Điền vào trang đang mở">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-fg">{a.system || 'Không tên'}</span>
            {a.env && (
              <span className={clsx('shrink-0 rounded px-1.5 text-[10.5px] font-semibold', isProd(a.env) ? 'bg-error/12 text-error' : 'bg-surface-2 text-muted')}>{a.env}</span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="truncate font-mono text-fg-2">{a.username}</span>
            {host && <span className="truncate text-faint">· {host}</span>}
          </div>
        </button>
        <div className="flex shrink-0 items-center">
          <Button size="icon-sm" variant="ghost" title="Copy tên đăng nhập" aria-label="Copy tên đăng nhập" onClick={() => onCopy('user')}>
            <User size={15} />
          </Button>
          {a.has_password && (
            <Button size="icon-sm" variant="ghost" title="Copy mật khẩu" aria-label="Copy mật khẩu" onClick={() => onCopy('pass')}>
              <KeyRound size={15} />
            </Button>
          )}
          {a.has_otp && (
            <Button size="icon-sm" variant="ghost" title="Copy mã OTP" aria-label="Copy mã OTP" onClick={() => onCopy('otp')}>
              <ShieldCheck size={15} />
            </Button>
          )}
          <Button size="sm" variant="primary" className="ml-1 w-12" disabled={busy} onClick={() => onFill()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Điền'}
          </Button>
        </div>
      </div>
      {confirming && (
        <div className="mx-3 mb-2.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-[12px] text-fg-2">
          <p className="flex gap-1.5">
            <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
            <span>
              Trang đang mở là <b className="text-fg">{pageHost ?? 'trang này'}</b>, {host ? <>tài khoản dành cho <b className="text-fg">{host}</b></> : 'tài khoản chưa có link đăng nhập'}. Chỉ điền nếu chắc đây không phải trang giả mạo.
            </span>
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Huỷ
            </Button>
            <Button size="sm" onClick={() => onFill(true)}>
              Vẫn điền
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
