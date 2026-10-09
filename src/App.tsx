import { useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader, TOOLS, type ToolId } from './components/AppHeader';
import { useTheme } from './lib/useTheme';
import { LogTool } from './tools/LogTool';
import { WataneTool } from './tools/watane/WataneTool';

const fromHash = (): ToolId => {
  const h = location.hash.slice(1);
  return TOOLS.some((t) => t.id === h) ? (h as ToolId) : 'log';
};

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
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

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const showToast = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader tool={tool} onTool={pickTool} theme={theme} onToggleTheme={toggleTheme} />
      {/* tools stay mounted so switching tabs keeps loaded logs / pasted codes */}
      <LogTool active={tool === 'log'} onToast={showToast} />
      <WataneTool active={tool === 'watane'} onToast={showToast} />
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-fg px-3.5 py-2 text-[12.5px] text-bg shadow-lg transition-opacity ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast}
      </div>
    </div>
  );
}
