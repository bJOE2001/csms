const CACHE_PREFIX = "coffee-public-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const SHELL = ["/", "/pos", "/offline.html", "/manifest.webmanifest", "/icons/coffee.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization")) return;
  if (url.pathname.startsWith("/app") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return;
  // Development chunks keep the same URL across compilations. Serving an old
  // module beside a new webpack runtime breaks client component loading.
  if (url.pathname.startsWith("/_next/static/")) {
    if (!/(?:\/|-)[0-9a-f]{8,}\.(?:js|css|woff2?)$/i.test(url.pathname)) return;
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    })));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (["/", "/pos"].includes(url.pathname) && response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, copy)));
      }
      return response;
    }).catch(async () => {
      const fallback = ["/", "/pos"].includes(url.pathname) ? await caches.match(url.pathname) : null;
      return fallback ?? await caches.match("/offline.html") ?? new Response("Offline. Reconnect to continue.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }));
  }
});
