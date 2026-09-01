/**
 * The phone's service worker.
 *
 * It exists for one reason: an app on a home screen has to open when the
 * network does not. Without it, tapping the icon on a train gives you Safari's
 * offline page, and the fact that the whole task list is sitting in
 * localStorage two inches away is no comfort at all.
 *
 * It caches the SHELL and nothing else. Task data does not pass through here:
 * it lives in localStorage and it comes from Supabase, which is a different
 * origin and is deliberately left alone below. A service worker that caches
 * API responses would serve yesterday's list and be very fast about it.
 */

// Bumped by the build. A new value means every old cache is dropped on
// activate, which is what stops a stale bundle from outliving a deploy.
const CACHE = 'goalflow-shell-mtj7d9u7';

self.addEventListener('install', event => {
  // The shell only. Hashed assets arrive through the runtime cache below --
  // their names are not knowable here, and a precache list that has to be kept
  // in sync by hand is a precache list that is wrong.
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(['./', './index.html'])),
  );
  // No waiting: this is a single-user app and there is no other tab whose
  // session a takeover could disturb.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Supabase is another origin, and everything it serves is either live data
  // or an auth token. Not ours to hold on to.
  if (url.origin !== self.location.origin) return;

  // A navigation is the tap on the home-screen icon. Network first so a deploy
  // is picked up, cache second so the tap works on a train.
  //
  // `cache: 'reload'` on the request matters: without it the browser's own
  // HTTP cache can answer this "network" fetch with the page it stored
  // yesterday, and the worker faithfully caches that as the fresh copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(new Request(request, { cache: 'reload' }))
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit ?? caches.match('./'))),
    );
    return;
  }

  // Everything else is a hashed asset: the name changes when the content does,
  // so a hit is always current and there is nothing to revalidate.
  event.respondWith(
    caches.match(request).then(hit => hit ?? fetch(request).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    })),
  );
});
