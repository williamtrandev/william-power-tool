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
/**
 * The caption shown before a box when it is not a real <label for> — `<label>Email</label><div><input></div>`,
 * `<span>Email</span><input>`: the nearest text before the box or one of its wrappers, as long as nothing in between
 * is another field (then the text belongs to that one).
 */
function caption(el: HTMLInputElement) {
  let n: Element | null = el;
  for (let up = 0; up < 4 && n && n !== el.form; up++, n = n.parentElement) {
    for (let p = n.previousElementSibling; p; p = p.previousElementSibling) {
      if (p.matches('input, select, textarea') || p.querySelector('input, select, textarea')) return '';
      const t = p.textContent?.trim();
      if (t) return t.length <= 40 ? t : '';
    }
  }
  return '';
}

// what a box is called: name, id, placeholder, aria-label, title, its <label> or the caption before it — lower case,
// Vietnamese accents dropped
const hint = (el: HTMLInputElement) =>
  [
    el.name,
    el.id,
    el.autocomplete,
    el.placeholder,
    el.title,
    el.getAttribute('aria-label'),
    ...(el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map((id) => (id && el.ownerDocument.getElementById(id)?.textContent) || ''),
    ...[...(el.labels ?? [])].map((l) => l.textContent),
    el.labels?.length ? '' : caption(el),
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
const isCaptcha = (el: HTMLInputElement) => /captcha|capcha|ma.?bao.?ve/.test(hint(el));
const isOtp = (el: HTMLInputElement) =>
  !isCaptcha(el) && (el.autocomplete === 'one-time-code' || /otp|2fa|totp|mfa|one-?time|verif|passcode|token|sms|authen|xac.?thuc|ma.?xac|(^|[\s_-])code/.test(hint(el)));
const isText = (el: HTMLInputElement) => ['text', 'email', 'tel', 'search'].includes(el.type) && !isOtp(el) && !isCaptcha(el);
/**
 * A box asking for a username or an email, wherever it is on the page — not only the one `findFields` picks.
 * Says so by its type, its autocomplete, or its name; search boxes and bank account numbers ("số tài khoản") do not count.
 */
const asksForUser = (el: HTMLInputElement) => {
  if (!['text', 'email'].includes(el.type) || isCaptcha(el)) return false;
  if (el.type === 'email' || /username|email/.test(el.autocomplete)) return true;
  const h = hint(el);
  return !isOtp(el) && !/search|(^|\s)tim(\s|$)|so.?tai.?khoan|account.?(no|num)/.test(h) && /user|e-?mail|login|account|tai.?khoan|ten.?dang/.test(h);
};

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
  // the username is a text box before the password (in its form) — the one saying so, else the last — or the likeliest
  // one on a username-first page
  const before = pw ? texts.filter((el) => (!pw.form || el.form === pw.form) && el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
  const user =
    before.findLast(asksForUser) ||
    before.at(-1) ||
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

/**
 * Fills what the page has: username, password, and the OTP (one box, or one box per digit). The username goes in
 * `anchor` (the box the menu opened on, or the focused one) when that box asks for it, with the password of its form.
 */
export function fillLogin(username: string, password: string | null, otp: string | null, doc: Document = document, anchor?: HTMLInputElement): FillResult {
  const f = findFields(doc);
  const at = anchor ?? (doc.activeElement instanceof HTMLInputElement ? doc.activeElement : undefined);
  if (at && at !== f.user && asksForUser(at)) {
    f.user = at;
    if (f.pw && at.form && f.pw.form !== at.form) f.pw = undefined;
  }
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
 * page's only box at all. `strict` (later steps, long after the login): the box must say it is short — a lone search
 * or amount box is not an OTP box.
 */
export function emptyOtpBox(doc: Document = document, strict = false): HTMLInputElement | undefined {
  const f = findFields(doc);
  if (f.boxes.length && f.boxes.every((el) => !el.value)) return f.boxes[0];
  if (f.otp && !f.otp.value) return f.otp;
  const inputs = visibleInputs(doc).filter((el) => !isCaptcha(el));
  const empty = inputs.filter((el) => !el.value && ['text', 'tel', 'number', 'password'].includes(el.type));
  const short = empty.filter((el) => (el.maxLength >= 4 && el.maxLength <= 8) || (!strict && el.inputMode === 'numeric'));
  if (short.length === 1) return short[0];
  if (!strict && inputs.length === 1 && empty.length === 1) return empty[0];
}

/** a field the inline menu opens on */
export function isLoginField(el: HTMLInputElement, f: LoginFields = findFields(el.ownerDocument)) {
  if (el.disabled || el.readOnly) return false;
  return el === f.user || el === f.pw || el === f.otp || f.boxes[0] === el || asksForUser(el);
}
