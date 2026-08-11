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

/*
 * Link previews live in the built HTML, so nothing at runtime notices when they
 * go missing — and a project nobody can see when it is shared is one nobody
 * opens. The image is checked for a real URL rather than merely being present.
 */
const shell = await readFile(join(DIST, 'index.html'), 'utf8');
check('the page describes itself for link previews', /property="og:title"/.test(shell));
const ogImage = shell.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? '';
check('and points at a real preview image', /^https?:\/\/\S+\.(png|jpe?g)$/.test(ogImage), ogImage);
check('the static title mentions both halves', /image and PDF/.test(shell));

/*
 * The front door is a list of jobs, not a drop zone. That list is the only
 * place the app says what it can do, so an empty or truncated one is a broken
 * landing page rather than a cosmetic problem.
 */
const offered = await page.locator('main button').allInnerTexts();
check('the landing page lists what the app does', offered.length >= 10, `${offered.length} tools`);
check('it offers photo work', offered.some((text) => /remove location data/i.test(text)));
check('it offers document work', offered.some((text) => /merge pdfs/i.test(text)));

// There is no file input until a job is chosen — that is the point of the change.
check('no upload prompt before choosing', (await page.locator('input[type=file]').count()) === 0);

await page.getByRole('button', { name: /Make a photo smaller/ }).click();
await page.waitForSelector('input[type=file]', { timeout: 10_000 });
check('choosing a job opens the upload step', true);

// Feed the file in through the real input the drop zone uses.
await page.setInputFiles('input[type=file]', {
  name: 'IMG_4021.jpg',
  mimeType: 'image/jpeg',
  buffer: withGps,
});

await page.waitForSelector('button:has-text("Convert")', { timeout: 10_000 });
check('file enters the queue', (await page.locator('li').count()) > 0);

/*
 * The job has to arrive configured, or the list is just a menu in front of the
 * same drop zone. "Make a photo smaller" means a dimension cap and real
 * compression — quality alone does not get a phone photo under a mail limit.
 */
const seeded = await page.locator('button[aria-pressed="true"]').allInnerTexts();
check('the chosen job arrives configured', seeded.includes('Web'), seeded.join(', '));
const seededQuality = await page.locator('.eyebrow:has-text("Quality")').innerText();
check('and at a quality that actually shrinks', /\b70\b/.test(seededQuality), seededQuality.replace(/\n/g, ' '));

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

// Back to the list, then into a document job.
await page.getByRole('button', { name: 'All tools', exact: true }).click();
await page.getByRole('button', { name: /Keep or reorder pages/ }).click();
await page.waitForSelector('input[type=file]', { timeout: 10_000 });

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

/*
 * Arriving by link, rather than by clicking the list.
 *
 * Seeding used to happen on the click, so every other route in — a link, a
 * bookmark, an app shortcut, the back button — got the previous job's settings.
 * The check above missed it precisely because it clicks the button.
 *
 * "Remove location data" is the one that matters: it must keep the format, or a
 * PNG screenshot comes back as a JPEG for a job that only strips metadata.
 */
const linkedIn = await context.newPage();
await linkedIn.goto(`http://localhost:${PORT}/#strip`, { waitUntil: 'networkidle' });
const transparent = await sharp({
  create: { width: 240, height: 180, channels: 4, background: { r: 200, g: 60, b: 40, alpha: 0.5 } },
})
  .png()
  .toBuffer();
await linkedIn.setInputFiles('input[type=file]', {
  name: 'shot.png',
  mimeType: 'image/png',
  buffer: transparent,
});
await linkedIn.waitForSelector('button:has-text("Convert")', { timeout: 10_000 });

const linkedSeed = await linkedIn.locator('button[aria-pressed="true"]').allInnerTexts();
check('a linked job arrives configured too', linkedSeed.includes('Keep format'), linkedSeed.join(', '));

await linkedIn.getByRole('button', { name: /^Convert$/ }).click();
await linkedIn.waitForSelector('a:has-text("Save")', { timeout: 20_000 });
const strippedName = await linkedIn.locator('a[download]').first().getAttribute('download');
check('a PNG stays a PNG', strippedName?.endsWith('.png') === true, strippedName ?? '');

const strippedBytes = Buffer.from(
  await linkedIn.evaluate(async () => {
    const href = document.querySelector('a[download]')?.getAttribute('href');
    return Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer()));
  }),
);
const strippedMeta = await sharp(strippedBytes).metadata();
check('with its transparency intact', strippedMeta.hasAlpha === true);
check('and no metadata', !strippedMeta.exif);
await linkedIn.close();

/*
 * Merge order.
 *
 * The sources get distinct page widths so the order can be read back out of the
 * result. A page count cannot do it: every possible order produces the same
 * count, so counting pages would pass whatever the merge did with them.
 */
const ordering = await context.newPage();
await ordering.goto(`http://localhost:${PORT}/#merge`, { waitUntil: 'networkidle' });

const sized = async (width, pages) => {
  const doc = await PDFDocument.create();
  for (let page = 0; page < pages; page++) doc.addPage([width, 400]);
  return Buffer.from(await doc.save());
};

await ordering.setInputFiles('input[type=file]', [
  { name: 'first.pdf', mimeType: 'application/pdf', buffer: await sized(300, 1) },
  { name: 'second.pdf', mimeType: 'application/pdf', buffer: await sized(310, 2) },
  { name: 'third.pdf', mimeType: 'application/pdf', buffer: await sized(320, 3) },
]);
await ordering.waitForSelector('text=What do you want to do?', { timeout: 15_000 });

const mergedWidths = async () => {
  const bytes = await ordering.evaluate(async () => {
    const href = document.querySelector('a[download$=".pdf"]')?.getAttribute('href');
    if (!href) return null;
    return Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer()));
  });
  if (!bytes) return null;
  const doc = await PDFDocument.load(Buffer.from(bytes));
  return doc.getPages().map((page) => Math.round(page.getSize().width));
};

await ordering.getByRole('button', { name: 'Do it', exact: true }).click();
await ordering.waitForSelector('a:has-text("Save")', { timeout: 20_000 });
check(
  'merging follows the order shown',
  JSON.stringify(await mergedWidths()) === JSON.stringify([300, 310, 310, 320, 320, 320]),
);

await ordering.getByLabel('Move third.pdf earlier').click();
await ordering.getByLabel('Move third.pdf earlier').click();

/*
 * Wait for the href to change rather than sleeping.
 *
 * A fixed delay here was a real flake: running the merge clears the outputs and
 * builds a new blob, so a slow CI runner could be read either mid-gap with no
 * link at all, or early enough to still see the previous merged.pdf — failing a
 * check on an app that was behaving correctly.
 */
const previousHref = await ordering
  .locator('a[download$=".pdf"]')
  .first()
  .getAttribute('href');

await ordering.getByRole('button', { name: 'Do it', exact: true }).click();
await ordering.waitForFunction(
  (stale) => {
    const href = document.querySelector('a[download$=".pdf"]')?.getAttribute('href');
    return Boolean(href) && href !== stale;
  },
  previousHref,
  { timeout: 20_000 },
);
check(
  'and moving a document changes the output',
  JSON.stringify(await mergedWidths()) === JSON.stringify([320, 320, 320, 300, 310, 310]),
);
await ordering.close();

/*
 * Merging needs two files, and used to pretend otherwise.
 *
 * With one document the Merge button was hidden, leaving nothing selected and a
 * "Do it" that produced a single-file copy called merged.pdf.
 */
const one = await context.newPage();
await one.goto(`http://localhost:${PORT}/#merge`, { waitUntil: 'networkidle' });
await one.setInputFiles('input[type=file]', {
  name: 'only.pdf',
  mimeType: 'application/pdf',
  buffer: pdfBytes,
});
await one.waitForSelector('text=What do you want to do?', { timeout: 15_000 });

check(
  'the job you chose is still the one selected',
  (await one.getByRole('button', { name: 'Merge', exact: true }).getAttribute('aria-pressed')) ===
    'true',
);
check(
  'merging one file is refused, not silently done',
  await one.getByRole('button', { name: 'Do it', exact: true }).isDisabled(),
);
check(
  'and it says why',
  /add another pdf/i.test(await one.locator('.panel').last().innerText()),
);
await one.close();

/*
 * "Photos into a PDF" has to finish the job without a detour.
 *
 * Converting first is a step on the way, not something to require: someone who
 * picked this job and pressed the obvious button should get a PDF.
 */
const toPdf = await context.newPage();
await toPdf.goto(`http://localhost:${PORT}/#to-pdf`, { waitUntil: 'networkidle' });
await toPdf.setInputFiles('input[type=file]', {
  name: 'receipt.jpg',
  mimeType: 'image/jpeg',
  buffer: withGps,
});
await toPdf.waitForSelector('button:has-text("Combine into PDF")', { timeout: 10_000 });

const directPdf = toPdf.waitForEvent('download', { timeout: 30_000 });
await toPdf.getByRole('button', { name: 'Combine into PDF', exact: true }).click();
const straight = await directPdf.catch(() => null);

if (straight) {
  const stream = await straight.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  check('photos become a PDF without converting first', bytes.subarray(0, 5).toString() === '%PDF-');
  check(
    'and that PDF carries no EXIF either',
    !bytes.includes(Buffer.from('Exif', 'latin1')),
  );
} else {
  check('photos become a PDF without converting first', false, 'no download appeared');
}
await toPdf.close();

/*
 * Addressable tools.
 *
 * A link to a tool has to open that tool, and back has to return to the list
 * rather than leaving the app — which is what it did before each tool had an
 * address.
 */
const linked = await context.newPage();
await linked.goto(`http://localhost:${PORT}/#merge`, { waitUntil: 'networkidle' });
check(
  'a link opens the tool it names',
  /merge pdfs/i.test(await linked.locator('main h2').first().innerText()),
);

await linked.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await linked.getByRole('button', { name: /Rotate pages/ }).click();
await linked.goBack();
await linked.waitForTimeout(300);
check(
  'back returns to the list',
  (await linked.getByRole('button', { name: /Merge PDFs/ }).count()) > 0,
);

await linked.goto(`http://localhost:${PORT}/#no-such-tool`, { waitUntil: 'networkidle' });
check(
  'a stale link opens the list rather than breaking',
  (await linked.getByRole('button', { name: /Merge PDFs/ }).count()) > 0,
);
await linked.close();

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

  // And it must still actually convert, not merely render — including the task
  // list, which is the only route to the converter now.
  await offlinePage.getByRole('button', { name: /Convert a photo/ }).click();
  await offlinePage.waitForSelector('input[type=file]', { timeout: 10_000 });
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

  /*
   * And a PDF renders offline once its worker has been fetched.
   *
   * The renderer is a 1.3 MB worker fetched on first use rather than on
   * install, exactly like the HEIC decoder — so the honest claim is not "PDFs
   * work offline" but "they work offline after the first time". That is what
   * the README says, so it is what gets checked.
   */
  const offlinePdf = await context.newPage();
  await offlinePdf.goto(`http://localhost:${PORT}/#to-images`, {
    waitUntil: 'domcontentloaded',
  });
  await offlinePdf.setInputFiles('input[type=file]', {
    name: 'offline.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });
  await offlinePdf.waitForSelector('text=What do you want to do?', { timeout: 15_000 });
  await offlinePdf.getByLabel('Page selection').fill('1');
  await offlinePdf.getByRole('button', { name: 'Do it', exact: true }).click();
  await offlinePdf
    .waitForSelector('a[download$=".png"]', { timeout: 30_000 })
    .then(() => check('renders a PDF page while offline', true))
    .catch(async () => {
      const shown = await offlinePdf.locator('.text-warn').last().innerText().catch(() => '');
      check('renders a PDF page while offline', false, shown || 'no output');
    });
  await offlinePdf.close();

  await context.setOffline(false);
  await offlinePage.close();
}

await browser.close();
server.close();

console.log(`\n${failures.length === 0 ? 'all checks passed' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
