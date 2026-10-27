import clsx from 'clsx';
import { Check, Copy, Database, History, Pencil, SquareTerminal, Trash2, TriangleAlert } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { Button } from '../../components/ui';
import { commandVars, dangerOf, fillCommand, tokenize, type Command, type CommandKind, type Tok } from '../../lib/commands';

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

export function KindBadge({ kind }: { kind: CommandKind }) {
  const sql = kind === 'sql';
  return (
    <span
      className={clsx(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-semibold',
        sql ? 'bg-violet-500/12 text-violet-700 dark:text-violet-300' : 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
      )}
    >
      {sql ? <Database size={12} /> : <SquareTerminal size={12} />}
      {sql ? 'SQL' : 'Server'}
    </span>
  );
}

/** Code with syntax colours; `{{var}}` slots show the value that will be copied. */
export function CodeView({ body, kind, values }: { body: string; kind: CommandKind; values?: Record<string, string> }) {
  const toks = useMemo(() => tokenize(body, kind), [body, kind]);
  return (
    <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre text-fg">
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
    </pre>
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
  onTag: (tag: string) => void;
}

export const CommandCard = memo(function CommandCard({ cmd, canEdit, values, onValue, onCopy, onEdit, onDelete, onHistory, onTag }: Props) {
  const vars = useMemo(() => commandVars(cmd.body), [cmd.body]);
  const danger = useMemo(() => dangerOf(cmd), [cmd]);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const copy = () => {
    onCopy(cmd, fillCommand(cmd.body, values));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <article className="rounded-xl border border-line bg-surface p-3.5 shadow-xs transition-colors hover:border-line-strong">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <KindBadge kind={cmd.kind} />
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
        <CodeView body={cmd.body} kind={cmd.kind} values={values} />
        <Button variant={copied ? 'default' : 'primary'} className="mt-1" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span className="hidden sm:inline">{copied ? 'Đã copy' : 'Copy'}</span>
        </Button>
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
