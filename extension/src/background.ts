import { createClient } from '@supabase/supabase-js';
import { AUTH_KEY, getInlineMode, SIGN_IN_ERROR, SITES_KEY, SUPABASE_KEY, SUPABASE_URL, sessionStore, type SitesCache } from './config';
import type { ContentFill, FillAsk, FillReply, InfoAsk, InfoReply, OpenAsk, OpenReply, PendingOtp, RememberOtp, StatusAsk, WatchReply } from './messages';
import { hostOf } from './site';
import { checkForUpdate, reloadIfReplaced, setUpUpdates } from './update';

setUpUpdates();

type Msg = { type?: string };

chrome.runtime.onMessage.addListener((msg: Msg, sender, reply) => {
  const handle = { 'sign-in': onSignIn, 'inline-open': onOpen, 'inline-info': onInfo, 'inline-fill': onFill, 'otp-remember': onRemember, 'otp-watch': onWatch, 'otp-status': onStatus, 'update-check': onUpdateCheck }[msg?.type ?? ''] as
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
  /** opened by itself to put in this account's OTP */
  auto?: PendingOtp;
}
const TICKET = 'wpt-menu:';
const TICKET_TTL = 30 * 60_000;

async function onOpen(m: Msg, s: chrome.runtime.MessageSender): Promise<OpenReply> {
  if (s.tab?.id == null || s.frameId == null || !s.url || !/^https?:/.test(s.url)) return {};
  if ((m as OpenAsk).auto) {
    // used once: the next OTP box of this tab waits for a click again
    const auto = await pendingFor(s.tab.id, hostOf(s.url));
    if (!auto) return {};
    await chrome.storage.session.remove(OTP + s.tab.id);
    const token = crypto.randomUUID();
    const ticket: MenuTicket = { tabId: s.tab.id, frameId: s.frameId, host: hostOf(s.url), at: Date.now(), auto };
    await chrome.storage.session.set({ [TICKET + token]: ticket });
    return { token };
  }
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
  return { host: t.host, auto: t.auto };
}

async function onFill(m: Msg, s: chrome.runtime.MessageSender): Promise<FillReply> {
  const ask = m as FillAsk;
  const t = await ticketFor(ask.token, s);
  await chrome.storage.session.remove(TICKET + ask.token);
  const msg: ContentFill = { type: 'fill', username: ask.username, password: ask.password, otp: ask.otp, otpOnly: ask.otpOnly };
  const r = (await chrome.tabs.sendMessage(t.tabId, msg, { frameId: t.frameId })) as FillReply;
  if (ask.otpFor && !('error' in r) && !r.otp) await remember(t.tabId, ask.otpFor.accountId, ask.otpFor.username, [t.host, ask.otpFor.host]);
  return r;
}

// ── OTP on the next step ─────────────────────────────────────────────────
// A fill that left the OTP out (no OTP box yet) is remembered per tab for a short while; the content script of that
// tab puts the code in as soon as an empty OTP box shows up on the same site.

const OTP = 'wpt-otp:';
const OTP_TTL = 2 * 60_000;

async function remember(tabId: number, accountId: string, username: string, hosts: (string | null)[]) {
  const p: PendingOtp = { accountId, username, hosts: hosts.filter((h): h is string => !!h), until: Date.now() + OTP_TTL };
  await chrome.storage.session.set({ [OTP + tabId]: p });
}

async function onRemember(m: Msg, s: chrome.runtime.MessageSender) {
  const ask = m as RememberOtp;
  // only the extension's own pages (the popup) may name a tab; a content script's sender is the web page
  if (s.url?.startsWith(chrome.runtime.getURL(''))) await remember(ask.tabId, ask.accountId, ask.username, ask.hosts);
  return {};
}

async function pendingFor(tabId: number, host: string | null) {
  const p = (await chrome.storage.session.get(OTP + tabId))[OTP + tabId] as PendingOtp | undefined;
  if (!p || p.until < Date.now() || !host || !p.hosts.some((h) => host === h || host.endsWith('.' + h))) return null;
  return p;
}

async function onWatch(_m: Msg, s: chrome.runtime.MessageSender): Promise<WatchReply> {
  if (s.tab?.id == null || !s.url) return {};
  const p = await pendingFor(s.tab.id, hostOf(s.url));
  return p ? { until: p.until } : {};
}

async function onStatus(m: Msg, s: chrome.runtime.MessageSender): Promise<PendingOtp | null> {
  if (!s.url?.startsWith(chrome.runtime.getURL(''))) return null;
  const tabId = (m as StatusAsk).tabId;
  const p = (await chrome.storage.session.get(OTP + tabId))[OTP + tabId] as PendingOtp | undefined;
  return p && p.until > Date.now() ? p : null;
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(OTP + tabId));

/** drop tickets of menus long gone */
async function prune() {
  const all = await chrome.storage.session.get(null);
  const old = Object.entries(all)
    .filter(([k, v]) => k.startsWith(TICKET) && Date.now() - (v as MenuTicket).at > TICKET_TTL)
    .map(([k]) => k);
  if (old.length) await chrome.storage.session.remove(old);
}

// the popup asks on open: files already replaced → reload now, else look for a newer build
async function onUpdateCheck() {
  if (await reloadIfReplaced()) return { reloading: true };
  return { update: await checkForUpdate() };
}
