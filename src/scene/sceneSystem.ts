// Pure multi-scene operations. NO React / store imports — this module is the
// testable core of the project system (single source of truth stays the Scene
// model; a Project is just an ordered envelope of Scenes, PRD §65/§99).
import type { LayerId, ObjId, Project, Scene } from './types';
import { PROJECT_SCHEMA_VERSION } from './types';
import { createDefaultScene } from './factory';
import { createId } from './id';

export { PROJECT_SCHEMA_VERSION };

export interface CreateSceneOptions {
  id?: string;
  name?: string;
}

/** Fresh, empty scene with a unique id (same shape as the boot scene). */
export function createScene(opts: CreateSceneOptions = {}): Scene {
  const scene = createDefaultScene(opts.id ?? createId('scene'));
  if (opts.name !== undefined) scene.name = opts.name;
  return scene;
}

/**
 * Deep copy of `source` under a NEW identity. LAW (PRD §8): every battlefield
 * object keeps a unique ID, so object ids AND layer ids are remapped; keyframes
 * follow their objects' new ids and each object's `layerId` follows its new
 * layer. Assets are SHARED by reference — they are an immutable registry
 * (blob/data URLs), never rewritten on duplication.
 */
export function duplicateScene(source: Scene, opts: CreateSceneOptions = {}): Scene {
  const copy: Scene = JSON.parse(JSON.stringify(source));
  copy.id = opts.id ?? createId('scene');
  copy.name = opts.name ?? `${source.name} (copy)`;

  // Remap layers first (objects reference them).
  const layerMap = new Map<LayerId, LayerId>();
  for (const layer of copy.layers) {
    const newId = createId('layer');
    layerMap.set(layer.id, newId);
    layer.id = newId;
  }

  // Pass 1: assign every object its new id FIRST, so pass 2 can resolve
  // parent links regardless of insertion order.
  const objMap = new Map<ObjId, ObjId>();
  for (const [oldId, obj] of Object.entries(copy.objects)) {
    const newId = createId(obj.type);
    objMap.set(oldId, newId);
  }

  // Pass 2: rewrite ids and references on each copied object.
  for (const [oldId, obj] of Object.entries(copy.objects)) {
    const newId = objMap.get(oldId)!;
    obj.id = newId;
    obj.layerId = layerMap.get(obj.layerId) ?? obj.layerId;
    // Hierarchy survives duplication: children follow their parent's NEW id
    // (PRD §8 — the copy's structure stays intact and independently editable).
    if (obj.parentId) {
      const newParentId = objMap.get(obj.parentId);
      if (newParentId) obj.parentId = newParentId;
      else delete obj.parentId; // dangling parent in the source: drop it
    }
    copy.objects[newId] = obj;
    delete copy.objects[oldId];
  }
  const keyframes = copy.keyframes;
  for (const [oldId, frames] of Object.entries(keyframes)) {
    const newId = objMap.get(oldId);
    if (newId) {
      keyframes[newId] = frames;
      delete keyframes[oldId];
    } else {
      delete keyframes[oldId]; // dangling frames for a nonexistent object
    }
  }

  return copy;
}

/**
 * Remove `id` from an ordered scene list. FORBIDDEN to delete the last scene
 * (the editor must always show one) — throws instead of returning a broken
 * project so callers cannot ignore it.
 */
export function deleteScene(
  scenes: Scene[],
  activeSceneId: string,
  id: string
): { scenes: Scene[]; activeSceneId: string } {
  if (scenes.length <= 1) throw new Error('Cannot delete the last remaining scene.');
  const idx = scenes.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Unknown scene: ${id}`);
  const next = scenes.filter((s) => s.id !== id);
  const nextActive =
    activeSceneId === id ? next[Math.min(idx, next.length - 1)].id : activeSceneId;
  return { scenes: next, activeSceneId: nextActive };
}

/** Compose the versioned full-project save payload. */
export function serializeProject(scenes: Scene[], activeSceneId: string): Project {
  if (!scenes.some((s) => s.id === activeSceneId)) {
    throw new Error(`activeSceneId "${activeSceneId}" does not match any scene.`);
  }
  return { schemaVersion: PROJECT_SCHEMA_VERSION, activeSceneId, scenes };
}

// ---- loadProject validation -------------------------------------------------
// Pragmatic structural checks: right envelope, known schemaVersion, exactly-
// matched activeSceneId, and per-scene required fields of plausible types.
// Deep per-field validation is intentionally NOT attempted (perf + forward
// tolerance within the same schemaVersion).

function fail(msg: string): never {
  throw new Error(`Invalid project file: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateScene(raw: unknown): asserts raw is Scene {
  if (!isRecord(raw)) fail('scene is not an object');
  if (typeof raw.id !== 'string' || !raw.id) fail('scene.id missing');
  if (typeof raw.name !== 'string') fail(`scene ${raw.id}: name missing`);
  if (!isRecord(raw.worldSize)) fail(`scene ${raw.id}: worldSize missing`);
  if (!isRecord(raw.assets) || !isRecord(raw.objects) || !isRecord(raw.keyframes)) {
    fail(`scene ${raw.id}: assets/objects/keyframes must be records`);
  }
  if (!Array.isArray(raw.layers)) fail(`scene ${raw.id}: layers must be an array`);
  if (!isRecord(raw.camera)) fail(`scene ${raw.id}: camera missing`);
  if (!isRecord(raw.timeline)) fail(`scene ${raw.id}: timeline missing`);
}

/**
 * Validate untrusted JSON data into a Project. Accepts an already-parsed
 * value OR a raw JSON string (parsed here; a malformed string is rejected
 * like any other invalid input). Throws a descriptive Error on any
 * structural problem — callers must surface it, never silently accept.
 */
export function loadProject(data: unknown): Project {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      fail('invalid JSON');
    }
  }
  if (!isRecord(value)) fail('root is not an object');
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    fail(
      `unsupported schemaVersion ${JSON.stringify(value.schemaVersion)} ` +
        `(expected ${PROJECT_SCHEMA_VERSION})`
    );
  }
  const scenes = value.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) {
    fail('scenes must be a non-empty array');
  }
  for (const s of scenes) validateScene(s);
  const ids = new Set(scenes.map((s) => (s as Scene).id));
  if (ids.size !== scenes.length) fail('duplicate scene ids');
  const activeSceneId = value.activeSceneId;
  if (typeof activeSceneId !== 'string' || !ids.has(activeSceneId)) {
    fail(`activeSceneId ${JSON.stringify(activeSceneId)} matches no scene`);
  }
  return value as unknown as Project;
}
