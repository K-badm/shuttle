// オフラインでも開けるようにするサービスワーカー。
// 自分のファイルと Firebase の部品は「まずネット、だめなら保存してある分」で返す。
// 中身を変えたら VERSION を上げると、古い保存分が消える。
const VERSION = "shuttle-v3";
const SHELL = ["./", "index.html", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const mine = url.origin === location.origin, sdk = url.hostname === "www.gstatic.com";
  if (!mine && !sdk) return; // データのやりとり（Firestore など）はそのまま通す
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
