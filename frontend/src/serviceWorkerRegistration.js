// Simple service worker registration helper
export function registerServiceWorker() {
  // Register in production, or allow local testing on localhost/network IPs
  const isLocalhost = Boolean(
    window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.match(/^192\./)
  );

  if ('serviceWorker' in navigator && (process.env.NODE_ENV === 'production' || isLocalhost)) {
    window.addEventListener('load', () => {
      const swUrl = '/service-worker.js';
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch((error) => {
          console.error('ServiceWorker registration failed:', error);
        });
    });
  }
}

export function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    });
  }
}
