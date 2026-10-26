const CACHE_NAME = 'my-recipes-v1.10.0-b5414b2a'; // vX.Y.Z is the display version (edit manually); the hash suffix is stamped by update_recipes.py
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/nutrition.js',
  './js/app.js',
  './manifest.json',
  './asset/icon-192.png',
  './asset/nutrition.json',
  './asset/info.json'
];

// Install Service Worker and cache static core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache:', CACHE_NAME);
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Clean up old caches on activation and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              console.log('Deleting old cache:', cache);
              return caches.delete(cache);
            }
          })
        );
      })
    ])
  );
});

// Fetch interceptor: Network-First for dynamic JSON data, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-First for recipe summaries and individual recipe JSON
  // Always attempts to fetch freshest data from network; falls back to cache when offline
  if (url.pathname.includes('asset/info.json') || url.pathname.includes('asset/nutrition.json') || url.pathname.includes('asset/recipes.json') || url.pathname.includes('/recipes/')) {
    event.respondWith(
      fetch(event.request)
        .then((fetchResponse) => {
          if (fetchResponse && fetchResponse.status === 200) {
            const responseToCache = fetchResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return fetchResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-First with Network fallback for static application shell assets
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
          return fetchResponse;
        }

        const responseToCache = fetchResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return fetchResponse;
      });
    })
  );
});
