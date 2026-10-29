// Save Point service worker: keeps the app shell available so it opens fast
// (and opens at all when the connection is bad). Data always comes live from Supabase.
const VERSION = "savepoint-v2";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./api.js", "./config.js",
  "./vendor/supabase.js", "./manifest.webmanifest",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-64.png",
];

self.addEventListener("install", (e) => {
  // Don't take over straight away: the app shows "A new version is ready" and the person taps Refresh.
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App files: network first so updates show up, cache as a fallback.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Google Fonts: cache after first use.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
      }))
    );
  }
  // Everything else (Supabase, cover images) goes straight to the network.
});
