/**
 * GEF - Gestor de Ferragem
 * Service Worker para suporte PWA e Cache de Ativos Estáticos
 */

const CACHE_NAME = 'gef-ferragem-cache-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './css/global.css',
  './css/layout.css',
  './css/components.css',
  './css/forms.css',
  './css/tables.css',
  './css/responsive.css',
  './js/app.js',
  './js/config.js',
  './js/supabase.js',
  './js/auth.js',
  './js/database.js',
  './js/permissions.js',
  './js/router.js',
  './js/state.js',
  './js/utils.js',
  './js/validation.js',
  './js/errors.js',
  './js/navbar.js',
  './js/sidebar.js',
  './js/modal.js',
  './js/toast.js',
  './js/table.js',
  './js/pagination.js',
  './js/loading.js',
  './js/empty-state.js',
  './js/login.js',
  './js/dashboard.js',
  './js/pos.js',
  './js/vendas.js',
  './js/orcamentos.js',
  './js/produtos.js',
  './js/estoque.js',
  './js/perdas.js',
  './js/caixa.js',
  './js/clientes.js',
  './js/entregas.js',
  './js/relatorios.js',
  './js/configuracoes.js',
  './js/embaixadores.js',
  './js/monitoria.js',
  './js/auditoria.js',
  './html/login.html',
  './html/dashboard.html',
  './html/pos.html',
  './html/vendas.html',
  './html/orcamentos.html',
  './html/produtos.html',
  './html/estoque.html',
  './html/perdas.html',
  './html/caixa.html',
  './html/clientes.html',
  './html/entregas.html',
  './html/relatorios.html',
  './html/configuracoes.html',
  './html/embaixadores.html',
  './html/monitoria.html',
  './html/auditoria.html',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/logos/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Aviso no precache parcial:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não intercepta chamadas externas ou requisições Supabase (banco de dados)
  if (url.origin !== location.origin || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) {
    return;
  }

  // Network first para documentos HTML, cache first para assets estáticos
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retorna do cache e atualiza em background
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback básico
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
