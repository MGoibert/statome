const CACHE_NAME = "statome-pwa-v17";
const STATIC_ASSETS = ["/", "/index.html", "/styles.css?v=17", "/app.js?v=17", "/zbar-wasm.js?v=17", "/zbar.wasm", "/html5-qrcode.min.js?v=17", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp && resp.status === 200 && event.request.method === "GET") {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
