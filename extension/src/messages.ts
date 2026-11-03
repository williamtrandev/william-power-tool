import type { FillResult } from './fill';

/** content script → background: may this login box get the menu? */
export interface OpenAsk {
  type: 'inline-open';
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
}
/** inline menu → background → content script of the frame that opened it */
export interface FillAsk {
  type: 'inline-fill';
  token: string;
  username: string;
  password: string | null;
  otp: string | null;
}
/** background → content script */
export interface ContentFill {
  type: 'fill';
  username: string;
  password: string | null;
  otp: string | null;
}
export type FillReply = FillResult | { error: string };

/** iframe ↔ content script over postMessage: only harmless layout signals, never account data */
export type FrameSignal = { wpt: 'size'; h: number } | { wpt: 'close' } | { wpt: 'focus' };
