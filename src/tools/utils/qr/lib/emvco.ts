import { bankByBin } from './banks';

/**
 * EMVCo merchant-presented QR (the format behind VietQR / NAPAS 247): a flat list of
 * ID (2 digits) + length (2 digits) + value, some values being nested lists themselves,
 * ending with tag 63 = CRC-16/CCITT-FALSE of everything before it (including "6304").
 */
export interface Tlv {
  id: string;
  value: string;
  /** what the tag means, in Vietnamese */
  name: string;
  /** parsed sub-fields when the value is a template */
  children?: Tlv[];
  /** a friendlier reading of the value (currency code → VND…) */
  hint?: string;
}

const ROOT: Record<string, string> = {
  '00': 'Phiên bản payload',
  '01': 'Kiểu QR',
  '52': 'Mã ngành hàng (MCC)',
  '53': 'Tiền tệ',
  '54': 'Số tiền',
  '55': 'Tip / phí',
  '56': 'Phí cố định',
  '57': 'Phí theo %',
  '58': 'Quốc gia',
  '59': 'Tên người nhận',
  '60': 'Thành phố',
  '61': 'Mã bưu chính',
  '62': 'Thông tin thêm',
  '63': 'CRC',
  '64': 'Ngôn ngữ khác',
};
const ADDITIONAL: Record<string, string> = {
  '01': 'Số hoá đơn',
  '02': 'Số điện thoại',
  '03': 'Mã cửa hàng',
  '04': 'Mã khách hàng thân thiết',
  '05': 'Mã tham chiếu',
  '06': 'Mã khách hàng',
  '07': 'Mã thiết bị',
  '08': 'Nội dung',
  '09': 'Yêu cầu thêm',
};
const NAPAS: Record<string, string> = { '00': 'GUID', '01': 'Người nhận', '02': 'Mã dịch vụ' };
const BENEFICIARY: Record<string, string> = { '00': 'BIN ngân hàng', '01': 'Số tài khoản / thẻ' };
const SERVICES: Record<string, string> = {
  QRIBFTTA: 'Chuyển nhanh đến tài khoản',
  QRIBFTTC: 'Chuyển nhanh đến thẻ',
  QRPUSH: 'Thanh toán sản phẩm / dịch vụ',
  QRCASH: 'Rút tiền tại ATM',
};
const CURRENCIES: Record<string, string> = { '704': 'VND', '840': 'USD', '978': 'EUR', '392': 'JPY', '410': 'KRW', '156': 'CNY', '764': 'THB', '702': 'SGD' };
export const NAPAS_GUID = 'A000000727';

/** split one level of ID-length-value; throws on a malformed string */
export function splitTlv(s: string): { id: string; value: string }[] {
  const out: { id: string; value: string }[] = [];
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(s.slice(i + 2, i + 4)) || i + 4 + len > s.length) throw new Error(`Sai cấu trúc ở vị trí ${i + 1}`);
    out.push({ id, value: s.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

/** a value that is itself a valid ID-length-value list, or null */
const nested = (v: string) => {
  try {
    const parts = splitTlv(v);
    return parts.length ? parts : null;
  } catch {
    return null;
  }
};

function describe(id: string, value: string): Tlv {
  const n = Number(id);
  if (n >= 26 && n <= 51) {
    const parts = nested(value);
    const napas = parts?.find((p) => p.id === '00')?.value === NAPAS_GUID;
    return {
      id,
      value,
      name: napas ? 'VietQR (NAPAS)' : 'Tài khoản merchant',
      children: parts?.map((p) => {
        if (!napas) return { ...p, name: p.id === '00' ? 'GUID' : `Trường ${p.id}` };
        if (p.id === '01')
          return {
            ...p,
            name: NAPAS['01'],
            children: nested(p.value)?.map((b) => ({ ...b, name: BENEFICIARY[b.id] ?? `Trường ${b.id}`, hint: b.id === '00' ? bankByBin(b.value)?.short : undefined })),
          };
        return { ...p, name: NAPAS[p.id] ?? `Trường ${p.id}`, hint: p.id === '02' ? SERVICES[p.value] : undefined };
      }),
    };
  }
  if (n >= 2 && n <= 25) return { id, value, name: 'Tài khoản thẻ quốc tế' };
  if (id === '62' || id === '64')
    return { id, value, name: ROOT[id], children: nested(value)?.map((p) => ({ ...p, name: (id === '62' ? ADDITIONAL[p.id] : null) ?? `Trường ${p.id}` })) };
  if (n >= 80) return { id, value, name: 'Dữ liệu riêng' };
  const hint =
    id === '01' ? ({ '11': 'QR tĩnh, dùng nhiều lần', '12': 'QR động, dùng một lần' } as Record<string, string>)[value] : id === '53' ? CURRENCIES[value] : undefined;
  return { id, value, name: ROOT[id] ?? `Trường ${id}`, hint };
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 upper-case hex digits */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface Emv {
  fields: Tlv[];
  crc: { got: string; want: string; ok: boolean } | null;
  /** the transfer, when it is a VietQR */
  transfer: {
    bin: string;
    bank: string | null;
    account: string;
    service: string | null;
    amount: string | null;
    currency: string | null;
    note: string | null;
    name: string | null;
    dynamic: boolean;
  } | null;
}

export const looksEmv = (s: string) => /^000201/.test(s.trim());

export function parseEmv(raw: string): Emv {
  const s = raw.trim();
  const fields = splitTlv(s).map((f) => describe(f.id, f.value));
  const crcAt = s.lastIndexOf('6304');
  const got = fields.find((f) => f.id === '63')?.value;
  const crc = got && crcAt === s.length - 8 ? { got: got.toUpperCase(), want: crc16(s.slice(0, crcAt + 4)), ok: false } : null;
  if (crc) crc.ok = crc.got === crc.want;

  const top = (id: string) => fields.find((f) => f.id === id)?.value ?? null;
  const napas = fields.find((f) => f.name === 'VietQR (NAPAS)');
  const who = napas?.children?.find((c) => c.id === '01')?.children;
  const bin = who?.find((c) => c.id === '00')?.value;
  const transfer =
    napas && bin
      ? {
          bin,
          bank: bankByBin(bin)?.short ?? null,
          account: who?.find((c) => c.id === '01')?.value ?? '',
          service: napas.children?.find((c) => c.id === '02')?.value ?? null,
          amount: top('54'),
          currency: CURRENCIES[top('53') ?? ''] ?? top('53'),
          note: fields.find((f) => f.id === '62')?.children?.find((c) => c.id === '08')?.value ?? null,
          name: top('59'),
          dynamic: top('01') === '12',
        }
      : null;
  return { fields, crc, transfer };
}

const tlv = (id: string, value: string) => {
  if (value.length > 99) throw new Error(`Trường ${id} dài quá 99 ký tự`);
  return id + String(value.length).padStart(2, '0') + value;
};

/** Vietnamese → plain ASCII (bank apps reject marks in the transfer note) */
export const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]/g, '');

export interface VietQrInput {
  bin: string;
  account: string;
  /** to a card number instead of an account */
  card: boolean;
  /** whole VND, empty for "the payer types the amount" */
  amount: string;
  note: string;
  name: string;
}

/** a VietQR transfer payload, CRC included */
export function buildVietQr(q: VietQrInput): string {
  const beneficiary = tlv('00', q.bin) + tlv('01', q.account.replace(/\s/g, ''));
  const body = [
    tlv('00', '01'),
    tlv('01', q.amount ? '12' : '11'),
    tlv('38', tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', q.card ? 'QRIBFTTC' : 'QRIBFTTA')),
    tlv('53', '704'),
    q.amount ? tlv('54', q.amount) : '',
    tlv('58', 'VN'),
    q.name.trim() ? tlv('59', ascii(q.name).trim().toUpperCase()) : '',
    q.note.trim() ? tlv('62', tlv('08', ascii(q.note).trim())) : '',
  ].join('');
  return body + '6304' + crc16(body + '6304');
}

/** what a non-EMV QR holds */
export type Plain =
  | { kind: 'url'; url: string }
  | { kind: 'otp' }
  | { kind: 'wifi'; ssid: string; security: string; password: string; hidden: boolean }
  | { kind: 'text' };

export function classify(text: string): Plain {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { kind: 'url', url: t };
  if (/^otpauth(-migration)?:\/\//i.test(t)) return { kind: 'otp' };
  if (/^WIFI:/i.test(t)) {
    // WIFI:T:WPA;S:name;P:pass;H:true;;  — "\" escapes ; , : and \
    const get = (k: string) => t.match(new RegExp(`[:;]${k}:((?:\\\\.|[^;])*)`, 'i'))?.[1]?.replace(/\\(.)/g, '$1') ?? '';
    return { kind: 'wifi', ssid: get('S'), security: get('T') || 'nopass', password: get('P'), hidden: get('H') === 'true' };
  }
  return { kind: 'text' };
}
