/*
 * Hamza Teaches service worker: phone notifications only.
 * It caches nothing, so the site always loads fresh.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Hamza Teaches", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Hamza Teaches";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/app-icon/192",
      // Android draws the status-bar icon from the alpha channel only, so a
      // full-colour icon shows as a blank square: the badge is white on clear.
      badge: "/notification-badge.png",
      tag: data.tag || undefined, // same tag replaces, never stacks
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  // Never take over a test in progress: a tab on the test runner is left
  // alone, and the notification opens in another portal tab or a new one.
  const sitting = (c) => /^\/test\/[^/]+\/?$/.test(new URL(c.url).pathname);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const free = list.filter((c) => "focus" in c && !sitting(c));
      const c = free.find((x) => x.focused) || free[0];
      if (c) {
        c.navigate(url).catch(() => {});
        return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
