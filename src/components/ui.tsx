import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { GUID_SRC } from '../lib/parser';
import type { Level, LogFile } from '../lib/types';
import { shortName } from '../lib/format';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'primary' | 'danger';
  /** icon / icon-sm: square buttons with no horizontal padding */
  size?: 'sm' | 'md' | 'icon' | 'icon-sm';
  active?: boolean;
};

export function Button({ variant = 'default', size = 'md', active, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={clsx(
        'focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-40 [&>svg]:shrink-0',
        { sm: 'h-7 px-2 text-xs', md: 'h-8 px-3 text-[13px]', icon: 'size-8', 'icon-sm': 'size-7' }[size],
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'danger' && 'bg-error text-white hover:brightness-110',
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
        'inline-flex h-[1.55em] items-center justify-center rounded px-[0.55em] font-mono text-[0.84em] leading-none font-semibold tracking-wide',
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

/** pill-style tab switcher */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  tour,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; icon: ReactNode }[];
  label: string;
  tour?: string;
}) {
  return (
    <div role="tablist" aria-label={label} data-tour={tour} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-0.5 [scrollbar-width:none]">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            // phones: icons go, so four tabs still fit on one line
            'focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors sm:px-3 max-sm:[&>svg]:hidden',
            value === it.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_BG = ['#2563eb', '#7c3aed', '#0d9488', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#9333ea'];

/** Profile photo (Google) or coloured initials. */
export function Avatar({ src, name, email, size = 28, className }: { src?: string | null; name?: string | null; email: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const label = (name || email).trim();
  const initials = label.includes('@') ? label[0] : label.split(/\s+/).slice(-2).map((w) => w[0]).join('');
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (src && !broken)
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={style} className={clsx('shrink-0 rounded-full object-cover', className)} />;
  return (
    <span
      aria-hidden
      style={{ ...style, background: AVATAR_BG[Math.abs(h) % AVATAR_BG.length] }}
      className={clsx('grid shrink-0 place-items-center rounded-full font-semibold text-white uppercase', className)}
    >
      {initials}
    </span>
  );
}

/** Small popover menu that replaces a native <select> (which renders as an OS menu). */
export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  icon,
  label,
  align = 'right',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; hint?: string }[];
  icon?: ReactNode;
  label: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  const cur = options.find((o) => o.id === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors',
          open ? 'border-line-strong bg-surface-2 text-fg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg',
        )}
      >
        {icon}
        {cur?.label}
        <ChevronDown size={14} className={clsx('text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={clsx(
            'animate-in absolute top-full z-40 mt-1.5 min-w-[200px] rounded-xl border border-line bg-surface p-1 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.35)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                o.id === value ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
              )}
            >
              <span className="flex-1">
                {o.label}
                {o.hint && <span className="block text-[11.5px] text-faint">{o.hint}</span>}
              </span>
              {o.id === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Button that opens a list of actions, each with an icon and an explanation. */
export function ActionMenu({
  trigger,
  label,
  items,
}: {
  trigger: ReactNode;
  label: string;
  items: { icon: ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button aria-haspopup="menu" aria-expanded={open} aria-label={label} active={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
        <ChevronDown size={14} className={clsx('text-faint transition-transform', open && 'rotate-180')} />
      </Button>
      {open && (
        <div role="menu" aria-label={label} className="animate-in absolute top-full right-0 z-40 mt-1.5 w-72 rounded-xl border border-line bg-surface p-1 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.35)]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">{it.label}</span>
                {it.hint && <span className="block text-[11.5px] leading-snug text-muted">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
