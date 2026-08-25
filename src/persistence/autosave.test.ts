import { describe, it, expect, vi } from 'vitest';
import { createScene, serializeProject } from '../scene/sceneSystem';
import type { Project, Asset } from '../scene/types';
import {
  saveAutosave,
  loadAutosave,
  clearAutosave,
  debounce,
  memoryStore,
  AUTOSAVE_KEY,
  SNAPSHOT_COUNT,
  snapKey,
  SNAP_HEAD_KEY,
} from './autosave';

const SMALL_SRC = 'data:image/png;base64,iVBORw0KGgo=';

/** Build a structurally valid v2 Project (accepts loadProject's checks). */
function makeProject(assetSrc: string = SMALL_SRC, name = 'Test Battle'): Project {
  const scene = createScene({ id: 's1', name });
  const asset: Asset = {
    id: 'a1',
    kind: 'sprite',
    name: 'unit',
    src: assetSrc,
    width: 1,
    height: 1,
  };
  scene.assets['a1'] = asset;
  return serializeProject([scene], 's1');
}

describe('autosave', () => {
  it('round-trips a minimal valid project', async () => {
    const p = makeProject();
    const store = memoryStore();
    await saveAutosave(p, { store });
    const loaded = await loadAutosave({ store });
    expect(loaded).not.toBeNull();
    expect(loaded!.project).toEqual(p);
    expect(typeof loaded!.savedAt).toBe('number');
  });

  it('returns null when nothing has been saved', async () => {
    const store = memoryStore();
    expect(await loadAutosave({ store })).toBeNull();
  });

  it('clears a saved project', async () => {
    const store = memoryStore();
    await saveAutosave(makeProject(), { store });
    await clearAutosave({ store });
    expect(await loadAutosave({ store })).toBeNull();
  });

  it('coalesces bursts into a single write (debounce)', async () => {
    vi.useFakeTimers();
    const p = makeProject();
    const store = memoryStore();
    const spy = vi.spyOn(store, 'set');
    // saveAutosave is async (ring read + 2 writes) — await its completion
    // before asserting, otherwise fake timers freeze the microtask chain.
    let settled!: () => void;
    const wrote = new Promise<void>((r) => { settled = r; });
    const debounced = debounce(() => {
      void saveAutosave(p, { store }).then(settled);
    }, 800);
    debounced();
    debounced();
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(800);
    await wrote;
    // Five debounced bursts → ONE save → exactly 2 writes: the snapshot blob
    // plus the head pointer.
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('fails validation for a corrupt blob', async () => {
    const store = memoryStore();
    await store.set(AUTOSAVE_KEY, '{not json');
    expect(await loadAutosave({ store })).toBeNull();
  });

  it('handles a very large project payload (~6MB asset)', async () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(6_000_000);
    const p = makeProject(big);
    const store = memoryStore();
    await expect(saveAutosave(p, { store })).resolves.toBeUndefined();
    const loaded = await loadAutosave({ store });
    expect(loaded).not.toBeNull();
    expect(loaded!.project).toEqual(p);
  });
});

describe('autosave snapshot ring (corruption safety net)', () => {
  it('keeps the newest of many saves and rotates through SNAPSHOT_COUNT slots', async () => {
    const store = memoryStore();
    for (let i = 1; i <= SNAPSHOT_COUNT + 2; i++) {
      await saveAutosave(makeProject(SMALL_SRC, `Battle ${i}`), { store });
    }
    // Exactly SNAPSHOT_COUNT slots are occupied; head points at the newest.
    for (let i = 0; i < SNAPSHOT_COUNT; i++) {
      expect(await store.get(snapKey(i))).not.toBeNull();
    }
    const head = Number(await store.get(SNAP_HEAD_KEY));
    const loaded = await loadAutosave({ store });
    expect(loaded!.project.scenes[0].name).toBe(`Battle ${SNAPSHOT_COUNT + 2}`);
    expect(loaded!.project).toEqual(
      JSON.parse((await store.get(snapKey(head)))!).project
    );
  });

  it('falls back to an older snapshot when the newest is corrupt', async () => {
    const store = memoryStore();
    await saveAutosave(makeProject(SMALL_SRC, 'Old battle'), { store }); // slot 0
    await saveAutosave(makeProject(SMALL_SRC, 'New battle'), { store }); // slot 1
    const head = Number(await store.get(SNAP_HEAD_KEY));
    await store.set(snapKey(head), '{torn write'); // crash mid-write
    const loaded = await loadAutosave({ store });
    expect(loaded!.project.scenes[0].name).toBe('Old battle');
  });

  it('clear removes every ring slot, the head pointer and the legacy key', async () => {
    const store = memoryStore();
    await saveAutosave(makeProject(), { store });
    await clearAutosave({ store });
    expect(await loadAutosave({ store })).toBeNull();
    expect(await store.get(SNAP_HEAD_KEY)).toBeNull();
    expect(await store.get(AUTOSAVE_KEY)).toBeNull();
    for (let i = 0; i < SNAPSHOT_COUNT; i++) {
      expect(await store.get(snapKey(i))).toBeNull();
    }
  });

  it('still reads a pre-ring legacy blob (upgrade path)', async () => {
    const store = memoryStore();
    const legacy = JSON.stringify({ project: makeProject(), savedAt: 42 });
    await store.set(AUTOSAVE_KEY, legacy);
    const loaded = await loadAutosave({ store });
    expect(loaded!.savedAt).toBe(42);
  });
});
