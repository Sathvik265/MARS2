// Service worker self-destruction script.
// This forces any previously registered service worker on localhost:3000 to unregister and clear itself.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.claim())
      .then(() => {
        console.log('Service Worker successfully unregistered and self-destroyed.');
      })
  );
});

// Pass-through fetch event listener so it does not block any requests while active
self.addEventListener('fetch', (event) => {
  return;
});
