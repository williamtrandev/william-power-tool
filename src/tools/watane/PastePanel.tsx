import clsx from 'clsx';
import { AlertCircle, Check, ClipboardCopy, Copy } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { type CodecResult } from '../../lib/aesCodec';
import { nf } from '../../lib/format';
import { Button } from '../../components/ui';

interface Props {
  run: (s: string) => CodecResult;
  decrypting: boolean;
  keyReady: boolean;
  onToast: (m: string) => void;
}

export function PastePanel({ run, decrypting, keyReady, onToast }: Props) {
  const [input, setInput] = useState('');
  const deferred = useDeferredValue(input);
  const [copied, setCopied] = useState<number | 'all' | null>(null);

  const rows = useMemo(
    () =>
      deferred
        .split(/\r?\n/)
        .map((line, i) => ({ i, line: line.trim() }))
        .filter((r) => r.line)
        .map((r) => ({ ...r, res: keyReady ? run(r.line) : null })),
    [deferred, run, keyReady],
  );
  const ok = rows.filter((r) => r.res?.ok).length;
  const bad = rows.filter((r) => r.res && !r.res.ok).length;

  const copy = async (text: string, id: number | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      onToast('Không copy được');
    }
  };

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-2">
      <section className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex h-10 items-center justify-between border-b border-line px-3">
          <span className="text-[12.5px] font-semibold">{decrypting ? 'Mã cần giải mã' : 'Chuỗi cần mã hoá'}</span>
          <span className="text-[11.5px] text-faint">mỗi dòng một {decrypting ? 'mã' : 'chuỗi'}</span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          placeholder={decrypting ? 'Dán một hoặc nhiều mã Base64, mỗi dòng một mã…' : 'Nhập chuỗi cần mã hoá, mỗi dòng một chuỗi…'}
          aria-label={decrypting ? 'Mã cần giải mã' : 'Chuỗi cần mã hoá'}
          className="min-h-0 flex-1 resize-none bg-surface p-3 font-mono text-[12.5px] leading-[1.7] text-fg outline-none placeholder:font-sans placeholder:text-faint"
        />
      </section>

      <section className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex h-10 items-center gap-2 border-b border-line px-3">
          <span className="text-[12.5px] font-semibold">Kết quả</span>
          {rows.length > 0 && keyReady && (
            <span className="text-[11.5px] text-muted tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">{nf(ok)} thành công</span>
              {bad > 0 && <span className="text-error"> · {nf(bad)} lỗi</span>}
            </span>
          )}
          {ok > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => copy(rows.map((r) => (r.res?.ok ? r.res.value : `ERROR: ${r.res?.error ?? ''}`)).join('\n'), 'all')}
            >
              {copied === 'all' ? <Check size={13} className="text-emerald-500" /> : <ClipboardCopy size={13} />}
              Copy tất cả
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!keyReady ? (
            <Empty text="Thêm hoặc chọn một key hợp lệ để bắt đầu" />
          ) : rows.length === 0 ? (
            <Empty text={decrypting ? 'Kết quả giải mã sẽ hiện ở đây' : 'Kết quả mã hoá sẽ hiện ở đây'} />
          ) : (
            <ol>
              {rows.map((r, idx) => (
                <li key={r.i} className="group flex items-start gap-3 border-b border-line px-3 py-2">
                  <span className="mt-0.5 w-6 shrink-0 text-right font-mono text-[11px] text-faint tabular-nums">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    {r.res?.ok ? (
                      <div className="font-mono text-[13px] break-all text-fg">{r.res.value}</div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[12.5px] text-error">
                        <AlertCircle size={13} className="shrink-0" /> {r.res?.error}
                      </div>
                    )}
                    <div className="mt-0.5 truncate font-mono text-[11px] text-faint" title={r.line}>
                      {r.line}
                    </div>
                  </div>
                  {r.res?.ok && (
                    <button
                      type="button"
                      aria-label="Copy kết quả"
                      onClick={() => copy((r.res as { value: string }).value, r.i)}
                      className={clsx(
                        'focus-ring grid size-7 shrink-0 place-items-center rounded-md text-muted transition-opacity hover:bg-surface-2 hover:text-fg',
                        copied === r.i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                      )}
                    >
                      {copied === r.i ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid h-full min-h-[200px] place-items-center px-6 text-center text-[12.5px] text-faint">{text}</div>;
}
