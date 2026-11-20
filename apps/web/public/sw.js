/*
 * Service worker d'Amanah Finance.
 * Règle de sécurité : AUCUNE page, AUCUNE réponse de données et AUCUN appel à l'API ou à
 * Supabase n'est mis en cache (données financières personnelles). Seuls sont conservés :
 * la page « hors ligne » (sans donnée) et les fichiers statiques versionnés (/_next/static,
 * icônes). Hors ligne, une navigation affiche la page « hors ligne ».
 */
const CACHE = 'amanah-static-v1';
const OFFLINE = '/hors-ligne';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/icons/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase et autres origines : jamais interceptés
  if (req.mode === 'navigate') {
    // Pages : toujours le réseau ; jamais mises en cache
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
  // Tout le reste (données des pages, actions, API) : réseau seul, sans cache
});
