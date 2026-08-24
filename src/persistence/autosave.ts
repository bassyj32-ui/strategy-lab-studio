import type { Project } from '../scene/types';
import { loadProject } from '../scene/sceneSystem';

export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

function promisify(req: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idbStore: KVStore = {
  async get(key: string) {
    if (typeof indexedDB === 'undefined') throw new Error('indexedDB unavailable');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sls-autosave', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('kv', 'readonly');
    const val = (await promisify(tx.objectStore('kv').get(key))) as string | undefined;
    db.close();
    return val ?? null;
  },
  async set(key: string, value: string) {
    if (typeof indexedDB === 'undefined') throw new Error('indexedDB unavailable');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sls-autosave', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    db.close();
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async del(key: string) {
    if (typeof indexedDB === 'undefined') throw new Error('indexedDB unavailable');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('sls-autosave', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    db.close();
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

export function memoryStore(): KVStore {
  const m = new Map<string, string>();
  return {
    get: (k) => Promise.resolve(m.get(k) ?? null),
    set: (k, v) => { m.set(k, v); return Promise.resolve(); },
    del: (k) => { m.delete(k); return Promise.resolve(); },
  };
}

export const AUTOSAVE_KEY = 'sls:autosave';
interface AutosaveEnvelope { project: Project; savedAt: number }

export async function saveAutosave(project: Project, opts?: { store?: KVStore }): Promise<void> {
  const store = opts?.store ?? idbStore;
  await store.set(AUTOSAVE_KEY, JSON.stringify({ project, savedAt: Date.now() }));
}

export async function loadAutosave(opts?: { store?: KVStore }): Promise<{ project: Project; savedAt: number } | null> {
  const store = opts?.store ?? idbStore;
  const raw = await store.get(AUTOSAVE_KEY);
  if (!raw) return null;
  let env: Partial<AutosaveEnvelope>;
  try { env = JSON.parse(raw); } catch { return null; }
  if (!env.project) return null;
  try { loadProject(env.project); } catch { return null; }
  const savedAt = typeof env.savedAt === 'number' ? env.savedAt : 0;
  return { project: env.project, savedAt };
}

export async function clearAutosave(opts?: { store?: KVStore }): Promise<void> {
  await (opts?.store ?? idbStore).del(AUTOSAVE_KEY);
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { flush(): void; cancel(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: A | undefined;
  const wrapped = (...args: A) => { pendingArgs = args; if (t) clearTimeout(t); t = setTimeout(() => { t = undefined; if (pendingArgs) fn(...pendingArgs); }, ms); };
  wrapped.cancel = () => { if (t) clearTimeout(t); t = undefined; pendingArgs = undefined; };
  wrapped.flush = () => { if (t) { clearTimeout(t); t = undefined; if (pendingArgs) fn(...pendingArgs); } };
  return wrapped;
}

export default idbStore;
