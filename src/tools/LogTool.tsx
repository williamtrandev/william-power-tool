import clsx from 'clsx';
import { FileUp } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { DetailPanel, type DetailTab } from '../components/DetailPanel';
import { DropZone } from '../components/DropZone';
import { FilterBar } from '../components/FilterBar';
import { GroupsPanel } from '../components/GroupsPanel';
import { Histogram } from '../components/Histogram';
import { LogTable, type LogTableHandle } from '../components/LogTable';
import { Toolbar, type Sort } from '../components/Toolbar';
import { FileBar } from '../components/FileBar';
import { FolderMenu } from '../components/FolderMenu';
import { folderKey, useFolder } from '../lib/useFolder';
import { fmtBytes } from '../lib/format';
import { groupSuspicious, parseQuery, runSearch, sigOf } from '../lib/search';
import { SUS_MIN, type Level, type LogEntry } from '../lib/types';
import { useLogs } from '../lib/useLogs';
import { exportBlob } from '../lib/rawCache';
import { sampleLogFiles } from '../lib/sampleLogs';
import { setLogDisplay, useLogDisplay } from '../lib/useLogDisplay';
import { usePanelWidth } from '../lib/usePanelWidth';

interface Props {
  /** false while another tool tab is shown — state is kept, global key/drop handlers are paused */
  active: boolean;
  onToast: (msg: string) => void;
}

export function LogTool({ active, onToast: showToast }: Props) {
  const logs = useLogs(showToast);
  const folder = useFolder({ addExternal: logs.addExternal, replaceFile: logs.replaceFile, removeByKey: logs.removeByKey }, showToast);
  const display = useLogDisplay();

  const [query, setQuery] = useState('');
  // With hundreds of thousands of entries a search pass takes a few hundred ms —
  // wait for a short pause in typing instead of re-running it on every keystroke.
  const [typedQuery, setTypedQuery] = useState('');
  const big = logs.entries.length > 50_000;
  useEffect(() => {
    if (!big) return setTypedQuery(query);
    const t = setTimeout(() => setTypedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query, big]);
  const deferredQuery = useDeferredValue(typedQuery);
  const [regex, setRegex] = useState(false);
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const sort: Sort = display.sort;
  const setSort = (v: Sort) => setLogDisplay({ sort: v });
  const [levels, setLevels] = useState<Set<Level>>(new Set());
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [tab, setTab] = useState<DetailTab>('detail');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panel = usePanelWidth();
  const [dragging, setDragging] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<LogTableHandle>(null);

  const q = useMemo(() => parseQuery(deferredQuery, regex), [deferredQuery, regex]);
  const res = useMemo(
    () => runSearch(logs.entries, logs.files, { query: q, levels, suspiciousOnly, timeRange, sig, sort }),
    [logs.entries, logs.files, q, levels, suspiciousOnly, timeRange, sig, sort],
  );
  const groups = useMemo(() => groupSuspicious(res.rows), [res]);

  // When the result set changes and the current selection fell out of it, jump to the first suspicious line —
  // unless the same line is still there (its file was just re-read from a watched folder).
  useEffect(() => {
    setSelected((cur) => {
      if (cur && res.rows.includes(cur)) return cur;
      const same = cur && res.rows.find((e) => e.f === cur.f && e.ln === cur.ln);
      return same ?? res.rows.find((e) => e.score >= SUS_MIN) ?? res.rows[0] ?? null;
    });
  }, [res]);
  // scroll the table back to the top only when the search / filters change, not when data is re-read
  const scrollKey = [deferredQuery, regex, [...levels].join(), suspiciousOnly, timeRange?.join('-'), sig, sort].join('|');

  const select = useCallback((e: LogEntry) => {
    setSelected(e);
    setSheetOpen(true);
  }, []);
  const selectFromDetail = useCallback((e: LogEntry) => {
    setSelected(e);
    setTab('detail');
  }, []);

  const move = useCallback(
    (d: number) => {
      const rows = res.rows;
      if (!rows.length) return;
      const i = selected ? rows.indexOf(selected) : -1;
      setSelected(rows[i < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, i + d))]);
    },
    [res.rows, selected],
  );

  const filterTrace = useCallback((id: string) => {
    setQuery('trace:' + id);
    setSig(null);
    setTimeRange(null);
    setLevels(new Set());
  }, []);

  const clearAll = useCallback(() => {
    setQuery('');
    setLevels(new Set());
    setTimeRange(null);
    setSig(null);
    setSuspiciousOnly(false);
  }, []);

  const [exporting, setExporting] = useState<number | null>(null);
  const exportResults = async () => {
    if (exporting != null) return;
    const rows = res.rows;
    setExporting(0);
    try {
      // entry text lives in the files: read it back in batches into a Blob (not one huge string)
      const blob = await exportBlob(rows, (e) => `### ${logs.fileById.get(e.f)?.name}:${e.ln}`, (done) => setExporting(done / rows.length));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ket-qua-log.log';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      showToast('Không tạo được file kết quả: ' + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  // the guided tour asks for demo data so it can show every feature
  useEffect(() => {
    const load = () => {
      if (!logs.files.length) logs.addFiles(sampleLogFiles());
    };
    addEventListener('wpt:load-sample', load);
    return () => removeEventListener('wpt:load-sample', load);
  }, [logs]);

  // Global shortcuts
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && /INPUT|TEXTAREA|SELECT/.test(el.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape') {
        if (expanded) setExpanded(false);
        else if (sheetOpen) setSheetOpen(false);
        else if (typing) el?.blur();
        else clearAll();
      } else if (e.key === 'ArrowDown' && el === searchRef.current) {
        e.preventDefault();
        tableRef.current?.focus();
        move(1);
      } else if (!typing && (e.key === 'j' || e.key === 'k') && !el?.closest('[role=grid]')) {
        move(e.key === 'j' ? 1 : -1);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active, clearAll, move, sheetOpen, expanded]);

  // Drag & drop anywhere on the page
  useEffect(() => {
    if (!active) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      if (--depth <= 0) {
        depth = 0;
        setDragging(false);
      }
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) logs.addFiles([...e.dataTransfer.files]);
    };
    addEventListener('dragenter', enter);
    addEventListener('dragleave', leave);
    addEventListener('dragover', over);
    addEventListener('drop', drop);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragleave', leave);
      removeEventListener('dragover', over);
      removeEventListener('drop', drop);
    };
  }, [active, logs.addFiles]);

  const hasFilters = !!(query || levels.size || timeRange || sig || suspiciousOnly);
  const detailProps = {
    entry: selected,
    tab,
    onTab: setTab,
    fileById: logs.fileById,
    traceIndex: logs.traceIndex,
    hl: q.hl,
    onSelect: selectFromDetail,
    onFilterTrace: filterTrace,
    onFilterSig: (e: LogEntry) => setSig(sigOf(e)),
    onToast: showToast,
  };

  const fileBar = (
    <FileBar
      files={logs.files}
      onAdd={logs.addFiles}
      onToggleFile={logs.toggleFile}
      onRemoveFile={(id) => {
        const f = logs.fileById.get(id);
        if (f && f.storeId === folderKey(f.name)) folder.unselect(f.name);
        logs.removeFile(id);
      }}
      onClearAll={() => {
        folder.unselectAll();
        logs.clearFiles();
        clearAll();
        setSelected(null);
      }}
      folderSlot={<FolderMenu folder={folder} compact />}
    />
  );

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col', !active && 'hidden')} style={{ '--log-fs': `${display.fontSize}px` } as React.CSSProperties}>
      {/* one stable spot for the file bar, so its popovers survive the 0 → 1 file transition */}
      {logs.ready && (logs.files.length > 0 || folder.connected) && fileBar}
      {!logs.ready ? (
        <div className="flex-1" />
      ) : logs.files.length === 0 ? (
        logs.loading ? (
          <div className="flex-1" />
        ) : (
          <DropZone onAdd={logs.addFiles} extra={!folder.connected && <FolderMenu folder={folder} />} onSample={() => logs.addFiles(sampleLogFiles())} />
        )
      ) : (
        <>
          <div className="shrink-0 space-y-2.5 border-b border-line px-4 py-3">
            <Toolbar
              ref={searchRef}
              query={query}
              onQuery={setQuery}
              queryError={q.error}
              suspiciousOnly={suspiciousOnly}
              onSuspicious={setSuspiciousOnly}
              regex={regex}
              onRegex={setRegex}
              sort={sort}
              onSort={setSort}
              onExport={exportResults}
              canExport={res.rows.length > 0 && exporting == null}
              exportProgress={exporting}
            />
            <FilterBar
              levelCounts={res.levelCounts}
              levels={levels}
              onToggleLevel={(l) =>
                setLevels((s) => {
                  const n = new Set(s);
                  if (n.has(l)) n.delete(l);
                  else n.add(l);
                  return n;
                })
              }
              timeRange={timeRange}
              onClearTime={() => setTimeRange(null)}
              sig={sig}
              onClearSig={() => setSig(null)}
              canClear={hasFilters}
              onClearAll={clearAll}
              total={logs.entries.length}
              shown={res.rows.length}
              suspicious={res.suspicious}
            />
            {display.histogram && <Histogram rows={res.rows} range={timeRange} onPick={setTimeRange} />}
          </div>

          <main
            className={clsx(
              'grid min-h-[60vh] flex-1 grid-cols-1 md:min-h-0 md:grid-cols-[minmax(0,1fr)_var(--dw)]',
              display.groups && 'xl:grid-cols-[248px_minmax(0,1fr)_var(--dw)]',
            )}
            style={{ '--dw': `${panel.width}px` } as React.CSSProperties}
          >
            {display.groups && <GroupsPanel className="hidden xl:flex" groups={groups} active={sig} onPick={setSig} fileById={logs.fileById} hl={q.hl} />}
            <LogTable
              ref={tableRef}
              rows={res.rows}
              selected={selected}
              onSelect={select}
              onMove={move}
              fileById={logs.fileById}
              hl={q.hl}
              scrollKey={scrollKey}
              emptyHint={suspiciousOnly ? 'Thử tắt "Chỉ khả nghi" hoặc bớt từ khoá.' : 'Thử bớt từ khoá hoặc xoá bộ lọc.'}
            />
            <div className="relative hidden min-h-0 min-w-0 md:flex">
              <div
                data-tour="panel-resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Kéo để đổi độ rộng panel chi tiết"
                tabIndex={0}
                onPointerDown={panel.startDrag}
                onDoubleClick={panel.reset}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') panel.nudge(24);
                  else if (e.key === 'ArrowRight') panel.nudge(-24);
                }}
                title="Kéo để đổi độ rộng · nhấp đúp để về mặc định"
                className="group focus-ring absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize"
              >
                <span className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:w-0.5 group-hover:bg-accent group-active:bg-accent" />
              </div>
              <DetailPanel {...detailProps} className="flex-1" onExpand={() => setExpanded(true)} />
            </div>
          </main>

          {expanded && selected && (
            <div className="fixed inset-0 z-40 hidden bg-black/45 p-4 backdrop-blur-[2px] md:flex lg:p-8" onClick={() => setExpanded(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Chi tiết log"
                className="animate-in mx-auto flex min-h-0 w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-line shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <DetailPanel {...detailProps} className="flex-1 border-l-0" expanded onExpand={() => setExpanded(false)} onClose={() => setExpanded(false)} />
              </div>
            </div>
          )}

          {sheetOpen && selected && (
            <div className="fixed inset-0 z-40 flex flex-col bg-black/40 md:hidden" onClick={() => setSheetOpen(false)}>
              <div className="animate-in mt-12 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
                <DetailPanel {...detailProps} className="flex-1 border-l-0" onClose={() => setSheetOpen(false)} />
              </div>
            </div>
          )}
        </>
      )}

      {logs.loading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70 backdrop-blur-sm">
          <div className="animate-in w-[min(380px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-5 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span>
                {logs.loading.restoring ? 'Đang khôi phục file đã lưu' : 'Đang đọc file'} {logs.loading.index}/{logs.loading.total}
              </span>
              <span className="tabular-nums">{Math.round(logs.loading.progress * 100)}%</span>
            </div>
            <div className="mt-1 truncate font-medium">{logs.loading.name}</div>
            <div className="text-[12px] text-faint">{fmtBytes(logs.loading.size)}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${logs.loading.progress * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-accent">
            <FileUp size={28} />
            <span className="text-[15px] font-semibold">Thả để thêm file log</span>
          </div>
        </div>
      )}

    </div>
  );
}
