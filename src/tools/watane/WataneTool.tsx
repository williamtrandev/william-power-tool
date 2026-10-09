import clsx from 'clsx';
import { ClipboardList, FileSpreadsheet, KeyRound, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { decrypt, encrypt, keyInfo } from '../../lib/aesCodec';
import { useKeyStore } from '../../lib/useKeyStore';
import { FilePanel } from './FilePanel';
import { KeyManager } from './KeyManager';
import { PastePanel } from './PastePanel';

type Mode = 'paste' | 'file';

function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; icon: React.ReactNode }[];
  label: string;
}) {
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
  const store = useKeyStore();
  const [mode, setMode] = useState<Mode>('paste');
  const [dir, setDir] = useState<'decrypt' | 'encrypt'>('decrypt');
  const key = store.selected?.key ?? '';
  const keyReady = keyInfo(key).valid;

  const decrypting = dir === 'decrypt';
  const run = useCallback((s: string) => (decrypting ? decrypt(s, key) : encrypt(s, key)), [decrypting, key]);
  const panelProps = { run, decrypting, keyReady, onToast };

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 py-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Giải mã Watane</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">Giải mã / mã hoá code Watane bằng AES-ECB với secret key — giống script Python, chạy ngay trên trình duyệt.</p>
        </div>

        <KeyManager
          keys={store.keys}
          selectedId={store.selected?.id ?? null}
          onSelect={store.select}
          onAdd={store.add}
          onUpdate={store.update}
          onRemove={store.remove}
        />

        <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 bg-bg/90 px-4 py-2 backdrop-blur">
          <Segmented
            label="Nguồn dữ liệu"
            value={mode}
            onChange={setMode}
            items={[
              { id: 'paste', label: 'Dán mã', icon: <ClipboardList size={13} /> },
              { id: 'file', label: 'File CSV / Excel', icon: <FileSpreadsheet size={13} /> },
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
          <label className={clsx('relative ml-auto inline-flex h-8 items-center', !store.keys.length && 'opacity-50')}>
            <KeyRound size={13} className={clsx('pointer-events-none absolute left-2.5', keyReady ? 'text-accent' : 'text-error')} />
            <select
              value={store.selected?.id ?? ''}
              onChange={(e) => store.select(e.target.value)}
              disabled={!store.keys.length}
              aria-label="Key dùng để xử lý"
              autoComplete="off"
              className={clsx(
                'focus-ring h-8 max-w-[260px] cursor-pointer appearance-none truncate rounded-md border bg-surface pr-3 pl-7 text-[12.5px] font-medium text-fg',
                keyReady ? 'border-accent/50' : 'border-error/60',
              )}
            >
              {!store.keys.length && <option value="">Chưa có key</option>}
              {store.keys.map((k) => (
                <option key={k.id} value={k.id}>
                  Key: {k.label} · {keyInfo(k.key).valid ? keyInfo(k.key).label : 'không hợp lệ'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* keep both mounted so switching modes doesn't lose pasted text or the loaded file */}
        <div className={clsx(mode !== 'paste' && 'hidden')}>
          <PastePanel {...panelProps} />
        </div>
        <div className={clsx(mode !== 'file' && 'hidden')}>
          <FilePanel {...panelProps} />
        </div>

        <p className="flex items-center gap-1.5 text-[12px] text-faint">
          <ShieldCheck size={13} /> Key và dữ liệu chỉ được xử lý trong trình duyệt, không gửi đi đâu.
        </p>
      </div>
    </div>
  );
}
