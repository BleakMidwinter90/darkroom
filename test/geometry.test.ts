import { describe, expect, it } from 'vitest';

import { megapixels, targetSize, willResize, type Size } from '../src/lib/geometry';

const PHOTO: Size = { width: 4032, height: 3024 }; // a typical iPhone frame
const PORTRAIT: Size = { width: 3024, height: 4032 };
const SMALL: Size = { width: 400, height: 300 };

describe('targetSize — none', () => {
  it('leaves the image alone', () => {
    expect(targetSize(PHOTO, { kind: 'none' })).toEqual(PHOTO);
  });
});

describe('targetSize — fit', () => {
  it('fits inside the box and preserves aspect ratio', () => {
    const result = targetSize(PHOTO, { kind: 'fit', maxWidth: 2000, maxHeight: 2000 });
    expect(result).toEqual({ width: 2000, height: 1500 });
    expect(result.width / result.height).toBeCloseTo(PHOTO.width / PHOTO.height, 2);
  });

  it('is constrained by whichever edge binds first', () => {
    // A wide box but a short one: height is the limit.
    expect(targetSize(PHOTO, { kind: 'fit', maxWidth: 4000, maxHeight: 600 })).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('handles portrait as happily as landscape', () => {
    expect(targetSize(PORTRAIT, { kind: 'fit', maxWidth: 2000, maxHeight: 2000 })).toEqual({
      width: 1500,
      height: 2000,
    });
  });

  it('rejects a nonsensical box', () => {
    expect(() => targetSize(PHOTO, { kind: 'fit', maxWidth: 0, maxHeight: 100 })).toThrow(
      RangeError,
    );
  });
});

describe('targetSize — longestEdge', () => {
  it('sets the longest edge, whichever it is', () => {
    expect(targetSize(PHOTO, { kind: 'longestEdge', length: 1600 })).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(targetSize(PORTRAIT, { kind: 'longestEdge', length: 1600 })).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it('handles a perfect square', () => {
    expect(targetSize({ width: 1000, height: 1000 }, { kind: 'longestEdge', length: 500 })).toEqual({
      width: 500,
      height: 500,
    });
  });
});

describe('targetSize — scale', () => {
  it('scales both axes', () => {
    expect(targetSize(PHOTO, { kind: 'scale', factor: 0.5 })).toEqual({
      width: 2016,
      height: 1512,
    });
  });

  it('rejects a zero or negative factor', () => {
    expect(() => targetSize(PHOTO, { kind: 'scale', factor: 0 })).toThrow(RangeError);
    expect(() => targetSize(PHOTO, { kind: 'scale', factor: -1 })).toThrow(RangeError);
  });
});

describe('never upscaling', () => {
  it('leaves a small image alone when the box is bigger than it', () => {
    // The behaviour that matters: asking a 400px photo to "fit 2000px" must not
    // produce a blurry 2000px photo in a larger file.
    expect(targetSize(SMALL, { kind: 'fit', maxWidth: 2000, maxHeight: 2000 })).toEqual(SMALL);
    expect(targetSize(SMALL, { kind: 'longestEdge', length: 4000 })).toEqual(SMALL);
    expect(targetSize(SMALL, { kind: 'scale', factor: 4 })).toEqual(SMALL);
  });

  it('still shrinks a small image when asked to', () => {
    expect(targetSize(SMALL, { kind: 'longestEdge', length: 200 })).toEqual({
      width: 200,
      height: 150,
    });
  });

  it('enlarges only when explicitly allowed', () => {
    expect(targetSize(SMALL, { kind: 'scale', factor: 2 }, { allowUpscale: true })).toEqual({
      width: 800,
      height: 600,
    });
  });
});

describe('edge cases', () => {
  it('never produces a zero dimension', () => {
    // A panorama scaled brutally: the short edge must survive as at least 1px,
    // because a canvas of height 0 throws.
    const panorama = { width: 10000, height: 3 };
    const result = targetSize(panorama, { kind: 'longestEdge', length: 100 });
    expect(result.width).toBe(100);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('rejects an image with no area', () => {
    expect(() => targetSize({ width: 0, height: 100 }, { kind: 'none' })).toThrow(RangeError);
  });

  it('returns whole pixels', () => {
    const result = targetSize({ width: 1001, height: 667 }, { kind: 'longestEdge', length: 800 });
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
  });
});

describe('willResize', () => {
  it('is false when nothing would change', () => {
    expect(willResize(PHOTO, { kind: 'none' })).toBe(false);
    expect(willResize(SMALL, { kind: 'fit', maxWidth: 2000, maxHeight: 2000 })).toBe(false);
  });

  it('is true when the image would shrink', () => {
    expect(willResize(PHOTO, { kind: 'longestEdge', length: 1000 })).toBe(true);
  });
});

describe('megapixels', () => {
  it('describes sensor sizes the way a camera would', () => {
    expect(megapixels(PHOTO)).toBe(12.2);
    expect(megapixels({ width: 1000, height: 1000 })).toBe(1);
  });
});
