/* Service worker: deja la app disponible sin internet.
   Los datos los maneja IndexedDB en store.js; acá sólo cacheamos la cáscara. */
const VERSION = 'libreta-v1';
const SHELL = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/store.js', './js/cachito.js', './js/config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL).catch(() => {}))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear la API ni el storage: siempre a la red.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Navegación: red primero, caché si no hay señal.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Recursos propios y fuentes: caché primero, y se actualiza de fondo.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res && res.status === 200 && (url.origin === location.origin || url.hostname.includes('fonts.g')))
        caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
