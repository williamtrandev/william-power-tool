import clsx from 'clsx';
import { Braces, ChevronDown, Database, ExternalLink, Info, Layers, Loader2, Lock, Pencil, RotateCcw, SquareTerminal, StickyNote, TriangleAlert, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Kbd, Segmented } from '../../components/ui';
import type { Backend } from '../../lib/backend';
import { commandVars, dangerOf, titleKey, type Command, type CommandInput, type HistoryRow } from '../../lib/commands';
import { relTime } from '../../lib/format';
import { CodeView, KIND_META, KindBadge, NoteView } from './CommandCard';
import { Modal } from '../../components/Modal';

/** Tags as removable chips: Enter or comma adds, Backspace on empty removes the last one. */
function TagInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-1.5 py-1 transition-shadow focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-ring)]">
      {tags.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-0.5 rounded-md bg-surface-3 pr-0.5 pl-2 text-[12px] font-medium text-fg-2">
          #{t}
          <button type="button" aria-label={`Bỏ tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="grid size-5 place-items-center rounded text-faint hover:bg-surface-2 hover:text-fg">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        list="cmd-tag-list"
        value={draft}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault();
            e.stopPropagation();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={tags.length ? '' : 'Thêm tag, Enter để xác nhận'}
        aria-label="Thêm tag"
        className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] text-fg outline-none placeholder:text-faint"
      />
      <datalist id="cmd-tag-list">
        {suggestions.filter((x) => !tags.includes(x)).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
    </div>
  );
}

/** Existing commands with the title being typed, so a duplicate is not added by mistake. */
function SameTitlePreview({
  items,
  body,
  defaultOpen,
  onOpen,
  canEdit,
  onEdit,
}: {
  items: Command[];
  body: string;
  defaultOpen: boolean;
  onOpen?: (c: Command) => void;
  canEdit?: (c: Command) => boolean;
  onEdit?: (c: Command) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // switching away from a draft with content asks once before discarding it
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const norm = (b: string) => b.replace(/\s+/g, ' ').trim();
  const identical = items.filter((c) => body.trim() && norm(c.body) === norm(body));
  const authors = [...new Set(items.map((o) => (o.created_by ?? '?').split('@')[0]))].join(', ');
  return (
    <div className={clsx('animate-in overflow-hidden rounded-xl border', identical.length ? 'border-error/40 bg-error/5' : 'border-accent/30 bg-accent-soft/40')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left">
        {identical.length ? <TriangleAlert size={15} className="mt-0.5 shrink-0 text-error" /> : <Layers size={15} className="mt-0.5 shrink-0 text-accent" />}
        <span className="min-w-0 flex-1 text-[12.5px]">
          <b className={clsx('font-semibold', identical.length ? 'text-error' : 'text-accent')}>
            {identical.length ? 'Đã có mục giống hệt nội dung bạn đang soạn' : `Đã có ${items.length} mục cùng tên`}
          </b>
          <span className="text-muted"> · của {authors} — kiểm tra trước khi thêm. Lưu vẫn được: mục mới sẽ thành một “bản” nữa trong cùng dòng.</span>
        </span>
        <ChevronDown size={16} className={clsx('mt-0.5 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-[300px] space-y-2 overflow-y-auto px-2.5 pb-2.5">
          {items.map((c) => (
            <div key={c.id} className={clsx('rounded-lg border bg-surface p-3', identical.includes(c) ? 'border-error/50' : 'border-line')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
                <KindBadge kind={c.kind} />
                {c.is_private && (
                  <span className="inline-flex items-center gap-1">
                    <Lock size={11} /> Riêng tư
                  </span>
                )}
                <span>
                  {(c.created_by ?? '?').split('@')[0]} · cập nhật {relTime(c.updated_at)} · {c.category}
                </span>
                {identical.includes(c) && <span className="rounded bg-error/12 px-1.5 py-px font-semibold text-error">Trùng y hệt</span>}
                <span className="ml-auto flex items-center gap-1">
                  {onEdit && canEdit?.(c) &&
                    (confirmId === c.id ? (
                      <>
                        <span className="text-[11.5px] text-warn">Bỏ bản đang soạn?</span>
                        <Button size="sm" variant="primary" className="h-6" onClick={() => onEdit(c)}>
                          Bỏ & sửa
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6" onClick={() => setConfirmId(null)}>
                          Huỷ
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6"
                        title="Chuyển sang sửa mục này thay vì tạo mục mới"
                        onClick={() => (body.trim() && norm(c.body) !== norm(body) ? setConfirmId(c.id) : onEdit(c))}
                      >
                        <Pencil size={13} /> Sửa mục này
                      </Button>
                    ))}
                  {onOpen && confirmId !== c.id && (
                    <Button size="sm" variant="ghost" className="h-6" onClick={() => onOpen(c)} title="Đóng form và mở mục này trong danh sách">
                      <ExternalLink size={13} /> Mở mục này
                    </Button>
                  )}
                </span>
              </div>
              {c.description && <p className="mt-1.5 text-[12.5px] text-muted">{c.description}</p>}
              <div className="mt-2 flex">{c.kind === 'note' ? <div className="min-w-0 flex-1"><NoteView body={c.body} onCopy={() => {}} /></div> : <CodeView body={c.body} kind={c.kind} />}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Prop({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[12.5px] font-medium text-fg-2">{label}</p>
      {children}
    </div>
  );
}

interface EditorProps {
  /** the command being edited; null when creating */
  initial: Command | null;
  /** when creating: start from a copy of this command */
  template?: Command;
  categories: string[];
  tagSuggestions: string[];
  /** existing commands, to flag a title that is already used */
  others: Command[];
  /** only the owner (or whoever creates it) may change who can see a command */
  canPrivate: boolean;
  onSave: (input: CommandInput) => Promise<void>;
  onClose: () => void;
  /** close the editor and show this existing command instead */
  onOpenExisting?: (c: Command) => void;
  /** switch the editor to this existing command */
  onEditExisting?: (c: Command) => void;
  canEditOther?: (c: Command) => boolean;
}

export function CommandEditor({ initial, template, categories, tagSuggestions, others, onOpenExisting, onEditExisting, canEditOther, canPrivate, onSave, onClose }: EditorProps) {
  const from = initial ?? template;
  const [title, setTitle] = useState(initial?.title ?? (template ? `${template.title} (bản sao)` : ''));
  const [kind, setKind] = useState(from?.kind ?? 'shell');
  const [category, setCategory] = useState(from?.category ?? '');
  const [tags, setTags] = useState<string[]>(from?.tags ?? []);
  const [description, setDescription] = useState(from?.description ?? '');
  const [body, setBody] = useState(from?.body ?? '');
  // a copy keeps the original's visibility; a copy of a shared command stays shared until you change it
  const [isPrivate, setIsPrivate] = useState(from?.is_private ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const vars = useMemo(() => (kind === 'note' ? [] : commandVars(body)), [kind, body]);
  const danger = useMemo(() => dangerOf({ kind, body }), [kind, body]);
  const ok = !!title.trim() && !!body.trim();
  const missing = [!title.trim() && 'tên', !body.trim() && (kind === 'note' ? 'nội dung ghi chú' : 'nội dung lệnh')].filter(Boolean) as string[];
  const sameTitle = useMemo(() => {
    const k = titleKey(title);
    return k ? others.filter((o) => o.id !== initial?.id && titleKey(o.title) === k) : [];
  }, [title, others, initial?.id]);
  const note = kind === 'note';
  const meta = KIND_META[kind];

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        title: title.trim(),
        kind,
        category: category.trim() || 'Chung',
        tags,
        description: description.trim(),
        body: body.replace(/\s+$/, ''),
        is_private: isPrivate,
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  /** wrap the selection (or a placeholder name) in {{ }} and select the name */
  const insertVar = () => {
    const ta = bodyRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    const name = body.slice(a, b).trim().replace(/\s+/g, '_') || 'ten_bien';
    const next = body.slice(0, a) + `{{${name}}}` + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(a + 2, a + 2 + name.length);
    });
  };

  return (
    <Modal
      wide
      title={initial ? (note ? 'Sửa ghi chú' : 'Sửa lệnh') : template ? `Nhân bản từ “${template.title}”` : 'Thêm mới'}
      onClose={onClose}
      footer={
        <>
          {missing.length ? (
            <p className="mr-auto text-[12px] text-warn">Còn thiếu: {missing.join(', ')}</p>
          ) : (
            <p className="mr-auto hidden items-center gap-1.5 text-[11.5px] text-faint sm:flex">
              <Kbd>{/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd>Enter</Kbd> để lưu · <Kbd>Esc</Kbd> để đóng
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!ok || busy} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {initial ? 'Lưu thay đổi' : note ? 'Thêm ghi chú' : 'Thêm lệnh'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        {/* name + short description */}
        <div className="space-y-3">
          <div>
            <label htmlFor="cmd-title" className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-fg-2">
              {note ? 'Tên ghi chú' : 'Tên lệnh'} <span className="text-error">*</span>
            </label>
            <input
              id="cmd-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={note ? 'vd: Môi trường UAT Watane' : 'vd: Tìm trace id trong log gateway'}
              aria-label="Tên"
              aria-required
              className="focus-ring h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[15px] font-medium text-fg transition-shadow placeholder:font-normal placeholder:text-faint hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_var(--accent-ring)]"
            />
          </div>
          <div>
            <label htmlFor="cmd-desc" className="mb-1.5 flex items-baseline gap-1.5 text-[12.5px] font-medium text-fg-2">
              Mô tả <span className="font-normal text-faint">— không bắt buộc</span>
            </label>
            <textarea
              id="cmd-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={Math.min(5, Math.max(2, description.split('\n').length))}
              placeholder="Khi nào dùng, cần lưu ý gì…"
              aria-label="Mô tả"
              className="focus-ring block w-full resize-none rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg transition-shadow placeholder:text-faint hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_var(--accent-ring)]"
            />
          </div>
        </div>

        {sameTitle.length > 0 && (
          <SameTitlePreview items={sameTitle} body={body} defaultOpen={!initial} onOpen={onOpenExisting} canEdit={canEditOther} onEdit={onEditExisting} />
        )}

        {/* properties */}
        <div className="grid gap-4 rounded-xl border border-line bg-surface-2/40 p-3.5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Prop label="Loại">
            <Segmented
              label="Loại lệnh"
              value={kind}
              onChange={setKind}
              items={[
                { id: 'shell', label: 'Server', icon: <SquareTerminal size={15} /> },
                { id: 'sql', label: 'SQL', icon: <Database size={15} /> },
                { id: 'note', label: 'Ghi chú', icon: <StickyNote size={15} /> },
              ]}
            />
          </Prop>
          <Prop label="Nhóm">
            <input
              list="cmd-cats"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="vd: Ubuntu, Gateway, Database"
              aria-label="Nhóm"
              className="focus-ring h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-faint"
            />
            <datalist id="cmd-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Prop>
          <Prop label="Tag" className="sm:col-span-2">
            <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
          </Prop>
          <Prop label="Ai thấy được" className="sm:col-span-2">
            {canPrivate ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Segmented
                  label="Ai thấy được"
                  value={isPrivate ? 'private' : 'shared'}
                  onChange={(v) => setIsPrivate(v === 'private')}
                  items={[
                    { id: 'shared', label: 'Cả team', icon: <Users size={15} /> },
                    { id: 'private', label: 'Chỉ mình tôi', icon: <Lock size={15} /> },
                  ]}
                />
                <span className="text-[12px] text-muted">
                  {isPrivate ? 'Riêng tư: thành viên khác và cả admin đều không thấy, không tìm được.' : 'Mọi thành viên đã duyệt đều thấy và copy được.'}
                </span>
              </div>
            ) : (
              <p className="text-[12.5px] text-muted">Dùng chung cho cả team — chỉ người tạo mới đổi được chế độ hiển thị.</p>
            )}
          </Prop>
        </div>

        {/* code editor */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2 transition-shadow focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_var(--accent-ring)]">
          <div className="flex h-10 items-center gap-2 border-b border-line px-3">
            <span className={clsx('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-semibold', meta.cls)}>
              <meta.icon size={13} />
              {kind === 'shell' ? 'Shell' : meta.label}
            </span>
            <span className="text-[12.5px] font-medium text-fg-2">
              {note ? 'Nội dung ghi chú' : 'Nội dung lệnh'} <span className="text-error">*</span>
            </span>
            {!note && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={insertVar} title="Bọc phần đang chọn thành biến, hoặc chèn biến mới">
                <Braces size={14} /> Chèn biến
              </Button>
            )}
          </div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            aria-label="Nội dung lệnh"
            placeholder={
              note
                ? 'Web: https://uat.example.vn\nAdmin: https://admin-uat.example.vn\nTài khoản: qc_test\nMật khẩu: ••••••\n\nGhi chú tự do cũng được.'
                : kind === 'sql'
                  ? "SELECT * FROM Orders WHERE OrderCode = '{{order_code}}';"
                  : 'grep -RInE "{{pattern:error}}" {{dir:/var/log}}'
            }
            className={clsx(
              'block min-h-[150px] w-full resize-y bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint',
              !note && 'font-mono',
            )}
          />
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 border-t border-line px-3 py-2 text-[12px]">
            {note ? (
              <span className="text-faint">
                Mỗi dòng <code className="text-fg-2">Tên: giá trị</code> thành một hàng có nút copy · link tự bấm được · dòng có chữ <i>mật khẩu / password / token</i> sẽ bị che
              </span>
            ) : vars.length ? (
              <>
                <span className="text-faint">Biến:</span>
                {vars.map((v) => (
                  <span key={v.name} className="inline-flex h-6 items-center rounded-md bg-accent-soft px-2 font-mono text-[11.5px] text-accent" title={v.def ? `Mặc định: ${v.def}` : 'Không có giá trị mặc định'}>
                    {v.name}
                    {v.def && <span className="ml-1 text-accent/60">= {v.def}</span>}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-faint">
                Phần cần điền viết dạng <code className="text-fg-2">{'{{ten_bien}}'}</code> hoặc <code className="text-fg-2">{'{{ten_bien:mac_dinh}}'}</code> ·{' '}
                {kind === 'sql' ? 'mỗi câu kết thúc bằng ; có nút copy riêng' : 'mỗi dòng là một lệnh có nút copy riêng (dòng dài nối bằng \\)'}
              </span>
            )}
            {danger && (
              <span className="ml-auto inline-flex h-6 items-center gap-1 rounded-md bg-error/12 px-2 font-medium text-error">
                <TriangleAlert size={13} /> {danger}
              </span>
            )}
          </div>
        </div>

        {note && body.trim() && (
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-fg-2">Xem trước</p>
            <NoteView body={body} onCopy={() => {}} />
          </div>
        )}
        {note && (
          <p className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2.5 text-[12.5px] text-warn">
            <Info size={15} className="mt-px shrink-0" />
            {isPrivate
              ? 'Ghi chú riêng tư chỉ bạn thấy trong app, nhưng vẫn lưu dạng chữ thường trên Supabase. Không lưu mật khẩu production — hãy dùng trình quản lý mật khẩu.'
              : 'Ghi chú hiển thị cho mọi thành viên đã được duyệt. Chỉ lưu tài khoản test / UAT — không lưu mật khẩu production, hãy dùng trình quản lý mật khẩu cho những thứ đó.'}
          </p>
        )}

        {err && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/8 px-3 py-2.5 text-[13px] text-error">
            <TriangleAlert size={15} /> {err}
          </p>
        )}
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
