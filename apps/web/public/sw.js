const CACHE_NAME = 'book-translator-v2';
const STATIC_CACHE = 'static-assets-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/ka', '/en', '/favicon.ico'])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_AUTH_CACHE') {
    caches.delete(CACHE_NAME);
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API requests (authenticated data)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Next.js hashed static assets (_next/static/) — cache-first
  // These filenames contain content hashes, so cached versions are always valid
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Non-hashed assets (images, fonts, favicon) — stale-while-revalidate
  if (url.pathname.match(/\.(woff2?|ttf|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Navigation requests — network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }

  // All other requests (including non-hashed JS/CSS) — network only
  // This prevents stale chunks from breaking the app after deployments
});

// === Push Notifications ===

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Book Translator', {
        body: payload.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: payload.data || {},
      })
    );
  } catch {
    // Fallback for plain text push
    event.waitUntil(
      self.registration.showNotification('Book Translator', {
        body: event.data.text(),
        icon: '/icons/icon-192.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const url = data.bookId
    ? `/books/${data.bookId}/read`
    : '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
