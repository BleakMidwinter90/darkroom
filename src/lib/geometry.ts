/**
 * Resize arithmetic.
 *
 * Kept pure and free of any DOM so it can be tested properly. Everything that
 * touches a canvas lives in `pipeline.ts`; this file only decides what size the
 * output should be.
 */

export interface Size {
  width: number;
  height: number;
}

export type ResizeMode =
  /** Leave the image at its original size. */
  | { kind: 'none' }
  /** Fit inside a box, preserving aspect ratio. */
  | { kind: 'fit'; maxWidth: number; maxHeight: number }
  /** Fit the longest edge to a length, preserving aspect ratio. */
  | { kind: 'longestEdge'; length: number }
  /** Scale by a factor. 0.5 halves each dimension. */
  | { kind: 'scale'; factor: number };

/**
 * Whether an image is allowed to grow.
 *
 * Almost never what anybody wants: enlarging a 400px photo to 2000px produces a
 * blurry 2000px photo and a much larger file, which is the opposite of why
 * people reach for a resize tool. Off by default, and opt-in only.
 */
export interface ResizeOptions {
  allowUpscale?: boolean;
}

function clampToPixel(value: number): number {
  // Never round down to zero — a 1×5000 panorama scaled hard still has to be a
  // real image, and a canvas of width 0 throws.
  return Math.max(1, Math.round(value));
}

/**
 * The size an image should be written at.
 *
 * Aspect ratio is always preserved; there is no stretch mode, because a tool
 * that silently distorts a photo is worse than one that refuses.
 */
export function targetSize(
  source: Size,
  mode: ResizeMode,
  options: ResizeOptions = {},
): Size {
  if (source.width <= 0 || source.height <= 0) {
    throw new RangeError('Source image has no area');
  }

  const scaled = rawScale(source, mode);

  if (options.allowUpscale === true) {
    return { width: clampToPixel(scaled.width), height: clampToPixel(scaled.height) };
  }

  // Every mode preserves aspect ratio, so both axes share one scale factor.
  // Capping it at 1 is what makes "fit inside 4000px" a no-op for a 400px
  // image rather than a blurry enlargement.
  const ratio = Math.min(1, scaled.width / source.width);

  return {
    width: clampToPixel(source.width * ratio),
    height: clampToPixel(source.height * ratio),
  };
}

function rawScale(source: Size, mode: ResizeMode): Size {
  switch (mode.kind) {
    case 'none':
      return source;

    case 'fit': {
      if (mode.maxWidth <= 0 || mode.maxHeight <= 0) {
        throw new RangeError('Fit dimensions must be positive');
      }
      const ratio = Math.min(mode.maxWidth / source.width, mode.maxHeight / source.height);
      return { width: source.width * ratio, height: source.height * ratio };
    }

    case 'longestEdge': {
      if (mode.length <= 0) throw new RangeError('Edge length must be positive');
      const longest = Math.max(source.width, source.height);
      const ratio = mode.length / longest;
      return { width: source.width * ratio, height: source.height * ratio };
    }

    case 'scale': {
      if (!(mode.factor > 0)) throw new RangeError('Scale factor must be positive');
      return { width: source.width * mode.factor, height: source.height * mode.factor };
    }
  }
}

/** Whether this mode would actually change the image at all. */
export function willResize(source: Size, mode: ResizeMode, options?: ResizeOptions): boolean {
  const target = targetSize(source, mode, options);
  return target.width !== source.width || target.height !== source.height;
}

/** Megapixels, for warning about images large enough to stall a phone. */
export function megapixels(size: Size): number {
  return Math.round(((size.width * size.height) / 1_000_000) * 10) / 10;
}
