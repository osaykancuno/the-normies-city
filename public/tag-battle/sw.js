// TAG Battle Service Worker v7
const VERSION = 'tagbattle-v7';
const STATIC = `${VERSION}-static`;
const DYNAMIC = `${VERSION}-dynamic`;
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC).then(c => c.addAll(ASSETS).catch(()=>{})).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache the Normies API (live data) — pass through
  if (url.hostname === 'api.normies.art') return;

  // Same-origin: network-first for HTML, cache-first for everything else
  if (url.origin === location.origin) {
    event.respondWith(
      request.destination === 'document' ? networkFirst(request) : cacheFirst(request)
    );
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const r = await fetch(request);
    if (r.ok) (await caches.open(DYNAMIC)).put(request, r.clone());
    return r;
  } catch {
    return (await caches.match(request)) || (await caches.match('./index.html'));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const r = await fetch(request);
    if (r.ok) (await caches.open(DYNAMIC)).put(request, r.clone());
    return r;
  } catch {
    return new Response('', { status: 408 });
  }
}

// Push notifications (real backend posts to FCM/Web Push)
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const title = data.title || 'TAG Battle';
  const body = data.body || 'Something happened in the city';
  event.waitUntil(self.registration.showNotification(title, {
    body, badge: undefined, icon: undefined, tag: data.tag || 'tagbattle',
    data: { url: data.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type:'window' }).then(list => {
    for (const c of list) if (c.url.includes('index.html')) return c.focus();
    return self.clients.openWindow(event.notification.data?.url || './index.html');
  }));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
