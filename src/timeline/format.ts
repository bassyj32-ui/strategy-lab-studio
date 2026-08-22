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
