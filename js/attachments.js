// ══════════════════════════════════════════════════
//  Message Attachments — all image types + PDF
// ══════════════════════════════════════════════════
(function(){
  const IMAGE_MAX = 5 * 1024 * 1024;
  const PDF_MAX = 6 * 1024 * 1024;
  const ACCEPT = 'image/*,application/pdf';
  const EXT_TO_TYPE = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
    svg: 'image/svg+xml', pdf: 'application/pdf',
  };
  const MIME_ALIASES = {
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/x-citrix-jpeg': 'image/jpeg',
    'image/x-png': 'image/png',
    'image/x-bmp': 'image/bmp',
    'application/x-pdf': 'application/pdf',
  };
  const INLINE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

  const _pending = new Map();
  const _pendingType = new Map();

  function isEn(){ return typeof currentLang !== 'undefined' && currentLang === 'en'; }
  function t(ar, en){ return isEn() ? en : ar; }

  function getFns(){
    if(typeof functions !== 'undefined') return functions;
    if(typeof firebase !== 'undefined' && firebase.app) return firebase.app().functions('us-central1');
    return null;
  }

  function stripMimeParams(type){
    return String(type || '').trim().toLowerCase().split(';')[0].trim();
  }

  function normalizeMime(type){
    const raw = stripMimeParams(type);
    if(!raw || raw === 'image/*' || raw === 'application/*') return '';
    return MIME_ALIASES[raw] || raw;
  }

  function isPdfType(type){ return type === 'application/pdf'; }
  function isImageType(type){ return String(type || '').startsWith('image/'); }
  function isAllowedType(type){ return isPdfType(type) || isImageType(type); }
  function maxSizeFor(type){
    if(isPdfType(type)) return PDF_MAX;
    if(isImageType(type)) return IMAGE_MAX;
    return 0;
  }

  function typeFromName(name){
    const parts = String(name || '').split('.');
    if(parts.length < 2) return '';
    return EXT_TO_TYPE[parts.pop().toLowerCase()] || '';
  }

  function sniffBytes(head){
    if(!head || !head.length) return '';
    if(head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if(head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
    if(head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46
      && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
    if(head.length >= 6 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'image/gif';
    if(head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp';
    if(head.length >= 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return 'application/pdf';
    if(head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70){
      const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
      if(/heic|heix|hevc|hevx|mif1|msf1/i.test(brand)) return 'image/heic';
      if(/avif/i.test(brand)) return 'image/avif';
    }
    return '';
  }

  async function sniffFileType(file){
    try{
      return sniffBytes(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    }catch(e){ return ''; }
  }

  async function probeImageDecodable(file){
    return new Promise(resolve=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      const done = (ok)=>{ URL.revokeObjectURL(url); resolve(!!ok); };
      img.onload = ()=> done(true);
      img.onerror = ()=> done(false);
      img.src = url;
    });
  }

  async function resolveContentType(file){
    if(!file) return '';

    let type = normalizeMime(file.type);
    if(isAllowedType(type)) return type;

    type = typeFromName(file.name);
    if(isAllowedType(type)) return type;

    type = await sniffFileType(file);
    if(isAllowedType(type)) return type;

    if(await probeImageDecodable(file)) return 'image/jpeg';

    try{
      const head = await new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(new Uint8Array(reader.result));
        reader.onerror = ()=> reject(reader.error);
        reader.readAsArrayBuffer(file.slice(0, 16));
      });
      type = sniffBytes(head);
      if(isAllowedType(type)) return type;
    }catch(e){}

    const raw = stripMimeParams(file.type);
    if(raw.startsWith('image/')) return raw;
    if(file.size > 0) return 'image/jpeg';
    return '';
  }

  function extForType(type){
    const map = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
      'image/bmp': '.bmp', 'image/tiff': '.tiff', 'image/heic': '.heic', 'image/heif': '.heif',
      'image/avif': '.avif', 'image/svg+xml': '.svg', 'application/pdf': '.pdf',
    };
    return map[type] || (isImageType(type) ? '.jpg' : '');
  }

  function ensureFileName(name, type){
    const original = String(name || '').trim() || (isPdfType(type) ? 'document' : 'photo');
    if(/\.[a-z0-9]{2,5}$/i.test(original)) return original;
    return (original.replace(/\.[^.]+$/, '') || 'file') + extForType(type);
  }

  async function validateFile(file){
    if(!file) return { ok:false, reason: t('لم يُختر ملف', 'No file selected') };
    if(!file.size) return { ok:false, reason: t('الملف فارغ', 'File is empty') };

    const type = await resolveContentType(file);
    const max = maxSizeFor(type);
    if(!max){
      return { ok:false, reason: t('نوع غير مدعوم — صور أو PDF فقط', 'Only images or PDF allowed') };
    }
    if(file.size > max){
      return { ok:false, reason: isPdfType(type)
        ? t('PDF أكبر من 6 MB', 'PDF exceeds 6 MB')
        : t('الصورة أكبر من 5 MB', 'Image exceeds 5 MB') };
    }
    return { ok:true, type };
  }

  function blobToFile(blob, name, type){
    try{ return new File([blob], name, { type }); }
    catch(e){ blob.name = name; return blob; }
  }

  function shouldConvertToJpeg(type){
    return isImageType(type) && !INLINE_IMAGE_TYPES.has(type) && type !== 'image/png';
  }

  async function compressImage(file, type){
    const url = URL.createObjectURL(file);
    try{
      const img = await new Promise((resolve, reject)=>{
        const el = new Image();
        el.onload = ()=> resolve(el);
        el.onerror = ()=> reject(new Error('decode'));
        el.src = url;
      });
      const maxDim = 1600;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if(!w || !h) throw new Error('size');

      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      const outType = type === 'image/png' ? 'image/png' : 'image/jpeg';
      const qualities = outType === 'image/jpeg' ? [0.82, 0.72, 0.62] : [undefined];
      let best = null;
      for(const q of qualities){
        const blob = await new Promise(res => canvas.toBlob(res, outType, q));
        if(!blob) continue;
        if(!best || blob.size < best.size) best = blob;
        if(blob.size <= 900000) break;
      }
      if(!best) throw new Error('blob');
      const ext = outType === 'image/png' ? '.png' : '.jpg';
      const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
      return blobToFile(best, base + ext, outType);
    }catch(e){
      return blobToFile(file, ensureFileName(file.name, type), type);
    }finally{
      URL.revokeObjectURL(url);
    }
  }

  async function prepareUploadFile(file, type){
    if(isPdfType(type)) return blobToFile(file, ensureFileName(file.name, type), type);
    if(shouldConvertToJpeg(type)) return compressImage(file, type);
    if(file.size <= 700000 && type !== 'image/png') return blobToFile(file, ensureFileName(file.name, type), type);
    return compressImage(file, type);
  }

  async function ensureAuthFresh(){
    if(typeof auth === 'undefined' || !auth.currentUser) return;
    try{ await auth.currentUser.getIdToken(true); }catch(e){}
  }

  function pickPayload(data){
    if(!data) return null;
    return {
      url: String(data.url || ''),
      name: String(data.name || 'file'),
      type: String(data.type || ''),
      size: Number(data.size || 0),
    };
  }

  function pickFile(inputId){
    document.getElementById(inputId)?.click();
  }

  function previewThumb(file, type){
    if(isPdfType(type)) return `<span class="msg-att-icon">📄</span>`;
    if(INLINE_IMAGE_TYPES.has(type) || type === 'image/png'){
      return `<img class="msg-att-thumb" src="${URL.createObjectURL(file)}" alt="">`;
    }
    return `<span class="msg-att-icon">🖼️</span>`;
  }

  async function onFileSelected(inputId, previewId){
    const inp = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if(!inp || !preview) return;
    const file = inp.files?.[0];
    if(!file){
      _pending.delete(inputId);
      _pendingType.delete(inputId);
      preview.innerHTML = '';
      return;
    }

    preview.innerHTML = `<div class="msg-att-preview"><span class="msg-att-size">${t('جارٍ التحقق…','Checking…')}</span></div>`;
    const v = await validateFile(file);
    if(!v.ok){
      inp.value = '';
      _pending.delete(inputId);
      _pendingType.delete(inputId);
      preview.innerHTML = '';
      if(typeof showToast === 'function') showToast('⚠️ ' + v.reason);
      return;
    }

    _pending.set(inputId, file);
    _pendingType.set(inputId, v.type);
    preview.innerHTML = `
      <div class="msg-att-preview">
        ${previewThumb(file, v.type)}
        <div class="msg-att-preview-meta">
          <span class="msg-att-name">${escapeAtt(file.name || ensureFileName('', v.type))}</span>
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

  function getPending(inputId){ return _pending.get(inputId) || null; }

  function clear(inputId, previewId){
    _pending.delete(inputId);
    _pendingType.delete(inputId);
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

  function fileToBase64(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const dataUrl = String(reader.result || '');
        resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
      };
      reader.onerror = ()=> reject(new Error(t('تعذّر قراءة الملف','Could not read file')));
      reader.readAsDataURL(file);
    });
  }

  function callableErrorMessage(err){
    const code = err?.code || '';
    const msg = err?.message || '';
    if(code === 'functions/unauthenticated') return t('يجب تسجيل الدخول أولاً','Please sign in first');
    if(code === 'functions/permission-denied') return t('لا تملك صلاحية رفع هذا الملف','No permission to upload');
    if(code === 'functions/invalid-argument') return msg || t('ملف غير صالح','Invalid file');
    if(code === 'functions/internal' || /internal/i.test(msg)) return t('فشل رفع الملف — جرّب صورة أصغر','Upload failed — try a smaller image');
    if(/payload|too large|413|exceed/i.test(msg)) return t('الملف كبير جداً','File is too large');
    return msg || t('فشل رفع الملف','File upload failed');
  }

  async function uploadFile(file, channel, meta, knownType){
    const v = await validateFile(file);
    if(!v.ok) throw new Error(v.reason);

    const prepared = await prepareUploadFile(file, v.type);
    const uploadType = prepared.type || v.type;
    const fns = getFns();
    if(!fns) throw new Error(t('الخدمة غير متاحة','Service unavailable'));
    if(channel !== 'pm' && channel !== 'pa') await ensureAuthFresh();

    const fileBase64 = await fileToBase64(prepared).catch(()=>{
      throw new Error(t('تعذّر قراءة الملف','Could not read file'));
    });

    try{
      const result = await fns.httpsCallable('uploadAttachment')({
        channel,
        fileName: ensureFileName(prepared.name, uploadType),
        contentType: uploadType,
        size: prepared.size,
        fileBase64,
        meta: meta || {},
      });
      return pickPayload(result.data);
    }catch(e){
      throw new Error(callableErrorMessage(e));
    }
  }

  async function uploadPending(inputId, channel, meta){
    const file = getPending(inputId);
    if(!file) return null;
    return uploadFile(file, channel, meta, _pendingType.get(inputId));
  }

  function render(att){
    if(!att || !att.url) return '';
    const type = att.type || '';
    const label = escapeAtt(att.name || (isPdfType(type) ? 'document.pdf' : 'image'));

    if(isPdfType(type) || /\.pdf$/i.test(att.name || '')){
      return `<div class="msg-att-display pdf"><a href="${escapeAtt(att.url)}" target="_blank" rel="noopener" class="msg-att-link">📄 ${label} · ${t('فتح PDF','Open PDF')}</a></div>`;
    }
    if(INLINE_IMAGE_TYPES.has(type) || type === 'image/png'){
      return `<div class="msg-att-display image"><a href="${escapeAtt(att.url)}" target="_blank" rel="noopener"><img src="${escapeAtt(att.url)}" alt="${label}" class="msg-att-image" loading="lazy"></a><span class="msg-att-caption">${label}</span></div>`;
    }
    return `<div class="msg-att-display image"><a href="${escapeAtt(att.url)}" target="_blank" rel="noopener" class="msg-att-link">🖼️ ${label} · ${t('فتح الصورة','Open image')}</a></div>`;
  }

  function hasContent(body, inputId){
    return !!((body || '').trim() || getPending(inputId));
  }

  function notifSuffix(att){ return att ? ' 📎' : ''; }

  window.PortalAttachments = {
    IMAGE_MAX, PDF_MAX, ACCEPT,
    fieldHtml, pickFile, onFileSelected, getPending, clear,
    validateFile, resolveContentType, pickPayload,
    uploadFile, uploadPending, render, hasContent, notifSuffix,
  };
})();
