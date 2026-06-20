// ══════════════════════════════════════════════════
//  Service Worker — بوابة متابعة الطلاب
//  إشعارات في الخلفية الحقيقية مع صوت
// ══════════════════════════════════════════════════
const APP_URL  = 'https://emadabuhoujaila.github.io/science-portal/';
const CACHE_VER = 'portal-v6';
const DB_URL   = 'https://students-portal-34231-default-rtdb.firebaseio.com';

// ─── تثبيت فوري ───
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // حذف الكاش القديم
      caches.keys().then(keys =>
        Promise.all(keys.filter(k=>k!==CACHE_VER).map(k=>caches.delete(k)))
      )
    ])
  );
});

// ─── كاش الملفات الأساسية ───
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
  // كاش الملفات المحلية فقط (css/js/html) — لا CDN ولا Firebase
  if(url.origin !== self.location.origin) return false;
  if(/firebase|gstatic|cdnjs|cloudflare/i.test(url.href)) return false;
  return true;
}

// ─── Network First مع Cache Fallback ───
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
          } catch(_err) { /* body already consumed — skip cache */ }
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ─── استقبال Push (إشعار حقيقي في الخلفية) ───
self.addEventListener('push', e => {
  let data = {};
  try   { data = e.data.json(); }
  catch { data = { title:'📚 بوابة الطلاب', body: e.data?.text()||'يوجد تحديث جديد' }; }

  const title = data.title || '📚 بوابة متابعة الطلاب';
  e.waitUntil(
    self.registration.showNotification(title, {
      body:               data.body || 'يوجد تحديث على بيانات ابنك',
      icon:               APP_URL + 'icon-192.png',
      badge:              APP_URL + 'icon-192.png',
      tag:                'portal-notif',
      renotify:           true,
      requireInteraction: true,   // يبقى حتى يضغط المستخدم
      silent:             false,  // مع صوت النظام
      vibrate:            [400, 100, 400, 100, 400],
      dir:                'rtl',
      lang:               'ar',
      data:               { url: data.url || APP_URL },
      actions: [
        { action:'open',    title:'📊 فتح البوابة' },
        { action:'dismiss', title:'إغلاق'          }
      ]
    })
  );
});

// ─── الاستماع لـ Firebase في الخلفية (Polling كل 30 ثانية) ───
// يتحقق من رسائل جديدة حتى لو التطبيق مغلق
let lastMsgCount = 0;
let pollingTimer = null;

async function checkForNewMessages(){
  try {
    const [savedRaw] = await Promise.all([
      // نقرأ من localStorage عبر الـ clients
      self.clients.matchAll().then(clients => {
        if(clients.length) return null; // التطبيق مفتوح — لا حاجة للـ polling
        return null;
      })
    ]);

    // إذا كان التطبيق مفتوحاً، لا نحتاج polling
    const openClients = await self.clients.matchAll({includeUncontrolled:true});
    if(openClients.length > 0) return;

    // التطبيق مغلق — تحقق من Firebase مباشرة
    const res  = await fetch(DB_URL + '/teacherMessages.json');
    if(!res.ok) return;
    const data = await res.json();
    if(!data) return;

    const msgs  = Object.values(data);
    const count = msgs.length;

    if(count > lastMsgCount && lastMsgCount > 0){
      // رسائل جديدة!
      const newest = msgs[msgs.length-1];
      await self.registration.showNotification('📚 رسالة جديدة من المعلم', {
        body:               (newest.name||'طالب') + ' — ' + (newest.body||'رسالة جديدة'),
        icon:               APP_URL + 'icon-192.png',
        badge:              APP_URL + 'icon-192.png',
        tag:                'portal-bg-notif',
        renotify:           true,
        requireInteraction: true,
        silent:             false,
        vibrate:            [400, 100, 400, 100, 400],
        dir:                'rtl', lang:'ar',
        data:               { url: APP_URL }
      });
    }
    lastMsgCount = count;
  } catch(e){ /* ignore */ }
}

// ─── تشغيل الـ Background Sync ───
self.addEventListener('periodicsync', e => {
  if(e.tag === 'check-messages') e.waitUntil(checkForNewMessages());
});

// ─── النقر على الإشعار ───
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if(e.action === 'dismiss') return;
  const url = e.notification.data?.url || APP_URL;

  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      const open = list.find(c => c.url.startsWith(APP_URL.replace('https://','').replace('http://','')));
      if(open){ open.postMessage({type:'NOTIFICATION_CLICK', url}); return open.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

// ─── Message من التطبيق ───
self.addEventListener('message', e => {
  if(e.data?.type === 'INIT_POLLING'){
    lastMsgCount = e.data.count || 0;
  }
  if(e.data?.type === 'SEND_NOTIF'){
    self.registration.showNotification(e.data.title || '📚 بوابة الطلاب', {
      body:               e.data.body || 'تحديث جديد',
      icon:               APP_URL + 'icon-192.png',
      badge:              APP_URL + 'icon-192.png',
      tag:                'portal-notif',
      renotify:           true,
      requireInteraction: false,
      silent:             false,
      vibrate:            [400, 100, 400],
      dir:                'rtl', lang:'ar',
      data:               { url: APP_URL }
    });
  }
});
