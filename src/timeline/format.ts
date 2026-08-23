/**
 * Format a time in seconds as "MM:SS.mmm" for the transport readout.
 */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, w: number): string => n.toString().padStart(w, '0');
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/**
 * Compact "fps · duration" readout shown beside the timecode, e.g.
 * "30 fps · 10.0 s". Rendered with tabular numerals so digits don't jitter.
 */
export function formatPlaybackMeta(fps: number, durationSeconds: number): string {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 0;
  const fpsLabel = Number.isInteger(safeFps) ? String(safeFps) : safeFps.toFixed(1);
  const dur = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  return `${fpsLabel} fps · ${dur.toFixed(1)} s`;
}
