/**
 * Persists loaded log files in IndexedDB so a page reload doesn't lose them.
 * The raw File/Blob is stored (logs are often tens of MB — far beyond localStorage)
 * and re-parsed on startup.
 */

export interface StoredFile {
  id: string;
  name: string;
  blob: Blob;
  on: boolean;
  addedAt: number;
}

const DB = 'william-power-tool';
const STORE = 'logFiles';

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB không khả dụng'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const newStoreId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function listStored(): Promise<StoredFile[]> {
  const all = ((await tx('readonly', (s) => s.getAll())) ?? []) as StoredFile[];
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export const putStored = (f: StoredFile) => tx('readwrite', (s) => s.put(f));
export const deleteStored = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearStored = () => tx('readwrite', (s) => s.clear());

export async function setStoredOn(id: string, on: boolean) {
  await tx('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => {
      if (req.result) s.put({ ...req.result, on });
    };
  });
}
