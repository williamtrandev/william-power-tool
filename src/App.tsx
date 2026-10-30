import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader, MobileNav, TOOLS, type ToolId } from './components/AppHeader';
import { LoadingScreen, LoginScreen, UnconfiguredScreen, WaitingScreen } from './components/auth/AuthScreens';
import { ACCOUNT_STEPS, COMMAND_STEPS, LOG_STEPS, OT_STEPS, WATANE_STEPS } from './components/tour/steps';
import { Tour } from './components/tour/Tour';
import { createBackend } from './lib/backend';
import { useAuth } from './lib/useAuth';
import { useTheme } from './lib/useTheme';
import { CommandsTool } from './tools/commands/CommandsTool';
import { LogTool } from './tools/log/LogTool';
import { MembersTool } from './tools/members/MembersTool';
import { AccountsTool } from './tools/accounts/AccountsTool';
import { OtTool } from './tools/ot/OtTool';
import { WataneTool } from './tools/watane/WataneTool';

const backend = createBackend();

const fromHash = (): ToolId => {
  const h = location.hash.slice(1);
  return TOOLS.some((t) => t.id === h) ? (h as ToolId) : 'log';
};

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { state: auth, refresh } = useAuth(backend);
  const ready = auth.kind === 'ready' ? auth : null;
  const admin = ready?.member.role === 'admin';
  const [pending, setPending] = useState(0);
  const [tool, setTool] = useState<ToolId>(fromHash);

  useEffect(() => {
    const onHash = () => setTool(fromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const pickTool = useCallback((t: ToolId) => {
    history.replaceState(null, '', '#' + t);
    setTool(t);
  }, []);

  // guided tour: opens by itself the first time each tool is visited, and from the header button
  const [tour, setTour] = useState<ToolId | null>(null);
  const seenKey = (t: ToolId) => `wpt-tour-seen-${t}`;
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(seenKey(tool));
    } catch {
      /* storage unavailable */
    }
    if (seen) return;
    const t = setTimeout(() => setTour(tool), 700); // let the tool render first
    return () => clearTimeout(t);
  }, [tool, ready]);
  const closeTour = useCallback(() => {
    setTour((t) => {
      if (t)
        try {
          localStorage.setItem(seenKey(t), '1');
        } catch {
          /* storage unavailable */
        }
      return null;
    });
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const showToast = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const shell = { theme, onToggleTheme: toggleTheme };
  const signOut = () => backend?.signOut();
  if (auth.kind === 'unconfigured') return <UnconfiguredScreen {...shell} />;
  if (auth.kind === 'loading') return <LoadingScreen {...shell} />;
  if (auth.kind === 'signed-out') return <LoginScreen backend={backend!} {...shell} />;
  if (auth.kind !== 'ready')
    return (
      <WaitingScreen
        {...shell}
        kind={auth.kind}
        user={'user' in auth ? auth.user : undefined}
        message={auth.kind === 'error' ? auth.message : undefined}
        onRefresh={refresh}
        onSignOut={signOut}
      />
    );
  // a member who opens #members directly lands on the log tool
  const current = tool === 'members' && !admin ? 'log' : tool;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader tool={current} user={auth.user} admin={admin} pending={pending} onSignOut={signOut} onTool={pickTool} theme={theme} onToggleTheme={toggleTheme} onHelp={() => setTour(tool)} />
      {/* tools stay mounted so switching tabs keeps loaded logs / pasted codes */}
      <LogTool active={current === 'log'} onToast={showToast} />
      <WataneTool active={current === 'watane'} onToast={showToast} />
      <CommandsTool active={current === 'commands'} backend={backend!} me={auth.member} onToast={showToast} />
      <AccountsTool active={current === 'accounts'} backend={backend!} me={auth.member} onToast={showToast} />
      <OtTool active={current === 'ot'} backend={backend!} me={auth.member} onToast={showToast} />
      {admin && <MembersTool active={current === 'members'} backend={backend!} me={auth.member} onToast={showToast} onPending={setPending} />}
      <MobileNav tool={current} admin={admin} pending={pending} onTool={pickTool} />
      {tour && <Tour key={tour} steps={{ log: LOG_STEPS, watane: WATANE_STEPS, commands: COMMAND_STEPS, accounts: ACCOUNT_STEPS, ot: OT_STEPS, members: [] }[tour]} onClose={closeTour} />}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-20 left-1/2 sm:bottom-5 z-50 -translate-x-1/2 rounded-lg bg-fg px-3.5 py-2 text-[12.5px] text-bg shadow-lg transition-opacity ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast}
      </div>
    </div>
  );
}
