import { lazy, Suspense, type FC } from 'react';
import { useSceneStore } from '../scene/store';

// Lazy-load the Remotion preview so konva + remotion + player stay out of the
// initial chunk. The canvas itself is NEVER lazy-loaded — only this preview.
const PreviewPlayer = lazy(() =>
  import('../render/PreviewPlayer').then((m) => ({ default: m.PreviewPlayer }))
);

/**
 * Minimal live Remotion preview panel. Reads the single-source-of-truth scene
 * from the Zustand store and renders it through `PreviewPlayer`. This is the
 * only editor-side render consumer; it does not edit the scene.
 */
export const PreviewPanel: FC = () => {
  const scene = useSceneStore((s) => s.scene);
  return (
    <div className="preview-panel" style={{ width: '100%' }}>
      <Suspense
        fallback={
          <div className="preview-loading" data-testid="preview-loading">
            Loading preview…
          </div>
        }
      >
        <PreviewPlayer scene={scene} />
      </Suspense>
    </div>
  );
};
