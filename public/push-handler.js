/* Web Push handlers — подключается в SW через workbox.importScripts */
/* global self, clients */

self.addEventListener("push", (event) => {
  let data = {
    title: "Учёт разметки",
    body: "Новое уведомление",
    url: "/calc/",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Учёт разметки", {
      body: data.body || "",
      icon: "/calc/icons/icon-192.png",
      badge: "/calc/icons/icon-192.png",
      data: { url: data.url || "/calc/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/calc/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/calc") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
