import { describe, it, expect } from 'vitest';
import { summarizeScene } from './selectors';
import { createDefaultScene } from './factory';
import type { Scene } from './types';

const mkObject = (
  id: string,
  over: Partial<Scene['objects'][string]> = {}
): Scene['objects'][string] => ({
  id,
  type: 'unit',
  transform: { x: 100.456, y: 200.789, rotation: 0, scale: 1, opacity: 1 },
  layerId: 'layer-root',
  ...over,
});

const baseScene = (): Scene => {
  const scene = createDefaultScene();
  scene.objects = {};
  return scene;
};

describe('summarizeScene (PRD §62)', () => {
  it('groups objects by faction and collects faction-less ones in unassigned', () => {
    const scene = baseScene();
    scene.objects.a = mkObject('a', { faction: 'red', label: 'Hannibal' });
    scene.objects.b = mkObject('b', {
      faction: 'blue',
      transform: { x: 5, y: 5, rotation: 0, scale: 1, opacity: 1 },
    });
    scene.objects.c = mkObject('c'); // no faction
    const s = summarizeScene(scene);
    expect(s.armies.map((a) => a.faction).sort()).toEqual(['blue', 'red']);
    expect(s.armies.find((a) => a.faction === 'red')!.units[0].label).toBe(
      'Hannibal'
    );
    expect(s.unassigned.map((u) => u.id)).toEqual(['c']);
    expect(s.objectCount).toBe(3); // nothing silently dropped
  });

  it('rounds coordinates and omits default transform fields', () => {
    const scene = baseScene();
    scene.objects.a = mkObject('a');
    const entry = summarizeScene(scene).unassigned[0];
    expect(entry.x).toBe(100.46);
    expect(entry.y).toBe(200.79);
    expect(entry.rotation).toBeUndefined();
    expect(entry.scale).toBeUndefined();
    expect(entry.opacity).toBeUndefined();
  });

  it('includes only non-default extras (group parent, arrow length, keyframe count)', () => {
    const scene = baseScene();
    scene.objects.g = mkObject('g', { type: 'group' });
    scene.objects.arrow = mkObject('arrow', {
      type: 'arrow',
      length: 240,
      parentId: 'g',
    });
    scene.keyframes['a'] = [
      { time: 0, transform: mkObject('tmp').transform },
    ];
    scene.objects.a = mkObject('a');
    const s = summarizeScene(scene);
    const arrowEntry = s.unassigned.find((u) => u.id === 'arrow')!;
    expect(arrowEntry.group).toBe('g');
    expect(arrowEntry.length).toBe(240);
    expect(s.unassigned.find((u) => u.id === 'a')!.keys).toBe(1);
  });

  it('carries brand, card flags, vignette and camera-track size', () => {
    const scene = baseScene();
    scene.brand = { battleName: 'Cannae', dateLine: '216 BC' };
    scene.vignette = true;
    scene.openingCard = {};
    scene.closingCard = {};
    scene.cameraTrack = [
      { time: 0, cam: { x: 0, y: 0, zoom: 1 } },
      { time: 3, cam: { x: 9, y: 9, zoom: 2 } },
    ];
    const s = summarizeScene(scene);
    expect(s.brand).toEqual({ battleName: 'Cannae', dateLine: '216 BC' });
    expect(s.vignette).toBe(true);
    expect(s.openingCard).toBe(true);
    expect(s.closingCard).toBe(true);
    expect(s.cameraTrackKeys).toBe(2);
  });

  it('reports §56 selection identity (single) and multi-selection count', () => {
    const scene = baseScene();
    scene.objects.a = mkObject('a', { label: 'Infantry' });
    scene.objects.b = mkObject('b');
    const single = summarizeScene(scene, { selectedObjId: 'a' });
    expect(single.selected).toEqual({ id: 'a', label: 'Infantry', type: 'unit' });
    expect(single.selectedCount).toBeUndefined();

    const multi = summarizeScene(scene, {
      selectedIds: ['a', 'b'],
      selectedObjId: null,
    });
    // With >1 selected there is no single identity, just the count.
    expect(multi.selectedCount).toBe(2);

    const fallback = summarizeScene(scene, {
      selectedIds: ['b'],
      selectedObjId: null,
    });
    expect(fallback.selected!.id).toBe('b');
  });

  it('is compact JSON (no raw transform trees, stable keys)', () => {
    const scene = baseScene();
    scene.objects.a = mkObject('a', { faction: 'red' });
    const json = JSON.stringify(summarizeScene(scene));
    expect(json).not.toContain('"transform"'); // raw object shape must not leak
    expect(json.length).toBeLessThan(1200);
  });
});
