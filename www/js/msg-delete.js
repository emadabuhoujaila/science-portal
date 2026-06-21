// ══════════════════════════════════════════════════
//  Message delete / hide — per-role permissions
// ══════════════════════════════════════════════════
(function(){
  const NOTIFY_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

  let _notifyAudio = null;
  let _audioUnlocked = false;
  const _globalDeleted = new Set();

  function labels(){
    const isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
    return {
      delete: isEn ? 'Delete' : 'حذف',
      hideMe: isEn ? 'Delete for me only' : 'حذف لدي فقط',
      hideAll: isEn ? 'Delete for everyone' : 'حذف لدى الجميع',
      hideParent: isEn ? 'Delete for me & parent' : 'حذف لدي ولدى ولي الأمر',
      confirmHideMe: isEn ? 'Hide on your device only?' : 'حذف من جهازك فقط؟',
      confirmHideAll: isEn ? 'Delete permanently for everyone?' : 'حذف نهائي من عند الجميع؟',
      confirmHideParent: isEn ? 'Delete from your view and parent view?' : 'حذف من عندك ومن عند ولي الأمر؟',
      doneHide: isEn ? '✅ Deleted on your device' : '✅ تم الحذف من جهازك',
      doneAll: isEn ? '✅ Deleted for everyone' : '✅ تم الحذف من عند الجميع',
      fail: isEn ? '❌ Delete failed' : '❌ فشل الحذف',
    };
  }

  function _readIds(key){
    try{ return JSON.parse(localStorage.getItem(key) || '[]'); }catch(e){ return []; }
  }

  function _writeIds(key, ids){
    try{ localStorage.setItem(key, JSON.stringify([...new Set(ids)])); }catch(e){}
  }

  function _addId(key, id){
    if(!id) return;
    const ids = _readIds(key);
    if(!ids.includes(id)) ids.push(id);
    _writeIds(key, ids);
  }

  function _hasId(key, id){
    return !!id && _readIds(key).includes(id);
  }

  function _normKeys(keys){
    return [...new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean).map(String))];
  }

  window.MsgDelete = {
    labels,

    isGlobal(key){
      return !!key && _globalDeleted.has(String(key));
    },

    async syncFromServer(){
      if(typeof db === 'undefined') return;
      try{
        const snap = await db.ref('portalDeleted').once('value');
        _globalDeleted.clear();
        if(snap.exists()){
          Object.keys(snap.val() || {}).forEach(k => _globalDeleted.add(k));
        }
      }catch(e){ console.warn('MsgDelete.syncFromServer', e); }
    },

    markGlobal(keys){
      const list = _normKeys(keys);
      if(!list.length) return Promise.resolve();
      list.forEach(k => _globalDeleted.add(k));
      if(typeof db === 'undefined') return Promise.resolve();
      const updates = {};
      const ts = Date.now();
      list.forEach(k => { updates['portalDeleted/' + k] = { ts }; });
      return db.ref().update(updates).catch(e => console.warn('MsgDelete.markGlobal', e));
    },

    isAdminHidden(scope, id){
      if(!id) return false;
      if(_hasId('admin_hide_' + scope, id)) return true;
      if(scope === 'complaint' && this.isGlobal('complaint/' + id)) return true;
      if(scope === 'inbox' && this.isGlobal('adminInbox/' + id)) return true;
      if(scope === 'outbox' && this.isGlobal('adminOutbox/' + id)) return true;
      return false;
    },

    hideAdmin(scope, id){
      _addId('admin_hide_' + scope, id);
      if(typeof showToast === 'function') showToast(labels().doneHide);
    },

    isTeacherHidden(scope, id){
      const key = typeof getTeacherKey === 'function' ? (getTeacherKey() || 'none') : 'none';
      if(_hasId('teacher_hide_' + key + '_' + scope, id)) return true;
      if(scope === 'teacher_msg' && this.isGlobal('teacherMsg/' + key + '/' + id)) return true;
      if(scope === 'parent_inbox' && this.isGlobal('teacherParentMsg/' + key + '/' + id)) return true;
      if(scope === 'tadmin' && this.isGlobal('teacherAdminMsg/' + key + '/' + id)) return true;
      if(scope === 'tsent' && this.isGlobal('teacherSentAdmin/' + key + '/' + id)) return true;
      if(scope === 'complaint' && this.isGlobal('teacherComplaint/' + key + '/' + id)) return true;
      return false;
    },

    hideTeacher(scope, id){
      const key = typeof getTeacherKey === 'function' ? (getTeacherKey() || 'none') : 'none';
      _addId('teacher_hide_' + key + '_' + scope, id);
      if(typeof showToast === 'function') showToast(labels().doneHide);
    },

    isParentItemDeleted(type, msg, extra){
      const ctx = window._parentSubjectContext || window._currentParent || {};
      const mid = String(ctx.mid || extra?.mid || '');
      const teacherKey = extra?.teacherKey || msg?._teacherKey || msg?.teacherKey || '';
      if(type === 'admin_msg'){
        if(this.isGlobal('parentAdminInbox/' + mid + '/' + (msg?.id || ''))) return true;
        if(msg?.outboxId && this.isGlobal('adminOutbox/' + msg.outboxId)) return true;
        return false;
      }
      if(type === 'complaint'){
        const cid = msg?.id || extra?.complaintId || '';
        if(this.isGlobal('complaint/' + cid)) return true;
        if(mid && this.isGlobal('parentComplaint/' + mid + '/' + cid)) return true;
        return false;
      }
      if(type === 'parent_to_admin'){
        return this.isGlobal('parentToAdmin/' + mid + '/' + (msg?.id || msg?.ts || ''));
      }
      if(type === 'received' || type === 'sent'){
        return teacherKey && this.isGlobal('teacherParentMsg/' + teacherKey + '/' + (msg?.id || ''));
      }
      if(type === 'teacher_msg'){
        return teacherKey && this.isGlobal('teacherMsg/' + teacherKey + '/' + (msg?.id || ''));
      }
      return false;
    },

    unlockAudio(){
      if(_audioUnlocked) return;
      try{
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if(Ctx){
          window._portalAudioCtx = window._portalAudioCtx || new Ctx();
          if(window._portalAudioCtx.state === 'suspended') window._portalAudioCtx.resume();
        }
        _notifyAudio = _notifyAudio || new Audio(NOTIFY_WAV);
        _notifyAudio.volume = 1;
        const p = _notifyAudio.play();
        if(p){
          p.then(()=>{
            _notifyAudio.pause();
            _notifyAudio.currentTime = 0;
            _audioUnlocked = true;
          }).catch(()=>{});
        }
      }catch(e){ /* ignore */ }
    },

    playNotifySound(){
      this.unlockAudio();
      try{
        if(!_notifyAudio) _notifyAudio = new Audio(NOTIFY_WAV);
        _notifyAudio.volume = 1;
        _notifyAudio.currentTime = 0;
        const p = _notifyAudio.play();
        if(p) p.catch(()=> this._oscBeep());
      }catch(e){ this._oscBeep(); }
      setTimeout(()=> this._oscBeep(), 260);
      try{
        if(navigator.vibrate) navigator.vibrate([0, 120, 60, 120]);
      }catch(e){}
    },

    _oscBeep(){
      try{
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = window._portalAudioCtx || new Ctx();
        if(ctx.state === 'suspended') ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.35;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        setTimeout(()=>{ try{ o.stop(); }catch(e){} }, 220);
      }catch(e){ /* ignore */ }
    },

    _chip(label, onclick, danger){
      return `<button type="button" class="msg-del-chip${danger ? ' danger' : ''}" onclick="event.stopPropagation();${onclick}">${label}</button>`;
    },

    parentBtn(onclickFn){
      const L = labels();
      return this._chip(L.delete, onclickFn, true);
    },

    adminBtn(scope, itemId){
      return this.actionsHtml('admin', itemId, scope);
    },

    teacherDualBtn(scope, itemId){
      return this.actionsHtml('teacherDual', itemId, scope);
    },

    teacherOnlyBtn(scope, itemId){
      return this.actionsHtml('teacherOnly', itemId, scope);
    },

    actionsHtml(mode, itemId, extra){
      extra = extra || '';
      const L = labels();
      const safeId = String(itemId || '').replace(/'/g, "\\'");
      let chips = '';
      if(mode === 'teacherDual'){
        chips = this._chip(L.hideMe, `teacherMsgDelete('${safeId}','${extra}','me')`)
          + this._chip(L.hideParent, `teacherMsgDelete('${safeId}','${extra}','both')`, true);
      }else if(mode === 'teacherOnly'){
        chips = this._chip(L.hideMe, `teacherMsgDelete('${safeId}','${extra}','me')`);
      }else if(mode === 'admin'){
        chips = this._chip(L.hideMe, `adminHideMsg('${safeId}','${extra}')`)
          + this._chip(L.hideAll, `adminDeleteMsgAll('${safeId}','${extra}')`, true);
      }
      return `<div class="msg-del-row" onclick="event.stopPropagation()">${chips}</div>`;
    },
  };

  document.addEventListener('touchstart', ()=> window.MsgDelete.unlockAudio(), { once: true, passive: true });
  document.addEventListener('click', ()=> window.MsgDelete.unlockAudio(), { once: true });
})();
