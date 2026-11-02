import { Download, Landmark, Loader2, Type } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { field, Label } from '../../../components/form';
import { Button, Segmented, Switch } from '../../../components/ui';
import { nf } from '../../../lib/format';
import { CopyButton } from './CopyButton';
import { BANKS } from './lib/banks';
import { ascii, buildVietQr, type VietQrInput } from './lib/emvco';
import { copyPng, qrPng, type Ecc } from './lib/qrImage';

type Mode = 'vietqr' | 'text';
const OTHER = 'other';
const DRAFT = 'wpt-qr-draft';
const NOTE_MAX = 25; // EMVCo 62.08

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
  // the image of the payload it was drawn for, so a stale one is never shown
  const [drawn, setDrawn] = useState<{ key: string; url: string } | null>(null);

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
  const png = shown && drawn?.key === key ? drawn.url : null;

  useEffect(() => {
    if (!shown) return;
    let live = true;
    qrPng(shown, level).then(
      (url) => live && setDrawn({ key: `${level}:${shown}`, url }),
      () => {},
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
          <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Ngân hàng</Label>
                <select
                  className={field}
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
                </select>
              </div>
              {other ? (
                <div>
                  <Label hint="6 chữ số">BIN</Label>
                  <input className={field} aria-label="BIN" inputMode="numeric" maxLength={6} value={q.bin} onChange={(e) => set({ bin: e.target.value.replace(/\D/g, '') })} />
                </div>
              ) : (
                <p className="self-end pb-2.5 text-[12px] text-muted">{bank?.name}</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{q.card ? 'Số thẻ' : 'Số tài khoản'}</Label>
                <input className={field} aria-label={q.card ? 'Số thẻ' : 'Số tài khoản'} autoComplete="off" spellCheck={false} value={q.account} onChange={(e) => set({ account: e.target.value })} />
              </div>
              <div className="self-end pb-2">
                <Switch checked={q.card} onChange={(card) => set({ card })} label="Chuyển đến số thẻ" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label hint="bỏ trống để người chuyển tự nhập">Số tiền (VND)</Label>
                <input
                  className={field}
                  aria-label="Số tiền"
                  inputMode="numeric"
                  value={q.amount ? nf(Number(q.amount)) : ''}
                  onChange={(e) => set({ amount: e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13) })}
                />
              </div>
              <div>
                <Label hint="tuỳ chọn">Tên người nhận</Label>
                <input className={field} aria-label="Tên người nhận" value={q.name} maxLength={25} onChange={(e) => set({ name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label hint={`${noteAscii.length}/${NOTE_MAX} ký tự`}>Nội dung chuyển khoản</Label>
              <input className={field} aria-label="Nội dung chuyển khoản" value={q.note} onChange={(e) => ascii(e.target.value).length <= NOTE_MAX && set({ note: e.target.value })} />
              {noteAscii !== q.note && <p className="mt-1 text-[11.5px] text-muted">Mã QR sẽ ghi không dấu: {noteAscii}</p>}
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
          </div>
        )}
      </section>

      <section data-tour="qr-output" className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid aspect-square w-full max-w-[300px] place-items-center rounded-lg bg-white">
          {png ? (
            <img src={png} alt="Mã QR" className="size-full rounded-lg" />
          ) : valid ? (
            <Loader2 size={22} className="animate-spin text-zinc-400" />
          ) : (
            <p className="px-6 text-center text-[12.5px] text-zinc-500">{problem || payload}</p>
          )}
        </div>
        {mode === 'vietqr' && valid && (
          <p className="text-center text-[12.5px] text-muted">
            {bank?.short ?? `BIN ${q.bin}`} · {q.account.replace(/\s/g, '')}
            {q.amount && ` · ${nf(Number(q.amount))} đ`}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-1">
          <Button size="sm" variant="primary" disabled={!png} onClick={() => png && download(png, fileName)}>
            <Download size={14} /> Tải PNG
          </Button>
          {png && (
            <CopyButton copy={() => copyPng(png)} label="Copy ảnh QR" onToast={onToast}>
              Copy ảnh
            </CopyButton>
          )}
          {valid && payload && (
            <CopyButton text={payload} label="Copy chuỗi QR" onToast={onToast}>
              Copy chuỗi
            </CopyButton>
          )}
        </div>
        {mode === 'vietqr' && valid && payload && <p className="w-full font-mono text-[11.5px] break-all text-faint">{payload}</p>}
      </section>
    </div>
  );
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
