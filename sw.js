// Gjør at Dagbok virker uten internett.
// Når appen endres, øk versjonsnummeret under, så henter telefonen den nye versjonen.
const CACHE = 'dagbok-v1';

const FILER = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (hendelse) => {
  hendelse.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILER.map((fil) => new Request(fil, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (hendelse) => {
  hendelse.waitUntil(
    caches.keys()
      .then((navn) => Promise.all(navn.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (hendelse) => {
  if (hendelse.request.method !== 'GET') return;
  hendelse.respondWith(
    caches.match(hendelse.request, { ignoreSearch: true })
      .then((svar) => svar || fetch(hendelse.request)),
  );
});
