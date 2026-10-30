import clsx from 'clsx';
import { useMemo, type ReactNode } from 'react';
import { shortName } from '../../../lib/format';
import { GUID_SRC } from '../lib/parser';
import type { Level, LogFile } from '../lib/types';

/** Log-viewer building blocks: level badges, file tags and search-hit highlighting. */

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
