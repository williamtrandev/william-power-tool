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
// what a box is called: name, id, placeholder, aria-label, title and its <label> — lower case, Vietnamese accents dropped
const hint = (el: HTMLInputElement) =>
  [el.name, el.id, el.autocomplete, el.placeholder, el.title, el.getAttribute('aria-label'), ...[...(el.labels ?? [])].map((l) => l.textContent)]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
const isCaptcha = (el: HTMLInputElement) => /captcha|capcha|ma.?bao.?ve/.test(hint(el));
const isOtp = (el: HTMLInputElement) =>
  !isCaptcha(el) && (el.autocomplete === 'one-time-code' || /otp|2fa|totp|mfa|one-?time|verif|passcode|token|sms|authen|xac.?thuc|ma.?xac|(^|[\s_-])code/.test(hint(el)));
const isText = (el: HTMLInputElement) => ['text', 'email', 'tel', 'search'].includes(el.type) && !isOtp(el) && !isCaptcha(el);

/** the login boxes of a page: visible, editable inputs only */
const visibleInputs = (doc: Document) =>
  [...doc.querySelectorAll('input')].filter(
    (el) => !SKIP.includes(el.type) && !el.disabled && !el.readOnly && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );

export function findFields(doc: Document = document): LoginFields {
  const inputs = visibleInputs(doc);
  // one-box-per-digit OTP inputs are often type=password too — never take them for the password
  const pw = inputs.find((el) => el.type === 'password' && el.maxLength !== 1 && !isOtp(el));
  const texts = inputs.filter(isText);
  // the username is the last text box before the password (in its form), or the likeliest one on a username-first page
  const user =
    (pw && texts.filter((el) => (!pw.form || el.form === pw.form) && el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)) ||
    texts.find((el) => el.autocomplete === 'username' || el.type === 'email' || /user|email|login|account|tai.?khoan|ten.?dang/.test(hint(el)));
  const boxes = inputs.filter((el) => el.maxLength === 1 && !isCaptcha(el));
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

/** puts the code in the given box — or in every digit box when it is the first of them */
export function fillOtpInto(el: HTMLInputElement, otp: string): boolean {
  const f = findFields(el.ownerDocument);
  if (f.boxes[0] === el) return fillOtp(otp, f);
  set(el, otp);
  return true;
}

/**
 * An empty OTP box waiting for a code (the step after the password, often). Only asked while an OTP is expected,
 * so an unnamed box counts too: the only empty short box on the page (4–8 characters, or a numeric keypad), or the
 * page's only box at all.
 */
export function emptyOtpBox(doc: Document = document): HTMLInputElement | undefined {
  const f = findFields(doc);
  if (f.boxes.length && f.boxes.every((el) => !el.value)) return f.boxes[0];
  if (f.otp && !f.otp.value) return f.otp;
  const inputs = visibleInputs(doc).filter((el) => !isCaptcha(el));
  const empty = inputs.filter((el) => !el.value && ['text', 'tel', 'number', 'password'].includes(el.type));
  const short = empty.filter((el) => (el.maxLength >= 4 && el.maxLength <= 8) || el.inputMode === 'numeric');
  if (short.length === 1) return short[0];
  if (inputs.length === 1 && empty.length === 1) return empty[0];
}

/** a field the inline menu opens on */
export function isLoginField(el: HTMLInputElement, f: LoginFields = findFields(el.ownerDocument)) {
  return el === f.user || el === f.pw || el === f.otp || f.boxes[0] === el;
}
