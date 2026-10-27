import clsx from 'clsx';
import { Database, Loader2, RotateCcw, SquareTerminal, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Segmented } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { commandVars, dangerOf, type Command, type CommandInput, type HistoryRow } from '../../lib/commands';
import { CodeView, relTime } from './CommandCard';
import { Modal } from './Modal';

const field = 'focus-ring w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg placeholder:text-faint';
const labelCls = 'mb-1 block text-[12px] font-medium text-fg-2';

interface EditorProps {
  initial: Command | null;
  categories: string[];
  onSave: (input: CommandInput) => Promise<void>;
  onClose: () => void;
}

export function CommandEditor({ initial, categories, onSave, onClose }: EditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'shell');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const vars = useMemo(() => commandVars(body), [body]);
  const danger = useMemo(() => dangerOf({ kind, body }), [kind, body]);
  const ok = title.trim() && body.trim();

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        title: title.trim(),
        kind,
        category: category.trim() || 'Chung',
        tags: [...new Set(tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))],
        description: description.trim(),
        body: body.replace(/\s+$/, ''),
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={initial ? 'Sửa lệnh' : 'Thêm lệnh'}
      onClose={onClose}
      footer={
        <>
          {err && <p className="mr-auto text-[12.5px] text-error">{err}</p>}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!ok || busy} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {initial ? 'Lưu thay đổi' : 'Thêm lệnh'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="cmd-title">
            Tên lệnh
          </label>
          <input id="cmd-title" autoFocus className={clsx(field, 'h-9')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Tìm trace id trong log gateway" />
        </div>
        <div>
          <span className={labelCls}>Loại</span>
          <Segmented
            label="Loại lệnh"
            value={kind}
            onChange={setKind}
            items={[
              { id: 'shell', label: 'Server', icon: <SquareTerminal size={15} /> },
              { id: 'sql', label: 'SQL', icon: <Database size={15} /> },
            ]}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cmd-cat">
            Nhóm
          </label>
          <input id="cmd-cat" list="cmd-cats" className={clsx(field, 'h-9')} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="vd: Gateway, Core, Watane BO" />
          <datalist id="cmd-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="cmd-body">
            Lệnh
          </label>
          <textarea
            id="cmd-body"
            className={clsx(field, 'min-h-[140px] resize-y py-2 font-mono text-[12.5px] leading-relaxed')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            placeholder={kind === 'sql' ? "SELECT * FROM Orders WHERE OrderCode = '{{order_code}}';" : 'grep -rn "{{trace_id}}" /var/log/app/'}
          />
          <p className="mt-1 text-[11.5px] text-faint">
            Dùng <code className="text-fg-2">{'{{ten_bien}}'}</code> hoặc <code className="text-fg-2">{'{{ten_bien:gia_tri_mac_dinh}}'}</code> cho phần người dùng cần điền.
            {vars.length > 0 && <> Biến: {vars.map((v) => v.name).join(', ')}.</>}
          </p>
          {danger && (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-error">
              <TriangleAlert size={13} /> Sẽ gắn nhãn cảnh báo: {danger}
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="cmd-desc">
            Mô tả / lưu ý <span className="font-normal text-faint">(không bắt buộc)</span>
          </label>
          <textarea id="cmd-desc" className={clsx(field, 'min-h-[60px] resize-y py-2')} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Khi nào dùng, cần chú ý gì…" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="cmd-tags">
            Tag <span className="font-normal text-faint">(cách nhau bằng dấu phẩy)</span>
          </label>
          <input id="cmd-tags" className={clsx(field, 'h-9')} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="log, trace, docker" />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const ACTION: Record<HistoryRow['action'], { label: string; cls: string }> = {
  insert: { label: 'Tạo', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' },
  update: { label: 'Sửa', cls: 'bg-accent-soft text-accent' },
  delete: { label: 'Xoá', cls: 'bg-error/12 text-error' },
};

export function HistoryDialog({ cmd, backend, canRestore, onRestore, onClose }: { cmd: Command; backend: Backend; canRestore: boolean; onRestore: (c: Command) => Promise<void>; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    backend.history(cmd.id).then(setRows, (e: Error) => setErr(e.message));
  }, [backend, cmd.id]);

  return (
    <Modal wide title={`Lịch sử · ${cmd.title}`} onClose={onClose}>
      {err && <p className="text-[13px] text-error">{err}</p>}
      {!rows && !err && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 size={15} className="animate-spin" /> Đang tải…
        </p>
      )}
      {rows && !rows.length && <p className="text-[13px] text-muted">Chưa có lịch sử.</p>}
      <ol className="space-y-3">
        {rows?.map((h) => (
          <li key={h.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className={clsx('rounded px-1.5 py-0.5 font-semibold', ACTION[h.action].cls)}>{ACTION[h.action].label}</span>
              <span className="text-fg-2">{h.changed_by || '—'}</span>
              <span className="text-faint" title={new Date(h.changed_at).toLocaleString('vi-VN')}>
                {relTime(h.changed_at)}
              </span>
              {h.action === 'update' && canRestore && (
                <Button size="sm" className="ml-auto" title="Đưa lệnh về đúng nội dung của phiên bản này" onClick={() => onRestore(h.data).then(onClose)}>
                  <RotateCcw size={14} /> Khôi phục bản này
                </Button>
              )}
            </div>
            {h.action === 'update' && <p className="mt-1.5 text-[11.5px] text-faint">Nội dung trước khi sửa:</p>}
            <p className="mt-1.5 text-[12.5px] font-medium text-fg">{h.data.title}</p>
            <div className="mt-1.5 flex">
              <CodeView body={h.data.body} kind={h.data.kind} />
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
