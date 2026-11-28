import type { Command, CommandInput } from '../commands';
import { relTime } from '../format';
import { dayMonth, fmtHours, type OtEntry, type OtInput, type OtPerson, type OtPersonInput } from '../ot';
import type { AccountInput, TeamAccount } from '../otp';
import type { CacheStore } from './cache';
import { isNetworkError, OfflineError } from './errors';
import type { Backend } from './types';

/** a change made while the server could not be reached. A new row gets a local id (`local-…`) until it is synced;
 * an edit keeps `base`, the row as it was when edited, to tell whether someone else changed it meanwhile */
export type Op =
  | { kind: 'cmd.save'; id: string; input: CommandInput; base?: Command }
  | { kind: 'cmd.remove'; id: string; base?: Command }
  | { kind: 'ot.save'; id: string; input: OtInput; base?: OtEntry }
  | { kind: 'ot.delete'; id: string; base?: OtEntry }
  | { kind: 'person.save'; id: string; input: OtPersonInput; base?: OtPerson }
  | { kind: 'acct.save'; id: string; input: AccountInput; base?: TeamAccount }
  | { kind: 'acct.delete'; id: string; base?: TeamAccount };

/** `force`: write it even though the row changed meanwhile (the user chose to keep theirs) */
export type Queued = Op & { qid: string; at: number; force?: boolean };

/** a change the server did not take: someone else changed or removed the row, or it was refused */
export interface Conflict {
  op: Queued;
  /** what happened, e.g. "Người khác đã sửa lệnh này" */
  reason: string;
  /** the row as it now is on the server, when there is one */
  theirs: string | null;
}

export interface OutboxState {
  pending: Queued[];
  conflicts: Conflict[];
  syncing: boolean;
  /** the last request found no server */
  offline: boolean;
}

const LOCAL = 'local-';
export const isLocal = (id: string) => id.startsWith(LOCAL);
const newId = () => LOCAL + crypto.randomUUID();

class ConflictError extends Error {
  readonly theirs: string | null;
  constructor(message: string, theirs: string | null) {
    super(message);
    this.theirs = theirs;
  }
}

/** what the change is about, in a line: "Lệnh “Restart UAT” · sửa" */
export function describe(op: Op, people: Map<string, OtPerson> = new Map()): { title: string; action: string; detail: string } {
  const isNew = isLocal(op.id);
  switch (op.kind) {
    case 'cmd.save':
      return { title: `Lệnh “${op.input.title}”`, action: isNew ? 'thêm' : 'sửa', detail: op.input.body.slice(0, 80) };
    case 'cmd.remove':
      return { title: `Lệnh “${op.base?.title ?? '?'}”`, action: 'xoá', detail: '' };
    case 'ot.save': {
      const i = op.input;
      const who = people.get(i.person_id)?.name ?? 'người mới thêm';
      return { title: `OT ${who} · ${dayMonth(i.work_date)}${i.task ? ' · ' + i.task : ''}`, action: isNew ? 'ghi' : 'sửa', detail: `${fmtHours(i.hours)} giờ${i.note ? ' — ' + i.note : ''}` };
    }
    case 'ot.delete': {
      const b = op.base;
      return { title: b ? `OT ${people.get(b.person_id)?.name ?? '?'} · ${dayMonth(b.work_date)}${b.task ? ' · ' + b.task : ''}` : 'Giờ OT', action: 'xoá', detail: b ? `${fmtHours(b.hours)} giờ` : '' };
    }
    case 'person.save':
      return { title: `Người OT “${op.input.name}”`, action: isNew ? 'thêm' : 'sửa', detail: op.input.full_name };
    case 'acct.save':
      return { title: `Tài khoản ${[op.input.system, op.input.env].filter(Boolean).join(' ')} · ${op.input.username}`, action: isNew ? 'thêm' : 'sửa', detail: op.input.url };
    case 'acct.delete':
      return { title: `Tài khoản ${op.base ? [op.base.system, op.base.env].filter(Boolean).join(' ') + ' · ' + op.base.username : '?'}`, action: 'xoá', detail: '' };
  }
}

const sameOtPerson = (a: OtPerson, b: OtPerson) => a.name === b.name && a.full_name === b.full_name && a.email === b.email && a.active === b.active;

/**
 * Adds, edits and deletes in the Commands, Accounts and OT tabs keep working while the server cannot be reached:
 * the change is queued on this device (per user, kept across reloads and sign-outs), every read shows it on top of
 * what the server (or the saved copy) says, and it is sent as soon as a read reaches the server again.
 *
 * An edit or delete is checked first: when someone else changed or removed that row meanwhile, it is not written but
 * set aside as a conflict for the user to keep or drop. Changing a password or an OTP secret, deleting a person and
 * admin actions still need the server.
 */
export function withOutbox(b: Backend, store: CacheStore): Backend {
  let uid: string | null = null;
  let email = '';
  let queue: Queued[] = [];
  let conflicts: Conflict[] = [];
  /** local id → the server's id, once synced: a tab may still hold the local one */
  let ids: Record<string, string> = {};
  let syncing = false;
  let offline = false;
  /** the server's rows as last read (before the queue is laid over them): the base of an edit */
  const known = new Map<string, unknown>();
  const people = new Map<string, OtPerson>();

  const listeners = new Set<(s: OutboxState) => void>();
  const synced = new Set<() => void>();
  const state = (): OutboxState => ({ pending: queue, conflicts, syncing, offline });
  const emit = () => listeners.forEach((l) => l(state()));
  const setOffline = (v: boolean) => {
    if (v === offline) return;
    offline = v;
    emit();
  };

  const key = () => `wpt-outbox:${uid}`;
  const persist = async () => {
    if (!uid) return;
    try {
      await store.setItem(key(), JSON.stringify({ queue, conflicts, ids }));
    } catch {
      /* storage full: the queue still lives until the page closes */
    }
  };
  let loaded: Promise<void> | null = null;
  const load = (u: { id: string; email: string } | null) => {
    if (u?.id === uid && loaded) return loaded;
    uid = u?.id ?? null;
    email = u?.email ?? '';
    queue = [];
    conflicts = [];
    ids = {};
    known.clear();
    return (loaded = (async () => {
      if (!uid) return emit();
      try {
        const raw = await store.getItem(key());
        if (raw) ({ queue = [], conflicts = [], ids = {} } = JSON.parse(raw) as { queue?: Queued[]; conflicts?: Conflict[]; ids?: Record<string, string> });
      } catch {
        /* unreadable: start empty */
      }
      emit();
      if (queue.length) void sync();
    })());
  };
  const ready = async () => {
    if (!loaded) load(await b.session().catch(() => null));
    await loaded;
  };
  const real = (id: string) => ids[id] ?? id;

  // ── queueing ──
  /** adds a change, folded into one already waiting for the same row: one row, one queued change */
  const enqueue = async (op: Op) => {
    await ready();
    const i = queue.findIndex((q) => q.id === op.id && q.kind.split('.')[0] === op.kind.split('.')[0]);
    const prev = i >= 0 ? queue[i] : null;
    const removing = op.kind.endsWith('delete') || op.kind.endsWith('remove');
    if (prev && removing && isLocal(op.id)) queue.splice(i, 1);
    else if (prev) queue[i] = { ...op, base: prev.base, qid: prev.qid, at: Date.now() } as Queued;
    else queue.push({ ...op, base: op.base, qid: crypto.randomUUID(), at: Date.now() } as Queued);
    await persist();
    emit();
  };
  /** the server's answer, or — offline — the change queued and `local` returned in its place */
  const write = async <T>(live: () => Promise<T>, op: () => Op, local: (op: Op) => T): Promise<T> => {
    await ready();
    if (!offline && !queue.length) {
      try {
        return await live();
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        setOffline(true);
      }
    }
    const o = op();
    await enqueue(o);
    if (!offline) void sync();
    return local(o);
  };

  // ── laying the queue over a read ──
  const stamp = (at: number) => new Date(at).toISOString();
  const overCommands = (list: Command[]) => {
    list.forEach((c) => known.set(c.id, c));
    let out = list;
    for (const q of queue)
      if (q.kind === 'cmd.remove') out = out.filter((c) => c.id !== q.id);
      else if (q.kind === 'cmd.save') {
        const was = out.find((c) => c.id === q.id) ?? q.base;
        const row: Command = {
          uses: 0,
          owner_id: uid,
          created_by: uid,
          created_at: stamp(q.at),
          ...was,
          ...q.input,
          is_private: q.input.is_private ?? was?.is_private ?? false,
          id: q.id,
          updated_by: uid,
          updated_at: stamp(q.at),
        };
        out = was && out.some((c) => c.id === q.id) ? out.map((c) => (c.id === q.id ? row : c)) : [row, ...out];
      }
    return out;
  };
  const overOt = (entries: OtEntry[], from: string, to: string) => {
    entries.forEach((e) => known.set(e.id, e));
    let out = entries;
    for (const q of queue) {
      if (q.kind !== 'ot.save' && q.kind !== 'ot.delete') continue;
      out = out.filter((e) => e.id !== q.id);
      if (q.kind === 'ot.save' && q.input.work_date >= from && q.input.work_date <= to) out = [...out, { ...q.input, id: q.id, updated_by: email, updated_at: stamp(q.at) }];
    }
    return out;
  };
  const overPeople = (list: OtPerson[]) => {
    list.forEach((p) => known.set(p.id, p));
    let out = list;
    for (const q of queue)
      if (q.kind === 'person.save') {
        const row = { ...q.input, id: q.id };
        out = out.some((p) => p.id === q.id) ? out.map((p) => (p.id === q.id ? row : p)) : [...out, row];
      }
    out.forEach((p) => people.set(p.id, p));
    return out;
  };
  const overAccounts = (list: TeamAccount[]) => {
    list.forEach((a) => known.set(a.id, a));
    let out = list;
    for (const q of queue)
      if (q.kind === 'acct.delete') out = out.filter((a) => a.id !== q.id);
      else if (q.kind === 'acct.save') {
        const was = out.find((a) => a.id === q.id) ?? q.base;
        const i = q.input;
        const row: TeamAccount = {
          has_password: false,
          has_otp: false,
          owner_id: uid,
          created_by: uid,
          ...was,
          system: i.system,
          env: i.env,
          username: i.username,
          url: i.url,
          note: i.note,
          otp_digits: i.otp_digits,
          otp_period: i.otp_period,
          everyone: i.everyone,
          is_private: i.is_private,
          can_manage: true,
          id: q.id,
          updated_at: stamp(q.at),
        };
        out = out.some((a) => a.id === q.id) ? out.map((a) => (a.id === q.id ? row : a)) : [...out, row];
      }
    return out;
  };

  // ── sending ──
  /** sends one change; throws ConflictError when the row moved on meanwhile (unless forced) */
  const send = async (q: Queued) => {
    const force = !!q.force;
    const check = <T>(cur: T | undefined, base: T | undefined, same: (a: T, b: T) => boolean, theirs: (r: T) => string, what: string) => {
      if (force || !base) return;
      if (!cur) throw new ConflictError(`${what} đã bị người khác xoá`, null);
      if (!same(cur, base)) throw new ConflictError(`Người khác đã sửa ${what} trong lúc bạn offline`, theirs(cur));
    };
    const at = (r: { updated_at: string }) => ` · sửa ${relTime(r.updated_at)}`;
    switch (q.kind) {
      case 'cmd.save': {
        if (isLocal(q.id)) return (ids[q.id] = (await b.create(q.input)).id);
        const cur = (await b.list()).find((c) => c.id === q.id);
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (c) => `“${c.title}”${at(c)}`, 'lệnh này');
        if (!cur && force) return (ids[q.id] = (await b.create(q.input)).id);
        return b.update(q.id, q.input);
      }
      case 'cmd.remove': {
        const cur = (await b.list()).find((c) => c.id === q.id);
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (c) => `“${c.title}”${at(c)}`, 'lệnh này');
        return cur && b.remove(q.id);
      }
      case 'ot.save': {
        if (isLocal(q.id)) {
          const dupe = force && (await b.otList(q.input.work_date, q.input.work_date)).entries.find((e) => e.person_id === q.input.person_id && e.task === q.input.task);
          try {
            return (ids[q.id] = (await b.otSave(dupe ? dupe.id : null, q.input)).id);
          } catch (e) {
            if (isNetworkError(e) || !/đã có OT/.test((e as Error).message)) throw e;
            const cur = (await b.otList(q.input.work_date, q.input.work_date)).entries.find((x) => x.person_id === q.input.person_id && x.task === q.input.task);
            throw new ConflictError('Người khác đã ghi OT nhóm này ngày đó cho người này', cur ? `${fmtHours(cur.hours)} giờ${cur.note ? ' — ' + cur.note : ''} · ${cur.updated_by ?? ''}` : null);
          }
        }
        const d = q.base?.work_date ?? q.input.work_date;
        const cur = (await b.otList(d, d)).entries.find((e) => e.id === q.id);
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (e) => `${fmtHours(e.hours)} giờ${e.note ? ' — ' + e.note : ''} · ${e.updated_by ?? ''}${at(e)}`, 'giờ OT này');
        if (!cur && force) return (ids[q.id] = (await b.otSave(null, q.input)).id);
        return b.otSave(q.id, q.input);
      }
      case 'ot.delete': {
        const d = q.base?.work_date;
        const cur = d ? (await b.otList(d, d)).entries.find((e) => e.id === q.id) : undefined;
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (e) => `${fmtHours(e.hours)} giờ${e.note ? ' — ' + e.note : ''} · ${e.updated_by ?? ''}${at(e)}`, 'giờ OT này');
        return (cur || !d) && b.otDelete(q.id);
      }
      case 'person.save': {
        if (isLocal(q.id)) return (ids[q.id] = (await b.otPersonSave(null, q.input)).id);
        const cur = (await b.otPeople()).find((p) => p.id === q.id);
        check(cur, q.base, sameOtPerson, (p) => `${p.name}${p.full_name ? ' (' + p.full_name + ')' : ''}${p.active ? '' : ' · đã ẩn'}`, 'người này');
        if (!cur && force) return (ids[q.id] = (await b.otPersonSave(null, q.input)).id);
        return b.otPersonSave(q.id, q.input);
      }
      case 'acct.save': {
        if (isLocal(q.id)) return (ids[q.id] = await b.acctSave(null, q.input));
        const cur = (await b.acctList()).find((a) => a.id === q.id);
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (a) => `${a.username}${a.url ? ' · ' + a.url : ''}${at(a)}`, 'tài khoản này');
        if (!cur && force) return (ids[q.id] = await b.acctSave(null, q.input));
        return b.acctSave(q.id, q.input);
      }
      case 'acct.delete': {
        const cur = (await b.acctList()).find((a) => a.id === q.id);
        check(cur, q.base, (x, y) => x.updated_at === y.updated_at, (a) => `${a.username}${at(a)}`, 'tài khoản này');
        return cur && b.acctDelete(q.id);
      }
    }
  };

  /** sends the queue in order; stops at the first change the network did not carry */
  const sync = async () => {
    await ready();
    if (syncing || !uid || !queue.length) return;
    syncing = true;
    emit();
    let sent = 0;
    try {
      while (queue.length) {
        // a later change may point at a row added offline (OT of a person added offline): give it the server's id
        const q = JSON.parse(Object.entries(ids).reduce((s, [l, r]) => s.replaceAll(l, r), JSON.stringify(queue[0]))) as Queued;
        try {
          await send(q);
          sent++;
        } catch (e) {
          if (isNetworkError(e)) {
            setOffline(true);
            break;
          }
          conflicts = [...conflicts, { op: q, reason: (e as Error).message, theirs: e instanceof ConflictError ? e.theirs : null }];
        }
        queue = queue.slice(1);
        await persist();
        emit();
      }
    } finally {
      syncing = false;
      emit();
      if (sent) synced.forEach((f) => f());
    }
  };

  // any read that reaches the server says the connection is back: send what waits
  b.onConnection?.((off) => {
    setOffline(off);
    if (!off && queue.length) void sync();
  });
  if (typeof window !== 'undefined') addEventListener('online', () => queue.length && void sync());

  const out: Backend = {
    ...b,
    async session() {
      const u = await b.session();
      await load(u);
      return u;
    },
    onAuthChange(cb) {
      return b.onAuthChange((u) => {
        void load(u);
        cb(u);
      });
    },
    onOutbox(cb) {
      listeners.add(cb);
      cb(state());
      return () => listeners.delete(cb);
    },
    onSynced(cb) {
      synced.add(cb);
      return () => synced.delete(cb);
    },
    outboxSync: sync,
    async outboxResolve(qid, keep) {
      const c = conflicts.find((x) => x.op.qid === qid);
      if (!c) return;
      conflicts = conflicts.filter((x) => x !== c);
      if (keep) queue = [...queue, { ...c.op, force: true }];
      await persist();
      emit();
      if (keep) await sync();
      else synced.forEach((f) => f());
    },
    outboxPeople: () => people,

    // ── reads, with the queue laid over them ──
    async list() {
      await ready();
      return overCommands(await b.list());
    },
    async history(id) {
      return isLocal(real(id)) ? [] : b.history(real(id));
    },
    async otList(from, to) {
      await ready();
      const d = await b.otList(from, to);
      return { ...d, entries: overOt(d.entries, from, to) };
    },
    async otPeople() {
      await ready();
      return overPeople(await b.otPeople());
    },
    async acctList() {
      await ready();
      return overAccounts(await b.acctList());
    },
    async acctMembers(id) {
      await ready();
      const q = queue.find((x) => x.kind === 'acct.save' && x.id === real(id));
      if (q?.kind === 'acct.save') return q.input.members;
      return b.acctMembers(real(id));
    },
    async acctPassword(id) {
      if (isLocal(real(id))) throw new OfflineError();
      return b.acctPassword(real(id));
    },
    async acctCode(id) {
      if (isLocal(real(id))) throw new OfflineError();
      return b.acctCode(real(id));
    },
    async acctCodes(list) {
      return b.acctCodes(list.map(real).filter((id) => !isLocal(id)));
    },
    async bump(id) {
      if (!offline && !isLocal(real(id))) await b.bump(real(id)).catch(() => {});
    },

    // ── writes: the server, or the queue ──
    create: (input) =>
      write(
        () => b.create(input),
        () => ({ kind: 'cmd.save', id: newId(), input }),
        (op) => overCommands([]).find((c) => c.id === op.id)!,
      ),
    update: (id, input) =>
      write(
        () => b.update(real(id), input),
        () => ({ kind: 'cmd.save', id: real(id), input, base: known.get(real(id)) as Command | undefined }),
        (op) => overCommands([]).find((c) => c.id === op.id)!,
      ),
    remove: (id) =>
      write(
        () => b.remove(real(id)),
        () => ({ kind: 'cmd.remove', id: real(id), base: known.get(real(id)) as Command | undefined }),
        () => undefined,
      ),
    otSave: (id, input) =>
      write(
        () => b.otSave(id && real(id), input),
        () => ({ kind: 'ot.save', id: id ? real(id) : newId(), input, base: id ? (known.get(real(id)) as OtEntry | undefined) : undefined }),
        (op) => ({ ...input, id: op.id, updated_by: email, updated_at: new Date().toISOString() }),
      ),
    async otSaveMany(rows, overwrite) {
      await ready();
      if (!offline && !queue.length)
        try {
          return await b.otSaveMany(rows, overwrite);
        } catch (e) {
          if (!isNetworkError(e)) throw e;
          setOffline(true);
        }
      // offline: one queued change per person, skipping or overwriting what this device knows of that day
      let n = 0;
      for (const r of rows) {
        const have = (await out.otList(r.work_date, r.work_date)).entries.find((e) => e.person_id === r.person_id && e.task === r.task);
        if (have && !overwrite) continue;
        await enqueue({ kind: 'ot.save', id: have ? have.id : newId(), input: r, base: have && !isLocal(have.id) ? (known.get(have.id) as OtEntry | undefined) : undefined });
        n++;
      }
      return n;
    },
    otDelete: (id) =>
      write(
        () => b.otDelete(real(id)),
        () => ({ kind: 'ot.delete', id: real(id), base: known.get(real(id)) as OtEntry | undefined }),
        () => undefined,
      ),
    otPersonSave: (id, input) =>
      write(
        () => b.otPersonSave(id && real(id), input),
        () => ({ kind: 'person.save', id: id ? real(id) : newId(), input, base: id ? (known.get(real(id)) as OtPerson | undefined) : undefined }),
        (op) => ({ ...input, id: op.id }),
      ),
    otPersonDelete: (id) => b.otPersonDelete(real(id)),
    async acctSave(id, input) {
      // passwords and OTP secrets never wait on this device: straight to the server, or an error
      if (input.password != null || input.otp_secret != null)
        return b.acctSave(id && real(id), input).catch((e: unknown) => {
          throw isNetworkError(e) ? new Error('Đặt / đổi mật khẩu hoặc OTP cần có mạng — bỏ phần đó để lưu các thay đổi khác trước') : e;
        });
      return write(
        () => b.acctSave(id && real(id), input),
        () => ({ kind: 'acct.save', id: id ? real(id) : newId(), input, base: id ? (known.get(real(id)) as TeamAccount | undefined) : undefined }),
        (op) => op.id,
      );
    },
    acctDelete: (id) =>
      write(
        () => b.acctDelete(real(id)),
        () => ({ kind: 'acct.delete', id: real(id), base: known.get(real(id)) as TeamAccount | undefined }),
        () => undefined,
      ),
  };
  return out;
}
