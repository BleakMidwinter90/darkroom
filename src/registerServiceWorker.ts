/**
 * Registers the service worker, once the page has settled.
 *
 * Deferred until after load: registration competes with the work that actually
 * puts pixels on screen, and the worker only matters on the *next* visit.
 *
 * Skipped outside a secure context. Opening the built `dist/` straight off the
 * filesystem is a perfectly reasonable way to use this app, and there service
 * workers simply do not exist — which costs offline caching and nothing else.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const register = () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // A failed registration costs offline support and nothing else. There is
      // no user-facing recovery, so there is no user-facing error.
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
