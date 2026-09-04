import type { Keyframe, Vec2 } from '../scene/types';
import {
  segmentIsCurved,
  segmentControlPoints,
  cubicBezierPoint,
} from '../render/interpolate';

const SUBDIVISIONS = 16;

function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function cubicBezierTangent(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number
): Vec2 {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1.x - p0.x) +
    6 * u * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const dy =
    3 * u * u * (p1.y - p0.y) +
    6 * u * t * (p2.y - p1.y) +
    3 * t * t * (p3.y - p2.y);
  return { x: dx, y: dy };
}

interface SegmentInfo {
  start: Vec2;
  end: Vec2;
  curved: boolean;
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  length: number;
}

function buildSegments(keyframes: Keyframe[]): SegmentInfo[] {
  if (keyframes.length < 2) return [];
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const segs: SegmentInfo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const curved = segmentIsCurved(a, b);
    const { p0, p1, p2, p3 } = segmentControlPoints(a, b);
    let length = 0;
    let prev = p0;
    for (let s = 1; s <= SUBDIVISIONS; s++) {
      const pt = cubicBezierPoint(p0, p1, p2, p3, s / SUBDIVISIONS);
      length += dist(prev, pt);
      prev = pt;
    }
    segs.push({
      start: { x: a.transform.x, y: a.transform.y },
      end: { x: b.transform.x, y: b.transform.y },
      curved,
      p0,
      p1,
      p2,
      p3,
      length,
    });
  }
  return segs;
}

export function pathLength(keyframes: Keyframe[]): number {
  return buildSegments(keyframes).reduce((sum, s) => sum + s.length, 0);
}

export function sampleAtPath(
  keyframes: Keyframe[],
  distance: number
): Vec2 | null {
  const segs = buildSegments(keyframes);
  if (segs.length === 0) return null;
  const totalLen = segs.reduce((s, seg) => s + seg.length, 0);
  if (totalLen <= 0) return segs[0].start;
  const d = Math.max(0, Math.min(distance, totalLen));
  let accum = 0;
  for (const seg of segs) {
    if (accum + seg.length >= d || seg === segs[segs.length - 1]) {
      const localD = d - accum;
      const frac = seg.length > 0 ? localD / seg.length : 0;
      return cubicBezierPoint(seg.p0, seg.p1, seg.p2, seg.p3, frac);
    }
    accum += seg.length;
  }
  return segs[segs.length - 1].end;
}

export function tangentAtDistance(
  keyframes: Keyframe[],
  distance: number
): Vec2 | null {
  const segs = buildSegments(keyframes);
  if (segs.length === 0) return null;
  const totalLen = segs.reduce((s, seg) => s + seg.length, 0);
  if (totalLen <= 0) {
    const s = segs[0];
    const t = cubicBezierTangent(s.p0, s.p1, s.p2, s.p3, 0);
    const len = Math.sqrt(t.x * t.x + t.y * t.y);
    return len > 0 ? { x: t.x / len, y: t.y / len } : { x: 1, y: 0 };
  }
  const d = Math.max(0, Math.min(distance, totalLen));
  let accum = 0;
  for (const seg of segs) {
    if (accum + seg.length >= d || seg === segs[segs.length - 1]) {
      const localD = d - accum;
      const frac = seg.length > 0 ? localD / seg.length : 0;
      const t = cubicBezierTangent(seg.p0, seg.p1, seg.p2, seg.p3, frac);
      const len = Math.sqrt(t.x * t.x + t.y * t.y);
      return len > 0 ? { x: t.x / len, y: t.y / len } : { x: 1, y: 0 };
    }
    accum += seg.length;
  }
  const last = segs[segs.length - 1];
  const t = cubicBezierTangent(last.p0, last.p1, last.p2, last.p3, 1);
  const len = Math.sqrt(t.x * t.x + t.y * t.y);
  return len > 0 ? { x: t.x / len, y: t.y / len } : { x: 1, y: 0 };
}
