// Objects module (P0). Re-exports the scene-object types from the single
// source of truth plus the object factories and Konva render node.
export type {
  SceneObject,
  ObjId,
  SceneObjectType,
} from '../scene/types';
export * from './factory';
export { ObjectNode, SHAPE_SIZE, MARKER_RADIUS } from './ObjectNode';
