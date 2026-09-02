import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  getRemotionEnvironment,
} from 'remotion';
import { Audio } from '@remotion/media';
import type { BattleSceneProps, AssetImageMap } from './types';
import { loadSceneImages, assertExportIntegrity } from './assets';
import { drawScene } from './draw';

/**
 * The single Remotion component that paints one battlefield frame onto a
 * self-contained `<canvas>` via the 2D context. This is the ONLY place frames
 * are produced (used by both the headless `remotion render` and the in-editor
 * `<Player>` preview), keeping a single source of truth for rendering.
 */
export const BattleScene: FC<BattleSceneProps> = ({ scene, exportMode }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // null = "not loaded yet" (distinct from "loaded, zero assets" -> {}).
  // The delayRender handle TRAVELS WITH its own images payload, so a scene
  // change can never mix one generation's images with another's handle
  // (review finding N1 — generation-safe by construction).
  const [loaded, setLoaded] = useState<{
    imgs: AssetImageMap;
    handle: number;
  } | null>(null);

  // Load asset images once per scene identity.
  useEffect(() => {
    const handle = delayRender('Loading scene assets');
    let live = true;
    let delivered = false;
    loadSceneImages(scene, (imgs) => {
      if (!live || delivered) return;
      delivered = true;
      setLoaded({ imgs, handle }); // commit-effect below continues THIS handle
    });
    return () => {
      live = false;
      // Torn down before delivery (unmount / scene change / StrictMode
      // double-mount): release THIS generation's handle so capture never
      // hangs and no handle is orphaned.
      if (!delivered) continueRender(handle);
    };
  }, [scene]);

  // Runs after React commits the loaded state -> now it is safe to unblock
  // headless capture for exactly this generation.
  useEffect(() => {
    if (loaded !== null) continueRender(loaded.handle);
  }, [loaded]);

  // Paint the current frame (after export-integrity gate).
  useEffect(() => {
    if (loaded === null) return; // capture is still blocked until commit
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    assertExportIntegrity(scene, loaded.imgs, getRemotionEnvironment().isRendering);
    drawScene(
      ctx,
      scene,
      frame,
      fps,
      { w: width, h: height },
      loaded.imgs,
      // Alpha export mode paints objects only (transparent background).
      { transparentBackground: exportMode === 'alpha' }
    );
  }, [scene, frame, loaded, width, height, fps, exportMode]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%' }}
      />
      {/* Audio tracks: invisible elements that Remotion muxes into the MP4. */}
      {(scene.audioTracks ?? []).map((track) => {
        const asset = scene.assets[track.assetId];
        if (!asset) return null;
        return (
          <Audio
            key={track.id}
            src={asset.src}
            volume={track.volume}
            from={Math.round(track.startTime * fps)}
            loop={track.loop}
            showInTimeline={false}
          />
        );
      })}
    </>
  );
};
