import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { nf } from '../../../lib/format';
import { CopyButton } from './CopyButton';
import { classify, looksEmv, parseEmv, type Emv, type Tlv } from './lib/emvco';

/** What a QR code holds: VietQR / EMVCo split into fields, or a link, Wi-Fi login, 2FA link, plain text. */
export function QrResult({ text, onToast }: { text: string; onToast: (m: string) => void }) {
  const read = useMemo(() => {
    if (!looksEmv(text)) return { emv: null, error: null };
    try {
      return { emv: parseEmv(text), error: null };
    } catch (e) {
      return { emv: null, error: (e as Error).message };
    }
  }, [text]);
  const plain = useMemo(() => classify(text), [text]);
  const { emv, error } = read;
  const kind = emv ? (emv.transfer ? 'VietQR' : 'EMVCo') : error ? 'EMVCo lỗi' : { url: 'Link', otp: 'Mã cài 2FA', wifi: 'Wi-Fi', text: 'Văn bản' }[plain.kind];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex h-10 items-center gap-2 border-b border-line px-3">
          <span className="text-[12.5px] font-semibold">Nội dung QR</span>
          <span className="rounded-full bg-accent-soft px-2 py-px text-[11px] font-medium text-accent">{kind}</span>
          <span className="text-[11.5px] text-faint tabular-nums">{nf(text.length)} ký tự</span>
          <span className="ml-auto">
            <CopyButton text={text} label="Copy nội dung QR" onToast={onToast}>
              Copy
            </CopyButton>
          </span>
        </div>
        <p className="max-h-40 overflow-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-fg">{text}</p>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/8 px-3 py-2.5 text-[12.5px] text-error">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          Chuỗi bắt đầu như QR thanh toán EMVCo nhưng không đọc được: {error}
        </p>
      )}
      {emv && <EmvView emv={emv} onToast={onToast} />}
      {!emv && !error && plain.kind === 'url' && (
        <Card>
          <a href={plain.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium break-all text-accent hover:underline">
            {plain.url}
            <ExternalLink size={13} className="shrink-0" />
          </a>
          <p className="mt-1 text-[12px] text-muted">Xem kỹ tên miền trước khi mở link lạ.</p>
        </Card>
      )}
      {!emv && !error && plain.kind === 'wifi' && (
        <Card>
          <Rows
            rows={[
              ['Tên Wi-Fi', plain.ssid, plain.hidden ? 'mạng ẩn' : undefined],
              ['Bảo mật', plain.security],
              ['Mật khẩu', plain.password || '(không có)', undefined, !!plain.password],
            ]}
            onToast={onToast}
          />
        </Card>
      )}
      {!emv && !error && plain.kind === 'otp' && (
        <Card>
          <p className="text-[12.5px] text-muted">Đây là mã cài xác thực 2 lớp. Thêm ở tab Tài khoản để cả team lấy được mã OTP mà không cần quét lại.</p>
        </Card>
      )}
    </div>
  );
}

function EmvView({ emv, onToast }: { emv: Emv; onToast: (m: string) => void }) {
  const t = emv.transfer;
  return (
    <>
      {emv.crc ? (
        <p
          className={clsx(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] font-medium',
            emv.crc.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-error/10 text-error',
          )}
        >
          {emv.crc.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {emv.crc.ok ? `CRC đúng (${emv.crc.got})` : `CRC sai: QR ghi ${emv.crc.got}, đúng phải là ${emv.crc.want} — app ngân hàng sẽ từ chối mã này`}
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-warn/10 px-3 py-2 text-[12.5px] font-medium text-warn">
          <AlertTriangle size={15} /> Thiếu trường CRC (63) ở cuối chuỗi
        </p>
      )}
      {t && (
        <Card title="Chuyển khoản">
          <Rows
            rows={[
              ['Ngân hàng', t.bank ?? `BIN ${t.bin}`, t.bank ? `BIN ${t.bin}` : 'chưa có trong danh sách'],
              [t.service === 'QRIBFTTC' ? 'Số thẻ' : 'Số tài khoản', t.account, undefined, true],
              ['Số tiền', t.amount ? `${nf(Number(t.amount))} ${t.currency ?? ''}` : 'Người chuyển tự nhập', undefined, false],
              ['Nội dung', t.note ?? '—', undefined, !!t.note],
              ['Người nhận', t.name ?? '—'],
              ['Kiểu QR', t.dynamic ? 'Động — dùng một lần' : 'Tĩnh — dùng nhiều lần'],
            ]}
            onToast={onToast}
          />
        </Card>
      )}
      <Card title="Tất cả trường">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-faint uppercase">
                <th className="px-1 pb-1.5 font-semibold">ID</th>
                <th className="px-1 pb-1.5 font-semibold">Trường</th>
                <th className="px-1 pb-1.5 font-semibold">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              {emv.fields.map((f) => (
                <FieldRows key={f.id + f.value} f={f} depth={0} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function FieldRows({ f, depth }: { f: Tlv; depth: number }) {
  return (
    <>
      <tr className="border-t border-line align-top">
        <td className="px-1 py-1.5 font-mono text-faint" style={{ paddingLeft: 4 + depth * 14 }}>
          {f.id}
        </td>
        <td className="px-1 py-1.5 whitespace-nowrap text-fg-2">{f.name}</td>
        <td className="px-1 py-1.5 font-mono break-all text-fg">
          {f.children ? <span className="text-faint">{f.value.length} ký tự</span> : f.value}
          {f.hint && <span className="ml-2 font-sans text-[11.5px] text-accent">{f.hint}</span>}
        </td>
      </tr>
      {f.children?.map((c) => (
        <FieldRows key={c.id + c.value} f={c} depth={depth + 1} />
      ))}
    </>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-3.5">
      {title && <p className="mb-2 text-[12.5px] font-semibold">{title}</p>}
      {children}
    </section>
  );
}

/** label · value (· note) rows; `copy` adds a copy button for the value */
function Rows({ rows, onToast }: { rows: [string, string, string?, boolean?][]; onToast: (m: string) => void }) {
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_1fr] items-center gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v, note, copy]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 font-medium break-all text-fg">{v}</span>
            {note && <span className="text-[11.5px] text-faint">{note}</span>}
            {copy && <CopyButton text={v} label={`Copy ${k.toLowerCase()}`} onToast={onToast} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
