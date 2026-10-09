import clsx from 'clsx';
import { ClipboardList, FileSpreadsheet, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import { decrypt, encrypt, keyInfo } from '../../lib/aesCodec';
import { CsvPanel } from './CsvPanel';
import { KeyField } from './KeyField';
import { PastePanel } from './PastePanel';

const KEY_STORE = 'william-tool-watane-key';

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

type Mode = 'paste' | 'csv';

function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon: React.ReactNode }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={clsx(
            'focus-ring inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors',
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

export function WataneTool({ active, onToast }: { active: boolean; onToast: (m: string) => void }) {
  const [key, setKey] = useState(storedKey);
  const [remember, setRemember] = useState(() => !!storedKey());
  const [mode, setMode] = useState<Mode>('paste');
  const [dir, setDir] = useState<'decrypt' | 'encrypt'>('decrypt');
  const dKey = useDeferredValue(key);
  const keyReady = keyInfo(dKey).valid;

  useEffect(() => {
    try {
      if (remember && key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      /* storage unavailable */
    }
  }, [remember, key]);

  const decrypting = dir === 'decrypt';
  const run = useCallback((s: string) => (decrypting ? decrypt(s, dKey) : encrypt(s, dKey)), [decrypting, dKey]);
  const panelProps = { run, decrypting, keyReady, onToast };

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Giải mã Watane</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">Giải mã / mã hoá code Watane bằng AES-ECB với secret key — giống script Python, chạy ngay trên trình duyệt.</p>
        </div>

        <KeyField value={key} onChange={setKey} remember={remember} onRemember={setRemember} />

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Nguồn dữ liệu"
            value={mode}
            onChange={setMode}
            items={[
              { id: 'paste', label: 'Dán mã', icon: <ClipboardList size={13} /> },
              { id: 'csv', label: 'File CSV', icon: <FileSpreadsheet size={13} /> },
            ]}
          />
          <Segmented
            label="Chiều xử lý"
            value={dir}
            onChange={setDir}
            items={[
              { id: 'decrypt', label: 'Giải mã', icon: <LockOpen size={13} /> },
              { id: 'encrypt', label: 'Mã hoá', icon: <Lock size={13} /> },
            ]}
          />
        </div>

        {/* keep both mounted so switching modes doesn't lose pasted text or the loaded CSV */}
        <div className={clsx(mode !== 'paste' && 'hidden')}>
          <PastePanel {...panelProps} />
        </div>
        <div className={clsx(mode !== 'csv' && 'hidden')}>
          <CsvPanel {...panelProps} />
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-faint">
          <ShieldCheck size={13} /> Key và dữ liệu chỉ được xử lý trong trình duyệt, không gửi đi đâu.
        </p>
      </div>
    </div>
  );
}
