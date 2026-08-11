/**
 * Serves the built app on the local network.
 *
 *   npm run build && node scripts/serve.mjs
 *
 * A twenty-line static file server rather than a dependency. The whole app is
 * a folder of static files, so anything more would be ceremony — and this is
 * also a fair demonstration of the point: there is no backend to run.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, not `.pathname` — the latter percent-encodes, so a path
// containing a space silently 404s every request.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

// `.mjs` is not optional here: the pdf.js worker is emitted as one, and a
// browser refuses to execute a module served as application/octet-stream. Left
// out, every PDF renders on the main thread at best — and the single-page
// fallback below turns the miss into an HTML response, which is worse.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0]);
  // Normalise and refuse anything trying to climb out of dist.
  const relative = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const path = relative === '/' || relative === '' ? 'index.html' : relative.replace(/^\//, '');

  try {
    const body = await readFile(join(DIST, path));
    response.writeHead(200, {
      'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
      // Service workers need this header to be allowed the whole scope.
      'Service-Worker-Allowed': '/',
    });
    response.end(body);
  } catch {
    // Single-page app: unknown paths fall back to the shell.
    try {
      const shell = await readFile(join(DIST, 'index.html'));
      response.writeHead(200, { 'Content-Type': MIME['.html'] });
      response.end(shell);
    } catch {
      response.writeHead(404).end('not found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);

  console.log(`darkroom serving ${DIST}`);
  console.log(`  local:   http://localhost:${PORT}/`);
  for (const address of addresses) console.log(`  network: http://${address}:${PORT}/`);
});
