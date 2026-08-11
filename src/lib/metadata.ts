/**
 * Reading what a photo is carrying, before it gets dropped.
 *
 * Re-encoding through a canvas strips metadata whether we look at it or not.
 * We look at it first so the tool can *show* people what was in there — most
 * have no idea their holiday snaps carry the exact coordinates of wherever they
 * were standing, and a photo taken at home is a house address.
 *
 * The parsing is browser-side; the summarising below is pure and tested.
 */

export interface PhotoMetadata {
  gps?: { latitude: number; longitude: number };
  camera?: string;
  takenAt?: Date;
  /** Total count of tags found, including ones not surfaced individually. */
  tagCount: number;
}

/** One line describing what a photo gives away, or null if it gives nothing. */
export function describeMetadata(metadata: PhotoMetadata): string | null {
  const parts: string[] = [];

  if (metadata.gps) {
    parts.push(
      `location (${metadata.gps.latitude.toFixed(4)}, ${metadata.gps.longitude.toFixed(4)})`,
    );
  }
  if (metadata.camera) parts.push(metadata.camera);
  if (metadata.takenAt) {
    parts.push(
      new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(metadata.takenAt),
    );
  }

  if (parts.length === 0) return null;
  return parts.join(' · ');
}

/**
 * Whether this is worth warning about specifically.
 *
 * Camera model and date are mildly identifying; coordinates are a different
 * category of thing entirely, and the only one worth interrupting someone for.
 */
export function hasSensitiveMetadata(metadata: PhotoMetadata): boolean {
  return Boolean(metadata.gps);
}

/**
 * Pull metadata out of a file.
 *
 * Never throws. A file with no EXIF, a corrupt header, or a format exifr does
 * not know is a completely normal outcome — most PNGs and every screenshot have
 * nothing at all — and it must not stop the conversion.
 */
export async function readMetadata(file: File): Promise<PhotoMetadata> {
  try {
    const { parse } = await import('exifr');
    // Deliberately no `pick`. `latitude` and `longitude` are *derived* by exifr
    // from the raw GPSLatitude/GPSLatitudeRef pairs, so restricting the parse to
    // a tag list silently drops them — the parse still succeeds, still returns
    // the camera and the date, and simply never mentions the coordinates. That
    // would have made the entire privacy claim quietly false.
    const parsed = (await parse(file, { gps: true })) as Record<string, unknown> | undefined;

    if (!parsed) return { tagCount: 0 };

    const latitude = typeof parsed.latitude === 'number' ? parsed.latitude : undefined;
    const longitude = typeof parsed.longitude === 'number' ? parsed.longitude : undefined;
    const make = typeof parsed.Make === 'string' ? parsed.Make.trim() : '';
    const model = typeof parsed.Model === 'string' ? parsed.Model.trim() : '';

    return {
      gps:
        latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined,
      // "Apple iPhone 15 Pro", not "Apple Apple iPhone 15 Pro" — makers often
      // repeat themselves across the two fields.
      camera: joinCamera(make, model),
      takenAt: parsed.DateTimeOriginal instanceof Date ? parsed.DateTimeOriginal : undefined,
      tagCount: Object.keys(parsed).length,
    };
  } catch {
    return { tagCount: 0 };
  }
}

/** Combine maker and model without repeating the maker. */
export function joinCamera(make: string, model: string): string | undefined {
  if (!make && !model) return undefined;
  if (!make) return model;
  if (!model) return make;
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
}
