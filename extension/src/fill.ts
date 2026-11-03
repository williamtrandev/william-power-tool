export interface FillResult {
  user: boolean;
  pass: boolean;
  otp: boolean;
}

/**
 * Fills the login boxes of the page. Injected into every frame of the tab with chrome.scripting,
 * so it must stay self-contained: no imports, no outer variables.
 */
export function fillLogin(username: string, password: string | null, otp: string | null): FillResult {
  const SKIP = ['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'image', 'range', 'color'];
  const inputs = [...document.querySelectorAll('input')].filter(
    (el) => !SKIP.includes(el.type) && !el.disabled && !el.readOnly && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
  const hint = (el: HTMLInputElement) => `${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
  const isOtp = (el: HTMLInputElement) => el.autocomplete === 'one-time-code' || /otp|2fa|totp|mfa|one-?time|verif|passcode|token|(^|[\s_-])code/.test(hint(el));
  const isText = (el: HTMLInputElement) => ['text', 'email', 'tel', 'search'].includes(el.type) && !isOtp(el);
  const set = (el: HTMLInputElement, v: string) => {
    el.focus();
    // the native setter, so React / Vue / Angular controlled inputs notice the change
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // one-box-per-digit OTP inputs are often type=password too — never take them for the password
  const pw = inputs.find((el) => el.type === 'password' && el.maxLength !== 1 && !isOtp(el));
  const texts = inputs.filter(isText);
  // the username is the last text box before the password (in its form), or the likeliest one on a username-first page
  const user =
    (pw && texts.filter((el) => (!pw.form || el.form === pw.form) && el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)) ||
    texts.find((el) => el.autocomplete === 'username' || el.type === 'email' || /user|email|login|account|tai.?khoan|ten.?dang/.test(hint(el)));

  const res: FillResult = { user: false, pass: false, otp: false };
  if (user) {
    set(user, username);
    res.user = true;
  }
  if (pw && password != null) {
    set(pw, password);
    res.pass = true;
  }
  if (otp) {
    const boxes = inputs.filter((el) => el.maxLength === 1);
    if (boxes.length === otp.length) {
      boxes.forEach((el, i) => set(el, otp[i]));
      res.otp = true;
    } else {
      const box = inputs.find((el) => el !== pw && el !== user && isOtp(el));
      if (box) {
        set(box, otp);
        res.otp = true;
      }
    }
  }
  return res;
}
