import clsx from 'clsx';
import { ChevronDown, Globe, Search } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { TeamAccount } from '../../src/lib/otp';
import { AccountRow } from './AccountRow';
import { matches, search } from './site';
import type { CopyWhat } from './vault';

interface Props {
  accounts: TeamAccount[];
  pageHost: string | null;
  /** the inline menu under a login box */
  compact?: boolean;
  /** off in the inline menu, so it does not take the cursor from the page's login box */
  autoFocus?: boolean;
  /** resolves once filled; the picker shows a spinner meanwhile */
  onFill: (a: TeamAccount) => Promise<void>;
  onCopy: (a: TeamAccount, what: CopyWhat) => void;
  onEscape?: () => void;
}

/** search box + the accounts of the open page, then the others (folded until searched or opened) */
export function AccountPicker({ accounts, pageHost, compact, autoFocus = true, onFill, onCopy, onEscape }: Props) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const { mine, others } = useMemo(() => {
    const found = search(accounts, query);
    return { mine: found.filter((a) => matches(a, pageHost)), others: found.filter((a) => !matches(a, pageHost)) };
  }, [accounts, query, pageHost]);
  // with accounts for this page, the rest stay folded until asked for or searched
  const othersOpen = !mine.length || showOthers || !!query.trim();
  const rows = useMemo(() => [...mine, ...(othersOpen ? others : [])], [mine, others, othersOpen]);

  const fill = async (a: TeamAccount, force = false) => {
    if (!force && !matches(a, pageHost)) return setConfirm(a.id);
    setConfirm(null);
    setBusy(a.id);
    try {
      await onFill(a);
    } finally {
      setBusy(null);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter' && rows[sel]) {
      e.preventDefault();
      fill(rows[sel], confirm === rows[sel].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (confirm) setConfirm(null);
      else if (query) setQuery('');
      else onEscape?.();
    }
  };

  const row = (a: TeamAccount, i: number, isMine: boolean) => (
    <AccountRow
      key={a.id}
      a={a}
      mine={isMine}
      selected={i === sel}
      confirming={confirm === a.id}
      busy={busy === a.id}
      pageHost={pageHost}
      compact={compact}
      onFill={(force) => fill(a, force)}
      onCancel={() => setConfirm(null)}
      onCopy={(what) => onCopy(a, what)}
      onHover={() => setSel(i)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={clsx('shrink-0 border-b border-line bg-surface', compact ? 'p-2' : 'px-3 py-2')}>
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-bg px-2.5 focus-within:border-accent/60">
          <Search size={14} className="shrink-0 text-faint" />
          <input
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
              setConfirm(null);
            }}
            onKeyDown={onKey}
            placeholder={compact ? 'Tìm tài khoản…' : 'Tìm theo hệ thống, tên đăng nhập, link…'}
            aria-label="Tìm tài khoản"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pageHost && (
          <SiteHeader host={pageHost} count={mine.length}>
            {!mine.length && !query && 'Chưa có tài khoản nào gắn với trang này — chọn bên dưới, hoặc thêm “Link đăng nhập” trong William Tool.'}
          </SiteHeader>
        )}
        {mine.length > 0 && <div className="divide-y divide-line border-b border-line bg-accent-soft/40">{mine.map((a, i) => row(a, i, true))}</div>}

        {others.length > 0 &&
          (mine.length ? (
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              disabled={!!query.trim()}
              className="focus-ring flex w-full items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-1.5 text-left text-[11.5px] font-semibold text-muted hover:text-fg disabled:hover:text-muted"
            >
              <ChevronDown size={14} className={clsx('transition-transform', !othersOpen && '-rotate-90')} />
              Tài khoản khác <span className="font-normal text-faint">· {others.length}</span>
            </button>
          ) : (
            <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11.5px] font-semibold text-muted">{query ? 'Kết quả' : 'Tất cả tài khoản'}</div>
          ))}
        {othersOpen && <div className="divide-y divide-line">{others.map((a, i) => row(a, mine.length + i, false))}</div>}

        {!mine.length && !others.length && (
          <p className="px-6 py-8 text-center text-[12.5px] text-muted">{accounts.length ? 'Không có tài khoản nào khớp.' : 'Bạn chưa được chia sẻ tài khoản nào.'}</p>
        )}
      </div>
    </div>
  );
}

function SiteHeader({ host, count, children }: { host: string; count: number; children?: ReactNode }) {
  return (
    <div className="border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={clsx('grid size-6 shrink-0 place-items-center rounded-md', count ? 'bg-accent text-white' : 'bg-surface-2 text-faint')}>
          <Globe size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] leading-tight text-muted">Trang đang mở</div>
          <div className="truncate text-[12.5px] leading-tight font-semibold text-fg">{host}</div>
        </div>
        {count > 0 && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{count} tài khoản</span>}
      </div>
      {children && <p className="mt-1.5 text-[11.5px] text-muted">{children}</p>}
    </div>
  );
}
