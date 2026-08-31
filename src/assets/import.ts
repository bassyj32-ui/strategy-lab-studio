import type {
  Asset,
  AssetId,
  AssetKind,
  ImportAssetOptions,
  ImportMapOptions,
} from './types';

/**
 * Generates a unique, prefixed asset id. Uses the platform `crypto.randomUUID`
 * when available (browser + node webcrypto), falling back to a
 * timestamp/random string so this stays deterministic-capable in node test
 * environments. IDs are unique by construction, so registry writes are
 * effectively no-overwrite inserts.
 */
export function generateAssetId(kind: AssetKind): AssetId {
  const uuid =
    globalThis.crypto?.randomUUID?.() ??
    `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${uuid}`;
}

/**
 * Loads an image from `src` and resolves its natural intrinsic dimensions.
 * Pure DOM/HTMLImageElement usage — no scene-store or file side effects.
 * Rejects if the image fails to load.
 */
export function readImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error(`Failed to read image dimensions for "${src}"`));
    };
    img.src = src;
  });
}

/**
 * Reads a `File` fully into a self-contained `data:` URL. Unlike object URLs,
 * data URLs survive JSON serialization into scene.json and resolve identically
 * inside headless Remotion renders. Non-destructive per PRD §43: the bytes are
 * only encoded, the source file on disk is never modified.
 *
 * Implemented via arrayBuffer() + btoa (not FileReader) so the exact same
 * code path works in the browser, plain node, and unit tests.
 */
async function fileToDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Chunked conversion keeps String.fromCharCode off the call-stack limit
  // for multi-megabyte map images.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const mime = file.type || 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Builds an immutable `Asset` from a `File`. `src` is a portable data: URL
 * (non-destructive, PRD §43) so scenes stay export-safe outside the browser.
 * Returns the Asset but does NOT write it to the store (single responsibility,
 * testable).
 */
export async function importAssetFromFile(
  file: File,
  opts: ImportAssetOptions,
): Promise<Asset> {
  const src = await fileToDataUrl(file);
  const { width, height } = await readImageDimensions(src);
  const name = opts.name ?? file.name;
  return {
    id: generateAssetId(opts.kind),
    kind: opts.kind,
    name,
    src,
    width,
    height,
    metadata: {
      aspectRatio: width / height,
      defaultScale: 1,
      category: opts.category,
      faction: opts.faction,
      defaultShadow: undefined,
    },
  };
}

/**
 * Same as `importAssetFromFile` but always produces a `map` asset (category /
 * faction metadata intentionally omitted unless explicitly provided).
 * Does NOT write to the store.
 */
export async function importMapAsset(
  file: File,
  opts?: ImportMapOptions,
): Promise<Asset> {
  const src = await fileToDataUrl(file);
  const { width, height } = await readImageDimensions(src);
  const name = opts?.name ?? file.name;
  return {
    id: generateAssetId('map'),
    kind: 'map',
    name,
    src,
    width,
    height,
    metadata: {
      aspectRatio: width / height,
      defaultScale: 1,
    },
  };
}

/**
 * Parses a `#rrggbb` or `#rgb` hex color into an RGB triplet used as the
 * color-key for background removal. Accepts lowercase/uppercase.
 */
export function parseColorKey(color: string): { r: number; g: number; b: number } {
  const hex = color.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const value = Number.parseInt(full, 16);
  if (!/^[0-9a-fA-F]{6}$/.test(full) || Number.isNaN(value)) {
    throw new Error(`Invalid color key "${color}" (expected #rrggbb)`);
  }
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

/**
 * Chroma-key background removal on an asset's `src` (data:/blob:/http URL).
 * Loads the image onto an offscreen canvas and sets every pixel within
 * `tolerance` (per-channel, 0–255) of the `colorKey` to fully transparent.
 * Returns a new PNG data: URL. The source `src` is never mutated (PRD §43).
 *
 * Single-color key only — no feathered fringes/anti-alias cleanup (that is a
 * P1 polish). Intended for clean green-screen / magenta-key imports.
 */
export async function removeBackgroundFromAssetSrc(
  src: string,
  colorKey: string,
  tolerance: number,
): Promise<string> {
  const { width, height } = await readImageDimensions(src);
  const t = Math.max(0, Math.min(255, tolerance));
  const key = parseColorKey(colorKey);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load image for background removal'));
    img.src = src;
  });

  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (
      Math.abs(r - key.r) <= t &&
      Math.abs(g - key.g) <= t &&
      Math.abs(b - key.b) <= t
    ) {
      px[i + 3] = 0; // fully transparent
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
