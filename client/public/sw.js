/* Optibrandz CRM service worker.
 *
 * Deliberately narrow. An earlier version proxied every same-origin GET through
 * caches.match(), which made cached CSS and JS take ~360ms each and pushed first paint
 * out to ~900ms — the worker was costing more than it saved.
 *
 * Now it only handles navigations, so the app still opens offline from the home screen,
 * and it stays out of the way of everything else:
 *   - /assets/* are content-hashed and served immutable for a year, so the browser's own
 *     HTTP cache is already the fastest possible path. Intercepting them only adds a hop.
 *   - /api/* is never cached; a stale invoice total is worse than an honest error.
 */
const VERSION = "ob-crm-v4";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, cache only as a fallback.
  //
  // Serving the cached shell first would be a little faster, but it is not safe here:
  // the SPA rewrite means a missing /assets/index-<oldhash>.js returns index.html with
  // HTTP 200 and a text/html content type. A shell cached before a deploy therefore asks
  // for asset hashes that no longer exist, the browser tries to parse HTML as a module,
  // and the app white-screens. Fresh HTML always matches the deployed assets.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      try {
        const response = await withTimeout(fetch(request), 3000);
        if (response && response.ok) cache.put(SHELL_URL, response.clone());
        return response;
      } catch {
        return (await cache.match(SHELL_URL)) || offlineResponse();
      }
    })
  );
});

// A phone on a dead cell connection can leave fetch hanging, so fall through to the
// cached shell rather than showing a spinner indefinitely.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

function offlineResponse() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
     <style>body{font-family:-apple-system,system-ui,sans-serif;background:#090909;color:#fff;display:grid;place-items:center;
     min-height:100dvh;margin:0;padding:24px;text-align:center}h1{color:#ffd84d;font-size:20px}p{color:#bbb;font-size:14px;line-height:1.6}</style>
     <div><h1>Optibrandz CRM is offline</h1><p>You have no connection right now.<br>Reconnect and the CRM will load again.</p></div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
  );
}
