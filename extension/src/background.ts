import { createClient } from '@supabase/supabase-js';
import { AUTH_KEY, SUPABASE_KEY, SUPABASE_URL, sessionStore } from './config';

// Google sign-in runs here, not in the popup: the popup closes as soon as the sign-in window takes focus.
chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, reply) => {
  if (msg?.type !== 'sign-in') return;
  signIn().then(
    () => reply({ ok: true }),
    (e: Error) => reply({ error: e.message }),
  );
  return true;
});

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
