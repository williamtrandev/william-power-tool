import clsx from 'clsx';
import { Lock, ArrowDownUp, ArrowUpDown, Copy, StickyNote, Database, FilterX, SearchX, Download, FlaskConical, Layers, Loader2, MousePointerClick, Plus, RefreshCw, Search, SquareTerminal, TriangleAlert, Upload, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionMenu, Button, Dropdown, Kbd, Segmented } from '../../components/ui';
import type { Backend, Member } from '../../lib/backend';
import { dangerOf, fillCommand, loadVarValues, saveVarValues, type Command, type CommandInput, type CommandKind } from '../../lib/commands';
import { CommandCard, KIND_META } from './CommandCard';
import { CommandEditor, HistoryDialog } from './CommandEditor';

type KindFilter = 'all' | CommandKind;
/** rows rendered per step while scrolling the list */
const PAGE = 60;

function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function CommandRow({ cmd, selected, danger, onSelect, onCopy }: { cmd: Command; selected: boolean; danger: boolean; onSelect: () => void; onCopy: () => void }) {
  const meta = KIND_META[cmd.kind];
  return (
    <div
      role="option"
      aria-selected={selected}
      data-id={cmd.id}
      onClick={onSelect}
      className={clsx(
        'group relative flex cursor-pointer items-center gap-2.5 border-l-2 px-3 py-2 transition-colors',
        selected ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2',
      )}
    >
      <span className={clsx('grid size-7 shrink-0 place-items-center rounded-md', meta.cls)} title={meta.label}>
        <meta.icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx('truncate text-[13px] font-medium', selected ? 'text-fg' : 'text-fg-2')}>{cmd.title}</p>
        <p className="truncate text-[11.5px] text-faint">
          {cmd.category}
          {cmd.tags.length > 0 && ' · ' + cmd.tags.map((t) => '#' + t).join(' ')}
        </p>
      </div>
      {cmd.is_private && <Lock size={13} className="shrink-0 text-faint" aria-label="Riêng tư — chỉ mình bạn thấy" />}
      {danger && <TriangleAlert size={14} className="shrink-0 text-error" aria-label="Lệnh thay đổi dữ liệu / hệ thống" />}
      <span className="w-8 shrink-0 text-right text-[11px] text-faint tabular-nums group-hover:hidden" title="Số lần dùng">
        {cmd.uses}
      </span>
      <button
        type="button"
        aria-label="Copy lệnh"
        title={cmd.kind === 'note' ? 'Copy toàn bộ ghi chú' : 'Copy (dùng giá trị biến đã điền)'}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
        className="focus-ring hidden size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg group-hover:grid"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}
type Sort = 'uses' | 'recent' | 'title';

/** lower-case, no Vietnamese tone marks — "loi" finds "lỗi" */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function parseImport(text: string): CommandInput[] {
  const raw = JSON.parse(text) as unknown;
  const arr = Array.isArray(raw) ? raw : (raw as { commands?: unknown[] })?.commands;
  if (!Array.isArray(arr)) throw new Error('File JSON phải là một mảng lệnh');
  return arr.map((r, i) => {
    const o = r as Partial<CommandInput>;
    if (!o.title || !o.body) throw new Error(`Lệnh thứ ${i + 1} thiếu title hoặc body`);
    return {
      title: String(o.title).slice(0, 200),
      kind: o.kind === 'sql' || o.kind === 'note' ? o.kind : 'shell',
      is_private: o.is_private === true,
      category: String(o.category || 'Chung').slice(0, 60),
      tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
      description: String(o.description ?? ''),
      body: String(o.body),
    };
  });
}

interface Props {
  active: boolean;
  backend: Backend;
  me: Member;
  onToast: (m: string) => void;
}

export function CommandsTool({ active, backend, me, onToast }: Props) {
  const admin = me.role === 'admin';
  // owners edit their own; admins edit shared commands but never someone else's private ones
  const canEdit = useCallback((c: Command) => c.owner_id === me.user_id || (admin && !c.is_private), [admin, me.user_id]);

  const [cmds, setCmds] = useState<Command[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // "most used" order is taken when the list loads, so copying doesn't make rows jump around
  const [rank, setRank] = useState<Map<string, number>>(new Map());
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await backend.list();
      setCmds(list);
      setRank(new Map(list.map((c) => [c.id, c.uses])));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [backend]);

  // fetch the first time the tab is opened
  useEffect(() => {
    if (active && !cmds && !loading && !err) load();
  }, [active, cmds, loading, err, load]);

  // ── filters ──
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('uses');
  const [mine, setMine] = useState(false);
  const [onlyPrivate, setOnlyPrivate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => new Map((cmds ?? []).map((c) => [c.id, fold([c.title, c.description, c.body, c.category, c.tags.map((t) => '#' + t).join(' ')].join('\n'))])),
    [cmds],
  );
  const byKind = useMemo(() => (cmds ?? []).filter((c) => (kind === 'all' || c.kind === kind) && (!mine || c.owner_id === me.user_id) && (!onlyPrivate || c.is_private)),
    [cmds, kind, mine, onlyPrivate, me.user_id],
  );
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of byKind) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [byKind]);
  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const out = byKind.filter((c) => (!cat || c.category === cat) && words.every((w) => index.get(c.id)!.includes(w)));
    const uses = (c: Command) => rank.get(c.id) ?? Infinity; // new commands first
    if (sort === 'uses') out.sort((a, b) => uses(b) - uses(a) || a.title.localeCompare(b.title, 'vi'));
    else if (sort === 'recent') out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    else out.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    return out;
  }, [byKind, cat, q, sort, index, rank]);
  const filters = [q.trim() && `“${q.trim()}”`, kind !== 'all' && KIND_META[kind].label, cat && `nhóm ${cat}`, mine && 'của tôi', onlyPrivate && 'riêng tư'].filter(Boolean) as string[];
  const clearFilters = () => {
    setQ('');
    setKind('all');
    setCat(null);
    setMine(false);
    setOnlyPrivate(false);
  };
  const tagSuggestions = useMemo(() => [...new Set((cmds ?? []).flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'vi')), [cmds]);
  const dangers = useMemo(() => new Set((cmds ?? []).filter((c) => dangerOf(c)).map((c) => c.id)), [cmds]);
  const privateCount = (cmds ?? []).filter((c) => c.is_private).length;
  const kindCount = (k: KindFilter) => (cmds ?? []).filter((c) => k === 'all' || c.kind === k).length;

  // "/" jumps to search while this tab is open
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active]);

  // ── variables: one shared value per name, so a trace id typed once fills every command ──
  const [values, setValues] = useState(loadVarValues);
  const setValue = useCallback((name: string, v: string) => {
    setValues((s) => {
      const n = { ...s, [name]: v };
      saveVarValues(n);
      return n;
    });
  }, []);

  // ── actions ──
  const onCopy = useCallback(
    (cmd: Command, text: string) => {
      navigator.clipboard.writeText(text).then(
        () => onToast(cmd.kind === 'note' ? 'Đã copy' : /\{\{[^}]+\}\}/.test(text) ? 'Đã copy — còn biến chưa điền' : 'Đã copy lệnh'),
        () => onToast('Trình duyệt chặn copy'),
      );
      setCmds((l) => l?.map((c) => (c.id === cmd.id ? { ...c, uses: c.uses + 1 } : c)) ?? l);
      backend.bump(cmd.id).catch(() => {});
    },
    [backend, onToast],
  );

  // ── selection, incremental rendering, keyboard ──
  const wide = useWide();
  const [selId, setSelId] = useState<string | null>(null);
  const selIdx = shown.findIndex((c) => c.id === selId);
  const selected = selIdx >= 0 ? shown[selIdx] : null;
  // on wide screens something is always open in the detail pane
  useEffect(() => {
    if (wide && !selected && shown.length) setSelId(shown[0].id);
  }, [wide, selected, shown]);

  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q, kind, cat, sort, mine, onlyPrivate]);
  const listRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, shown.length]);

  const select = useCallback((id: string) => {
    setSelId(id);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, []);
  const copyCmd = useCallback((c: Command) => onCopy(c, fillCommand(c.body, values)), [onCopy, values]);

  // ↑ ↓ pick a command, Enter copies it — from the search box or anywhere outside a text field
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || document.querySelector('[role="dialog"]')) return;
      const t = e.target as HTMLElement;
      const inSearch = t === searchRef.current;
      const inVar = !!t.closest('[data-var-input]');
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (inSearch || !typing) && shown.length) {
        e.preventDefault();
        const i = Math.min(shown.length - 1, Math.max(0, selIdx + (e.key === 'ArrowDown' ? 1 : -1)));
        if (i >= limit - 5) setLimit(i + PAGE);
        select(shown[i].id);
      } else if (e.key === 'Enter' && selected && (inSearch || inVar || !typing) && !(t.tagName === 'BUTTON')) {
        e.preventDefault();
        copyCmd(selected);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active, shown, selIdx, selected, limit, select, copyCmd]);

  // a command to edit, 'new', or { clone } to start a new one from a copy
  const [editing, setEditing] = useState<Command | 'new' | { clone: Command } | null>(null);
  const editTarget = editing && editing !== 'new' && !('clone' in editing) ? editing : null;
  const [historyOf, setHistoryOf] = useState<Command | null>(null);

  const save = async (input: CommandInput) => {
    if (editTarget) {
      const c = await backend.update(editTarget.id, input);
      setCmds((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l);
      onToast('Đã lưu lệnh');
    } else {
      const c = await backend.create(input);
      setCmds((l) => [c, ...(l ?? [])]);
      select(c.id);
      onToast('Đã thêm lệnh');
    }
  };
  const onDelete = useCallback(
    async (cmd: Command) => {
      try {
        await backend.remove(cmd.id);
        setCmds((l) => l?.filter((c) => c.id !== cmd.id) ?? l);
        onToast('Đã xoá lệnh');
      } catch (e) {
        onToast((e as Error).message);
      }
    },
    [backend, onToast],
  );
  const restore = async (old: Command) => {
    const c = await backend.update(old.id, { title: old.title, kind: old.kind, category: old.category, tags: old.tags, description: old.description, body: old.body, is_private: old.is_private });
    setCmds((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l);
    onToast('Đã khôi phục');
  };

  const exportJson = () => {
    const data: CommandInput[] = (cmds ?? []).map(({ title, kind, category, tags, description, body, is_private }) => ({ title, kind, category, tags, description, body, is_private }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `william-tool-commands-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const importJson = async (file: File) => {
    setImporting(true);
    try {
      const items = parseImport(await file.text());
      // skip ones that already exist with the same title + body
      const have = new Set((cmds ?? []).map((c) => c.title + '\0' + c.body));
      const fresh = items.filter((i) => !have.has(i.title + '\0' + i.body));
      for (const i of fresh) await backend.create(i);
      onToast(`Đã nhập ${fresh.length} lệnh${items.length > fresh.length ? ` (bỏ qua ${items.length - fresh.length} lệnh trùng)` : ''}`);
      await load();
    } catch (e) {
      onToast(e instanceof SyntaxError ? 'File không phải JSON hợp lệ' : (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const onTag = useCallback((t: string) => setQ('#' + t), []);
  const onEdit = useCallback((c: Command) => setEditing(c), []);
  const onClone = useCallback((c: Command) => setEditing({ clone: c }), []);

  // ── render ──
  const detail = (c: Command) => (
    <div className="animate-in">
      <CommandCard
        key={c.id}
        cmd={c}
        canEdit={canEdit(c)}
        values={values}
        onValue={setValue}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={onDelete}
        onHistory={setHistoryOf}
        onClone={onClone}
        onTag={onTag}
      />
    </div>
  );

  const body = (
    <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      {/* list */}
      <div data-tour="c-list" className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface md:min-h-0">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3 text-[11.5px] text-faint">
          <span>
            {shown.length.toLocaleString('vi-VN')} lệnh{cmds && shown.length !== cmds.length && ` / ${cmds.length.toLocaleString('vi-VN')}`}
          </span>
          <span className="hidden items-center gap-1 md:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> chọn · <Kbd>Enter</Kbd> copy
          </span>
        </div>
        <div ref={listRef} role="listbox" aria-label="Danh sách lệnh" className="divide-y divide-line/60 md:min-h-0 md:flex-1 md:overflow-y-auto">
          {shown.slice(0, limit).map((c) => (
            <div key={c.id}>
              <CommandRow cmd={c} selected={c.id === selId} danger={dangers.has(c.id)} onSelect={() => setSelId(wide || c.id !== selId ? c.id : null)} onCopy={() => copyCmd(c)} />
              {!wide && c.id === selId && <div className="bg-surface-2/50 p-2">{detail(c)}</div>}
            </div>
          ))}
          {limit < shown.length && (
            <div ref={moreRef} className="flex items-center justify-center gap-2 py-3 text-[12px] text-faint">
              <Loader2 size={14} className="animate-spin" /> Đang hiện thêm…
            </div>
          )}
          {cmds && !shown.length && (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-faint">
                {cmds.length ? <SearchX size={20} /> : <SquareTerminal size={20} />}
              </span>
              <p className="text-[13.5px] font-medium text-fg-2">{cmds.length ? 'Không có lệnh nào khớp' : 'Chưa có lệnh nào'}</p>
              {cmds.length ? (
                <>
                  {filters.length > 0 && (
                    <p className="text-[12.5px] text-muted">
                      Đang lọc: {filters.map((f, i) => (
                        <span key={f}>
                          {i > 0 && ', '}
                          <b className="font-medium text-fg-2">{f}</b>
                        </span>
                      ))}
                    </p>
                  )}
                  <Button size="sm" className="mt-1" onClick={clearFilters}>
                    <FilterX size={14} /> Xoá bộ lọc
                  </Button>
                </>
              ) : (
                <p className="text-[12.5px] text-muted">Bấm “Thêm mới” để tạo lệnh hoặc ghi chú đầu tiên.</p>
              )}
            </div>
          )}
          {!cmds && !err && (
            <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted">
              <Loader2 size={16} className="animate-spin" /> Đang tải lệnh…
            </p>
          )}
        </div>
      </div>

      {/* detail (wide screens) */}
      {wide && (
        <div className="min-h-0 overflow-y-auto pb-2">
          {selected ? (
            <>
              {detail(selected)}
              <p className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11.5px] text-faint">
                <Kbd>/</Kbd> tìm · <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> đổi lệnh · <Kbd>Enter</Kbd> copy — kể cả khi đang gõ trong ô tìm hoặc ô biến
              </p>
            </>
          ) : (
            !!shown.length && (
              <div className="grid h-full min-h-[200px] place-items-center rounded-xl border border-dashed border-line text-center text-[13px] text-muted">
                <div className="flex flex-col items-center gap-2">
                  <MousePointerClick size={22} className="text-faint" />
                  Chọn một lệnh ở bên trái
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden', !active && 'hidden')}>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col px-4 pt-5 pb-4 md:min-h-0 md:flex-1">
        <div className="mb-3 flex shrink-0 flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="flex items-center gap-2 text-lg whitespace-nowrap font-semibold tracking-tight">
              Kho lệnh
              {backend.mode === 'demo' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
                  <FlaskConical size={12} /> Dữ liệu mẫu
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Lệnh server, câu SQL và ghi chú (link, tài khoản test, thông tin môi trường…) dùng chung của team. Ai cũng thêm được, chỉ người tạo được sửa.</p>
          </div>
          <div data-tour="c-actions" className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </Button>
            <ActionMenu
              label="Nhập / Xuất"
              trigger={
                <>
                  <ArrowDownUp size={15} /> <span className="hidden sm:inline">Nhập / Xuất</span>
                </>
              }
              items={[
                {
                  icon: <Download size={15} />,
                  label: 'Xuất ra file JSON',
                  hint: 'Tải toàn bộ lệnh & ghi chú về máy — để sao lưu hoặc chuyển sang nơi khác.',
                  onClick: exportJson,
                  disabled: !cmds?.length,
                },
                {
                  icon: importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />,
                  label: 'Nhập từ file JSON',
                  hint: 'Thêm hàng loạt từ file đã xuất (hoặc soạn theo cùng định dạng). Bỏ qua mục trùng; mục nhập vào đứng tên bạn.',
                  onClick: () => importRef.current?.click(),
                  disabled: importing,
                },
              ]}
            />
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importJson(f);
              }}
            />
            <Button variant="primary" data-tour="c-add" onClick={() => setEditing('new')}>
              <Plus size={16} /> Thêm mới
            </Button>
          </div>
        </div>

        <div className="shrink-0 space-y-2.5 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              data-tour="c-search"
              className="group relative flex h-9 min-w-[240px] flex-1 items-center rounded-lg border border-line bg-surface transition-shadow focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-ring)]"
            >
              <Search size={16} className="pointer-events-none ml-3 shrink-0 text-faint group-focus-within:text-accent" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQ('')}
                placeholder="Tìm theo tên, nội dung hoặc #tag…"
                aria-label="Tìm lệnh"
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13.5px] text-fg outline-none placeholder:text-faint"
              />
              {q ? (
                <button type="button" aria-label="Xoá tìm kiếm" onClick={() => setQ('')} className="mr-1.5 grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
                  <X size={14} />
                </button>
              ) : (
                <span className="mr-2.5 hidden sm:block">
                  <Kbd>/</Kbd>
                </span>
              )}
            </label>
            <Segmented
              label="Loại lệnh"
              tour="c-kind"
              value={kind}
              onChange={(k) => {
                setKind(k);
                setCat(null);
              }}
              items={[
                { id: 'all', label: `Tất cả · ${kindCount('all')}`, icon: <Layers size={15} /> },
                { id: 'shell', label: `Server · ${kindCount('shell')}`, icon: <SquareTerminal size={15} /> },
                { id: 'sql', label: `SQL · ${kindCount('sql')}`, icon: <Database size={15} /> },
                { id: 'note', label: `Ghi chú · ${kindCount('note')}`, icon: <StickyNote size={15} /> },
              ]}
            />
            <Dropdown
              label="Sắp xếp"
              value={sort}
              onChange={setSort}
              icon={<ArrowUpDown size={14} className="text-faint" />}
              options={[
                { id: 'uses', label: 'Dùng nhiều nhất' },
                { id: 'recent', label: 'Mới cập nhật' },
                { id: 'title', label: 'Theo tên (A → Z)' },
              ]}
            />
          </div>
          <div data-tour="c-cats" className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&>*]:shrink-0">
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => {
                setMine((v) => !v);
                setCat(null);
              }}
              className={clsx(
                'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                mine ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              <UserRound size={13} /> Của tôi
            </button>
            <button
              type="button"
              aria-pressed={onlyPrivate}
              title="Lệnh / ghi chú chỉ mình bạn thấy"
              onClick={() => {
                setOnlyPrivate((v) => !v);
                setCat(null);
              }}
              className={clsx(
                'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors',
                onlyPrivate ? 'border-accent/50 bg-accent-soft text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
              )}
            >
              <Lock size={13} /> Riêng tư
              <span className="text-[11px] text-faint tabular-nums">{privateCount}</span>
            </button>
            <span className="mx-1 h-4 w-px bg-line" />
            {[null, ...categories.map(([c]) => c)].map((c) => {
              const on = cat === c;
              const n = c ? categories.find(([x]) => x === c)![1] : byKind.length;
              return (
                <button
                  key={c ?? '*'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCat(c)}
                  className={clsx(
                    'focus-ring inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors',
                    on ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {c ?? 'Tất cả'}
                  <span className={clsx('text-[11px] tabular-nums', on ? 'text-bg/60' : 'text-faint')}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        {err && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">
            <span className="flex-1">{err}</span>
            <Button size="sm" onClick={load}>
              Thử lại
            </Button>
          </div>
        )}
        {body}
      </div>

      {editing && (
        <CommandEditor
          initial={editTarget}
          template={editing !== 'new' && 'clone' in editing ? editing.clone : undefined}
          categories={categories.map(([c]) => c)}
          tagSuggestions={tagSuggestions}
          canPrivate={!editTarget || editTarget.owner_id === me.user_id}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {historyOf && <HistoryDialog cmd={historyOf} backend={backend} canRestore={canEdit(historyOf)} onRestore={restore} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}
