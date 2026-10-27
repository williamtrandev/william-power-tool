import clsx from 'clsx';
import { Database, Download, FlaskConical, Layers, Loader2, Plus, RefreshCw, Search, SquareTerminal, Upload, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented } from '../../components/ui';
import type { Backend, Member } from '../../lib/backend';
import { loadVarValues, saveVarValues, type Command, type CommandInput } from '../../lib/commands';
import { CommandCard } from './CommandCard';
import { CommandEditor, HistoryDialog } from './CommandEditor';

type KindFilter = 'all' | 'shell' | 'sql';
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
      kind: o.kind === 'sql' ? 'sql' : 'shell',
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
  const canEdit = useCallback((c: Command) => admin || c.owner_id === me.user_id, [admin, me.user_id]);

  const [cmds, setCmds] = useState<Command[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCmds(await backend.list());
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
  const searchRef = useRef<HTMLInputElement>(null);

  const index = useMemo(
    () => new Map((cmds ?? []).map((c) => [c.id, fold([c.title, c.description, c.body, c.category, c.tags.map((t) => '#' + t).join(' ')].join('\n'))])),
    [cmds],
  );
  const byKind = useMemo(() => (cmds ?? []).filter((c) => (kind === 'all' || c.kind === kind) && (!mine || c.owner_id === me.user_id)), [cmds, kind, mine, me.user_id]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of byKind) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
  }, [byKind]);
  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const out = byKind.filter((c) => (!cat || c.category === cat) && words.every((w) => index.get(c.id)!.includes(w)));
    if (sort === 'uses') out.sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title, 'vi'));
    else if (sort === 'recent') out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    else out.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    return out;
  }, [byKind, cat, q, sort, index]);
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
        () => onToast(/\{\{[^}]+\}\}/.test(text) ? 'Đã copy — còn biến chưa điền' : 'Đã copy lệnh'),
        () => onToast('Trình duyệt chặn copy'),
      );
      setCmds((l) => l?.map((c) => (c.id === cmd.id ? { ...c, uses: c.uses + 1 } : c)) ?? l);
      backend.bump(cmd.id).catch(() => {});
    },
    [backend, onToast],
  );

  const [editing, setEditing] = useState<Command | 'new' | null>(null);
  const [historyOf, setHistoryOf] = useState<Command | null>(null);

  const save = async (input: CommandInput) => {
    if (editing && editing !== 'new') {
      const c = await backend.update(editing.id, input);
      setCmds((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l);
      onToast('Đã lưu lệnh');
    } else {
      const c = await backend.create(input);
      setCmds((l) => [c, ...(l ?? [])]);
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
    const c = await backend.update(old.id, { title: old.title, kind: old.kind, category: old.category, tags: old.tags, description: old.description, body: old.body });
    setCmds((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? l);
    onToast('Đã khôi phục');
  };

  const exportJson = () => {
    const data: CommandInput[] = (cmds ?? []).map(({ title, kind, category, tags, description, body }) => ({ title, kind, category, tags, description, body }));
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

  // ── render ──
  const content = (
    <>
      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-bg/90 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <label data-tour="c-search" className="relative flex h-8 min-w-[220px] flex-1 items-center">
            <Search size={15} className="pointer-events-none absolute left-2.5 text-faint" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              placeholder="Tìm lệnh, nội dung, #tag…   ( / )"
              aria-label="Tìm lệnh"
              className="focus-ring h-8 w-full rounded-md border border-line bg-surface pr-8 pl-8 text-[13px] text-fg placeholder:text-faint"
            />
            {q && (
              <button type="button" aria-label="Xoá tìm kiếm" onClick={() => setQ('')} className="absolute right-1.5 grid size-6 place-items-center rounded text-muted hover:text-fg">
                <X size={14} />
              </button>
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
              { id: 'all', label: `Tất cả ${kindCount('all')}`, icon: <Layers size={15} /> },
              { id: 'shell', label: `Server ${kindCount('shell')}`, icon: <SquareTerminal size={15} /> },
              { id: 'sql', label: `SQL ${kindCount('sql')}`, icon: <Database size={15} /> },
            ]}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sắp xếp"
            className="focus-ring h-8 cursor-pointer rounded-md border border-line bg-surface px-2 text-[12.5px] font-medium text-fg-2"
          >
            <option value="uses">Dùng nhiều nhất</option>
            <option value="recent">Mới cập nhật</option>
            <option value="title">Theo tên</option>
          </select>
        </div>
        <div data-tour="c-cats" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={mine}
              onClick={() => {
                setMine((v) => !v);
                setCat(null);
              }}
              className={clsx(
                'focus-ring inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition-colors',
                mine ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-fg',
              )}
            >
              <UserRound size={13} /> Của tôi
            </button>
            <span className="mx-0.5 w-px self-stretch bg-line" />
            {[null, ...categories.map(([c]) => c)].map((c) => (
              <button
                key={c ?? '*'}
                type="button"
                onClick={() => setCat(c)}
                className={clsx(
                  'focus-ring h-7 rounded-full border px-3 text-[12px] font-medium transition-colors',
                  cat === c ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-fg',
                )}
              >
                {c ?? 'Tất cả nhóm'}
                {c && <span className="ml-1.5 text-faint tabular-nums">{categories.find(([x]) => x === c)![1]}</span>}
              </button>
            ))}
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-error/40 bg-error/8 px-3 py-2.5 text-[13px] text-error">
          <span className="flex-1">{err}</span>
          <Button size="sm" onClick={load}>
            Thử lại
          </Button>
        </div>
      )}
      {!cmds && !err && (
        <p className="mt-6 flex items-center justify-center gap-2 text-[13px] text-muted">
          <Loader2 size={16} className="animate-spin" /> Đang tải lệnh…
        </p>
      )}
      {cmds && !shown.length && (
        <div className="mt-8 text-center text-[13px] text-muted">
          {cmds.length ? (mine ? 'Bạn chưa tạo lệnh nào khớp.' : 'Không có lệnh nào khớp.') : 'Chưa có lệnh nào — bấm “Thêm lệnh” để bắt đầu.'}
        </div>
      )}
      <div data-tour="c-list" className="space-y-3">
        {shown.map((c) => (
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
            onTag={onTag}
          />
        ))}
      </div>
    </>
  );

  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', !active && 'hidden')}>
      <div className="mx-auto w-full max-w-[1100px] space-y-3 px-4 py-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 basis-[280px]">
            <h1 className="flex items-center gap-2 text-lg whitespace-nowrap font-semibold tracking-tight">
              Kho lệnh
              {backend.mode === 'demo' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
                  <FlaskConical size={12} /> Dữ liệu mẫu
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted">Lệnh server và câu SQL dùng chung của team — điền biến, bấm Copy là chạy được. Ai cũng thêm được, chỉ người tạo được sửa.</p>
          </div>
          <div data-tour="c-actions" className="flex flex-wrap items-center gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Tải lại" title="Tải lại" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={clsx(loading && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Xuất JSON" title="Xuất toàn bộ lệnh ra file JSON" onClick={exportJson} disabled={!cmds?.length}>
              <Download size={16} />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Nhập JSON" title="Nhập lệnh từ file JSON (lệnh nhập vào thuộc về bạn)" onClick={() => importRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            </Button>
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
              <Plus size={16} /> Thêm lệnh
            </Button>
          </div>
        </div>

        {content}
      </div>

      {editing && (
        <CommandEditor
          initial={editing === 'new' ? null : editing}
          categories={categories.map(([c]) => c)}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
      {historyOf && <HistoryDialog cmd={historyOf} backend={backend} canRestore={canEdit(historyOf)} onRestore={restore} onClose={() => setHistoryOf(null)} />}
    </div>
  );
}
