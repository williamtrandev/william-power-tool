import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '../../../components/ui';

/** copies `text` (or runs `copy`) and shows a tick for a moment */
export function CopyButton({
  text,
  copy,
  label,
  children,
  onToast,
}: {
  text?: string;
  copy?: () => Promise<void>;
  label: string;
  children?: ReactNode;
  onToast: (m: string) => void;
}) {
  const [done, setDone] = useState(false);
  const run = async () => {
    try {
      await (copy ? copy() : navigator.clipboard.writeText(text ?? ''));
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      onToast('Không copy được');
    }
  };
  return (
    <Button size={children ? 'sm' : 'icon-sm'} variant="ghost" aria-label={label} title={label} onClick={run}>
      {done ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
      {children}
    </Button>
  );
}
