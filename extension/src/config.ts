import type { SupportedStorage } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
export const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
/** built with VITE_SUPABASE_URL=demo: the app's fake accounts, for trying the extension out */
export const IS_DEMO = SUPABASE_URL === 'demo';
export const AUTH_KEY = 'wpt-auth';

/** the session lives in chrome.storage.session: shared by the popup and the background worker, gone when the browser closes */
export const sessionStore: SupportedStorage = {
  getItem: async (k) => ((await chrome.storage.session.get(k))[k] as string | undefined) ?? null,
  setItem: (k, v) => chrome.storage.session.set({ [k]: v }),
  removeItem: (k) => chrome.storage.session.remove(k),
};
