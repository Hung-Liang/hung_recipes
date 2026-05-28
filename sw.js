const CACHE_NAME = 'my-recipes-v1.4.0'; // Update this version string when deploying changes
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './asset/icon.png',
  './asset/info.json',
  './asset/recipes.json'
];

// Install Service Worker and cache static assets
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
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
      // Take control of all open clients (tabs/PWA windows)
      self.clients.claim(),
      // Remove old versions of the cache
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

// Fetch interceptor with Cache First strategy (with Network fallback and update)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found, otherwise fetch from network
      return response || fetch(event.request).then((fetchResponse) => {
        // Only cache valid GET responses from the same origin or specific assets
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
          // If it's a cross-origin request or error, just return it
          if (event.request.url.includes('.json')) {
             // We still want to cache our json assets even if they might be cross-origin in some environments
          } else {
             return fetchResponse;
          }
        }

        // Cache recipe JSON files and other assets on demand
        if (event.request.url.includes('.json') || event.request.url.includes('asset/')) {
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return fetchResponse;
      });
    })
  );
});
