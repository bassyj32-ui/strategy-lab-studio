import type { SceneObjectType } from '../scene/types';

// MVP-1 palette: only `shape` and `marker`. Unit is reserved (not included).
const PALETTE: { type: SceneObjectType; label: string }[] = [
  { type: 'shape', label: 'Shape (blue)' },
  { type: 'marker', label: 'Marker (red)' },
];

export function Toolbar() {
  return (
    <div className="toolbar">
      <h3>Palette</h3>
      <p className="hint">Drag an item onto the canvas to create it.</p>
      {PALETTE.map((item) => (
        <div
          key={item.type}
          className="palette-item"
          draggable
          data-testid={`palette-${item.type}`}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', item.type);
            e.dataTransfer.effectAllowed = 'copy';
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}

export default Toolbar;
