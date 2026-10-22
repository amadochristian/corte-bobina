const CACHE_NAME = "controle-refugo-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/js/app.js",
  "/js/api.js",
  "/js/validation.js",
  "/assets/icons/icon.svg",
  "/assets/images/bobinas/pequena.svg",
  "/assets/images/bobinas/media.svg",
  "/assets/images/bobinas/grande.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (url.pathname.endsWith(".html") || APP_SHELL.includes(url.pathname))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match("/index.html");
    return Response.error();
  }));
});
