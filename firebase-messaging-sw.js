// Service worker de réception des notifications.
// Doit être placé à la racine du dépôt, à côté de index.html.

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAF8oiZVvIdA06OStlbpn9Zx-EyFCNbxGE",
  authDomain: "cultivons-nous.firebaseapp.com",
  databaseURL: "https://cultivons-nous-default-rtdb.firebaseio.com",
  projectId: "cultivons-nous",
  storageBucket: "cultivons-nous.firebasestorage.app",
  messagingSenderId: "838321369866",
  appId: "1:838321369866:web:d37b09351ad63da92880f3"
});

const messaging = firebase.messaging();

// L'adresse de l'app est déduite de l'emplacement du service worker :
// pas besoin de l'écrire en dur, quel que soit le nom du dépôt.
const APP_URL = self.registration.scope;

// Notification reçue alors que l'app est fermée ou en arrière-plan.
// La fonction envoie des données seules, l'affichage est fait ici,
// ce qui évite le doublon avec l'affichage automatique de Firebase.
messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "Cultivons-nous", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: "cultivons",
    renotify: true
  });
});

// Un appui sur la notification ouvre l'app, ou la met au premier plan
self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    // On retire aussi les autres notifications en attente
    self.registration.getNotifications().then(list => {
      list.forEach(n => n.close());
      return clients.matchAll({ type: "window", includeUncontrolled: true });
    }).then(windows => {
      for (const client of windows) {
        if (client.url.startsWith(APP_URL) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(APP_URL);
    })
  );
});
