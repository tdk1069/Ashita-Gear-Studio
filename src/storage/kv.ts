/* Small key-value store on IndexedDB. Falls back to memory when IndexedDB is unavailable
   (private windows, blocked storage, previews), so callers never have to handle that case. */

const DB_NAME = 'ashita-gear-studio';
const STORE = 'kv';
const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
export let persistent = true;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { persistent = false; resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { persistent = false; resolve(null); };
      req.onblocked = () => { persistent = false; resolve(null); };
    } catch { persistent = false; resolve(null); }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(db => {
    if (!db) return null;
    return new Promise<T | null>(resolve => {
      try {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { persistent = false; resolve(null); };
      } catch { persistent = false; resolve(null); }
    });
  });
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const v = await run<T>('readonly', s => s.get(key) as IDBRequest<T>);
  if (v != null) return v;
  return (memory.get(key) as T | undefined) ?? null;
}
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  memory.set(key, value);
  const db = await open();
  if (!db) return false;
  const r = await new Promise<boolean>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
  if (!r) persistent = false;
  return r;
}
export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  await run('readwrite', s => s.delete(key));
}
