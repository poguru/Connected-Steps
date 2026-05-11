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
