/**
 * Delegation shim (Architecture Law 1 / PRD §65, §99): the ONE interpolation
 * implementation lives in `src/render/interpolate.ts` and is shared by the
 * timeline, the editor preview, and the Remotion render. This module only
 * re-exports it so existing timeline callers and exports keep working.
 */
export type { Easing, InterpolationOptions } from '../render/interpolate';
export { interpolateTransform } from '../render/interpolate';
