/* XBoom Flow service worker — Web Push display + click handling.
   Kept intentionally tiny: no caching/offline logic, push only. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "XBoom Flow", body: event.data.text() };
    }
  } else {
    // Payload-less push (or one the browser could not decrypt): still show
    // a generic alert rather than silently dropping the wake-up.
    payload = { title: "XBoom Flow", body: "You have new activity — open the app to see it." };
  }

  const title = payload.title || "XBoom Flow";
  const options = {
    body: payload.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    // IMPORTANT: tags must be unique per notification (the server sends
    // one). A REUSED tag makes the browser replace the previous
    // notification, and on macOS that replacement is silent — no new
    // banner — so users miss every alert after the first. The fallback
    // is unique for the same reason.
    tag: payload.tag || `xboom-${Date.now()}`,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Focus an existing app tab when there is one, else open a new one.
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
