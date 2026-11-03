export interface FillResult {
  user: boolean;
  pass: boolean;
  otp: boolean;
}

export interface LoginFields {
  user?: HTMLInputElement;
  pw?: HTMLInputElement;
  /** one box for the whole code */
  otp?: HTMLInputElement;
  /** one box per digit */
  boxes: HTMLInputElement[];
}

const SKIP = ['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color'];
const hint = (el: HTMLInputElement) => `${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
const isOtp = (el: HTMLInputElement) => el.autocomplete === 'one-time-code' || /otp|2fa|totp|mfa|one-?time|verif|passcode|token|(^|[\s_-])code/.test(hint(el));
const isText = (el: HTMLInputElement) => ['text', 'email', 'tel', 'search'].includes(el.type) && !isOtp(el);

/** the login boxes of a page: visible, editable inputs only */
export function findFields(doc: Document = document): LoginFields {
  const inputs = [...doc.querySelectorAll('input')].filter(
    (el) => !SKIP.includes(el.type) && !el.disabled && !el.readOnly && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
  // one-box-per-digit OTP inputs are often type=password too — never take them for the password
  const pw = inputs.find((el) => el.type === 'password' && el.maxLength !== 1 && !isOtp(el));
  const texts = inputs.filter(isText);
  // the username is the last text box before the password (in its form), or the likeliest one on a username-first page
  const user =
    (pw && texts.filter((el) => (!pw.form || el.form === pw.form) && el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)) ||
    texts.find((el) => el.autocomplete === 'username' || el.type === 'email' || /user|email|login|account|tai.?khoan|ten.?dang/.test(hint(el)));
  const boxes = inputs.filter((el) => el.maxLength === 1);
  const otp = inputs.find((el) => el !== pw && el !== user && el.maxLength !== 1 && isOtp(el));
  return { user, pw, otp, boxes: boxes.length >= 4 && boxes.length <= 8 ? boxes : [] };
}

function set(el: HTMLInputElement, v: string) {
  el.focus();
  // the native setter, so React / Vue / Angular controlled inputs notice the change
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** fills what the page has: username, password, and the OTP (one box, or one box per digit) */
export function fillLogin(username: string, password: string | null, otp: string | null, doc: Document = document): FillResult {
  const f = findFields(doc);
  const res: FillResult = { user: false, pass: false, otp: false };
  if (f.user) {
    set(f.user, username);
    res.user = true;
  }
  if (f.pw && password != null) {
    set(f.pw, password);
    res.pass = true;
  }
  if (otp) res.otp = fillOtp(otp, f);
  return res;
}

/** the OTP alone: one box, or one box per digit */
export function fillOtp(otp: string, f: LoginFields = findFields()): boolean {
  if (f.boxes.length === otp.length) {
    f.boxes.forEach((el, i) => set(el, otp[i]));
    return true;
  }
  if (f.otp) {
    set(f.otp, otp);
    return true;
  }
  return false;
}

/** an empty OTP box waiting for a code (the step after the password, often) */
export function emptyOtpBox(f: LoginFields = findFields()): HTMLInputElement | undefined {
  if (f.boxes.length && f.boxes.every((el) => !el.value)) return f.boxes[0];
  if (f.otp && !f.otp.value) return f.otp;
}

/** a field the inline menu opens on */
export function isLoginField(el: HTMLInputElement, f: LoginFields = findFields(el.ownerDocument)) {
  return el === f.user || el === f.pw || el === f.otp || f.boxes[0] === el;
}
