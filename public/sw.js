/* FastProxy Push Service Worker
 * Sem cache de conteúdo. Lida com push, click e badge no ícone do app.
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function updateBadge(count) {
  if (typeof count !== "number" || count < 0) return;
  try {
    if (count === 0 && self.navigator.clearAppBadge) {
      self.navigator.clearAppBadge().catch(() => {});
    } else if (self.navigator.setAppBadge) {
      self.navigator.setAppBadge(count).catch(() => {});
    }
  } catch (_) {
    /* badge não suportado */
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "FastProxy", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "FastProxy";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/dashboard", notificationId: data.notificationId },
    tag: data.tag || data.notificationId || undefined,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    vibrate: [80, 40, 80],
  };

  if (typeof data.badgeCount === "number") updateBadge(data.badgeCount);

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(url) && "focus" in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Permite a página atualizar o badge sob demanda
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SET_BADGE") updateBadge(msg.count);
});
