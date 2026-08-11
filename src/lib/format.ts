/**
 * Human-readable numbers.
 */

const UNITS = ['B', 'kB', 'MB', 'GB'] as const;

/**
 * File sizes, in the units people's operating systems actually show.
 *
 * Decimal (1 kB = 1000 B) rather than binary, deliberately: macOS, iOS, and
 * every storage manufacturer use decimal, so a photo the Finder calls 4.2 MB
 * should not appear here as 4.0 MiB and start an argument about which is right.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }

  // One decimal below 10 (4.2 MB), none above (42 MB) — the precision people
  // read at a glance without it turning into noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/**
 * How much smaller the output got, as a percentage.
 *
 * Returns a negative number when a file grew, which genuinely happens — PNG is
 * a poor container for a photograph, and re-encoding an already-optimised JPEG
 * at high quality can add bytes. Reporting that honestly is the whole point;
 * quietly showing "0%" would hide a result the user should act on.
 */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

/** A short verdict on a conversion, for the row in the list. */
export function describeSavings(before: number, after: number): string {
  const percent = savingsPercent(before, after);
  if (percent > 0) return `${percent}% smaller`;
  if (percent < 0) return `${Math.abs(percent)}% larger`;
  return 'same size';
}

export function formatDimensions({ width, height }: { width: number; height: number }): string {
  return `${width} × ${height}`;
}

/** Pluralise without the "1 files" tell. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
