import { isHeic, type OutputFormat } from './naming';

/**
 * What the user asked for, which may be "whatever this already was".
 *
 * "Remove location data" is the case that needs it. The job is taking the GPS
 * and camera out of a file, not changing the picture — but every output has to
 * name a format, so a PNG screenshot went out as a JPEG: lossy, and with any
 * transparency flattened, for a task that was only meant to strip metadata.
 */
export type FormatChoice = OutputFormat | 'original';

/**
 * Resolve `original` against the file it applies to.
 *
 * Falls back to JPEG for anything the browser cannot write back. HEIC is the
 * common one — no browser encodes it, so "keep the format" would otherwise mean
 * "produce nothing".
 *
 * GIF, BMP and TIFF resolve to PNG rather than JPEG: they are the formats
 * people use for screenshots and line art, where JPEG's ringing is at its most
 * obvious and where transparency may be load-bearing.
 */
export function resolveFormat(
  file: { name: string; type: string },
  choice: FormatChoice,
  supported: readonly OutputFormat[] = ['jpeg', 'png', 'webp', 'avif'],
): OutputFormat {
  if (choice !== 'original') return choice;

  // No browser encodes HEIC, so the honest answer is a format that exists.
  if (isHeic(file)) return 'jpeg';

  const wanted = matchSource(file);
  return supported.includes(wanted) ? wanted : 'jpeg';
}

function matchSource(file: { name: string; type: string }): OutputFormat {
  const subject = `${file.type} ${file.name}`.toLowerCase();

  if (/png/.test(subject)) return 'png';
  if (/webp/.test(subject)) return 'webp';
  if (/avif/.test(subject)) return 'avif';
  if (/jpe?g/.test(subject)) return 'jpeg';
  // Lossless sources where JPEG artefacts would be plainly visible.
  if (/gif|bmp|tiff?/.test(subject)) return 'png';

  return 'jpeg';
}
