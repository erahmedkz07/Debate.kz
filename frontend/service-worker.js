// Service worker template. The build (vite.config.ts) prepends VERSION and PRECACHE — the list of built files —
// and writes the result to dist/sw.js. It keeps the app shell available offline so a judge can reopen a ballot
// with no network. API responses are never cached here: the ballot page keeps its own copy (lib/ballotOutbox.ts).
/* global VERSION, PRECACHE */
const CACHE = `debate-${VERSION}`

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

// a new version drops the caches of the old one
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('debate-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // live data and user files always go to the network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return

  // pages: network first (fresh deploys), the cached shell when offline — the router takes it from there
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/', { ignoreVary: true })),
    )
    return
  }

  // hashed build files never change: cache first. ignoreVary: servers send "Vary: Origin", and module scripts
  // are requested with an Origin header while the precache was filled without one — the file is the same
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && url.pathname.startsWith('/assets/')) {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy))
      }
      return res
    })),
  )
})
