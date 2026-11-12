// Service Worker：讓網站可安裝成 App，並在離線時仍能瀏覽價格與表單頁面
// 策略：
//   - 本站檔案（同網域 GET）：先連網取得最新版本並更新快取，離線時改用快取（network-first）。
//   - supabase-js（CDN）：先用快取，背景更新（stale-while-revalidate）。
//   - Supabase API 與其他請求：一律不經過快取，訂單一定要連網才能送出。
// 修改要預先快取的檔案清單時，請把 CACHE_VERSION 加 1。
const CACHE_VERSION = "v1";
const CACHE = "order-site-" + CACHE_VERSION;
const CDN_HOST = "cdn.jsdelivr.net";

const PRECACHE = [
  "./",
  "./index.html",
  "./order.html",
  "./snack.html",
  "./jinji.html",
  "./style.css",
  "./config.js",
  "./meat-data.js",
  "./meat.js",
  "./order.js",
  "./snack.js",
  "./jinji.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 刪除舊版本的快取
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("order-site-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // 送出訂單（POST）不處理
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (url.hostname === CDN_HOST) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // 其他（例如 Supabase API）交給瀏覽器直接處理
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") {
      const home = await cache.match("./index.html");
      if (home) return home;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const update = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || update;
}
