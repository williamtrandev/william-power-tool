import clsx from 'clsx';
import { useMemo, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { GUID_SRC } from '../lib/parser';
import type { Level, LogFile } from '../lib/types';
import { shortName } from '../lib/format';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'primary';
  size?: 'sm' | 'md';
  active?: boolean;
};

export function Button({ variant = 'default', size = 'md', active, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={clsx(
        'focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'default' &&
          (active
            ? 'border border-accent/60 bg-accent-soft text-accent'
            : 'border border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg'),
        variant === 'ghost' && (active ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'),
        className,
      )}
      {...rest}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line border-b-2 bg-surface-2 px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}

export const LEVEL_META: Record<Level, { short: string; cls: string; dot: string; text: string }> = {
  FATAL: { short: 'FATAL', cls: 'text-fatal bg-fatal/12', dot: 'bg-fatal', text: 'text-fatal' },
  ERROR: { short: 'ERROR', cls: 'text-error bg-error/12', dot: 'bg-error', text: 'text-error' },
  WARN: { short: 'WARN', cls: 'text-warn bg-warn/12', dot: 'bg-warn', text: 'text-warn' },
  INFO: { short: 'INFO', cls: 'text-info bg-info/10', dot: 'bg-info', text: 'text-info' },
  DEBUG: { short: 'DEBUG', cls: 'text-debug bg-debug/12', dot: 'bg-debug', text: 'text-debug' },
  TRACE: { short: 'TRACE', cls: 'text-debug bg-debug/12', dot: 'bg-debug', text: 'text-debug' },
  OTHER: { short: '—', cls: 'text-faint', dot: 'bg-faint', text: 'text-faint' },
};

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  const m = LEVEL_META[level];
  return (
    <span
      className={clsx(
        'inline-flex h-[18px] items-center justify-center rounded px-1.5 font-mono text-[10px] font-semibold tracking-wide',
        m.cls,
        className,
      )}
    >
      {m.short}
    </span>
  );
}

export function FileTag({ file, className }: { file: LogFile | undefined; className?: string }) {
  if (!file) return null;
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5 text-muted', className)} title={file.name}>
      <span className="size-2 shrink-0 rounded-[3px]" style={{ background: file.color }} />
      <span className="truncate">{shortName(file.name)}</span>
    </span>
  );
}

/** Renders text with search hits highlighted; GUIDs become clickable when onId is given. */
export function Highlight({ text, hl, onId }: { text: string; hl: RegExp | null; onId?: (id: string) => void }) {
  const parts = useMemo(() => {
    const srcs: string[] = [];
    if (onId) srcs.push('(' + GUID_SRC + ')');
    if (hl) srcs.push('(' + hl.source + ')');
    if (!srcs.length) return [text];
    const re = new RegExp(srcs.join('|'), 'gi');
    const full = hl ? new RegExp('^(?:' + hl.source + ')$', 'i') : null;
    const out: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      if (m.index > last) out.push(text.slice(last, m.index));
      const s = m[0];
      if (onId && m[1]) {
        out.push(
          <button
            key={i++}
            type="button"
            className="cursor-pointer text-accent underline decoration-accent/40 decoration-dotted underline-offset-2 hover:decoration-solid"
            title="Lọc theo id này"
            onClick={() => onId(s)}
          >
            {full?.test(s) ? <mark className="hl">{s}</mark> : s}
          </button>,
        );
      } else out.push(<mark key={i++} className="hl">{s}</mark>);
      last = m.index + s.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, hl, onId]);
  return <>{parts}</>;
}

export function Switch({ checked, onChange, label, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={clsx(
        'focus-ring inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors',
        checked ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-fg-2 hover:border-line-strong',
      )}
    >
      {icon}
      {label}
      <span
        aria-hidden
        className={clsx(
          'relative block h-4 w-7 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 block size-3 rounded-full shadow-sm transition-transform duration-150',
            checked ? 'translate-x-3 bg-white' : 'translate-x-0 bg-white dark:bg-fg-2',
          )}
        />
      </span>
    </button>
  );
}
