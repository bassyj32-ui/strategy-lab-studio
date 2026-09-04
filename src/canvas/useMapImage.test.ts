// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMapImage,
  __clearImageCacheForTests,
} from './useMapImage';

class MockImage {
  static instances: MockImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  constructor() {
    MockImage.instances.push(this);
  }
  set src(v: string) {
    this._src = v;
  }
  get src() {
    return this._src;
  }
  /** Test driver: fire a successful load. */
  complete() {
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockImage.instances = [];
  __clearImageCacheForTests();
  vi.stubGlobal('Image', MockImage as unknown as typeof Image);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SRC = 'data:image/png;base64,AAAA';

describe('useMapImage cache', () => {
  it('returns null until loaded, then the image (null-on-fail fallback)', () => {
    const { result } = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    expect(result.current).toBeNull();
    expect(MockImage.instances).toHaveLength(1);

    act(() => {
      MockImage.instances[0].complete();
    });
    expect(result.current).toBe(MockImage.instances[0] as unknown as HTMLImageElement);
  });

  it('N hooks sharing one src trigger a SINGLE load (in-flight shared)', () => {
    const a = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    const b = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    expect(a.result.current).toBeNull();
    expect(b.result.current).toBeNull();
    expect(MockImage.instances).toHaveLength(1);

    act(() => {
      MockImage.instances[0].complete();
    });
    expect(a.result.current).toBe(b.result.current);
    expect(a.result.current).not.toBeNull();
  });

  it('a later mount with the same src hits the cache synchronously (no new Image)', () => {
    const first = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    act(() => {
      MockImage.instances[0].complete();
    });
    expect(first.result.current).not.toBeNull();

    const second = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    // Cache hit: non-null on first render, no extra construction.
    expect(MockImage.instances).toHaveLength(1);
    expect(second.result.current).toBe(first.result.current);
  });

  it('failed loads stay null and are NOT cached (remount retries)', () => {
    const first = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    expect(MockImage.instances).toHaveLength(1);
    // onerror path: the hook never resolves (staying null IS the fallback).
    act(() => {
      MockImage.instances[0].fail();
    });
    expect(first.result.current).toBeNull();
    first.unmount();

    // A fresh mount must try AGAIN — failures are never cached.
    const second = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: SRC },
    });
    expect(second.result.current).toBeNull();
    expect(MockImage.instances).toHaveLength(2);
  });

  it('undefined src returns null without constructing an Image', () => {
    const { result } = renderHook(({ src }) => useMapImage(src), {
      initialProps: { src: undefined as string | undefined },
    });
    expect(result.current).toBeNull();
    expect(MockImage.instances).toHaveLength(0);
  });
});
