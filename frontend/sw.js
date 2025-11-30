const CACHE_NAME = 'film-gurmesi-v3'; // Versiyonu v3 yaptık
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './profil.html',
    './style.css', // HTML'de v=2.2 olsa bile burası kök dosyayı çeker
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
    'https://cdn.jsdelivr.net/npm/toastify-js',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// 1. KURULUM (INSTALL)
self.addEventListener('install', (event) => {
    // Yeni SW kurulur kurulmaz aktif olsun, beklemesin
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. AKTİF OLMA VE ESKİLERİ SİLME (ACTIVATE) - KRİTİK KISIM
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Eğer cache ismi bizim şu anki versiyonumuz değilse (eski v1, v2 ise) SİL
                    if (cacheName !== CACHE_NAME) {
                        console.log('Eski önbellek temizleniyor:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Tüm sekmelerin kontrolünü hemen ele al
    return self.clients.claim();
});

// 3. İSTEKLERİ YAKALA (FETCH) - Network First Stratejisi (HTML için)
self.addEventListener('fetch', (event) => {
    // Eğer istek bir HTML sayfası ise (index.html, profil.html)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        // İnternetten yenisini al ve cache'e koy
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => {
                    // İnternet yoksa cache'den ver
                    return caches.match(event.request);
                })
        );
    } else {
        // Diğer dosyalar (CSS, JS, Resim) için Cache First (Önce Cache, Yoksa Network)
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});