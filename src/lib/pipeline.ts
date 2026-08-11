/**
 * The image pipeline.
 *
 * Everything that touches a canvas, a codec, or a file lives here. The
 * arithmetic it depends on lives in `geometry.ts` and `naming.ts`, which are
 * pure and tested; this module is the part that can only run in a browser.
 *
 * Nothing here uploads anything. There is no network call in this file, and
 * that is the entire premise of the project rather than a nice extra.
 */

import { targetSize, type ResizeMode, type Size } from './geometry';
import { isHeic, MIME_TYPES, outputName, type OutputFormat } from './naming';

export interface ProcessOptions {
  format: OutputFormat;
  /** 0–1. Ignored by PNG, which is lossless. */
  quality: number;
  resize: ResizeMode;
}

export interface ProcessResult {
  name: string;
  blob: Blob;
  original: Size;
  output: Size;
  originalBytes: number;
  outputBytes: number;
}

/**
 * Decode any supported image to a bitmap, upright.
 *
 * `imageOrientation: 'from-image'` is doing quiet, essential work. A phone
 * writes the sensor data unrotated and records "turn this 90°" in the EXIF, so
 * a naive canvas pipeline strips the tag and produces a sideways photo. This is
 * the single most common bug in browser image tools, and the reason so many of
 * them rotate holiday photos onto their side.
 */
async function decode(file: File): Promise<ImageBitmap> {
  if (isHeic(file)) {
    // No browser can decode HEIC natively, so this is a wasm build of libheif —
    // and it is around 3 MB. Loading it on demand means the many people who
    // came to shrink a JPEG never download a codec they will not use.
    const { heicTo } = await import('heic-to');
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
  }

  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** Canvas encoding, preferring the offscreen path when the browser has it. */
async function encode(
  bitmap: ImageBitmap,
  size: Size,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  const mime = MIME_TYPES[format];

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a drawing context');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return canvas.convertToBlob({ type: mime, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get a drawing context');
  context.drawImage(bitmap, 0, 0, size.width, size.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this'))),
      mime,
      quality,
    );
  });
}

/**
 * Convert one file.
 *
 * Metadata is always dropped, because re-encoding through a canvas cannot carry
 * it. That is stated as a feature rather than hidden as a limitation: the GPS
 * coordinates in a photo taken at home are a house address, and most people
 * have no idea they are attached.
 */
export async function processFile(file: File, options: ProcessOptions): Promise<ProcessResult> {
  const bitmap = await decode(file);

  try {
    const original: Size = { width: bitmap.width, height: bitmap.height };
    const output = targetSize(original, options.resize);
    const blob = await encode(bitmap, output, options.format, options.quality);

    return {
      name: outputName(file.name, options.format),
      blob,
      original,
      output,
      originalBytes: file.size,
      outputBytes: blob.size,
    };
  } finally {
    // Bitmaps hold decoded pixels — tens of megabytes for a modern photo. On a
    // batch of a hundred, not releasing these is the difference between working
    // and crashing the tab.
    bitmap.close();
  }
}

/**
 * Which output formats this browser can actually write.
 *
 * Support genuinely varies — Safari gained AVIF encoding late, and some
 * browsers accept the MIME type then silently hand back a PNG. Checking by
 * encoding a real pixel and inspecting the result is the only reliable test.
 */
export async function supportedFormats(): Promise<OutputFormat[]> {
  const candidates: OutputFormat[] = ['jpeg', 'png', 'webp', 'avif'];
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  const supported: OutputFormat[] = [];
  for (const format of candidates) {
    const url = canvas.toDataURL(MIME_TYPES[format]);
    // A browser that cannot write the format falls back to PNG, so anything
    // claiming to be webp/avif but starting with the PNG prefix is a fake.
    if (url.startsWith(`data:${MIME_TYPES[format]}`)) supported.push(format);
  }

  return supported.length > 0 ? supported : ['png'];
}
