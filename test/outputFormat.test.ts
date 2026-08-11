import { describe, expect, it } from 'vitest';

import { resolveFormat } from '../src/lib/outputFormat';

const png = { name: 'screenshot.png', type: 'image/png' };
const jpg = { name: 'photo.jpg', type: 'image/jpeg' };
const webp = { name: 'art.webp', type: 'image/webp' };
const heic = { name: 'IMG_4021.HEIC', type: '' };
const gif = { name: 'diagram.gif', type: 'image/gif' };

describe('resolveFormat', () => {
  it('passes an explicit choice straight through', () => {
    expect(resolveFormat(png, 'jpeg')).toBe('jpeg');
    expect(resolveFormat(jpg, 'webp')).toBe('webp');
  });

  it('keeps the source format when asked for the original', () => {
    // A PNG screenshot going out as a JPEG is lossy and flattens transparency,
    // for a job that was only meant to remove metadata.
    expect(resolveFormat(png, 'original')).toBe('png');
    expect(resolveFormat(jpg, 'original')).toBe('jpeg');
    expect(resolveFormat(webp, 'original')).toBe('webp');
  });

  it('falls back to JPEG for HEIC, which no browser can write', () => {
    // "Keep the format" would otherwise mean "produce nothing".
    expect(resolveFormat(heic, 'original')).toBe('jpeg');
  });

  it('sends lossless sources to PNG rather than JPEG', () => {
    // GIF, BMP and TIFF are screenshots and line art, where JPEG ringing shows.
    expect(resolveFormat(gif, 'original')).toBe('png');
    expect(resolveFormat({ name: 'scan.tiff', type: '' }, 'original')).toBe('png');
    expect(resolveFormat({ name: 'old.bmp', type: 'image/bmp' }, 'original')).toBe('png');
  });

  it('falls back when the browser cannot write the source format', () => {
    // Safari could not write WebP for years; producing nothing is worse than
    // producing a JPEG.
    expect(resolveFormat(webp, 'original', ['jpeg', 'png'])).toBe('jpeg');
    expect(resolveFormat(png, 'original', ['jpeg'])).toBe('jpeg');
  });

  it('still keeps a format the browser does support', () => {
    expect(resolveFormat(png, 'original', ['jpeg', 'png'])).toBe('png');
  });

  it('works from the name alone when the type is missing', () => {
    // iOS and several file managers hand over an empty MIME type.
    expect(resolveFormat({ name: 'a.png', type: '' }, 'original')).toBe('png');
    expect(resolveFormat({ name: 'a.webp', type: '' }, 'original')).toBe('webp');
  });

  it('defaults to JPEG for something unrecognisable', () => {
    expect(resolveFormat({ name: 'mystery', type: '' }, 'original')).toBe('jpeg');
  });

  it('always returns a format the browser was said to support', () => {
    const supported = ['jpeg', 'png'] as const;
    for (const file of [png, jpg, webp, heic, gif, { name: 'x', type: '' }]) {
      expect(supported).toContain(resolveFormat(file, 'original', supported));
    }
  });
});
