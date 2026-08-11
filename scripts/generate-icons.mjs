/**
 * Generates the app icons from one vector definition.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is an aperture blade half-open against the safelight: the darkroom
 * idea and the "your photo, only partly revealed" idea in the same shape. It
 * reads at 32px, which most logos do not.
 *
 * Committed as PNGs so CI needs no image toolchain.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const BASE = '#0c0b0a';
const AMBER = '#e8933a';
const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));

function markSvg(size, { padding = 0.22 } = {}) {
  const c = size / 2;
  const r = (size / 2) * (1 - padding);
  const stroke = size * 0.075;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BASE}"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${AMBER}" stroke-width="${stroke.toFixed(2)}"/>
  <path d="M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} Z" fill="${AMBER}"/>
</svg>`;
}

await mkdir(OUT, { recursive: true });

for (const [file, size, options] of [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { padding: 0.32 }],
  ['apple-touch-icon.png', 180, { padding: 0.18 }],
  ['favicon-32.png', 32, { padding: 0.12 }],
]) {
  const png = await sharp(Buffer.from(markSvg(size, options))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(OUT + file, png);
  console.log(`public/icons/${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

await writeFile(OUT + 'mark.svg', markSvg(512));
console.log('public/icons/mark.svg');
