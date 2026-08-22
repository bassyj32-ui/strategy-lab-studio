import { describe, it, expect } from 'vitest';
import {
  createShape,
  createMarker,
  createUnit,
  createSceneObject,
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
    expect(a.type).toBe('shape');
    expect(b.type).toBe('marker');
    expect(a.id).not.toBe(b.id);
  });
});
