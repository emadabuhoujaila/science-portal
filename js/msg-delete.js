// ══════════════════════════════════════════════════
//  Message delete / hide — per-role permissions
// ══════════════════════════════════════════════════
(function(){
  const NOTIFY_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

  let _notifyAudio = null;
  let _audioUnlocked = false;

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

  window.MsgDelete = {
    labels,

    isAdminHidden(scope, id){ return _hasId('admin_hide_' + scope, id); },
    hideAdmin(scope, id){
      _addId('admin_hide_' + scope, id);
      if(typeof showToast === 'function') showToast(labels().doneHide);
    },

    isTeacherHidden(scope, id){
      const key = typeof getTeacherKey === 'function' ? (getTeacherKey() || 'none') : 'none';
      return _hasId('teacher_hide_' + key + '_' + scope, id);
    },
    hideTeacher(scope, id){
      const key = typeof getTeacherKey === 'function' ? (getTeacherKey() || 'none') : 'none';
      _addId('teacher_hide_' + key + '_' + scope, id);
      if(typeof showToast === 'function') showToast(labels().doneHide);
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

    toggleMenu(btn, ev){
      if(ev){ ev.stopPropagation(); ev.preventDefault(); }
      const menu = btn?.closest('.msg-del-wrap')?.querySelector('.msg-del-menu');
      if(!menu) return;
      const open = menu.classList.contains('open');
      document.querySelectorAll('.msg-del-menu.open').forEach(m=>m.classList.remove('open'));
      if(!open) menu.classList.add('open');
    },

    closeMenus(){
      document.querySelectorAll('.msg-del-menu.open').forEach(m=>m.classList.remove('open'));
    },

    parentBtn(onclickFn){
      const L = labels();
      return `<button type="button" class="parent-msg-del" onclick="event.stopPropagation();${onclickFn}" title="${L.delete}">🗑️</button>`;
    },

    adminBtn(scope, itemId){
      return this.menuHtml('admin', itemId, scope);
    },

    teacherDualBtn(scope, itemId){
      return this.menuHtml('teacherDual', itemId, scope);
    },

    teacherOnlyBtn(scope, itemId){
      return this.menuHtml('teacherOnly', itemId, scope);
    },

    menuHtml(mode, itemId, extra){
      extra = extra || '';
      const L = labels();
      const safeId = String(itemId || '').replace(/'/g, "\\'");
      let items = '';
      if(mode === 'parent'){
        items = `<button type="button" class="msg-del-opt" onclick="event.stopPropagation();${extra}">${L.delete}</button>`;
      }else if(mode === 'teacherDual'){
        items = `<button type="button" class="msg-del-opt" onclick="event.stopPropagation();teacherMsgDelete('${safeId}','${extra}','me');MsgDelete.closeMenus()">${L.hideMe}</button>`
          + `<button type="button" class="msg-del-opt danger" onclick="event.stopPropagation();teacherMsgDelete('${safeId}','${extra}','both');MsgDelete.closeMenus()">${L.hideParent}</button>`;
      }else if(mode === 'teacherOnly'){
        items = `<button type="button" class="msg-del-opt" onclick="event.stopPropagation();teacherMsgDelete('${safeId}','${extra}','me');MsgDelete.closeMenus()">${L.hideMe}</button>`;
      }else if(mode === 'admin'){
        items = `<button type="button" class="msg-del-opt" onclick="event.stopPropagation();adminHideMsg('${safeId}','${extra}');MsgDelete.closeMenus()">${L.hideMe}</button>`
          + `<button type="button" class="msg-del-opt danger" onclick="event.stopPropagation();adminDeleteMsgAll('${safeId}','${extra}');MsgDelete.closeMenus()">${L.hideAll}</button>`;
      }
      return `<div class="msg-del-wrap" onclick="event.stopPropagation()">`
        + `<button type="button" class="parent-msg-del" onclick="MsgDelete.toggleMenu(this,event)" title="${L.delete}">🗑️</button>`
        + `<div class="msg-del-menu">${items}</div></div>`;
    },
  };

  document.addEventListener('click', (e)=>{
    if(e.target.closest('.msg-del-wrap')) return;
    window.MsgDelete.closeMenus();
  });
  document.addEventListener('touchstart', ()=> window.MsgDelete.unlockAudio(), { once: true, passive: true });
  document.addEventListener('click', ()=> window.MsgDelete.unlockAudio(), { once: true });
})();
