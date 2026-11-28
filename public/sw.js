// Keeps the app on this device, so it still opens with no way out to the internet (VPN). Every file is asked from
// the network first — a new version shows up as soon as the network answers — and the saved copy is used when it
// fails or does not answer in time (a VPN may drop the packets instead of refusing them).
// Only this site's own files: Supabase calls go straight out (the app keeps its own saved data for those).
const CACHE = 'wpt-shell-v1';
const WAIT = 4000;
const PAGE = './';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([PAGE, './manifest.webmanifest'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // every address of the page (?code= after Google sign-in, #tool) is the one page
  const key = req.mode === 'navigate' ? PAGE : req;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const net = fetch(req).then((r) => {
        if (r.ok) cache.put(key, r.clone());
        return r;
      });
      try {
        const r = await Promise.race([net, new Promise((done) => setTimeout(done, WAIT))]);
        if (r) return r;
      } catch {
        /* no network: the saved copy below */
      }
      return (await cache.match(key, { ignoreSearch: true })) ?? net;
    })(),
  );
});
