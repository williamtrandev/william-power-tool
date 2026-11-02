import { useCallback, useEffect, useState } from 'react';
import { isNetworkError, type Backend, type Member, type User } from './backend';

export type AuthState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  /** the server cannot be reached (offline, VPN…) and we do not know the access status yet */
  | { kind: 'offline' }
  | { kind: 'pending' | 'blocked' | 'ready'; user: User; member: Member };

/** A sign-in lasts this long; after that Google is asked again. */
export const SESSION_DAYS = 30;
const expired = (u: User) => !!u.signedInAt && Date.now() - new Date(u.signedInAt).getTime() > SESSION_DAYS * 86400000;

/** Who is signed in and whether an admin has let them in. */
export function useAuth(backend: Backend | null) {
  // undefined = still reading the saved session
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // the last check could not reach the server; once the account is known the app keeps running
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!backend) return;
    backend.session().then(setUser, () => setUser(null));
    return backend.onAuthChange(setUser);
  }, [backend]);

  const userId = user?.id;
  const signedInAt = user?.signedInAt;
  const refresh = useCallback(async () => {
    if (!backend || !userId) return;
    // the Supabase session renews itself forever; cap it at SESSION_DAYS since the last real sign-in
    if (expired({ id: userId, email: '', signedInAt })) {
      await backend.signOut();
      return;
    }
    try {
      setMember(await backend.me());
      setError(null);
      setOffline(false);
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      else setError((e as Error).message);
    }
  }, [backend, userId, signedInAt]);

  // token refreshes fire auth events with the same user — only reload on a different account
  useEffect(() => {
    setMember(undefined);
    setError(null);
    setOffline(false);
    refresh();
  }, [refresh]);

  // pick up approval / blocking without a reload: on focus, and every 20 s while waiting
  // and retry on its own when the network comes back (event) or every 15 s while unreachable (VPN off)
  const status = member?.status;
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => refresh();
    addEventListener('focus', onFocus);
    addEventListener('online', onFocus);
    const t = offline ? setInterval(refresh, 15000) : status === 'pending' ? setInterval(refresh, 20000) : undefined;
    return () => {
      removeEventListener('focus', onFocus);
      removeEventListener('online', onFocus);
      clearInterval(t);
    };
  }, [userId, status, offline, refresh]);

  let state: AuthState;
  if (!backend) state = { kind: 'unconfigured' };
  else if (user === undefined) state = { kind: 'loading' };
  else if (!user) state = { kind: 'signed-out' };
  else if (error) state = { kind: 'error', message: error };
  else if (member === undefined) state = offline ? { kind: 'offline' } : { kind: 'loading' };
  else if (!member) state = { kind: 'error', message: 'Không tìm thấy thông tin tài khoản — nhờ admin kiểm tra' };
  else state = { kind: member.status === 'approved' ? 'ready' : member.status, user, member };
  // offline while already in the app: keep the app, the shell shows a banner instead
  return { state, refresh, offline: offline && !!member };
}
