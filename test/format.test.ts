import { describe, expect, it } from 'vitest';

import {
  describeSavings,
  formatBytes,
  formatDimensions,
  plural,
  savingsPercent,
} from '../src/lib/format';

describe('formatBytes', () => {
  it('uses the decimal units operating systems show', () => {
    // Decimal, not binary: the Finder calls this 4.2 MB, so we must too.
    expect(formatBytes(4_200_000)).toBe('4.2 MB');
    expect(formatBytes(1000)).toBe('1.0 kB');
  });

  it('shows one decimal below ten and none above', () => {
    expect(formatBytes(4_200_000)).toBe('4.2 MB');
    expect(formatBytes(42_000_000)).toBe('42 MB');
  });

  it('shows plain bytes for tiny files', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('climbs through the units', () => {
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });

  it('refuses to invent a number for nonsense input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('savingsPercent', () => {
  it('reports a shrink', () => {
    expect(savingsPercent(1000, 250)).toBe(75);
  });

  it('reports growth honestly, as a negative', () => {
    // Re-encoding an optimised JPEG, or writing a photo as PNG, genuinely
    // makes files bigger. Hiding that behind a 0% would conceal a result the
    // user should act on.
    expect(savingsPercent(1000, 1500)).toBe(-50);
  });

  it('handles no change and no input', () => {
    expect(savingsPercent(1000, 1000)).toBe(0);
    expect(savingsPercent(0, 500)).toBe(0);
  });
});

describe('describeSavings', () => {
  it('says which direction it went', () => {
    expect(describeSavings(1000, 250)).toBe('75% smaller');
    expect(describeSavings(1000, 1500)).toBe('50% larger');
    expect(describeSavings(1000, 1000)).toBe('same size');
  });
});

describe('formatDimensions', () => {
  it('uses a multiplication sign, not a letter x', () => {
    expect(formatDimensions({ width: 4032, height: 3024 })).toBe('4032 × 3024');
  });
});

describe('plural', () => {
  it('avoids the "1 files" tell', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(2, 'file')).toBe('2 files');
    expect(plural(0, 'file')).toBe('0 files');
  });

  it('takes an irregular plural', () => {
    expect(plural(1, 'photo')).toBe('1 photo');
    expect(plural(3, 'entry', 'entries')).toBe('3 entries');
  });
});
