// Pragmatic tests for the export bridge pure functions. We do NOT run a real
// headless Remotion render here (CI can't execute the full render), but we
// verify the argument construction and stderr progress parsing, which are the
// parts most likely to regress.

import { describe, it, expect } from 'vitest';
import {
  buildRenderArgs,
  parseRemotionProgress,
} from './exportBridge.mjs';

describe('buildRenderArgs', () => {
  it('mp4 uses BattleScene, out/video.mp4, and a --props flag', () => {
    const { bin, args, outputPath } = buildRenderArgs('mp4', '/abs/out/export.props.json');
    expect(args).toContain('BattleScene');
    expect(args).toContain('out/video.mp4');
    expect(args.find((a) => a.startsWith('--props='))).toBeTruthy();
    expect(args[0]).toBe('render');
    expect(outputPath.endsWith('video.mp4')).toBe(true);
    expect(typeof bin).toBe('string');
  });

  it('prores targets BattleSceneAlpha with the full alpha flag set', () => {
    const { args } = buildRenderArgs('prores', '/abs/out/scene.alpha.props.json');
    // Alpha modes MUST target the BattleSceneAlpha composition
    // (blocker #3 — docs/rendering.md mandates it for transparent exports).
    expect(args).toContain('BattleSceneAlpha');
    expect(args).not.toContain('BattleScene');
    expect(args).toContain('out/overlay.mov');
    expect(args).toContain('--image-format=png');
    expect(args).toContain('--pixel-format=yuva444p10le');
    expect(args).toContain('--codec=prores');
    expect(args).toContain('--prores-profile=4444');
    expect(args.find((a) => a.startsWith('--props='))).toBeTruthy();
  });

  it('webm targets BattleSceneAlpha with vp9 alpha flags', () => {
    const { args } = buildRenderArgs('webm', '/x');
    expect(args).toContain('BattleSceneAlpha');
    expect(args).not.toContain('BattleScene');
    expect(args).toContain('--codec=vp9');
    expect(args).toContain('--pixel-format=yuva420p');
    expect(args).toContain('out/overlay.webm');
  });

  it('sequence targets BattleSceneAlpha with --sequence into a frames dir', () => {
    const { args, outputPath } = buildRenderArgs('sequence', '/x');
    expect(args).toContain('BattleSceneAlpha');
    expect(args).not.toContain('BattleScene');
    expect(args).toContain('--sequence');
    expect(args).toContain('out/overlay-frames');
    expect(outputPath.endsWith('overlay-frames')).toBe(true);
  });

  it('throws on an unknown mode', () => {
    expect(() => buildRenderArgs('bogus', '/x')).toThrow();
  });
});

describe('parseRemotionProgress', () => {
  it('parses "Rendering frame 12/300" into frame/total/progress', () => {
    let carry = {};
    carry = parseRemotionProgress('\rRendering frame 12/300\r', carry);
    expect(carry.frame).toBe(12);
    expect(carry.total).toBe(300);
    expect(carry.progress).toBeCloseTo(0.04, 5);
  });

  it('parses "Progress: 50%" into a 0.5 fraction', () => {
    let carry = {};
    carry = parseRemotionProgress('\rRendering frame 12/300\r', carry);
    carry = parseRemotionProgress('Progress: 50%\n', carry);
    expect(carry.progress).toBeCloseTo(0.5, 5);
    // frame/total preserved across chunks
    expect(carry.frame).toBe(12);
    expect(carry.total).toBe(300);
  });

  it('flags only GENUINE error lines (starting with "Error")', () => {
    const carry = parseRemotionProgress('Error: boom\n', {});
    expect(carry.error).toBe('Error: boom');
  });

  it('does NOT flag benign lines that merely contain the word "error"', () => {
    // Blocker #4: a line like Remotion's "…0 errors…" output must not set
    // c.error, or progress reporting would freeze.
    const carry = parseRemotionProgress(
      'Bundled with 0 errors and 0 warnings\n',
      {}
    );
    expect(carry.error).toBeNull();
    expect(carry.progress).toBe(0);
  });

  it('a later progress line RESETS a prior error flag (never suppresses)', () => {
    let carry = parseRemotionProgress('Error: transient blip\n', {});
    expect(carry.error).toBeTruthy();
    // Progress must keep flowing after a stale error line — no suppression.
    carry = parseRemotionProgress('\rRendering frame 5/100\r', carry);
    expect(carry.error).toBeNull();
    expect(carry.frame).toBe(5);
    carry = parseRemotionProgress('Progress: 40%\n', carry);
    expect(carry.error).toBeNull();
    expect(carry.progress).toBeCloseTo(0.4, 5);
  });

  it('re-assembles a line split across two chunks', () => {
    let carry = {};
    carry = parseRemotionProgress('Rendering frame 7', carry);
    expect(carry.frame).toBe(0); // not yet complete
    carry = parseRemotionProgress('/300\r', carry);
    expect(carry.frame).toBe(7);
    expect(carry.total).toBe(300);
    expect(carry.progress).toBeCloseTo(7 / 300, 5);
  });
});
