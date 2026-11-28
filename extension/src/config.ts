import type { SupportedStorage } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
export const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
/** built with VITE_SUPABASE_URL=demo: the app's fake accounts, for trying the extension out */
export const IS_DEMO = SUPABASE_URL === 'demo';
export const AUTH_KEY = 'wpt-auth';
/** why the last Google sign-in failed — the popup is usually closed by then, so it reads this when reopened */
export const SIGN_IN_ERROR = 'wpt-sign-in-error';

/** the session and the saved account list live in chrome.storage.local: shared by the popup and the background
 * worker, and kept when the browser closes — Chrome opened on the VPN, with no way to the server, still lists the
 * accounts and fills OTPs. Passwords are never saved; signing out removes the rest */
export const vaultStore: SupportedStorage = {
  getItem: async (k) => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: (k, v) => chrome.storage.local.set({ [k]: v }),
  removeItem: (k) => chrome.storage.local.remove(k),
};

/** host names of the accounts this user may use, written whenever the list loads (chrome.storage.local) — the
 * background decides from it whether a page gets the inline menu, without holding the session itself. Removed on
 * sign-out. */
export const SITES_KEY = 'wpt-sites';
export interface SitesCache {
  hosts: string[];
  at: number;
}

/** chrome.storage.local: when the inline menu opens on a login box */
export const INLINE_KEY = 'wpt-inline';
export type InlineMode = 'all' | 'matching' | 'off';
export const INLINE_DEFAULT: InlineMode = 'all';

export const getInlineMode = async (): Promise<InlineMode> => ((await chrome.storage.local.get(INLINE_KEY))[INLINE_KEY] as InlineMode | undefined) ?? INLINE_DEFAULT;
