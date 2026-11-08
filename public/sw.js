// ICT Dashboard service worker: lets phones install the dashboard as an app and makes it open fast.
// - The page itself is always checked online first (so a deploy arrives on the next open); the device copy is only
//   a fallback when offline.
// - Versioned app files (?v=hash), fonts, icons and the two CDN scripts come from the device; a new version of a file
//   replaces the old one.
// - /api/data: the last copy is shown at once and refreshed in the background; a copy older than 24 hours is deleted
//   and never shown (owner choice, 2026-11-08: it holds teacher names and FICO scores).
// - Nothing else under /api or /admin is ever stored (feedback, calendar, health, debriefs, learning assessment).
const SHELL = 'ict-shell-v1', DATA = 'ict-data-v1', MAX_AGE = 24 * 3600 * 1000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL && k !== DATA) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname === '/api/data') { e.respondWith(lastData(e)); return; }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname === '/sw.js') return;
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') { e.respondWith(pageFirst(req)); return; }
    e.respondWith(fromDevice(req, url));
    return;
  }
  if (/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(req.url)) e.respondWith(fromDevice(req, url));
});

async function pageFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const r = await fetch(req);
    if (r.ok) await c.put('/', r.clone());
    return r;
  } catch (err) {
    return (await c.match('/')) || Response.error();
  }
}

async function fromDevice(req, url) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    if (url.origin === self.location.origin) {
      for (const k of await c.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) await c.delete(k); }
    }
    await c.put(req, r.clone());
  }
  return r;
}

async function lastData(e) {
  const c = await caches.open(DATA);
  const hit = await c.match('/api/data');
  const age = hit ? Date.now() - Number(hit.headers.get('x-saved-at') || 0) : Infinity;
  const fresh = fetch('/api/data', { cache: 'no-store' }).then(async (r) => {
    if (r.ok) {
      const body = await r.clone().text();
      await c.put('/api/data', new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'x-saved-at': String(Date.now()) } }));
    }
    return r;
  });
  if (hit && age < MAX_AGE) { e.waitUntil(fresh.catch(() => {})); return hit; }
  if (hit) await c.delete('/api/data');   // older than a day: never shown
  return fresh;
}
