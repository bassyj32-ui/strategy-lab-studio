import { useState, useCallback, useRef, useEffect } from 'react';
import { useSceneStore } from '../scene/store';
import {
  searchSounds,
  formatDuration,
  BATTLE_PRESETS,
  type FreesoundResult,
} from '../audio/freesound';
import type { Asset, AudioTrack } from '../scene/types';
import { createId } from '../scene/id';

/**
 * Freesound token. Lives ONLY in localStorage under `sls.freesound.api-key`,
 * mirroring the AI provider's key handling (src/ai/provider.ts) — user
 * supplied, never committed, never logged. The value below is a placeholder,
 * not a credential.
 */
export const FREESOUND_KEY_STORAGE = 'sls.freesound.api-key';

function readFreesoundKey(): string {
  try {
    return localStorage.getItem(FREESOUND_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function writeFreesoundKey(value: string): void {
  try {
    if (value) localStorage.setItem(FREESOUND_KEY_STORAGE, value);
    else localStorage.removeItem(FREESOUND_KEY_STORAGE);
  } catch {
    /* private mode / quota — search simply stays disabled */
  }
}

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
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');

  const addAudioTrack = useSceneStore((s) => s.addAudioTrack);
  const registerAsset = useSceneStore((s) => s.registerAsset);

  // Load any previously saved token once on mount.
  useEffect(() => {
    const saved = readFreesoundKey();
    setApiKey(saved);
    setKeyDraft(saved);
  }, []);

  const saveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    writeFreesoundKey(trimmed);
    setApiKey(trimmed);
  }, [keyDraft]);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      if (!apiKey) {
        setError('Add a Freesound API token first (free at freesound.org/apiv2).');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await searchSounds(q, apiKey);
        setResults(res.results);
        setCount(res.count);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [apiKey],
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
        {!apiKey && (
          <div className="audio-key-setup">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="Freesound API token"
              className="audio-search-input"
              data-testid="freesound-key-input"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={saveKey}
              disabled={!keyDraft.trim()}
              className="btn btn-sm"
              data-testid="freesound-key-save"
            >
              Save token
            </button>
            <p className="audio-key-hint">
              Stored only in this browser (localStorage). Get a free token at
              freesound.org/apiv2. It is never sent anywhere except Freesound.
            </p>
          </div>
        )}
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
