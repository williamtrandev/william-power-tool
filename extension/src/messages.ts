import type { FillResult } from './fill';

/** content script → background: may this login box get the menu? `auto`: an OTP box appeared after a fill */
export interface OpenAsk {
  type: 'inline-open';
  auto?: boolean;
}
export interface OpenReply {
  token?: string;
}
/** inline menu → background: who am I serving? (token from the frame URL) */
export interface InfoAsk {
  type: 'inline-info';
  token: string;
}
export interface InfoReply {
  host?: string | null;
  /** opened by itself to put in the OTP of the account just filled */
  auto?: PendingOtp;
}
/** inline menu → background → content script of the frame that opened it */
export interface FillAsk {
  type: 'inline-fill';
  token: string;
  username: string;
  password: string | null;
  otp: string | null;
  /** fill the OTP box only */
  otpOnly?: boolean;
  /** the account has an OTP: if the page has no OTP box yet, remember it for the next step */
  otpFor?: { accountId: string; username: string; host: string | null };
}
/** background → content script */
export interface ContentFill {
  type: 'fill';
  username: string;
  password: string | null;
  otp: string | null;
  otpOnly?: boolean;
}
export type FillReply = FillResult | { error: string };

/**
 * The account last filled in a tab, while its OTP may be asked: first the login's OTP step, then — once a code went
 * in — later steps on the same site (confirming a transfer…). Put the code in when an empty OTP box shows up.
 */
export interface PendingOtp {
  accountId: string;
  username: string;
  /** where the fill happened, and the account's own site — the OTP page must be one of them */
  hosts: string[];
  until: number;
  /** the code that went in last: set once the login's OTP is done, and a site may refuse the same code twice */
  lastCode?: string;
  /** a page that keeps asking (a wrong code, a cleared box) gets a few tries only */
  lastUrl?: string;
  streak?: number;
}
/** popup → background, after a fill that left the OTP out (the inline menu says so with its fill instead) */
export interface RememberOtp {
  type: 'otp-remember';
  tabId: number;
  accountId: string;
  username: string;
  hosts: string[];
  /** the code already put in with the login, if the page had its box */
  code?: string;
}
/** popup → background: stop filling OTPs for this tab */
export interface ForgetOtp {
  type: 'otp-forget';
  tabId: number;
}
/** popup → background: the OTP this tab is waiting for, to show it */
export interface StatusAsk {
  type: 'otp-status';
  tabId: number;
}
/** content script → background, on load and after a fill: is an OTP expected in this tab? */
export interface WatchAsk {
  type: 'otp-watch';
}
export interface WatchReply {
  until?: number;
  /** a later step: only boxes that clearly are OTP boxes, never a lone search box */
  strict?: boolean;
}

/** iframe ↔ content script over postMessage: only harmless layout signals, never account data */
export type FrameSignal = { wpt: 'size'; h: number } | { wpt: 'close' } | { wpt: 'focus' };
