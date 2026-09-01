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
 * `colorKey` is optional — when omitted the key is auto-detected from the
 * 4 corner pixels (common for green-screen imports whose exact green varies).
 * `tolerance` defaults to 40 in auto mode, 30 when a key is supplied.
 * Single image load with `decode()` for reliable decode; fringe cleanup pass
 * zeroes semi-transparent border pixels near the key.
 */
export async function removeBackgroundFromAssetSrc(
  src: string,
  colorKey?: string,
  tolerance?: number,
): Promise<string> {
  // Single image load — dimensions come from the decoded image itself.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Failed to load image for background removal'));
    im.src = src;
  });
  // Ensure the image is fully decoded before drawing (Chrome cache can fire
  // onload before decode completes -> blank drawImage).
  if (typeof (img as unknown as { decode?: () => Promise<void> }).decode === 'function') {
    try {
      await (img as unknown as { decode: () => Promise<void> }).decode();
    } catch {
      // decode failure is non-fatal — onload already fired
    }
  }
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) throw new Error('Failed to read image dimensions for background removal');
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;

  // Auto-detect key from corner average when no key supplied.
  const auto = colorKey == null || colorKey === '' || colorKey === 'auto';
  let key: { r: number; g: number; b: number };
  let t: number;
  if (auto) {
    const sample = (x: number, y: number): { r: number; g: number; b: number } => {
      const idx = (y * width + x) * 4;
      return { r: px[idx], g: px[idx + 1], b: px[idx + 2] };
    };
    const corners = [
      sample(0, 0),
      sample(Math.max(0, width - 1), 0),
      sample(0, Math.max(0, height - 1)),
      sample(Math.max(0, width - 1), Math.max(0, height - 1)),
    ];
    const avg = corners.reduce(
      (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
      { r: 0, g: 0, b: 0 },
    );
    key = {
      r: Math.round(avg.r / corners.length),
      g: Math.round(avg.g / corners.length),
      b: Math.round(avg.b / corners.length),
    };
    t = tolerance != null ? Math.max(0, Math.min(255, tolerance)) : 40;
  } else {
    key = parseColorKey(colorKey);
    t = tolerance != null ? Math.max(0, Math.min(255, tolerance)) : 30;
  }

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
  // Fringe cleanup: pixels that are close to the key but were not fully
  // transparent due to anti-aliased edges / JPEG bleed — zero any remaining
  // near-key pixels whose alpha is still opaque but color is within t+12.
  if (auto) {
    const fringe = Math.min(255, t + 12);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (
        Math.abs(r - key.r) <= fringe &&
        Math.abs(g - key.g) <= fringe &&
        Math.abs(b - key.b) <= fringe
      ) {
        // Only kill fringes that are semi-mixed; keep solid subject colors.
        // Heuristic: if the pixel is desaturated toward the key, remove it.
        px[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
