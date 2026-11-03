import clsx from 'clsx';
import { AlertTriangle, CornerDownLeft, KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../src/components/ui';
import { isProd, type TeamAccount } from '../../src/lib/otp';
import { hostOf } from './site';
import type { CopyWhat } from './vault';

interface Props {
  a: TeamAccount;
  /** made for the open page */
  mine: boolean;
  selected: boolean;
  /** asking whether to fill a page the account is not for */
  confirming: boolean;
  busy: boolean;
  pageHost: string | null;
  /** the inline menu: the whole row fills, no copy buttons */
  compact?: boolean;
  onFill: (force?: boolean) => void;
  onCancel: () => void;
  onCopy: (what: CopyWhat) => void;
  onHover: () => void;
}

export function AccountRow({ a, mine, selected, confirming, busy, pageHost, compact, onFill, onCancel, onCopy, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const host = hostOf(a.url);

  return (
    <div ref={ref} onMouseEnter={onHover} className={clsx('relative', selected && 'bg-sel')}>
      {mine && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-accent" />}
      <div className={clsx('flex items-center gap-2', compact ? 'py-1.5 pr-2 pl-3' : 'py-2 pr-2 pl-3.5')}>
        <button type="button" onClick={() => onFill()} className="focus-ring min-w-0 flex-1 rounded text-left" title="Điền vào trang đang mở">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-fg">{a.system || 'Không tên'}</span>
            {a.env && (
              <span className={clsx('shrink-0 rounded px-1.5 text-[10.5px] font-semibold', isProd(a.env) ? 'bg-error/12 text-error' : 'bg-surface-2 text-muted')}>{a.env}</span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="truncate font-mono text-fg-2">{a.username}</span>
            {host && !mine && <span className="truncate text-faint">· {host}</span>}
          </div>
        </button>
        {compact ? (
          <span className="flex size-6 shrink-0 items-center justify-center text-faint">
            {busy ? <Loader2 size={14} className="animate-spin text-accent" /> : selected && <CornerDownLeft size={14} />}
          </span>
        ) : (
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
            <Button size="sm" variant={mine ? 'primary' : 'default'} className="ml-1 w-12" disabled={busy} onClick={() => onFill()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : 'Điền'}
            </Button>
          </div>
        )}
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
