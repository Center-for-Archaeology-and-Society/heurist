const CACHE_NAME = 'heurist-mobile-v3'
const PRECACHE_URLS = ['./', './index.html', './manifest.json', './icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name.startsWith('heurist-mobile-') && name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }
  if (url.pathname.includes('/api/') || url.pathname.endsWith('.php')) {
    return
  }
  // Fetch the entry page fresh so deployments load the current hashed bundle.
  // Keep the cached shell as a fallback when the phone is offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(() => caches.match(request)))
    return
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      }).catch(() => cached)
      return cached || network
    })
  )
})
