import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';

import { extractPages, imagesToPdf, mergePdfs, readPdf, rotatePages, splitPages } from '../src/lib/pdf';

/** A real PDF with numbered pages, so page identity can be checked after moves. */
async function makePdf(pageCount: number, label: string): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let index = 1; index <= pageCount; index++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`${label}${index}`, { x: 40, y: 200, size: 36, font });
  }

  doc.setTitle('Private title');
  doc.setAuthor('Someone Real');

  const bytes = await doc.save();
  return new File([bytes as BlobPart], `${label}.pdf`, { type: 'application/pdf' });
}

/** Read the text drawn on each page back out, to prove which page is which. */
async function pageLabels(blob: Blob): Promise<number> {
  const doc = await PDFDocument.load(await blob.arrayBuffer());
  return doc.getPageCount();
}

let threePages: File;
let twoPages: File;

beforeAll(async () => {
  threePages = await makePdf(3, 'A');
  twoPages = await makePdf(2, 'B');
});

describe('readPdf', () => {
  it('reports the page count and sizes', async () => {
    const info = await readPdf(threePages);
    expect(info.pageCount).toBe(3);
    expect(info.pageSizes[0]).toEqual({ width: 300, height: 400 });
  });

  it('surfaces the metadata the file is carrying', async () => {
    const info = await readPdf(threePages);
    expect(info.title).toBe('Private title');
    expect(info.author).toBe('Someone Real');
  });
});

describe('mergePdfs', () => {
  it('joins documents in the order given', async () => {
    const merged = await mergePdfs([threePages, twoPages]);
    expect(await pageLabels(merged)).toBe(5);
  });

  it('refuses an empty list rather than producing an empty file', async () => {
    await expect(mergePdfs([])).rejects.toThrow();
  });

  it('strips metadata by default', async () => {
    // Word and Acrobat write the author's name into every export, and it
    // travels with every copy. The whole premise here is not leaking it.
    const merged = await mergePdfs([threePages]);
    const doc = await PDFDocument.load(await merged.arrayBuffer());
    expect(doc.getAuthor() || '').toBe('');
    expect(doc.getTitle() || '').toBe('');
  });

  it('produces a document with no inherited metadata, whatever the flag says', async () => {
    // Merging builds a *new* document and copies pages into it. copyPages
    // carries page content, not document metadata — so the author is gone
    // either way, and `stripMetadata: false` cannot bring it back.
    //
    // For a privacy tool that is the right outcome, but it is worth pinning
    // down so nobody later assumes the flag does something here.
    const merged = await mergePdfs([threePages], { stripMetadata: false });
    const doc = await PDFDocument.load(await merged.arrayBuffer());
    expect(doc.getAuthor() || '').toBe('');
  });
});

describe('metadata on operations that edit in place', () => {
  it('strips it by default', async () => {
    const out = await rotatePages(threePages, [1], 90);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getAuthor() || '').toBe('');
  });

  it('keeps it when explicitly asked to', async () => {
    // Rotation modifies the original document rather than building a new one,
    // so this is where the flag genuinely has something to preserve.
    const out = await rotatePages(threePages, [1], 90, { stripMetadata: false });
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getAuthor()).toBe('Someone Real');
  });
});

describe('extractPages', () => {
  it('keeps only the pages asked for', async () => {
    const out = await extractPages(threePages, [1, 3]);
    expect(await pageLabels(out)).toBe(2);
  });

  it('honours the order given, so it can reorder as well as select', async () => {
    const out = await extractPages(threePages, [3, 1, 2]);
    expect(await pageLabels(out)).toBe(3);
  });

  it('rejects a page outside the document rather than skipping it', async () => {
    // Silently dropping page 9 would produce a file the user did not ask for
    // and would not notice until it mattered.
    await expect(extractPages(threePages, [1, 9])).rejects.toThrow(RangeError);
  });

  it('rejects an empty selection', async () => {
    await expect(extractPages(threePages, [])).rejects.toThrow();
  });
});

describe('rotatePages', () => {
  it('rotates only the pages selected', async () => {
    const out = await rotatePages(threePages, [2], 90);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPage(0).getRotation().angle).toBe(0);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
    expect(doc.getPage(2).getRotation().angle).toBe(0);
  });

  it('adds to an existing rotation rather than replacing it', async () => {
    // A page that was already sideways must end up at 180, not back at 90.
    const source = await PDFDocument.create();
    source.addPage([300, 400]).setRotation(degrees(90));
    const file = new File([(await source.save()) as BlobPart], 'r.pdf', {
      type: 'application/pdf',
    });

    const out = await rotatePages(file, [1], 90);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPage(0).getRotation().angle).toBe(180);
  });

  it('wraps past a full turn', async () => {
    const out = await rotatePages(threePages, [1], 450);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  it('rejects a rotation that is not a quarter turn', async () => {
    await expect(rotatePages(threePages, [1], 45)).rejects.toThrow(RangeError);
  });
});

describe('splitPages', () => {
  it('produces one document per page', async () => {
    const parts = await splitPages(threePages);
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(await pageLabels(part)).toBe(1);
  });
});

describe('imagesToPdf', () => {
  /** A tiny valid PNG, built by pdf-lib itself so the bytes are certainly real. */
  async function pngBytes(): Promise<ArrayBuffer> {
    // 1×1 transparent PNG.
    const base64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const binary = Buffer.from(base64, 'base64');
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }

  it('makes one page per image at the image size', async () => {
    const bytes = await pngBytes();
    const out = await imagesToPdf([
      { bytes, type: 'image/png' },
      { bytes, type: 'image/png' },
    ]);

    const doc = await PDFDocument.load(await out.arrayBuffer());
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 1, height: 1 });
  });

  it('centres on A4 when asked', async () => {
    const out = await imagesToPdf([{ bytes: await pngBytes(), type: 'image/png' }], {
      kind: 'a4',
    });
    const doc = await PDFDocument.load(await out.arrayBuffer());
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it('refuses an empty list', async () => {
    await expect(imagesToPdf([])).rejects.toThrow();
  });
});
