import clsx from 'clsx';
import { Download, Landmark, Loader2, QrCode, Type } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { field, Select } from '../../../components/form';
import { Button, Segmented } from '../../../components/ui';
import { nf } from '../../../lib/format';
import { CopyButton } from './CopyButton';
import { BANKS } from './lib/banks';
import { ascii, buildVietQr, type VietQrInput } from './lib/emvco';
import { copyPng, qrPng, type Ecc } from './lib/qrImage';

type Mode = 'vietqr' | 'text';
const OTHER = 'other';
const DRAFT = 'wpt-qr-draft';
const NOTE_MAX = 25; // EMVCo 62.08
const ECC_HINT: Record<Ecc, string> = {
  L: 'mã thưa nhất — hợp với nội dung dài (link dài, JSON) hiện trên màn hình.',
  M: 'mặc định, hợp với hầu hết trường hợp: hiện trên màn hình, gửi qua chat.',
  Q: 'cho QR in ra giấy, dán ở chỗ dễ trầy xước hoặc bám bẩn.',
  H: 'bền nhất — dùng khi chèn logo vào giữa mã, hoặc in ở nơi dễ hỏng.',
};
/** most bytes a QR holds (version 40, byte mode); digits-only or upper-case text fits more */
const CAP: Record<Ecc, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
/** past this a QR gets dense enough that phone cameras struggle with small prints */
const DENSE = 300;

const blank: VietQrInput = { bin: '970436', account: '', card: false, amount: '', note: '', name: '' };
function readDraft(): VietQrInput {
  try {
    return { ...blank, ...JSON.parse(localStorage.getItem(DRAFT) || '{}') };
  } catch {
    return blank;
  }
}
const banks = [...BANKS].sort((a, b) => a.short.localeCompare(b.short));

/** a VietQR transfer to test payment flows, or a QR for any link / text */
export function QrMake({ onToast }: { onToast: (m: string) => void }) {
  const [mode, setMode] = useState<Mode>('vietqr');
  const [q, setQ] = useState<VietQrInput>(readDraft);
  const [other, setOther] = useState(() => !BANKS.some((b) => b.bin === q.bin));
  const [plain, setPlain] = useState('');
  const [ecc, setEcc] = useState<Ecc>('M');
  // the image of the payload it was drawn for (null: too long to encode), so a stale one is never shown
  const [drawn, setDrawn] = useState<{ key: string; url: string | null } | null>(null);

  // the bank and account are reused across visits: testers keep paying the same test account
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT, JSON.stringify(q));
    } catch {
      /* storage unavailable */
    }
  }, [q]);

  const problem =
    mode === 'text'
      ? !plain.trim() && 'Nhập nội dung cần tạo QR'
      : !/^\d{6}$/.test(q.bin)
        ? 'BIN ngân hàng gồm 6 chữ số'
        : !q.account.trim()
          ? 'Nhập số tài khoản hoặc số thẻ'
          : !/^[0-9A-Za-z]{1,19}$/.test(q.account.replace(/\s/g, ''))
            ? 'Số tài khoản / thẻ chỉ gồm chữ và số, tối đa 19 ký tự'
            : null;
  const payload = useMemo(() => {
    if (problem) return null;
    try {
      return mode === 'text' ? plain : buildVietQr(q);
    } catch (e) {
      return (e as Error).message;
    }
  }, [mode, plain, q, problem]);
  const valid = payload != null && (mode === 'text' || payload.startsWith('000201'));
  const shown = useDeferredValue(valid ? payload : null);
  const level = mode === 'vietqr' ? 'M' : ecc;
  const key = `${level}:${shown}`;
  const done = !!shown && drawn?.key === key;
  const png = done ? drawn.url : null;
  const tooLong = done && !png;
  const bytes = useMemo(() => new TextEncoder().encode(mode === 'text' ? plain : (payload ?? '')).length, [mode, plain, payload]);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    qrPng(shown, level).then(
      (url) => live && setDrawn({ key: `${level}:${shown}`, url }),
      () => live && setDrawn({ key: `${level}:${shown}`, url: null }),
    );
    return () => {
      live = false;
    };
  }, [shown, level]);

  const set = (patch: Partial<VietQrInput>) => setQ((x) => ({ ...x, ...patch }));
  const noteAscii = ascii(q.note);
  const bank = banks.find((b) => b.bin === q.bin);
  const fileName = mode === 'vietqr' ? `vietqr-${bank?.short.replace(/\s/g, '') ?? q.bin}-${q.account.replace(/\s/g, '')}.png` : 'qr.png';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <section data-tour="qr-form" className="space-y-3">
        <Segmented
          label="Loại QR"
          value={mode}
          onChange={setMode}
          items={[
            { id: 'vietqr', label: 'VietQR chuyển khoản', icon: <Landmark size={15} /> },
            { id: 'text', label: 'Link / văn bản', icon: <Type size={15} /> },
          ]}
        />
        {mode === 'vietqr' ? (
          <div className="grid gap-x-3 gap-y-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
            <div className={clsx(!other && 'sm:col-span-2')}>
              <Caption title="Ngân hàng" />
              <Select
                aria-label="Ngân hàng"
                value={other ? OTHER : q.bin}
                onChange={(e) => {
                  const v = e.target.value;
                  setOther(v === OTHER);
                  if (v !== OTHER) set({ bin: v });
                }}
              >
                {banks.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.short} · {b.bin}
                  </option>
                ))}
                <option value={OTHER}>Khác — nhập BIN</option>
              </Select>
              {!other && bank && <Help>{bank.name}</Help>}
            </div>
            {other && (
              <div>
                <Caption title="BIN" hint="6 chữ số" />
                <input className={field} aria-label="BIN" inputMode="numeric" maxLength={6} value={q.bin} onChange={(e) => set({ bin: e.target.value.replace(/\D/g, '') })} />
              </div>
            )}

            <div>
              <Caption title={q.card ? 'Số thẻ' : 'Số tài khoản'}>
                <span role="radiogroup" aria-label="Chuyển đến" className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
                  {[
                    { card: false, label: 'Tài khoản' },
                    { card: true, label: 'Thẻ' },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      role="radio"
                      aria-checked={q.card === o.card}
                      onClick={() => set({ card: o.card })}
                      className={clsx(
                        'focus-ring h-4 rounded px-1.5 text-[11px] leading-4 font-medium transition-colors',
                        q.card === o.card ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </span>
              </Caption>
              <input
                className={field}
                aria-label={q.card ? 'Số thẻ' : 'Số tài khoản'}
                autoComplete="off"
                spellCheck={false}
                value={q.account}
                onChange={(e) => set({ account: e.target.value })}
              />
            </div>
            <div>
              <Caption title="Số tiền" hint="VND" />
              <input
                className={field}
                aria-label="Số tiền"
                inputMode="numeric"
                placeholder="Bỏ trống: người chuyển tự nhập"
                value={q.amount ? nf(Number(q.amount)) : ''}
                onChange={(e) => set({ amount: e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13) })}
              />
            </div>

            <div>
              <Caption title="Tên người nhận" hint="tuỳ chọn" />
              <input className={field} aria-label="Tên người nhận" value={q.name} maxLength={25} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <Caption title="Nội dung" hint={`${noteAscii.length}/${NOTE_MAX} ký tự`} />
              <input
                className={field}
                aria-label="Nội dung chuyển khoản"
                value={q.note}
                onChange={(e) => {
                  let note = e.target.value;
                  if (ascii(note).length > NOTE_MAX) {
                    while (ascii(note).length > NOTE_MAX) note = note.slice(0, -1);
                    onToast(`Nội dung chuyển khoản tối đa ${NOTE_MAX} ký tự — đã cắt phần thừa`);
                  }
                  set({ note });
                }}
              />
              {noteAscii !== q.note && <Help>Mã QR ghi không dấu: {noteAscii}</Help>}
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <textarea
              value={plain}
              onChange={(e) => setPlain(e.target.value)}
              rows={5}
              spellCheck={false}
              aria-label="Nội dung QR"
              placeholder="Link, mã đơn, chuỗi QR cần tạo lại…"
              className={field.replace('h-10', 'min-h-28') + ' resize-y py-2 font-mono text-[12.5px]'}
            />
            <p className={clsx('-mt-1.5 text-right text-[11.5px] tabular-nums', bytes > CAP[ecc] ? 'text-error' : 'text-faint')}>
              {nf(bytes)} / {nf(CAP[ecc])} byte ở mức {ecc}
            </p>
            <div data-tour="qr-ecc" className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                Mức sửa lỗi
                <Segmented
                  label="Mức sửa lỗi"
                  value={ecc}
                  onChange={setEcc}
                  items={[
                    { id: 'L', label: 'L · 7%', icon: null },
                    { id: 'M', label: 'M · 15%', icon: null },
                    { id: 'Q', label: 'Q · 25%', icon: null },
                    { id: 'H', label: 'H · 30%', icon: null },
                  ]}
                />
              </div>
              <p className="text-[12px] leading-relaxed text-muted">
                Phần mã được phép bẩn, mờ hoặc bị che mà vẫn quét được. Mức càng cao mã càng bền nhưng càng nhiều ô, in nhỏ sẽ khó quét hơn.
                <br />
                <b className="font-medium text-fg-2">{ecc}:</b> {ECC_HINT[ecc]}
              </p>
            </div>
          </div>
        )}
      </section>

      <section data-tour="qr-output" className="flex flex-col items-center gap-3 self-start rounded-xl border border-line bg-surface p-4">
        {png ? (
          <img src={png} alt="Mã QR" className="aspect-square w-full max-w-[300px] rounded-lg bg-white" />
        ) : (
          <div className="grid aspect-square w-full max-w-[300px] place-items-center rounded-lg border border-dashed border-line bg-surface-2/40 px-6 text-center">
            {tooLong ? (
              <div className="flex flex-col items-center gap-2 text-[12.5px] text-error">
                <QrCode size={28} />
                <span>
                  Nội dung quá dài để tạo QR ở mức {level}: {nf(bytes)} byte, tối đa khoảng {nf(CAP[level])}.
                  <br />
                  <span className="text-muted">Chọn mức sửa lỗi thấp hơn hoặc rút gọn nội dung.</span>
                </span>
              </div>
            ) : valid ? (
              <Loader2 size={22} className="animate-spin text-faint" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-[12.5px] text-muted">
                <QrCode size={28} className="text-faint" />
                {problem || payload}
              </div>
            )}
          </div>
        )}
        {mode === 'vietqr' && valid && (
          <p className="text-center text-[12.5px] text-muted">
            {bank?.short ?? `BIN ${q.bin}`} · {q.account.replace(/\s/g, '')}
            {q.amount && ` · ${nf(Number(q.amount))} đ`}
          </p>
        )}
        {png && mode === 'text' && bytes > DENSE && (
          <p className="max-w-[300px] text-center text-[12px] text-warn">
            Mã khá dày ({nf(bytes)} byte): in nhỏ hoặc hiện trên màn hình nhỏ có thể khó quét. Nên rút gọn link hoặc chọn mức L.
          </p>
        )}
        {png && (
          <div className="flex flex-wrap justify-center gap-1">
            <Button size="sm" variant="primary" onClick={() => download(png, fileName)}>
              <Download size={14} /> Tải PNG
            </Button>
            <CopyButton copy={() => copyPng(png)} label="Copy ảnh QR" onToast={onToast}>
              Copy ảnh
            </CopyButton>
            {payload && (
              <CopyButton text={payload} label="Copy chuỗi QR" onToast={onToast}>
                Copy chuỗi
              </CopyButton>
            )}
          </div>
        )}
        {mode === 'vietqr' && valid && payload && <p className="w-full font-mono text-[11.5px] break-all text-faint">{payload}</p>}
      </section>
    </div>
  );
}

/** one-line field caption: fixed height so fields side by side start at the same line */
function Caption({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="mb-1.5 flex h-5 items-center justify-between gap-2">
      <span className="truncate text-[12.5px] font-medium text-fg-2">
        {title} {hint && <span className="font-normal text-faint">— {hint}</span>}
      </span>
      {children}
    </div>
  );
}

const Help = ({ children }: { children: ReactNode }) => <p className="mt-1.5 text-[11.5px] text-muted">{children}</p>;

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
