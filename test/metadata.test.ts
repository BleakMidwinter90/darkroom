import { describe, expect, it } from 'vitest';

import {
  describeMetadata,
  hasSensitiveMetadata,
  joinCamera,
  type PhotoMetadata,
} from '../src/lib/metadata';

describe('joinCamera', () => {
  it('does not repeat the maker when the model already names it', () => {
    // EXIF routinely stores Make="Apple", Model="Apple iPhone 15 Pro".
    expect(joinCamera('Apple', 'Apple iPhone 15 Pro')).toBe('Apple iPhone 15 Pro');
  });

  it('joins them when the model does not name the maker', () => {
    expect(joinCamera('Canon', 'EOS R6')).toBe('Canon EOS R6');
  });

  it('copes with either side missing', () => {
    expect(joinCamera('', 'Pixel 8')).toBe('Pixel 8');
    expect(joinCamera('NIKON', '')).toBe('NIKON');
    expect(joinCamera('', '')).toBeUndefined();
  });

  it('is case-insensitive about the overlap', () => {
    expect(joinCamera('SONY', 'sony ILCE-7M4')).toBe('sony ILCE-7M4');
  });
});

describe('describeMetadata', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeMetadata({ tagCount: 0 })).toBeNull();
  });

  it('leads with coordinates, which are the part that matters', () => {
    const text = describeMetadata({
      gps: { latitude: 51.5014, longitude: -0.1419 },
      tagCount: 12,
    });
    expect(text).toBe('location (51.5014, -0.1419)');
  });

  it('combines everything it found', () => {
    const text = describeMetadata({
      gps: { latitude: 51.5, longitude: -0.14 },
      camera: 'Apple iPhone 15 Pro',
      takenAt: new Date('2024-06-03T12:00:00Z'),
      tagCount: 30,
    });
    expect(text).toContain('location');
    expect(text).toContain('Apple iPhone 15 Pro');
    expect(text).toContain('3 Jun 2024');
  });

  it('handles a photo with a camera but no location', () => {
    expect(describeMetadata({ camera: 'Canon EOS R6', tagCount: 8 })).toBe('Canon EOS R6');
  });

  it('rounds coordinates rather than printing float noise', () => {
    const text = describeMetadata({
      gps: { latitude: 51.50142857142857, longitude: -0.14190476190476 },
      tagCount: 1,
    });
    expect(text).toBe('location (51.5014, -0.1419)');
  });
});

describe('hasSensitiveMetadata', () => {
  it('treats coordinates as the thing worth interrupting for', () => {
    expect(hasSensitiveMetadata({ gps: { latitude: 1, longitude: 2 }, tagCount: 5 })).toBe(true);
  });

  it('does not cry wolf over a camera model or a date', () => {
    const mild: PhotoMetadata = {
      camera: 'Canon EOS R6',
      takenAt: new Date('2024-01-01'),
      tagCount: 20,
    };
    expect(hasSensitiveMetadata(mild)).toBe(false);
  });

  it('is false for a file with no metadata at all', () => {
    expect(hasSensitiveMetadata({ tagCount: 0 })).toBe(false);
  });
});
