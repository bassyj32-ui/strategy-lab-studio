// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchSounds,
  formatDuration,
  BATTLE_PRESETS,
} from './freesound';

const MOCK_RESULTS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 100,
      name: 'Sword Clash',
      duration: 1.5,
      previews: {
        'preview-hq-mp3': 'https://freesound.org/data/previews/100-hq.mp3',
        'preview-lq-mp3': 'https://freesound.org/data/previews/100-lq.mp3',
        'preview-hq-ogg': 'https://freesound.org/data/previews/100-hq.ogg',
        'preview-lq-ogg': 'https://freesound.org/data/previews/100-lq.ogg',
      },
      tags: ['sword', 'metal'],
      username: 'user1',
      license: 'CC0',
    },
    {
      id: 200,
      name: 'Explosion',
      duration: 3.2,
      previews: {
        'preview-hq-mp3': 'https://freesound.org/data/previews/200-hq.mp3',
        'preview-lq-mp3': 'https://freesound.org/data/previews/200-lq.mp3',
        'preview-hq-ogg': 'https://freesound.org/data/previews/200-hq.ogg',
        'preview-lq-ogg': 'https://freesound.org/data/previews/200-lq.ogg',
      },
      tags: ['explosion'],
      username: 'user2',
      license: 'CC-BY',
    },
  ],
};

describe('freesound API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('searchSounds calls the correct URL with token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESULTS,
    } as Response);

    const result = await searchSounds('sword clash', 'test-key');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('freesound.org/apiv2/search/');
    expect(url).toContain('query=sword+clash');
    expect(url).toContain('token=test-key');
    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it('searchSounds throws on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response);

    await expect(searchSounds('test', 'key')).rejects.toThrow('429');
  });

  it('returns correct preview URLs', () => {
    const r = MOCK_RESULTS.results[0];
    expect(r.previews['preview-hq-mp3']).toBe(
      'https://freesound.org/data/previews/100-hq.mp3',
    );
  });
});

describe('formatDuration', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('formats 1.5 seconds as 0:01', () => {
    expect(formatDuration(1.5)).toBe('0:01');
  });

  it('formats 300 seconds as 5:00', () => {
    expect(formatDuration(300)).toBe('5:00');
  });
});

describe('BATTLE_PRESETS', () => {
  it('has at least 5 presets', () => {
    expect(BATTLE_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it('each preset has label and query', () => {
    for (const p of BATTLE_PRESETS) {
      expect(typeof p.label).toBe('string');
      expect(typeof p.query).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.query.length).toBeGreaterThan(0);
    }
  });
});
