import clsx from 'clsx';
import { Check, Copy, CopyPlus, Database, Link2, Eye, EyeOff, History, Lock, Pencil, SquareTerminal, StickyNote, Trash2, TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Button } from '../../components/ui';
import { chainCommands, commandVars, dangerOf, fillCommand, parseNote, splitCommands, tokenize, URL_RE, type Command, type CommandKind, type Tok } from '../../lib/commands';

const TOK_CLS: Record<Tok['k'], string> = {
  kw: 'text-violet-700 dark:text-violet-300 font-semibold',
  str: 'text-emerald-700 dark:text-emerald-400',
  num: 'text-amber-700 dark:text-amber-400',
  com: 'text-faint italic',
  flag: 'text-sky-700 dark:text-sky-400',
  op: 'text-pink-600 dark:text-pink-400',
  var: '',
  '': '',
};

export const KIND_META: Record<CommandKind, { label: string; icon: typeof Database; cls: string }> = {
  shell: { label: 'Server', icon: SquareTerminal, cls: 'bg-teal-500/12 text-teal-700 dark:text-teal-300' },
  sql: { label: 'SQL', icon: Database, cls: 'bg-violet-500/12 text-violet-700 dark:text-violet-300' },
  note: { label: 'Ghi chú', icon: StickyNote, cls: 'bg-amber-500/14 text-amber-700 dark:text-amber-300' },
};

export function KindBadge({ kind }: { kind: CommandKind }) {
  const m = KIND_META[kind];
  return (
    <span className={clsx('inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-semibold', m.cls)}>
      <m.icon size={12} />
      {m.label}
    </span>
  );
}

/** text with http(s) links made clickable */
function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noreferrer noopener" className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function NoteValue({ value, secret, onCopy }: { value: string; secret: boolean; onCopy: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const hidden = secret && !show;
  return (
    <>
      <span className={clsx('min-w-0 flex-1 break-all', hidden ? 'font-mono tracking-widest text-muted' : 'text-fg')}>{hidden ? '•'.repeat(Math.min(12, Math.max(6, value.length))) : <Linkify text={value} />}</span>
      <span className="flex shrink-0 items-center opacity-60 transition-opacity group-hover/row:opacity-100">
        {secret && (
          <button type="button" aria-label={show ? 'Ẩn' : 'Hiện'} title={show ? 'Ẩn' : 'Hiện'} onClick={() => setShow((v) => !v)} className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg">
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button
          type="button"
          aria-label="Copy giá trị"
          title="Copy giá trị"
          onClick={() => {
            onCopy(value);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          }}
          className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
        >
          {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </span>
    </>
  );
}

/** Note body: "Tên: giá trị" lines become rows with their own copy button; secrets are masked. */
export function NoteView({ body, onCopy }: { body: string; onCopy: (v: string) => void }) {
  const lines = useMemo(() => parseNote(body), [body]);
  return (
    <div className="rounded-lg border border-line bg-surface-2 py-1.5 text-[13px] leading-relaxed">
      {lines.map((l, i) =>
        l.t === 'blank' ? (
          <div key={i} className="h-2" />
        ) : l.t === 'text' ? (
          <p key={i} className="px-3 py-0.5 break-words text-fg-2">
            <Linkify text={l.text} />
          </p>
        ) : (
          <div key={i} className="group/row flex items-center gap-3 px-3 py-0.5 hover:bg-surface-3/50">
            <span className="w-32 shrink-0 truncate text-[12.5px] text-muted" title={l.key}>
              {l.key}
            </span>
            <NoteValue value={l.value} secret={l.secret} onCopy={onCopy} />
          </div>
        ),
      )}
    </div>
  );
}

/** Code with syntax colours; `{{var}}` slots show the value that will be copied. */
/** Syntax-coloured code; `{{var}}` slots show the value that will be copied. */
function Code({ text, kind, values }: { text: string; kind: CommandKind; values?: Record<string, string> }) {
  const toks = useMemo(() => tokenize(text, kind), [text, kind]);
  return (
    <>
      {toks.map((t, i) => {
        if (t.k !== 'var') return t.k ? <span key={i} className={TOK_CLS[t.k]}>{t.t}</span> : t.t;
        const v = values ? fillCommand(t.t, values) : t.t;
        const empty = v === t.t || /^\{\{/.test(v);
        return (
          <span
            key={i}
            className={clsx('rounded px-0.5', empty ? 'bg-warn/15 text-warn' : 'bg-accent-soft text-accent')}
            title={empty ? 'Chưa điền giá trị' : t.t}
          >
            {v}
          </span>
        );
      })}
    </>
  );
}

function PartCopy({ onCopy }: { onCopy: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy lệnh này"
      title="Copy riêng lệnh này"
      onClick={() => {
        onCopy();
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="grid size-7 shrink-0 place-items-center rounded-md text-muted opacity-60 transition hover:bg-surface-3 hover:text-fg group-hover/part:opacity-100 focus-visible:opacity-100"
    >
      {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  );
}

/**
 * Code block. With `onCopyPart`, a body holding several commands (one per line, or SQL
 * statements) shows each as a numbered row with its own copy button.
 */
export function CodeView({
  body,
  kind,
  values,
  onCopyPart,
}: {
  body: string;
  kind: CommandKind;
  values?: Record<string, string>;
  onCopyPart?: (text: string) => void;
}) {
  const parts = useMemo(() => splitCommands(body, kind), [body, kind]);
  const box = 'min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface-2 font-mono text-[12.5px] leading-relaxed text-fg';
  if (!onCopyPart || parts.filter((p) => p.runnable).length < 2)
    return (
      <pre className={clsx(box, 'px-3 py-2.5 whitespace-pre')}>
        <Code text={body} kind={kind} values={values} />
      </pre>
    );
  let n = 0;
  return (
    // long lines wrap so every row keeps its copy button on the right, like note rows
    <div className={clsx(box, 'py-1.5')}>
      {parts.map((p, i) =>
        p.runnable ? (
          <div key={i} className="group/part flex items-center gap-3 py-0.5 pr-1.5 pl-3 hover:bg-surface-3/50">
            <span className="w-4 shrink-0 self-start pt-[5px] text-right text-[11px] text-faint select-none">{++n}</span>
            <pre className="min-w-0 flex-1 py-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
              <Code text={p.text} kind={kind} values={values} />
            </pre>
            <PartCopy onCopy={() => onCopyPart(fillCommand(p.text, values ?? {}))} />
          </div>
        ) : (
          <pre key={i} className="min-h-[0.75em] pr-3 pl-10 whitespace-pre-wrap [overflow-wrap:anywhere] text-faint italic">
            {p.text}
          </pre>
        ),
      )}
    </div>
  );
}

export function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'vừa xong';
  if (d < 3600) return `${Math.floor(d / 60)} phút trước`;
  if (d < 86400) return `${Math.floor(d / 3600)} giờ trước`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

interface Props {
  cmd: Command;
  /** owner or admin */
  canEdit: boolean;
  values: Record<string, string>;
  onValue: (name: string, v: string) => void;
  onCopy: (cmd: Command, text: string) => void;
  onEdit: (cmd: Command) => void;
  onDelete: (cmd: Command) => void;
  onHistory: (cmd: Command) => void;
  /** open the editor pre-filled with a copy of this command */
  onClone: (cmd: Command) => void;
  onTag: (tag: string) => void;
}

export const CommandCard = memo(function CommandCard({ cmd, canEdit, values, onValue, onCopy, onEdit, onDelete, onHistory, onClone, onTag }: Props) {
  const note = cmd.kind === 'note';
  const vars = useMemo(() => (note ? [] : commandVars(cmd.body)), [note, cmd.body]);
  const danger = useMemo(() => dangerOf(cmd), [cmd]);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const parts = useMemo(() => (note ? [] : splitCommands(cmd.body, cmd.kind).filter((p) => p.runnable)), [note, cmd.body, cmd.kind]);
  const multi = parts.length > 1;
  const [copiedChain, setCopiedChain] = useState(false);
  const copy = () => {
    onCopy(cmd, note ? cmd.body : fillCommand(cmd.body, values));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const copyChain = () => {
    onCopy(cmd, fillCommand(chainCommands(parts), values));
    setCopiedChain(true);
    setTimeout(() => setCopiedChain(false), 1400);
  };

  return (
    <article className="rounded-xl border border-line bg-surface p-3.5 shadow-xs transition-colors hover:border-line-strong">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <KindBadge kind={cmd.kind} />
            {cmd.is_private && (
              <span className="inline-flex h-5 items-center gap-1 rounded bg-surface-3 px-1.5 text-[11px] font-semibold text-fg-2" title="Chỉ mình bạn thấy — thành viên khác và admin đều không thấy">
                <Lock size={11} /> Riêng tư
              </span>
            )}
            {danger && (
              <span className="inline-flex h-5 items-center gap-1 rounded bg-error/12 px-1.5 text-[11px] font-semibold text-error" title="Lệnh này thay đổi dữ liệu hoặc hệ thống — đọc kỹ trước khi chạy">
                <TriangleAlert size={12} /> {danger}
              </span>
            )}
            <h3 className="min-w-0 text-[14px] font-semibold text-fg">{cmd.title}</h3>
          </div>
          {cmd.description && <p className="mt-1 text-[12.5px] whitespace-pre-line text-muted">{cmd.description}</p>}
        </div>
        <div className="-mt-0.5 -mr-1 flex shrink-0 items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Nhân bản" title="Nhân bản — tạo bản sao của bạn để chỉnh sửa" onClick={() => onClone(cmd)}>
            <CopyPlus size={16} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Lịch sử chỉnh sửa" title="Lịch sử chỉnh sửa" onClick={() => onHistory(cmd)}>
            <History size={16} />
          </Button>
          {canEdit && (
            <Button variant="ghost" size="icon-sm" aria-label="Sửa lệnh" title="Sửa" onClick={() => onEdit(cmd)}>
              <Pencil size={16} />
            </Button>
          )}
          {canEdit &&
            (confirm ? (
              <>
                <Button variant="danger" size="sm" onClick={() => onDelete(cmd)}>
                  Xoá
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                  Huỷ
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon-sm" aria-label="Xoá lệnh" title="Xoá" className="hover:text-error" onClick={() => setConfirm(true)}>
                <Trash2 size={16} />
              </Button>
            ))}
        </div>
      </header>

      {vars.length > 0 && (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {vars.map((v) => (
            <label key={v.name} className="flex min-w-0 items-center rounded-md border border-line bg-surface focus-within:border-accent/60">
              <span className="shrink-0 border-r border-line px-2 font-mono text-[11.5px] text-muted">{v.name}</span>
              <input
                data-var-input
                value={values[v.name] ?? ''}
                onChange={(e) => onValue(v.name, e.target.value)}
                placeholder={v.def || 'nhập giá trị'}
                spellCheck={false}
                autoComplete="off"
                className="h-8 min-w-0 flex-1 bg-transparent px-2 font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-faint"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-start gap-2">
        {note ? (
          <div className="min-w-0 flex-1">
            <NoteView body={cmd.body} onCopy={(v) => onCopy(cmd, v)} />
          </div>
        ) : (
          <CodeView body={cmd.body} kind={cmd.kind} values={values} onCopyPart={(t) => onCopy(cmd, t)} />
        )}
        <div className="mt-1 flex shrink-0 flex-col gap-1.5">
          <Button variant={copied ? 'default' : 'primary'} onClick={copy} title={multi ? 'Copy cả khối, giữ nguyên từng dòng' : undefined}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span className="hidden sm:inline">{copied ? 'Đã copy' : note || multi ? 'Copy hết' : 'Copy'}</span>
          </Button>
          {multi && cmd.kind === 'shell' && (
            <Button size="sm" onClick={copyChain} title="Copy thành 1 dòng: lệnh1 && lệnh2 && … — chạy lần lượt, dừng ngay khi có lệnh lỗi">
              {copiedChain ? <Check size={14} /> : <Link2 size={14} />}
              <span className="hidden sm:inline">{copiedChain ? 'Đã copy' : 'Nối &&'}</span>
            </Button>
          )}
        </div>
      </div>

      <footer className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
        <span className="font-medium text-muted">{cmd.category}</span>
        {cmd.tags.map((t) => (
          <button key={t} type="button" onClick={() => onTag(t)} className="focus-ring rounded text-accent/80 hover:text-accent hover:underline">
            #{t}
          </button>
        ))}
        <span className="ml-auto tabular-nums" title="Số lần được copy">
          {cmd.uses} lần dùng
        </span>
        <span title={new Date(cmd.updated_at).toLocaleString('vi-VN')}>
          {cmd.created_by ? `${cmd.created_by.split('@')[0]} · ` : ''}
          {relTime(cmd.updated_at)}
        </span>
      </footer>
    </article>
  );
});
