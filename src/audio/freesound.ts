/**
 * Freesound.org API v2 client. Pure functions — no React, no store.
 *
 * Search endpoint is fully CORS-enabled (Access-Control-Allow-Origin: *).
 * Preview URLs are public CDN links — no auth needed for playback.
 * Rate limit: 60 req/min, 2000/day (free tier).
 */

const API_BASE = 'https://freesound.org/apiv2';
const SEARCH_FIELDS =
  'id,name,duration,previews,tags,username,license,description';

export interface FreesoundResult {
  id: number;
  name: string;
  duration: number;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
    'preview-hq-ogg': string;
    'preview-lq-ogg': string;
  };
  tags: string[];
  username: string;
  license: string;
  description?: string;
}

export interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundResult[];
}

/**
 * Search Freesound for sounds matching a query.
 * Returns preview URLs that can be played directly (no auth needed).
 */
export async function searchSounds(
  query: string,
  apiKey: string,
  page = 1,
  pageSize = 15,
): Promise<FreesoundSearchResponse> {
  const params = new URLSearchParams({
    query,
    fields: SEARCH_FIELDS,
    page: String(page),
    page_size: String(pageSize),
    token: apiKey,
  });
  const res = await fetch(`${API_BASE}/search/?${params}`);
  if (!res.ok) {
    throw new Error(`Freesound API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch a preview MP3 as a blob and return an object URL.
 * The caller is responsible for revoking the URL when no longer needed.
 */
export async function fetchPreviewBlob(
  previewUrl: string,
): Promise<string> {
  const res = await fetch(previewUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch preview: ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Format seconds as m:ss. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Preset battle SFX search queries for quick access. */
export const BATTLE_PRESETS = [
  { label: 'Sword Clash', query: 'sword clash metal' },
  { label: 'Explosion', query: 'explosion blast' },
  { label: 'Battle Cry', query: 'battle cry shout' },
  { label: 'Horse Gallop', query: 'horse gallop running' },
  { label: 'Marching', query: 'marching army boots' },
  { label: 'Arrow Fly', query: 'arrow fly whistle' },
  { label: 'Shield Hit', query: 'shield hit impact' },
  { label: 'Fire', query: 'fire burning campfire' },
  { label: 'War Drums', query: 'drum war tribal' },
  { label: 'Battlefield Ambience', query: 'battlefield ambience war' },
] as const;
