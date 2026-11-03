import { createClient } from '@supabase/supabase-js';
import { AUTH_KEY, getInlineMode, SIGN_IN_ERROR, SITES_KEY, SUPABASE_KEY, SUPABASE_URL, sessionStore, type SitesCache } from './config';
import type { ContentFill, FillAsk, FillReply, InfoAsk, InfoReply, OpenReply } from './messages';
import { hostOf } from './site';

type Msg = { type?: string };

chrome.runtime.onMessage.addListener((msg: Msg, sender, reply) => {
  const handle = { 'sign-in': onSignIn, 'inline-open': onOpen, 'inline-info': onInfo, 'inline-fill': onFill }[msg?.type ?? ''] as
    | ((m: Msg, s: chrome.runtime.MessageSender) => Promise<unknown>)
    | undefined;
  if (!handle) return;
  handle(msg, sender).then(reply, (e: Error) => reply({ error: e.message }));
  return true;
});

// Google sign-in runs here, not in the popup: the popup closes as soon as the sign-in window takes focus.
async function onSignIn() {
  try {
    await signIn();
    await chrome.storage.session.remove(SIGN_IN_ERROR);
    return { ok: true };
  } catch (e) {
    // closing the sign-in window ends up here too — e.g. when it got stuck on the web app
    const msg = (e as Error).message;
    const error = /did not approve|closed|cancel/i.test(msg) ? 'Cửa sổ đăng nhập đã đóng trước khi quay lại extension' : msg;
    await chrome.storage.session.set({ [SIGN_IN_ERROR]: error });
    return { error };
  }
}

async function signIn() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    // the popup's client refreshes the token; two refreshing at once would race
    auth: { storage: sessionStore, storageKey: AUTH_KEY, flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: chrome.identity.getRedirectURL(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  const back = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  const params = new URL(back ?? 'about:blank').searchParams;
  const code = params.get('code');
  if (!code) throw new Error(params.get('error_description') ?? 'Chưa đăng nhập xong');
  const { error: failed } = await sb.auth.exchangeCodeForSession(code);
  if (failed) throw failed;
}

// ── inline menu ────────────────────────────────────────────────────────────
// Each menu gets a one-off token naming the tab and frame that opened it. The menu frame can only fill that frame,
// and only from inside that same tab — a page embedding the menu by itself has no valid token.

interface MenuTicket {
  tabId: number;
  frameId: number;
  host: string | null;
  at: number;
}
const TICKET = 'wpt-menu:';
const TICKET_TTL = 30 * 60_000;

async function onOpen(_m: Msg, s: chrome.runtime.MessageSender): Promise<OpenReply> {
  if (s.tab?.id == null || s.frameId == null || !s.url || !/^https?:/.test(s.url)) return {};
  const mode = await getInlineMode();
  if (mode === 'off') return {};
  const host = hostOf(s.url);
  if (mode === 'matching') {
    // known only once the list has loaded in this browser session (popup or menu)
    const sites = (await chrome.storage.session.get(SITES_KEY))[SITES_KEY] as SitesCache | undefined;
    if (!host || !sites?.hosts.some((h) => host === h || host.endsWith('.' + h))) return {};
  }
  const token = crypto.randomUUID();
  const ticket: MenuTicket = { tabId: s.tab.id, frameId: s.frameId, host, at: Date.now() };
  await chrome.storage.session.set({ [TICKET + token]: ticket });
  prune();
  return { token };
}

async function ticketFor(token: string, s: chrome.runtime.MessageSender) {
  const t = (await chrome.storage.session.get(TICKET + token))[TICKET + token] as MenuTicket | undefined;
  // the menu frame lives in the tab that asked for it
  if (!t || s.tab?.id !== t.tabId || Date.now() - t.at > TICKET_TTL) throw new Error('Menu không hợp lệ — bấm lại vào ô đăng nhập');
  return t;
}

async function onInfo(m: Msg, s: chrome.runtime.MessageSender): Promise<InfoReply> {
  const t = await ticketFor((m as InfoAsk).token, s);
  return { host: t.host };
}

async function onFill(m: Msg, s: chrome.runtime.MessageSender): Promise<FillReply> {
  const ask = m as FillAsk;
  const t = await ticketFor(ask.token, s);
  await chrome.storage.session.remove(TICKET + ask.token);
  const msg: ContentFill = { type: 'fill', username: ask.username, password: ask.password, otp: ask.otp };
  return chrome.tabs.sendMessage(t.tabId, msg, { frameId: t.frameId });
}

/** drop tickets of menus long gone */
async function prune() {
  const all = await chrome.storage.session.get(null);
  const old = Object.entries(all)
    .filter(([k, v]) => k.startsWith(TICKET) && Date.now() - (v as MenuTicket).at > TICKET_TTL)
    .map(([k]) => k);
  if (old.length) await chrome.storage.session.remove(old);
}
