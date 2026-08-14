/* Optibrandz CRM service worker.
 *
 * Deliberately conservative: it caches the app shell so the CRM opens instantly from the
 * home screen and shows a proper offline screen instead of Safari's error page. It never
 * caches /api responses — stale invoice totals or lead stages would be worse than an
 * honest "you are offline".
 */
const VERSION = "ob-crm-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
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
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data and PDFs always go to the network.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first so a deploy is picked up immediately, falling back to the
  // cached shell when there is no signal.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || offlineResponse()))
    );
    return;
  }

  // Hashed build assets are immutable, so cache-first is safe and makes launches fast.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && (url.pathname.startsWith("/assets/") || SHELL_URLS.includes(url.pathname))) {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }))
  );
});

function offlineResponse() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
     <style>body{font-family:-apple-system,system-ui,sans-serif;background:#090909;color:#fff;display:grid;place-items:center;
     min-height:100dvh;margin:0;padding:24px;text-align:center}h1{color:#ffd84d;font-size:20px}p{color:#bbb;font-size:14px;line-height:1.6}</style>
     <div><h1>Optibrandz CRM is offline</h1><p>You have no connection right now.<br>Reconnect and the CRM will load again.</p></div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
  );
}
