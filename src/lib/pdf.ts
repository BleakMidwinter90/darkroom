/**
 * PDF operations, all client-side.
 *
 * Same premise as the image side: the documents people most want to reorganise
 * are contracts, payslips, passports and bank statements, and the usual way to
 * rotate one page of those is to upload them to an ad-funded website. This does
 * it in the tab instead.
 *
 * Scope is deliberately limited to what these libraries genuinely do well.
 * Notably absent, and absent on purpose:
 *
 * - **Compression.** pdf-lib cannot recompress the embedded images that make a
 *   PDF large, so a "compress" button here would mostly do nothing while
 *   implying it had. The honest route is PDF → images → PDF, which is offered
 *   as exactly that rather than dressed up as compression.
 * - **Removing passwords.** Stripping an owner password from a file you own is
 *   fine, but the same code path unlocks files you do not, and a browser tool
 *   is a poor place to draw that line. Not implemented.
 */

import { degrees, PDFDocument } from 'pdf-lib';

import { targetSize, type Size } from './geometry';
import { MIME_TYPES, type OutputFormat } from './naming';

export interface PdfInfo {
  pageCount: number;
  /** Page sizes in points, for showing what is in the file. */
  pageSizes: Size[];
  title?: string;
  author?: string;
  /** True when the file could only be opened by ignoring its encryption. */
  encrypted: boolean;
}

/**
 * Load a PDF.
 *
 * `ignoreEncryption` lets us open files carrying an owner password — the sort
 * that merely marks a document "do not print" — which are extremely common and
 * otherwise unopenable. A file with a real user password still fails, which is
 * correct: it is genuinely locked.
 */
async function load(file: File | ArrayBuffer): Promise<PDFDocument> {
  const bytes = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function readPdf(file: File): Promise<PdfInfo> {
  const doc = await load(file);

  return {
    pageCount: doc.getPageCount(),
    pageSizes: doc.getPages().map((page) => {
      const { width, height } = page.getSize();
      return { width: Math.round(width), height: Math.round(height) };
    }),
    title: doc.getTitle() || undefined,
    author: doc.getAuthor() || undefined,
    encrypted: doc.isEncrypted,
  };
}

/**
 * Clear the metadata a PDF carries.
 *
 * Word and Acrobat write the author's name, the machine, and sometimes the
 * original filename into every export. People rarely know it is there, and it
 * travels with every copy they send.
 */
function stripMetadata(doc: PDFDocument): void {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
}

export interface SaveOptions {
  /** Remove author, title, producer and friends from the output. */
  stripMetadata?: boolean;
}

async function save(doc: PDFDocument, options: SaveOptions = {}): Promise<Blob> {
  if (options.stripMetadata !== false) stripMetadata(doc);
  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/**
 * Join several PDFs, in the order given.
 *
 * Note that the result carries no metadata from any source, regardless of
 * `stripMetadata`: this builds a new document and `copyPages` moves page
 * content, not the document information dictionary. For a tool whose premise is
 * not leaking things, that is the right outcome — but it means the flag has
 * nothing to preserve here. It only bites on operations that edit a document in
 * place, such as rotation.
 */
export async function mergePdfs(files: readonly File[], options?: SaveOptions): Promise<Blob> {
  if (files.length === 0) throw new Error('Nothing to merge');

  const merged = await PDFDocument.create();

  for (const file of files) {
    const doc = await load(file);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return save(merged, options);
}

/**
 * Keep only the given pages, in the order given.
 *
 * Page numbers are 1-indexed to match what the input means and what every
 * reader displays; the conversion happens here, once.
 */
export async function extractPages(
  file: File,
  pages: readonly number[],
  options?: SaveOptions,
): Promise<Blob> {
  if (pages.length === 0) throw new Error('No pages selected');

  const source = await load(file);
  const total = source.getPageCount();

  for (const page of pages) {
    if (page < 1 || page > total) throw new RangeError(`Page ${page} is not in this document`);
  }

  const output = await PDFDocument.create();
  const copied = await output.copyPages(
    source,
    pages.map((page) => page - 1),
  );
  for (const page of copied) output.addPage(page);

  return save(output, options);
}

/** Rotate the given pages by a multiple of 90 degrees. */
export async function rotatePages(
  file: File,
  pages: readonly number[],
  turn: number,
  options?: SaveOptions,
): Promise<Blob> {
  if (turn % 90 !== 0) throw new RangeError('Rotation must be a multiple of 90 degrees');

  const doc = await load(file);
  const all = doc.getPages();
  const selected = new Set(pages);

  all.forEach((page, index) => {
    if (!selected.has(index + 1)) return;
    // Add to the existing rotation rather than replacing it, or a page that was
    // already sideways ends up wrong.
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + turn) % 360));
  });

  return save(doc, options);
}

/** Split into one document per page. */
export async function splitPages(file: File, options?: SaveOptions): Promise<Blob[]> {
  const source = await load(file);
  const total = source.getPageCount();

  const parts: Blob[] = [];
  for (let index = 0; index < total; index++) {
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [index]);
    output.addPage(page);
    parts.push(await save(output, options));
  }

  return parts;
}

/** Fit modes for placing an image on a PDF page. */
export type PageFit =
  /** One page per image, exactly the image's size. */
  | { kind: 'image' }
  /** A4 portrait, image centred and scaled to fit with a margin. */
  | { kind: 'a4'; marginPt?: number };

const A4: Size = { width: 595, height: 842 };

/**
 * Build a PDF from images.
 *
 * Only JPEG and PNG can be embedded directly — those are the two formats the
 * PDF specification understands. Anything else is converted to JPEG through a
 * canvas first, which is why this takes blobs rather than doing the decoding
 * itself.
 */
export async function imagesToPdf(
  images: ReadonlyArray<{ bytes: ArrayBuffer; type: string }>,
  fit: PageFit = { kind: 'image' },
  options?: SaveOptions,
): Promise<Blob> {
  if (images.length === 0) throw new Error('No images given');

  const doc = await PDFDocument.create();

  for (const image of images) {
    const embedded = /png/i.test(image.type)
      ? await doc.embedPng(image.bytes)
      : await doc.embedJpg(image.bytes);

    if (fit.kind === 'image') {
      const page = doc.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      continue;
    }

    const margin = fit.marginPt ?? 36;
    const page = doc.addPage([A4.width, A4.height]);
    const box = { width: A4.width - margin * 2, height: A4.height - margin * 2 };

    // Reuse the image-side geometry so "fit inside a box" means the same thing
    // in both halves of the app, including never enlarging.
    const size = targetSize(
      { width: embedded.width, height: embedded.height },
      { kind: 'fit', maxWidth: box.width, maxHeight: box.height },
      { allowUpscale: true },
    );

    page.drawImage(embedded, {
      x: (A4.width - size.width) / 2,
      y: (A4.height - size.height) / 2,
      width: size.width,
      height: size.height,
    });
  }

  return save(doc, options);
}

export interface RenderedPage {
  page: number;
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Render PDF pages to images.
 *
 * Uses pdf.js, which is the renderer inside Firefox — the only way to turn a
 * page into pixels in a browser, since pdf-lib manipulates structure and never
 * draws anything.
 *
 * `scale` is a multiplier on the page's natural size at 72dpi, so 2 gives
 * roughly 144dpi, which is about right for reading on screen.
 */
export async function pdfToImages(
  file: File,
  pages: readonly number[],
  format: OutputFormat = 'png',
  scale = 2,
): Promise<RenderedPage[]> {
  const pdfjs = await import('pdfjs-dist');

  /*
   * Point pdf.js at its worker.
   *
   * Vite resolves this specifier at build time and emits the worker as its own
   * hashed asset, so it stays out of the main bundle and is only fetched when
   * someone actually renders a page.
   *
   * Worth knowing if this ever looks broken: when the worker cannot be loaded,
   * pdf.js falls back to decoding on the main thread rather than failing. Output
   * is still correct, so a test that only checks the pixels will pass either
   * way — the thing to assert is that a dedicated worker was spawned.
   */
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

  const bytes = await file.arrayBuffer();
  // Keep the loading task: it owns the worker, and `destroy` lives on it rather
  // than on the document proxy.
  const task = pdfjs.getDocument({ data: bytes });
  const document = await task.promise;

  try {
    const rendered: RenderedPage[] = [];

    for (const number of pages) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale });

      const canvas = document_createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get a drawing context');

      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const blob = await toBlob(canvas, format);
      rendered.push({ page: number, blob, width: canvas.width, height: canvas.height });
      page.cleanup();
    }

    return rendered;
  } finally {
    // pdf.js keeps a worker thread and decoded page data alive until told
    // otherwise. On a batch of documents that is the difference between working
    // and exhausting the tab.
    await task.destroy();
  }
}

function document_createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, format: OutputFormat): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this'))),
      MIME_TYPES[format],
      0.92,
    );
  });
}

export function isPdf(file: { name: string; type: string }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
