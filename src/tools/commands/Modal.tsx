import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui';

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-10" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`modal-panel flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_32px_96px_-24px_rgb(0_0_0/0.5)] ${wide ? 'max-w-[720px]' : 'max-w-xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 px-5 pt-1">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted">{title}</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Đóng" onClick={onClose}>
            <X size={17} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-5">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
