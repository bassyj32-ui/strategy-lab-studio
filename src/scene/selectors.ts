import type { Faction, Layer, Scene, SceneObject } from './types';
import { sortForRender } from '../objects/depth';

/** Visible layers sorted by their `order` (ascending). Hidden layers excluded. */
export function visibleLayersOrdered(scene: Scene): Layer[] {
  return [...scene.layers]
    .filter((layer) => layer.visible)
    .sort((a, b) => a.order - b.order);
}

/** All objects assigned to a given layer, ordered for painting (§48 z-depth). */
export function objectsForLayer(scene: Scene, layerId: string): SceneObject[] {
  return sortForRender(
    Object.values(scene.objects).filter((obj) => obj.layerId === layerId)
  );
}

/**
 * The currently selected object, derived from store-root `selectedObjId`.
 * `selectedObjId` lives OUTSIDE the Scene and is excluded from undo snapshots,
 * so this reads it from the store state rather than from the Scene.
 */
export function selectedObject(state: {
  selectedObjId: string | null;
  scene: Scene;
}): SceneObject | undefined {
  if (!state.selectedObjId) return undefined;
  return state.scene.objects[state.selectedObjId];
}

// ---------------------------------------------------------------------------
// §62 SUMMARIZED SCENE STATE (AI Commander input). Compact, JSON-friendly,
// faction-grouped — never the raw object table. The Scene Engine resolves
// display names back to real ids at tool-execution time.
// ---------------------------------------------------------------------------

/** One compact object entry in a faction bucket. */
export interface SummaryEntry {
  /** Stable id — how approved AI ops reference the object. */
  id: string;
  type: SceneObject['type'];
  /** Commander label when set (the human-readable name, e.g. 'Hannibal'). */
  label?: string;
  /** World position, rounded to whole units (positions are not precision-critical for planning). */
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  opacity?: number;
  /** Parent group id when the object is organized under a group node. */
  group?: string;
  /** ARROW-ONLY: shaft length. */
  length?: number;
  /** Number of keyframes animating this object. */
  keys?: number;
}

/** Per-faction army bucket (§62 'RED ARMY – …'). */
export interface FactionSummary {
  faction: Faction;
  units: SummaryEntry[];
}

/** The compact scene digest handed to the AI provider (PRD §62). */
export interface SceneSummary {
  scene: { id: string; name: string };
  brand?: { battleName?: string; dateLine?: string };
  worldSize: { w: number; h: number };
  timeline: { duration: number; fps: number };
  camera: { x: number; y: number; zoom: number };
  /** Present only when an animated camera track exists. */
  cameraTrackKeys?: number;
  vignette?: boolean;
  openingCard?: boolean;
  closingCard?: boolean;
  layers: Array<Pick<Layer, 'id' | 'name' | 'visible'> & { depthFactor?: number }>;
  armies: FactionSummary[];
  unassigned: SummaryEntry[];
  /** Total object count (sanity check that nothing was dropped). */
  objectCount: number;
  /** §56: the commander's current selection identity, if any. */
  selected?: { id: string; label?: string; type?: string };
  selectedCount?: number;
}

const round = (v: number): number => Math.round(v * 100) / 100;

function toEntry(obj: SceneObject, keyframeCount: number): SummaryEntry {
  const entry: SummaryEntry = {
    id: obj.id,
    type: obj.type,
    x: round(obj.transform.x),
    y: round(obj.transform.y),
  };
  if (obj.label) entry.label = obj.label;
  const t = obj.transform;
  if (t.rotation !== 0) entry.rotation = round(t.rotation);
  if (t.scale !== 1) entry.scale = round(t.scale);
  if (t.opacity !== 1) entry.opacity = round(t.opacity);
  if (obj.parentId) entry.group = obj.parentId;
  if (obj.length !== undefined) entry.length = obj.length;
  if (keyframeCount > 0) entry.keys = keyframeCount;
  return entry;
}

/**
 * Build the compact §62 digest of a scene. Pure function of the scene (+ the
 * store-root selection identity passed in by the caller). Objects are grouped
 * by faction (armies), with everything else collected in `unassigned` so no
 * object silently disappears from the AI's view.
 */
export function summarizeScene(
  scene: Scene,
  selection?: { selectedObjId?: string | null; selectedIds?: string[] }
): SceneSummary {
  const armies = new Map<Faction, SummaryEntry[]>();
  const unassigned: SummaryEntry[] = [];

  for (const obj of Object.values(scene.objects)) {
    const keys = scene.keyframes[obj.id]?.length ?? 0;
    const entry = toEntry(obj, keys);
    if (obj.faction) {
      const bucket = armies.get(obj.faction) ?? [];
      bucket.push(entry);
      armies.set(obj.faction, bucket);
    } else {
      unassigned.push(entry);
    }
  }

  const summary: SceneSummary = {
    scene: { id: scene.id, name: scene.name },
    worldSize: scene.worldSize,
    timeline: scene.timeline,
    camera: {
      x: round(scene.camera.x),
      y: round(scene.camera.y),
      zoom: round(scene.camera.zoom),
    },
    layers: scene.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      ...(l.depthFactor !== undefined ? { depthFactor: l.depthFactor } : {}),
    })),
    armies: [...armies.entries()].map(([faction, units]) => ({
      faction,
      units,
    })),
    unassigned,
    objectCount: Object.keys(scene.objects).length,
  };

  if (scene.brand?.battleName || scene.brand?.dateLine) {
    summary.brand = {};
    if (scene.brand.battleName) summary.brand.battleName = scene.brand.battleName;
    if (scene.brand.dateLine) summary.brand.dateLine = scene.brand.dateLine;
  }
  if (scene.cameraTrack?.length) {
    summary.cameraTrackKeys = scene.cameraTrack.length;
  }
  if (scene.vignette) summary.vignette = true;
  if (scene.openingCard) summary.openingCard = true;
  if (scene.closingCard) summary.closingCard = true;

  const selId =
    selection?.selectedObjId ??
    (selection?.selectedIds?.length === 1 ? selection.selectedIds[0] : null);
  if (selId) {
    const sel = scene.objects[selId];
    if (sel) {
      summary.selected = {
        id: sel.id,
        ...(sel.label ? { label: sel.label } : {}),
        type: sel.type,
      };
    }
  }
  if (selection?.selectedIds && selection.selectedIds.length > 1) {
    summary.selectedCount = selection.selectedIds.length;
  }

  return summary;
}
