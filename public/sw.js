// قعدة تصوير — service worker بسيط: الملفات الأساسية من الكاش، والباقي من الشبكة
const C = 'taswir-v1';
const CORE = ['./', 'index.html', 'app.js', 'games.js', 'story.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'vendor/qrcode.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/stats')) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
