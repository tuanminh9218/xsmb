self.addEventListener("push", function (event) {
  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || "Có cập nhật mới";
  const options = {
    body: data.body || "Có kết quả xổ số mới được cập nhật.",
    icon: data.icon || "/vite.svg",
    badge: "/vite.svg", // Replace with your badge icon if you have one
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
