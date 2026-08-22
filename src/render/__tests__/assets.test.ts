import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// staticFile is stubbed so tests never depend on a bundling context.
vi.mock('remotion', () => ({
  staticFile: (p: string) => `/mocked/${p}`,
}));

import {
  resolveAssetUrl,
  loadSceneImages,
  assertExportIntegrity,
} from '../assets';
import type { Scene, Asset } from '../../scene/types';
import type { AssetImageMap } from '../types';

class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    FakeImage.instances.push(this);
  }
}

function makeAsset(id: string, src: string): Asset {
  return {
    id,
    kind: 'map',
    name: id,
    src,
    width: 100,
    height: 100,
  };
}

function makeSceneWithAssets(assets: Asset[]): Scene {
  const scene = {
    id: 's',
    name: 't',
    worldSize: { w: 1920, h: 1080 },
    assets: {} as Record<string, Asset>,
    objects: {},
    layers: [{ id: 'layer-root', name: 'Default', visible: true, order: 0 }],
    keyframes: {},
    camera: { x: 0, y: 0, zoom: 1 },
    timeline: { duration: 10, fps: 30 },
  } as unknown as Scene;
  for (const a of assets) scene.assets[a.id] = a;
  if (assets.length > 0) scene.mapAssetId = assets[0].id;
  return scene;
}

describe('resolveAssetUrl', () => {
  it('passes blob:/data:/http(s): URLs through UNCHANGED', () => {
    expect(resolveAssetUrl('blob:http://localhost/abc')).toBe(
      'blob:http://localhost/abc'
    );
    expect(resolveAssetUrl('data:image/png;base64,AAA')).toBe(
      'data:image/png;base64,AAA'
    );
    expect(resolveAssetUrl('https://cdn.example.com/m.png')).toBe(
      'https://cdn.example.com/m.png'
    );
    expect(resolveAssetUrl('http://cdn.example.com/m.png')).toBe(
      'http://cdn.example.com/m.png'
    );
  });

  it('wraps relative paths via staticFile', () => {
    expect(resolveAssetUrl('maps/world.png')).toBe('/mocked/maps/world.png');
  });
});

describe('loadSceneImages', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves immediately with empty results when the scene has no assets', () => {
    const spy = vi.fn();
    loadSceneImages(makeSceneWithAssets([]), spy);
    expect(spy).toHaveBeenCalledWith({}, []);
  });

  it('assigns the RESOLVED url (blob passthrough, path wrap)', () => {
    const scene = makeSceneWithAssets([
      makeAsset('m1', 'blob:http://localhost/x'),
      makeAsset('m2', 'maps/y.png'),
    ]);
    // mapAssetId points at first asset; add second as an object asset.
    (scene.objects as Record<string, unknown>)['o2'] = {
      id: 'o2',
      type: 'unit',
      assetId: 'm2',
      transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
      layerId: 'layer-root',
    };
    loadSceneImages(scene, () => {});
    expect(FakeImage.instances.map((i) => i.src)).toEqual([
      'blob:http://localhost/x',
      '/mocked/maps/y.png',
    ]);
  });

  it('collects failed ids, warns once per failure, and still resolves', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = makeSceneWithAssets([makeAsset('ok1', 'a.png')]);
    scene.objects = {
      o1: {
        id: 'o1',
        type: 'unit',
        assetId: 'bad1', // not in registry
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: 'layer-root',
      },
      o2: {
        id: 'o2',
        type: 'shape',
        assetId: 'err1', // registered but will error
        transform: { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
        layerId: 'layer-root',
      },
    } as Scene['objects'];
    scene.assets.err1 = makeAsset('err1', 'broken.png');

    let result: AssetImageMap | null = null;
    let failed: string[] | null = null;
    loadSceneImages(scene, (imgs, failedIds) => {
      result = imgs;
      failed = failedIds;
    });

    // ok1 succeeds; err1 fails; bad1 missing from registry
    FakeImage.instances.find((i) => i.src === '/mocked/a.png')!.onload!();
    FakeImage.instances.find((i) => i.src === '/mocked/broken.png')!.onerror!();

    expect(result!.ok1).toBeInstanceOf(FakeImage);
    expect(result!.err1).toBeNull();
    expect(result!.bad1).toBeNull();
    // Deterministic order: bad1 fails synchronously inside the loop (missing
    // registry); err1 fails asynchronously via onerror.
    expect(failed).toEqual(['bad1', 'err1']);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe('assertExportIntegrity', () => {
  const scene = makeSceneWithAssets([makeAsset('map1', 'maps/w.png')]);
  const okImages: AssetImageMap = {};
  const badImages: AssetImageMap = {};

  it('never throws outside headless rendering', () => {
    expect(() =>
      assertExportIntegrity(scene, badImages, false)
    ).not.toThrow();
  });

  it('does not throw when the map loaded', () => {
    (okImages as Record<string, HTMLImageElement>).map1 =
      new FakeImage() as unknown as HTMLImageElement;
    expect(() => assertExportIntegrity(scene, okImages, true)).not.toThrow();
  });

  it('HARD-FAILS headless export when the map is missing', () => {
    expect(() => assertExportIntegrity(scene, badImages, true)).toThrow(
      /Export aborted/
    );
  });
});
