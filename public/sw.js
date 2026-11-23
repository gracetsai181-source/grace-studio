/* ============================================================
 * GRACE CREATIVE STUDIO Service Worker（離線瀏覽 + 快速載入）
 * __BUILD_ID__ 與 __PRECACHE__ 會在 npm run build 時自動替換
 * ============================================================ */
const VERSION = '__BUILD_ID__';
const PRECACHE = 'grace-precache-' + VERSION;
const RUNTIME = 'grace-runtime-' + VERSION;
const FONT_CACHE = 'grace-fonts-v1';
const MAX_RUNTIME_ENTRIES = 120;

const BASE = new URL('./', self.location).href;
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']
  .concat(/*__PRECACHE__*/[])
  .map((p) => new URL(p, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('grace-') && k !== PRECACHE && k !== RUNTIME && k !== FONT_CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function networkFirst(request, cacheName, fallbackUrl, preloadPromise) {
  try {
    const preloaded = preloadPromise ? await preloadPromise : null;
    const res = preloaded || await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(fallbackUrl || request, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await caches.match(fallbackUrl || request);
    if (cached) return cached;
    if (fallbackUrl) return (await caches.match(new URL('./index.html', BASE).href)) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && res.ok) {
      cache.put(request, res.clone());
      event.waitUntil(trimCache(RUNTIME, MAX_RUNTIME_ENTRIES));
    }
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google 字型：快取優先
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }
  // 其他外部網站（Apps Script API、GA4、YouTube…）一律不攔截
  if (url.origin !== self.location.origin) return;
  // 影片檔（需要 Range 分段讀取）不快取
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname) || req.headers.has('range')) return;

  // 頁面：網路優先，離線時用快取的首頁
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, PRECACHE, new URL('./index.html', BASE).href, event.preloadResponse));
    return;
  }
  // config.js / manifest：網路優先（修改後立即生效）
  if (/\/(config\.js|manifest\.webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(req, RUNTIME));
    return;
  }
  // 打包後帶雜湊的檔案：永久快取
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req, PRECACHE));
    return;
  }
  // 圖片、遊戲等其他站內檔案：先給快取，背景更新
  event.respondWith(staleWhileRevalidate(req, event));
});
