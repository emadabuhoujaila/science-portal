// ══════════════════════════════════════════════════
//  Push Notifications — FCM (Web PWA + Capacitor Android)
// ══════════════════════════════════════════════════
(function(){
  const APP_URL = 'https://emadabuhoujaila.github.io/science-portal/';
  let messaging = null;
  let nativeReady = false;

  function tokenId(token){
    let h = 0;
    for(let i = 0; i < token.length; i++) h = ((h << 5) - h + token.charCodeAt(i)) | 0;
    return 't_' + Math.abs(h).toString(36);
  }

  function isNative(){
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function getPushPlugin(){
    try { return window.Capacitor?.Plugins?.PushNotifications || null; }
    catch(e){ return null; }
  }

  async function getVapidKey(){
    if(window._fcmVapidKey !== undefined) return window._fcmVapidKey;
    try{
      if(typeof db !== 'undefined'){
        const snap = await db.ref('publicConfig/fcm/vapidKey').once('value');
        window._fcmVapidKey = snap.val() || null;
        return window._fcmVapidKey;
      }
    }catch(e){ console.warn('VAPID load', e); }
    window._fcmVapidKey = null;
    return null;
  }

  async function saveToken(path, payload){
    if(typeof db === 'undefined' || !path || !payload?.token) return;
    const id = tokenId(payload.token);
    await db.ref(path + '/' + id).set({
      token: payload.token,
      platform: payload.platform || 'web',
      ts: new Date().toISOString(),
      ...payload.meta,
    });
  }

  window.PortalPush = {
    role: null,
    meta: {},

    setContext(role, meta){
      this.role = role;
      this.meta = meta || {};
    },

    async enable(){
      if(isNative()) return this.enableNative();
      return this.enableWeb();
    },

    async enableWeb(){
      if(!('Notification' in window)) return { ok:false, reason:'unsupported' };
      const perm = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if(perm !== 'granted') return { ok:false, reason: perm };

      if(typeof firebase === 'undefined' || !firebase.messaging){
        return { ok:false, reason:'messaging_unavailable' };
      }

      const vapidKey = await getVapidKey();
      if(!vapidKey){
        console.warn('FCM: publicConfig/fcm/vapidKey missing');
        return { ok:false, reason:'no_vapid' };
      }

      try{
        if(!messaging) messaging = firebase.messaging();
        const reg = window.swRegistration || await navigator.serviceWorker.register('sw.js');
        window.swRegistration = reg;
        await navigator.serviceWorker.ready;

        const token = await messaging.getToken({
          vapidKey,
          serviceWorkerRegistration: reg,
        });
        if(!token) return { ok:false, reason:'no_token' };

        await this.persistToken(token, 'web');
        if(!window._fcmForegroundHook){
          messaging.onMessage((payload)=>{
            const title = payload.notification?.title || payload.data?.title || '📚 بوابة المتابعة';
            const body  = payload.notification?.body  || payload.data?.body  || 'تحديث جديد';
            if(typeof sendLocalNotif === 'function') sendLocalNotif(title, body);
            else if(typeof showToast === 'function') showToast(title + ': ' + body);
            PortalPush.playSound();
          });
          window._fcmForegroundHook = true;
        }
        return { ok:true, token };
      }catch(e){
        console.warn('FCM enableWeb', e);
        return { ok:false, reason: e.message || 'error' };
      }
    },

    async enableNative(){
      const PushNotifications = getPushPlugin();
      if(!PushNotifications) return { ok:false, reason:'native_plugin_missing' };

      if(nativeReady) return { ok:true, reason:'already' };

      let perm = await PushNotifications.checkPermissions();
      if(perm.receive !== 'granted'){
        perm = await PushNotifications.requestPermissions();
      }
      if(perm.receive !== 'granted') return { ok:false, reason:'denied' };

      PushNotifications.addListener('registration', async (t)=>{
        if(!t.value) return;
        await PortalPush.persistToken(t.value, 'android');
      });
      PushNotifications.addListener('registrationError', (err)=>{
        console.warn('Push registrationError', err);
      });
      PushNotifications.addListener('pushNotificationReceived', (notif)=>{
        const title = notif.title || '📚 بوابة المتابعة';
        const body  = notif.body || 'تحديث جديد';
        if(typeof sendLocalNotif === 'function') sendLocalNotif(title, body);
        PortalPush.playSound();
      });
      PushNotifications.addListener('pushNotificationActionPerformed', ()=>{
        if(typeof openInboxFromAlert === 'function') openInboxFromAlert();
      });

      await PushNotifications.register();
      nativeReady = true;
      return { ok:true, reason:'native_registered' };
    },

    async persistToken(token, platform){
      const role = this.role;
      const meta = this.meta || {};
      if(role === 'parent' && meta.mid){
        await saveToken('fcmTokens/parents/' + meta.mid, {
          token, platform, meta: { mid: String(meta.mid), cls: meta.cls||'', name: meta.name||'' },
        });
      } else if(role === 'teacher' && meta.teacherKey){
        await saveToken('fcmTokens/teachers/' + meta.teacherKey, {
          token, platform, meta: { teacherKey: meta.teacherKey, uid: meta.uid||'' },
        });
      } else if(role === 'admin' && meta.uid){
        await saveToken('fcmTokens/admins/' + meta.uid, {
          token, platform, meta: { uid: meta.uid },
        });
      }
    },

    playSound(){
      try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.08;
        o.start();
        setTimeout(()=>{ o.stop(); ctx.close(); }, 180);
      }catch(e){ /* ignore */ }
    },

    async registerParent(parent){
      if(!parent?.mid) return;
      this.setContext('parent', {
        mid: String(parent.mid),
        cls: parent.cls || '',
        name: parent.name || '',
      });
      return this.enable();
    },

    async registerTeacher(teacher){
      const key = teacher?._key || teacher?.key;
      if(!key) return { ok:false };
      this.setContext('teacher', { teacherKey: key, uid: teacher.uid || auth?.currentUser?.uid || '' });
      return this.enable();
    },

    async registerAdmin(uid){
      if(!uid) return { ok:false };
      this.setContext('admin', { uid });
      return this.enable();
    },
  };

  window.fbSaveNotif = async function(payload){
    if(typeof db === 'undefined') throw new Error('Firebase not ready');
    return db.ref('teacherNotifications').push({
      ...payload,
      ts: new Date().toISOString(),
    });
  };
})();
