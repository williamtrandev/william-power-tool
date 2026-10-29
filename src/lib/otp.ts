import jsQR from 'jsqr';

/**
 * Shared accounts: types, plus OTP helpers — read otpauth:// links and QR images, compute TOTP
 * codes in the browser (only to preview a secret while adding it — members get codes from
 * the database).
 */

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** a shared account as members see it: never the password or the OTP secret */
export interface TeamAccount {
  id: string;
  system: string;
  /** environment within the system: Dev, UAT, Prod… ('' = not set) */
  env: string;
  username: string;
  url: string;
  note: string;
  has_password: boolean;
  has_otp: boolean;
  otp_digits: number;
  otp_period: number;
  everyone: boolean;
  /** owner only — hidden from everyone else, admins included */
  is_private: boolean;
  owner_id: string | null;
  /** this user may edit / delete it */
  can_manage: boolean;
  created_by: string | null;
  updated_at: string;
}

/** accounts of one system group together: case, accents and spacing don't matter */
export const systemKey = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/** environments offered first, in this order; anything else typed is kept as is */
export const ENVS = ['Dev', 'UAT', 'Staging', 'Prod'] as const;
export const envKey = (s: string) => systemKey(s);
export const isProd = (s: string) => /^(prod|production|live|thật|that)$/.test(envKey(s));
export const envRank = (s: string) => {
  const i = ENVS.findIndex((e) => envKey(e) === envKey(s));
  return i < 0 ? (s ? ENVS.length : ENVS.length + 1) : i;
};

export interface OtpCode {
  code: string;
  next_code: string;
  remaining: number;
  period: number;
}

export interface AccountCode extends OtpCode {
  id: string;
}

export interface AccountActivity {
  id: number;
  account_id: string | null;
  account: string;
  action: 'code' | 'copy' | 'password' | 'create' | 'update' | 'delete';
  user_email: string | null;
  at: string;
}

/** what an admin fills in. password / otp_secret: null keeps the stored value, '' removes it */
export interface AccountInput {
  system: string;
  env: string;
  username: string;
  url: string;
  note: string;
  password: string | null;
  otp_secret: string | null;
  otp_algorithm: OtpAlgorithm;
  otp_digits: number;
  otp_period: number;
  everyone: boolean;
  members: string[];
  is_private: boolean;
}

/** an account read from a QR / link, before it is saved */
export interface OtpDraft {
  issuer: string;
  label: string;
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  period: number;
}

// ── base32 ───────────────────────────────────────────────────────────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const cleanSecret = (s: string) => s.toUpperCase().replace(/[\s=-]/g, '');

export function base32Decode(s: string): Uint8Array {
  const clean = cleanSecret(s);
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Secret không hợp lệ (phải là chuỗi base32: A–Z và 2–7)');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >>> bits) & 255);
      buf &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buf = 0;
  let bits = 0;
  for (const b of bytes) {
    buf = (buf << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(buf >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buf &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buf << (5 - bits)) & 31];
  return out;
}

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────

export async function totp(secret: string, { algorithm = 'SHA1', digits = 6, period = 30, at = Date.now() }: Partial<OtpDraft> & { at?: number } = {}) {
  const counter = Math.floor(at / 1000 / period);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 255;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey('raw', base32Decode(secret) as BufferSource, { name: 'HMAC', hash: algorithm.replace('SHA', 'SHA-') }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const secondsLeft = (period: number, at = Date.now()) => period - (Math.floor(at / 1000) % period);

// ── otpauth:// and Google Authenticator export links ─────────────────────────

const ALGS: OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];

/** otpauth://totp/Issuer:account?secret=…&issuer=…&algorithm=…&digits=…&period=… */
export function parseOtpAuth(uri: string): OtpDraft {
  const u = new URL(uri.trim());
  if (u.protocol !== 'otpauth:') throw new Error('Không phải link otpauth://');
  if (u.hostname.toLowerCase() !== 'totp') throw new Error('Chỉ hỗ trợ mã theo thời gian (TOTP), không hỗ trợ HOTP');
  const p = u.searchParams;
  const secret = cleanSecret(p.get('secret') ?? '');
  base32Decode(secret); // validates
  const path = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  const [pIssuer, pLabel] = path.includes(':') ? [path.slice(0, path.indexOf(':')), path.slice(path.indexOf(':') + 1)] : ['', path];
  const alg = (p.get('algorithm') ?? 'SHA1').toUpperCase() as OtpAlgorithm;
  return {
    issuer: (p.get('issuer') ?? pIssuer).trim(),
    label: pLabel.trim() || pIssuer.trim() || 'Tài khoản',
    secret,
    algorithm: ALGS.includes(alg) ? alg : 'SHA1',
    digits: Number(p.get('digits')) || 6,
    period: Number(p.get('period')) || 30,
  };
}

/** minimal protobuf reader for Google Authenticator's "Transfer accounts" QR */
function readProto(buf: Uint8Array) {
  let pos = 0;
  const varint = () => {
    let r = 0;
    let shift = 0;
    for (;;) {
      const b = buf[pos++];
      r += (b & 127) * 2 ** shift;
      if (!(b & 128)) return r;
      shift += 7;
    }
  };
  const fields: { no: number; v: number | Uint8Array }[] = [];
  while (pos < buf.length) {
    const tag = varint();
    const no = Math.floor(tag / 8);
    const type = tag & 7;
    if (type === 0) fields.push({ no, v: varint() });
    else if (type === 2) {
      const len = varint();
      fields.push({ no, v: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (type === 1) pos += 8;
    else if (type === 5) pos += 4;
    else throw new Error('QR chuyển tài khoản không đọc được');
  }
  return fields;
}

/** otpauth-migration://offline?data=… (one QR holding several accounts) */
export function parseMigration(uri: string): OtpDraft[] {
  const data = new URL(uri.trim()).searchParams.get('data');
  if (!data) throw new Error('QR chuyển tài khoản thiếu dữ liệu');
  const bin = Uint8Array.from(atob(data.replace(/-/g, '+').replace(/_/g, '/').replace(/ /g, '+')), (c) => c.charCodeAt(0));
  const text = (b: unknown) => (b instanceof Uint8Array ? new TextDecoder().decode(b) : '');
  const out: OtpDraft[] = [];
  for (const f of readProto(bin)) {
    if (f.no !== 1 || !(f.v instanceof Uint8Array)) continue;
    const p = Object.fromEntries(readProto(f.v).map((x) => [x.no, x.v]));
    if (p[6] === 1) continue; // HOTP
    const name = text(p[2]);
    const issuer = text(p[3]) || (name.includes(':') ? name.split(':')[0] : '');
    out.push({
      issuer: issuer.trim(),
      label: (name.includes(':') ? name.slice(name.indexOf(':') + 1) : name).trim() || 'Tài khoản',
      secret: base32Encode(p[1] as Uint8Array),
      algorithm: ({ 2: 'SHA256', 3: 'SHA512' } as Record<number, OtpAlgorithm>)[p[4] as number] ?? 'SHA1',
      digits: p[5] === 2 ? 8 : 6,
      period: 30,
    });
  }
  if (!out.length) throw new Error('QR chuyển tài khoản không có mã TOTP nào');
  return out;
}

/** text from a QR / paste: otpauth://, otpauth-migration:// (one per line), or a bare secret */
export function parseOtpText(text: string): OtpDraft[] {
  const lines = text
    .split(/\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const links = lines.filter((l) => /^otpauth(-migration)?:\/\//i.test(l));
  if (links.length) return links.flatMap((l) => (/^otpauth-migration:/i.test(l) ? parseMigration(l) : [parseOtpAuth(l)]));
  const secret = cleanSecret(text);
  base32Decode(secret);
  return [{ issuer: '', label: '', secret, algorithm: 'SHA1', digits: 6, period: 30 }];
}

// ── QR images ────────────────────────────────────────────────────────────────

/** QR text from pixels, or null */
export function readQr(img: ImageData): string | null {
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** decode a QR from an image file / pasted screenshot (tries a few sizes; screenshots can be huge) */
export async function readQrFile(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  for (const max of [1600, 1000, 600, bmp.width]) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const text = readQr(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (text) return text;
  }
  throw new Error('Không tìm thấy mã QR trong ảnh — thử cắt sát vào mã QR hoặc chụp rõ hơn');
}
