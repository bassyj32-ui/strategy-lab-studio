// One-click Export dialog.
//
// Lets the commander pick an export format and stream a server-side Remotion
// render (outside the browser). Shows live progress and, on completion, a
// download link to the produced artifact. Styling is intentionally minimal and
// inline to match the existing panels.

import { useState, type CSSProperties } from 'react';
import { useExport } from './useExport';
import { useSceneStore } from '../scene/store';
import { EXPORT_RESOLUTION } from '../render/defaultProps';

// Map each export mode to its output artifact filename (inside out/).
const MODE_FILE: Record<string, string> = {
  mp4: 'video.mp4',
  prores: 'overlay.mov',
  webm: 'overlay.webm',
  sequence: 'overlay-frames',
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  background: '#1e1e22',
  color: '#eee',
  padding: 24,
  borderRadius: 10,
  minWidth: 360,
  maxWidth: 480,
  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
  fontFamily: 'system-ui, sans-serif',
};

const progressTrack: CSSProperties = {
  height: 10,
  background: '#333',
  borderRadius: 5,
  overflow: 'hidden',
  marginTop: 12,
};

const progressFill: CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg,#4f8cff,#7be0a3)',
  transition: 'width 0.2s ease',
};

export function ExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState('mp4');
  const { start, cancel, progress, stage, status, outputPath, error } =
    useExport();

  if (!open) return <></>;

  const scene = useSceneStore.getState().scene;
  const fps = scene.timeline?.fps ?? 30;
  const fileName = MODE_FILE[mode];
  const isSequence = mode === 'sequence';
  const downloadHref = fileName
    ? `/api/export/file?name=${encodeURIComponent(fileName)}`
    : undefined;

  const handleExport = () => {
    void start(mode);
  };

  const handleCancel = () => {
    void cancel();
    onClose();
  };

  // Closing (any path) while running must cancel the server-side render.
  const handleClose = () => {
    if (status === 'running') void cancel();
    onClose();
  };

  const statusText =
    status === 'idle'
      ? 'Ready — press Export to start'
      : status === 'done'
        ? 'Done'
        : status === 'error'
          ? `Error: ${error}`
          : status === 'cancelled'
            ? 'Cancelled'
            : stage || 'Rendering…';

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Export Video</h2>

        <label style={{ display: 'block', marginBottom: 8 }}>
          Format{' '}
          <select
            value={mode}
            data-testid="export-mode"
            onChange={(e) => setMode(e.target.value)}
            disabled={status === 'running'}
          >
            <option value="mp4">Standard MP4 1920×1080</option>
            <option value="prores">ProRes 4444 .mov (alpha)</option>
            <option value="webm">VP9 WebM (alpha)</option>
            <option value="sequence">PNG sequence (alpha)</option>
          </select>
        </label>

        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Resolution: {EXPORT_RESOLUTION.width}×{EXPORT_RESOLUTION.height} ·{' '}
          {fps} fps
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            data-testid="export-start"
            onClick={handleExport}
            disabled={status === 'running'}
          >
            {status === 'running' ? 'Rendering…' : 'Export'}
          </button>
          {status === 'running' && (
            <button
              type="button"
              data-testid="export-cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>

        <div style={progressTrack}>
          <div
            style={{
              ...progressFill,
              width: `${Math.round((progress || 0) * 100)}%`,
            }}
          />
        </div>

        <p data-testid="export-status" style={{ fontSize: 13 }}>
          {statusText}
        </p>

        {status === 'done' && (
          <div data-testid="export-result">
            <p style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {outputPath}
            </p>
            {isSequence ? (
              <p style={{ fontSize: 12 }}>
                Folder export complete — copy from: {outputPath}
              </p>
            ) : (
              <a
                href={downloadHref}
                data-testid="export-download"
                download
              >
                Download
              </a>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleClose}
          style={{ marginTop: 12 }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default ExportDialog;
