/**
 * Battle of the Kalka River — demo scene builder.
 * Creates a complete 27-second battle animation with Blue and Red armies,
 * movement keyframes, camera track, arrows, and glow effects.
 *
 * Usage: import { buildKalkaBattle } from './scripts/buildKalkaBattle';
 *        buildKalkaBattle();   // applies to the active scene
 */
import { useSceneStore } from '../scene/store';
import type { ObjId, Keyframe, CameraKeyframe } from '../scene/types';
import { createId } from '../scene/id';

/* ------------------------------------------------------------------ */
/*  Coordinate system: 720 × 800 map, (0,0) top-left                 */
/* ------------------------------------------------------------------ */

interface FormationState {
  time: number;
  x: number;
  y: number;
}

const BLUE_KEYFRAMES: FormationState[] = [
  { time: 0,   x: 60,  y: 160 },
  { time: 2,   x: 220, y: 265 },
  { time: 4,   x: 355, y: 290 },
  { time: 6,   x: 370, y: 325 },
  { time: 8,   x: 325, y: 325 },
  { time: 10,  x: 265, y: 380 },
  { time: 12,  x: 215, y: 410 },
  { time: 14,  x: 300, y: 360 },
  { time: 16,  x: 320, y: 355 },
  { time: 18,  x: 250, y: 375 },
  { time: 20,  x: 275, y: 380 },
  { time: 22,  x: 325, y: 385 },
  { time: 24,  x: 360, y: 400 },
  { time: 26,  x: 365, y: 410 },
];

const RED_KEYFRAMES: FormationState[] = [
  { time: 0,   x: 410, y: 420 },
  { time: 2,   x: 445, y: 430 },
  { time: 4,   x: 425, y: 375 },
  { time: 6,   x: 395, y: 330 },
  { time: 8,   x: 405, y: 325 },
  { time: 10,  x: 425, y: 365 },
  { time: 12,  x: 500, y: 410 },
  { time: 14,  x: 410, y: 370 },
  { time: 16,  x: 370, y: 350 },
  { time: 18,  x: 455, y: 375 },
  { time: 20,  x: 425, y: 380 },
  { time: 22,  x: 390, y: 385 },
  { time: 24,  x: 365, y: 400 },
  { time: 26,  x: 360, y: 410 },
];

const CAMERA_KEYFRAMES: CameraKeyframe[] = [
  { time: 0,   cam: { x: 360, y: 400, zoom: 1.0  } },
  { time: 3,   cam: { x: 300, y: 330, zoom: 1.05 } },
  { time: 6,   cam: { x: 380, y: 340, zoom: 1.12 }, easing: 'easeIn' },
  { time: 8,   cam: { x: 390, y: 340, zoom: 1.20 }, easing: 'easeIn' },
  { time: 10,  cam: { x: 320, y: 370, zoom: 1.15 }, easing: 'easeOut' },
  { time: 13,  cam: { x: 350, y: 390, zoom: 1.05 }, easing: 'easeOut' },
  { time: 15,  cam: { x: 360, y: 360, zoom: 1.12 }, easing: 'easeIn' },
  { time: 18,  cam: { x: 350, y: 390, zoom: 1.05 }, easing: 'easeOut' },
  { time: 21,  cam: { x: 365, y: 390, zoom: 1.12 }, easing: 'easeIn' },
  { time: 23,  cam: { x: 365, y: 395, zoom: 1.22 }, easing: 'easeIn' },
  { time: 25.5, cam: { x: 365, y: 405, zoom: 1.28 }, easing: 'easeInOut' },
  { time: 27,  cam: { x: 360, y: 400, zoom: 1.0  }, easing: 'easeOut' },
];

/* ------------------------------------------------------------------ */
/*  Builder                                                           */
/* ------------------------------------------------------------------ */

function makeKeyframes(
  states: FormationState[],
  totalDuration: number,
): Array<Pick<Keyframe, 'time' | 'transform'>> {
  return states.map((s) => ({
    time: Math.round((s.time / 27) * totalDuration * 100) / 100,
    transform: {
      x: s.x,
      y: s.y,
      rotation: 0,
      scale: 1,
      opacity: 1,
    },
  }));
}

export function buildKalkaBattle(): void {
  const store = useSceneStore.getState();

  /* --- 1. Resize world + set timeline to 27s ---------------------- */
  useSceneStore.setState((state) => {
    state.scene.worldSize = { w: 720, h: 800 };
    state.scene.timeline.duration = 27;
    state.scene.timeline.fps = 30;
    state.scene.camera = { x: 360, y: 400, zoom: 1.0 };
  });

  /* --- 2. Create Blue army (20 units, column formation) ----------- */
  const blue = store.createFormation('column', {
    count: 20,
    spacing: 22,
    x: 60,
    y: 160,
  });
  // Paint every blue unit
  useSceneStore.setState((state) => {
    for (const cid of blue.childIds) {
      const obj = state.scene.objects[cid];
      if (obj) obj.discColor = '#3b82f6';
    }
  });

  /* --- 3. Create Red army (20 units, block/grid) ------------------ */
  const red = store.createFormation('grid', {
    count: 20,
    spacing: 25,
    x: 410,
    y: 420,
  });
  useSceneStore.setState((state) => {
    for (const cid of red.childIds) {
      const obj = state.scene.objects[cid];
      if (obj) obj.discColor = '#ef4444';
    }
  });

  /* --- 4. Create a few white "reserve" units (spawned at midpoint) - */
  const whiteIds: ObjId[] = [];
  const whitePositions: { x: number; y: number }[] = [];
  useSceneStore.setState((state) => {
    const layerId = state.scene.layers[0]?.id ?? 'layer-root';
    for (let i = 0; i < 6; i++) {
      const wid = createId('unit');
      const wx = 300 + i * 12;
      const wy = 350 + i * 8;
      state.scene.objects[wid] = {
        id: wid,
        type: 'unit',
        transform: { x: wx, y: wy, rotation: 0, scale: 1, opacity: 0 },
        layerId,
        discColor: '#e5e7eb',
      };
      whiteIds.push(wid);
      whitePositions.push({ x: wx, y: wy });
    }
  });

  /* --- 5. Movement keyframes for Blue ----------------------------- */
  const totalDur = 27;
  store.applyPathKeyframes(blue.groupId, makeKeyframes(BLUE_KEYFRAMES, totalDur));

  /* --- 6. Movement keyframes for Red ------------------------------ */
  store.applyPathKeyframes(red.groupId, makeKeyframes(RED_KEYFRAMES, totalDur));

  /* --- 7. White units fade in at t=18, fade out at t=25 ---------- */
  for (let i = 0; i < whiteIds.length; i++) {
    const wid = whiteIds[i];
    const pos = whitePositions[i];
    store.addKeyframe(wid, {
      time: 18,
      transform: { x: pos.x, y: pos.y, rotation: 0, scale: 1, opacity: 0 },
    });
    store.addKeyframe(wid, {
      time: 19,
      transform: { x: pos.x, y: pos.y, rotation: 0, scale: 1, opacity: 1 },
    });
    store.addKeyframe(wid, {
      time: 25,
      transform: { x: pos.x, y: pos.y, rotation: 0, scale: 1, opacity: 1 },
    });
    store.addKeyframe(wid, {
      time: 26,
      transform: { x: pos.x, y: pos.y, rotation: 0, scale: 1, opacity: 0 },
    });
  }

  /* --- 8. Camera keyframes --------------------------------------- */
  useSceneStore.setState((state) => {
    state.scene.cameraTrack = CAMERA_KEYFRAMES.map((kf) => ({
      time: kf.time,
      cam: { ...kf.cam },
      easing: kf.easing,
    }));
  });

  /* --- 9. Cluster glow on Blue at collision moments (t=6-8, 22-26) */
  useSceneStore.setState((state) => {
    const blueGroup = state.scene.objects[blue.groupId];
    if (blueGroup) {
      blueGroup.clusterGlow = { color: '#60a5fa', radius: 30 };
    }
  });

  /* --- 10. Add blue directional arrows at key moments -------------- */
  useSceneStore.setState((state) => {
    const layerId = state.scene.layers[0]?.id ?? 'layer-root';
    // Arrow 1: Blue advance direction (t=2)
    const a1 = createId('arrow');
    state.scene.objects[a1] = {
      id: a1,
      type: 'arrow',
      transform: { x: 180, y: 220, rotation: 35, scale: 1, opacity: 0.8 },
      layerId,
      length: 100,
      color: '#3b82f6',
    };
    // Arrow 2: Red intercept (t=4)
    const a2 = createId('arrow');
    state.scene.objects[a2] = {
      id: a2,
      type: 'arrow',
      transform: { x: 430, y: 380, rotation: -120, scale: 1, opacity: 0.8 },
      layerId,
      length: 90,
      color: '#ef4444',
    };
    // Arrow 3: Blue retreat (t=10)
    const a3 = createId('arrow');
    state.scene.objects[a3] = {
      id: a3,
      type: 'arrow',
      transform: { x: 310, y: 360, rotation: 210, scale: 1, opacity: 0.7 },
      layerId,
      length: 80,
      color: '#3b82f6',
    };
  });

  /* --- 11. Reset selection so the scene is ready ------------------ */
  store.setSelected(null);

  console.log(
    '%c⚔️ Kalka River battle loaded! Press Play to watch.',
    'font-size: 14px; font-weight: bold; color: #60a5fa;',
  );
}
