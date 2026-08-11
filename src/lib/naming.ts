/**
 * Output filenames.
 *
 * Small, fiddly, and worth getting right: people batch a hundred holiday photos
 * and then have to find them again. Names stay recognisable, extensions match
 * what is actually inside the file, and nothing silently overwrites anything.
 */

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif';

const EXTENSIONS: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

export const MIME_TYPES: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/** Split "holiday.photo.HEIC" into ["holiday.photo", "HEIC"]. */
export function splitExtension(filename: string): [string, string] {
  const dot = filename.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension.
  if (dot <= 0) return [filename, ''];
  return [filename.slice(0, dot), filename.slice(dot + 1)];
}

/**
 * The name to save a converted file under.
 *
 * The stem is kept exactly as it was — `IMG_4021` stays `IMG_4021`, which is
 * what makes a converted batch still sort alongside the originals.
 */
export function outputName(original: string, format: OutputFormat): string {
  const [stem] = splitExtension(original);
  const safeStem = stem.trim() || 'image';
  return `${safeStem}.${EXTENSIONS[format]}`;
}

/**
 * Make every name in a batch unique.
 *
 * Two different folders can each hold an `IMG_0001.HEIC`, and converting both
 * to JPEG collides. Since these land in one zip or one downloads folder, the
 * second becomes `IMG_0001 (2).jpg` — the convention every desktop already
 * uses, so it needs no explanation.
 */
export function deduplicateNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return names.map((name) => {
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);

    if (count === 0) return name;

    const [stem, extension] = splitExtension(name);
    const suffixed = `${stem} (${count + 1})`;
    return extension ? `${suffixed}.${extension}` : suffixed;
  });
}

/** Whether the browser can decode this file without help. */
export function isHeic(file: { name: string; type: string }): boolean {
  if (/^image\/hei[cf]/i.test(file.type)) return true;
  // iOS and several file managers hand over an empty or generic MIME type, so
  // the extension is often the only signal there is.
  return /\.(heic|heif)$/i.test(file.name);
}

export function isSupportedImage(file: { name: string; type: string }): boolean {
  if (isHeic(file)) return true;
  if (/^image\//i.test(file.type)) return true;
  return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(file.name);
}
