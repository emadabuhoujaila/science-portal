// ══════════════════════════════════════════════════
//  Service Worker — بوابة المتابعة
//  FCM background + cache + إشعارات بصوت
// ══════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD9fIhL5ctwwIH3qyJnrvJ1OQyQQYhLiBg',
  authDomain: 'students-portal-34231.firebaseapp.com',
  databaseURL: 'https://students-portal-34231-default-rtdb.firebaseio.com',
  projectId: 'students-portal-34231',
  messagingSenderId: '148177464784',
});

const messaging = firebase.messaging();
const APP_URL  = 'https://emadabuhoujaila.github.io/science-portal/';
const CACHE_VER = 'portal-v8';

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || '📚 بوابة المتابعة';
  const body  = payload.notification?.body  || payload.data?.body  || 'تحديث جديد';
  const url   = payload.data?.url || payload.fcmOptions?.link || APP_URL;
  return self.registration.showNotification(title, {
    body,
    icon: APP_URL + 'icon-192.png',
    badge: APP_URL + 'icon-192.png',
    tag: 'portal-fcm-' + (payload.data?.type || 'general'),
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [400, 100, 400, 100, 400],
    dir: 'rtl',
    lang: 'ar',
    data: { url },
  });
});

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k=>k!==CACHE_VER).map(k=>caches.delete(k)))
      )
    ])
  );
});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VER).then(cache =>
      Promise.allSettled([
        cache.add(APP_URL),
        cache.add(APP_URL + 'icon-192.png'),
        cache.add(APP_URL + 'icon-512.png')
      ])
    )
  );
});

function shouldCacheRequest(request){
  if(request.method !== 'GET') return false;
  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return false;
  if(/firebase|gstatic|cdnjs|cloudflare/i.test(url.href)) return false;
  return true;
}

self.addEventListener('fetch', e => {
  if(!shouldCacheRequest(e.request)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if(res && res.ok && res.type === 'basic'){
          try {
            const copy = res.clone();
            e.waitUntil(
              caches.open(CACHE_VER).then(c => c.put(e.request, copy)).catch(() => {})
            );
          } catch(_err) { /* skip */ }
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  if(!e.data) return;
  let data = {};
  try   { data = e.data.json(); }
  catch { data = { title:'📚 بوابة المتابعة', body: e.data?.text()||'تحديث جديد' }; }
  const title = data.notification?.title || data.title || '📚 بوابة المتابعة';
  const body  = data.notification?.body  || data.body  || 'تحديث جديد';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: APP_URL + 'icon-192.png',
      badge: APP_URL + 'icon-192.png',
      tag: 'portal-notif',
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [400, 100, 400, 100, 400],
      dir: 'rtl',
      lang: 'ar',
      data: { url: data.url || data.data?.url || APP_URL },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if(e.action === 'dismiss') return;
  const url = e.notification.data?.url || APP_URL;
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      const open = list.find(c => c.url && c.url.includes('science-portal'));
      if(open){ open.postMessage({type:'NOTIFICATION_CLICK', url}); return open.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('message', e => {
  if(e.data?.type === 'SEND_NOTIF'){
    self.registration.showNotification(e.data.title || '📚 بوابة المتابعة', {
      body: e.data.body || 'تحديث جديد',
      icon: APP_URL + 'icon-192.png',
      badge: APP_URL + 'icon-192.png',
      tag: 'portal-notif',
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [400, 100, 400],
      dir: 'rtl', lang:'ar',
      data: { url: APP_URL }
    });
  }
});
