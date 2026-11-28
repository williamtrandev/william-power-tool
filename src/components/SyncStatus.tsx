import clsx from 'clsx';
import { AlertTriangle, CloudUpload, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { describe, type Backend, type Conflict, type OutboxState, type Queued } from '../lib/backend';
import { relTime } from '../lib/format';
import { Modal } from './Modal';
import { Button } from './ui';

const ACTION_TONE: Record<string, string> = { xoá: 'bg-error/10 text-error', thêm: 'bg-accent-soft text-accent', ghi: 'bg-accent-soft text-accent' };

/**
 * Changes made offline: a bar under the header while some wait for the server or were refused by it, and a dialog
 * listing them — conflicts first, each with what you saved and what the server now has, to keep or drop.
 */
export function SyncStatus({ backend, onToast }: { backend: Backend; onToast: (m: string) => void }) {
  const [s, setS] = useState<OutboxState>({ pending: [], conflicts: [], syncing: false, offline: false });
  const [open, setOpen] = useState(false);
  const was = useRef(0);
  useEffect(() => backend.onOutbox?.(setS), [backend]);

  // the queue emptied by itself: say so once
  const waiting = s.pending.length;
  useEffect(() => {
    if (was.current && !waiting && !s.syncing) onToast(s.conflicts.length ? 'Đã đồng bộ — còn thay đổi cần xem lại' : `Đã đồng bộ ${was.current} thay đổi lên máy chủ`);
    if (!s.syncing) was.current = waiting;
  }, [waiting, s.syncing, s.conflicts.length, onToast]);

  if (!waiting && !s.conflicts.length && !open) return null;
  const bad = s.conflicts.length > 0;
  return (
    <>
      {(waiting > 0 || bad) && (
        <div
          role="status"
          className={clsx(
            'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-[12.5px] text-fg-2',
            bad ? 'border-error/30 bg-error/10' : 'border-accent/25 bg-accent-soft/60',
          )}
        >
          {bad ? <AlertTriangle size={14} className="shrink-0 text-error" /> : s.syncing ? <Loader2 size={14} className="shrink-0 animate-spin text-accent" /> : <CloudUpload size={14} className="shrink-0 text-accent" />}
          <span className="min-w-0 flex-1">
            {bad && (
              <>
                <b className="font-semibold text-fg">{s.conflicts.length} thay đổi không đồng bộ được</b> — người khác đã sửa cùng chỗ, hoặc máy chủ từ chối. {waiting > 0 && ' '}
              </>
            )}
            {waiting > 0 &&
              (s.syncing ? (
                <>Đang gửi {waiting} thay đổi lên máy chủ…</>
              ) : (
                <>
                  <b className="font-semibold text-fg">{waiting} thay đổi đang chờ đồng bộ</b> — đã lưu trên máy này{s.offline ? ', tự gửi khi kết nối lại' : ''}.
                </>
              ))}
          </span>
          <button type="button" onClick={() => setOpen(true)} className="focus-ring rounded px-1.5 font-medium text-accent hover:underline">
            {bad ? 'Xem và xử lý' : 'Xem'}
          </button>
        </div>
      )}
      {open && <OutboxDialog backend={backend} state={s} onClose={() => setOpen(false)} />}
    </>
  );
}

function OutboxDialog({ backend, state, onClose }: { backend: Backend; state: OutboxState; onClose: () => void }) {
  const people = backend.outboxPeople?.() ?? new Map();
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (c: Conflict, keep: boolean) => {
    setBusy(c.op.qid);
    try {
      await backend.outboxResolve?.(c.op.qid, keep);
    } finally {
      setBusy(null);
    }
  };
  const head = (op: Queued) => {
    const d = describe(op, people);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className={clsx('shrink-0 rounded px-1.5 py-px text-[11px] font-medium', ACTION_TONE[d.action] ?? 'bg-surface-3 text-fg-2')}>{d.action}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{d.title}</span>
        <span className="shrink-0 text-[11.5px] text-faint">{relTime(new Date(op.at).toISOString())}</span>
      </div>
    );
  };
  const empty = !state.pending.length && !state.conflicts.length;

  return (
    <Modal
      title="Thay đổi chưa đồng bộ"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted">{state.offline ? 'Chưa kết nối được máy chủ' : ''}</span>
          <Button onClick={onClose}>Đóng</Button>
          <Button variant="primary" disabled={!state.pending.length || state.syncing} onClick={() => backend.outboxSync?.()}>
            {state.syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Đồng bộ ngay
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {empty && <p className="py-6 text-center text-[13px] text-muted">Mọi thay đổi đã lên máy chủ.</p>}
        {state.conflicts.length > 0 && (
          <section>
            <p className="mb-2 text-[12.5px] font-medium text-fg-2">Cần bạn chọn ({state.conflicts.length})</p>
            <ul className="space-y-2">
              {state.conflicts.map((c) => {
                const d = describe(c.op, people);
                return (
                  <li key={c.op.qid} className="rounded-xl border border-error/30 p-3">
                    {head(c.op)}
                    <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-error">
                      <AlertTriangle size={13} className="mt-px shrink-0" /> {c.reason}
                    </p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                      <dt className="text-muted">Bản của bạn</dt>
                      <dd className="min-w-0 break-words text-fg">{d.action === 'xoá' ? 'xoá dòng này' : d.detail || '—'}</dd>
                      <dt className="text-muted">Trên máy chủ</dt>
                      <dd className="min-w-0 break-words text-fg">{c.theirs ?? 'không còn'}</dd>
                    </dl>
                    <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                      <Button size="sm" disabled={busy === c.op.qid} onClick={() => resolve(c, false)}>
                        Bỏ bản của tôi
                      </Button>
                      <Button size="sm" variant="primary" disabled={busy === c.op.qid} onClick={() => resolve(c, true)}>
                        Giữ bản của tôi
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {state.pending.length > 0 && (
          <section>
            <p className="mb-2 text-[12.5px] font-medium text-fg-2">Đang chờ gửi ({state.pending.length})</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {state.pending.map((q) => (
                <li key={q.qid} className="px-3 py-2">
                  {head(q)}
                  {describe(q, people).detail && <p className="mt-0.5 truncate text-[12px] text-muted">{describe(q, people).detail}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] text-faint">Gửi theo đúng thứ tự trên. Mật khẩu và secret OTP không bao giờ chờ trên máy — đổi chúng cần có mạng.</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
