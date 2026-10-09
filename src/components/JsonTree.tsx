import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Highlight } from './ui';

export type ExpandMode = 'auto' | 'all' | 'none';

const STR_MAX = 240;

function StringValue({ s, hl }: { s: string; hl: RegExp | null }) {
  const [open, setOpen] = useState(false);
  const long = s.length > STR_MAX;
  const shown = long && !open ? s.slice(0, STR_MAX) : s;
  return (
    <span className="break-all whitespace-pre-wrap text-emerald-700 dark:text-emerald-400">
      "<Highlight text={shown} hl={hl} />
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mx-0.5 rounded bg-accent-soft px-1 font-sans text-[10.5px] font-medium text-accent"
        >
          {open ? 'thu gọn' : `…+${(s.length - STR_MAX).toLocaleString('vi-VN')} ký tự`}
        </button>
      )}
      "
    </span>
  );
}

function Primitive({ v, hl }: { v: unknown; hl: RegExp | null }) {
  if (v === null) return <span className="text-faint italic">null</span>;
  if (typeof v === 'string') return <StringValue s={v} hl={hl} />;
  if (typeof v === 'number') return <span className="text-sky-700 dark:text-sky-400">{String(v)}</span>;
  if (typeof v === 'boolean') return <span className={v ? 'text-violet-600 dark:text-violet-400' : 'text-error'}>{String(v)}</span>;
  return <span>{String(v)}</span>;
}

function Node({ name, value, depth, mode, hl }: { name: string | null; value: unknown; depth: number; mode: ExpandMode; hl: RegExp | null }) {
  const isArr = Array.isArray(value);
  const isObj = !!value && typeof value === 'object';
  const entries: [string, unknown][] = isObj ? (isArr ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as object)) : [];
  const [open, setOpen] = useState(mode === 'all' ? true : mode === 'none' ? depth === 0 : depth < 2 || entries.length <= 4);
  const pad = { paddingLeft: depth * 16 };

  const key =
    name === null ? null : (
      <span className={clsx('font-medium', isArr || /^\d+$/.test(name) ? 'text-muted' : 'text-fg')}>
        <Highlight text={name} hl={hl} />
        <span className="text-faint">: </span>
      </span>
    );

  if (!isObj)
    return (
      <div className="flex rounded py-px hover:bg-surface-2" style={pad}>
        <span className="w-4 shrink-0" />
        <span className="min-w-0">
          {key}
          <Primitive v={value} hl={hl} />
        </span>
      </div>
    );

  const summary = isArr ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full rounded py-px text-left hover:bg-surface-2" style={pad} aria-expanded={open}>
        <ChevronRight size={12} className={clsx('mt-[3px] w-4 shrink-0 text-faint transition-transform', open && 'rotate-90')} />
        <span className="min-w-0">
          {key}
          <span className="text-faint">{summary}</span>
          {!open && entries.length > 0 && (
            <span className="ml-2 text-faint">
              {entries
                .slice(0, 3)
                .map(([k]) => k)
                .join(', ')}
              {entries.length > 3 && ', …'}
            </span>
          )}
        </span>
      </button>
      {open && entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} mode={mode} hl={hl} />)}
    </div>
  );
}

export function JsonTree({ value, mode, hl }: { value: object; mode: ExpandMode; hl: RegExp | null }) {
  return (
    <div className="font-mono text-[12px] leading-[1.65]">
      <Node name={null} value={value} depth={0} mode={mode} hl={hl} />
    </div>
  );
}
