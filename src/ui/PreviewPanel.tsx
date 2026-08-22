import type { FC } from 'react';
import { useSceneStore } from '../scene/store';
import { PreviewPlayer } from '../render/PreviewPlayer';

/**
 * Minimal live Remotion preview panel. Reads the single-source-of-truth scene
 * from the Zustand store and renders it through `PreviewPlayer`. This is the
 * only editor-side render consumer; it does not edit the scene.
 */
export const PreviewPanel: FC = () => {
  const scene = useSceneStore((s) => s.scene);
  return (
    <div className="preview-panel" style={{ width: '100%' }}>
      <PreviewPlayer scene={scene} />
    </div>
  );
};
