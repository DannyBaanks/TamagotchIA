/* TamagotchIA service worker: keeps the app shell and the art available offline.
 * Same-origin GETs only. Calls to a model endpoint are other origins and are never cached. */
const CACHE = "tamagotchia-v2";
const POSES = ["idle", "thinking", "working", "success", "error", "waiting"];
// every pose of every species, so a state never seen online still shows offline
const ART = [...POSES.map((p) => `./packs/malbolge-cat/${p}.gif`), ...POSES.map((p) => `./packs/tabby-shinji-cat/${p}.png`)];
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", ...ART];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  // network first so updates arrive; cache as the offline fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html"))),
  );
});
