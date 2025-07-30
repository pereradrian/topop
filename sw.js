// Service Worker para PWA de Tests Bomberos
const CACHE_NAME = 'tests-bomberos-v1.0.0';
const STATIC_CACHE = 'static-v1.0.0';
const DYNAMIC_CACHE = 'dynamic-v1.0.0';

// ✨ Obtener BASE_URL dinámicamente
const getBaseURL = () => {
  const swPath = self.location.pathname;
  const basePath = swPath.substring(0, swPath.lastIndexOf('/') + 1);
  return basePath;
};

const BASE_URL = getBaseURL();
console.log('[SW] Base URL detected:', BASE_URL);

// Archivos estáticos para cachear (con BASE_URL dinámico)
const STATIC_FILES = [
  `${BASE_URL}`,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.json`,
  `${BASE_URL}data/questions.csv`,
  `${BASE_URL}icons/icon-72x72.png`,
  `${BASE_URL}icons/icon-96x96.png`,
  `${BASE_URL}icons/icon-128x128.png`,
  `${BASE_URL}icons/icon-144x144.png`,
  `${BASE_URL}icons/icon-152x152.png`,
  `${BASE_URL}icons/icon-192x192.png`,
  `${BASE_URL}icons/icon-384x384.png`,
  `${BASE_URL}icons/icon-512x512.png`,
  `${BASE_URL}icons/shortcut-test.png`,
  `${BASE_URL}icons/shortcut-stats.png`
];

// Rutas de la aplicación para cachear (relativas a BASE_URL)
const APP_ROUTES = [
  '',
  'stats',
  'temario',
  'test',
  'results'
];

// Función helper para normalizar rutas
const normalizeURL = (url) => {
  const urlObj = new URL(url);
  let pathname = urlObj.pathname;
  
  // Remover BASE_URL del pathname para comparación
  if (pathname.startsWith(BASE_URL)) {
    pathname = pathname.substring(BASE_URL.length);
  }
  
  // Remover slash inicial si existe
  if (pathname.startsWith('/')) {
    pathname = pathname.substring(1);
  }
  
  return pathname;
};

// Verificar si una URL está dentro de nuestro scope
const isInScope = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.startsWith(BASE_URL);
  } catch {
    return false;
  }
};

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  console.log('[SW] Static files to cache:', STATIC_FILES);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Error caching static files:', error);
      })
  );
});

// Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Intercepción de peticiones (fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Solo manejar peticiones HTTP/HTTPS dentro de nuestro scope
  if (!request.url.startsWith('http') || !isInScope(request.url)) {
    return;
  }
  
  const url = new URL(request.url);
  const normalizedPath = normalizeURL(request.url);
  
  // Estrategia Cache First para archivos estáticos
  if (STATIC_FILES.includes(request.url) || 
      url.pathname.startsWith(`${BASE_URL}icons/`) ||
      normalizedPath.startsWith('icons/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Estrategia Network First para rutas de la aplicación
  if (APP_ROUTES.includes(normalizedPath) || 
      APP_ROUTES.some(route => normalizedPath.startsWith(route + '/')) ||
      normalizedPath === '') {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Estrategia Network First para APIs y recursos dinámicos
  if (normalizedPath.startsWith('api/') || 
      normalizedPath.endsWith('.json') ||
      normalizedPath.startsWith('data/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Para todo lo demás dentro del scope, intentar red primero
  event.respondWith(networkFirst(request));
});

// Estrategia Cache First
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache First error:', error);
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Estrategia Network First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Si es una ruta de la aplicación y no está en cache, devolver index.html
    if (request.mode === 'navigate') {
      const indexResponse = await caches.match(`${BASE_URL}index.html`) || 
                           await caches.match(`${BASE_URL}`);
      if (indexResponse) {
        return indexResponse;
      }
    }
    
    return new Response('Offline', { 
      status: 503, 
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Manejo de mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Manejo de notificaciones push (para futuras mejoras)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: `${BASE_URL}icons/icon-192x192.png`,
      badge: `${BASE_URL}icons/icon-72x72.png`,
      vibrate: [200, 100, 200],
      data: data.data,
      actions: [
        {
          action: 'open',
          title: 'Abrir App',
          icon: `${BASE_URL}icons/shortcut-test.png`
        },
        {
          action: 'close',
          title: 'Cerrar'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Manejo de clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(BASE_URL)
    );
  }
});

// Sincronización en segundo plano (para futuras mejoras)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Aquí se pueden sincronizar estadísticas offline
      console.log('[SW] Background sync triggered')
    );
  }
});

console.log('[SW] Service Worker loaded successfully with BASE_URL:', BASE_URL);

