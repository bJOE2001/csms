/* Only the public POS document and its assets belong in this cache.
 * Sales and identity live in the application's scoped IndexedDB outbox; API,
 * authentication, reporting and Next RSC requests always use the network.
 */
const POS_CACHE_PREFIX = "sip-snap-pos-shell-v1-";
const POS_CACHE_INDEX = "sip-snap-pos-shell-index-v1";
const POS_DOCUMENT = "/pos";
const PUBLIC_ASSETS = new Set([
  "/fonts/manrope/Manrope-Variable.ttf",
  "/brand/text-icon.svg",
  "/brand/text-icon-192.png",
  "/brand/text-icon-512.png",
  "/brand/text-apple-touch-icon.png",
  "/manifest.webmanifest",
]);
let preparing;

const absolute = (path) => new URL(path, self.location.origin).href;
function cacheableAsset(value) {
  const url = new URL(value, self.location.origin);
  return url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || PUBLIC_ASSETS.has(url.pathname));
}
async function shellCaches() {
  return (await caches.keys()).filter((name) => name.startsWith(POS_CACHE_PREFIX)).reverse();
}
async function currentShell() {
  const pointer = await (await caches.open(POS_CACHE_INDEX)).match(absolute(POS_DOCUMENT));
  const current = pointer ? await pointer.text() : undefined;
  const names = await shellCaches();
  // Explicitly follow the last verified build, including a production rollback.
  if (current && names.includes(current)) names.unshift(current);
  for (const name of names) {
    const cache = await caches.open(name);
    const document = await cache.match(absolute(POS_DOCUMENT));
    // The document is written last: its presence commits a complete generation.
    if (document) return { cache, document };
  }
}
async function markCurrentShell(name) {
  await (await caches.open(POS_CACHE_INDEX)).put(absolute(POS_DOCUMENT), new Response(name));
}
async function announceReady(target) {
  if (!await currentShell()) return;
  const message = { type: "POS_SHELL_READY" };
  if (target) target.postMessage(message);
  else for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    client.postMessage(message);
}
async function prepareShell(response) {
  if (preparing) return preparing;
  preparing = (async () => {
    const document = response ?? await fetch(absolute(POS_DOCUMENT), {
      cache: "reload", credentials: "same-origin",
    });
    if (!document.ok || document.redirected || !document.headers.get("content-type")?.includes("text/html"))
      throw Error("The POS shell is unavailable.");
    const html = await document.clone().text();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
    const version = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const name = POS_CACHE_PREFIX + version;
    const cache = await caches.open(name);
    if (await cache.match(absolute(POS_DOCUMENT))) {
      await markCurrentShell(name);
      return;
    }
    const assets = new Set([...PUBLIC_ASSETS].map(absolute));
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = absolute(match[1].replaceAll("&amp;", "&"));
      if (cacheableAsset(url)) assets.add(url);
    }
    try {
      // Prewarm on the first visit, including resources loaded before registration.
      // A new build writes its own generation and never overwrites a live shell.
      for (const url of assets) {
        const asset = await fetch(url, { cache: "reload", credentials: "omit" });
        if (!asset.ok || asset.redirected) throw Error("An offline POS asset could not be saved.");
        if (asset.headers.get("content-type")?.includes("text/css")) {
          for (const match of (await asset.clone().text()).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
            const dependency = new URL(match[1], url).href;
            if (cacheableAsset(dependency)) assets.add(dependency);
          }
        }
        await cache.put(url, asset);
      }
      await cache.put(absolute(POS_DOCUMENT), document);
      await markCurrentShell(name);
    } catch (error) {
      // Keep every previously committed generation, including old live chunks.
      await caches.delete(name);
      throw error;
    }
  })();
  try { await preparing; } finally { preparing = undefined; }
  await announceReady();
}
async function fetchDocument(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try { return await fetch(request, { signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}
async function assetResponse(request) {
  for (const name of await shellCaches()) {
    const hit = await (await caches.open(name)).match(request);
    if (hit) return hit;
  }
  return fetch(request);
}

self.addEventListener("install", (event) => {
  event.waitUntil(prepareShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  // Deliberately retain old shell generations for tabs still using their chunks.
  // Never delete the retired till's caches or IndexedDB databases.
  event.waitUntil(self.clients.claim().then(() => announceReady()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "POS_PREPARE_SHELL")
    event.waitUntil(prepareShell().catch(() => announceReady(event.source)));
  else if (event.data?.type === "POS_SHELL_STATUS")
    event.waitUntil(announceReady(event.source));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === POS_DOCUMENT && !url.search) {
    const network = fetchDocument(request);
    event.waitUntil(network.then((response) => {
      if (response.ok) return prepareShell(response.clone());
    }).catch(() => {}));
    event.respondWith(network.then(async (response) => {
      if (response.ok) return response;
      return (await currentShell())?.document ?? response;
    }).catch(async () => (await currentShell())?.document ?? Response.error()));
  } else if (cacheableAsset(url.href)) {
    event.respondWith(assetResponse(request));
  }
});
