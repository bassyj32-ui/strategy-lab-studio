import { useEffect, useState } from 'react';

/**
 * Load a map image source (typically a portable data: URL produced by asset
 * import) into an HTMLImageElement for Konva rendering. Returns null until
 * the image has loaded; a failed load also stays null so the canvas falls
 * back to the plain grid view instead of erroring.
 */
export function useMapImage(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    setImg(null);
    if (!src) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    // No onerror handling needed: staying null IS the fallback state.
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return img;
}
