const CACHE_NAME = 'film-gurmesi-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './profil.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
    'https://cdn.jsdelivr.net/npm/toastify-js',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// 1. Kurulum (Dosyaları Önbelleğe Al)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. İstekleri Yakala (İnternet yoksa Cache'den ver)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});