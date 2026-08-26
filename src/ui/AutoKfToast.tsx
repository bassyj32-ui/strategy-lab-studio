import { useEffect, useState } from 'react';
import { useSceneStore } from '../scene/store';

/**
 * Brief toast that flashes when Auto-KF writes keyframes.
 * Subscribes to lastAutoKfCount — each increment triggers a 1.5s display.
 */
export function AutoKfToast() {
  const count = useSceneStore((s) => s.lastAutoKfCount);
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (count <= 0) return;
    setMsg(`+${count} keyframe${count > 1 ? 's' : ''} written`);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(t);
  }, [count]);

  if (!visible) return null;
  return (
    <div className="auto-kf-toast" data-testid="auto-kf-toast">
      {msg}
    </div>
  );
}
