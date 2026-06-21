// ══════════════════════════════════════════════════
//  Message Attachments — images + PDF (Storage via Functions)
// ══════════════════════════════════════════════════
(function(){
  const IMAGE_MAX = 5 * 1024 * 1024;
  const PDF_MAX = 10 * 1024 * 1024;
  const ALLOWED = {
    'image/jpeg': IMAGE_MAX,
    'image/png': IMAGE_MAX,
    'image/webp': IMAGE_MAX,
    'application/pdf': PDF_MAX,
  };
  const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

  const _pending = new Map();

  function isEn(){ return typeof currentLang !== 'undefined' && currentLang === 'en'; }

  function t(ar, en){ return isEn() ? en : ar; }

  function getFns(){
    if(typeof functions !== 'undefined') return functions;
    if(typeof firebase !== 'undefined' && firebase.app) return firebase.app().functions('us-central1');
    return null;
  }

  function validateFile(file){
    if(!file) return { ok:false, reason: t('لم يُختر ملف', 'No file selected') };
    const max = ALLOWED[file.type];
    if(!max) return { ok:false, reason: t('نوع غير مدعوم — صور أو PDF فقط', 'Only images or PDF allowed') };
    if(file.size > max){
      return { ok:false, reason: file.type === 'application/pdf'
        ? t('PDF أكبر من 10 MB', 'PDF exceeds 10 MB')
        : t('الصورة أكبر من 5 MB', 'Image exceeds 5 MB') };
    }
    return { ok:true };
  }

  function pickFile(inputId){
    const inp = document.getElementById(inputId);
    if(inp) inp.click();
  }

  function onFileSelected(inputId, previewId){
    const inp = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if(!inp || !preview) return;
    const file = inp.files?.[0];
    if(!file){ _pending.delete(inputId); preview.innerHTML = ''; return; }
    const v = validateFile(file);
    if(!v.ok){
      inp.value = '';
      _pending.delete(inputId);
      preview.innerHTML = '';
      if(typeof showToast === 'function') showToast('⚠️ ' + v.reason);
      return;
    }
    _pending.set(inputId, file);
    const isPdf = file.type === 'application/pdf';
    const thumb = isPdf
      ? `<span class="msg-att-icon">📄</span>`
      : `<img class="msg-att-thumb" src="${URL.createObjectURL(file)}" alt="">`;
    preview.innerHTML = `
      <div class="msg-att-preview">
        ${thumb}
        <div class="msg-att-preview-meta">
          <span class="msg-att-name">${escapeAtt(file.name)}</span>
          <span class="msg-att-size">${formatSize(file.size)}</span>
        </div>
        <button type="button" class="msg-att-clear" onclick="PortalAttachments.clear('${inputId}','${previewId}')" title="${t('إزالة','Remove')}">✕</button>
      </div>`;
  }

  function escapeAtt(s){
    if(typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function formatSize(bytes){
    if(bytes < 1024) return bytes + ' B';
    if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getPending(inputId){
    return _pending.get(inputId) || null;
  }

  function clear(inputId, previewId){
    _pending.delete(inputId);
    const inp = document.getElementById(inputId);
    if(inp) inp.value = '';
    const preview = document.getElementById(previewId);
    if(preview) preview.innerHTML = '';
  }

  function fieldHtml(inputId, previewId){
    const id = inputId || ('att-input-' + Math.random().toString(36).slice(2, 8));
    const prev = previewId || (id + '-preview');
    return `
      <div class="msg-att-field">
        <input type="file" id="${id}" accept="${ACCEPT}" style="display:none"
          onchange="PortalAttachments.onFileSelected('${id}','${prev}')">
        <button type="button" class="msg-att-btn" onclick="PortalAttachments.pickFile('${id}')">
          📎 ${t('إرفاق صورة أو PDF','Attach image or PDF')}
        </button>
        <div id="${prev}" class="msg-att-preview-wrap"></div>
      </div>`;
  }

  async function uploadFile(file, channel, meta){
    const v = validateFile(file);
    if(!v.ok) throw new Error(v.reason);
    const fns = getFns();
    if(!fns) throw new Error(t('الخدمة غير متاحة','Service unavailable'));

    const prepare = fns.httpsCallable('prepareAttachmentUpload');
    const complete = fns.httpsCallable('completeAttachmentUpload');
    const prep = await prepare({
      channel,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      meta: meta || {},
    });
    const { uploadUrl, path } = prep.data || {};
    if(!uploadUrl || !path) throw new Error(t('تعذّر تجهيز الرفع','Upload prepare failed'));

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if(!res.ok) throw new Error(t('فشل رفع الملف','File upload failed'));

    const done = await complete({
      path,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      channel,
      meta: meta || {},
    });
    return done.data;
  }

  async function uploadPending(inputId, channel, meta){
    const file = getPending(inputId);
    if(!file) return null;
    return uploadFile(file, channel, meta);
  }

  function render(att){
    if(!att || !att.url) return '';
    const isPdf = att.type === 'application/pdf' || /\.pdf$/i.test(att.name || '');
    const label = escapeAtt(att.name || (isPdf ? 'document.pdf' : 'image'));
    if(isPdf){
      return `
        <div class="msg-att-display pdf">
          <a href="${escapeAtt(att.url)}" target="_blank" rel="noopener" class="msg-att-link">
            📄 ${label} · ${t('فتح PDF','Open PDF')}
          </a>
        </div>`;
    }
    return `
      <div class="msg-att-display image">
        <a href="${escapeAtt(att.url)}" target="_blank" rel="noopener">
          <img src="${escapeAtt(att.url)}" alt="${label}" class="msg-att-image" loading="lazy">
        </a>
        <span class="msg-att-caption">${label}</span>
      </div>`;
  }

  function hasContent(body, inputId){
    const text = (body || '').trim();
    const file = getPending(inputId);
    return !!(text || file);
  }

  function notifSuffix(att){
    return att ? ' 📎' : '';
  }

  window.PortalAttachments = {
    IMAGE_MAX,
    PDF_MAX,
    ACCEPT,
    fieldHtml,
    pickFile,
    onFileSelected,
    getPending,
    clear,
    validateFile,
    uploadFile,
    uploadPending,
    render,
    hasContent,
    notifSuffix,
  };
})();
