// Save Point service worker: keeps the app shell available so it opens fast
// (and opens at all when the connection is bad). Data always comes live from Supabase.
const VERSION = "savepoint-v10";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./vendor/supabase.js",
  "./manifest.webmanifest",
  "./src/app/actions.js",
  "./src/app/boot.js",
  "./src/app/gestures.js",
  "./src/app/reload.js",
  "./src/app/wiring.js",
  "./src/core/constants.js",
  "./src/core/registry.js",
  "./src/core/state.js",
  "./src/core/util.js",
  "./src/data/demo.js",
  "./src/data/errors.js",
  "./src/data/supabase.js",
  "./src/features/account/actions.js",
  "./src/features/account/admin.js",
  "./src/features/account/password.js",
  "./src/features/auth/actions.js",
  "./src/features/auth/screens.js",
  "./src/features/catalog/actions.js",
  "./src/features/catalog/sheet.js",
  "./src/features/catalog/upkeep.js",
  "./src/features/discover/actions.js",
  "./src/features/discover/load.js",
  "./src/features/discover/view.js",
  "./src/features/feed/view.js",
  "./src/features/friends/actions.js",
  "./src/features/friends/sheet.js",
  "./src/features/friends/view.js",
  "./src/features/game/actions.js",
  "./src/features/game/edit.js",
  "./src/features/game/ext.js",
  "./src/features/game/finish.js",
  "./src/features/game/log.js",
  "./src/features/game/page.js",
  "./src/features/picks/picks.js",
  "./src/features/share/actions.js",
  "./src/features/share/card.js",
  "./src/features/share/sheet.js",
  "./src/features/shelf/actions.js",
  "./src/features/shelf/view.js",
  "./src/main.js",
  "./src/ui/cover.js",
  "./src/ui/feedback.js",
  "./src/ui/screen.js",
  "./src/ui/sheet.js",
  "./src/ui/theme.js",
  "./src/ui/update.js",
  "./fonts/funnel-sans-latin.woff2",
  "./fonts/funnel-sans-latin-ext.woff2",
  "./fonts/funnel-sans-latin-italic.woff2",
  "./fonts/funnel-display-latin.woff2",
  "./fonts/funnel-display-latin-ext.woff2",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-64.png",
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
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
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
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }

  // Everything else (Supabase, cover images) goes straight to the network. Fonts are self-hosted now.
});
