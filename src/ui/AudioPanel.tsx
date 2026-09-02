import { useState, useCallback, useRef } from 'react';
import { useSceneStore } from '../scene/store';
import {
  searchSounds,
  formatDuration,
  BATTLE_PRESETS,
  type FreesoundResult,
} from '../audio/freesound';
import type { Asset, AudioTrack } from '../scene/types';
import { createId } from '../scene/id';

const API_KEY = '1VgWgZ8eMZDgU0YelE4sc4E0b4XVNZaSnN8i8FXp';

/**
 * Battle SFX panel: search Freesound.org, preview sounds, import as audio
 * assets + timeline tracks. Uses token auth (no OAuth2 needed for search +
 * preview URLs).
 */
export function AudioPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundResult[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const addAudioTrack = useSceneStore((s) => s.addAudioTrack);
  const registerAsset = useSceneStore((s) => s.registerAsset);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await searchSounds(q, API_KEY);
        setResults(res.results);
        setCount(res.count);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const previewSound = useCallback(
    (result: FreesoundResult) => {
      const url = result.previews['preview-hq-mp3'];
      if (playingId === result.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      setPlayingId(result.id);
      audio.onended = () => setPlayingId(null);
    },
    [playingId],
  );

  const importSound = useCallback(
    async (result: FreesoundResult) => {
      setImporting(result.id);
      try {
        const previewUrl = result.previews['preview-hq-mp3'];
        // Create asset with the Freesound preview URL directly (persistent CDN link).
        const asset: Asset = {
          id: createId('asset'),
          kind: 'audio',
          name: result.name,
          src: previewUrl,
          width: 0,
          height: 0,
          duration: result.duration,
          metadata: {
            category: 'Effects',
            aspectRatio: 1,
            defaultScale: 1,
          },
        };
        registerAsset(asset);

        const track: AudioTrack = {
          id: createId('track'),
          assetId: asset.id,
          startTime: 0,
          volume: 0.8,
          loop: false,
          name: result.name,
        };
        addAudioTrack(track);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed');
      } finally {
        setImporting(null);
      }
    },
    [registerAsset, addAudioTrack],
  );

  return (
    <div className="audio-panel" data-testid="audio-panel">
      <div className="audio-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
          placeholder="Search battle SFX..."
          className="audio-search-input"
          data-testid="audio-search-input"
        />
        <button
          type="button"
          onClick={() => doSearch(query)}
          disabled={loading || !query.trim()}
          className="btn btn-sm"
          data-testid="audio-search-btn"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {error && (
        <div className="audio-error" data-testid="audio-error">
          {error}
        </div>
      )}

      {/* Preset buttons */}
      <div className="audio-presets" data-testid="audio-presets">
        {BATTLE_PRESETS.map((p) => (
          <button
            key={p.query}
            type="button"
            className="btn btn-xs"
            onClick={() => {
              setQuery(p.query);
              doSearch(p.query);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {count > 0 && (
        <div className="audio-results-info">
          {count} sounds found
        </div>
      )}
      <div className="audio-results" data-testid="audio-results">
        {results.map((r) => (
          <div key={r.id} className="audio-result" data-testid={`audio-result-${r.id}`}>
            <div className="audio-result-info">
              <span className="audio-result-name">{r.name}</span>
              <span className="audio-result-meta">
                {formatDuration(r.duration)} · {r.username}
              </span>
            </div>
            <div className="audio-result-actions">
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => previewSound(r)}
                data-testid={`audio-preview-${r.id}`}
              >
                {playingId === r.id ? 'Stop' : 'Play'}
              </button>
              <button
                type="button"
                className="btn btn-xs btn-primary"
                onClick={() => importSound(r)}
                disabled={importing === r.id}
                data-testid={`audio-import-${r.id}`}
              >
                {importing === r.id ? '...' : 'Import'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
