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
/** Legacy single-blob key kept as a fallback source for pre-ring saves. */
interface AutosaveEnvelope { project: Project; savedAt: number }

/**
 * Snapshot RING (corruption safety net): instead of one blob, keep the last
 * SNAPSHOT_COUNT autosaves under rotating keys. A write interrupted by a
 * crash can only damage the newest snapshot — boot then falls back to the
 * previous one instead of losing everything. `sls:snap:head` names the
 * newest slot.
 */
export const SNAPSHOT_COUNT = 3;
export const SNAP_HEAD_KEY = 'sls:snap:head';
export const snapKey = (i: number): string => `sls:snap:${((i % SNAPSHOT_COUNT) + SNAPSHOT_COUNT) % SNAPSHOT_COUNT}`;

/** Parse + structurally validate one envelope blob; null when unusable. */
function parseEnvelope(raw: string | null): AutosaveEnvelope | null {
  if (!raw) return null;
  let env: Partial<AutosaveEnvelope>;
  try { env = JSON.parse(raw); } catch { return null; }
  if (!env.project) return null;
  try { loadProject(env.project); } catch { return null; }
  const savedAt = typeof env.savedAt === 'number' ? env.savedAt : 0;
  return { project: env.project, savedAt };
}

export async function saveAutosave(project: Project, opts?: { store?: KVStore }): Promise<void> {
  const store = opts?.store ?? idbStore;
  const headRaw = await store.get(SNAP_HEAD_KEY);
  const head = headRaw !== null && /^\d+$/.test(headRaw) ? Number(headRaw) : -1;
  const next = head + 1; // first ever write lands in slot 0
  await store.set(snapKey(next), JSON.stringify({ project, savedAt: Date.now() }));
  await store.set(SNAP_HEAD_KEY, String(((next % SNAPSHOT_COUNT) + SNAPSHOT_COUNT) % SNAPSHOT_COUNT));
}

export async function loadAutosave(opts?: { store?: KVStore }): Promise<{ project: Project; savedAt: number } | null> {
  const store = opts?.store ?? idbStore;

  // Newest -> oldest through the ring…
  const headRaw = await store.get(SNAP_HEAD_KEY);
  if (headRaw !== null && /^\d+$/.test(headRaw)) {
    const head = Number(headRaw);
    for (let age = 0; age < SNAPSHOT_COUNT; age++) {
      const env = parseEnvelope(await store.get(snapKey(head - age)));
      if (env) return env;
    }
  }
  // …then the pre-ring single blob, for upgrades from older builds.
  return parseEnvelope(await store.get(AUTOSAVE_KEY));
}

export async function clearAutosave(opts?: { store?: KVStore }): Promise<void> {
  const store = opts?.store ?? idbStore;
  await store.del(AUTOSAVE_KEY);
  for (let i = 0; i < SNAPSHOT_COUNT; i++) await store.del(snapKey(i));
  await store.del(SNAP_HEAD_KEY);
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
