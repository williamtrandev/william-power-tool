import { useCallback, useEffect, useState } from 'react';
import type { User } from '../../src/lib/backend/types';
import type { TeamAccount } from '../../src/lib/otp';
import { backend } from './backend';
import { SITES_KEY, type SitesCache } from './config';
import { hostOf } from './site';

export type Phase = 'loading' | 'no-config' | 'signed-out' | 'waiting' | 'ready' | 'error';
export type CopyWhat = 'user' | 'pass' | 'otp';

/** sign-in state and the accounts this user may use — shared by the toolbar popup and the inline menu */
export function useVault() {
  const [phase, setPhase] = useState<Phase>(backend ? 'loading' : 'no-config');
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<TeamAccount[]>([]);

  const load = useCallback(async () => {
    if (!backend) return;
    try {
      const u = await backend.session();
      setUser(u);
      if (!u) return setPhase('signed-out');
      const me = await backend.me();
      if (me?.status !== 'approved') return setPhase('waiting');
      const list = await backend.acctList();
      setAccounts(list);
      const cache: SitesCache = { hosts: [...new Set(list.map((a) => hostOf(a.url)).filter((h): h is string => !!h))], at: Date.now() };
      chrome.storage.session.set({ [SITES_KEY]: cache });
      setPhase('ready');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const reload = () => {
    setPhase('loading');
    load();
  };
  const signOut = async () => {
    await backend?.signOut();
    await chrome.storage.session.remove(SITES_KEY);
    setUser(null);
    setAccounts([]);
    setPhase('signed-out');
  };
  return { phase, error, user, accounts, reload, signOut };
}

/** password and current OTP, fetched only when filling — each fetch is logged by the database */
export async function secretsFor(a: TeamAccount) {
  const password = a.has_password ? await backend!.acctPassword(a.id) : null;
  const otp = a.has_otp ? (await backend!.acctCode(a.id)).code : null;
  return { password, otp };
}

/** copies one value of the account; returns the toast text */
export async function copyValue(a: TeamAccount, what: CopyWhat) {
  const v = what === 'user' ? a.username : what === 'pass' ? await backend!.acctPassword(a.id) : (await backend!.acctCode(a.id)).code;
  await navigator.clipboard.writeText(v);
  return { user: 'Đã copy tên đăng nhập', pass: 'Đã copy mật khẩu', otp: `Đã copy mã OTP ${v}` }[what];
}
