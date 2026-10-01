const CACHE = 'v1';
const ARQUIVOS = ['./', './index.html', './styles.css', './app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
});

self.addEventListener('fetch', e => {
  // não intercepta chamadas a APIs (Apps Script, Groq etc.)
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
