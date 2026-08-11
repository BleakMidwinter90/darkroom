/**
 * darkroom's service worker.
 *
 * Hand-written and small. This app is a pile of static files with no backend
 * and no data, which makes caching genuinely simple — the bundle *is* the
 * content, so there is no staleness problem to reason about and cache-first is
 * the correct strategy rather than a risky shortcut.
 *
 * Offline support is not a nice extra here. It is the strongest possible
 * demonstration of the claim on the tin: turn the wifi off, convert a photo,
 * and see for yourself that nothing was sent anywhere.
 */

const VERSION = 'v1';
const SHELL = `darkroom-shell-${VERSION}`;
const ASSETS = `darkroom-assets-${VERSION}`;

/** The minimum needed to start up with no network at all. */
const PRECACHE = ['./', './index.html', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // One failed entry must not abort the install and leave no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

/**
 * Cache the bundle the shell actually references.
 *
 * This is load-bearing, and its absence is the classic way a "working" service
 * worker still fails offline. The very first page load happens *before* any
 * worker controls the page, so the JS and CSS are fetched by an uncontrolled
 * navigation that the fetch handler never sees. `index.html` ends up cached and
 * its scripts do not — so offline the shell loads and then immediately 404s
 * every asset, producing a blank page that looks like the cache working.
 *
 * Reading the URLs out of the shell keeps this honest with no build plugin and
 * no hardcoded hashes: whatever the build emitted, the markup names it.
 */
async function warmAssetCache() {
  const shell = await caches.match('./index.html');
  if (!shell) return;

  const html = await shell.text();
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    urls.add(match[1]);
  }
  if (urls.size === 0) return;

  const cache = await caches.open(ASSETS);
  // Individually settled: one asset failing must not abandon the rest.
  await Promise.allSettled([...urls].map((url) => cache.add(url)));
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('darkroom-') && ![SHELL, ASSETS].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => warmAssetCache()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch another origin. The only cross-origin request this app makes is
  // for its two web fonts, and those should fail open rather than be cached.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network so a deployed update is picked up, but fall
  // back to the cached shell so the app opens with no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          return (
            cached ??
            new Response('darkroom is offline and has not been opened on this device before.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }),
    );
    return;
  }

  /*
   * Everything else is cache-first.
   *
   * Safe because the build emits content-hashed filenames: a given URL's bytes
   * never change, so a cached copy can never be stale. A new deployment simply
   * requests new URLs.
   *
   * This is also what makes offline HEIC work. The wasm decoder is fetched on
   * first use and kept, so the *second* HEIC conversion needs no network — but
   * the first one does, which the README says plainly rather than pretending
   * otherwise.
   */
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
