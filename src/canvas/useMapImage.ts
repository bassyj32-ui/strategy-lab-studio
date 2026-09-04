import { useEffect, useState } from 'react';

/**
 * Module-level image cache: HTMLImageElements keyed by src string, so N
 * objects sharing one sprite (or the map + its previews) decode/load once.
 * Only SUCCESSFUL loads are cached — failures stay uncached so a retry can
 * still succeed later and the canvas keeps its null fallback.
 */
const imageCache = new Map<string, HTMLImageElement>();
/** In-flight loads (src -> shared element + waiting setters). */
const inflight = new Map<
  string,
  { image: HTMLImageElement; waiters: Array<(img: HTMLImageElement) => void> }
>();

/** Test-only: drop all cached/in-flight entries between tests. */
export function __clearImageCacheForTests(): void {
  imageCache.clear();
  inflight.clear();
}

/**
 * Load a map image source (typically a portable data: URL produced by asset
 * import) into an HTMLImageElement for Konva rendering. Returns null until
 * the image has loaded; a failed load also stays null so the canvas falls
 * back to the plain grid view instead of erroring.
 */
export function useMapImage(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() =>
    src ? (imageCache.get(src) ?? null) : null
  );

  useEffect(() => {
    const cached = src ? imageCache.get(src) : undefined;
    setImg(cached ?? null);
    if (!src) return;
    if (imageCache.has(src)) return;
    let cancelled = false;
    const setIfAlive = (image: HTMLImageElement) => {
      if (!cancelled) setImg(image);
    };
    const pending = inflight.get(src);
    if (pending) {
      // Share the single in-flight decode: one network/decode per src.
      pending.waiters.push(setIfAlive);
      return () => {
        cancelled = true;
        // Drop the dead closure so unmounted components don't accumulate.
        // Leave the entry itself to resolve for remaining sharers.
        const entry = inflight.get(src);
        if (entry) {
          const i = entry.waiters.indexOf(setIfAlive);
          if (i >= 0) entry.waiters.splice(i, 1);
        }
      };
    }
    const image = new window.Image();
    inflight.set(src, { image, waiters: [setIfAlive] });
    image.onload = () => {
      // Only successful loads enter the cache; failures stay uncached.
      imageCache.set(src, image);
      const entry = inflight.get(src);
      inflight.delete(src);
      entry?.waiters.forEach((w) => w(image));
    };
    image.onerror = () => {
      // Staying null IS the fallback state — but the dead in-flight entry
      // must go so a later mount retries with a fresh Image.
      inflight.delete(src);
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return img;
}
