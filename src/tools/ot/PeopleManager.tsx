import clsx from 'clsx';
import { Link2, Loader2, Pencil, Plus, Trash2, UserPlus, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Button } from '../../components/ui';
import type { Backend, DirectoryEntry, Member } from '../../lib/backend';
import { cleanEmail, fullName, givenName, isEmail, type OtPerson } from '../../lib/ot';
import { Modal } from '../../components/Modal';
import { fieldSm as field, Label } from '../../components/form';


type Draft = { id: string | null; name: string; full_name: string; email: string; active: boolean };
const blank: Draft = { id: null, name: '', full_name: '', email: '', active: true };

/**
 * The OT roster: who appears on the sheet and under which name. Shared by the team: anyone adds, renames
 * or hides people, including people without an account. Only admins delete someone outright.
 */
export function PeopleManager({
  backend,
  people,
  dir,
  me,
  onClose,
  onChanged,
  onToast,
}: {
  backend: Backend;
  people: OtPerson[];
  dir: DirectoryEntry[];
  me: Member;
  onClose: () => void;
  onChanged: () => void;
  onToast: (m: string) => void;
}) {
  const admin = me.role === 'admin';
  const [d, setD] = useState<Draft>(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const accounts = new Set(dir.map((m) => m.email));
  const onRoster = new Set(people.map((p) => p.email).filter(Boolean));
  const notListed = dir.filter((m) => !onRoster.has(m.email));
  const email = d.email.trim();
  const valid = !!d.name.trim() && (!email || isEmail(email));

  const save = async (draft = d) => {
    setBusy('save');
    setErr(null);
    try {
      await backend.otPersonSave(draft.id, { name: draft.name.trim(), full_name: draft.full_name.trim(), email: cleanEmail(draft.email), active: draft.active });
      onToast(draft.id ? 'Đã cập nhật' : `Đã thêm ${draft.name.trim()}`);
      setD(blank);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (p: OtPerson) => {
    setBusy(p.id);
    try {
      await backend.otPersonSave(p.id, { name: p.name, full_name: p.full_name, email: p.email, active: !p.active });
      onToast(p.active ? `Đã ẩn ${p.name} khỏi bảng OT` : `${p.name} đã hiện lại trên bảng OT`);
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: OtPerson) => {
    setBusy(p.id);
    try {
      await backend.otPersonDelete(p.id);
      onToast(`Đã xoá ${p.name}`);
      setConfirmDel(null);
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const status = (p: OtPerson) =>
    !p.email
      ? { icon: <UserRoundX size={11} />, label: 'Chưa có tài khoản', hint: 'Không cần tài khoản — ai trong team cũng ghi OT hộ được', cls: 'bg-surface-3 text-muted' }
      : accounts.has(p.email)
        ? { icon: <Link2 size={11} />, label: 'Đã liên kết', hint: 'Người này đã đăng nhập bằng email này', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' }
        : { icon: <Link2 size={11} />, label: 'Chờ đăng nhập', hint: 'Email này chưa đăng nhập vào William Tool', cls: 'bg-amber-500/14 text-amber-700 dark:text-amber-300' };

  const form = (
    <form
      className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save();
      }}
    >
      <p className="text-[12.5px] font-semibold">{d.id ? `Sửa ${people.find((p) => p.id === d.id)?.name ?? ''}` : 'Thêm người'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label compact hint="hiện trên bảng và file Excel">Tên hiển thị</Label>
          <input autoFocus className={field} value={d.name} maxLength={60} placeholder="VD: Quỳnh" onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div>
          <Label compact>Họ tên đầy đủ</Label>
          <input
            className={field}
            value={d.full_name}
            maxLength={120}
            placeholder="VD: Nguyễn Thị Quỳnh"
            onChange={(e) => setD({ ...d, full_name: e.target.value })}
            onBlur={() => !d.name.trim() && d.full_name.trim() && setD({ ...d, name: givenName(d.full_name) })}
          />
        </div>
      </div>
      <div>
        <Label compact hint="tuỳ chọn — để nhận ra người đó khi đăng nhập">Email</Label>
        <input
          className={field}
          type="email"
          value={d.email}
          placeholder="Bỏ trống nếu người này chưa có tài khoản"
          onChange={(e) => setD({ ...d, email: e.target.value })}
          aria-invalid={!!email && !isEmail(email)}
        />
        {!!email && !isEmail(email) && <p className="mt-1 text-[11.5px] text-error">Email chưa đúng định dạng</p>}
      </div>
      {err && <p className="rounded-lg bg-error/10 px-3 py-2 text-[12px] text-error">{err}</p>}
      <div className="flex justify-end gap-2">
        {d.id && (
          <Button size="sm" variant="ghost" onClick={() => setD(blank)}>
            Huỷ sửa
          </Button>
        )}
        <Button size="sm" variant="primary" type="submit" disabled={!valid || busy === 'save'}>
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : d.id ? <Pencil size={14} /> : <Plus size={14} />}
          {d.id ? 'Lưu' : 'Thêm'}
        </Button>
      </div>
    </form>
  );

  return (
    <Modal title="Danh sách người OT" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-[12.5px] text-muted">
          Tên trên bảng OT do team đặt, không phụ thuộc tên tài khoản Google.
 Ai trong team cũng thêm, sửa, ẩn được — kể cả người chưa có tài khoản.
        </p>

        {form}

        {notListed.length > 0 && !d.id && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-fg-2">Thêm nhanh từ thành viên đã đăng nhập</p>
            <div className="flex flex-wrap gap-1.5">
              {notListed.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  disabled={!!busy}
                  onClick={() => save({ id: null, name: givenName(m.full_name ?? '') || m.email.split('@')[0], full_name: m.full_name ?? '', email: m.email, active: true })}
                  className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-1 text-[12px] hover:border-accent/50 hover:bg-accent-soft"
                  title={m.email}
                >
                  <Avatar src={m.avatar_url} name={m.full_name} email={m.email} size={20} />
                  {m.full_name || m.email}
                  <UserPlus size={12} className="text-faint" />
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {people.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-muted">Chưa có ai trong danh sách.</li>}
          {people.map((p) => {
            const st = status(p);
            const avatar = dir.find((m) => m.email === p.email)?.avatar_url;
            return (
              <li key={p.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5', !p.active && 'opacity-55', d.id === p.id && 'bg-accent-soft')}>
                <Avatar src={avatar} name={fullName(p)} email={p.email ?? p.id} size={30} />
                <div className="min-w-0 flex-1 basis-[180px]">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="font-semibold">{p.name}</span>
                    {p.full_name && p.full_name !== p.name && <span className="truncate text-muted">{p.full_name}</span>}
                    {p.email === me.email && <span className="text-[11px] text-faint">bạn</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-faint">
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium', st.cls)} title={st.hint}>
                      {st.icon}
                      {st.label}
                    </span>
                    {p.email && <span className="truncate">{p.email}</span>}
                    {!p.active && <span>· đã ẩn</span>}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => toggle(p)} title={p.active ? 'Ẩn khỏi bảng OT và file Excel (giữ giờ đã ghi)' : 'Hiện lại trên bảng OT'}>
                    {p.active ? 'Ẩn' : 'Hiện lại'}
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Sửa ${p.name}`} title="Sửa tên / email" onClick={() => setD(toDraft(p))}>
                    <Pencil size={14} />
                  </Button>
                  {/* deleting outright stays with admins; anyone can hide */}
                  {admin && (
                    <Button
                      size={confirmDel === p.id ? 'sm' : 'icon-sm'}
                      variant={confirmDel === p.id ? 'danger' : 'ghost'}
                      aria-label={`Xoá ${p.name}`}
                      title="Xoá khỏi danh sách (chỉ khi chưa ghi giờ OT nào)"
                      disabled={busy === p.id}
                      onClick={() => (confirmDel === p.id ? remove(p) : setConfirmDel(p.id))}
                    >
                      <Trash2 size={14} />
                      {confirmDel === p.id && 'Xoá?'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}

const toDraft = (p: OtPerson): Draft => ({ id: p.id, name: p.name, full_name: p.full_name, email: p.email ?? '', active: p.active });
