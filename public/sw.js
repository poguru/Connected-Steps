// ── Offline cache ─────────────────────────────────────────────────────────────

const CACHE_NAME  = "cs-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // Pre-cache the offline fallback page and app icon so they're available
  // even if the user first opens the app without a connection.
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([OFFLINE_URL, "/logo.png"])
    )
  );
  // Activate immediately — don't wait for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Evict stale offline caches from previous versions.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only intercept same-origin navigation requests (page loads / router navigation).
  // Asset requests (JS, CSS, API) are left alone so Next.js handles them normally.
  if (
    event.request.mode !== "navigate" ||
    !event.request.url.startsWith(self.location.origin)
  ) return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL)
    )
  );
});

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "Connected Steps";
  const options = {
    body:    data.body  ?? "A new session has been scheduled.",
    icon:    data.icon  ?? "/logo.png",
    badge:   "/logo.png",
    data:    { url: data.url ?? "/dashboard" },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data?.url ?? "/dashboard");
    })
  );
});
