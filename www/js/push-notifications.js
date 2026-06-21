// ══════════════════════════════════════════════════
//  Push Notifications — FCM (Web PWA + Capacitor Android)
//  إشعارات نظام حقيقية (مثل واتساب) — مفتوح أو مغلق
// ══════════════════════════════════════════════════
(function(){
  const APP_URL = 'https://emadabuhoujaila.github.io/science-portal/';
  let messaging = null;
  let nativeReady = false;
  let nativeListenersBound = false;

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

  function getFirebaseMessagingPlugin(){
    try { return window.Capacitor?.Plugins?.FirebaseMessaging || null; }
    catch(e){ return null; }
  }

  function nativePlatform(){
    try { return window.Capacitor?.getPlatform?.() || ''; }
    catch(e){ return ''; }
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
    if(typeof db === 'undefined' || !path || !payload?.token) return false;
    const id = tokenId(payload.token);
    const meta = payload.meta || {};
    try{
      await db.ref(path + '/' + id).set({
        token: payload.token,
        platform: payload.platform || 'web',
        ts: new Date().toISOString(),
        mid: meta.mid ? String(meta.mid) : null,
        teacherKey: meta.teacherKey || null,
        uid: meta.uid || null,
        cls: meta.cls || '',
        name: meta.name || '',
      });
      console.log('FCM token saved', path, id);
      return true;
    }catch(e){
      console.warn('FCM token save failed', path, e);
      return false;
    }
  }

  function hookForegroundMessages(){
    if(!messaging || window._fcmForegroundHook) return;
    messaging.onMessage((payload)=>{
      const title = payload.notification?.title || payload.data?.title || '📚 بوابة المتابعة';
      const body  = payload.notification?.body  || payload.data?.body  || 'تحديث جديد';
      if(typeof sendLocalNotif === 'function') sendLocalNotif(title, body);
      else if(typeof showToast === 'function') showToast(title + ': ' + body);
      PortalPush.playSound();
    });
    window._fcmForegroundHook = true;
  }

  window.PortalPush = {
    role: null,
    meta: {},

    OPTIN_KEY: 'portal-push-optin',

    async getPermissionState(){
      if(isNative()){
        const FCM = getFirebaseMessagingPlugin();
        if(FCM?.checkPermissions){
          const p = await FCM.checkPermissions();
          return p.receive || 'prompt';
        }
        const Push = getPushPlugin();
        if(!Push?.checkPermissions) return 'unsupported';
        const p = await Push.checkPermissions();
        return p.receive || 'prompt';
      }
      if(!('Notification' in window)) return 'unsupported';
      return Notification.permission;
    },

    isOptInSettled(){
      const s = localStorage.getItem(this.OPTIN_KEY);
      return s === 'enabled' || s === 'dismissed';
    },

    markOptInEnabled(){
      try{ localStorage.setItem(this.OPTIN_KEY, 'enabled'); }catch(e){}
    },

    markOptInDismissed(){
      try{ localStorage.setItem(this.OPTIN_KEY, 'dismissed'); }catch(e){}
    },

    async clearDeliveredNotifications(){
      if(isNative()){
        try{
          const Push = getPushPlugin();
          if(Push?.removeAllDeliveredNotifications){
            await Push.removeAllDeliveredNotifications();
          }
        }catch(e){ console.warn('clear native notifications', e); }
        return;
      }
      try{
        if('serviceWorker' in navigator){
          const reg = window.swRegistration || await navigator.serviceWorker.ready;
          const list = await reg.getNotifications();
          list.forEach(n=>{ try{ n.close(); }catch(e){} });
        }
      }catch(e){ console.warn('clear web notifications', e); }
    },

    setContext(role, meta){
      this.role = role;
      this.meta = meta || {};
    },

    detectContextFromApp(){
      if(window._currentParent?.mid){
        this.setContext('parent', {
          mid: String(window._currentParent.mid),
          cls: window._currentParent.cls || '',
          name: window._currentParent.name || '',
        });
        return 'parent';
      }
      if(typeof CURRENT_TEACHER !== 'undefined' && CURRENT_TEACHER?._key){
        this.setContext('teacher', {
          teacherKey: CURRENT_TEACHER._key,
          uid: (typeof auth !== 'undefined' && auth.currentUser?.uid) || '',
        });
        return 'teacher';
      }
      if(typeof IS_ADMIN !== 'undefined' && IS_ADMIN && typeof auth !== 'undefined' && auth.currentUser?.uid){
        this.setContext('admin', { uid: auth.currentUser.uid });
        return 'admin';
      }
      const sp = typeof APP !== 'undefined' ? APP.savedParent : null;
      if(sp?.mid){
        this.setContext('parent', { mid: String(sp.mid), cls: sp.cls||'', name: sp.name||'' });
        return 'parent';
      }
      return null;
    },

    async enable(opts){
      if(!this.role) this.detectContextFromApp();
      if(isNative()) return this.enableNative(opts);
      return this.enableWeb(opts);
    },

    async enableWeb(opts){
      opts = opts || {};
      if(!('Notification' in window)) return { ok:false, reason:'unsupported' };

      if(typeof firebase === 'undefined' || !firebase.messaging){
        return { ok:false, reason:'messaging_unavailable' };
      }

      let perm = Notification.permission;
      if(perm !== 'granted'){
        if(!opts.forcePrompt && perm === 'denied') return { ok:false, reason:'denied' };
        perm = await Notification.requestPermission();
      }
      if(perm !== 'granted') return { ok:false, reason: perm };

      const vapidKey = await getVapidKey();
      if(!vapidKey) return { ok:false, reason:'no_vapid' };

      try{
        if(!messaging) messaging = firebase.messaging();

        if(typeof registerSW === 'function' && !window.swRegistration){
          await registerSW();
        }
        const reg = window.swRegistration || await navigator.serviceWorker.register('sw.js');
        window.swRegistration = reg;
        await navigator.serviceWorker.ready;

        const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: reg });
        if(!token) return { ok:false, reason:'no_token' };

        const saved = await this.persistToken(token, 'web');
        if(!saved) return { ok:false, reason:'token_save_failed' };

        this.markOptInEnabled();
        hookForegroundMessages();

        if(typeof messaging.onTokenRefresh === 'function'){
          messaging.onTokenRefresh(async ()=>{
            try{
              const t = await messaging.getToken({ vapidKey, serviceWorkerRegistration: reg });
              if(t) await PortalPush.persistToken(t, 'web');
            }catch(e){ console.warn('token refresh', e); }
          });
        }

        return { ok:true, token };
      }catch(e){
        console.warn('FCM enableWeb', e);
        return { ok:false, reason: e.message || 'error' };
      }
    },

    async enableNative(opts){
      return this.enableNativeFcm(opts);
    },

    async enableNativeFcm(opts){
      opts = opts || {};
      const FCM = getFirebaseMessagingPlugin();
      if(!FCM) return { ok:false, reason:'fcm_plugin_missing' };
      const platform = nativePlatform() === 'ios' ? 'ios' : 'android';

      if(!nativeListenersBound){
        if(FCM.addListener){
          FCM.addListener('notificationReceived', ()=> PortalPush.playSound());
          FCM.addListener('notificationActionPerformed', async ()=>{
            await PortalPush.clearDeliveredNotifications();
            if(typeof openInboxFromAlert === 'function') openInboxFromAlert();
          });
        }
        nativeListenersBound = true;
      }

      let perm = await FCM.checkPermissions();
      if(perm.receive !== 'granted'){
        if(!opts.forcePrompt && perm.receive === 'denied') return { ok:false, reason:'denied' };
        perm = await FCM.requestPermissions();
      }
      if(perm.receive !== 'granted') return { ok:false, reason:'denied' };

      if(platform === 'android'){
        try{
          const Push = getPushPlugin();
          if(Push?.createChannel){
            await Push.createChannel({
              id: 'portal_alerts',
              name: 'تنبيهات البوابة',
              description: 'رسائل وملاحظات وشكاوى',
              importance: 5,
              visibility: 1,
              sound: 'default',
              vibration: true,
            });
          }
        }catch(e){ /* optional */ }
      }

      const result = await FCM.getToken();
      const token = result?.token;
      if(!token) return { ok:false, reason:'no_token' };

      const saved = await this.persistToken(token, platform);
      if(!saved) return { ok:false, reason:'token_save_failed' };

      this.markOptInEnabled();
      nativeReady = true;
      return { ok:true, reason: platform + '_registered' };
    },

    async persistToken(token, platform){
      const role = this.role;
      const meta = this.meta || {};
      if(role === 'parent' && meta.mid){
        return saveToken('fcmTokens/parents/' + meta.mid, { token, platform, meta });
      }
      if(role === 'teacher' && meta.teacherKey){
        return saveToken('fcmTokens/teachers/' + meta.teacherKey, { token, platform, meta });
      }
      if(role === 'admin' && meta.uid){
        return saveToken('fcmTokens/admins/' + meta.uid, { token, platform, meta });
      }
      console.warn('FCM persistToken: missing role context', role, meta);
      return false;
    },

    playSound(){
      try{
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        g.gain.value = 0.1;
        o.start();
        setTimeout(()=>{ o.stop(); ctx.close(); }, 200);
      }catch(e){ /* ignore */ }
    },

    async registerParent(parent, opts){
      if(!parent?.mid) return { ok:false, reason:'no_mid' };
      this.setContext('parent', {
        mid: String(parent.mid),
        cls: parent.cls || '',
        name: parent.name || '',
      });
      return this.enable(opts);
    },

    async registerTeacher(teacher, opts){
      const key = teacher?._key || teacher?.key;
      if(!key) return { ok:false, reason:'no_key' };
      this.setContext('teacher', {
        teacherKey: key,
        uid: teacher.uid || (typeof auth !== 'undefined' ? auth.currentUser?.uid : '') || '',
      });
      return this.enable(opts);
    },

    async registerAdmin(uid, opts){
      if(!uid) return { ok:false, reason:'no_uid' };
      this.setContext('admin', { uid });
      return this.enable(opts);
    },
  };
})();
