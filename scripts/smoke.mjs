/**
 * End-to-end smoke test, run against a real browser.
 *
 *   npm run build && npm run smoke
 *
 * The unit tests cover the arithmetic. This covers the part they cannot: that
 * a real file, dropped into a real browser, actually comes out the other side
 * converted, resized, and with its metadata gone. An image tool that does not
 * convert is worthless no matter how well its geometry is tested.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import piexif from 'piexifjs';
import sharp from 'sharp';

// `fileURLToPath`, not `.pathname` — the latter percent-encodes, so a checkout
// in a directory with a space in its name silently 404s every single request
// and the browser is handed a blank page.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 4180;

/*
 * Content types.
 *
 * `.mjs` matters more than it looks: the pdf.js worker is emitted as one, and a
 * browser refuses to execute a module served as application/octet-stream. Left
 * out, this harness reports a broken worker for a build that is perfectly fine —
 * which is exactly what it did.
 */
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  try {
    const body = await readFile(join(DIST, path));
    const type = MIME[extname(path)];
    // Say so rather than guessing octet-stream and letting the browser reject a
    // file the build emitted correctly.
    if (!type) console.warn(`  no content type for ${extname(path)} (${path}) — add it to MIME`);
    response.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

/**
 * A JPEG carrying real GPS, so metadata stripping is observed rather than assumed.
 *
 * Written with piexifjs rather than sharp's `withExif`: sharp accepts a GPS
 * block happily but produces something exifr cannot read back, which made an
 * earlier version of this test pass for the wrong reason.
 */
const plain = await sharp({
  create: { width: 1600, height: 1200, channels: 3, background: { r: 90, g: 120, b: 70 } },
})
  .jpeg({ quality: 95 })
  .toBuffer();

const exifBytes = piexif.dump({
  '0th': {
    [piexif.ImageIFD.Make]: 'Apple',
    [piexif.ImageIFD.Model]: 'Apple iPhone 15 Pro',
  },
  Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2024:06:03 12:00:00' },
  GPS: {
    [piexif.GPSIFD.GPSLatitudeRef]: 'N',
    [piexif.GPSIFD.GPSLatitude]: [[51, 1], [30, 1], [0, 1]],
    [piexif.GPSIFD.GPSLongitudeRef]: 'W',
    [piexif.GPSIFD.GPSLongitude]: [[0, 1], [7, 1], [0, 1]],
  },
});
const withGps = Buffer.from(piexif.insert(exifBytes, plain.toString('binary')), 'binary');

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
};

const browser = await chromium.launch();
// An explicit context, so the offline checks below can open a second page in
// it. `browser.newPage()` creates an implicit context that refuses more pages.
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

// pdf.js falls back to decoding on the main thread when its worker cannot be
// loaded, and the pixels come out identical — so checking the output alone
// cannot tell a working build from a broken one.
const workers = [];
page.on('worker', (worker) => workers.push(worker.url()));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

check('page loads', (await page.locator('h1').innerText()).includes('darkroom'));

// Feed the file in through the real input the drop zone uses.
await page.setInputFiles('input[type=file]', {
  name: 'IMG_4021.jpg',
  mimeType: 'image/jpeg',
  buffer: withGps,
});

await page.waitForSelector('button:has-text("Convert")', { timeout: 10_000 });
check('file enters the queue', (await page.locator('li').count()) > 0);

// Resize to 800px and convert to WebP, so both paths are exercised at once.
await page.getByRole('button', { name: 'Email', exact: true }).click();
await page.getByRole('button', { name: 'WebP', exact: true }).click();
await page.getByRole('button', { name: /^Convert$/ }).click();

await page.waitForSelector('a:has-text("Save")', { timeout: 30_000 });

const rowText = await page.locator('li').first().innerText();
check('output is renamed to the chosen format', rowText.includes('IMG_4021.webp'), rowText.split('\n')[0]);
check('output is resized to the preset', /800 × 600/.test(rowText), rowText.replace(/\n/g, ' | '));
check('metadata is reported as removed', /Removed/.test(rowText));
check('GPS specifically is named', /location \(51\.5000, -0\.1167\)/.test(rowText));
check('camera is named', /iPhone 15 Pro/.test(rowText));

// Pull the converted bytes back out of the page and inspect them for real.
const bytes = await page.evaluate(async () => {
  const href = document.querySelector('a[download]')?.getAttribute('href');
  if (!href) return null;
  const buffer = await (await fetch(href)).arrayBuffer();
  return Array.from(new Uint8Array(buffer.slice(0, 16)));
});

check('a downloadable blob exists', Array.isArray(bytes) && bytes.length > 0);
if (bytes) {
  // RIFF....WEBP
  const header = String.fromCharCode(...bytes);
  check('bytes really are WebP', header.startsWith('RIFF') && header.includes('WEBP'), header.replace(/[^\x20-\x7e]/g, '.'));
}

const fullBytes = await page.evaluate(async () => {
  const href = document.querySelector('a[download]')?.getAttribute('href');
  const buffer = await (await fetch(href)).arrayBuffer();
  return Array.from(new Uint8Array(buffer));
});

if (fullBytes) {
  const out = Buffer.from(fullBytes);
  const meta = await sharp(out).metadata();
  check('decoded output has the resized dimensions', meta.width === 800 && meta.height === 600, `${meta.width}×${meta.height}`);
  check('EXIF is gone from the output', !meta.exif, meta.exif ? 'exif still present' : 'none');
  check('output is smaller than the original', out.length < withGps.length, `${withGps.length} → ${out.length} bytes`);
}

/*
 * Images into a PDF.
 *
 * The interesting part is not that a PDF appears — it is what went into it.
 * pdf-lib embeds JPEG bytes verbatim, so combining the *original* photo would
 * carry its EXIF block, and the house coordinates in it, straight into the
 * document. Nothing on screen would show it. So this checks the bytes.
 */
const combined = page.waitForEvent('download', { timeout: 30_000 });
await page.getByRole('button', { name: 'Combine into PDF', exact: true }).click();

const download = await combined.catch(() => null);
if (download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pdf = Buffer.concat(chunks);

  check('combining images produces a PDF', pdf.subarray(0, 5).toString() === '%PDF-');

  const doc = await PDFDocument.load(pdf);
  check('one page per image', doc.getPageCount() === 1, `${doc.getPageCount()}`);

  // The EXIF marker, the camera model and the GPS tag name all live in the
  // block that must not have travelled.
  const leaked = ['Exif', 'iPhone 15 Pro', 'GPSLatitude'].filter((needle) =>
    pdf.includes(Buffer.from(needle, 'latin1')),
  );
  check('no EXIF rode along into the PDF', leaked.length === 0, leaked.join(', '));
} else {
  check('combining images produces a PDF', false, 'no download appeared');
}

/*
 * The document half.
 *
 * pdf.js needs a worker, which is the part that breaks under a bundler and
 * cannot be caught by a unit test — the operations themselves are covered in
 * Node, but whether the worker resolves at all is a build-time question.
 */
const sample = await PDFDocument.create();
const font = await sample.embedFont(StandardFonts.Helvetica);
for (let index = 1; index <= 3; index++) {
  sample.addPage([300, 400]).drawText(`page ${index}`, { x: 40, y: 200, size: 28, font });
}
const pdfBytes = Buffer.from(await sample.save());

await page.locator('text=Clear').first().click().catch(() => {});
await page.setInputFiles('input[type=file]', {
  name: 'contract.pdf',
  mimeType: 'application/pdf',
  buffer: pdfBytes,
});

await page.waitForSelector('text=What do you want to do?', { timeout: 15_000 });
check('a PDF is recognised as a document', true);
check('page count is read', (await page.locator('text=3 pages').count()) > 0);

// Keep pages 1 and 3.
await page.getByRole('button', { name: 'Keep pages', exact: true }).click();
await page.getByLabel('Page selection').fill('1,3');
await page.getByRole('button', { name: 'Do it', exact: true }).click();
await page.waitForSelector('a:has-text("Save")', { timeout: 20_000 });

const extracted = await page.evaluate(async () => {
  const href = document.querySelector('a[download$=".pdf"]')?.getAttribute('href');
  if (!href) return null;
  const buffer = await (await fetch(href)).arrayBuffer();
  return Array.from(new Uint8Array(buffer));
});

if (extracted) {
  const out = Buffer.from(extracted);
  const doc = await PDFDocument.load(out);
  check('extracted document really has 2 pages', doc.getPageCount() === 2, `${doc.getPageCount()}`);
  check('bytes really are a PDF', out.subarray(0, 5).toString() === '%PDF-');
} else {
  check('extracted document really has 2 pages', false, 'no download produced');
}

// Rendering pages to images is the path that needs the pdf.js worker.
await page.getByRole('button', { name: 'To images', exact: true }).click();
await page.getByLabel('Page selection').fill('2');
await page.getByRole('button', { name: 'Do it', exact: true }).click();
// Report whatever the panel actually says on failure. Asserting a cause here
// ("the worker failed to load") once sent me chasing the bundler for an hour
// while the real error sat on screen, unread.
await page
  .waitForSelector('a[download$=".png"]', { timeout: 30_000 })
  .then(() => check('pdf.js renders a page to PNG', true))
  .catch(async () => {
    const shown = await page.locator('.text-warn').last().innerText().catch(() => '');
    check('pdf.js renders a page to PNG', false, shown || 'no output and no error shown');
  });

const rendererWorker = workers.find((url) => /pdf\.worker/i.test(url));
check(
  'rendering ran in a worker, not on the main thread',
  Boolean(rendererWorker),
  rendererWorker ? rendererWorker.split('/').pop() : 'pdf.js fell back to the main thread',
);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '));

/*
 * Offline.
 *
 * The headline claim is that nothing is uploaded. The strongest way to
 * demonstrate that is for the whole app to keep working with the network
 * physically cut, so it is worth proving rather than asserting.
 *
 * localhost counts as a secure context, so the worker registers here exactly
 * as it would over HTTPS.
 */
const registered = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  return Boolean(registration?.active);
});
check('service worker takes control', registered);

if (registered) {
  await context.setOffline(true);

  const offlinePage = await context.newPage();
  await offlinePage.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await offlinePage.waitForTimeout(1200);

  const heading = await offlinePage.locator('h1').count();
  check('app still loads with the network cut', heading === 1);

  // And it must still actually convert, not merely render.
  await offlinePage.setInputFiles('input[type=file]', {
    name: 'offline.jpg',
    mimeType: 'image/jpeg',
    buffer: withGps,
  });
  await offlinePage.getByRole('button', { name: /^Convert$/ }).click();
  await offlinePage
    .waitForSelector('a:has-text("Save")', { timeout: 20_000 })
    .then(() => check('converts a photo while offline', true))
    .catch(() => check('converts a photo while offline', false));

  await context.setOffline(false);
  await offlinePage.close();
}

await browser.close();
server.close();

console.log(`\n${failures.length === 0 ? 'all checks passed' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
