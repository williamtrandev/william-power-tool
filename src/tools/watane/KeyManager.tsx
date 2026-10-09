import clsx from 'clsx';
import { Check, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keyInfo } from '../../lib/aesCodec';
import type { SavedKey } from '../../lib/useKeyStore';
import { Button } from '../../components/ui';

const mask = (k: string) => (k.length <= 6 ? '•'.repeat(k.length) : k.slice(0, 3) + '•'.repeat(Math.min(12, k.length - 6)) + k.slice(-3));

function KeyBadge({ value }: { value: string }) {
  const info = keyInfo(value);
  return (
    <span
      className={clsx(
        'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap tabular-nums',
        info.valid ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-error/12 text-error',
      )}
    >
      {info.valid ? info.label : `${info.bytes} byte · ${info.label}`}
    </span>
  );
}

interface FormProps {
  initial?: SavedKey;
  taken: string[];
  onSave: (label: string, key: string) => void;
  onCancel?: () => void;
}

function KeyForm({ initial, taken, onSave, onCancel }: FormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [show, setShow] = useState(!initial);
  const info = keyInfo(key);
  const dup = taken.includes(label.trim().toLowerCase());
  const canSave = !!label.trim() && info.valid && !dup;
  return (
    <form
      className="grid gap-2 rounded-lg border border-accent/40 bg-accent-soft/40 p-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(label, key);
      }}
    >
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label, vd: Watane Prod"
        aria-label="Label của key"
        aria-invalid={dup}
        className={clsx(
          'focus-ring h-9 rounded-md border bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint',
          dup ? 'border-error' : 'border-line',
        )}
      />
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Secret key (16 / 24 / 32 ký tự)"
          aria-label="Secret key"
          spellCheck={false}
          autoComplete="off"
          className={clsx(
            'focus-ring h-9 w-full rounded-md border bg-surface pr-32 pl-2.5 font-mono text-[13px] text-fg placeholder:font-sans placeholder:text-faint',
            key && !info.valid ? 'border-error' : 'border-line',
          )}
        />
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-1">
          {key && <KeyBadge value={key} />}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Ẩn key' : 'Hiện key'}
            className="focus-ring grid size-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" variant="primary" className="h-9" disabled={!canSave}>
          <Check size={16} /> {initial ? 'Lưu' : 'Thêm'}
        </Button>
        {onCancel && (
          <Button className="h-9" onClick={onCancel}>
            Huỷ
          </Button>
        )}
      </div>
      {dup && <p className="text-[11.5px] text-error sm:col-span-3">Label này đã tồn tại.</p>}
    </form>
  );
}

function KeyRow({ k, selected, onSelect, onEdit, onDelete }: { k: SavedKey; selected: boolean; onSelect: () => void; onEdit: () => void; onDelete: () => void }) {
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <li
      className={clsx(
        'group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
        selected ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input type="radio" name="watane-key" autoComplete="off" checked={selected} onChange={onSelect} className="size-3.5 shrink-0 accent-[var(--accent)]" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-fg">{k.label}</span>
          <span className="block truncate font-mono text-[12px] text-muted">{show ? k.key : mask(k.key)}</span>
        </span>
      </label>
      <KeyBadge value={k.key} />
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? `Ẩn key ${k.label}` : `Hiện key ${k.label}`}
          className="focus-ring grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Sửa key ${k.label}`}
          className="focus-ring grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          <Pencil size={15} />
        </button>
        {confirm ? (
          <button
            type="button"
            onClick={onDelete}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-md bg-error px-2 text-[11.5px] font-medium text-white"
          >
            <Trash2 size={14} /> Xoá?
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label={`Xoá key ${k.label}`}
            className="focus-ring grid size-7 place-items-center rounded-md text-muted hover:bg-error/10 hover:text-error"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </li>
  );
}

interface Props {
  keys: SavedKey[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (label: string, key: string) => void;
  onUpdate: (id: string, patch: { label: string; key: string }) => void;
  onRemove: (id: string) => void;
}

export function KeyManager({ keys, selectedId, onSelect, onAdd, onUpdate, onRemove }: Props) {
  const [adding, setAdding] = useState(keys.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const labels = (except?: string) => keys.filter((k) => k.id !== except).map((k) => k.label.trim().toLowerCase());

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <KeyRound size={16} className="text-accent" /> Secret keys
          {keys.length > 0 && <span className="rounded bg-surface-2 px-1.5 text-[11px] font-medium text-muted tabular-nums">{keys.length}</span>}
        </h2>
        <span className="hidden text-[11.5px] text-faint sm:inline">AES · ECB · PKCS7 · Base64</span>
        {!adding && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus size={15} /> Thêm key
          </Button>
        )}
      </div>

      <ul className="space-y-1.5">
        {keys.map((k) =>
          editing === k.id ? (
            <li key={k.id}>
              <KeyForm
                initial={k}
                taken={labels(k.id)}
                onSave={(label, key) => {
                  onUpdate(k.id, { label, key });
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <KeyRow key={k.id} k={k} selected={k.id === selectedId} onSelect={() => onSelect(k.id)} onEdit={() => setEditing(k.id)} onDelete={() => onRemove(k.id)} />
          ),
        )}
      </ul>

      {adding && (
        <div className={clsx(keys.length > 0 && 'mt-2')}>
          <KeyForm
            taken={labels()}
            onSave={(label, key) => {
              onAdd(label, key);
              setAdding(false);
            }}
            onCancel={keys.length > 0 ? () => setAdding(false) : undefined}
          />
        </div>
      )}

      <p className="mt-3 text-[11.5px] text-faint">
        Key được lưu trong trình duyệt này (localStorage) — chỉ dùng trên máy cá nhân, xoá key khi không cần nữa.
      </p>
    </section>
  );
}
