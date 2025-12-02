// Service Worker para Push Notifications - Mesa de Soporte
// Este archivo debe estar en /public/sw.js para que Next.js lo sirva correctamente

const SW_VERSION = '1.0.1';

// Evento de instalación
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker instalado, versión:', SW_VERSION);
  // Activar inmediatamente sin esperar
  self.skipWaiting();
});

// Evento de activación
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activado, versión:', SW_VERSION);
  // Tomar control de todas las páginas inmediatamente
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Limpiar caches antiguos si existen
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
    ])
  );
});

// Escuchar mensaje para forzar activación
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Recibido SKIP_WAITING, activando...');
    self.skipWaiting();
  }
});

// Evento de notificación push
self.addEventListener('push', (event) => {
  console.log('[SW] Push recibido:', event);

  if (!event.data) {
    console.log('[SW] Push sin datos');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[SW] Error parseando datos push:', e);
    data = {
      title: 'Mesa de Soporte',
      body: event.data.text() || 'Nueva notificación',
    };
  }

  const title = data.title || 'Mesa de Soporte';
  const options = {
    body: data.body || 'Tienes una actualización',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'notification',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: true, // Mantener visible hasta que el usuario interactúe
    actions: data.actions || [
      { action: 'open', title: 'Ver Ticket' }
    ]
  };

  console.log('[SW] Mostrando notificación:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Evento de clic en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Clic en notificación:', event);

  event.notification.close();

  const data = event.notification.data || {};
  let url = data.url || '/';

  // Si se hizo clic en una acción específica
  if (event.action === 'open' && data.url) {
    url = data.url;
  }

  console.log('[SW] Abriendo URL:', url);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Buscar si ya hay una ventana abierta con la URL
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }

        // Buscar cualquier ventana del sitio y navegar
        for (const client of clientList) {
          if ('navigate' in client && 'focus' in client) {
            return client.navigate(url).then(() => client.focus());
          }
        }

        // Abrir nueva ventana
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Evento de cierre de notificación (sin clic)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notificación cerrada sin clic:', event.notification.tag);
});

// Evento de error en push
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Cambio en suscripción push');
  // Aquí se podría implementar la re-suscripción automática
});
