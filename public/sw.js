/* Bump the version whenever the app shell changes. API data lives in SQLite and the device cache. */
const CACHE = "bookit-shell-v2";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Registration happens after initial page load. Precache its scripts, styles,
      // and fonts now so the very first offline reload can launch the full app.
      const document = await cache.match("/");
      const html = await document.text();
      const assets = [
        ...new Set(
          [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
            .map((match) => new URL(match[1], self.location.origin))
            .filter(
              (url) =>
                url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"),
            )
            .map((url) => url.href),
        ),
      ];
      await cache.addAll(assets);
      for (const asset of assets.filter((url) => new URL(url).pathname.endsWith(".css"))) {
        const response = await cache.match(asset);
        const css = await response.text();
        const fonts = [
          ...new Set(
            [...css.matchAll(/url\(["']?([^\)"']+)["']?\)/g)]
              .filter((match) => !match[1].startsWith("data:"))
              .map((match) => new URL(match[1], asset))
              .filter(
                (url) =>
                  url.origin === self.location.origin &&
                  url.pathname.startsWith("/_next/static/") &&
                  /\.(woff2?|ttf|otf)$/.test(url.pathname),
              )
              .map((url) => url.href),
          ),
        ];
        await cache.addAll(fonts);
      }
    })(),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("bookit-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put("/", copy)));
          }
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          }),
      ),
    );
  }
});
