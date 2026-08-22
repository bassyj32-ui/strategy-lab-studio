import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateAssetId,
  importAssetFromFile,
  importMapAsset,
} from './import';
import {
  registerAsset,
  importMap,
  replaceAsset,
  getAsset,
  getMapAsset,
} from './registry';
import { useSceneStore } from '../scene/store';
import { createDefaultScene } from '../scene/factory';

// Deterministic, non-flaky browser stubs for the node test environment.
let nextDims: { width: number; height: number };

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_v: string) {
    this.naturalWidth = nextDims.width;
    this.naturalHeight = nextDims.height;
    this.onload?.();
  }
}

function makeFile(name: string): File {
  // A real (empty) File so the importer's FileReader can encode it into a
  // data: URL; only `name` carries through to the asset metadata.
  return new File([new Uint8Array(0)], name, { type: 'image/png' });
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

beforeEach(() => {
  nextDims = { width: 200, height: 100 };
  vi.stubGlobal('Image', FakeImage);
  // Reset the singleton scene store for isolation.
  useSceneStore.setState({ scene: createDefaultScene('test') });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateAssetId', () => {
  it('produces 1000 unique sprite ids all prefixed with "sprite-"', () => {
    const ids = Array.from({ length: 1000 }, () => generateAssetId('sprite'));
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every((id) => id.startsWith('sprite-'))).toBe(true);
  });

  it('prefixes map ids with "map-"', () => {
    expect(generateAssetId('map').startsWith('map-')).toBe(true);
  });
});

describe('importAssetFromFile', () => {
  it('returns a sprite Asset with a portable data: src', async () => {
    const file = makeFile('unit.png');
    const asset = await importAssetFromFile(file, {
      kind: 'sprite',
      category: 'Infantry',
      faction: 'red',
    });
    expect(asset.kind).toBe('sprite');
    expect(asset.src).toMatch(/^data:image\/png;base64,/);
    expect(asset.name).toBe('unit.png');
  });

  it('extracts metadata from intrinsic dimensions (200x100 -> aspectRatio 2)', async () => {
    nextDims = { width: 200, height: 100 };
    const asset = await importAssetFromFile(makeFile('m.png'), { kind: 'sprite' });
    expect(asset.width).toBe(200);
    expect(asset.height).toBe(100);
    expect(asset.metadata?.aspectRatio).toBe(2);
    expect(asset.metadata?.defaultScale).toBe(1);
    expect(asset.metadata?.defaultShadow).toBeUndefined();
  });

  it('uses an explicit name when provided', async () => {
    const asset = await importAssetFromFile(makeFile('raw.png'), {
      kind: 'image',
      name: 'My Image',
    });
    expect(asset.name).toBe('My Image');
  });
});

describe('importMapAsset', () => {
  it('returns a map-kind Asset without category/faction metadata', async () => {
    const asset = await importMapAsset(makeFile('map.png'), { name: 'The Map' });
    expect(asset.kind).toBe('map');
    expect(asset.name).toBe('The Map');
    expect(asset.metadata?.category).toBeUndefined();
    expect(asset.metadata?.faction).toBeUndefined();
  });
});

describe('registerAsset (additive immutability)', () => {
  it('inserts A then B; A is unchanged by the later write', async () => {
    const A = await importAssetFromFile(makeFile('a.png'), { kind: 'sprite' });
    const B = await importAssetFromFile(makeFile('b.png'), { kind: 'sprite' });
    registerAsset(A);
    registerAsset(B);
    expect(getAsset(A.id)).toEqual(A);
    expect(getAsset(B.id)).toEqual(B);
  });

  it('does not mutate the passed asset object (stored record equals input snapshot)', async () => {
    const asset = await importAssetFromFile(makeFile('c.png'), { kind: 'image' });
    const snap = snapshot(asset);
    registerAsset(asset);
    expect(getAsset(asset.id)).toEqual(snap);
  });
});

describe('replaceAsset', () => {
  it('registers a NEW asset and leaves the old one intact', async () => {
    const old = await importAssetFromFile(makeFile('old.png'), { kind: 'sprite' });
    registerAsset(old);
    const newId = await replaceAsset(old.id, makeFile('new.png'), { kind: 'sprite' });
    expect(newId).not.toBe(old.id);
    expect(getAsset(old.id)).toEqual(old);
    expect(getAsset(newId)).toBeDefined();
    expect(getAsset(newId)?.name).toBe('new.png');
  });
});

describe('importMap (one active map per scene)', () => {
  it('sets mapAssetId + worldSize and retains the previous map asset', async () => {
    nextDims = { width: 1920, height: 1080 };
    await importMap(makeFile('map1.png'), { name: 'Map1' });
    const firstId = getMapAsset()!.id;
    expect(useSceneStore.getState().scene.mapAssetId).toBe(firstId);
    expect(useSceneStore.getState().scene.worldSize).toEqual({ w: 1920, h: 1080 });
    expect(getMapAsset()!.kind).toBe('map');

    nextDims = { width: 1280, height: 720 };
    await importMap(makeFile('map2.png'), { name: 'Map2' });
    const secondId = getMapAsset()!.id;
    expect(secondId).not.toBe(firstId);
    expect(useSceneStore.getState().scene.worldSize).toEqual({ w: 1280, h: 720 });

    // First map asset remains registered (never deleted).
    expect(getAsset(firstId)).toBeDefined();
    expect(getAsset(firstId)!.name).toBe('Map1');
  });
});
