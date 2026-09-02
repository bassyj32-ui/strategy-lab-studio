// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine } from './audioEngine';
import type { Asset, AudioTrack } from '../scene/types';

// Mock HTMLAudioElement
class MockAudio {
  src = '';
  loop = false;
  volume = 1;
  currentTime = 0;
  duration = 10;
  paused = true;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock the global Audio constructor
    vi.stubGlobal('Audio', MockAudio as unknown as typeof Audio);
    engine = new AudioEngine();
  });

  it('creates clips for new tracks', () => {
    const assets: Record<string, Asset> = {
      a1: {
        id: 'a1',
        kind: 'audio',
        name: 'test',
        src: 'https://example.com/test.mp3',
        width: 0,
        height: 0,
        duration: 5,
      },
    };
    const tracks: AudioTrack[] = [
      { id: 't1', assetId: 'a1', startTime: 0, volume: 0.8, loop: false },
    ];

    engine.sync(tracks, assets, 0, false);

    expect(engine.size).toBe(1);
  });

  it('removes clips when tracks are deleted', () => {
    const assets: Record<string, Asset> = {
      a1: {
        id: 'a1',
        kind: 'audio',
        name: 'test',
        src: 'https://example.com/test.mp3',
        width: 0,
        height: 0,
        duration: 5,
      },
    };
    const tracks: AudioTrack[] = [
      { id: 't1', assetId: 'a1', startTime: 0, volume: 0.8, loop: false },
    ];

    engine.sync(tracks, assets, 0, false);
    expect(engine.size).toBe(1);

    engine.sync([], assets, 0, false);
    expect(engine.size).toBe(0);
  });

  it('skips tracks with missing assets', () => {
    const assets: Record<string, Asset> = {};
    const tracks: AudioTrack[] = [
      { id: 't1', assetId: 'nonexistent', startTime: 0, volume: 0.8, loop: false },
    ];

    engine.sync(tracks, assets, 0, false);
    expect(engine.size).toBe(0);
  });

  it('pauseAll pauses all clips', () => {
    const assets: Record<string, Asset> = {
      a1: {
        id: 'a1',
        kind: 'audio',
        name: 'test',
        src: 'https://example.com/test.mp3',
        width: 0,
        height: 0,
        duration: 5,
      },
    };
    const tracks: AudioTrack[] = [
      { id: 't1', assetId: 'a1', startTime: 0, volume: 0.8, loop: false },
    ];

    engine.sync(tracks, assets, 0, false);
    engine.pauseAll();
    // No error thrown
  });

  it('dispose clears all clips', () => {
    const assets: Record<string, Asset> = {
      a1: {
        id: 'a1',
        kind: 'audio',
        name: 'test',
        src: 'https://example.com/test.mp3',
        width: 0,
        height: 0,
        duration: 5,
      },
    };
    const tracks: AudioTrack[] = [
      { id: 't1', assetId: 'a1', startTime: 0, volume: 0.8, loop: false },
    ];

    engine.sync(tracks, assets, 0, false);
    expect(engine.size).toBe(1);

    engine.dispose();
    expect(engine.size).toBe(0);
  });
});
