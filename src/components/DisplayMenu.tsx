import clsx from 'clsx';
import { Check, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FONT_SIZES, resetLogDisplay, setLogDisplay, useLogDisplay, type LogDisplay } from '../lib/useLogDisplay';
import { Button } from './ui';

const COLS: { id: keyof LogDisplay['cols']; label: string }[] = [
  { id: 'time', label: 'Thời gian' },
  { id: 'level', label: 'Level' },
  { id: 'source', label: 'Nguồn (file)' },
  { id: 'trace', label: 'Trace id' },
];

function Check2({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-fg hover:bg-surface-2"
    >
      <span
        className={clsx(
          'grid size-4 shrink-0 place-items-center rounded border transition-colors',
          checked ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface',
        )}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="px-2 pb-1 text-[10.5px] font-semibold tracking-wider text-muted uppercase">{title}</div>
      {children}
    </div>
  );
}

/** "Hiển thị" popover: column visibility, side panels and log font size. */
export function DisplayMenu() {
  const d = useLogDisplay();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const hiddenCount = COLS.filter((c) => !d.cols[c.id]).length + (d.groups ? 0 : 1) + (d.histogram ? 0 : 1);

  return (
    <div className="relative" ref={ref}>
      <Button active={open} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} title="Ẩn / hiện cột, panel và cỡ chữ">
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Hiển thị</span>
        <span className="rounded bg-surface-3 px-1 text-[10.5px] text-muted tabular-nums">{d.fontSize}px</span>
      </Button>
      {open && (
        <div role="menu" aria-label="Tuỳ chọn hiển thị" className="animate-in absolute top-10 right-0 z-30 w-[260px] divide-y divide-line rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10">
          <Section title="Cỡ chữ log">
            <div className="grid grid-cols-4 gap-1 px-1 pt-0.5 pb-1">
              {FONT_SIZES.map((f) => (
                <button
                  key={f.px}
                  type="button"
                  role="menuitemradio"
                  aria-checked={d.fontSize === f.px}
                  onClick={() => setLogDisplay({ fontSize: f.px })}
                  title={`${f.label} · ${f.px}px`}
                  className={clsx(
                    'flex flex-col items-center rounded-md border py-1.5 transition-colors',
                    d.fontSize === f.px ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:border-line-strong',
                  )}
                >
                  <span className="leading-none font-semibold" style={{ fontSize: f.px + 2 }}>
                    A
                  </span>
                  <span className="mt-1 text-[10px] text-muted">{f.label}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Cột trong bảng">
            {COLS.map((c) => (
              <Check2
                key={c.id}
                label={c.label}
                checked={d.cols[c.id]}
                onChange={(v) => setLogDisplay({ cols: { ...d.cols, [c.id]: v } })}
                hint={c.id === 'source' || c.id === 'trace' ? 'màn hình ≥ 768px' : undefined}
              />
            ))}
            <Check2 label="Nội dung" checked onChange={() => {}} hint="luôn hiện" />
          </Section>
          <Section title="Bố cục">
            <Check2 label="Panel nhóm lỗi" hint="màn hình ≥ 1280px" checked={d.groups} onChange={(v) => setLogDisplay({ groups: v })} />
            <Check2 label="Biểu đồ thời gian" checked={d.histogram} onChange={(v) => setLogDisplay({ histogram: v })} />
          </Section>
          <div className="flex items-center justify-between px-2 pt-2 pb-1">
            <span className="text-[11px] text-faint">{hiddenCount ? `Đang ẩn ${hiddenCount} mục` : 'Hiện đầy đủ'}</span>
            <button type="button" onClick={resetLogDisplay} className="text-[12px] font-medium text-accent hover:underline">
              Mặc định
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
