import { describe, expect, it } from 'vitest';

import {
  deduplicateNames,
  isHeic,
  isSupportedImage,
  outputName,
  splitExtension,
} from '../src/lib/naming';

describe('splitExtension', () => {
  it('splits on the last dot', () => {
    expect(splitExtension('IMG_4021.HEIC')).toEqual(['IMG_4021', 'HEIC']);
    expect(splitExtension('holiday.photo.jpg')).toEqual(['holiday.photo', 'jpg']);
  });

  it('treats a name with no dot as having no extension', () => {
    expect(splitExtension('screenshot')).toEqual(['screenshot', '']);
  });

  it('does not mistake a hidden file for an extension', () => {
    expect(splitExtension('.gitignore')).toEqual(['.gitignore', '']);
  });
});

describe('outputName', () => {
  it('keeps the stem and swaps the extension', () => {
    expect(outputName('IMG_4021.HEIC', 'jpeg')).toBe('IMG_4021.jpg');
    expect(outputName('cat.png', 'webp')).toBe('cat.webp');
    expect(outputName('scan.jpeg', 'png')).toBe('scan.png');
  });

  it('uses .jpg rather than .jpeg, which is what everything else writes', () => {
    expect(outputName('a.png', 'jpeg')).toBe('a.jpg');
  });

  it('handles a name with no extension', () => {
    expect(outputName('screenshot', 'jpeg')).toBe('screenshot.jpg');
  });

  it('falls back rather than producing a hidden or empty file', () => {
    expect(outputName('   ', 'jpeg')).toBe('image.jpg');
  });

  it('preserves dots inside the stem', () => {
    expect(outputName('holiday.2024.heic', 'jpeg')).toBe('holiday.2024.jpg');
  });
});

describe('deduplicateNames', () => {
  it('leaves distinct names untouched', () => {
    expect(deduplicateNames(['a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
  });

  it('suffixes collisions the way a desktop would', () => {
    // Two folders each holding IMG_0001.HEIC land in one downloads folder.
    expect(deduplicateNames(['IMG_0001.jpg', 'IMG_0001.jpg', 'IMG_0001.jpg'])).toEqual([
      'IMG_0001.jpg',
      'IMG_0001 (2).jpg',
      'IMG_0001 (3).jpg',
    ]);
  });

  it('treats names differing only in case as colliding', () => {
    // macOS and Windows filesystems are case-insensitive, so these would
    // overwrite each other on extraction.
    expect(deduplicateNames(['Photo.jpg', 'photo.jpg'])).toEqual(['Photo.jpg', 'photo (2).jpg']);
  });

  it('handles names with no extension', () => {
    expect(deduplicateNames(['scan', 'scan'])).toEqual(['scan', 'scan (2)']);
  });

  it('produces a set with no duplicates, for any input', () => {
    const input = ['a.jpg', 'a.jpg', 'A.JPG', 'b.png', 'a.jpg'];
    const output = deduplicateNames(input);
    const lowered = output.map((name) => name.toLowerCase());
    expect(new Set(lowered).size).toBe(output.length);
  });
});

describe('isHeic', () => {
  it('detects by MIME type', () => {
    expect(isHeic({ name: 'x', type: 'image/heic' })).toBe(true);
    expect(isHeic({ name: 'x', type: 'image/heif' })).toBe(true);
  });

  it('falls back to the extension, which is often all there is', () => {
    // iOS and several file managers hand over an empty type.
    expect(isHeic({ name: 'IMG_4021.HEIC', type: '' })).toBe(true);
    expect(isHeic({ name: 'IMG_4021.heif', type: 'application/octet-stream' })).toBe(true);
  });

  it('does not claim ordinary images', () => {
    expect(isHeic({ name: 'cat.jpg', type: 'image/jpeg' })).toBe(false);
  });
});

describe('isSupportedImage', () => {
  it('accepts the usual formats', () => {
    for (const name of ['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.avif', 'a.gif', 'a.tiff']) {
      expect(isSupportedImage({ name, type: '' })).toBe(true);
    }
  });

  it('accepts anything the browser calls an image', () => {
    expect(isSupportedImage({ name: 'mystery', type: 'image/png' })).toBe(true);
  });

  it('rejects things that are plainly not images', () => {
    expect(isSupportedImage({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(isSupportedImage({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });
});
