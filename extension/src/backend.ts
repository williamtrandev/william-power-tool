import { demoBackend } from '../../src/lib/backend/demo';
import { supabaseBackend } from '../../src/lib/backend/supabase';
import type { Backend } from '../../src/lib/backend/types';
import { IS_DEMO, SUPABASE_KEY, SUPABASE_URL, sessionStore } from './config';

/** the app's own backend: the same RPCs, access rules and access log as the Accounts tab */
export const backend: Backend | null = IS_DEMO ? demoBackend() : SUPABASE_URL && SUPABASE_KEY ? supabaseBackend(SUPABASE_URL, SUPABASE_KEY, sessionStore) : null;

export async function signIn() {
  if (IS_DEMO) return backend!.signInAs!('qc@demo');
  const r = (await chrome.runtime.sendMessage({ type: 'sign-in' })) as { error?: string } | undefined;
  if (r?.error) throw new Error(r.error);
}
