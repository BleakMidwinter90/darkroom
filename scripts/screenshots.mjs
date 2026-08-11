/**
 * Renders the app to PNGs for the README.
 *
 *   npm run build && node scripts/screenshots.mjs
 *
 * Not part of CI: a screenshot job that fails on a machine without a browser is
 * a permanently red build for no benefit.
 */

import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import piexif from 'piexifjs';
import sharp from 'sharp';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PORT = 4190;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };

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

/** Photos that look like photos, each carrying plausible metadata. */
async function photo(width, height, rgb, name, place) {
  const plain = await sharp({ create: { width, height, channels: 3, background: rgb } })
    .jpeg({ quality: 92 })
    .toBuffer();

  const exif = piexif.dump({
    '0th': { [piexif.ImageIFD.Make]: 'Apple', [piexif.ImageIFD.Model]: 'Apple iPhone 15 Pro' },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2024:06:03 12:00:00' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [[place[0], 1], [place[1], 1], [0, 1]],
      [piexif.GPSIFD.GPSLongitudeRef]: 'W',
      [piexif.GPSIFD.GPSLongitude]: [[place[2], 1], [place[3], 1], [0, 1]],
    },
  });

  return {
    name,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(piexif.insert(exif, plain.toString('binary')), 'binary'),
  };
}

const files = [
  await photo(4032, 3024, { r: 96, g: 122, b: 84 }, 'IMG_4021.HEIC'.replace('.HEIC', '.jpg'), [51, 30, 0, 7]),
  await photo(3024, 4032, { r: 150, g: 108, b: 70 }, 'IMG_4022.jpg', [51, 28, 0, 9]),
  await photo(2400, 1600, { r: 74, g: 96, b: 132 }, 'kitchen-shelf.jpg', [51, 31, 0, 5]),
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [label, viewport] of [
  ['desktop', { width: 1120, height: 1000 }],
  ['phone', { width: 390, height: 900 }],
]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });

  // Empty state first — it is what most visitors actually see.
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `empty-${label}.png`) });
  console.log(`docs/screenshots/empty-${label}.png`);

  await page.setInputFiles('input[type=file]', files);
  await page.waitForSelector('button:has-text("Convert")');
  await page.getByRole('button', { name: 'Web', exact: true }).click();
  await page.getByRole('button', { name: /^Convert$/ }).click();
  await page.waitForSelector('a:has-text("Save")');
  await page.waitForTimeout(400);

  await page.screenshot({ path: join(OUT, `converted-${label}.png`), fullPage: true });
  console.log(`docs/screenshots/converted-${label}.png`);

  await page.close();
}

await browser.close();
server.close();
