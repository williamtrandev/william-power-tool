import clsx from 'clsx';
import { Camera, Check, ChevronDown, UserCheck, ClipboardPaste, Eye, EyeOff, ImageUp, Keyboard, KeySquare, MonitorUp, Loader2, Lock, Plus, RefreshCw, ScanLine, Trash2, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar, Button, Segmented } from '../../components/ui';
import type { Backend, DirectoryEntry } from '../../lib/backend';
import { cleanSecret, parseOtpText, readQrFile, secondsLeft, systemKey, totp, type OtpAlgorithm, type OtpDraft, type TeamAccount } from '../../lib/otp';
import { Modal } from '../commands/Modal';
import { QrScanner, ScreenQrScanner } from './QrScanner';

const field =
  'focus-ring h-10 w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-fg placeholder:text-faint hover:border-line-strong focus:border-accent/60 focus:shadow-[0_0_0_3px_var(--accent-ring)]';

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <p className="mb-1.5 text-[12.5px] font-medium text-fg-2">
      {children} {hint && <span className="font-normal text-faint">— {hint}</span>}
    </p>
  );
}

/** current code for a secret being added, so the admin can compare it with their phone */
export function useLiveCode(d: Pick<OtpDraft, 'secret' | 'algorithm' | 'digits' | 'period'> | null) {
  const [state, setState] = useState<{ code: string; left: number } | null>(null);
  useEffect(() => {
    if (!d?.secret) return setState(null);
    let alive = true;
    const run = async () => {
      try {
        const code = await totp(d.secret, d);
        if (alive) setState({ code, left: secondsLeft(d.period) });
      } catch {
        if (alive) setState(null);
      }
    };
    run();
    const t = setInterval(run, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [d?.secret, d?.algorithm, d?.digits, d?.period]); // d itself is a fresh object every render
  return state;
}

export const groupCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c);

type Source = 'screen' | 'image' | 'camera' | 'text';

const canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/** read QR / text into drafts: camera, image (pick, drop or paste), or typed link / secret */
function SourcePicker({ onDrafts }: { onDrafts: (d: OtpDraft[]) => void }) {
  // screen capture is the quickest on a desktop browser; phones fall back to image / camera
  const [src, setSrc] = useState<Source>(canShareScreen ? 'screen' : 'image');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromText = (t: string) => {
    try {
      setErr(null);
      onDrafts(parseOtpText(t));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const fromFile = async (f: Blob) => {
    setBusy(true);
    setErr(null);
    try {
      fromText(await readQrFile(f));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // a pasted screenshot works from any tab
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (img) {
        e.preventDefault();
        setSrc('image');
        fromFile(img);
      }
    };
    addEventListener('paste', onPaste);
    return () => removeEventListener('paste', onPaste);
  });

  const isMac = /Mac|iP/.test(navigator.platform);
  return (
    <div className="space-y-3">
      <Segmented
        label="Cách thêm"
        value={src}
        onChange={(v) => {
          setSrc(v);
          setErr(null);
        }}
        items={[
          ...(canShareScreen ? [{ id: 'screen' as const, label: 'Quét màn hình', icon: <MonitorUp size={15} /> }] : []),
          { id: 'image', label: 'Ảnh / dán ảnh', icon: <ImageUp size={15} /> },
          { id: 'camera', label: 'Quét camera', icon: <Camera size={15} /> },
          { id: 'text', label: 'Nhập tay', icon: <Keyboard size={15} /> },
        ]}
      />
      {src === 'image' && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) fromFile(f);
          }}
          className={clsx(
            'focus-ring flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            drag ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-surface-2/50',
          )}
        >
          {busy ? <Loader2 size={24} className="animate-spin text-accent" /> : <ScanLine size={24} className="text-accent" />}
          <span className="text-[13.5px] font-medium text-fg">{busy ? 'Đang đọc mã QR…' : 'Chọn hoặc kéo thả ảnh có mã QR'}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-muted">
            <ClipboardPaste size={13} /> Hoặc chụp màn hình mã QR rồi nhấn <b className="text-fg-2">{isMac ? '⌘' : 'Ctrl'} + V</b> ở bất kỳ đâu trong khung này
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) fromFile(f);
            }}
          />
        </button>
      )}
      {src === 'screen' && <ScreenQrScanner onText={fromText} />}
      {src === 'camera' && <QrScanner onText={fromText} />}
      {src === 'text' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'otpauth://totp/SBB:qc_test?secret=JBSWY3DPEHPK3PXP&issuer=SBB\nhoặc chỉ dán secret, vd: JBSW Y3DP EHPK 3PXP'}
            className="focus-ring block w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[12.5px] text-fg placeholder:font-sans placeholder:text-faint"
          />
          <p className="text-[11.5px] text-faint">
            Tiện ích Authenticator trên Chrome: Cài đặt → Sao lưu → xuất file, mở file và dán các dòng <code>otpauth://</code> vào đây (nhiều dòng được).
          </p>
          <Button variant="primary" size="sm" disabled={!text.trim()} onClick={() => fromText(text)}>
            Đọc
          </Button>
        </div>
      )}
      {err && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/8 px-3 py-2 text-[12.5px] text-error">
          <TriangleAlert size={15} className="mt-px shrink-0" /> {err}
        </p>
      )}
    </div>
  );
}

function LiveCode({ d }: { d: OtpDraft }) {
  const live = useLiveCode(d);
  if (!live) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-[14px] font-semibold tracking-wider text-fg tabular-nums">
      {groupCode(live.code)}
      <span className="font-sans text-[11px] font-normal tracking-normal text-faint">{live.left}s</span>
    </span>
  );
}

interface Props {
  backend: Backend;
  initial: TeamAccount | null;
  /** approved members, to pick who may use the account */
  members: DirectoryEntry[];
  /** current user: picks the default sharing and whether "only me" may be chosen */
  meId: string;
  admin: boolean;
  /** systems already in use, suggested so the same system groups together */
  systems: string[];
  /** prefilled system when adding from a system's group */
  defaultSystem?: string;
  onSaved: (msg: string) => void;
  onClose: () => void;
}

/** what happens to a stored secret value when saving an existing account */
type Keep = 'keep' | 'set' | 'remove';

export function AccountEditor({ backend, initial, members, meId, admin, systems, defaultSystem, onSaved, onClose }: Props) {
  const editing = !!initial;
  const [system, setSystem] = useState(initial?.system ?? defaultSystem ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  // password: new accounts type it; existing ones keep / replace / remove it
  const [pwMode, setPwMode] = useState<Keep>(editing && initial.has_password ? 'keep' : 'set');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  // OTP: off, or read from a QR / link (several accounts at once from a Google export)
  const hadOtp = !!initial?.has_otp;
  const [otpMode, setOtpMode] = useState<Keep>(hadOtp ? 'keep' : 'remove');
  const [drafts, setDrafts] = useState<OtpDraft[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>('SHA1');
  const [digits, setDigits] = useState(initial?.otp_digits ?? 6);
  const [period, setPeriod] = useState(initial?.otp_period ?? 30);

  // who may use it: whole team, picked members, or the owner alone (new accounts by members start private)
  const [access, setAccess] = useState<'team' | 'some' | 'private'>(
    initial ? (initial.is_private ? 'private' : initial.everyone ? 'team' : 'some') : admin ? 'team' : 'private',
  );
  const everyone = access === 'team';
  // only the owner may make an account owner-only
  const canPrivate = !initial || initial.owner_id === meId || initial.is_private;
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial && !initial.everyone && !initial.is_private) backend.acctMembers(initial.id).then((ids) => setChosen(new Set(ids)), () => {});
  }, [backend, initial]);

  const takeDrafts = (d: OtpDraft[]) => {
    setDrafts(d);
    setPicked(d.map(() => true));
    if (d.length === 1) {
      const [x] = d;
      if (!system) setSystem(x.issuer);
      if (!username) setUsername(x.label);
      setAlgorithm(x.algorithm);
      setDigits(x.digits);
      setPeriod(x.period);
    }
  };
  const multi = otpMode === 'set' && !!drafts && drafts.length > 1;
  const single = otpMode === 'set' && drafts?.length === 1 ? drafts[0] : null;

  const memberIds = [...chosen];
  const accessOk = access !== 'some' || memberIds.length > 0;
  const otpOk = otpMode !== 'set' || !!drafts;
  const ok = accessOk && otpOk && (multi ? picked.some(Boolean) : !!username.trim());
  const missing = [!multi && !username.trim() && 'tên đăng nhập', !otpOk && 'mã QR / secret OTP', !accessOk && 'người được dùng'].filter(Boolean) as string[];

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    const share = { everyone, members: access === 'some' ? memberIds : [], is_private: access === 'private' };
    // reuse the spelling already in use, so "sme" lands in the "SME" group
    const canon = (s: string) => systems.find((x) => systemKey(x) === systemKey(s)) ?? s.trim();
    try {
      if (multi) {
        // a Google Authenticator export: one account per ticked entry, OTP only
        const list = drafts!.filter((_, i) => picked[i]);
        for (const d of list)
          await backend.acctSave(null, {
            system: canon(d.issuer),
            username: d.label,
            url: '',
            note: '',
            password: null,
            otp_secret: d.secret,
            otp_algorithm: d.algorithm,
            otp_digits: d.digits,
            otp_period: d.period,
            ...share,
          });
        onSaved(`Đã thêm ${list.length} tài khoản`);
      } else {
        await backend.acctSave(initial?.id ?? null, {
          system: canon(system),
          username: username.trim(),
          url: url.trim(),
          note: note.trim(),
          // an empty "new password" box keeps what is stored
          password: pwMode === 'remove' ? '' : pwMode === 'set' && password ? password : null,
          otp_secret: otpMode === 'keep' ? null : otpMode === 'remove' ? (hadOtp ? '' : null) : cleanSecret(single!.secret),
          otp_algorithm: algorithm,
          otp_digits: digits,
          otp_period: period,
          ...share,
        });
        onSaved(editing ? 'Đã lưu tài khoản' : 'Đã thêm tài khoản');
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  const section = (title: string, children: ReactNode, hint?: string) => (
    <section className="rounded-xl border border-line bg-surface-2/30 p-4">
      <p className="mb-3 text-[13px] font-semibold text-fg">
        {title} {hint && <span className="font-normal text-faint">— {hint}</span>}
      </p>
      {children}
    </section>
  );

  return (
    <Modal
      wide
      title={editing ? `Sửa tài khoản · ${[initial.system, initial.username].filter(Boolean).join(' · ')}` : 'Thêm tài khoản dùng chung'}
      onClose={onClose}
      footer={
        <>
          {err ? (
            <p className="mr-auto text-[12.5px] text-error">{err}</p>
          ) : (
            missing.length > 0 && <p className="mr-auto text-[12px] text-warn">Còn thiếu: {missing.join(', ')}</p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={!ok || busy} onClick={save}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {editing ? 'Lưu thay đổi' : multi ? `Thêm ${picked.filter(Boolean).length} tài khoản` : 'Thêm tài khoản'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!multi &&
          section(
            'Thông tin đăng nhập',
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label hint="cùng tên sẽ gom chung một nhóm">Hệ thống</Label>
                <input
                  autoFocus={!defaultSystem}
                  list="acct-systems"
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  className={field}
                  placeholder="Chọn hoặc gõ tên hệ thống"
                />
                <datalist id="acct-systems">
                  {systems.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label>
                  Tên đăng nhập <span className="text-error">*</span>
                </Label>
                <input autoFocus={!!defaultSystem} value={username} onChange={(e) => setUsername(e.target.value)} className={field} placeholder="vd: qc_test" autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <Label hint="không bắt buộc">Link đăng nhập</Label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} className={field} placeholder="https://…" autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <Label>Mật khẩu</Label>
                {pwMode === 'keep' ? (
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span className="font-mono tracking-widest">••••••••</span> đang lưu
                    <Button size="sm" onClick={() => setPwMode('set')}>
                      Đổi mật khẩu
                    </Button>
                    <Button size="sm" variant="ghost" className="hover:text-error" onClick={() => setPwMode('remove')}>
                      <Trash2 size={13} /> Xoá
                    </Button>
                  </div>
                ) : pwMode === 'remove' && editing && initial.has_password ? (
                  <div className="flex items-center gap-2 text-[13px] text-error">
                    Mật khẩu sẽ bị xoá khi lưu.
                    <Button size="sm" variant="ghost" onClick={() => setPwMode('keep')}>
                      Hoàn tác
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={clsx(field, 'pr-10 font-mono')}
                      placeholder={editing && initial.has_password ? 'Mật khẩu mới' : 'Để trống nếu không cần lưu'}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? 'Ẩn' : 'Hiện'}
                      className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-faint hover:text-fg"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label hint="không bắt buộc">Ghi chú</Label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className={clsx(field, 'h-auto resize-none py-2.5')}
                  placeholder="vd: môi trường UAT, đổi mật khẩu mỗi quý…"
                />
              </div>
            </div>,
          )}

        {section(
          'Mã OTP (2 lớp)',
          <>
            {otpMode === 'keep' && (
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <KeySquare size={15} className="text-accent" /> Đã có OTP ({digits} số / {period}s)
                <Button size="sm" onClick={() => setOtpMode('set')}>
                  <ScanLine size={13} /> Thay bằng mã QR mới
                </Button>
                <Button size="sm" variant="ghost" className="hover:text-error" onClick={() => setOtpMode('remove')}>
                  <Trash2 size={13} /> Bỏ OTP
                </Button>
              </div>
            )}
            {otpMode === 'remove' &&
              (hadOtp ? (
                <div className="flex items-center gap-2 text-[13px] text-error">
                  OTP sẽ bị gỡ khỏi tài khoản khi lưu.
                  <Button size="sm" variant="ghost" onClick={() => setOtpMode('keep')}>
                    Hoàn tác
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setOtpMode('set')}>
                  <Plus size={15} /> Thêm OTP — quét / dán mã QR
                </Button>
              ))}
            {otpMode === 'set' && (
              <div className="space-y-3">
                {drafts ? (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-[13px] text-emerald-700 dark:text-emerald-400">
                    <Check size={16} />
                    <span className="flex-1">{drafts.length > 1 ? `Đọc được ${drafts.length} tài khoản từ mã QR chuyển tài khoản` : 'Đã đọc được mã QR'}</span>
                    <Button size="sm" variant="ghost" onClick={() => setDrafts(null)}>
                      <RefreshCw size={13} /> Quét lại
                    </Button>
                  </div>
                ) : (
                  <>
                    <SourcePicker onDrafts={takeDrafts} />
                    <button type="button" onClick={() => setOtpMode(hadOtp ? 'keep' : 'remove')} className="text-[12px] text-muted hover:text-fg">
                      {hadOtp ? 'Giữ OTP cũ' : 'Không cần OTP'}
                    </button>
                  </>
                )}

                {single && (
                  <div className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-muted">Mã hiện tại — so với app Authenticator của bạn để chắc đã quét đúng:</p>
                        <div className="mt-1.5">
                          <LiveCode d={{ ...single, algorithm, digits, period }} />
                        </div>
                      </div>
                      <button type="button" onClick={() => setShowSecret((v) => !v)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
                        {showSecret ? <EyeOff size={14} /> : <Eye size={14} />} {showSecret ? 'Ẩn secret' : 'Xem secret'}
                      </button>
                    </div>
                    {showSecret && <p className="mt-2 font-mono text-[12px] break-all text-fg-2">{single.secret}</p>}
                    <button type="button" onClick={() => setAdvanced((v) => !v)} className="mt-2 flex items-center gap-1 text-[12px] text-muted hover:text-fg">
                      <ChevronDown size={14} className={clsx('transition-transform', advanced && 'rotate-180')} /> Nâng cao (thuật toán, số chữ số, chu kỳ)
                    </button>
                    {advanced && (
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <div>
                          <Label>Thuật toán</Label>
                          <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value as OtpAlgorithm)} className={field}>
                            <option>SHA1</option>
                            <option>SHA256</option>
                            <option>SHA512</option>
                          </select>
                        </div>
                        <div>
                          <Label>Số chữ số</Label>
                          <select value={digits} onChange={(e) => setDigits(Number(e.target.value))} className={field}>
                            <option value={6}>6</option>
                            <option value={7}>7</option>
                            <option value={8}>8</option>
                          </select>
                        </div>
                        <div>
                          <Label>Chu kỳ (giây)</Label>
                          <input type="number" min={10} max={300} value={period} onChange={(e) => setPeriod(Number(e.target.value) || 30)} className={field} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {multi && (
                  <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                    {drafts!.map((d, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={picked[i]}
                          onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                          className="size-4 accent-[var(--accent)]"
                          aria-label={`Thêm ${d.label}`}
                        />
                        <input
                          value={d.issuer}
                          onChange={(e) => setDrafts((l) => l!.map((x, j) => (j === i ? { ...x, issuer: e.target.value } : x)))}
                          placeholder="Hệ thống"
                          aria-label="Hệ thống"
                          className={clsx(field, 'h-8 w-36')}
                        />
                        <input
                          value={d.label}
                          onChange={(e) => setDrafts((l) => l!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                          placeholder="Tên đăng nhập"
                          aria-label="Tên đăng nhập"
                          className={clsx(field, 'h-8 min-w-0 flex-1')}
                        />
                        <LiveCode d={d} />
                      </li>
                    ))}
                    <li className="px-3 py-2 text-[11.5px] text-faint">Mỗi dòng thành một tài khoản riêng; mật khẩu và link thêm sau bằng nút Sửa.</li>
                  </ul>
                )}
              </div>
            )}
          </>,
          'không bắt buộc',
        )}

        {section(
          'Ai được dùng',
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Ai được dùng"
                value={access}
                onChange={setAccess}
                items={[
                  { id: 'team', label: 'Cả team', icon: <Users size={15} /> },
                  { id: 'some', label: 'Người được chọn', icon: <UserCheck size={15} /> },
                  ...(canPrivate ? [{ id: 'private' as const, label: 'Chỉ mình tôi', icon: <Lock size={15} /> }] : []),
                ]}
              />
              <span className="text-[12px] text-muted">
                {access === 'team'
                  ? 'Mọi thành viên đã duyệt.'
                  : access === 'private'
                    ? 'Chỉ bạn — thành viên khác và cả admin đều không thấy.'
                    : `${memberIds.length} người được chọn · bạn${admin ? '' : ' và admin'} luôn dùng được.`}
              </span>
            </div>
            {access === 'some' && (
              <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
                {members.map((m) => (
                  <li key={m.user_id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2/50">
                      <input
                        type="checkbox"
                        checked={chosen.has(m.user_id)}
                        onChange={(e) =>
                          setChosen((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(m.user_id);
                            else n.delete(m.user_id);
                            return n;
                          })
                        }
                        className="size-4 accent-[var(--accent)]"
                      />
                      <Avatar src={m.avatar_url} name={m.full_name} email={m.email} size={26} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{m.full_name || m.email}</span>
                      {m.full_name && <span className="truncate text-[12px] text-faint">{m.email}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>,
        )}
        <p className="flex items-start gap-1.5 text-[11.5px] text-faint">
          <Lock size={12} className="mt-0.5 shrink-0" />
          Mật khẩu và secret OTP được giữ trên máy chủ; thành viên chỉ xem được mật khẩu / lấy được mã khi bấm, và mỗi lần đều được ghi vào nhật ký.
        </p>
      </div>
    </Modal>
  );
}
