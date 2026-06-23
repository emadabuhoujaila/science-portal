// ══════════════════════════════════════════════════
//  Service Worker — بوابة المتابعة
//  Cache + push notifications (بدون Firebase SDK في SW)
// ══════════════════════════════════════════════════
const APP_URL = 'https://emadabuhoujaila.github.io/science-portal/';
const CACHE_VER = 'portal-v9';

function parsePushPayload(event) {
  if (!event.data) {
    return { title: '📚 بوابة المتابعة', body: 'تحديث جديد', url: APP_URL, tag: 'portal-notif' };
  }
  let raw = {};
  try {
    raw = event.data.json();
  } catch (_err) {
    const text = event.data.text ? event.data.text() : '';
    return { title: '📚 بوابة المتابعة', body: text || 'تحديث جديد', url: APP_URL, tag: 'portal-notif' };
  }
  const nested = raw.notification || {};
  const data = raw.data || {};
  return {
    title: nested.title || raw.title || data.title || '📚 بوابة المتابعة',
    body: nested.body || raw.body || data.body || 'تحديث جديد',
    url: data.url || raw.url || raw.fcmOptions?.link || APP_URL,
    tag: data.type ? 'portal-fcm-' + data.type : 'portal-notif',
  };
}

function showPortalNotification(title, body, url, opts) {
  return self.registration.showNotification(title, {
    body,
    icon: APP_URL + 'icon-192.png',
    badge: APP_URL + 'icon-192.png',
    tag: opts?.tag || 'portal-notif',
    renotify: true,
    requireInteraction: opts?.requireInteraction !== false,
    silent: false,
    vibrate: [400, 100, 400, 100, 400],
    dir: 'rtl',
    lang: 'ar',
    data: { url: url || APP_URL },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VER)
      .then((cache) => Promise.allSettled([
        cache.add(APP_URL),
        cache.add(APP_URL + 'icon-192.png'),
        cache.add(APP_URL + 'icon-512.png'),
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VER).map((k) => caches.delete(k)))
      ),
    ])
  );
});

function shouldCacheRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (/firebase|gstatic|cdnjs|cloudflare/i.test(url.href)) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  if (!shouldCacheRequest(event.request)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          try {
            const copy = res.clone();
            event.waitUntil(
              caches.open(CACHE_VER).then((c) => c.put(event.request, copy)).catch(() => {})
            );
          } catch (_err) { /* skip */ }
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  event.waitUntil(
    showPortalNotification(payload.title, payload.body, payload.url, { tag: payload.tag })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || APP_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url && c.url.includes('science-portal'));
      if (open) {
        open.postMessage({ type: 'NOTIFICATION_CLICK', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SEND_NOTIF') {
    showPortalNotification(
      event.data.title || '📚 بوابة المتابعة',
      event.data.body || 'تحديث جديد',
      APP_URL,
      { requireInteraction: false }
    );
  }
});
