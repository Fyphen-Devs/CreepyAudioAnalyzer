const CACHE_NAME = "audio-analyzer-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/app.js",
  "./js/audio.js",
  "./js/dom.js",
  "./js/layout.js",
  "./js/modem.js",
  "./js/render.js",
  "./js/settings.js",
  "./js/spectrogramDraw.js",
  "./js/state.js",
  "./js/render/spectrogram.js",
  "./js/render/spectrum.js",
  "./js/render/vectorscope.js",
  "./js/render/waveformMeter.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
