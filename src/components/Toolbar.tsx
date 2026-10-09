import clsx from 'clsx';
import { ArrowDownWideNarrow, Download, HelpCircle, Regex, Search, ShieldAlert, X } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Button, Kbd, Switch } from './ui';

export type Sort = 'asc' | 'desc' | 'score';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  queryError: string | null;
  suspiciousOnly: boolean;
  onSuspicious: (v: boolean) => void;
  regex: boolean;
  onRegex: (v: boolean) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  onExport: () => void;
  canExport: boolean;
}

const SYNTAX: [string, string][] = [
  ['export timeout', 'Có cả hai từ (AND)'],
  ['export|import', 'Một trong các từ (OR)'],
  ['"timed out"', 'Đúng cụm từ'],
  ['-healthcheck', 'Loại trừ'],
  ['level:error,warn', 'Lọc theo level'],
  ['trace:3e4fb6b3', 'Theo trace / request id'],
  ['file:gw', 'Theo tên file'],
];

const REGEX_EXAMPLES: [string, string][] = [
  ['HTTP [45]\\d\\d', 'Mọi HTTP 4xx / 5xx'],
  ['timed? ?out', 'timeout, timed out, time out'],
  ['user\\.(export|import)', 'user.export hoặc user.import'],
  ['"(code|message)": "[^"]+fail', 'Field code/message chứa fail'],
];

export const Toolbar = forwardRef<HTMLInputElement, Props>(function Toolbar(p, ref) {
  const [help, setHelp] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!help) return;
    const close = (e: MouseEvent) => {
      if (!helpRef.current?.contains(e.target as Node)) setHelp(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [help]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input
          ref={ref}
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          placeholder={
            p.regex ? 'Regex…  vd: timed? ?out   HTTP [45]\\d\\d   user\\.(export|import)' : 'Tìm kiếm…  vd: export   "timed out"   -healthcheck   level:error'
          }
          spellCheck={false}
          autoComplete="off"
          aria-label="Tìm kiếm log"
          aria-invalid={!!p.queryError}
          title={p.queryError ?? undefined}
          className={clsx(
            'h-9 w-full rounded-lg border bg-surface pr-24 pl-9 font-mono text-[13px] text-fg transition-shadow outline-none placeholder:font-sans placeholder:text-faint',
            p.queryError
              ? 'border-error focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--lv-error)_25%,transparent)]'
              : 'border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)]',
          )}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          <button
            type="button"
            aria-pressed={p.regex}
            onClick={() => p.onRegex(!p.regex)}
            title={p.regex ? 'Đang dùng regex — bấm để tìm theo chữ thường' : 'Bật regex: mỗi từ khoá là một biểu thức chính quy (vd: HTTP [45]\\d\\d)'}
            className={clsx(
              'focus-ring inline-flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[11.5px] font-semibold transition-colors',
              p.regex ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <Regex size={13} />
            {p.regex && <span className="font-sans text-[11px]">Regex</span>}
          </button>
          {p.query ? (
            <button
              type="button"
              aria-label="Xoá từ khoá"
              onClick={() => p.onQuery('')}
              className="focus-ring grid size-6 place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X size={14} />
            </button>
          ) : (
            <Kbd>/</Kbd>
          )}
        </div>
        {p.queryError && (
          <div role="alert" className="animate-in absolute top-full left-0 z-30 mt-1 max-w-full rounded-md border border-error/40 bg-surface px-2 py-1 font-mono text-[11.5px] text-error shadow-lg">
            Regex không hợp lệ: {p.queryError}
          </div>
        )}
      </div>

      <div className="relative" ref={helpRef}>
        <Button variant="ghost" className="w-8 px-0" aria-label="Cú pháp tìm kiếm" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
          <HelpCircle size={16} />
        </Button>
        {help && (
          <div className="animate-in absolute top-10 right-0 z-30 w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10 sm:left-0">
            <div className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Cú pháp tìm kiếm</div>
            <table className="w-full text-[12.5px]">
              <tbody>
                {SYNTAX.map(([code, desc]) => (
                  <tr key={code}>
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg hover:bg-surface-3"
                        onClick={() => {
                          p.onRegex(false);
                          p.onQuery(code);
                          setHelp(false);
                        }}
                      >
                        {code}
                      </button>
                    </td>
                    <td className="py-1 text-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 mb-1.5 flex items-center gap-1.5 border-t border-line pt-2.5 text-xs font-semibold tracking-wide text-muted uppercase">
              Regex <span className="font-normal normal-case">(bật nút <Regex size={11} className="inline" /> trong ô tìm)</span>
            </div>
            <table className="w-full text-[12.5px]">
              <tbody>
                {REGEX_EXAMPLES.map(([code, desc]) => (
                  <tr key={code}>
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg hover:bg-surface-3"
                        onClick={() => {
                          p.onRegex(true);
                          p.onQuery(code);
                          setHelp(false);
                        }}
                      >
                        {code}
                      </button>
                    </td>
                    <td className="py-1 text-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[11.5px] text-muted">
              <span><Kbd>/</Kbd> tìm</span>
              <span><Kbd>j</Kbd> <Kbd>k</Kbd> lên/xuống</span>
              <span><Kbd>Esc</Kbd> xoá lọc</span>
            </div>
          </div>
        )}
      </div>

      <Switch checked={p.suspiciousOnly} onChange={p.onSuspicious} label="Chỉ khả nghi" icon={<ShieldAlert size={14} />} />
      <label className="relative inline-flex h-8 items-center">
        <ArrowDownWideNarrow size={14} className="pointer-events-none absolute left-2.5 text-muted" />
        <select
          value={p.sort}
          onChange={(e) => p.onSort(e.target.value as Sort)}
          aria-label="Sắp xếp"
          className="focus-ring h-8 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-3 pl-8 text-[13px] font-medium text-fg-2 hover:border-line-strong"
        >
          <option value="asc">Cũ → mới</option>
          <option value="desc">Mới → cũ</option>
          <option value="score">Khả nghi nhất</option>
        </select>
      </label>
      <Button onClick={p.onExport} disabled={!p.canExport} title="Tải các dòng đang hiển thị về file .log">
        <Download size={14} />
        <span className="hidden sm:inline">Tải kết quả</span>
      </Button>
    </div>
  );
});
