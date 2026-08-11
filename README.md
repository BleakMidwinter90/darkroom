<div align="center">

# ◐ darkroom

**Image tools that never leave your device.**

Convert HEIC, shrink, resize, and strip location data from your photos — entirely in your browser.

[![CI](https://github.com/BleakMidwinter90/darkroom/actions/workflows/ci.yml/badge.svg)](https://github.com/BleakMidwinter90/darkroom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

<img src="docs/screenshots/converted-desktop.png" alt="darkroom converting three photos, showing the location data removed from each" width="720">

</div>

---

## Why this exists

Converting a HEIC photo, shrinking one for email, or stripping the location out before posting it are all things people do constantly — and almost always on an ad-choked website that asks them to upload the photo to a stranger's server first.

That is a genuinely bad trade. The photos people most want to convert are the personal ones, and the thing they least want to do with a personal photo is send it somewhere they cannot see.

darkroom does the same work in the browser. There is no upload, no account, and no server that could keep a copy — the app is a static bundle, and there is not a single network call in the conversion path.

## What it does

**Converts HEIC.** The format every iPhone shoots in and half the web still cannot open. No browser decodes it natively, so darkroom loads a WebAssembly decoder — but only when you actually give it a HEIC file, so nobody pays 3 MB for a codec they don't need.

**Shrinks things.** Quality slider, live before-and-after sizes, and an honest verdict on each file — including when a conversion made something *bigger*, which genuinely happens and which most tools quietly hide.

**Resizes sensibly.** Presets named for what they are for (Email, Web, Full HD, 4K). Images already smaller than the target are left alone, because enlarging a photo only produces a blurrier, larger one.

**Shows you what your photos are carrying, then removes it.** This is the part people don't expect.

> Removed location (51.5000, -0.1167) · Apple iPhone 15 Pro · 3 Jun 2024

A photo taken at home holds the coordinates of the house, to about four metres. Most people have never been told that. darkroom reads the metadata out of the original, shows you exactly what was in there, and writes a copy with none of it.

**Works with the network off.** It installs to a home screen and runs offline, which is also the easiest way to satisfy yourself that the privacy claim is true — cut the wifi and convert a photo anyway. The CI suite does exactly that on every push.

The one caveat: the HEIC decoder is a 3 MB WebAssembly chunk fetched on first use, so your *first* HEIC conversion needs a connection. Every one after that doesn't.

**Handles a whole batch.** Drop in a hundred, convert them four at a time so the tab survives it, and save the lot as a zip.

## Try it

```sh
git clone https://github.com/BleakMidwinter90/darkroom.git
cd darkroom
npm install
npm run dev
```

The build output is a plain static bundle — `npm run build` produces a `dist/` you can host anywhere, or open from a file. There is no backend to deploy because there is no backend.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Static production build |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run smoke` | End-to-end test in a real browser |

## How it works

The arithmetic — resize geometry, output naming, byte formatting, queue concurrency — lives in [`src/lib/`](src/lib/) as pure functions with no DOM, covered by 72 unit tests. Everything that touches a canvas or a codec is isolated in [`pipeline.ts`](src/lib/pipeline.ts).

Two details worth knowing:

**Orientation is applied before metadata is dropped.** A phone writes the sensor data unrotated and records "turn this 90°" in the EXIF. Strip the tag naively and every portrait photo comes out sideways — which is why so many browser image tools do exactly that. darkroom decodes with `imageOrientation: 'from-image'`, so the pixels are upright before the tag goes.

**Metadata removal is a property of the method, not a feature bolted on.** Re-encoding through a canvas cannot carry EXIF, so the copy simply has none. The CI smoke test decodes the actual output bytes and asserts the EXIF block is gone, rather than trusting that it should be.

## Browser support

Format availability is detected at runtime by encoding a real pixel and inspecting the result, because browsers will happily accept a MIME type they cannot write and hand back a PNG. You will see whichever of JPEG, PNG, WebP and AVIF your browser can genuinely produce.

## Contributing

Issues and pull requests welcome. Anything in `src/lib/` needs tests; anything touching the pipeline should keep the smoke test green.

```sh
npm test && npx eslint . && npm run typecheck && npm run build && npm run smoke
```

## License

[MIT](LICENSE).
