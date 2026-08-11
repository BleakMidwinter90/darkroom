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
import piexif from 'piexifjs';
import sharp from 'sharp';

// `fileURLToPath`, not `.pathname` — the latter percent-encodes, so a checkout
// in a directory with a space in its name silently 404s every single request
// and the browser is handed a blank page.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 4180;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
};

const server = createServer(async (request, response) => {
  const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  try {
    const body = await readFile(join(DIST, path));
    response.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
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
