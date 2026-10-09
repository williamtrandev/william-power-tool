import clsx from 'clsx';
import { KeyRound, Moon, ScrollText, Sun } from 'lucide-react';
import { Button } from './ui';

export type ToolId = 'log' | 'watane';

export const TOOLS: { id: ToolId; label: string; icon: typeof ScrollText }[] = [
  { id: 'log', label: 'Log', icon: ScrollText },
  { id: 'watane', label: 'Giải mã Watane', icon: KeyRound },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 10.5l3.2 11 4.8-8 4.8 8 3.2-11" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">William Tool</span>
    </div>
  );
}

interface Props {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function AppHeader({ tool, onTool, theme, onToggleTheme }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
      <Logo />
      <nav aria-label="Công cụ" className="flex h-full items-stretch gap-1">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={tool === id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              onTool(id);
            }}
            className={clsx(
              'focus-ring relative inline-flex items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors',
              tool === id ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
            {tool === id && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" />}
          </a>
        ))}
      </nav>
      <Button variant="ghost" className="ml-auto w-8 px-0" aria-label="Đổi giao diện sáng/tối" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </Button>
    </header>
  );
}
