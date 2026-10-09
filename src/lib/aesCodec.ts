import AES from 'crypto-js/aes';
import Base64 from 'crypto-js/enc-base64';
import Utf8 from 'crypto-js/enc-utf8';
import ECB from 'crypto-js/mode-ecb';
import NoPadding from 'crypto-js/pad-nopadding';
import Pkcs7 from 'crypto-js/pad-pkcs7';
import type CryptoJS from 'crypto-js';

/**
 * AES-ECB + PKCS7 over Base64 — the same scheme as the Watane Python script
 * (`AES.new(key, MODE_ECB)` + `unpad`). Key length picks the variant: 16/24/32 bytes → AES-128/192/256.
 */

export type CodecResult = { ok: true; value: string } | { ok: false; error: string };

const enc = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

export function keyInfo(key: string): { bytes: number; valid: boolean; label: string } {
  const bytes = enc.encode(key).length;
  const valid = bytes === 16 || bytes === 24 || bytes === 32;
  return { bytes, valid, label: valid ? `AES-${bytes * 8}` : 'cần 16 / 24 / 32 byte' };
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function toBytes(wa: CryptoJS.lib.WordArray): Uint8Array {
  const out = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return out;
}

export function decrypt(b64: string, key: string): CodecResult {
  const s = b64.trim();
  if (!s) return { ok: false, error: 'Trống' };
  if (!keyInfo(key).valid) return { ok: false, error: 'Key phải dài 16, 24 hoặc 32 byte' };
  if (!B64.test(s) || s.length % 4 !== 0) return { ok: false, error: 'Không phải Base64 hợp lệ' };
  const cipher = Base64.parse(s);
  if (cipher.sigBytes === 0 || cipher.sigBytes % 16 !== 0) return { ok: false, error: `Độ dài ${cipher.sigBytes} byte không chia hết cho 16` };
  // Decrypt without padding, then strip PKCS7 ourselves so a wrong key is reported (like Python's unpad).
  const plain = toBytes(AES.decrypt({ ciphertext: cipher } as CryptoJS.lib.CipherParams, Utf8.parse(key), { mode: ECB, padding: NoPadding }));
  const n = plain[plain.length - 1];
  if (n < 1 || n > 16 || plain.slice(plain.length - n).some((b) => b !== n)) return { ok: false, error: 'Sai padding — có thể sai key' };
  try {
    return { ok: true, value: strictUtf8.decode(plain.slice(0, plain.length - n)) };
  } catch {
    return { ok: false, error: 'Kết quả không phải UTF-8 — có thể sai key' };
  }
}

export function encrypt(text: string, key: string): CodecResult {
  if (!text) return { ok: false, error: 'Trống' };
  if (!keyInfo(key).valid) return { ok: false, error: 'Key phải dài 16, 24 hoặc 32 byte' };
  const c = AES.encrypt(Utf8.parse(text), Utf8.parse(key), { mode: ECB, padding: Pkcs7 });
  return { ok: true, value: c.ciphertext.toString(Base64) };
}
