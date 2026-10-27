import clsx from 'clsx';
import { CircleHelp, KeyRound, LogOut, Moon, ScrollText, ShieldCheck, SquareTerminal, Sun, Users } from 'lucide-react';
import type { User } from '../lib/backend';
import { Avatar, Button } from './ui';

export type ToolId = 'log' | 'watane' | 'commands' | 'members';

export const TOOLS: { id: ToolId; label: string; icon: typeof ScrollText; adminOnly?: boolean }[] = [
  { id: 'log', label: 'Log', icon: ScrollText },
  { id: 'watane', label: 'Giải mã Watane', icon: KeyRound },
  { id: 'commands', label: 'Kho lệnh', icon: SquareTerminal },
  { id: 'members', label: 'Thành viên', icon: Users, adminOnly: true },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 10.5l3.2 11 4.8-8 4.8 8 3.2-11" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">William Tool</span>
    </div>
  );
}

interface Props {
  tool: ToolId;
  user: User;
  admin: boolean;
  /** sign-ups waiting for approval (admins only) */
  pending: number;
  onSignOut: () => void;
  onTool: (t: ToolId) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onHelp: () => void;
}

export function AppHeader({ tool, user, admin, pending, onSignOut, onTool, theme, onToggleTheme, onHelp }: Props) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
      <Logo />
      <nav data-tour="tool-tabs" aria-label="Công cụ" className="flex h-full items-stretch gap-1">
        {TOOLS.filter((t) => admin || !t.adminOnly).map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            title={label}
            aria-current={tool === id ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              onTool(id);
            }}
            className={clsx(
              'focus-ring relative inline-flex items-center gap-1.5 px-2.5 whitespace-nowrap text-[13px] font-medium transition-colors',
              tool === id ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            <Icon size={16} />
            <span className="hidden whitespace-nowrap lg:inline">{label}</span>
            {id === 'members' && pending > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-bold text-white tabular-nums" title={`${pending} tài khoản chờ duyệt`}>
                {pending}
              </span>
            )}
            {tool === id && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" />}
          </a>
        ))}
      </nav>
      <Button variant="ghost" size="sm" className="ml-auto" data-tour="help" onClick={onHelp} title="Hướng dẫn sử dụng từng bước">
        <CircleHelp size={16} />
        <span className="hidden xl:inline">Hướng dẫn</span>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng/tối" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </Button>
      <div className="flex items-center gap-1.5 border-l border-line pl-3">
        <div className="flex min-w-0 items-center gap-2" title={`${user.name ? user.name + ' · ' : ''}${user.email}${admin ? ' · admin' : ''}`}>
          <span className="relative">
            <Avatar src={user.avatar} name={user.name} email={user.email} size={28} />
            {admin && (
              <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-accent text-white ring-2 ring-surface">
                <ShieldCheck size={10} strokeWidth={2.5} />
              </span>
            )}
          </span>
          <span className="hidden max-w-[180px] min-w-0 leading-tight md:block">
            <span className="block truncate text-[12.5px] font-medium text-fg">{user.name || user.email.split('@')[0]}</span>
            <span className="block truncate text-[11px] text-faint">{admin ? 'Admin' : 'Thành viên'}</span>
          </span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Đăng xuất" title="Đăng xuất" onClick={onSignOut}>
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
}
