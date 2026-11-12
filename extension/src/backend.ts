import { withCache } from '../../src/lib/backend/cache';
import { demoBackend } from '../../src/lib/backend/demo';
import { supabaseBackend } from '../../src/lib/backend/supabase';
import type { Backend } from '../../src/lib/backend/types';
import { IS_DEMO, SUPABASE_KEY, SUPABASE_URL, sessionStore } from './config';

/** the app's own backend: the same RPCs, access rules and access log as the Accounts tab. The account list is kept
 * alongside the session, so the menu still lists them when the server cannot be reached (VPN) */
const raw: Backend | null = IS_DEMO ? demoBackend() : SUPABASE_URL && SUPABASE_KEY ? supabaseBackend(SUPABASE_URL, SUPABASE_KEY, sessionStore) : null;
export const backend = raw && withCache(raw, sessionStore);

export async function signIn() {
  if (IS_DEMO) return backend!.signInAs!('qc@demo');
  const r = (await chrome.runtime.sendMessage({ type: 'sign-in' })) as { error?: string } | undefined;
  if (r?.error) throw new Error(r.error);
}
