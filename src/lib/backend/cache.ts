import { secondsLeft, type AheadCodes, type OtpCode } from '../otp';
import { isNetworkError, OfflineError } from './errors';
import type { Backend } from './types';

/** where the saved reads live: localStorage on the web, chrome.storage.session in the extension */
export interface CacheStore {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

// the reads kept for when the server cannot be reached — never passwords or OTP codes
const READS = ['me', 'members', 'list', 'history', 'acctList', 'acctMembers', 'acctActivity', 'directory', 'otPeople', 'otList', 'otHistory'] as const;
type Read = (typeof READS)[number];
/** every key written, so signing out can remove them all */
const INDEX = 'wpt-cache-keys';
/** when a read last found no server — kept in the store, so a freshly opened extension popup knows too */
const OFFLINE_AT = 'wpt-cache-offline';
/** after that, other reads go straight to saved data for this long instead of each waiting out the timeout.
 * `me` always asks the server: it is how the app (and "Thử lại") finds out the connection is back */
const SKIP_FOR = 20_000;
/** OTP codes are fetched 4 hours ahead; fetch again once less than this is left… */
const KEEP_AHEAD = 3.5 * 3600_000;
/** …looking at most this often */
const CHECK_EVERY = 5 * 60_000;

/**
 * Keeps the last answer of each read on this device, per user. When the server cannot be reached (offline, a VPN
 * blocking it) the read returns that saved answer instead of failing, and `onConnection` says the app is on old data.
 * Writes, and passwords, still need the server. OTP codes are the server's codes of the next hours, fetched ahead
 * while it answers (never the secret): offline, the code of the current 30 s is picked from them.
 */
export function withCache(b: Backend, store: CacheStore): Backend {
  let uid: string | null = null;
  let offline = false;
  const listeners = new Set<(offline: boolean, savedAt?: number) => void>();
  const emit = (off: boolean, savedAt?: number) => {
    offline = off;
    listeners.forEach((l) => l(off, savedAt));
  };

  const parse = async <T>(key: string): Promise<T | null> => {
    try {
      const raw = await store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  // one at a time: reads running together (Promise.all) would each rewrite the index and lose the others' keys
  let writing = Promise.resolve();
  const save = (key: string, v: unknown) =>
    (writing = writing.then(async () => {
      try {
        await store.setItem(key, JSON.stringify({ at: Date.now(), v }));
        const keys = (await parse<string[]>(INDEX)) ?? [];
        if (!keys.includes(key)) await store.setItem(INDEX, JSON.stringify([...keys, key]));
      } catch {
        /* storage full or unavailable: go on without it */
      }
    }));
  const clear = async () => {
    for (const key of (await parse<string[]>(INDEX)) ?? []) await store.removeItem(key);
    await store.removeItem(INDEX);
    await store.removeItem(OFFLINE_AT);
  };

  // a page that never asked for the session (the extension's OTP-only frame) still gets this user's saved data
  const who = async () => (uid ??= (await b.session().catch(() => null))?.id ?? null);
  const recently = (offlineAt: number | null) => !!offlineAt && Date.now() - offlineAt < SKIP_FOR;

  const cached = <K extends Read>(name: K) =>
    (async (...args: unknown[]) => {
      const fn = b[name] as (...a: unknown[]) => Promise<unknown>;
      await who();
      const key = `wpt-cache:${uid}:${name}:${JSON.stringify(args)}`;
      const saved = () => parse<{ at: number; v: unknown }>(key);
      const offlineAt = await parse<number>(OFFLINE_AT);
      if (uid && name !== 'me' && recently(offlineAt)) {
        const hit = await saved();
        if (hit) {
          emit(true, hit.at);
          return hit.v;
        }
      }
      try {
        const v = await fn(...args);
        if (uid) save(key, v);
        if (offlineAt) await store.removeItem(OFFLINE_AT);
        emit(false);
        return v;
      } catch (e) {
        if (!uid || !isNetworkError(e)) throw e;
        await store.setItem(OFFLINE_AT, String(Date.now()));
        const hit = await saved();
        if (!hit) throw e;
        emit(true, hit.at);
        return hit.v;
      }
    }) as Backend[K];

  const out: Backend = {
    ...b,
    async session() {
      const u = await b.session();
      uid = u?.id ?? null;
      return u;
    },
    onAuthChange(cb) {
      return b.onAuthChange((u) => {
        uid = u?.id ?? null;
        cb(u);
      });
    },
    async signOut() {
      await b.signOut();
      await clear();
    },
    onConnection(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  for (const name of READS) Object.assign(out, { [name]: cached(name) });

  // ── OTP codes ahead ──
  const aheadKey = () => `wpt-cache:${uid}:ahead`;
  const ahead = () => parse<{ at: number; v: Record<string, AheadCodes> }>(aheadKey());
  const codeOf = (a: AheadCodes | undefined, now = Date.now()): OtpCode | null => {
    const i = a ? Math.floor(now / 1000 / a.period) - a.start_step : -1;
    if (!a || i < 0 || i >= a.codes.length) return null;
    return { code: a.codes[i], next_code: a.codes[i + 1] ?? a.codes[i], remaining: secondsLeft(a.period, now), period: a.period };
  };
  let checkedAt = 0;
  /** fetches the codes ahead of the accounts running short. `all`: these are all the accounts with an OTP — the
   * saved codes of the others (no longer shared with this user) are dropped */
  const topUp = async (ids: string[], all = false) => {
    if (!uid || offline || !ids.length || Date.now() - checkedAt < CHECK_EVERY) return;
    checkedAt = Date.now();
    const key = aheadKey();
    const saved = (await ahead())?.v ?? {};
    const short = ids.filter((id) => !saved[id] || (saved[id].start_step + saved[id].codes.length) * saved[id].period * 1000 - Date.now() < KEEP_AHEAD);
    if (!short.length) return;
    try {
      const fresh = await b.acctCodesAhead(short);
      const keep = all ? Object.fromEntries(ids.filter((id) => saved[id]).map((id) => [id, saved[id]])) : saved;
      for (const a of fresh) keep[a.id] = a;
      // not if someone else signed in meanwhile
      if (key === aheadKey()) save(key, keep);
    } catch {
      /* tried again on a later check */
    }
  };
  /** the server's codes, or — when it cannot be reached — the ones fetched ahead */
  const codes = async <T>(live: () => Promise<T>, local: (saved: Record<string, AheadCodes>) => T | null): Promise<T> => {
    await who();
    const offlineAt = await parse<number>(OFFLINE_AT);
    let err: unknown = null;
    if (!uid || !recently(offlineAt))
      try {
        const v = await live();
        emit(false);
        return v;
      } catch (e) {
        if (!uid || !isNetworkError(e)) throw e;
        await store.setItem(OFFLINE_AT, String(Date.now()));
        err = e;
      }
    const saved = await ahead();
    const v = saved && local(saved.v);
    if (!v) throw err ?? new OfflineError();
    emit(true, saved.at);
    return v;
  };

  const acctList = out.acctList;
  return Object.assign(out, {
    async acctList() {
      const list = await acctList();
      topUp(list.filter((a) => a.has_otp).map((a) => a.id), true);
      return list;
    },
    // no saved copy: passwords stay on the server. Just don't wait out the timeout again right after one
    acctPassword: (id: string) => codes(() => b.acctPassword(id), () => null),
    acctCode: (id: string) => codes(() => b.acctCode(id), (saved) => codeOf(saved[id])),
    async acctCodes(ids: string[]) {
      const rows = await codes(
        () => b.acctCodes(ids),
        (saved) => {
          const found = ids.flatMap((id) => {
            const c = codeOf(saved[id]);
            return c ? [{ id, ...c }] : [];
          });
          return found.length ? found : null;
        },
      );
      if (!offline) topUp(ids);
      return rows;
    },
  } satisfies Partial<Backend>);
}
