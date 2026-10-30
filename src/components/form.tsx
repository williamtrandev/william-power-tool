import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Class for text inputs, selects and textareas in editor dialogs. */
export const field =
  'focus-ring h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-fg placeholder:text-faint hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_var(--accent-ring)]';
/** Same, one step smaller, for dense forms */
export const fieldSm = field.replace('h-10', 'h-9').replace('text-[13.5px]', 'text-[13px]');

/** Field caption, with an optional faint hint after a dash. */
export function Label({ children, hint, compact }: { children: ReactNode; hint?: string; compact?: boolean }) {
  return (
    <p className={clsx('font-medium text-fg-2', compact ? 'mb-1 text-[12px]' : 'mb-1.5 text-[12.5px]')}>
      {children} {hint && <span className="font-normal text-faint">— {hint}</span>}
    </p>
  );
}
