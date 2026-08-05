// Gym Bro service worker. Its only job is push: iOS won't deliver a rest-timer
// notification to a backgrounded PWA any other way. There is deliberately no
// fetch/caching handler — the app is server-rendered and per-user, so a stale
// cache would do more harm than an offline screen would do good.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Gym Bro", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Gym Bro";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "gym-bro",
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Re-use the installed PWA window if it's already open.
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client && new URL(client.url).pathname !== url) {
            return client.navigate(url).then((c) => c && c.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
