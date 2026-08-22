// Timeline module (MVP-1). Keyframes live ONLY in the scene model; this module
// owns deterministic interpolation, transient playback state, and the DOM UI.
export type {
  Timeline as SceneTimeline,
  Keyframe,
  Keyframes,
} from '../scene/types';

export type { Easing, InterpolationOptions } from './interpolate';
export { interpolateTransform } from './interpolate';
export { formatTimecode } from './format';
export { getObjectTransformAtTime, getObjectKeyframes } from './selectors';
export { usePlaybackStore } from './playbackStore';
export type { PlaybackState } from './playbackStore';
export { usePlaybackEngine } from './usePlaybackEngine';
export { usePlaybackTime } from './usePlaybackTime';
export { useTimelineSelection } from './selection';
export type { TimelineSelectionState } from './selection';
export {
  addKeyframe,
  setKeyframeAtTime,
  updateKeyframe,
  removeKeyframe,
} from './actions';
export { TimelinePanel } from './components/TimelinePanel';
