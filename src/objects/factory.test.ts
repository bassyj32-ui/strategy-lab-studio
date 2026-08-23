import { describe, it, expect } from 'vitest';
import {
  createShape,
  createMarker,
  createUnit,
  createArrow,
  createSceneObject,
  DEFAULT_ARROW_LENGTH,
  DEFAULT_ARROW_COLOR,
} from './factory';
import { DEFAULT_LAYER_ID } from '../scene/factory';

describe('object factories', () => {
  it('createShape produces a shape with the default transform', () => {
    const obj = createShape({ id: 'shape-1', layerId: DEFAULT_LAYER_ID });
    expect(obj.type).toBe('shape');
    expect(obj.layerId).toBe(DEFAULT_LAYER_ID);
    expect(obj.transform).toEqual({ x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
  });

  it('createMarker honors an explicit position', () => {
    const obj = createMarker({ id: 'marker-1', layerId: DEFAULT_LAYER_ID, x: 10, y: 20 });
    expect(obj.type).toBe('marker');
    expect(obj.transform.x).toBe(10);
    expect(obj.transform.y).toBe(20);
  });

  it('createUnit is a reserved placeholder of type unit', () => {
    const obj = createUnit({ id: 'unit-1', layerId: DEFAULT_LAYER_ID });
    expect(obj.type).toBe('unit');
  });

  it('createSceneObject routes by type', () => {
    const a = createSceneObject('shape', { id: 'a', layerId: DEFAULT_LAYER_ID });
    const b = createSceneObject('marker', { id: 'b', layerId: DEFAULT_LAYER_ID });
    const c = createSceneObject('arrow', { id: 'c', layerId: DEFAULT_LAYER_ID });
    expect(a.type).toBe('shape');
    expect(b.type).toBe('marker');
    expect(c.type).toBe('arrow');
    expect(a.id).not.toBe(b.id);
  });

  describe('createArrow (MVP-2)', () => {
    it('defaults: length and Signals Console amber color', () => {
      const obj = createArrow({ id: 'arrow-1', layerId: DEFAULT_LAYER_ID });
      expect(obj.type).toBe('arrow');
      expect(obj.length).toBe(DEFAULT_ARROW_LENGTH);
      expect(obj.color).toBe(DEFAULT_ARROW_COLOR);
      expect(obj.transform).toEqual({ x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
    });

    it('honors explicit length, color, position and rotation', () => {
      const obj = createArrow({
        id: 'arrow-2',
        layerId: DEFAULT_LAYER_ID,
        x: 100,
        y: 50,
        rotation: 45,
        length: 240,
        color: '#ef4444',
      });
      expect(obj.length).toBe(240);
      expect(obj.color).toBe('#ef4444');
      expect(obj.transform).toMatchObject({ x: 100, y: 50, rotation: 45 });
    });
  });
});
