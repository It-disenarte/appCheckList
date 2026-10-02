// Sube la versión cada vez que cambie el diseño o un archivo, para que los teléfonos descarguen lo nuevo.
const CACHE = 'checklist-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './favicon.ico', './favicon.svg', './icons/hoja.svg', './icons/hoja-blanca.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-192-maskable.png', './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png', './img/textura.jpg', './fonts/poppins.css',
  './fonts/poppins-300-latin-ext.woff2', './fonts/poppins-300-latin.woff2', './fonts/poppins-400-latin-ext.woff2', './fonts/poppins-400-latin.woff2',
  './fonts/poppins-500-latin-ext.woff2', './fonts/poppins-500-latin.woff2', './fonts/poppins-600-latin-ext.woff2', './fonts/poppins-600-latin.woff2',
  './fonts/poppins-700-latin-ext.woff2', './fonts/poppins-700-latin.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit || fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
