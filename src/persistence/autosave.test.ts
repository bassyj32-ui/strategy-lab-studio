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
} from './autosave';

const SMALL_SRC = 'data:image/png;base64,iVBORw0KGgo=';

/** Build a structurally valid v2 Project (accepts loadProject's checks). */
function makeProject(assetSrc: string = SMALL_SRC): Project {
  const scene = createScene({ id: 's1', name: 'Test Battle' });
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

  it('coalesces bursts into a single write (debounce)', () => {
    vi.useFakeTimers();
    const p = makeProject();
    const store = memoryStore();
    const spy = vi.spyOn(store, 'set');
    const debounced = debounce(() => {
      void saveAutosave(p, { store });
    }, 800);
    debounced();
    debounced();
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(800);
    expect(spy).toHaveBeenCalledTimes(1);
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
