import clsx from 'clsx';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { keyInfo } from '../../lib/aesCodec';

interface Props {
  value: string;
  onChange: (v: string) => void;
  remember: boolean;
  onRemember: (v: boolean) => void;
}

export function KeyField({ value, onChange, remember, onRemember }: Props) {
  const [show, setShow] = useState(false);
  const info = keyInfo(value);
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="watane-key" className="flex items-center gap-1.5 text-[13px] font-semibold">
          <KeyRound size={14} className="text-accent" /> Secret key
        </label>
        <span className="text-[11.5px] text-faint">AES · ECB · PKCS7 · Base64</span>
      </div>
      <div className="relative">
        <input
          id="watane-key"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nhập secret key (16 / 24 / 32 ký tự)"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!value && !info.valid}
          className={clsx(
            'h-10 w-full rounded-lg border bg-surface pr-36 pl-3 font-mono text-[13.5px] outline-none transition-shadow placeholder:font-sans placeholder:text-faint',
            value && !info.valid
              ? 'border-error focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--lv-error)_22%,transparent)]'
              : 'border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)]',
          )}
        />
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1.5">
          {value && (
            <span
              className={clsx(
                'rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                info.valid ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-error/12 text-error',
              )}
            >
              {info.bytes} byte · {info.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Ẩn key' : 'Hiện key'}
            className="focus-ring grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-muted select-none">
        <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
        Ghi nhớ key trên trình duyệt này
        <span className="text-faint">— chỉ bật trên máy cá nhân</span>
      </label>
    </section>
  );
}
