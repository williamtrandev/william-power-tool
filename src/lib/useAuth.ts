import { useCallback, useEffect, useState } from 'react';
import type { Backend, Member, User } from './backend';

export type AuthState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
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
    } catch (e) {
      setError((e as Error).message);
    }
  }, [backend, userId, signedInAt]);

  // token refreshes fire auth events with the same user — only reload on a different account
  useEffect(() => {
    setMember(undefined);
    setError(null);
    refresh();
  }, [refresh]);

  // pick up approval / blocking without a reload: on focus, and every 20 s while waiting
  const status = member?.status;
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => refresh();
    addEventListener('focus', onFocus);
    const t = status === 'pending' ? setInterval(refresh, 20000) : undefined;
    return () => {
      removeEventListener('focus', onFocus);
      clearInterval(t);
    };
  }, [userId, status, refresh]);

  let state: AuthState;
  if (!backend) state = { kind: 'unconfigured' };
  else if (user === undefined) state = { kind: 'loading' };
  else if (!user) state = { kind: 'signed-out' };
  else if (error) state = { kind: 'error', message: error };
  else if (member === undefined) state = { kind: 'loading' };
  else if (!member) state = { kind: 'error', message: 'Không tìm thấy thông tin tài khoản — nhờ admin kiểm tra' };
  else state = { kind: member.status === 'approved' ? 'ready' : member.status, user, member };
  return { state, refresh };
}
