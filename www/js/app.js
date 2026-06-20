

























































































// ══════════════════════════════════════════════════
//  INIT — تهيئة الصفحة فور التحميل
// ══════════════════════════════════════════════════
window._splashDone = false;
window._pendingParentAutoLogin = null;
const SPLASH_DURATION_MS = 5000;

(function initPage(){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', startSplashScreen);
  } else {
    startSplashScreen();
  }
})();

function finishSplashScreen(){
  if(window._splashDone) return;
  window._splashDone = true;
  const splash = document.getElementById('screen-splash');
  document.documentElement.classList.remove('splash-open');
  if(splash){
    splash.classList.add('splash-exit');
    setTimeout(()=>{
      splash.classList.remove('splash-active', 'splash-exit');
      splash.setAttribute('aria-hidden', 'true');
      enterAppAfterSplash();
      document.dispatchEvent(new Event('splashDone'));
    }, 750);
    return;
  }
  enterAppAfterSplash();
  document.dispatchEvent(new Event('splashDone'));
}

function enterAppAfterSplash(){
  if(window._pendingParentAutoLogin){
    const sp = window._pendingParentAutoLogin;
    try{ Object.assign(APP, JSON.parse(localStorage.getItem('portal_v4')||'{}')); }catch(e){}
    const saved = APP.savedParent || sp;
    window._currentParent = enrichParentSession(
      saved.cls || sp.cls,
      saved.name || sp.name,
      saved.mid || sp.mid || '',
      saved.section || sp.section || ''
    );
    registerParentSession(window._currentParent);
    showScreen('parent');
    loadParentSubjectTabs(window._currentParent.cls, window._currentParent.name, window._currentParent.mid || '');
    return;
  }
  showScreen('login');
}

function startSplashScreen(){
  window._splashDone = false;
  const splash = document.getElementById('screen-splash');
  document.documentElement.classList.add('splash-open');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  if(splash){
    splash.classList.add('splash-active');
    splash.classList.remove('splash-exit');
    splash.setAttribute('aria-hidden', 'false');
  }
  const sub = document.getElementById('splash-sub-en');
  if(sub){
    sub.textContent = typeof t === 'function' ? t('splashSub') : 'Proud of the UAE';
    sub.style.display = currentLang === 'en' ? 'block' : 'none';
  }
  const splashTitleEl = document.querySelector('#screen-splash .splash-title');
  if(splashTitleEl && typeof t === 'function') splashTitleEl.textContent = t('splashTitle');
  const deadline = window.__splashDeadline || (Date.now() + SPLASH_DURATION_MS);
  const left = Math.max(0, deadline - Date.now());
  setTimeout(finishSplashScreen, left);
}

// ══════════════════════════════════════════════════
//  STUDENT DATA
// ══════════════════════════════════════════════════
const STUDENTS = {}; // legacy alias — use getGradeStudents()

function getGradeStudents(cls, section){
  const gradeData = window.ADMIN_STUDENTS?.[cls];
  if(!gradeData) return [];
  if(section){
    const secData = gradeData[section];
    if(!secData) return [];
    const arr = Array.isArray(secData) ? secData : Object.values(secData);
    return arr.map(s=>({...s, section}));
  }
  return Object.entries(gradeData).flatMap(([sec, secData])=>{
    const arr = Array.isArray(secData) ? secData : Object.values(secData || {});
    return arr.map(s=>({...s, section: sec}));
  });
}

function findStudentInGrade(cls, name, mid, section){
  const match = (list, sec)=>{
    const hit = list.find(s=>(name && s.name===name) || (mid && String(s.mid)===String(mid)));
    return hit ? {...hit, section: hit.section || sec || ''} : null;
  };
  if(section){
    const hit = match(getGradeStudents(cls, section), section);
    if(hit) return hit;
  }
  const all = getGradeStudents(cls);
  const hit = match(all, section || '');
  if(hit) return hit;
  const gradeData = window.ADMIN_STUDENTS?.[cls];
  if(!gradeData) return null;
  const secs = section ? [section] : Object.keys(gradeData);
  for(const sec of secs){
    const secData = gradeData[sec];
    if(!secData) continue;
    const arr = Array.isArray(secData) ? secData : Object.values(secData);
    const s = arr.find(x=>(name && x.name===name) || (mid && String(x.mid)===String(mid)));
    if(s) return {...s, section: sec};
  }
  return null;
}

function displayStudentName(input, cls, section, mid){
  const isEn = currentLang === 'en';
  let student = null;
  if(input && typeof input === 'object'){
    student = (input.name || input.nameEn)
      ? (findStudentInGrade(cls || input.cls, input.name, input.mid || mid, section || input.section) || input)
      : null;
  } else {
    student = findStudentInGrade(cls, input, mid, section);
  }
  if(!student){
    const fallback = typeof input === 'object' ? (input.name || '—') : (input || '—');
    return String(fallback);
  }
  return (isEn && student.nameEn) ? student.nameEn : (student.name || '—');
}

function enrichParentSession(cls, name, mid, section){
  const s = findStudentInGrade(cls, name, mid, section);
  return {
    cls,
    name: s?.name || name,
    nameEn: s?.nameEn || '',
    mid: mid || s?.mid || '',
    section: section || s?.section || '',
  };
}

function makeParentSessionKey(cls, section, name){
  const normalize = v => String(v||'').trim().toLowerCase().replace(/\s+/g, ' ');
  return [String(cls||'').trim(), String(section||'').trim(), normalize(name)]
    .join('|')
    .replace(/[.#$/[\]]/g, '_');
}

function parentSessionMatches(reg, cls, section, name){
  if(!reg) return false;
  return String(reg.cls) === String(cls)
    && String(reg.section || '') === String(section || '')
    && String(reg.name || '').trim() === String(name || '').trim();
}

async function enterParentDashboard(cls, name, mid, section){
  APP.savedParent = enrichParentSession(cls, name, mid, section);
  saveState();
  registerParentSession(APP.savedParent);
  window._currentParent = { ...APP.savedParent };
  showScreen('parent');
  loadParentSubjectTabs(cls, name, mid);
}

window.TEACHER_GRADES = window.TEACHER_GRADES || {};
const GRADE_WEEK_COUNT = 11;

function mergeGradeScores(cls, student){
  if(!student || !window.TEACHER_GRADES) return student;
  const sec = student.section || '';
  const bySec = window.TEACHER_GRADES[cls + sec] || window.TEACHER_GRADES[cls] || {};
  const scores = bySec[student.mid] || bySec[student.name];
  return scores ? {...student, ...scores} : student;
}

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
let APP = {
  siteUrl: 'https://emadabuhoujaila.github.io/science-portal/',
  pins:{},      // {cls_name: "1234"}
  messages:[],
  behavior:{},   // {cls|name: {level, academic, conduct}}
  behaviorLog:[], // سجل تاريخي كامل
  parentMessages:[], // [{cls,name,type,body,date,read}]
  parentComplaints:[], // شكاوى مرسلة من ولي الأمر (محفوظة محلياً)
  parentAdminMessages:[], // ردود المسؤول لولي الأمر
  complaintInbox:[], // شكاوى موجّهة من المسؤول
  savedParent: null  // {cls, name} — تذكر ولي الأمر بعد تسجيل الدخول
};

function loadState(){
  try{
    const s=localStorage.getItem('portal_v4');
    if(s) Object.assign(APP,JSON.parse(s));
  }catch(e){}
  syncPinsFromAdminStudents();
  saveState();
}

function syncPinsFromAdminStudents(){
  const source = window.ADMIN_STUDENTS || {};
  Object.entries(source).forEach(([grade, sections])=>{
    Object.entries(sections || {}).forEach(([section, secData])=>{
      const list = Array.isArray(secData) ? secData : Object.values(secData || {});
      list.forEach(s=>{
        if(!s?.name) return;
        const key = grade + '|' + s.name;
        if(s.mid) APP.pins[key] = s.mid;
      });
    });
  });
}
function saveState(){ localStorage.setItem('portal_v4',JSON.stringify(APP)); }
function genPin(){ return String(Math.floor(1000+Math.random()*9000)); }

// ══════════════════════════════════════════════════
//  ROUTING
// ══════════════════════════════════════════════════
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>{
    s.classList.remove('active','uae-enter');
  });
  const el = document.getElementById('screen-'+id);
  if(el){
    el.classList.add('active');
    void el.offsetWidth;
    el.classList.add('uae-enter');
  } else {
    console.error('showScreen: screen-'+id+' not found');
  }
}
function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function showTab(name,el){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if(el) el.classList.add('active');
  if(name==='pins') renderPinsTab();
  if(name==='links') renderLinksTab();
  if(name==='grades') renderGradesTab();
  if(name==='analysis') renderAnalysisTab();
  if(name==='behavior') renderBehaviorTab();
  if(name==='messages'){ renderSavedMessages(); renderParentInbox(); }
  if(name==='complaints'){ renderTeacherComplaints(); markAllTeacherComplaintsRead(); }
}

// ══════════════════════════════════════════════════
//  AUTH — TEACHER
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
//  ADMIN SYSTEM
// ══════════════════════════════════════════════════
let adminStudentsCache = {}; // {grade: {section: [{mid,name,nameEn}]}}

async function adminLogin(){
  const isEn = currentLang==='en';
  const email = (document.getElementById('admin-email-input')?.value||'').trim();
  const pw   = document.getElementById('admin-pw-input')?.value||'';
  const err  = document.getElementById('admin-error-msg');
  if(err) err.style.display='none';

  if(!email||!email.includes('@')){
    if(err){ err.textContent=isEn?'Enter admin email':'أدخل بريد المسؤول'; err.style.display='block'; }
    return;
  }
  if(!pw){
    if(err){ err.textContent=isEn?'Enter password':'أدخل كلمة المرور'; err.style.display='block'; }
    return;
  }
  if(typeof auth === 'undefined' || !auth){
    if(err){ err.textContent=isEn?'Authentication unavailable':'المصادقة غير متاحة'; err.style.display='block'; }
    return;
  }

  try{
    const cred = await auth.signInWithEmailAndPassword(email, pw);
    const adminSnap = await db.ref('admins/'+cred.user.uid).once('value');
    const lookupSnap = await db.ref('teacherLookup/'+cred.user.uid).once('value');
    const isAdmin = adminSnap.val() === true || lookupSnap.val()?.role === 'admin';
    if(!isAdmin){
      await auth.signOut();
      if(err){ err.textContent=isEn?'Not an admin account':'هذا الحساب ليس مسؤولاً'; err.style.display='block'; }
      return;
    }
    IS_ADMIN = true;
    document.getElementById('admin-pw-input').value='';
    _enterAdminDashboard();
  }catch(e){
    if(err){ err.textContent=isEn?'Incorrect email or password':'البريد أو كلمة المرور غير صحيحة'; err.style.display='block'; }
  }
}

async function adminLogout(){
  try{ if(typeof auth!=='undefined' && auth) await auth.signOut(); }catch(e){}
  stopAdminComplaintsListener();
  IS_ADMIN = false;
  adminStudentsCache = {};
  document.getElementById('screen-admin').classList.remove('active');
  document.getElementById('screen-admin').style.display='none';
  showScreen('login');
}

// Load all students from Firebase /students/
async function adminLoadStudents(){
  const prog = document.getElementById('admin-upload-progress');
  if(prog) prog.textContent = currentLang==='en'?'⏳ Loading students...':'⏳ جارٍ تحميل الطلاب...';
  adminStudentsCache = {};
  if(typeof db!=='undefined'){
    try{
      const snap = await db.ref('students').once('value');
      if(snap.exists()) adminStudentsCache = snap.val();
    }catch(e){ console.warn('adminLoadStudents error:',e); }
  }
  if(prog) prog.textContent='';
  refreshAdminSecFilter();
  // Update per-grade status badges
  ['5','6','7','8'].forEach(g=>{
    const statEl = document.getElementById('admin-grade'+g+'-status');
    if(!statEl) return;
    const gradeSecs = adminStudentsCache[g]||{};
    const count = Object.values(gradeSecs).reduce((s,sec)=>s+Object.keys(sec).length,0);
    statEl.innerHTML = count
      ? `<span style="color:var(--green-soft)">✅ ${count} ${currentLang==='en'?'students':'طالب'}</span>`
      : `<span style="color:var(--grey-3)">${currentLang==='en'?'Not uploaded yet':'لم يُرفع بعد'}</span>`;
  });
  adminRenderStudents();
  adminRefreshTransferStudentList();
  bindAdminStudentTableActions();
}

// Render students table
function adminRenderStudents(){
  const tbody     = document.getElementById('admin-students-tbody');
  const gradeF    = document.getElementById('admin-grade-filter')?.value||'';
  const secF      = document.getElementById('admin-sec-filter')?.value||'';
  const isEn      = currentLang==='en';
  const emptyTxt  = document.getElementById('admin-empty-txt');

  if(!tbody) return;

  // Collect students
  let rows = [];
  const grades = gradeF ? [gradeF] : Object.keys(adminStudentsCache).sort();
  grades.forEach(g=>{
    if(!adminStudentsCache[g]) return;
    const sections = secF ? [secF] : Object.keys(adminStudentsCache[g]).sort();
    sections.forEach(sec=>{
      const arr = adminStudentsCache[g][sec];
      if(!arr) return;
      const list = Array.isArray(arr) ? arr : Object.values(arr);
      list.forEach(s=>rows.push({...s, grade:g, section:sec}));
    });
  });

  const countEl = document.getElementById('admin-student-count');
  if(countEl) countEl.textContent = `(${rows.length} ${isEn?'students':'طالب'})`;

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="ico">👥</div><p>${isEn?'No students yet — upload Excel file':'لا يوجد طلاب بعد — ارفع ملف Excel'}</p></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((s,i)=>{
    const mid = s.mid || '';
    const secOptions = SECTIONS_LIST.filter(sec=>sec !== String(s.section))
      .map(sec=>`<option value="${sec}">${formatSectionLabel(sec, isEn)}</option>`).join('');
    return `<tr>
    <td>${i+1}</td>
    <td><span class="badge badge-teal">${isEn?'Grade ':'ص'}${s.grade}</span></td>
    <td><span class="badge badge-grey">${s.section}</span></td>
    <td style="font-family:monospace;font-size:12px">${escapeHtml(mid||'—')}</td>
    <td style="text-align:right;font-weight:500">${escapeHtml(s.name||'—')}</td>
    <td style="text-align:left;color:var(--grey-3)">${escapeHtml(s.nameEn||'—')}</td>
    <td style="white-space:nowrap">
      <select class="admin-row-xfer-sec" style="padding:4px 6px;border:1px solid var(--grey-5);border-radius:6px;font-size:11px;margin-left:4px;max-width:72px">
        <option value="">${isEn?'Sec':'ش'}</option>${secOptions}
      </select>
      <button type="button" class="action-btn admin-row-transfer-btn" style="font-size:11px;padding:3px 8px;margin-left:4px"
        data-grade="${escapeHtml(s.grade)}" data-section="${escapeHtml(s.section)}" data-mid="${escapeHtml(mid)}" data-name="${escapeHtml(s.name||'')}">↔️</button>
      <button type="button" class="action-btn danger admin-row-delete-btn" style="font-size:11px;padding:3px 8px;margin-left:4px"
        data-grade="${escapeHtml(s.grade)}" data-section="${escapeHtml(s.section)}" data-mid="${escapeHtml(mid)}" data-name="${escapeHtml(s.name||'')}">🗑️</button>
    </td>
  </tr>`;
  }).join('');
  bindAdminStudentTableActions();
}

function adminGetStudentsInSection(grade, section){
  const secData = adminStudentsCache?.[grade]?.[section];
  if(!secData) return [];
  if(Array.isArray(secData)){
    return secData.map((s,i)=>({ ...s, mid: s.mid || String(i), _fbKey: s.mid || String(i) }));
  }
  return Object.entries(secData).map(([key, s])=>({
    ...(s||{}),
    mid: (s&&s.mid) || key,
    _fbKey: key,
  })).filter(s=>s.name || s.mid);
}

function adminFindStudentInCache(grade, section, mid){
  const list = adminGetStudentsInSection(grade, section);
  return list.find(s=>String(s.mid)===String(mid) || String(s._fbKey)===String(mid)) || null;
}

function adminRefreshTransferStudentList(){
  const grade = document.getElementById('admin-xfer-grade')?.value || '5';
  const section = document.getElementById('admin-xfer-from-sec')?.value || '1';
  const sel = document.getElementById('admin-xfer-student');
  if(!sel) return;
  const isEn = currentLang==='en';
  const students = adminGetStudentsInSection(grade, section);
  sel.innerHTML = `<option value="">${isEn?'— Select student —':'— اختر الطالب —'}</option>`
    + students.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ar')).map(s=>{
      const mid = s.mid || s._fbKey;
      return `<option value="${escapeHtml(mid)}">${escapeHtml(s.name||mid)} (${escapeHtml(mid)})</option>`;
    }).join('');
}

async function adminSyncParentRecordsAfterStudentMove(grade, oldSection, newSection, student){
  if(typeof db==='undefined' || !student?.mid || !student?.name) return;
  const mid = String(student.mid);
  const updates = {};
  const oldKey = makeParentSessionKey(grade, oldSection, student.name);
  const newKey = makeParentSessionKey(grade, newSection, student.name);
  updates['parentQuickLogin/'+oldKey] = null;
  try{
    const snap = await db.ref('registeredParents/'+mid).once('value');
    if(snap.exists()){
      const p = snap.val() || {};
      const now = new Date().toISOString();
      const record = {
        cls: String(grade),
        section: String(newSection),
        name: student.name,
        mid,
        registeredAt: p.registeredAt || now,
        lastLogin: p.lastLogin || now,
      };
      updates['registeredParents/'+mid] = record;
      updates['parentQuickLogin/'+newKey] = record;
    }
    if(Object.keys(updates).length) await db.ref().update(updates);
  }catch(e){ console.warn('adminSyncParentRecordsAfterStudentMove', e); }
}

async function adminSyncParentRecordsAfterStudentDelete(grade, section, student){
  if(typeof db==='undefined' || !student?.name) return;
  const mid = student.mid ? String(student.mid) : '';
  const updates = {};
  const sessionKey = makeParentSessionKey(grade, section, student.name);
  updates['parentQuickLogin/'+sessionKey] = null;
  if(mid) updates['registeredParents/'+mid] = null;
  if(Object.keys(updates).length){
    try{ await db.ref().update(updates); }catch(e){ console.warn('adminSyncParentRecordsAfterStudentDelete', e); }
  }
}

async function adminAddStudent(){
  const isEn = currentLang==='en';
  const grade = document.getElementById('admin-add-grade')?.value;
  const section = normalizeSectionCell(document.getElementById('admin-add-sec')?.value);
  const mid = (document.getElementById('admin-add-mid')?.value||'').trim().replace(/\s/g,'');
  const name = (document.getElementById('admin-add-name')?.value||'').trim();
  const nameEn = (document.getElementById('admin-add-name-en')?.value||'').trim();
  if(!grade || !section) return showToast(isEn?'Select grade and section':'اختر الصف والشعبة');
  if(!mid) return showToast(isEn?'Enter ministry ID':'أدخل الرقم الوزاري');
  if(!name) return showToast(isEn?'Enter Arabic name':'أدخل الاسم بالعربية');
  if(typeof db==='undefined') return showToast(isEn?'❌ Not connected':'❌ غير متصل');
  if(adminFindStudentInCache(grade, section, mid)){
    return showToast(isEn?'Student already exists in this section':'الطالب موجود في هذه الشعبة');
  }
  const record = { mid, name, nameEn: nameEn || '' };
  try{
    await db.ref(`students/${grade}/${section}/${mid}`).set(record);
    if(!adminStudentsCache[grade]) adminStudentsCache[grade] = {};
    if(!adminStudentsCache[grade][section]) adminStudentsCache[grade][section] = {};
    adminStudentsCache[grade][section][mid] = record;
    document.getElementById('admin-add-mid').value = '';
    document.getElementById('admin-add-name').value = '';
    document.getElementById('admin-add-name-en').value = '';
    refreshAdminSecFilter();
    adminRenderStudents();
    adminRefreshTransferStudentList();
    showToast(isEn?'✅ Student added':'✅ تمت إضافة الطالب');
  }catch(e){
    console.error('adminAddStudent', e);
    showToast(isEn?'❌ Failed to add student':'❌ فشل إضافة الطالب');
  }
}

async function adminTransferStudent(grade, fromSec, mid, toSec){
  const isEn = currentLang==='en';
  const fromSection = normalizeSectionCell(fromSec);
  const toSection = normalizeSectionCell(toSec);
  if(!grade || !fromSection || !toSection || !mid) return;
  if(fromSection === toSection) return showToast(isEn?'Choose a different section':'اختر شعبة مختلفة');
  if(typeof db==='undefined') return showToast(isEn?'❌ Not connected':'❌ غير متصل');

  const student = adminFindStudentInCache(grade, fromSection, mid);
  if(!student) return showToast(isEn?'Student not found':'الطالب غير موجود');
  const actualMid = String(student.mid || mid);
  if(adminFindStudentInCache(grade, toSection, actualMid)){
    return showToast(isEn?'Student already in target section':'الطالب موجود في الشعبة الهدف');
  }

  const label = student.name || actualMid;
  if(!confirm(isEn
    ? `Move "${label}" from section ${fromSection} to section ${toSection}?`
    : `نقل "${label}" من الشعبة ${fromSection} إلى الشعبة ${toSection}؟`)) return;

  const record = { mid: actualMid, name: student.name, nameEn: student.nameEn || '' };
  const updates = {};
  updates[`students/${grade}/${toSection}/${actualMid}`] = record;
  updates[`students/${grade}/${fromSection}/${actualMid}`] = null;
  if(student._fbKey && student._fbKey !== actualMid){
    updates[`students/${grade}/${fromSection}/${student._fbKey}`] = null;
  }

  try{
    await db.ref().update(updates);
    if(!adminStudentsCache[grade]) adminStudentsCache[grade] = {};
    if(!adminStudentsCache[grade][toSection]) adminStudentsCache[grade][toSection] = {};
    adminStudentsCache[grade][toSection][actualMid] = record;
    if(adminStudentsCache[grade][fromSection]){
      delete adminStudentsCache[grade][fromSection][actualMid];
      if(student._fbKey) delete adminStudentsCache[grade][fromSection][student._fbKey];
      if(!Object.keys(adminStudentsCache[grade][fromSection]).length) delete adminStudentsCache[grade][fromSection];
    }
    await adminSyncParentRecordsAfterStudentMove(grade, fromSection, toSection, record);
    refreshAdminSecFilter();
    adminRenderStudents();
    adminRefreshTransferStudentList();
    showToast(isEn?'✅ Student moved':'✅ تم نقل الطالب');
  }catch(e){
    console.error('adminTransferStudent', e);
    showToast(isEn?'❌ Transfer failed':'❌ فشل النقل');
  }
}

function adminTransferStudentFromForm(){
  const grade = document.getElementById('admin-xfer-grade')?.value;
  const fromSec = document.getElementById('admin-xfer-from-sec')?.value;
  const mid = document.getElementById('admin-xfer-student')?.value;
  const toSec = document.getElementById('admin-xfer-to-sec')?.value;
  adminTransferStudent(grade, fromSec, mid, toSec).catch(e=>console.error(e));
}

async function adminDeleteStudent(grade, section, mid, studentName){
  const isEn = currentLang==='en';
  const sec = normalizeSectionCell(section);
  const label = studentName || mid || '';
  if(!confirm(isEn?`Delete student "${label}"?`:`حذف الطالب "${label}"؟`)) return;
  if(typeof db==='undefined') return showToast(isEn?'❌ Not connected':'❌ غير متصل');

  const student = adminFindStudentInCache(grade, sec, mid) || { mid, name: studentName || '' };
  const actualMid = String(student.mid || mid || '');
  const updates = {};
  updates[`students/${grade}/${sec}/${actualMid}`] = null;
  if(student._fbKey && student._fbKey !== actualMid){
    updates[`students/${grade}/${sec}/${student._fbKey}`] = null;
  }

  try{
    await db.ref().update(updates);
    if(adminStudentsCache[grade]?.[sec]){
      delete adminStudentsCache[grade][sec][actualMid];
      if(student._fbKey) delete adminStudentsCache[grade][sec][student._fbKey];
      if(!Object.keys(adminStudentsCache[grade][sec]).length) delete adminStudentsCache[grade][sec];
    }
    await adminSyncParentRecordsAfterStudentDelete(grade, sec, student);
    refreshAdminSecFilter();
    adminRenderStudents();
    adminRefreshTransferStudentList();
    showToast(isEn?'✅ Student deleted':'✅ تم حذف الطالب');
  }catch(e){
    console.error('adminDeleteStudent', e);
    showToast(isEn?'❌ Delete failed':'❌ فشل الحذف');
  }
}

function bindAdminStudentTableActions(){
  const tbody = document.getElementById('admin-students-tbody');
  if(!tbody || tbody.dataset.actionsBound === '1') return;
  tbody.dataset.actionsBound = '1';
  tbody.addEventListener('click', e=>{
    const delBtn = e.target.closest('.admin-row-delete-btn');
    if(delBtn){
      adminDeleteStudent(
        delBtn.dataset.grade || '',
        delBtn.dataset.section || '',
        delBtn.dataset.mid || '',
        delBtn.dataset.name || ''
      ).catch(err=>console.error(err));
      return;
    }
    const xferBtn = e.target.closest('.admin-row-transfer-btn');
    if(xferBtn){
      const row = xferBtn.closest('tr');
      const toSec = row?.querySelector('.admin-row-xfer-sec')?.value || '';
      if(!toSec){
        showToast(currentLang==='en'?'Select target section':'اختر الشعبة الهدف');
        return;
      }
      adminTransferStudent(
        xferBtn.dataset.grade || '',
        xferBtn.dataset.section || '',
        xferBtn.dataset.mid || '',
        toSec
      ).catch(err=>console.error(err));
    }
  });
}

// Import students from Excel → save to /students/{grade}/{section}/
// Import students for a specific grade
function adminImportGrade(input, targetGrade){
  const file = input.files[0];
  if(!file) return;
  if(!window.XLSX){ showToast('⚠️ مكتبة Excel لم تُحمَّل'); return; }
  const isEn = currentLang==='en';
  const statEl = document.getElementById('admin-grade'+targetGrade+'-status');
  if(statEl) statEl.textContent = isEn?'⏳ Reading...':'⏳ جارٍ القراءة...';

  const reader = new FileReader();
  reader.onload = async function(e){
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const { byGradeSec, total } = parseStudentWorkbook(wb, String(targetGrade));

      if(!total){
        if(statEl) statEl.textContent=isEn?`⚠️ No Grade ${targetGrade} students found`:`⚠️ لم يتم العثور على طلاب الصف ${targetGrade}`;
        input.value=''; return;
      }

      if(typeof db!=='undefined'){
        await saveStudentRosterToFirebase(byGradeSec);
        const countAll = Object.values(adminStudentsCache[targetGrade]||{})
          .reduce((s,sec)=>s+Object.keys(sec).length,0);
        if(statEl) statEl.innerHTML=`<span style="color:var(--green-soft)">✅ ${countAll} ${isEn?'students':'طالب'}</span>`;
        refreshAdminSecFilter();
        adminRenderStudents();
        showToast(`✅ ${isEn?`Grade ${targetGrade}: ${total} students uploaded`:`الصف ${targetGrade}: تم رفع ${total} طالب`}`);
      }
      input.value='';
    }catch(err){
      console.error(err);
      if(statEl) statEl.textContent='❌ '+err.message;
      input.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Clear a specific grade
function adminClearGrade(){
  const isEn = currentLang==='en';
  const grade = prompt(isEn?'Enter grade to clear (5, 6, 7, or 8):':'أدخل الصف للمسح (5 أو 6 أو 7 أو 8):');
  if(!grade || !['5','6','7','8'].includes(grade.trim())) return;
  if(!confirm(isEn?`Delete all students of Grade ${grade}?`:`هل تريد حذف كل طلاب الصف ${grade}؟`)) return;
  if(typeof db!=='undefined'){
    db.ref(`students/${grade}`).remove().then(()=>{
      if(adminStudentsCache) delete adminStudentsCache[grade];
      const statEl=document.getElementById('admin-grade'+grade+'-status');
      if(statEl) statEl.textContent='—';
      adminRenderStudents();
      showToast(isEn?`Grade ${grade} cleared`:`تم مسح الصف ${grade}`);
    });
  }
}

function adminImportStudents(input){
  const file = input.files[0];
  if(!file) return;
  if(!window.XLSX){ showToast('⚠️ '+(currentLang==="en"?"Excel library not loaded":"مكتبة Excel لم تُحمَّل")); return; }
  const isEn = currentLang==='en';
  const prog = document.getElementById('admin-upload-progress');
  if(prog) prog.textContent = isEn?'⏳ Reading all sheets...':'⏳ جارٍ قراءة كل الأوراق...';

  const reader = new FileReader();
  reader.onload = async function(e){
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const sheetCount = (wb.SheetNames||[]).length;
      const { byGradeSec, total } = parseStudentWorkbook(wb, null);

      if(!total){
        if(prog) prog.textContent=isEn?'⚠️ No students found in file':'⚠️ لم يتم العثور على طلاب في الملف';
        input.value=''; return;
      }

      if(prog) prog.textContent=isEn
        ? `⏳ Saving ${total} students (${sheetCount} sheets)...`
        : `⏳ حفظ ${total} طالب (${sheetCount} ورقة)...`;

      if(typeof db!=='undefined'){
        await saveStudentRosterToFirebase(byGradeSec);
        adminStudentsCache = {};
        await adminLoadStudents();
        refreshAdminSecFilter();
        if(prog) prog.textContent=isEn
          ? `✅ ${total} students uploaded from ${sheetCount} sheets!`
          : `✅ تم رفع ${total} طالب من ${sheetCount} ورقة!`;
        setTimeout(()=>{ if(prog) prog.textContent=''; }, 4000);
      } else {
        if(prog) prog.textContent=isEn?'⚠️ Firebase not connected':'⚠️ Firebase غير متصل';
      }
      input.value='';
    }catch(err){
      console.error(err);
      if(prog) prog.textContent=(isEn?'❌ Error: ':'❌ خطأ: ')+err.message;
      input.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Clear all students from Firebase
async function adminClearAllStudents(){
  const isEn = currentLang==='en';
  const msg  = isEn
    ? 'Delete ALL students from the database? This cannot be undone.'
    : 'هل تريد حذف جميع الطلاب من قاعدة البيانات؟ لا يمكن التراجع.';
  if(!confirm(msg)) return;
  if(typeof db!=='undefined'){
    await db.ref('students').remove();
    adminStudentsCache={};
    adminRenderStudents();
    showToast(isEn?'✅ All students deleted':'✅ تم حذف جميع الطلاب');
  }
}

// Update switchTab to handle admin tab
function switchTab(tab,el){
  document.querySelectorAll('.login-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('login-teacher').style.display=tab==='teacher'?'':'none';
  document.getElementById('login-parent').style.display=tab==='parent'?'':'none';
  const adminDiv = document.getElementById('login-admin');
  if(adminDiv) adminDiv.style.display=tab==='admin'?'':'none';
  // Load available grades from Firebase when parent tab opens
  if(tab==='parent' && typeof loadParentGrades==='function') loadParentGrades();
}
// ══════════════════════════════════════════════════
//  AUTH — TEACHER
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
//  SUBJECTS MAP
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
//  ADMIN CONFIG
// ══════════════════════════════════════════════════
const SUBJECTS = {
  math:    {ar:'الرياضيات',       en:'Mathematics'},
  science: {ar:'العلوم',          en:'Science'},
  arabic:  {ar:'اللغة العربية',   en:'Arabic Language'},
  english: {ar:'اللغة الإنجليزية',en:'English Language'},
  social:  {ar:'الدراسات الاجتماعية',en:'Social Studies'},
  islamic: {ar:'التربية الإسلامية',en:'Islamic Education'},
};

// Current logged-in teacher profile
let CURRENT_TEACHER = null;
let TEACHER_SETTINGS = { lastGradeSync: '', autoRefresh: true };
window.TEACHER_STUDENTS = {}; // students uploaded by this teacher (legacy)
window.ADMIN_STUDENTS  = {}; // students from admin /students/ path

// ── Email key helper ──
function emailKey(email){ return email.trim().toLowerCase().replace(/[.@]/g,'_'); }

async function checkTeacherEmailAllowed(email){
  const normalized = String(email||'').trim().toLowerCase();
  if(!normalized || !normalized.includes('@')) return false;
  const fn = getCloudFunctions();
  if(fn){
    try{
      const res = await fn.httpsCallable('checkTeacherAllowlist')({ email: normalized });
      return res.data?.allowed === true;
    }catch(e){
      console.warn('checkTeacherAllowlist', e);
    }
  }
  if(typeof db !== 'undefined'){
    const snap = await db.ref('teacherAllowlist/' + emailKey(normalized)).once('value');
    return snap.exists();
  }
  return false;
}

function buildPublicTeacherProfile(teacher){
  if(!teacher?.subject || teacher.role === 'admin') return null;
  return {
    name: teacher.name || '',
    subject: teacher.subject || '',
    grades: teacher.grades || [],
    sections: teacher.sections || [],
    gradeMap: teacher.gradeMap || null,
  };
}

function syncPublicTeacher(key, teacher){
  if(!key || !teacher || typeof db === 'undefined') return Promise.resolve();
  const profile = buildPublicTeacherProfile(teacher);
  if(!profile) return Promise.resolve();
  return db.ref('publicTeachers/'+key).set(profile);
}

// ══════════════════════════════════════════════════
//  SHOW/HIDE panels
// ══════════════════════════════════════════════════
function showTeacherReg(){
  document.getElementById('t-login-panel').style.display='none';
  document.getElementById('t-reg-panel').style.display='block';
  buildRegGrids();
}
function showTeacherLogin(){
  document.getElementById('t-reg-panel').style.display='none';
  document.getElementById('t-login-panel').style.display='block';
  const e=document.getElementById('pw-error-msg');
  if(e) e.style.display='none';
}

// ── Build grade/section matrix ──
const GRADES_LIST   = ['5','6','7','8'];
const SECTIONS_LIST = ['1','2','3','4','5','6'];
const SECTIONS_AR   = ['1','2','3','4','5','6']; // legacy alias — numeric sections both langs

function formatSectionLabel(sec, isEn){
  const n = normalizeSectionCell(sec);
  if(!n) return isEn ? 'Section' : 'شعبة';
  return isEn ? ('Section '+n) : ('شعبة '+n);
}

function getGradeSectionsFromCache(grade){
  const secs = adminStudentsCache?.[grade] ? Object.keys(adminStudentsCache[grade]) : [];
  return secs.sort((a,b)=>(Number(a)||0)-(Number(b)||0) || String(a).localeCompare(String(b)));
}

function refreshAdminSecFilter(){
  const sel = document.getElementById('admin-sec-filter');
  if(!sel) return;
  const isEn = currentLang==='en';
  const prev = sel.value;
  const secs = new Set(SECTIONS_LIST);
  Object.values(adminStudentsCache||{}).forEach(gradeData=>{
    Object.keys(gradeData||{}).forEach(s=>secs.add(normalizeSectionCell(s)));
  });
  const list = [...secs].filter(Boolean).sort((a,b)=>(Number(a)||0)-(Number(b)||0));
  sel.innerHTML = `<option value="">${isEn?'All Sections':'كل الشعب'}</option>`
    + list.map(s=>`<option value="${s}">${formatSectionLabel(s, isEn)}</option>`).join('');
  if(prev && list.includes(prev)) sel.value = prev;
}

function findStudentRosterHeaderRow(rows){
  for(let i=0; i<Math.min(rows.length, 20); i++){
    const h = (rows[i]||[]).map(c=>String(c||'').trim());
    if(h.some(x=>x.includes('الصف')) && h.some(x=>x.includes('الشعبة')) &&
       h.some(x=>x.includes('رقم') || x.includes('طالب') || x.toLowerCase().includes('mid'))){
      return i;
    }
  }
  for(let i=0; i<Math.min(rows.length, 10); i++){
    const h = (rows[i]||[]).map(c=>String(c||'').trim());
    if(h.some(x=>x.includes('الصف')) && h.some(x=>x.includes('الشعبة'))) return i;
  }
  return 0;
}

function buildStudentRosterColumnMap(headerRow){
  const h = (headerRow||[]).map(c=>String(c||'').trim());
  const fi = (...kw)=> h.findIndex(x=> kw.some(k=> x === k || x.includes(k)));
  const serialIdx = h.findIndex(x=> x === 'م' || x.toLowerCase() === 'm');
  return {
    serial: serialIdx >= 0 ? serialIdx : 0,
    grade: fi('الصف','grade') >= 0 ? fi('الصف','grade') : 1,
    section: fi('الشعبة','section') >= 0 ? fi('الشعبة','section') : 2,
    mid: fi('رقم','طالب','وزاري','mid','ID') >= 0 ? fi('رقم','طالب','وزاري','mid','ID') : 3,
    nameAr: fi('عرب','بالعرب') >= 0 ? fi('عرب','بالعرب') : 4,
    nameEn: fi('إنج','انجل','English','أنكل') >= 0 ? fi('إنج','انجل','English','أنكل') : 5,
  };
}

function parseSheetNameGradeSection(name){
  const m = String(name||'').trim().match(/^([5-8])[-_]([1-9]\d*)$/);
  if(m) return { grade: m[1], section: m[2] };
  return null;
}

function parseStudentRosterFromSheet(rows, sheetName){
  if(!rows?.length) return [];
  const headerRowIdx = findStudentRosterHeaderRow(rows);
  const map = buildStudentRosterColumnMap(rows[headerRowIdx]);
  const sheetHint = parseSheetNameGradeSection(sheetName);
  const out = [];
  for(let i=headerRowIdx+1; i<rows.length; i++){
    const row = rows[i]||[];
    const nameAr = String(row[map.nameAr]??'').trim();
    if(!nameAr || nameAr === 'اسم الطالب بالعربية') continue;
    let grade = normalizeGradeCell(row[map.grade]);
    let section = normalizeSectionCell(row[map.section]);
    if(!grade && sheetHint) grade = sheetHint.grade;
    if(!section && sheetHint) section = sheetHint.section;
    if(!grade || !section) continue;
    const mid = String(row[map.mid]??'').trim().replace(/\s/g,'');
    const nameEn = String(row[map.nameEn]??'').trim();
    out.push({ grade, section, mid, name: nameAr, nameEn });
  }
  return out;
}

function parseStudentWorkbook(wb, gradeFilter){
  const byGradeSec = {};
  let total = 0;
  (wb.SheetNames||[]).forEach(sheetName=>{
    const ws = wb.Sheets[sheetName];
    if(!ws) return;
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
    parseStudentRosterFromSheet(rows, sheetName).forEach(s=>{
      if(gradeFilter && s.grade !== String(gradeFilter)) return;
      if(!byGradeSec[s.grade]) byGradeSec[s.grade] = {};
      if(!byGradeSec[s.grade][s.section]) byGradeSec[s.grade][s.section] = {};
      const key = s.mid || ('s'+total);
      byGradeSec[s.grade][s.section][key] = { mid: s.mid, name: s.name, nameEn: s.nameEn };
      total++;
    });
  });
  return { byGradeSec, total };
}

async function saveStudentRosterToFirebase(byGradeSec){
  const updates = {};
  Object.entries(byGradeSec).forEach(([g, secs])=>{
    Object.entries(secs).forEach(([sec, students])=>{
      updates[`students/${g}/${sec}`] = students;
    });
  });
  if(!Object.keys(updates).length) return;
  await db.ref().update(updates);
  Object.entries(byGradeSec).forEach(([g, secs])=>{
    if(!adminStudentsCache) adminStudentsCache = {};
    adminStudentsCache[g] = { ...(adminStudentsCache[g]||{}), ...secs };
  });
}

function buildRegGrids(){
  const isEn = currentLang==='en';
  const wrap = document.getElementById('reg-grade-sections');
  if(!wrap) return;

  wrap.innerHTML = GRADES_LIST.map(g=>`
    <div style="border:1.5px solid var(--grey-5);border-radius:10px;padding:12px 14px;margin-bottom:10px">
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-weight:600;color:var(--teal-dark)">
        <input type="checkbox" name="reg-grade" value="${g}"
          style="accent-color:var(--teal-mid);width:16px;height:16px"
          onchange="toggleGradeSections('${g}',this.checked)">
        ${isEn?'Grade '+g:'الصف '+g}
      </label>
      <div id="reg-sec-${g}" style="display:none;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding-right:24px">
        ${SECTIONS_LIST.map((s,i)=>`
          <label style="display:flex;align-items:center;gap:5px;background:var(--teal-pale);padding:6px 8px;border-radius:7px;cursor:pointer;font-size:12px">
            <input type="checkbox" name="reg-sec-${g}" value="${s}"
              style="accent-color:var(--teal-mid)">
            ${formatSectionLabel(s, isEn)}
          </label>`).join('')}
      </div>
    </div>`).join('');
  
  // Hide all section grids initially
  GRADES_LIST.forEach(g=>{
    const d=document.getElementById('reg-sec-'+g);
    if(d) d.style.display='none';
  });
}

function toggleGradeSections(grade, checked){
  const secDiv = document.getElementById('reg-sec-'+grade);
  if(!secDiv) return;
  secDiv.style.display = checked ? 'grid' : 'none';
  // Uncheck all sections if grade unchecked
  if(!checked){
    secDiv.querySelectorAll('input[type="checkbox"]').forEach(c=>c.checked=false);
  }
}

// ══════════════════════════════════════════════════
//  REGISTER
// ══════════════════════════════════════════════════
function submitTeacherReg(){
  submitTeacherRegAsync().catch(e=>console.error('submitTeacherReg', e));
}

async function submitTeacherRegAsync(){
  const isEn = currentLang==='en';
  const name    = (document.getElementById('reg-name')?.value||'').trim();
  const email   = (document.getElementById('reg-email')?.value||'').trim();
  const subject = document.getElementById('reg-subject')?.value||'';
  const pw      = document.getElementById('reg-pw')?.value||'';
  const pw2     = document.getElementById('reg-pw2')?.value||'';

  // Build gradeMap from new per-grade checkboxes
  const gradeMap = {};
  const checkedGrades = [...document.querySelectorAll('input[name="reg-grade"]:checked')].map(c=>c.value);
  checkedGrades.forEach(g=>{
    const secs = [...document.querySelectorAll(`input[name="reg-sec-${g}"]:checked`)].map(c=>c.value);
    gradeMap[g] = secs;
  });
  const allSections = [...new Set(Object.values(gradeMap).flat())];

  const showRegErr = msg=>{ const el=document.getElementById('reg-error'); if(el){el.textContent=msg;el.style.display='block';} };
  document.getElementById('reg-error').style.display='none';
  document.getElementById('reg-success').style.display='none';

  if(!name)                         return showRegErr(isEn?'Enter your full name':'أدخل اسمك الكامل');
  if(!email||!email.includes('@'))  return showRegErr(isEn?'Enter a valid email':'أدخل بريداً إلكترونياً صحيحاً');
  if(!subject)                      return showRegErr(isEn?'Select a subject':'اختر المادة الدراسية');
  if(pw.length<8)                   return showRegErr(isEn?'Password must be 8+ characters':'كلمة المرور 8 أحرف على الأقل');
  if(pw!==pw2)                      return showRegErr(isEn?'Passwords do not match':'كلمة المرور غير متطابقة');
  if(!checkedGrades.length)         return showRegErr(isEn?'Select at least one grade':'اختر صفاً واحداً على الأقل');

  // Check each selected grade has at least one section
  const gradeWithNoSec = checkedGrades.find(g=>!gradeMap[g]||!gradeMap[g].length);
  if(gradeWithNoSec) return showRegErr(isEn?`Select at least one section for Grade ${gradeWithNoSec}`:`اختر شعبة واحدة على الأقل للصف ${gradeWithNoSec}`);

  const btn=document.getElementById('reg-submit-btn');
  btn.disabled=true;
  btn.textContent=isEn?'⏳ Verifying...':'⏳ جارٍ التحقق...';

  const key = emailKey(email);
  const teacherData={
    name, email, subject,
    grades: checkedGrades,
    sections: allSections,
    gradeMap,
    _key: key,
    createdAt: new Date().toISOString()
  };

  const onSuccess=()=>{
    const suc=document.getElementById('reg-success');
    suc.textContent=isEn?'✅ Account created! You can now login.':'✅ تم إنشاء الحساب! يمكنك الآن الدخول.';
    suc.style.display='block';
    btn.disabled=false;
    btn.textContent=isEn?'✅ Create Account':'✅ إنشاء الحساب';
    document.querySelectorAll('#t-reg-panel input[type="text"],#t-reg-panel input[type="email"],#t-reg-panel input[type="password"]').forEach(el=>el.value='');
    document.querySelectorAll('#t-reg-panel input[type="checkbox"]').forEach(c=>c.checked=false);
    document.querySelectorAll('[id^="reg-sec-"]').forEach(d=>d.style.display='none');
    setTimeout(()=>{suc.style.display='none'; showTeacherLogin();},2500);
  };
  const notAllowedMsg = isEn
    ? 'This email is not on the approved teachers list. Ask the school admin to add your email first.'
    : 'هذا البريد غير موجود في قائمة المعلّمين المعتمدين. اطلب من مسؤول المدرسة إضافة بريدك أولاً.';
  const onError=e=>{
    const code = e?.code || '';
    let msg = e?.message || e || '';
    if(code === 'PERMISSION_DENIED' || /permission/i.test(String(msg))){
      msg = notAllowedMsg;
    }
    showRegErr((isEn?'Error: ':'خطأ: ')+msg);
    btn.disabled=false;
    btn.textContent=isEn?'✅ Create Account':'✅ إنشاء الحساب';
  };

  try{
    if(typeof auth !== 'undefined' && auth){
      const allowed = await checkTeacherEmailAllowed(email);
      if(!allowed){
        onError({ message: notAllowedMsg });
        return;
      }
      btn.textContent=isEn?'⏳ Creating...':'⏳ جارٍ الإنشاء...';
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      teacherData.uid = cred.user.uid;
      const updates = {};
      updates['teachers/' + key] = teacherData;
      updates['teacherLookup/' + cred.user.uid] = { key, role: 'teacher' };
      await db.ref().update(updates);
      await syncPublicTeacher(key, teacherData);
      onSuccess();
    } else if(typeof db!=='undefined'){
      onError({ message: notAllowedMsg });
    } else {
      try{
        const t=JSON.parse(localStorage.getItem('portal_teachers')||'{}');
        t[key]=teacherData; localStorage.setItem('portal_teachers',JSON.stringify(t));
        onSuccess();
      }catch(e){ onError(e); }
    }
  }catch(e){
    try{ if(typeof auth !== 'undefined' && auth?.currentUser) await auth.currentUser.delete(); }catch(_){}
    onError(e);
  }
}


// ══════════════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════════════
async function teacherLogin(){
  const isEn  = currentLang==='en';
  const email = (document.getElementById('teacher-email-input')?.value||'').trim();
  const pw    = document.getElementById('teacher-pw-input')?.value||'';
  const errEl = document.getElementById('pw-error-msg');
  if(errEl) errEl.style.display='none';
  const showErr=msg=>{ if(errEl){errEl.textContent=msg;errEl.style.display='block';} };

  if(!email||!pw) return showErr(isEn?'Enter email and password':'أدخل البريد وكلمة المرور');
  if(!email.includes('@')) return showErr(isEn?'Enter a valid email':'أدخل بريداً إلكترونياً صحيحاً');
  if(typeof auth === 'undefined' || !auth) return showErr(isEn?'Authentication unavailable':'المصادقة غير متاحة');

  try{
    const cred = await auth.signInWithEmailAndPassword(email, pw);
    const lookupSnap = await db.ref('teacherLookup/'+cred.user.uid).once('value');
    const lookup = lookupSnap.val();
    const key = lookup?.key || emailKey(email);
    const teacherSnap = await db.ref('teachers/'+key).once('value');
    const teacher = teacherSnap.val();
    if(!teacher){
      await auth.signOut();
      return showErr(isEn?'Teacher profile not found':'لم يتم العثور على ملف المعلم');
    }
    teacher._key = teacher._key || key;
    teacher.uid = cred.user.uid;
    syncPublicTeacher(key, teacher).catch(()=>{});
    if(lookup?.role === 'admin' || teacher.role === 'admin'){
      IS_ADMIN = true;
      return _enterAdminDashboard();
    }
    _enterDashboard(teacher);
  }catch(e){
    console.error('teacherLogin', e);
    showErr(isEn?'Incorrect email or password':'البريد أو كلمة المرور غير صحيحة');
  }
}

function _enterDashboard(teacher){
  // Ensure teacher always has a _key
  if(!teacher._key){
    if(teacher.email) teacher._key = emailKey(teacher.email);
    else if(teacher.isAdmin) teacher._key = 'emad_school_ae';
    else teacher._key = 'teacher_' + Date.now();
  }
  CURRENT_TEACHER = teacher;
  // ALWAYS reset teacher students on new login
  window.TEACHER_STUDENTS = {};
  // Store in session
  try{ sessionStorage.setItem('ct', JSON.stringify(teacher)); }catch(e){}
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const ts=document.getElementById('screen-teacher');
  if(ts){ ts.classList.add('active'); ts.style.display='block'; ts.style.minHeight='100vh'; }
  // Load ALL data sequentially: admin students first, then teacher data
  const key = teacher._key || (teacher.email ? emailKey(teacher.email) : (teacher.isAdmin?'emad_school_ae':''));

  async function loadAndInit(){
    // Step 1: Always load admin students from /students/
    if(typeof db !== 'undefined'){
      try{
        const adminSnap = await db.ref('students').once('value');
        if(adminSnap.exists()) window.ADMIN_STUDENTS = adminSnap.val();
        syncPinsFromAdminStudents();
      } catch(e){ console.warn('ADMIN_STUDENTS load error:', e); }
    }

    // Step 2: Load teacher's own grade data (if registered teacher)
    if(typeof db !== 'undefined' && key && !teacher.isAdmin){
      try{
        const snap = await db.ref('teacherData/'+key+'/students').once('value');
        if(snap.exists()){
          Object.entries(snap.val()).forEach(([gradeSection, students])=>{
            const grade = gradeSection.replace(/[A-F]$/,'');
            const arr = Array.isArray(students) ? students : Object.values(students);
            if(!window.TEACHER_STUDENTS[grade]) window.TEACHER_STUDENTS[grade]=[];
            arr.forEach(s=>{
              const sObj={...s,t1:0,t2:0,hw:0,portal:0,activity:0,lab:0,total:0};
              const i=window.TEACHER_STUDENTS[grade].findIndex(x=>x.mid===s.mid);
              if(i>=0) window.TEACHER_STUDENTS[grade][i]={...window.TEACHER_STUDENTS[grade][i],...s};
              else window.TEACHER_STUDENTS[grade].push(sObj);
            });
          });
        }
      } catch(e){ console.warn('teacherData students load error:', e); }
      try{
        const gradesSnap = await db.ref('teacherData/'+key+'/grades').once('value');
        window.TEACHER_GRADES = gradesSnap.exists() ? gradesSnap.val() : {};
      } catch(e){ console.warn('teacherData grades load error:', e); }
      try{
        const settingsSnap = await db.ref('teacherData/'+key+'/settings').once('value');
        TEACHER_SETTINGS = settingsSnap.exists() ? settingsSnap.val() : {};
        if(TEACHER_SETTINGS.autoRefresh === undefined) TEACHER_SETTINGS.autoRefresh = true;
        if(!TEACHER_SETTINGS.lastGradeSync) TEACHER_SETTINGS.lastGradeSync = '';
      } catch(e){ console.warn('teacherData settings load error:', e); }
    }

    // Step 3: Start Firebase listeners for this teacher's data
    const tKeyInit = loadAndInit._teacher?._key || getTeacherKey();
    if(typeof window._startListenersForTeacher === 'function' && tKeyInit){
      window._startListenersForTeacher(tKeyInit);
    }
    // Step 4: Init dashboard
    applyTeacherProfile();
    refreshGradeDropdowns();
    initDashboard();
    if(TEACHER_SETTINGS.autoRefresh !== false && typeof window.fbReloadAll === 'function'){
      try{
        await window.fbReloadAll();
        initDashboard();
      }catch(e){ console.warn('autoRefresh', e); }
    }
    // Start Firebase listeners
    startTeacherListener(key);
  }

  loadAndInit._teacher = teacher;
  loadAndInit();
}

// Apply teacher name/subject to topbar
function formatTeacherScopeSummary(scope, isEn){
  if(!scope?.grades?.length) return '';
  const gradeMap = scope.gradeMap || {};
  return scope.grades.slice().sort().map(g=>{
    const secs = (gradeMap[g] && gradeMap[g].length) ? gradeMap[g] : (scope.sections || []);
    const secLabel = secs.filter(Boolean).join(isEn ? ', ' : ' · ');
    if(isEn){
      return secLabel ? `Grade ${g}: ${secLabel}` : `Grade ${g}`;
    }
    return secLabel ? `الصف ${g} — شعب ${secLabel}` : `الصف ${g}`;
  }).join(isEn ? ' · ' : ' | ');
}

function applyTeacherProfile(){
  if(!CURRENT_TEACHER) return;
  const isEn = currentLang==='en';
  const subj = SUBJECTS[CURRENT_TEACHER.subject];
  const subjLabel = subj ? (isEn ? subj.en : subj.ar) : (CURRENT_TEACHER.subject || '');
  const ts = document.getElementById('teacher-school');
  if(ts){
    ts.textContent = isEn
      ? 'Mohamed Bin Hamad Al Sharqi - Cycle 2 (Boys)'
      : 'محمد بن حمد الشرقي للحلقة الثانية -بنين';
  }
  const scope = getTeacherScope();
  const scopeLabel = formatTeacherScopeSummary(scope, isEn);
  const te = document.getElementById('teacher-name-el');
  if(te){
    const name = CURRENT_TEACHER.name || '';
    te.textContent = [name, subjLabel].filter(Boolean).join(' · ');
  }
  const scopeEl = document.getElementById('teacher-scope-el');
  if(scopeEl){
    scopeEl.textContent = scopeLabel || (isEn ? 'No grades/sections registered' : 'لم تُسجَّل صفوف أو شعب');
  }
  try{ refreshGradeDropdowns(); }catch(e){}
}

async function logout(){
  try{ if(typeof auth!=='undefined' && auth) await auth.signOut(); }catch(e){}
  // Detach all Firebase listeners
  if(window._teacherListeners){
    window._teacherListeners.forEach(ref=>ref.off());
    window._teacherListeners=[];
  }
  if(window._parentListeners){
    window._parentListeners.forEach(ref=>ref.off());
    window._parentListeners=[];
  }
  // Reset state
  CURRENT_TEACHER=null;
  window.ADMIN_STUDENTS={};
  window.TEACHER_STUDENTS={};
  APP.messages=[];
  APP.behaviorLog=[];
  APP.parentMessages=[];
  try{ sessionStorage.removeItem('ct'); }catch(e){}
  showScreen('login');
  const ei=document.getElementById('teacher-email-input'); if(ei) ei.value='';
  const pi=document.getElementById('teacher-pw-input');    if(pi) pi.value='';
}



let pendingLogin = null; // {cls, name}
let pinAttempts = 0;

function goToPin(){
  goToPinAsync().catch(e=>console.error('goToPin', e));
}

async function goToPinAsync(){
  const grade   = document.getElementById('parent-grade')?.value || document.getElementById('parent-class')?.value || '';
  const section = document.getElementById('parent-section')?.value||'';
  const nameSel = document.getElementById('parent-name');
  const name    = nameSel?.value||'';
  const errEl   = document.getElementById('cls-error-msg');
  if(errEl) errEl.style.display='none';
  if(!grade||!name){ if(errEl){ errEl.style.display='block'; } return; }
  const cls = grade;
  const selectedOpt = nameSel?.options[nameSel.selectedIndex];
  const mid = selectedOpt?.dataset?.mid || '';

  const nextBtn = document.getElementById('parent-next-btn');
  if(nextBtn){
    nextBtn.disabled = true;
    nextBtn.textContent = currentLang==='en' ? '⏳ Checking...' : '⏳ جارٍ التحقق...';
  }

  try{
    if(typeof db !== 'undefined'){
      const sessionKey = makeParentSessionKey(cls, section, name);
      const snap = await db.ref('parentQuickLogin/'+sessionKey).once('value');
      if(snap.exists()){
        const reg = snap.val();
        if(parentSessionMatches(reg, cls, section, name) && reg.mid){
          pendingLogin = null;
          pinAttempts = 0;
          await enterParentDashboard(cls, name, reg.mid, section);
          return;
        }
      }
    }
  }catch(e){
    console.warn('parentQuickLogin check', e);
  }finally{
    if(nextBtn){
      nextBtn.disabled = false;
      nextBtn.textContent = currentLang==='en' ? 'Next →' : 'التالي ←';
    }
  }

  pendingLogin={cls, name, section, mid};
  pinAttempts=0;
  document.getElementById('pin-error').style.display='none';
  document.getElementById('lock-attempts').textContent='';
  const lockStudent = findStudentInGrade(cls, name, mid, section);
  document.getElementById('lock-student-name').textContent = displayStudentName(lockStudent || {name});
  clearPin();
  showScreen('locked');
  setTimeout(()=>document.getElementById('p0')?.focus(), 300);
}

// ══════════════════════════════════════════════════
//  PIN INPUT
// ══════════════════════════════════════════════════
function pinInputSingle(input){
  const val = input.value.replace(/\D/g,'');
  input.value = val;
  // لا تحقق تلقائي — المستخدم يضغط زر "دخول"
}

function clearPin(){
  const el = document.getElementById('p0');
  if(el){ el.value=''; el.disabled=false; el.style.borderColor='var(--grey-5)'; }
}

// Legacy functions kept for compatibility
function pinInput(i){ if(i===0) pinInputSingle(document.getElementById('p0')); }
function pinKey(e,i){ if(e.key==='Enter') checkPin(); }
function checkPin(){
  checkPinAsync().catch(e=>console.error('checkPin', e));
}

async function checkPinAsync(){
  if(!pendingLogin) return;
  const entered = [0,1,2,3,4,5,6,7,8,9].map(i=>{
    const el = document.getElementById('p'+i);
    return el ? el.value : '';
  }).join('').replace(/\s/g,'');
  if(entered.length < 4) return;
  const key = pendingLogin.cls+'|'+pendingLogin.name;
  const fMid = pendingLogin.mid;
  const student = findStudentInGrade(pendingLogin.cls, pendingLogin.name, pendingLogin.mid, pendingLogin.section);
  const correct = fMid || (student ? student.mid : APP.pins[key]);
  if(entered === correct){
    const loginCls = pendingLogin.cls;
    const loginName = pendingLogin.name;
    const loginSection = pendingLogin.section || '';
    const loginMid = pendingLogin.mid || entered;
    pendingLogin=null; pinAttempts=0;
    await enterParentDashboard(loginCls, loginName, loginMid, loginSection);
  } else {
    pinAttempts++;
    clearPin();
    document.getElementById('pin-error').style.display='block';
    const left=5-pinAttempts;
    document.getElementById('lock-attempts').textContent=
      pinAttempts>=5?'تم تجاوز عدد المحاولات — يرجى التواصل مع المعلم':
      `محاولات متبقية: ${left}`;
    if(pinAttempts>=5){
      for(let i=0;i<10;i++){const el=document.getElementById('p'+i);if(el)el.disabled=true;}
    }
    setTimeout(()=>document.getElementById('p0')?.focus(), 100);
  }
}

// ══════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════
function getGrade(tot){
  if(currentLang==='en') return tot>=90?'Excellent':tot>=80?'Very Good':tot>=70?'Good':tot>=60?'Acceptable':'Weak';
  return tot>=90?'ممتاز':tot>=80?'جيد جداً':tot>=70?'جيد':tot>=60?'مقبول':'ضعيف';
}
function gradeBadge(tot){
  const g=getGrade(tot);
  const m = currentLang==='en'
    ? {'Excellent':'badge-teal','Very Good':'badge-green','Good':'badge-gold','Acceptable':'badge-grey','Weak':'badge-red'}
    : {'ممتاز':'badge-teal','جيد جداً':'badge-green','جيد':'badge-gold','مقبول':'badge-grey','ضعيف':'badge-red'};
  return `<span class="badge ${m[g]||'badge-grey'}">${g}</span>`;
}
function bar(pct,color='#1a9a9a'){
  return `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${Math.min(100,pct)}%;background:${color}"></div></div>`;
}
function allStudents(cls, sec){
  const filtered = getFilteredStudents();
  const secFilter = sec || '';
  if(cls){
    const arr = (filtered[cls]||[]).map(s=>mergeGradeScores(cls, {...s, cls}));
    return secFilter ? arr.filter(s=>s.section===secFilter) : arr;
  }
  const all = Object.entries(filtered).flatMap(([c,arr])=>arr.map(s=>mergeGradeScores(c, {...s, cls:c})));
  return secFilter ? all.filter(s=>s.section===secFilter) : all;
}

function parseGradeBucket(bucket){
  const m = String(bucket || '').match(/^([5-8])([1-6A-F]+)$/i);
  if(!m) return null;
  return { grade: m[1], section: normalizeSectionCell(m[2]) };
}

function getImportedGradeStudents(cls, sec){
  const store = window.TEACHER_GRADES || {};
  const scope = getTeacherScope();
  const secFilter = sec ? normalizeSectionCell(sec) : '';
  const list = [];

  Object.entries(store).forEach(([bucket, records])=>{
    const parsed = parseGradeBucket(bucket);
    if(!parsed || !records || typeof records !== 'object') return;
    const { grade, section } = parsed;
    if(cls && grade !== cls) return;
    if(secFilter && section !== secFilter) return;
    if(scope && !isTeacherScopeMatch(scope, grade, section)) return;

    Object.values(records).forEach(rec=>{
      if(!rec || typeof rec !== 'object') return;
      list.push({
        cls: grade,
        section,
        name: rec.name || '',
        nameEn: rec.nameEn || '',
        mid: rec.mid || '',
        diagnostic: rec.diagnostic || 0,
        t1: rec.t1 || 0,
        t2: rec.t2 || 0,
        hw: rec.hw || 0,
        portal: rec.portal || 0,
        activity: rec.activity || 0,
        lab: rec.lab || 0,
        total: rec.total || 0,
        final: rec.final || 0,
        hwWeeks: rec.hwWeeks || [],
        portalWeeks: rec.portalWeeks || [],
        actWeeks: rec.actWeeks || [],
      });
    });
  });

  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
}

function gradesUploadEmptyRow(colspan){
  const isEn = currentLang === 'en';
  return `<tr><td colspan="${colspan}" class="empty-state">
    <div class="ico">📂</div>
    <p>${isEn
      ? 'No grades yet — upload the Excel file via “Update Grades”'
      : 'لا توجد درجات بعد — ارفع ملف Excel من زر «تحديث الدرجات»'}</p>
  </td></tr>`;
}
function filterTable(id,q){
  document.querySelectorAll('#'+id+' tbody tr').forEach(r=>{ r.style.display=r.textContent.includes(q)?'':'none'; });
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
//  TEACHER FILTER — shows only teacher's grades/sections
// ══════════════════════════════════════════════════

// Returns {grade: [sectionLetters]} for current teacher
function getTeacherScope(){
  if(!CURRENT_TEACHER) return null;
  if(CURRENT_TEACHER.isAdmin) return null; // admin sees all
  const grades   = CURRENT_TEACHER.grades   || [];
  const gradeMap = CURRENT_TEACHER.gradeMap || null; // {grade:[sections]}
  const sections = CURRENT_TEACHER.sections || [];
  return { grades, sections, gradeMap };
}

// Get allowed sections for a specific grade
function getSectionsForGrade(grade){
  const scope = getTeacherScope();
  if(!scope){
    const fromCache = getGradeSectionsFromCache(grade);
    return fromCache.length ? fromCache : SECTIONS_LIST;
  }
  if(scope.gradeMap && scope.gradeMap[grade]) return scope.gradeMap[grade];
  return scope.sections; // fallback
}

// Filter STUDENTS to only teacher's uploaded students
// New teachers see EMPTY until they upload their Excel
function getFilteredStudents(){
  const scope = getTeacherScope();
  const filtered = {};
  const source = window.ADMIN_STUDENTS || {};
  if(!Object.keys(source).length) return filtered;
  const grades = scope ? scope.grades : Object.keys(source).sort();
  grades.forEach(g=>{
    const allowedSecs = scope ? getSectionsForGrade(g) : Object.keys(source[g] || {});
    const gradeSecs = source[g] || {};
    let gradeStudents = [];
    allowedSecs.forEach(sec=>{
      const secData = gradeSecs[sec];
      if(!secData) return;
      const arr = Array.isArray(secData) ? secData : Object.values(secData);
      arr.forEach(s=>gradeStudents.push({...s, section: sec}));
    });
    filtered[g] = gradeStudents;
  });
  return filtered;
}

// Allowed class keys for dropdowns e.g. ["5", "7"]
function getAllowedGrades(){
  const scope = getTeacherScope();
  if(!scope) return ['5','6','7','8']; // admin sees all school grades
  // Return teacher's registered grades (5-8 range)
  return (scope.grades || []).filter(g => ['5','6','7','8'].includes(g));
}

// Override allStudents to respect filter


// Build <option> list for a grade select element
function buildGradeOptions(selectId, onchange){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const grades = getAllowedGrades();
  const isEn  = currentLang==='en';
  const prev   = sel.value;
  // Determine paired section select id
  const secId = selectId==='class-filter'?'sec-filter'
    : selectId.replace('-class','-sec').replace('grades-class','grades-sec');

  sel.innerHTML = `<option value="">${isEn?'All':'الكل'}</option>`
    + grades.map(g=>`<option value="${g}">${isEn?'Grade '+g:'الصف '+g}</option>`).join('');

  if(grades.includes(prev)) sel.value=prev;

  // Wire onchange to update section dropdown too
  sel.onchange = function(){
    onGradeChange(selectId, secId, onchange);
  };
  // Init section dropdown for current value
  buildSectionOptions(sel, secId, isEn?'All Sections':'كل الشعب', onchange);
}

// Build class-filter (overview) with "All" option
function buildClassFilter(){
  const sel = document.getElementById('class-filter');
  if(!sel) return;
  const grades = getAllowedGrades();
  const isEn = currentLang==='en';
  const allOpt = `<option value="">${isEn?'All':'الكل'}</option>`;
  sel.innerHTML = allOpt + grades.map(g=>
    `<option value="${g}">${isEn?'Grade '+g:'الصف '+g}</option>`
  ).join('');
}

// Get allowed grades for this teacher


// Refresh all grade dropdowns in dashboard
function refreshGradeDropdowns(){
  buildClassFilter();
  buildGradeOptions('grades-class',   renderGradesTab);
  buildGradeOptions('pins-class',     renderPinsTab);
  buildGradeOptions('behavior-class', renderBehaviorTab);
  buildGradeOptions('msg-class',      populateMsgStudents);
  buildGradeOptions('links-class',    renderLinksTab);
  buildGradeOptions('analysis-class', renderAnalysisTab);
}

// Build section dropdown for a given grade select
function buildSectionOptions(gradeSel, sectionSelId, allLabel, onchange){
  const sectionSel = document.getElementById(sectionSelId);
  if(!sectionSel) return;
  const grade = gradeSel ? gradeSel.value : '';
  const isEn  = currentLang==='en';
  const allowedSecs = grade ? getSectionsForGrade(grade) : (getTeacherScope()?.sections || SECTIONS_LIST);
  sectionSel.innerHTML = `<option value="">${allLabel||( isEn?'All Sections':'كل الشعب')}</option>`
    + allowedSecs.map(s=>{
        const label = formatSectionLabel(s, isEn);
        return `<option value="${s}">${label}</option>`;
      }).join('');
  if(onchange) sectionSel.onchange=onchange;
}

// Called when grade dropdown changes → update section options
function onGradeChange(gradeSelId, secSelId, callback){
  const gradeSel = document.getElementById(gradeSelId);
  const grade = gradeSel ? gradeSel.value : '';
  const isEn = currentLang==='en';
  buildSectionOptions(gradeSel, secSelId, isEn?'All Sections':'كل الشعب', callback);
  if(callback) callback();
}

// Build grade+section filter dropdowns after login



// ══════════════════════════════════════════════════
//  ADMIN DASHBOARD FUNCTIONS
// ══════════════════════════════════════════════════

// Cached student data loaded from Firebase
window.ADMIN_STUDENTS = {}; // {grade: {section: [{mid,name,nameEn}]}}

function _enterAdminDashboard(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const as = document.getElementById('screen-admin');
  if(as){ as.classList.add('active'); as.style.display='block'; as.style.minHeight='100vh'; }
  adminLoadStudents();
  startAdminComplaintsListener();
}



// Load students from Firebase /students/


function adminBuildFilters(){
  const isEn = currentLang==='en';
  const gradeSel = document.getElementById('admin-grade-filter');
  const secSel   = document.getElementById('admin-sec-filter');
  if(!gradeSel || !secSel) return;
  const grades = Object.keys(window.ADMIN_STUDENTS).sort();
  gradeSel.innerHTML = `<option value="">${isEn?'All':'الكل'}</option>`
    + grades.map(g=>`<option value="${g}">${isEn?'Grade '+g:'الصف '+g}</option>`).join('');
  gradeSel.onchange = ()=>{
    const g = gradeSel.value;
    const secs = g ? Object.keys(window.ADMIN_STUDENTS[g]||{}).sort() : [];
    secSel.innerHTML = `<option value="">${isEn?'All':'الكل'}</option>`
      + secs.map(s=>`<option value="${s}">${isEn?'Sec '+s:'شعبة '+s}</option>`).join('');
    adminRenderStudents();
  };
  secSel.onchange = ()=>adminRenderStudents();
}



// Import students from Excel


function showAdminTab(tab, el){
  document.querySelectorAll('.admin-tab-panel').forEach(p=>p.style.display='none');
  document.querySelectorAll('.admin-main-tab').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('admin-tab-'+tab);
  if(panel) panel.style.display='block';
  if(el) el.classList.add('active');
  if(tab==='monitor') adminLoadMonitoring();
  if(tab==='complaints') renderAdminComplaints();
}

let adminComplaintsCache = [];

function stopAdminComplaintsListener(){
  (window._adminListeners||[]).forEach(r=>r.off());
  window._adminListeners = [];
}

function startAdminComplaintsListener(){
  stopAdminComplaintsListener();
  if(typeof db==='undefined' || !IS_ADMIN) return;
  const ref = db.ref('complaints');
  ref.on('value', snap=>{
    adminComplaintsCache = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''))
      : [];
    updateAdminComplaintsBadge();
    if(document.getElementById('admin-tab-complaints')?.style.display !== 'none'){
      renderAdminComplaints();
    }
  });
  window._adminListeners = window._adminListeners || [];
  window._adminListeners.push(ref);
}

function updateAdminComplaintsBadge(){
  const pending = adminComplaintsCache.filter(c=>c.status==='pending').length;
  const tab = document.getElementById('admin-tab-btn-complaints');
  if(!tab) return;
  let badge = tab.querySelector('.inbox-badge');
  if(pending>0){
    if(!badge){
      badge=document.createElement('span');
      badge.className='inbox-badge';
      badge.style.cssText='background:var(--red-soft);color:#fff;border-radius:20px;font-size:11px;font-weight:700;padding:1px 7px;margin-right:6px;display:inline-block';
      tab.prepend(badge);
    }
    badge.textContent=pending;
  } else if(badge){ badge.remove(); }
}

const ADMIN_REPLY_TEMPLATES = {
  ar: {
    r1: 'تم استلام شكواكم وجاري المتابعة.',
    r2: 'تم التواصل مع المعلم بخصوص الشكوى وسنبلغكم بالنتيجة.',
    r3: 'نعتذر عن الإزعاج، وتم اتخاذ الإجراء المناسب.',
    r4: 'شكراً لتواصلكم، سيتم حل الأمر قريباً.',
    r5: 'تمت معالجة الشكوى، نرجو إبلاغنا إن استمرت المشكلة.',
    r6: 'نود إبلاغكم أنه جرى التحقق من الأمر واتخاذ اللازم.',
  },
  en: {
    r1: 'We have received your complaint and are following up.',
    r2: 'We contacted the teacher regarding your complaint and will update you.',
    r3: 'We apologize for the inconvenience; appropriate action has been taken.',
    r4: 'Thank you for contacting us; the matter will be resolved soon.',
    r5: 'Your complaint has been addressed; please let us know if the issue continues.',
    r6: 'We have reviewed the matter and taken the necessary action.',
  },
};

function adminReplyQuickButtons(complaintId, isEn){
  const lang = isEn ? 'en' : 'ar';
  const labels = {
    r1: isEn ? '✅ Received' : '✅ تم الاستلام',
    r2: isEn ? '👨‍🏫 Contacted teacher' : '👨‍🏫 تواصل مع المعلم',
    r3: isEn ? '🙏 Apology' : '🙏 اعتذار',
    r4: isEn ? '⏳ In progress' : '⏳ قيد المعالجة',
    r5: isEn ? '✔️ Resolved' : '✔️ تمت المعالجة',
    r6: isEn ? '🔍 Investigated' : '🔍 تم التحقق',
  };
  return Object.keys(ADMIN_REPLY_TEMPLATES[lang]).map(key=>`
    <button type="button" class="admin-reply-quick-btn" onclick="adminSelectQuickReply('${complaintId}','${key}')">${labels[key]}</button>
  `).join('');
}

function adminToggleReplyForm(complaintId){
  const prev = window._adminOpenReply;
  if(prev && prev !== complaintId){
    const ta = document.getElementById('admin-reply-input-'+prev);
    if(ta){
      window._adminReplyDrafts = window._adminReplyDrafts || {};
      window._adminReplyDrafts[prev] = ta.value;
    }
  }
  window._adminOpenReply = window._adminOpenReply === complaintId ? null : complaintId;
  renderAdminComplaints();
}

function adminSelectQuickReply(complaintId, key){
  const lang = currentLang==='en' ? 'en' : 'ar';
  const text = ADMIN_REPLY_TEMPLATES[lang]?.[key] || '';
  window._adminReplyDrafts = window._adminReplyDrafts || {};
  window._adminReplyDrafts[complaintId] = text;
  window._adminOpenReply = complaintId;
  renderAdminComplaints();
}

function renderAdminComplaints(){
  const wrap = document.getElementById('admin-complaints-list');
  if(!wrap) return;
  const isEn = currentLang==='en';
  const list = adminComplaintsCache || [];
  if(!list.length){
    wrap.innerHTML = `<div class="empty-state" style="padding:32px"><div class="ico">📭</div><p>${isEn?'No complaints yet':'لا توجد شكاوى بعد'}</p></div>`;
    return;
  }
  const statusLabel = c=>{
    if(c.status==='pending') return isEn?'Pending':'قيد المراجعة';
    if(c.status==='replied') return isEn?'Replied':'تم الرد';
    if(c.status==='forwarded_anonymous') return isEn?'Forwarded (anonymous)':'مُوجّهة (عامة)';
    if(c.status==='forwarded') return isEn?'Forwarded to teacher':'مُوجّهة للمعلم';
    return c.status||'—';
  };
  wrap.innerHTML = list.map(c=>{
    const pending = c.status==='pending';
    const subj = escapeHtml(c.subjLabel || formatAdminSubject(c.subject, isEn));
    const replyOpen = window._adminOpenReply === c.id;
    const forwardActions = pending ? `
        <button type="button" class="btn-primary admin-complaint-btn" onclick="adminForwardComplaint('${c.id}',false)">
          👨‍🏫 ${isEn?'Forward to teacher (with details)':'توجيه للمعلم (مع بيانات الطالب)'}
        </button>
        <button type="button" class="btn-icon admin-complaint-btn anon" onclick="adminForwardComplaint('${c.id}',true)">
          🔒 ${isEn?'Forward as general complaint':'توجيه كشكوى عامة (بدون هوية)'}
        </button>` : '';
    return `
      <div class="admin-complaint-card${pending?' pending':''}">
        <div class="admin-complaint-head">
          <span class="admin-complaint-status ${c.status||'pending'}">${statusLabel(c)}</span>
          <span class="admin-complaint-date">${formatAdminDate(c.ts||c.date, isEn)}</span>
        </div>
        <div class="admin-complaint-meta">
          <span>👨‍🎓 ${escapeHtml(displayStudentName(c.studentName, c.cls, c.section, c.mid))}</span>
          <span>🆔 ${escapeHtml(c.mid||'—')}</span>
          <span>📚 ${isEn?'Grade':'صف'} ${escapeHtml(c.cls||'—')} · ${isEn?'Sec':'ش'} ${escapeHtml(c.section||'—')}</span>
          <span>👨‍🏫 ${escapeHtml(c.teacherName||'—')}</span>
          <span>📖 ${subj}</span>
        </div>
        <p class="admin-complaint-body">${escapeHtml(c.body||'')}</p>
        <div class="admin-complaint-actions">
          <button type="button" class="btn-icon admin-complaint-btn reply" onclick="adminToggleReplyForm('${c.id}')">
            💬 ${isEn?'Reply':'رد'}
          </button>
          ${forwardActions}
        </div>
        <div id="admin-reply-panel-${c.id}" class="admin-reply-panel" style="display:${replyOpen?'block':'none'}">
          <div class="admin-reply-quick">${adminReplyQuickButtons(c.id, isEn)}</div>
          <textarea id="admin-reply-input-${c.id}" class="admin-reply-textarea" rows="4"
            placeholder="${isEn?'Write your reply to the parent...':'اكتب ردك لولي الأمر...'}"></textarea>
          <button type="button" class="btn-primary admin-reply-send" onclick="adminSendComplaintReply('${c.id}')">
            📤 ${isEn?'Send Reply':'إرسال الرد'}
          </button>
        </div>
      </div>`;
  }).join('');

  if(window._adminOpenReply){
    const ta = document.getElementById('admin-reply-input-'+window._adminOpenReply);
    const draft = window._adminReplyDrafts?.[window._adminOpenReply];
    if(ta && draft) ta.value = draft;
  }
}

async function adminSendComplaintReply(complaintId){
  const isEn = currentLang==='en';
  const c = adminComplaintsCache.find(x=>x.id===complaintId);
  const body = (document.getElementById('admin-reply-input-'+complaintId)?.value||'').trim();
  if(!c){
    showToast('⚠️ '+(isEn?'Complaint not found':'الشكوى غير موجودة'));
    return;
  }
  if(!body){
    showToast('⚠️ '+(isEn?'Write a reply first':'اكتب نص الرد أولاً'));
    return;
  }
  if(!c.mid){
    showToast('⚠️ '+(isEn?'Student ID missing':'الرقم الوزاري غير متوفر'));
    return;
  }
  if(typeof db==='undefined') return;
  const now = new Date();
  const payload = {
    mid: String(c.mid),
    studentName: c.studentName,
    cls: c.cls,
    section: c.section||'',
    teacherKey: c.teacherKey,
    teacherName: c.teacherName||'',
    subject: c.subject||'',
    subjLabel: c.subjLabel||'',
    complaintId,
    body,
    date: now.toLocaleDateString(isEn?'en-AE':'ar-AE')+' '+now.toLocaleTimeString(isEn?'en-AE':'ar-AE',{hour:'2-digit',minute:'2-digit'}),
    ts: now.toISOString(),
  };
  try{
    if(typeof window.fbPushParentAdminReply === 'function'){
      await window.fbPushParentAdminReply(c.mid, payload);
    } else {
      await db.ref('parentAdminInbox/'+c.mid).push(payload);
    }
    const updates = { lastReplyAt: now.toISOString() };
    if(c.status==='pending') updates.status = 'replied';
    await db.ref('complaints/'+complaintId).update(updates);
    window._adminOpenReply = null;
    if(window._adminReplyDrafts) delete window._adminReplyDrafts[complaintId];
    showToast('✅ '+(isEn?'Reply sent to parent':'تم إرسال الرد لولي الأمر'));
    renderAdminComplaints();
  }catch(e){
    console.error('adminSendComplaintReply', e);
    showToast('⚠️ '+(isEn?'Failed to send reply':'فشل إرسال الرد'));
  }
}

async function adminForwardComplaint(complaintId, anonymous){
  const isEn = currentLang==='en';
  const c = adminComplaintsCache.find(x=>x.id===complaintId);
  if(!c || c.status!=='pending'){
    showToast('⚠️ '+(isEn?'Complaint not found or already handled':'الشكوى غير موجودة أو تمت معالجتها'));
    return;
  }
  const msg = anonymous
    ? (isEn?'Forward as anonymous general complaint to the teacher?':'توجيه الشكوى للمعلم كشكوى عامة دون بيانات مقدّمها؟')
    : (isEn?'Forward to teacher with student details?':'توجيه الشكوى للمعلم مع بيانات الطالب؟');
  if(!confirm(msg)) return;
  if(typeof db==='undefined') return;
  try{
    const inboxItem = {
      body: c.body,
      subject: c.subject,
      subjLabel: c.subjLabel,
      cls: c.cls,
      section: c.section,
      date: c.date,
      ts: c.ts,
      complaintId,
      anonymous: !!anonymous,
      forwardedAt: new Date().toISOString(),
      read: false,
    };
    if(anonymous){
      inboxItem.general = true;
    } else {
      inboxItem.studentName = c.studentName;
      inboxItem.mid = c.mid;
    }
    await db.ref('teacherData/'+c.teacherKey+'/complaintInbox').push(inboxItem);
    await db.ref('complaints/'+complaintId).update({
      status: anonymous ? 'forwarded_anonymous' : 'forwarded',
      forwardedAt: new Date().toISOString(),
    });
    showToast('✅ '+(isEn?'Complaint forwarded':'تم توجيه الشكوى'));
    renderAdminComplaints();
  }catch(e){
    console.error('adminForwardComplaint', e);
    showToast('⚠️ '+(isEn?'Failed to forward':'فشل التوجيه'));
  }
}

function formatAdminGrades(teacher, isEn){
  const gm = teacher.gradeMap || {};
  const parts = Object.keys(gm).sort().map(g=>{
    const secs = (gm[g]||[]).join(', ');
    return isEn ? `G${g} (${secs})` : `ص${g} (${secs})`;
  });
  return parts.join(' · ') || (teacher.grades||[]).join(', ') || '—';
}

function formatAdminSubject(subject, isEn){
  const subj = SUBJECTS[subject];
  return subj ? (isEn ? subj.en : subj.ar) : (subject || '—');
}

function formatAdminDate(iso, isEn){
  if(!iso) return '—';
  try{
    return new Date(iso).toLocaleString(isEn ? 'en-AE' : 'ar-AE', { dateStyle:'short', timeStyle:'short' });
  }catch(e){ return iso; }
}

function adminGetActiveGradeSections(){
  const cache = adminStudentsCache || window.ADMIN_STUDENTS || {};
  const list = [];
  Object.keys(cache).sort((a,b)=>Number(a)-Number(b)).forEach(grade=>{
    Object.keys(cache[grade]||{}).sort().forEach(sec=>{
      const secData = cache[grade][sec];
      if(!secData) return;
      const count = Array.isArray(secData) ? secData.length : Object.values(secData).length;
      if(count > 0) list.push({ grade, section: sec, count });
    });
  });
  return list;
}

function adminBuildRegisteredCoverage(teachers){
  const covered = new Set();
  (teachers||[]).forEach(t=>{
    if(!t?.subject || t.role === 'admin') return;
    const gm = t.gradeMap || {};
    if(Object.keys(gm).length){
      Object.keys(gm).forEach(grade=>{
        (gm[grade]||[]).forEach(sec=> covered.add(`${grade}|${sec}|${t.subject}`));
      });
    }else if(t.grades?.length){
      (t.grades||[]).forEach(grade=>{
        (t.sections||SECTIONS_LIST).forEach(sec=> covered.add(`${grade}|${sec}|${t.subject}`));
      });
    }
  });
  return covered;
}

function adminComputeMissingCoverage(teachers){
  const covered = adminBuildRegisteredCoverage(teachers);
  const subjectKeys = Object.keys(SUBJECTS);
  const gradeSections = adminGetActiveGradeSections();
  const missing = [];
  let usedFallback = false;

  const slots = gradeSections.length
    ? gradeSections
    : (usedFallback = true, GRADES_LIST.flatMap(grade => SECTIONS_LIST.map(section => ({ grade, section, count: 0 }))));

  slots.forEach(({ grade, section })=>{
    subjectKeys.forEach(sk=>{
      if(!covered.has(`${grade}|${section}|${sk}`)){
        missing.push({ grade, section, subject: sk });
      }
    });
  });

  return { missing, gradeSections, usedFallback, coveredCount: covered.size };
}

function adminRenderMissingCoverage(teachers, isEn){
  const wrap = document.getElementById('admin-missing-coverage');
  const desc = document.getElementById('admin-missing-desc');
  if(!wrap) return { missingCount: 0 };

  const { missing, gradeSections, usedFallback } = adminComputeMissingCoverage(teachers);

  if(desc){
    desc.dataset.dynamic = '1';
    desc.textContent = usedFallback
      ? (isEn
        ? 'No student lists uploaded yet — showing all grades/sections. Upload lists in the first tab for accurate coverage.'
        : 'لم تُرفَع قوائم طلبة بعد — يُعرض كل الصفوف والشعب. ارفع القوائم من تبويب «رفع قوائم الطلبة» لدقة أعلى.')
      : (isEn
        ? `Based on uploaded student lists (${gradeSections.length} class sections). Each chip is a subject with no registered teacher yet.`
        : `وفق قوائم الطلبة المرفوعة (${gradeSections.length} شعبة). كل بطاقة = مادة لم يُسجّل معلم لها بعد.`);
  }

  if(!missing.length){
    wrap.innerHTML = `<div class="admin-all-covered">✅ ${isEn?'All subjects are covered for every uploaded class section.':'جميع المواد مُغطّاة لكل الشعب المرفوعة.'}</div>`;
    return { missingCount: 0 };
  }

  const byGrade = {};
  missing.forEach(m=>{
    if(!byGrade[m.grade]) byGrade[m.grade] = {};
    if(!byGrade[m.grade][m.section]) byGrade[m.grade][m.section] = [];
    byGrade[m.grade][m.section].push(m.subject);
  });

  wrap.innerHTML = Object.keys(byGrade).sort((a,b)=>Number(a)-Number(b)).map(grade=>{
    const secRows = Object.keys(byGrade[grade]).sort().map(sec=>{
      const chips = byGrade[grade][sec].map(sk=>{
        const label = formatAdminSubject(sk, isEn);
        return `<span class="admin-missing-chip">📚 ${escapeHtml(label)}</span>`;
      }).join('');
      const secLabel = isEn ? `Sec ${sec}` : `شعبة ${sec}`;
      return `<div class="admin-sec-row"><div class="admin-sec-label">${secLabel}</div><div class="admin-missing-chips">${chips}</div></div>`;
    }).join('');
    const gradeLabel = isEn ? `Grade ${grade}` : `الصف ${grade}`;
    return `<div class="admin-grade-block"><h4 class="admin-grade-title">🎓 ${gradeLabel}</h4>${secRows}</div>`;
  }).join('');

  return { missingCount: missing.length };
}

function adminUpdateMonitorStats(teacherCount, parentCount, missingCount, isEn){
  const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('admin-stat-teachers', teacherCount);
  set('admin-stat-parents', parentCount);
  set('admin-stat-missing', missingCount);
  set('admin-stat-lbl-teachers', isEn ? 'Teachers' : 'معلمون');
  set('admin-stat-lbl-parents', isEn ? 'Parents' : 'أولياء أمور');
  set('admin-stat-lbl-missing', isEn ? 'Unregistered slots' : 'مواد غير مسجلة');
  const mt = document.getElementById('admin-missing-title');
  if(mt) mt.textContent = isEn
    ? '⚠️ Grades & sections — subjects without a teacher yet'
    : '⚠️ الصفوف والشعب — مواد لم يُسجّل معلم لها بعد';
}

async function adminAddTeacherAllowlist(){
  const isEn = currentLang==='en';
  const emailInput = document.getElementById('admin-allow-email');
  const nameInput = document.getElementById('admin-allow-name');
  const email = (emailInput?.value||'').trim().toLowerCase();
  const name = (nameInput?.value||'').trim();
  if(!email || !email.includes('@')){
    showToast(isEn ? '⚠️ Enter a valid email' : '⚠️ أدخل بريداً إلكترونياً صحيحاً');
    return;
  }
  if(typeof db==='undefined'){
    showToast(isEn ? '❌ Not connected' : '❌ غير متصل');
    return;
  }
  const key = emailKey(email);
  try{
    await db.ref('teacherAllowlist/'+key).set({
      email,
      name: name || null,
      addedAt: new Date().toISOString(),
      addedBy: auth?.currentUser?.uid || null,
    });
    if(emailInput) emailInput.value = '';
    if(nameInput) nameInput.value = '';
    showToast(isEn ? '✅ Teacher email added to approved list' : '✅ تمت إضافة بريد المعلّم للقائمة المعتمدة');
    adminLoadMonitoring();
  }catch(e){
    console.error('adminAddTeacherAllowlist', e);
    showToast(isEn ? '❌ Failed to add email' : '❌ فشل إضافة البريد');
  }
}

async function adminRemoveTeacherAllowlist(key, email){
  const isEn = currentLang==='en';
  if(!key) return;
  if(typeof db==='undefined'){
    showToast(isEn ? '❌ Not connected' : '❌ غير متصل');
    return;
  }
  if(typeof auth === 'undefined' || !auth.currentUser){
    showToast(isEn ? '❌ Admin login required' : '❌ يجب تسجيل دخول المسؤول');
    return;
  }
  const label = email || key;
  if(!confirm(isEn
    ? `Remove "${label}" from approved teachers list?\nThey will not be able to register unless added again.`
    : `إزالة "${label}" من قائمة المعلّمين المعتمدين؟\nلن يستطيع التسجيل ما لم يُضاف مجدداً.`)) return;
  try{
    await db.ref('teacherAllowlist/'+key).remove();
    showToast(isEn ? '✅ Removed from approved list' : '✅ تمت الإزالة من القائمة');
    adminLoadMonitoring();
  }catch(e){
    console.error('adminRemoveTeacherAllowlist', e);
    showToast(isEn ? '❌ Remove failed — check admin permissions' : '❌ فشل الإزالة — تحقق من صلاحيات المسؤول');
  }
}

function adminRenderAllowlistTable(allowlist, teachersByKey, isEn){
  const tbody = document.getElementById('admin-allowlist-tbody');
  if(!tbody) return;
  const entries = Object.entries(allowlist||{}).map(([key, v]) => ({ key, ...v }));
  entries.sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  if(!entries.length){
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="ico">📋</div><p>${isEn?'No approved emails yet — add teacher emails below':'لا توجد بريدات معتمدة بعد — أضف بريد المعلّم أدناه'}</p></td></tr>`;
    return;
  }
  tbody.innerHTML = entries.map(entry=>{
    const teacher = teachersByKey[entry.key] || null;
    const registered = !!teacher;
    const status = registered
      ? (isEn ? '✅ Registered' : '✅ مسجّل')
      : (isEn ? '⏳ Pending' : '⏳ بانتظار التسجيل');
    const displayName = teacher?.name || entry.name || '—';
    const subject = teacher ? formatAdminSubject(teacher.subject, isEn) : '—';
    const grades = teacher ? formatAdminGrades(teacher, isEn) : '—';
    const regDate = teacher ? formatAdminDate(teacher.createdAt, isEn) : '—';
    const actionBtn = registered
      ? `<button type="button" class="action-btn danger admin-delete-teacher-btn" style="font-size:12px;padding:4px 10px;white-space:nowrap"
          data-teacher-key="${escapeHtml(entry.key||'')}"
          data-teacher-uid="${escapeHtml(teacher.uid||'')}"
          data-teacher-name="${escapeHtml(displayName)}"
          data-teacher-email="${escapeHtml(entry.email||teacher.email||'')}">🗑️ ${isEn?'Delete':'حذف'}</button>`
      : `<button type="button" class="action-btn danger admin-remove-allowlist-btn" style="font-size:12px;padding:4px 10px;white-space:nowrap"
          data-allow-key="${escapeHtml(entry.key||'')}"
          data-allow-email="${escapeHtml(entry.email||'')}">🗑️ ${isEn?'Remove':'إزالة'}</button>`;
    return `<tr>
      <td style="font-size:12px">${escapeHtml(entry.email||'—')}</td>
      <td>${escapeHtml(displayName)}</td>
      <td>${escapeHtml(subject)}</td>
      <td style="font-size:12px">${escapeHtml(grades)}</td>
      <td style="font-size:12px;color:var(--grey-3)">${regDate}</td>
      <td style="font-size:12px">${status}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
  bindAdminAllowlistButtons();
}

function bindAdminAllowlistButtons(){
  const tbody = document.getElementById('admin-allowlist-tbody');
  if(!tbody || tbody.dataset.allowBound === '1') return;
  tbody.dataset.allowBound = '1';
  tbody.addEventListener('click', e=>{
    const removeBtn = e.target.closest('.admin-remove-allowlist-btn');
    if(removeBtn){
      adminRemoveTeacherAllowlist(
        removeBtn.dataset.allowKey || '',
        removeBtn.dataset.allowEmail || ''
      );
      return;
    }
    const deleteBtn = e.target.closest('.admin-delete-teacher-btn');
    if(deleteBtn){
      adminDeleteTeacher(
        deleteBtn.dataset.teacherKey || '',
        deleteBtn.dataset.teacherUid || '',
        deleteBtn.dataset.teacherName || '',
        deleteBtn.dataset.teacherEmail || ''
      );
    }
  });
}

function bindAdminParentDeleteButtons(){
  const tbody = document.getElementById('admin-parents-tbody');
  if(!tbody || tbody.dataset.deleteBound === '1') return;
  tbody.dataset.deleteBound = '1';
  tbody.addEventListener('click', e=>{
    const btn = e.target.closest('.admin-delete-parent-btn');
    if(!btn) return;
    adminDeleteParentRegistration(
      btn.dataset.parentMid || '',
      btn.dataset.parentName || ''
    );
  });
}

async function adminLoadMonitoring(){
  const isEn = currentLang==='en';
  const allowlistBody = document.getElementById('admin-allowlist-tbody');
  const parentsBody  = document.getElementById('admin-parents-tbody');
  const missingWrap  = document.getElementById('admin-missing-coverage');
  if(!allowlistBody || !parentsBody) return;

  bindAdminAllowlistButtons();
  bindAdminParentDeleteButtons();
  await syncParentQuickLoginFromRegistry();

  if(typeof db==='undefined'){
    allowlistBody.innerHTML = `<tr><td colspan="7" class="empty-state"><p>${isEn?'Firebase not connected':'Firebase غير متصل'}</p></td></tr>`;
    parentsBody.innerHTML  = `<tr><td colspan="7" class="empty-state"><p>${isEn?'Firebase not connected':'Firebase غير متصل'}</p></td></tr>`;
    if(missingWrap) missingWrap.innerHTML = `<div class="empty-state"><p>${isEn?'Firebase not connected':'Firebase غير متصل'}</p></div>`;
    return;
  }

  allowlistBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--grey-3)">⏳</td></tr>`;
  parentsBody.innerHTML  = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--grey-3)">⏳</td></tr>`;
  if(missingWrap) missingWrap.innerHTML = `<div class="empty-state" style="padding:24px"><div class="ico">⏳</div><p>${isEn?'Loading...':'جارٍ التحميل...'}</p></div>`;

  try{
    if(!Object.keys(adminStudentsCache||{}).length){
      try{
        const stSnap = await db.ref('students').once('value');
        if(stSnap.exists()) adminStudentsCache = stSnap.val();
      }catch(e){ console.warn('adminLoadMonitoring students:', e); }
    }

    const [teachersSnap, lookupSnap, parentsSnap, allowSnap] = await Promise.all([
      db.ref('teachers').once('value'),
      db.ref('teacherLookup').once('value'),
      db.ref('registeredParents').once('value'),
      db.ref('teacherAllowlist').once('value'),
    ]);

    const uidByKey = {};
    if(lookupSnap.exists()){
      lookupSnap.forEach(child=>{
        const v = child.val();
        if(v?.key) uidByKey[v.key] = child.key;
      });
    }

    const teachers = [];
    if(teachersSnap.exists()){
      teachersSnap.forEach(child=>{
        const t = child.val();
        if(!t || t.role === 'admin') return;
        teachers.push({
          key: child.key,
          uid: t.uid || uidByKey[child.key] || '',
          ...t,
        });
      });
    }
    teachers.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));

    const teachersByKey = {};
    teachers.forEach(t=>{ teachersByKey[t.key] = t; });
    adminRenderAllowlistTable(allowSnap.exists() ? allowSnap.val() : {}, teachersByKey, isEn);

    const { missingCount } = adminRenderMissingCoverage(teachers, isEn);

    const parents = [];
    if(parentsSnap.exists()){
      parentsSnap.forEach(child=>{
        const p = child.val();
        if(p) parents.push({ mid: child.key, ...p });
      });
    }
    parents.sort((a,b)=>(b.lastLogin||'').localeCompare(a.lastLogin||''));

    if(!parents.length){
      parentsBody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="ico">👨‍👩‍👧</div><p>${isEn?'No registered parents yet':'لا يوجد أولياء أمور مسجلون بعد'}</p></td></tr>`;
    }else{
      parentsBody.innerHTML = parents.map(p=>{
        const pName = p.name || '';
        return `<tr>
        <td style="font-weight:600;text-align:right">${escapeHtml(displayStudentName(p.name, p.cls, p.section, p.mid))}</td>
        <td style="font-family:monospace;font-size:12px">${escapeHtml(p.mid||'—')}</td>
        <td>${escapeHtml(p.cls||'—')}</td>
        <td>${escapeHtml(p.section||'—')}</td>
        <td style="font-size:12px;color:var(--grey-3)">${formatAdminDate(p.registeredAt, isEn)}</td>
        <td style="font-size:12px;color:var(--grey-3)">${formatAdminDate(p.lastLogin, isEn)}</td>
        <td><button type="button" class="action-btn danger admin-delete-parent-btn" style="font-size:12px;padding:4px 10px"
          data-parent-mid="${escapeHtml(p.mid||'')}"
          data-parent-name="${escapeHtml(pName)}">🗑️ ${isEn?'Delete':'حذف'}</button></td>
      </tr>`;
      }).join('');
    }

    adminUpdateMonitorStats(teachers.length, parents.length, missingCount, isEn);
  }catch(err){
    console.error('adminLoadMonitoring', err);
    showToast(isEn ? '❌ Failed to load monitoring data' : '❌ فشل تحميل بيانات المتابعة');
    if(allowlistBody) allowlistBody.innerHTML = `<tr><td colspan="7" class="empty-state"><p>${isEn?'Load failed':'فشل التحميل'}</p></td></tr>`;
    if(parentsBody) parentsBody.innerHTML  = `<tr><td colspan="7" class="empty-state"><p>${isEn?'Load failed':'فشل التحميل'}</p></td></tr>`;
  }
}

async function adminDeleteParentRegistration(mid, studentName){
  const isEn = currentLang==='en';
  if(!mid) return;
  const label = studentName || mid;
  if(!confirm(isEn
    ? `Remove parent registration for "${label}"?\nThey will need the ministry ID again on next login.`
    : `حذف تسجيل ولي أمر "${label}"؟\nسيحتاج الرقم الوزاري مجدداً عند الدخول التالي.`)) return;
  if(typeof db==='undefined'){
    showToast(isEn ? '❌ Not connected' : '❌ غير متصل');
    return;
  }
  try{
    const snap = await db.ref('registeredParents/'+mid).once('value');
    const p = snap.val();
    const updates = {};
    updates['registeredParents/'+mid] = null;
    if(p?.name){
      const sessionKey = makeParentSessionKey(p.cls, p.section, p.name);
      updates['parentQuickLogin/'+sessionKey] = null;
    }
    await db.ref().update(updates);
    showToast(isEn ? '✅ Parent registration removed' : '✅ تم حذف تسجيل ولي الأمر');
    adminLoadMonitoring();
  }catch(err){
    console.error(err);
    showToast(isEn ? '❌ Delete failed' : '❌ فشل الحذف');
  }
}

async function adminDeleteTeacher(teacherKey, teacherUid, teacherName, teacherEmail){
  const isEn = currentLang==='en';
  if(!teacherKey){
    showToast(isEn ? '❌ Teacher not found' : '❌ المعلم غير موجود');
    return;
  }
  const label = teacherName || teacherEmail || teacherKey;
  const confirmMsg = t('adminDeleteTeacherConfirm').replace('{name}', label);
  if(!confirm(confirmMsg)) return;

  if(typeof auth === 'undefined' || !auth.currentUser){
    showToast(isEn ? '❌ Admin login required' : '❌ يجب تسجيل دخول المسؤول');
    return;
  }
  if(typeof db === 'undefined'){
    showToast(isEn ? '❌ Not connected' : '❌ غير متصل');
    return;
  }

  try{
    const fn = getCloudFunctions();
    if(fn){
      const callable = fn.httpsCallable('adminDeleteTeacher');
      await callable({ key: teacherKey, uid: teacherUid || null });
      showToast(t('adminDeleteTeacherOk'));
      adminLoadMonitoring();
      return;
    }
  }catch(e){
    console.error('adminDeleteTeacher callable', e);
    const code = e?.code || '';
    const msg = e?.message || '';
    if(code === 'functions/permission-denied'){
      showToast(isEn ? '❌ Admin permission required' : '❌ صلاحية المسؤول مطلوبة');
      return;
    }
    if(code === 'functions/unauthenticated'){
      showToast(isEn ? '❌ Session expired — log in again' : '❌ انتهت الجلسة — سجّل الدخول مجدداً');
      return;
    }
    if(code === 'functions/failed-precondition'){
      showToast(isEn ? '❌ Cannot delete your own admin account' : '❌ لا يمكن حذف حساب المسؤول الحالي');
      return;
    }
    if(code !== 'functions/not-found' && !msg.includes('NOT FOUND')){
      try{
        await adminDeleteTeacherDbOnly(teacherKey, teacherUid || null);
        showToast(isEn
          ? '✅ Teacher data deleted (login account may remain — redeploy functions for full delete)'
          : '✅ تم حذف بيانات المعلّم (قد يبقى حساب الدخول — انشر Functions للحذف الكامل)');
        adminLoadMonitoring();
        return;
      }catch(dbErr){
        console.error('adminDeleteTeacherDbOnly', dbErr);
      }
    }
    showToast(t('adminDeleteTeacherFail') + (msg ? ': ' + msg : ''));
    return;
  }

  try{
    await adminDeleteTeacherDbOnly(teacherKey, teacherUid || null);
    showToast(isEn
      ? '✅ Teacher data deleted (login account may remain — deploy functions for full delete)'
      : '✅ تم حذف بيانات المعلّم (قد يبقى حساب الدخول — انشر Functions للحذف الكامل)');
    adminLoadMonitoring();
  }catch(e){
    console.error('adminDeleteTeacherDbOnly', e);
    showToast(t('adminDeleteTeacherFail'));
  }
}

function registerParentSession(parent){
  if(typeof db==='undefined' || !parent?.mid || !parent?.name) return;
  const mid = String(parent.mid);
  const now = new Date().toISOString();
  const payload = {
    cls: parent.cls || '',
    section: parent.section || '',
    name: parent.name,
    mid,
    lastLogin: now,
  };
  const sessionKey = makeParentSessionKey(parent.cls, parent.section, parent.name);

  db.ref('registeredParents/'+mid).once('value').then(snap=>{
    const existing = snap.val() || {};
    const record = {
      ...payload,
      registeredAt: existing.registeredAt || now,
    };
    return db.ref('registeredParents/'+mid).set(record);
  }).catch(err=>{ console.warn('registerParentSession', err); });

  db.ref('parentQuickLogin/'+sessionKey).once('value').then(snap=>{
    const existing = snap.val() || {};
    const record = {
      ...payload,
      registeredAt: existing.registeredAt || now,
    };
    return db.ref('parentQuickLogin/'+sessionKey).set(record);
  }).catch(err=>{ console.warn('registerParentSession quickLogin', err); });
}

async function syncParentQuickLoginFromRegistry(){
  if(window._parentQuickLoginSynced || typeof db==='undefined' || !IS_ADMIN) return;
  window._parentQuickLoginSynced = true;
  try{
    const snap = await db.ref('registeredParents').once('value');
    if(!snap.exists()) return;
    const updates = {};
    snap.forEach(child=>{
      const p = child.val();
      if(!p?.mid || !p?.name) return;
      const sessionKey = makeParentSessionKey(p.cls, p.section, p.name);
      updates['parentQuickLogin/'+sessionKey] = {
        cls: p.cls || '',
        section: p.section || '',
        name: p.name,
        mid: String(p.mid),
        registeredAt: p.registeredAt || null,
        lastLogin: p.lastLogin || null,
      };
    });
    if(Object.keys(updates).length) await db.ref().update(updates);
  }catch(e){
    console.warn('syncParentQuickLoginFromRegistry', e);
  }
}

async function adminDeleteTeacherDbOnly(teacherKey, teacherUid){
  const updates = {};
  updates['teachers/'+teacherKey] = null;
  updates['teacherData/'+teacherKey] = null;
  updates['publicTeachers/'+teacherKey] = null;
  if(teacherUid) updates['teacherLookup/'+teacherUid] = null;
  await db.ref().update(updates);
  try{
    const complaintsSnap = await db.ref('complaints').once('value');
    if(complaintsSnap.exists()){
      const cUpdates = {};
      complaintsSnap.forEach(child=>{
        if(child.val()?.teacherKey === teacherKey) cUpdates[child.key] = null;
      });
      if(Object.keys(cUpdates).length) await db.ref('complaints').update(cUpdates);
    }
  }catch(e){ console.warn('adminDeleteTeacherDbOnly complaints', e); }
}

function initDashboard(){
  try { refreshGradeDropdowns(); } catch(e){ console.error('refreshGradeDropdowns:',e); }
  try { renderOverview(); }      catch(e){ console.error('renderOverview:',e); }
  try { renderAnalysisTab(); }   catch(e){ console.error('renderAnalysisTab:',e); }
  try { renderGradesTab(); }     catch(e){ console.error('renderGradesTab:',e); }
  try { renderPinsTab(); }       catch(e){ console.error('renderPinsTab:',e); }
  try { renderBehaviorTab(); }   catch(e){ console.error('renderBehaviorTab:',e); }
  try { renderLinksTab(); }      catch(e){ console.error('renderLinksTab:',e); }
  try { renderSavedMessages(); } catch(e){ console.error('renderSavedMessages:',e); }
  try { renderParentInbox(); }   catch(e){ console.error('renderParentInbox:',e); }
  try {
    const su = document.getElementById('site-url-display');
    if(su) su.textContent = APP.siteUrl;
    const si = document.getElementById('site-url-input');
    if(si) si.value = APP.siteUrl;
  } catch(e){}
  try { updateInboxBadge(); } catch(e){}
  try { updateTeacherComplaintsBadge(); } catch(e){}
}
function renderOverview(){
  const cls=document.getElementById('class-filter')?.value||'';
  const sec=document.getElementById('sec-filter')?.value||'';
  const list=getImportedGradeStudents(cls, sec);
  const tbody = document.getElementById('overview-tbody');
  if(!tbody) return;

  document.getElementById('stat-total').textContent=list.length || '0';
  document.getElementById('stat-pass').textContent=list.filter(s=>(s.total||0)>=80).length;
  document.getElementById('stat-low').textContent=list.filter(s=>(s.total||0)<70&&(s.total||0)>0).length;
  const avg=list.length?(list.reduce((a,s)=>a+(s.total||0),0)/list.length).toFixed(1):'—';
  document.getElementById('stat-avg').textContent=avg==='—'?'—':avg+'%';

  if(!list.length){
    tbody.innerHTML = gradesUploadEmptyRow(13);
    return;
  }

  tbody.innerHTML=list.map((s,i)=>{
    const tot=(s.total||0); const c=tot>=80?'#1a9a9a':tot>=70?'#c8961e':'#e53935';
    const diag=(s.diagnostic||0);
    const t1=(s.t1||0),t2=(s.t2||0),hw=(s.hw||0),portal=(s.portal||0),
          activity=(s.activity||0),total=(s.total||0),lab=(s.lab||0),finalG=(s.final||0);
    const secLbl=s.section?` <span style="font-size:11px;color:var(--grey-3)">${s.section}</span>`:'';
    return `<tr>
      <td>${i+1}</td>
      <td><span class="badge badge-teal">${s.cls}</span>${secLbl}</td>
      <td style="text-align:right;font-weight:500">${displayStudentName(s, s.cls || cls, s.section, s.mid)}</td>
      <td>${diag ? diag.toFixed(1) : '—'}</td>
      <td>${t1.toFixed(1)}</td><td>${t2.toFixed(1)}</td>
      <td>${hw.toFixed(1)}%${bar(hw)}</td>
      <td>${portal.toFixed(1)}%${bar(portal)}</td>
      <td>${activity}%${bar(activity,'#c8961e')}</td>
      <td>${lab || '—'}</td>
      <td><strong>${total.toFixed(1)}</strong>${bar(total,c)}</td>
      <td>${finalG ? finalG.toFixed(1) : '—'}</td>
      <td>${gradeBadge(total)}</td>
    </tr>`;
  }).join('');
}
function renderGradesTableHead(){
  const thead = document.getElementById('grades-thead');
  if(!thead) return;
  const isEn = currentLang==='en';
  const wk = n => isEn ? `W${n}` : `أ${n}`;
  const weeks = n => Array.from({length:GRADE_WEEK_COUNT}, (_,i)=>`<th class="grp-${n}">${wk(i+1)}</th>`).join('');
  thead.innerHTML = `<tr>
    <th rowspan="2">#</th>
    <th rowspan="2" class="name-cell">${isEn?'Name':'الاسم'}</th>
    <th rowspan="2">${isEn?'Diag.':'تشخيص'}</th>
    <th rowspan="2">${isEn?'F1':'ت1'}</th>
    <th rowspan="2">${isEn?'F2':'ت2'}</th>
    <th colspan="${GRADE_WEEK_COUNT}" class="grp-hw">${isEn?'Homework':'الواجبات'}</th>
    <th colspan="${GRADE_WEEK_COUNT}" class="grp-portal">${isEn?'Portal LMS':'بوابة LMS'}</th>
    <th colspan="${GRADE_WEEK_COUNT}" class="grp-act">${isEn?'Participation':'المشاركة'}</th>
    <th rowspan="2">LAB</th>
    <th rowspan="2">${isEn?'Total':'المحصلة'}</th>
    <th rowspan="2">${isEn?'Final':'نهائي'}</th>
    <th rowspan="2">${isEn?'Grade':'التقدير'}</th>
  </tr><tr>${weeks('hw')}${weeks('portal')}${weeks('act')}</tr>`;
}
function formatWeekCell(v){
  if(v == null || v === '') return '—';
  const n = parseFloat(v);
  if(isNaN(n)) return '—';
  return n <= 1 ? (n * 100).toFixed(0) : n.toFixed(0);
}
function renderGradesTab(){
  renderGradesTableHead();
  const cls=document.getElementById('grades-class')?.value||'';
  const sec=document.getElementById('grades-sec')?.value||'';
  const isEn = currentLang==='en';
  const tbody = document.getElementById('grades-tbody');
  const gradeCols = 5 + GRADE_WEEK_COUNT * 3 + 4;
  document.getElementById('grades-title').textContent = isEn
    ? `📝 Grades - Grade ${cls}${sec?' · Sec '+sec:''}`
    : `📝 درجات الصف ${cls}${sec?' · شعبة '+sec:''}`;
  const students = getImportedGradeStudents(cls, sec);
  const weekCells = (arr)=> Array.from({length:GRADE_WEEK_COUNT}, (_,i)=>`<td>${formatWeekCell(arr?.[i])}</td>`).join('');

  if(!students.length){
    if(tbody) tbody.innerHTML = gradesUploadEmptyRow(gradeCols);
    return;
  }

  const rows = students.map((s,i)=>{
    const c=s.total>=80?'#1a9a9a':s.total>=70?'#c8961e':'#e53935';
    const displayName = displayStudentName(s, cls, s.section, s.mid);
    return `<tr>
      <td>${i+1}</td>
      <td class="name-cell">${displayName}</td>
      <td>${(s.diagnostic||0) ? s.diagnostic.toFixed(1) : '—'}</td>
      <td>${(s.t1||0).toFixed(1)}</td><td>${(s.t2||0).toFixed(1)}</td>
      ${weekCells(s.hwWeeks)}
      ${weekCells(s.portalWeeks)}
      ${weekCells(s.actWeeks)}
      <td>${s.lab ?? '—'}</td>
      <td><strong style="color:${c}">${(s.total||0).toFixed(1)}</strong></td>
      <td>${(s.final||0) ? s.final.toFixed(1) : '—'}</td>
      <td>${gradeBadge(s.total)}</td>
    </tr>`;
  }).join('');

  const avg = f=>( students.reduce((a,s)=>a+(s[f]||0),0)/students.length ).toFixed(1);
  const avgWeek = key=>{
    const sums = Array(GRADE_WEEK_COUNT).fill(0);
    const counts = Array(GRADE_WEEK_COUNT).fill(0);
    students.forEach(s=>{
      (s[key]||[]).forEach((v,i)=>{
        if(v != null && !isNaN(v)){ sums[i]+=v; counts[i]++; }
      });
    });
    return sums.map((s,i)=> counts[i] ? `<td>${formatWeekCell(s/counts[i])}</td>` : '<td>—</td>').join('');
  };
  const avgTotal = parseFloat(avg('total'));
  const avgColor = avgTotal>=80?'#1a9a9a':avgTotal>=70?'#c8961e':'#e53935';
  const avgLabel = isEn?'Class Average':'المتوسط';
  if(tbody){
    tbody.innerHTML = rows + `<tr class="avg-row">
      <td>—</td><td class="name-cell">${avgLabel}</td>
      <td>—</td>
      <td>${avg('t1')}</td><td>${avg('t2')}</td>
      ${avgWeek('hwWeeks')}
      ${avgWeek('portalWeeks')}
      ${avgWeek('actWeeks')}
      <td>—</td>
      <td style="color:${avgColor}">${avg('total')}</td>
      <td>—</td>
      <td>—</td>
    </tr>`;
  }
}

// ══════════════════════════════════════════════════
//  PIN MANAGEMENT
// ══════════════════════════════════════════════════
function renderPinsTab(){
  const cls=document.getElementById('pins-class')?.value||'';
  const sec=document.getElementById('pins-sec')?.value||'';
  const isEn = currentLang==='en';
  document.getElementById('pins-tbody').innerHTML=((getFilteredStudents()[cls])||[]).filter(s=>!sec||s.section===sec).map((s,i)=>{
    const key=cls+'|'+s.name;
    const pin = s.mid;
    APP.pins[key] = pin;
    const displayName = displayStudentName(s, cls, s.section, s.mid);
    return `<tr>
      <td>${i+1}</td>
      <td style="text-align:${isEn?'left':'right'};font-weight:500">${displayName}</td>
      <td style="text-align:center">
        <code style="font-size:13px;font-weight:700;color:var(--teal-dark);cursor:pointer" onclick="copyPin('${pin}','${s.name}')" title="${isEn?'Click to copy':'انقر للنسخ'}">${pin}</code>
      </td>
      <td>
        <button class="action-btn copy" onclick="copyPin('${pin}','${s.name}')">${isEn?'📋 Copy':'📋 نسخ'}</button>
      </td>
    </tr>`;
  }).join('');
}
function editPin(i){
  document.getElementById('pin-input-'+i).style.display='inline-block';
  document.getElementById('pin-btn-'+i).style.display='none';
  document.getElementById('pin-input-'+i).focus();
  document.getElementById('pin-input-'+i).select();
}

function copyPin(pin,name){
  navigator.clipboard.writeText(pin).then(()=>showToast(`📋 تم نسخ رمز ${name}`));
}
function copyAllPins(){
  const cls=document.getElementById('pins-class').value;
  const text=(getGradeStudents(cls)||[]).map(s=>{
    const pin=APP.pins[cls+'|'+s.name]||'—';
    return `${s.name} — PIN: ${pin}`;
  }).join('\n');
  navigator.clipboard.writeText(text).then(()=>showToast('✅ تم نسخ جميع الرموز'));
}
function regeneratePins(){
  if(!confirm('سيتم توليد رموز جديدة للشعبة المحددة. هل أنت متأكد؟')) return;
  const cls=document.getElementById('pins-class').value;
  ((getFilteredStudents()[cls])||[]).forEach(s=>{ APP.pins[cls+'|'+s.name]=genPin(); });
  saveState();
  if(window.saveToFirebase) window.saveToFirebase();
  renderPinsTab(); showToast('🔄 تم توليد رموز جديدة على كل الأجهزة');
}

// ══════════════════════════════════════════════════
//  LINKS TAB
// ══════════════════════════════════════════════════
function renderLinksTab(){
  const cls=document.getElementById('links-class')?.value||'';
  const sec=document.getElementById('links-sec')?.value||'';
  const isEn = currentLang==='en';
  document.getElementById('links-tbody').innerHTML=((getFilteredStudents()[cls])||[]).filter(s=>!sec||s.section===sec).map((s,i)=>{
    const pin = s.mid;
    const displayName = displayStudentName(s, cls, s.section, s.mid);
    return `<tr>
      <td>${i+1}</td>
      <td style="text-align:${isEn?'left':'right'};font-weight:500">${displayName}</td>
      <td><code style="font-size:12px;color:var(--teal-dark)">${pin}</code></td>
      <td>
        <button class="action-btn wa" onclick="sendWA('${cls}','${s.name}','${pin}')">${isEn?"📱 WhatsApp":"📱 واتساب"}</button>
        <button class="action-btn copy" onclick="copyWAMsg('${cls}','${s.name}','${pin}')">${isEn?"📋 Copy":"📋 نسخ"}</button>
      </td>
    </tr>`;
  }).join('');
}
function buildWAMsg(cls, name, pin){
  const url = APP.siteUrl;
  return `السلام عليكم ولي أمر الطالب ${name} 👋\n\nيمكنكم الاطلاع على التقرير الأكاديمي لابنكم عبر الرابط:\n${url}\n\nطريقة الدخول:\n1️⃣ اختر (ولي الأمر)\n2️⃣ اختر الشعبة: ${cls}\n3️⃣ اختر اسم ابنك\n4️⃣ أدخل الرقم الوزاري: *${pin}*\n\n— معلم العلوم · الصف السابع`;
}
function sendWA(cls,name,pin){
  window.open('https://wa.me/?text='+encodeURIComponent(buildWAMsg(cls,name,pin)),'_blank');
}
function copyWAMsg(cls,name,pin){
  navigator.clipboard.writeText(buildWAMsg(cls,name,pin)).then(()=>showToast('✅ تم نسخ الرسالة'));
}
function copyAllWA(){
  const cls=document.getElementById('links-class').value;
  const text=(getGradeStudents(cls)||[]).map(s=>buildWAMsg(cls,s.name,s.mid)).join('\n\n────────────\n\n');
  navigator.clipboard.writeText(text).then(()=>showToast('✅ تم نسخ جميع الرسائل'));
}

// ══════════════════════════════════════════════════
//  MESSAGES
// ══════════════════════════════════════════════════
function populateMsgStudents(){
  const cls = document.getElementById('msg-class')?.value||'';
  const sec = document.getElementById('msg-sec')?.value||'';
  const sel = document.getElementById('msg-student');
  if(!sel) return;
  const isEn = currentLang==='en';
  const ph = isEn?'— Select Student —':'— اختر طالباً —';
  sel.innerHTML = `<option value="">${ph}</option>`;
  if(!cls) return;

  const gradeStudents = getFilteredStudents()[cls]||[];
  // Filter by section if selected
  const students = sec ? gradeStudents.filter(s=>s.section===sec) : gradeStudents;
  students.forEach(s=>{
    const o = document.createElement('option');
    o.value = s.name;
    o.textContent = displayStudentName(s, cls, s.section, s.mid);
    sel.appendChild(o);
  });
}

const TPLS={
  p1:'أود إبلاغكم بأن ابنكم أبدى أداءً متميزاً خلال هذا الأسبوع وحقق درجة ممتازة. نحن نشجعه ونأمل مواصلة هذا التميز.',
  p2:'يسعدني إبلاغكم بأن ابنكم أظهر تحسناً ملحوظاً في مستواه الأكاديمي. جهوده تؤتي ثمارها ونشكركم على متابعتكم.',
  w1:'أود لفت انتباهكم إلى أن ابنكم لم يُسلّم عدداً من الواجبات المنزلية. يرجى تشجيعه على الالتزام.',
  w2:'نودّ إبلاغكم بانخفاض في درجات ابنكم الأخيرة. نقترح مراجعة الدروس ومتابعة تحضيره اليومي.',
  w3:'نلاحظ قلة في مشاركة ابنكم داخل الفصل. التشجيع على المشاركة يساعد في تعزيز فهمه للمادة.'
};
function setTpl(k){ document.getElementById('msg-body').value=TPLS[k]; }

// Get current teacher's Firebase key (always reliable)
function getTeacherKey(){
  if(!CURRENT_TEACHER) return '';
  if(CURRENT_TEACHER._key) return CURRENT_TEACHER._key;
  if(CURRENT_TEACHER.email) return emailKey(CURRENT_TEACHER.email);
  if(CURRENT_TEACHER.isAdmin) return 'emad_school_ae';
  return '';
}
function saveMessage(){
  const cls  = document.getElementById('msg-class')?.value||'';
  const sec  = document.getElementById('msg-sec')?.value||'';
  const name = document.getElementById('msg-student')?.value||'';
  const body = document.getElementById('msg-body')?.value?.trim()||'';
  const type = document.getElementById('msg-type')?.value||'info';
  if(!cls||!name||!body){
    showToast(currentLang==='en'?'⚠️ Fill all fields':'⚠️ اختر الشعبة والطالب وأدخل نص الرسالة');
    return;
  }
  const d = new Date();
  const msg = {
    cls, name, type, body,
    date: d.toLocaleDateString('ar-AE')+' '+d.toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit'}),
    ts: d.toISOString()
  };
  const key = getTeacherKey();
  if(typeof db!=='undefined' && key){
    window.fbPushMsg(key, msg).catch(()=>{});
    // listener will update APP.messages automatically
  } else {
    APP.messages.push(msg); saveState(); renderSavedMessages();
  }
  document.getElementById('msg-body').value='';
  showToast(currentLang==='en'?'✅ Message sent':'✅ تم إرسال الرسالة لولي الأمر');
}



function deleteSingleTeacherMsg(id){
  APP.messages = APP.messages.filter(m=>m.id!==id);
  saveState(); renderSavedMessages();
  const key = getTeacherKey();
  if(typeof db!=='undefined' && key){
    window.fbDeleteMsg(key, id)
      .then(()=>showToast('✅ تم حذف الرسالة'))
      .catch(()=>showToast('⚠️ حُذف محلياً'));
  } else showToast('✅ تم الحذف');
}


function renderSavedMessages(){
  const wrap=document.getElementById('saved-messages');
  if(!wrap) return;
  if(!APP.messages.length){ wrap.innerHTML='<div class="empty-state"><div class="ico">📭</div><p>'+t('noMessages')+'</p></div>'; return; }
  const icons={praise:'🌟',warning:'⚠️',info:'📘'};
  const labels={praise:t('praiseMsg'),warning:t('warningMsg'),info:t('infoMsg')};
  wrap.innerHTML=[...APP.messages].reverse().map(m=>`
    <div class="msg-card">
      <div class="msg-header">
        <span class="msg-type ${m.type}">${icons[m.type]} ${labels[m.type]} · ${m.name} (ش${m.cls})</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="msg-date">${m.date||m.ts||''}</span>
          ${m.id ? `<button class="action-btn danger" style="padding:2px 8px;font-size:11px" onclick="deleteSingleTeacherMsg('${m.id}')">🗑️</button>` : ''}
        </span>
      </div><p>${m.body}</p>
    </div>`).join('');
}

// ══════════════════════════════════════════════════
//  PARENT VIEW
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
//  BEHAVIOR TAB
// ══════════════════════════════════════════════════
const BEHAVIOR_LEVELS_AR = {
  5:{label:'ممتاز — سلوك مثالي',icon:'🌟',css:'lvl-5',badge:'bv-5'},
  4:{label:'جيد جداً — سلوك إيجابي',icon:'😊',css:'lvl-4',badge:'bv-4'},
  3:{label:'جيد — سلوك مقبول',icon:'🙂',css:'lvl-3',badge:'bv-3'},
  2:{label:'يحتاج تحسين',icon:'⚠️',css:'lvl-2',badge:'bv-2'},
  1:{label:'ضعيف — يستدعي المتابعة',icon:'🔴',css:'lvl-1',badge:'bv-1'}
};
const BEHAVIOR_LEVELS_EN = {
  5:{label:'Excellent — Ideal Behavior',icon:'🌟',css:'lvl-5',badge:'bv-5'},
  4:{label:'Very Good — Positive',icon:'😊',css:'lvl-4',badge:'bv-4'},
  3:{label:'Good — Acceptable',icon:'🙂',css:'lvl-3',badge:'bv-3'},
  2:{label:'Needs Improvement',icon:'⚠️',css:'lvl-2',badge:'bv-2'},
  1:{label:'Weak — Requires Follow-up',icon:'🔴',css:'lvl-1',badge:'bv-1'}
};
function getBehaviorLevel(level){
  return (currentLang==='en' ? BEHAVIOR_LEVELS_EN : BEHAVIOR_LEVELS_AR)[level]
      || (currentLang==='en' ? BEHAVIOR_LEVELS_EN : BEHAVIOR_LEVELS_AR)[5];
}
const BEHAVIOR_LEVELS = BEHAVIOR_LEVELS_AR; // backward compat



function updateBvStyle(sel){
  sel.className='behavior-select lvl-'+sel.value;
}



function savePinEdit(cls,name,i){
  const val=document.getElementById('pin-input-'+i).value.replace(/\D/g,'');
  if(val.length===4){
    APP.pins[cls+'|'+name]=val;
    saveState();
    // مزامنة PIN مع Firebase
    if(window.saveToFirebase) window.saveToFirebase();
    showToast('✅ تم حفظ الرمز الجديد على كل الأجهزة');
  } else {
    showToast('⚠️ الرمز يجب أن يكون 4 أرقام');
  }
  document.getElementById('pin-input-'+i).style.display='none';
  document.getElementById('pin-btn-'+i).style.display='inline-block';
  renderPinsTab();
}

// ══════════════════════════════════════════════════
//  PARENT VIEW
// ══════════════════════════════════════════════════
function generateReport(student, cls, rank, total, classSize){
  const tot=student.total;
  const name=displayStudentName(student).split(' ')[0];
  const isEn = currentLang==='en';
  let lines=[];

  if(isEn){
    // English report
    if(tot>=90) lines.push(`${name} demonstrates an excellent academic level with a final score of ${tot.toFixed(1)}%, reflecting strong commitment and deep understanding.`);
    else if(tot>=80) lines.push(`${name} achieved a very good level with a score of ${tot.toFixed(1)}%, showing clear effort and good understanding of the subject.`);
    else if(tot>=70) lines.push(`${name} achieved a good academic level with ${tot.toFixed(1)}%, indicating a satisfactory understanding with room for growth.`);
    else if(tot>=60) lines.push(`${name} achieved an acceptable level with ${tot.toFixed(1)}%. Consistent daily practice is recommended to improve.`);
    else lines.push(`${name} needs significant support. The score of ${tot.toFixed(1)}% requires immediate attention and regular follow-up.`);

    lines.push(`${name} is ranked ${rank} out of ${classSize} students in the class.`);

    if(student.t1>=85&&student.t2>=85) lines.push(`Outstanding performance in both formative assessments (${student.t1}% and ${student.t2}%), showing consistent understanding.`);
    else if(student.t1<60||student.t2<60) lines.push(`Performance in formative assessments needs improvement (${student.t1}% and ${student.t2}%). Regular revision is recommended.`);
    else lines.push(`Formative assessment scores: Formative 1: ${student.t1}%, Formative 2: ${student.t2}%.`);

    if(student.hw<60) lines.push(`Homework completion rate is low (${student.hw}%). Daily follow-up on assignments is strongly recommended.`);
    else if(student.hw>=80) lines.push(`Homework completion rate is excellent (${student.hw}%), reflecting great responsibility and commitment.`);

    if(student.portal>=80) lines.push(`Portal test performance is good (${student.portal}%). Weekly review sessions are recommended to maintain this level.`);
    else lines.push(`Portal test performance needs attention (${student.portal}%). Regular weekly reviews are recommended.`);

    if(student.activity>=80) lines.push(`Class participation level is good (${student.activity}%).`);
    else lines.push(`Class participation level is acceptable (${student.activity}%), and can be improved by encouraging greater contribution.`);

  } else {
    // Arabic report (original)
    if(tot>=90) lines.push(`يتميز ${name} بمستوى أكاديمي ممتاز، إذ حقق محصلة نهائية بلغت ${tot.toFixed(1)}% مما يعكس التزامه الجاد واستيعابه العميق للمادة.`);
    else if(tot>=80) lines.push(`حقق ${name} مستوى جيد جداً بمحصلة ${tot.toFixed(1)}%، وهو أداء يدل على فهم جيد للمادة وجهد واضح.`);
    else if(tot>=70) lines.push(`أظهر ${name} مستوى أكاديمياً جيداً بمحصلة ${tot.toFixed(1)}%، مما يدل على استيعاب مقبول مع وجود مجال للتطور.`);
    else if(tot>=60) lines.push(`حقق ${name} مستوى مقبولاً بمحصلة ${tot.toFixed(1)}%، ويُنصح بالمثابرة اليومية على المذاكرة لرفع هذا المستوى.`);
    else lines.push(`يحتاج ${name} إلى دعم ومتابعة مكثفة، إذ بلغت محصلته ${tot.toFixed(1)}% مما يستدعي تدخلاً فورياً وعناية خاصة.`);

    lines.push(`يحتل الترتيب رقم ${rank} من أصل ${classSize} طالباً في شعبته.`);

    if(student.t1>=85&&student.t2>=85) lines.push(`سجّل أداءً ممتازاً في الاختبارين التكوينيين (${student.t1}% و${student.t2}%)، مما يدل على ثبات في الفهم والاستيعاب.`);
    else if(student.t1<60||student.t2<60) lines.push(`أداؤه في الاختبارات التكوينية يحتاج تحسيناً (${student.t1}% و${student.t2}%)، ويُنصح بالمراجعة المنتظمة.`);
    else lines.push(`أداؤه في الاختبارات التكوينية: الأول ${student.t1}%، الثاني ${student.t2}%.`);

    if(student.hw<60) lines.push(`نسبة إنجاز الواجبات منخفضة (${student.hw}%)، ويُنصح بمتابعة يومية منتظمة لإنجاز الواجبات.`);
    else if(student.hw>=80) lines.push(`نسبة إنجاز الواجبات ممتازة (${student.hw}%)، وتعكس إحساساً عالياً بالمسؤولية والالتزام.`);

    if(student.portal>=80) lines.push(`أداؤه في اختبارات البوابة جيد (${student.portal}%)، ويُنصح بالمراجعة الأسبوعية المنتظمة لرفع هذا المستوى.`);
    else lines.push(`أداؤه في اختبارات البوابة يحتاج اهتماماً (${student.portal}%)، ويُنصح بجلسات مراجعة أسبوعية منتظمة.`);

    if(student.activity>=80) lines.push(`مستوى مشاركته الصفية مقبول (${student.activity}%).`);
    else lines.push(`مستوى مشاركته الصفية مقبول (${student.activity}%)، ويمكن تعزيزها بتشجيعه على التعبير عن أفكاره بثقة أكبر.`);
  }

  return lines.join(' ');
}

// ══════════════════════════════════════════════════
//  نظام الترجمة — كامل التطبيق
// ══════════════════════════════════════════════════
const TRANSLATIONS = {
  ar: {
    // Login screen
    appTitle: 'بوابة المتابعة',
    schoolName: 'مدرسة محمد بن حمد الشرقي للحلقة الثانية - بنين',
    tabTeacher: '👨‍🏫 المعلم',
    tabParent: '👨‍👦 ولي الأمر',
    teacherPwLabel: 'كلمة مرور المعلم',
    teacherLoginBtn: 'دخول لوحة المعلم',
    selectClass: 'اختر الشعبة',
    selectStudent: 'اختر اسم الطالب',
    nextBtn: 'التالي ←',
    // Locked screen
    enterPin: 'أدخل رقمك الوزاري للدخول',
    pinError: 'الرقم الوزاري غير صحيح — يرجى المحاولة مرة أخرى',
    loginBtn: 'دخول ←',
    backBtn: '→ رجوع',
    // Parent screen
    logout: '→ تسجيل خروج',
    parentLogout: '→ تسجيل خروج',
    outbox: '📤 صندوق صادر',
    inbox: '📥 رسائل المعلم',
    bvlog: '📋 سجل السلوك',
    sendMsgTitle: '📩 أرسل رسالة للمعلم',
    sendMsgSub: 'اختر موضوعاً أو اكتب رسالتك',
    sendBtn: 'إرسال الرسالة ←',
    msgConfirm: '✅ تم إرسال رسالتك للمعلم بنجاح',
    msgPlaceholder: 'أو اكتب رسالتك هنا...',
    q1: 'استفساري عن درجات ابني الأخيرة',
    q2: 'أود الاطلاع على وضع ابني السلوكي داخل الصف',
    q3: 'أود تحديد موعد لزيارة المدرسة والحديث مع المعلم',
    q4: 'ابني يواجه صعوبة في المادة ويحتاج مساعدة إضافية',
    q5: 'أود الاطلاع على الواجبات المطلوبة هذا الأسبوع',
    q6: 'شكراً على المتابعة والاهتمام بابني',
    q1l: '📊 استفسار عن الدرجات',
    q2l: '🧑‍🎓 وضع السلوك',
    q3l: '📅 طلب موعد زيارة',
    q4l: '📚 طلب دعم إضافي',
    q5l: '📝 الواجبات المطلوبة',
    q6l: '🙏 شكر وتقدير',
    classLabel: 'الشعبة',
    scienceGrade: 'علوم الصف السابع',
    rankLabel: 'الترتيب في الشعبة',
    rankFrom: 'من أصل',
    rankStudents: 'طالباً',
    t1: 'التكويني الأول',
    t2: 'التكويني الثاني',
    hw: 'الواجبات / الكتاب',
    portal: 'اختبارات البوابة',
    activity: 'النشاط الصفي',
    lab: 'المختبر',
    reportCardTitle: '📋 التقرير الأكاديمي المفصل',
    generalBehavior: '🧑‍🎓 السلوك العام',
    academicBar: '📊 الأكاديمي',
    remaining: '📉 متبقي',
    conductNotes: '🤝 ملاحظات سلوكية',
    noConduct: 'لا توجد ملاحظات سلوكية حتى الآن.',
    noAcademic: 'لا توجد ملاحظات أكاديمية حتى الآن.',
    teacherMsg: 'رسائل من المعلم',
    praiseType: '🌟 مدح وتشجيع',
    warningType: '⚠️ تنبيه تقصير',
    infoType: '📘 معلومة عامة',
    noMessages: 'لا توجد رسائل من المعلم بعد',
    violationsTitle: '📋 المخالفات',
    noViolationsLog: 'لا توجد مخالفات مسجّلة',
    bvLevelTitle: 'مستوى سجل السلوك الحالي حتى تاريخ',
    bvLevelLabel: 'وضع مستوى السلوك',
    noViolations: 'لا مخالفات',
    oneViolation: 'مخالفة واحدة',
    violations: 'مخالفات',
    goodBehavior: 'سلوك جيد',
    violationsLabel: 'مخالفة من أصل',
    log: 'سجل',
    academicStatus: '📖 الوضع الأكاديمي',
    notifEnabled: '🔔 الإشعارات مفعّلة ✅',
    notifDenied: '🔕 الإشعارات مرفوضة — فعّلها من إعدادات المتصفح',
    notifBtn: '🔔 فعّل الإشعارات — تنبيه فوري عند وصول رسالة',
    footer: 'مدرسة محمد بن حمد الشرقي حلقة ثانية - بنين',
    newMsgAlert: '📩 وصلت رسالة جديدة من المعلم!',
    viewMsg: 'عرض الرسالة ←',
    loading: 'جارٍ التحميل...',
    teacherPwPlaceholder: 'أدخل كلمة المرور',
    clsOption1: 'الشعبة 1', clsOption2: 'الشعبة 2',
    clsOption4: 'الشعبة 4', clsOption5: 'الشعبة 5',
    clsPlaceholder: 'اختر الشعبة —',
    namePlaceholder: '— اختر الاسم —',
    clsError: 'الشعبة أو الاسم غير صحيح',
    pwError: 'كلمة المرور غير صحيحة',
    nextBtnTxt: 'التالي ←',
    clsLabel: 'اختر الشعبة',
    nameLabel: 'اختر اسم الطالب',
    notFound: 'لم يتم العثور على البيانات',
    teacherSchool: 'محمد بن حمد الشرقي للحلقة الثانية -بنين',
    teacherName: '—',
    connecting: '🔴 جارٍ الاتصال...',
    connected: '🟢 متصل',
    updateExcel: '📂 تحديث الدرجات',
    updateExcelLbl: 'تحديث الدرجات',
    refreshLbl: 'تحديث',
    settingsLbl: 'الإعدادات',
    exportExcel: '📤 تصدير Excel',
    logout: 'خروج',
    tabOverview: '📊 نظرة عامة',
    tabAnalysis: '📈 تحليل النتائج',
    tabGrades: '📝 الدرجات',
    tabPins: '🔑 الرموز السرية',
    tabBehavior: '🧑‍🎓 السلوك',
    tabMessages: '💬 الرسائل',
    tabComplaints: '📢 صندوق الشكاوى',
    tabShare: '🔗 مشاركة',
    tabSettings: '⚙️ الإعدادات',
    filterLabel: 'فلتر:',
    allClasses: 'الكل',
    totalStudents: 'إجمالي الطلاب',
    above80: 'فوق 80%',
    below70: 'دون 70%',
    classAvg: 'المتوسط العام',
    studentName: 'اسم الطالب',
    gradeLabel: 'التقدير',
    actionLabel: 'إجراء',
    rise: '📈 تحسن',
    fall: '📉 انخفاض',
    excellent: '⭐ تفوق',
    classLabel2: 'الشعبة:',
    search: '🔍 ابحث...',
    t1Label: 'تك1',
    t2Label: 'تك2',
    hwLabel: 'واجبات%',
    portalLabel: 'بوابة%',
    activityLabel: 'نشاط%',
    labLabel: 'مختبر',
    totalLabel: 'المحصلة',
    gradeLabel2: 'التقدير',
    avgLabel: 'المتوسط',
    behaviorHelp: '🧑‍🎓 اختر الطالب وأدخل الملاحظة — تُرسل فوراً لولي الأمر وتُحفظ في السجل التاريخي.',
    addNote: '➕ إضافة ملاحظة جديدة',
    studentLabel: 'الطالب',
    violationType: 'نوع المخالفة السلوكية',
    academicNote: 'الملاحظة الأكاديمية',
    conductNote: 'ملاحظة سلوكية إضافية (اختياري)',
    academicPlaceholder: 'مثال: لم يُسلّم الواجب...',
    conductPlaceholder: 'أي تفاصيل إضافية...',
    saveAndSend: '💾 حفظ وإرسال لولي الأمر',
    behaviorLogTitle: '📋 سجل الملاحظات',
    clearAll: '🗑️ مسح الكل',
    analyze: '📊 تحليل',
    dateLabel: 'التاريخ',
    classLabel3: 'الشعبة',
    violationLabel: 'المخالفة',
    academicNoteLabel: 'الملاحظة الأكاديمية',
    conductNoteLabel: 'ملاحظة سلوكية',
    sendMsgToParent: '📩 إرسال رسالة لولي أمر',
    selectStudent: 'اختر طالباً —',
    msgType: 'نوع الرسالة',
    praiseMsg: '🌟 مدح وتشجيع',
    warningMsg: '⚠️ تنبيه تقصير',
    infoMsg: '📘 معلومة عامة',
    msgBody: 'نص الرسالة',
    msgBodyPH: 'اكتب الرسالة...',
    saveMsg: '💾 حفظ الرسالة',
    savedMessages: '📬 الرسائل المحفوظة',
    parentInbox: '📥 رسائل واردة من أولياء الأمور',
    noMessages: 'لا توجد رسائل بعد',
    noInbox: 'لا توجد رسائل واردة بعد',
    pinsTitle: '🔑 نظام الرقم الوزاري كرمز دخول',
    pinsHelp: 'رمز دخول كل طالب هو رقمه الوزاري.',
    pinsNote: 'وزّع كل رمز على ولي الأمر المعني.',
    copyAll: '📋 نسخ كل الرموز',
    generateNew: '🔄 توليد رموز جديدة',
    idLabel: 'الرقم الوزاري (رمز الدخول)',
    shareTitle: '🔗 مشاركة أولياء الأمور',
    shareMethod: 'طريقة المشاركة مع أولياء الأمور:',
    shareHelp: 'ولي الأمر يختار الشعبة ← اسم ابنه ← يدخل الرمز ← يرى بيانات ابنه.',
    appLink: 'رابط التطبيق:',
    copyWhatsapp: '📋 نسخ رسائل واتساب للكل',
    preview: '👁️ معاينة',
    settingsTitle: '⚙️ الإعدادات',
    reportTitle: '📊 تقرير متابعة أكاديمي',
    splashTitle: 'فخورين بالإمارات',
    splashSub: 'Proud of the UAE',
    splashFlagAlt: 'علم دولة الإمارات العربية المتحدة',
    tabAdmin: '⚙️ المسؤول',
    adminLoginTitle: 'دخول المسؤول',
    adminLoginSub: 'صلاحيات كاملة لإدارة البيانات',
    adminEmailLabel: 'البريد الإلكتروني',
    adminPwLabel: 'كلمة المرور',
    adminLoginBtn: '🔐 دخول لوحة المسؤول',
    adminEmailPH: 'admin@school.ae',
    regNamePH: 'الاسم الكامل',
    regPwPH: '8 أحرف على الأقل',
    regPw2PH: 'أعد إدخال كلمة المرور',
    regGradesSections: 'الصفوف والشعب (اختر شعب كل صف على حدى)',
    regSubApproved: 'التسجيل متاح فقط للمعلّمين الذين أضاف مسؤول المدرسة بريدهم مسبقاً',
    parentSecPH: '— اختر الشعبة —',
    parentGradePH: '— اختر الصف —',
    clsErrorMsg: 'الصف أو الشعبة أو الاسم غير صحيح',
    pinPH: 'أدخل الرقم الوزاري (حتى 12 رقم)',
    pinBack: '← العودة',
    pinErrorMsg: 'الرقم الوزاري غير صحيح — يرجى المحاولة مرة أخرى',
    bannerAlt: 'بوابة المتابعة الرقمية',
    adminSchoolName: 'لوحة المسؤول — بوابة المتابعة',
    adminSub: 'إدارة بيانات الطلاب',
    adminLogout: 'خروج',
    adminTabUpload: '📋 رفع قوائم الطلبة',
    adminTabMonitor: '📊 المتابعة',
    adminUploadTitle: '📤 رفع قائمة الطلاب',
    adminStudentsTitle: '👥 الطلاب المحملون',
    adminManageTitle: '✏️ إدارة الطلاب يدوياً',
    adminManageDesc: 'أضف طالباً جديداً، انقله بين الشعب، أو احذفه — دون الحاجة لرفع ملف Excel من جديد.',
    adminAddTitle: '➕ إضافة طالب',
    adminAddLblGrade: 'الصف',
    adminAddLblSec: 'الشعبة',
    adminAddLblMid: 'الرقم الوزاري',
    adminAddLblName: 'الاسم بالعربية',
    adminAddLblEn: 'الاسم بالإنجليزية',
    adminAddBtn: '➕ إضافة طالب',
    adminTransferTitle: '↔️ نقل طالب إلى شعبة أخرى',
    adminXferLblGrade: 'الصف',
    adminXferLblFrom: 'من الشعبة',
    adminXferLblStudent: 'الطالب',
    adminXferLblTo: 'إلى الشعبة',
    adminXferBtn: '↔️ نقل الطالب',
    adminThAction: 'إجراء',
    adminAllOption: 'الكل',
    adminAllSections: 'كل الشعب',
    adminThGrade: 'الصف',
    adminThSec: 'الشعبة',
    adminThMid: 'الرقم الوزاري',
    adminThName: 'الاسم بالعربية',
    adminThEn: 'الاسم بالإنجليزية',
    adminUploadFull: '📥 رفع ملف شامل (كل الصفوف)',
    adminClearAll: '🗑️ مسح كل الطلاب',
    adminClearGrade: '🗑️ مسح صف محدد',
    adminTeachersTitle: '👨‍🏫 المعلمون المسجلون',
    adminAllowlistTitle: '🔐 المعلّمون المعتمدون للتسجيل',
    adminAllowlistDesc: 'أضف هنا بريد كل معلّم في المدرسة قبل أن يسجّل حسابه. لا يستطيع أي شخص آخر (مثل ولي الأمر) التسجيل كمعلّم.',
    adminAllowEmailPH: 'teacher@school.ae',
    adminAllowNamePH: 'اسم المعلّم (اختياري)',
    adminAllowAddBtn: '➕ إضافة بريد',
    adminThAEmail: 'البريد',
    adminThAName: 'الاسم',
    adminThASubject: 'المادة',
    adminThAGrades: 'الصفوف والشعب',
    adminThARegDate: 'تاريخ التسجيل',
    adminThAStatus: 'الحالة',
    adminThAAction: 'إجراء',
    adminParentsTitle: '👨‍👩‍👧 أولياء الأمور المسجلون',
    adminThTName: 'الاسم',
    adminThTEmail: 'البريد',
    adminThTSubject: 'المادة',
    adminThTGrades: 'الصفوف',
    adminThTDate: 'تاريخ التسجيل',
    adminDeleteTeacherBtn: 'حذف',
    adminDeleteTeacherConfirm: 'حذف المعلم "{name}" نهائياً؟\n\nسيُحذف:\n• حساب الدخول (البريد وكلمة المرور)\n• كل الدرجات والملفات المرفوعة\n• الرسائل وسجل السلوك وكل بياناته\n\nلا يمكن التراجع.',
    adminDeleteTeacherOk: '✅ تم حذف المعلم بالكامل',
    adminDeleteTeacherFail: '❌ فشل حذف المعلم',
    adminDeleteTeacherFunctions: '❌ يجب نشر Cloud Functions أولاً: npm run deploy:functions',
    adminThPStudent: 'اسم الطالب',
    adminThPFirst: 'أول دخول',
    adminThPLast: 'آخر دخول',
    adminThPAction: 'إجراء',
    adminComplaintsDesc: 'شكاوى أولياء الأمور — تظهر للمسؤول فقط. يمكن توجيهها للمعلم ببيانات الطالب أو كشكوى عامة دون كشف هوية مقدّم الشكوى.',
    adminMissingDescDefault: 'تظهر هنا كل تركيبة (صف + شعبة + مادة) لا يوجد لها معلم مسجّل، وفق قوائم الطلبة المرفوعة.',
    adminRefresh: '🔄 تحديث',
    adminUploadGradeBtn: '📥 رفع ملف الصف',
    adminGradeFolder: '📂 الصف',
    anLblClass: 'الصف:',
    anChartDist: '📊 توزيع التقديرات',
    anChartPass: '🎯 نسبة النجاح (70%+)',
    anChartWeek: '📅 متوسط الأداء الأسبوعي',
    anRemedialTitle: '🎯 الطلاب المستهدفون بخطة علاجية',
    allSections: 'كل الشعب',
    teacherComplaintsEmpty: 'لا توجد شكاوى موجّهة بعد',
    parentAcademicTab: 'الأكاديمي',
    settingsPwLabel: '🔑 كلمة مرور المعلم الجديدة',
    settingsPwPH: 'اتركه فارغاً للإبقاء',
    settingsPwConfirmLabel: '🔑 تأكيد كلمة المرور',
    settingsPwConfirmPH: 'أعد إدخال كلمة المرور',
    settingsAccountLabel: '👤 حسابي',
    settingsAccountName: 'الاسم',
    settingsAccountEmail: 'البريد',
    settingsAccountSubject: 'المادة',
    settingsAccountScope: 'الصفوف والشعب',
    settingsCopyUrl: '📋 نسخ',
    settingsUrlCopied: '✅ تم نسخ الرابط',
    settingsUrlCopyFail: '⚠️ تعذّر النسخ — انسخ يدوياً',
    settingsPwTooShort: '⚠️ كلمة المرور 8 أحرف على الأقل',
    settingsPwMismatch: '⚠️ كلمتا المرور غير متطابقتين',
    settingsPwChanged: '✅ تم تغيير كلمة المرور',
    settingsPwNeedLogin: '⚠️ سجّل خروجاً ثم دخولاً مجدداً ثم غيّر كلمة المرور',
    settingsSaved: '✅ تم حفظ الإعدادات',
    settingsUrlLabel: '🌐 رابط التطبيق (URL الكامل)',
    settingsSave: '💾 حفظ',
    settingsPhase3Label: '💾 نسخ احتياطي وإشعارات',
    settingsGradesToolbarHint: 'لتحديث الدرجات استخدم 📂 تحديث الدرجات من الشريط العلوي.',
    settingsExportGrades: '📤 تصدير الدرجات',
    settingsGradesDelete: '🗑️ حذف الدرجات',
    settingsLastSync: 'آخر رفع للدرجات:',
    settingsLastSyncNever: 'لم يُرفَع بعد',
    settingsGradesExportOk: '✅ تم تصدير الدرجات',
    settingsGradesExportEmpty: '⚠️ لا توجد درجات للتصدير',
    settingsNotifLabel: '🔔 الإشعارات',
    settingsNotifHelp: 'فعّل الإشعارات لتلقي تنبيهات على جهازك.',
    settingsAutoRefresh: 'تحديث البيانات تلقائياً عند فتح اللوحة',
    settingsGradesDeleteConfirm: 'حذف كل درجاتك من التطبيق؟ لا يمكن التراجع.',
    settingsGradesDeleted: '✅ تم حذف الدرجات',
    settingsCancel: 'إلغاء',
    bvAnalyticsTitle: '📊 تحليل السلوك',
    bvAnalyticsClose: '✕ إغلاق',
    pwaTitle: '📲 أضف البوابة لشاشتك الرئيسية',
    pwaDesc: 'احصل على إشعارات فورية عند وجود تحديث على بيانات ابنك',
    pwaInstall: '📲 تثبيت',
    pwaLater: 'لاحقاً',
    langToastAr: '🌐 اللغة: عربي',
    langToastEn: '🌐 Language: English',
    gradeLabelShort: 'الصف',
    sectionLabelShort: 'شعبة',
  },
  en: {
    appTitle: 'Follow-up Portal',
    schoolName: 'Mohamed Bin Hamad Al Sharqi School - Cycle 2 (Boys)',
    tabTeacher: '👨‍🏫 Teacher',
    tabParent: '👨‍👦 Parent',
    teacherPwLabel: 'Teacher Password',
    teacherLoginBtn: 'Teacher Dashboard',
    selectClass: 'Select Class',
    selectStudent: 'Select Student Name',
    nextBtn: 'Next →',
    enterPin: 'Enter your Ministry ID to login',
    pinError: 'Incorrect Ministry ID — please try again',
    loginBtn: 'Login →',
    backBtn: '← Back',
    logout: '← Sign Out',
    parentLogout: '← Sign Out',
    outbox: '📤 Send Message',
    inbox: '📥 Teacher Messages',
    bvlog: '📋 Behavior Log',
    sendMsgTitle: '📩 Send a Message to Teacher',
    sendMsgSub: 'Choose a topic or write your message',
    sendBtn: 'Send Message →',
    msgConfirm: '✅ Your message has been sent successfully',
    msgPlaceholder: 'Or write your message here...',
    q1: "I have a question about my son's recent grades",
    q2: "I would like to know about my son's behavior in class",
    q3: 'I would like to schedule a school visit',
    q4: 'My son is struggling and needs extra support',
    q5: "I would like to know about this week's homework",
    q6: 'Thank you for your care and follow-up',
    q1l: '📊 Grade Inquiry',
    q2l: '🧑‍🎓 Behavior Status',
    q3l: '📅 Request Visit',
    q4l: '📚 Extra Support',
    q5l: '📝 Homework',
    q6l: '🙏 Thank You',
    classLabel: 'Class',
    scienceGrade: 'Grade 7 Science',
    rankLabel: 'Class Rank',
    rankFrom: 'out of',
    rankStudents: 'students',
    t1: 'Formative 1',
    t2: 'Formative 2',
    hw: 'Homework / Book',
    portal: 'Portal Tests',
    activity: 'Class Activity',
    lab: 'Lab',
    reportCardTitle: '📋 Detailed Academic Report',
    generalBehavior: '🧑‍🎓 General Behavior',
    academicBar: '📊 Academic',
    remaining: '📉 Remaining',
    conductNotes: '🤝 Behavioral Notes',
    noConduct: 'No behavioral notes yet.',
    noAcademic: 'No academic notes yet.',
    teacherMsg: 'Messages from Teacher',
    praiseType: '🌟 Praise',
    warningType: '⚠️ Warning',
    infoType: '📘 Information',
    noMessages: 'No messages from teacher yet',
    violationsTitle: '📋 Violations',
    noViolationsLog: 'No violations recorded',
    noViolationsText: 'No violation',
    bvLevelTitle: 'Current behavior level as of',
    bvLevelLabel: 'Behavior Status',
    noViolations: 'No Violations',
    oneViolation: 'One Violation',
    violations: 'Violations',
    goodBehavior: 'Good Behavior',
    violationsLabel: 'violation(s) out of',
    log: 'records',
    academicStatus: '📖 Academic Status',
    notifEnabled: '🔔 Notifications enabled ✅',
    notifDenied: '🔕 Notifications blocked — enable in browser settings',
    notifBtn: '🔔 Enable Notifications',
    footer: 'Mohamed Bin Hamad Al Sharqi School - Boys',
    newMsgAlert: '📩 New message from teacher!',
    viewMsg: 'View Message →',
    loading: 'Loading...',
    teacherPwPlaceholder: 'Enter password',
    clsOption1: 'Class 1', clsOption2: 'Class 2',
    clsOption4: 'Class 4', clsOption5: 'Class 5',
    clsPlaceholder: 'Select Class —',
    namePlaceholder: '— Select Student —',
    clsError: 'Incorrect class or name',
    pwError: 'Incorrect password',
    nextBtnTxt: 'Next →',
    clsLabel: 'Select Class',
    nameLabel: 'Select Student Name',
    notFound: 'Student data not found',
    teacherSchool: 'Mohamed Bin Hamad Al Sharqi - Cycle 2 (Boys)',
    teacherName: '—',
    connecting: '🔴 Connecting...',
    connected: '🟢 Connected',
    updateExcel: '📂 Update Grades',
    updateExcelLbl: 'Update Grades',
    refreshLbl: 'Refresh',
    settingsLbl: 'Settings',
    exportExcel: '📤 Export Excel',
    logout: 'Exit',
    tabOverview: '📊 Overview',
    tabAnalysis: '📈 Results Analysis',
    tabGrades: '📝 Grades',
    tabPins: '🔑 Ministry IDs',
    tabBehavior: '🧑‍🎓 Behavior',
    tabMessages: '💬 Messages',
    tabComplaints: '📢 Complaints Inbox',
    tabShare: '🔗 Share',
    tabSettings: '⚙️ Settings',
    filterLabel: 'Filter:',
    allClasses: 'All',
    totalStudents: 'Total Students',
    above80: 'Above 80%',
    below70: 'Below 70%',
    classAvg: 'Class Average',
    studentName: 'Student Name',
    gradeLabel: 'Grade',
    actionLabel: 'Action',
    rise: '📈 Rise',
    fall: '📉 Fall',
    excellent: '⭐ Excellent',
    classLabel2: 'Class:',
    search: '🔍 Search...',
    t1Label: 'Form.1',
    t2Label: 'Form.2',
    hwLabel: 'HW%',
    portalLabel: 'Portal%',
    activityLabel: 'Activity%',
    labLabel: 'Lab',
    totalLabel: 'Total',
    gradeLabel2: 'Grade',
    avgLabel: 'Average',
    behaviorHelp: '🧑‍🎓 Select a student and enter a note — sent immediately to the parent.',
    addNote: '➕ Add New Note',
    studentLabel: 'Student',
    violationType: 'Violation Type',
    academicNote: 'Academic Note',
    conductNote: 'Behavioral Note (optional)',
    academicPlaceholder: 'e.g. Did not submit homework...',
    conductPlaceholder: 'Any additional notes...',
    saveAndSend: '💾 Save & Send to Parent',
    behaviorLogTitle: '📋 Behavior Log',
    clearAll: '🗑️ Clear All',
    analyze: '📊 Analyze',
    dateLabel: 'Date',
    classLabel3: 'Class',
    violationLabel: 'Violation',
    academicNoteLabel: 'Academic Note',
    conductNoteLabel: 'Behavioral Note',
    sendMsgToParent: '📩 Send Message to Parent',
    selectStudent: 'Select Student —',
    msgType: 'Message Type',
    praiseMsg: '🌟 Praise',
    warningMsg: '⚠️ Warning',
    infoMsg: '📘 Information',
    msgBody: 'Message Text',
    msgBodyPH: 'Write message...',
    saveMsg: '💾 Save Message',
    savedMessages: '📬 Saved Messages',
    parentInbox: '📥 Parent Inbox',
    noMessages: 'No messages yet',
    noInbox: 'No incoming messages yet',
    pinsTitle: '🔑 Ministry ID System',
    pinsHelp: "Each student's login code is their Ministry ID.",
    pinsNote: 'Share each code with the respective parent.',
    copyAll: '📋 Copy All Codes',
    generateNew: '🔄 Generate New Codes',
    idLabel: 'Ministry ID',
    shareTitle: '🔗 Share with Parents',
    shareMethod: 'How to share with parents:',
    shareHelp: 'Parent selects class → student name → enters code → sees data.',
    appLink: 'App Link:',
    copyWhatsapp: '📋 Copy WhatsApp Messages',
    preview: '👁️ Preview',
    settingsTitle: '⚙️ Settings',
    reportTitle: '📊 Academic Progress Report',
    splashTitle: 'Proud of the UAE',
    splashSub: 'Proud of the UAE',
    splashFlagAlt: 'Flag of the United Arab Emirates',
    tabAdmin: '⚙️ Admin',
    adminLoginTitle: 'Admin Login',
    adminLoginSub: 'Full access to manage all data',
    adminEmailLabel: 'Email Address',
    adminPwLabel: 'Password',
    adminLoginBtn: '🔐 Admin Dashboard',
    adminEmailPH: 'admin@school.ae',
    regNamePH: 'Full name',
    regPwPH: 'At least 8 characters',
    regPw2PH: 'Re-enter password',
    regGradesSections: 'Grades & sections (select sections per grade)',
    regSubApproved: 'Registration is only available for teachers whose email was added by the school admin',
    parentSecPH: '— Select Section —',
    parentGradePH: '— Select Grade —',
    clsErrorMsg: 'Incorrect grade, section, or name',
    pinPH: 'Enter Ministry ID (up to 12 digits)',
    pinBack: '← Back',
    pinErrorMsg: 'Incorrect Ministry ID — please try again',
    bannerAlt: 'Digital Follow-up Portal',
    adminSchoolName: 'Admin Dashboard — Follow-up Portal',
    adminSub: 'Student data management',
    adminLogout: 'Exit',
    adminTabUpload: '📋 Upload Student Lists',
    adminTabMonitor: '📊 Monitoring',
    adminUploadTitle: '📤 Upload Student List',
    adminStudentsTitle: '👥 Loaded Students',
    adminManageTitle: '✏️ Manual Student Management',
    adminManageDesc: 'Add a student, move them between sections, or delete them — without re-uploading Excel.',
    adminAddTitle: '➕ Add Student',
    adminAddLblGrade: 'Grade',
    adminAddLblSec: 'Section',
    adminAddLblMid: 'Ministry ID',
    adminAddLblName: 'Arabic Name',
    adminAddLblEn: 'English Name',
    adminAddBtn: '➕ Add Student',
    adminTransferTitle: '↔️ Move Student to Another Section',
    adminXferLblGrade: 'Grade',
    adminXferLblFrom: 'From Section',
    adminXferLblStudent: 'Student',
    adminXferLblTo: 'To Section',
    adminXferBtn: '↔️ Move Student',
    adminThAction: 'Action',
    adminAllOption: 'All',
    adminAllSections: 'All Sections',
    adminThGrade: 'Grade',
    adminThSec: 'Section',
    adminThMid: 'Ministry ID',
    adminThName: 'Arabic Name',
    adminThEn: 'English Name',
    adminUploadFull: '📥 Upload Full File (All Grades)',
    adminClearAll: '🗑️ Clear All Students',
    adminClearGrade: '🗑️ Clear Selected Grade',
    adminTeachersTitle: '👨‍🏫 Registered Teachers',
    adminAllowlistTitle: '🔐 Approved Teachers for Registration',
    adminAllowlistDesc: 'Add each school teacher\'s email here before they register. Others (e.g. parents) cannot register as teachers.',
    adminAllowEmailPH: 'teacher@school.ae',
    adminAllowNamePH: 'Teacher name (optional)',
    adminAllowAddBtn: '➕ Add Email',
    adminThAEmail: 'Email',
    adminThAName: 'Name',
    adminThASubject: 'Subject',
    adminThAGrades: 'Grades & sections',
    adminThARegDate: 'Registration date',
    adminThAStatus: 'Status',
    adminThAAction: 'Action',
    adminParentsTitle: '👨‍👩‍👧 Registered Parents',
    adminThTName: 'Name',
    adminThTEmail: 'Email',
    adminThTSubject: 'Subject',
    adminThTGrades: 'Grades',
    adminThTDate: 'Registration Date',
    adminDeleteTeacherBtn: 'Delete',
    adminDeleteTeacherConfirm: 'Delete teacher "{name}" permanently?\n\nThis removes:\n• Login account (email & password)\n• All uploaded grades and files\n• Messages, behavior logs, and all their data\n\nThis cannot be undone.',
    adminDeleteTeacherOk: '✅ Teacher deleted completely',
    adminDeleteTeacherFail: '❌ Failed to delete teacher',
    adminDeleteTeacherFunctions: '❌ Deploy Cloud Functions first: npm run deploy:functions',
    adminThPStudent: 'Student Name',
    adminThPFirst: 'First Login',
    adminThPLast: 'Last Login',
    adminThPAction: 'Action',
    adminComplaintsDesc: 'Parent complaints — visible to admin only. Forward to teacher with student details or as an anonymous general complaint.',
    adminMissingDescDefault: 'Shows every (grade + section + subject) combination with no registered teacher, based on uploaded student lists.',
    adminRefresh: '🔄 Refresh',
    adminUploadGradeBtn: '📥 Upload Grade File',
    adminGradeFolder: '📂 Grade',
    anLblClass: 'Grade:',
    anChartDist: '📊 Grade Distribution',
    anChartPass: '🎯 Pass Rate (70%+)',
    anChartWeek: '📅 Weekly Performance Average',
    anRemedialTitle: '🎯 Students Targeted for Remedial Plan',
    allSections: 'All Sections',
    teacherComplaintsEmpty: 'No forwarded complaints yet',
    parentAcademicTab: 'Academic',
    settingsPwLabel: '🔑 New Teacher Password',
    settingsPwPH: 'Leave blank to keep current',
    settingsPwConfirmLabel: '🔑 Confirm Password',
    settingsPwConfirmPH: 'Re-enter password',
    settingsAccountLabel: '👤 My Account',
    settingsAccountName: 'Name',
    settingsAccountEmail: 'Email',
    settingsAccountSubject: 'Subject',
    settingsAccountScope: 'Grades & sections',
    settingsCopyUrl: '📋 Copy',
    settingsUrlCopied: '✅ Link copied',
    settingsUrlCopyFail: '⚠️ Could not copy — copy manually',
    settingsPwTooShort: '⚠️ Password must be at least 8 characters',
    settingsPwMismatch: '⚠️ Passwords do not match',
    settingsPwChanged: '✅ Password updated',
    settingsPwNeedLogin: '⚠️ Log out, sign in again, then change password',
    settingsSaved: '✅ Settings saved',
    settingsUrlLabel: '🌐 App URL (full link)',
    settingsSave: '💾 Save',
    settingsPhase3Label: '💾 Backup & notifications',
    settingsGradesToolbarHint: 'To update grades, use 📂 Update grades in the top toolbar.',
    settingsExportGrades: '📤 Export grades',
    settingsGradesDelete: '🗑️ Delete grades',
    settingsLastSync: 'Last grades upload:',
    settingsLastSyncNever: 'Not uploaded yet',
    settingsGradesExportOk: '✅ Grades exported',
    settingsGradesExportEmpty: '⚠️ No grades to export',
    settingsNotifLabel: '🔔 Notifications',
    settingsNotifHelp: 'Enable notifications to receive alerts on your device.',
    settingsAutoRefresh: 'Auto-refresh data when opening the dashboard',
    settingsGradesDeleteConfirm: 'Delete all your grades from the app? This cannot be undone.',
    settingsGradesDeleted: '✅ Grades deleted',
    settingsCancel: 'Cancel',
    bvAnalyticsTitle: '📊 Behavior Analysis',
    bvAnalyticsClose: '✕ Close',
    pwaTitle: '📲 Add Portal to Home Screen',
    pwaDesc: 'Get instant notifications when your child\'s data is updated',
    pwaInstall: '📲 Install',
    pwaLater: 'Later',
    langToastAr: '🌐 اللغة: عربي',
    langToastEn: '🌐 Language: English',
    gradeLabelShort: 'Grade',
    sectionLabelShort: 'Section',
  }
};

let currentLang = localStorage.getItem('portal_lang') || 'ar';

function t(key){ return (TRANSLATIONS[currentLang]||TRANSLATIONS.ar)[key] || key; }

function applyGlobalLang(){
  const isAr = currentLang === 'ar';
  const dir  = isAr ? 'rtl' : 'ltr';
  document.documentElement.lang = isAr ? 'ar' : 'en';
  document.documentElement.dir  = dir;
  document.title = t('appTitle');

  const setText = (id, key) => { try{ const el=document.getElementById(id); if(el) el.textContent=t(key); }catch(e){} };
  const setPH   = (id, val) => { try{ const el=document.getElementById(id); if(el) el.placeholder=val; }catch(e){} };

  // ── Splash ──
  const splashTitleEl = document.querySelector('#screen-splash .splash-title');
  if(splashTitleEl) splashTitleEl.textContent = t('splashTitle');
  const splashSub = document.getElementById('splash-sub-en');
  if(splashSub){
    splashSub.textContent = t('splashSub');
    splashSub.style.display = isAr ? 'none' : 'block';
  }
  const splashFlag = document.querySelector('#screen-splash .splash-flag-gif');
  if(splashFlag) splashFlag.alt = t('splashFlagAlt');

  // ── Direction on all screens ──
  ['screen-login','screen-locked','screen-teacher','screen-parent','screen-admin'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.setAttribute('dir', dir);
  });

  // ── زر اللغة في كل مكان ──
  ['global-lang-btn','lang-btn','teacher-lang-btn','admin-lang-btn'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent = isAr ? '🌐 EN' : '🌐 ع';
  });

  // ── شاشة الدخول ──
  setText('login-title',        'appTitle');
  setText('login-school',       'schoolName');
  const bannerEl = document.getElementById('login-banner');
  if(bannerEl) bannerEl.alt = t('bannerAlt');
  document.querySelectorAll('.portal-hero-banner').forEach(el=>{ el.alt = t('bannerAlt'); });
  setText('tab-teacher',        'tabTeacher');
  setText('tab-parent',         'tabParent');
  setText('tab-admin',          'tabAdmin');
  setText('teacher-pw-label',   'teacherPwLabel');
  setText('cls-label',          'clsLabel');

  // ── Teacher login/register panel ──
  const isArL = currentLang==='ar';
  const telEl = document.getElementById('teacher-email-lbl');
  if(telEl) telEl.textContent = isArL?'البريد الإلكتروني':'Email Address';
  const tpwlEl = document.getElementById('teacher-pw-label');
  if(tpwlEl) tpwlEl.textContent = isArL?'كلمة المرور':'Password';
  const teiEl = document.getElementById('teacher-email-input');
  if(teiEl) teiEl.placeholder = 'example@school.ae';
  const tlbEl = document.getElementById('teacher-login-btn');
  if(tlbEl) tlbEl.textContent = isArL?'🔓 دخول لوحة المعلم':'🔓 Teacher Dashboard';
  const trlEl = document.getElementById('teacher-reg-link');
  if(trlEl) trlEl.textContent = isArL?'➕ تسجيل معلم جديد':'➕ Register New Teacher';
  const rtEl = document.getElementById('reg-title');
  if(rtEl) rtEl.textContent = isArL?'📋 تسجيل معلم جديد':'📋 New Teacher Registration';
  const rsEl = document.getElementById('reg-sub');
  if(rsEl) rsEl.textContent = t('regSubApproved');
  const rnEl = document.getElementById('reg-lbl-name');
  if(rnEl) rnEl.textContent = isArL?'اسم المعلم':'Teacher Name';
  const reEl = document.getElementById('reg-lbl-email');
  if(reEl) reEl.textContent = isArL?'البريد الإلكتروني':'Email Address';
  const rsjEl = document.getElementById('reg-lbl-subject');
  if(rsjEl) rsjEl.textContent = isArL?'المادة الدراسية':'Subject';
  const subjMap={math:isArL?'الرياضيات':'Mathematics',science:isArL?'العلوم':'Science',
    arabic:isArL?'اللغة العربية':'Arabic Language',english:isArL?'اللغة الإنجليزية':'English Language',
    social:isArL?'الدراسات الاجتماعية':'Social Studies',islamic:isArL?'التربية الإسلامية':'Islamic Education'};
  const subjSel=document.getElementById('reg-subject');
  if(subjSel){ [...subjSel.options].forEach(o=>{ if(o.value&&subjMap[o.value]) o.textContent=subjMap[o.value]; else if(!o.value) o.textContent=isArL?'— اختر المادة —':'— Select Subject —'; }); }
  const rpEl = document.getElementById('reg-lbl-pw');
  if(rpEl) rpEl.textContent = isArL?'كلمة المرور':'Password';
  const rp2El = document.getElementById('reg-lbl-pw2');
  if(rp2El) rp2El.textContent = isArL?'تأكيد كلمة المرور':'Confirm Password';
  const rgEl = document.getElementById('reg-lbl-grades');
  if(rgEl) rgEl.textContent = t('regGradesSections');
  const rscEl = document.getElementById('reg-lbl-sections');
  if(rscEl) rscEl.textContent = isArL?'الشعبة (يمكن اختيار أكثر من شعبة)':'Section (multiple allowed)';
  const rsbEl = document.getElementById('reg-submit-btn');
  if(rsbEl && !rsbEl.disabled) rsbEl.textContent = isArL?'✅ إنشاء الحساب':'✅ Create Account';
  const rbbEl = document.getElementById('reg-back-btn');
  if(rbbEl) rbbEl.textContent = isArL?'← العودة للدخول':'← Back to Login';
  setPH('reg-name', t('regNamePH'));
  setPH('reg-pw', t('regPwPH'));
  setPH('reg-pw2', t('regPw2PH'));
  const regPnl = document.getElementById('t-reg-panel');
  if(regPnl && regPnl.style.display!=='none') buildRegGrids();
  if(CURRENT_TEACHER) applyTeacherProfile();
  setText('name-label',         'nameLabel');
  const nxtBtn = document.getElementById('parent-next-btn');
  if(nxtBtn) nxtBtn.textContent = isAr ? 'التالي ←' : 'Next →';
  setPH('teacher-pw-input', isAr ? 'أدخل كلمة المرور' : 'Enter password');
  const pgEl = document.getElementById('parent-lbl-grade');
  if(pgEl) pgEl.textContent = isAr?'الصف':'Grade';
  const psEl = document.getElementById('parent-lbl-section');
  if(psEl) psEl.textContent = isAr?'الشعبة':'Section';
  const parentGrade = document.getElementById('parent-grade');
  if(parentGrade){
    [...parentGrade.options].forEach(o=>{
      if(!o.value) o.textContent = t('parentGradePH');
      else o.textContent = isAr?'الصف '+o.value:'Grade '+o.value;
    });
  }
  ['1','2','4','5'].forEach(v=>{
    const el=document.getElementById('cls-opt-'+v);
    if(el) el.textContent = isAr ? 'الشعبة '+v : 'Class '+v;
  });
  const clsErr = document.getElementById('cls-error-msg');
  if(clsErr) clsErr.textContent = t('clsErrorMsg');
  const pwErr = document.getElementById('pw-error-msg');
  if(pwErr) pwErr.textContent = isAr ? 'كلمة المرور غير صحيحة' : 'Incorrect password';
  const nameEl = document.getElementById('parent-name');
  if(nameEl && nameEl.options[0]) nameEl.options[0].text = isAr ? '— اختر الاسم —' : '— Select Student —';
  const secEl = document.getElementById('parent-section');
  if(secEl && secEl.options[0] && !secEl.options[0].value) secEl.options[0].text = t('parentSecPH');

  // ── Admin login tab ──
  setText('admin-login-title', 'adminLoginTitle');
  setText('admin-login-sub',   'adminLoginSub');
  setText('admin-email-label', 'adminEmailLabel');
  setText('admin-pw-label',    'adminPwLabel');
  setText('admin-login-btn',   'adminLoginBtn');
  setPH('admin-email-input', t('adminEmailPH'));

  // ── شاشة الرمز ──
  setText('pin-instruction', 'enterPin');
  setPH('p0', t('pinPH'));
  const pinLoginBtn = document.getElementById('pin-login-btn');
  if(pinLoginBtn) pinLoginBtn.textContent = isAr ? 'دخول ←' : 'Login →';
  setText('pin-back-btn', 'pinBack');
  const pinErr = document.getElementById('pin-error');
  if(pinErr) pinErr.textContent = t('pinErrorMsg');
  if(window._currentParent?.name){
    const lockNameEl = document.getElementById('lock-student-name');
    if(lockNameEl) lockNameEl.textContent = displayStudentName(window._currentParent);
  }

  // ── لوحة المعلم ──
  try{ applyTeacherLang(); }catch(e){ console.warn('applyTeacherLang:', e); }
  try{ applyOverviewLang(); }catch(e){ console.warn('applyOverviewLang:', e); }
  try{ applyGradesLang(); }catch(e){ console.warn('applyGradesLang:', e); }
  try{ applyPinsLang(); }catch(e){ console.warn('applyPinsLang:', e); }
  try{ applyBehaviorLang(); }catch(e){ console.warn('applyBehaviorLang:', e); }
  try{ applyMessagesLang(); }catch(e){ console.warn('applyMessagesLang:', e); }
  try{ applyShareLang(); }catch(e){ console.warn('applyShareLang:', e); }
  try{ applyAnalysisLang(); }catch(e){ console.warn('applyAnalysisLang:', e); }

  // ── لوحة المسؤول ──
  try{ applyAdminLang(); }catch(e){ console.warn('applyAdminLang:', e); }

  // ── لوحة ولي الأمر ──
  setText('logout-btn',      'parentLogout');
  setText('parent-school',   'schoolName');
  setText('parent-title',    'reportTitle');
  document.querySelectorAll('.portal-hero-banner').forEach(el=>{ el.alt = t('bannerAlt'); });
  const langBtn = document.getElementById('lang-btn');
  if(langBtn) langBtn.textContent = isAr ? 'EN' : 'ع';
  const ps=document.getElementById('screen-parent');
  if(ps) ps.setAttribute('dir',dir);

  // ── نوافذ مشتركة ──
  try{ applySharedUiLang(); }catch(e){ console.warn('applySharedUiLang:', e); }
}


function applyOverviewLang(){
  const isAr = currentLang === 'ar';
  const setText = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };

  // Filter label
  setText('ov-filter-lbl', 'filterLabel');

  // Class filter options — rebuilt dynamically for teacher scope
  try{ buildClassFilter(); }catch(e){}

  // Stat card labels
  setText('stat-lbl-total', 'totalStudents');
  setText('stat-lbl-pass',  'above80');
  setText('stat-lbl-low',   'below70');
  setText('stat-lbl-avg',   'classAvg');

  // List title
  const ot = document.getElementById('ov-list-title');
  if(ot) ot.textContent = isAr?'📋 قائمة الطلاب':'📋 Student List';

  // Search placeholder
  const os = document.getElementById('ov-search');
  if(os) os.placeholder = isAr?'🔍 ابحث...':'🔍 Search...';

  // Table headers
  const headers = {
    'ov-th-cls':   isAr?'ش':'Cl',
    'ov-th-name':  isAr?'الاسم':'Name',
    'ov-th-diag':  isAr?'تشخيص':'Diag.',
    'ov-th-t1':    isAr?'ت1':'F1',
    'ov-th-t2':    isAr?'ت2':'F2',
    'ov-th-hw':    isAr?'واجبات%':'HW%',
    'ov-th-portal':isAr?'بوابة%':'Portal%',
    'ov-th-act':   isAr?'نشاط%':'Activity%',
    'ov-th-lab':   isAr?'LAB':'LAB',
    'ov-th-total': isAr?'المحصلة':'Total',
    'ov-th-final': isAr?'نهائي':'Final',
    'ov-th-grade': isAr?'التقدير':'Grade',
  };
  Object.entries(headers).forEach(([id,txt])=>{ const el=document.getElementById(id); if(el) el.textContent=txt; });

  // Re-render table rows (so student names flip)
}

function applyGradesLang(){
  const isAr = currentLang === 'ar';

  // Class label
  const gl = document.getElementById('gr-lbl-class');
  if(gl) gl.textContent = isAr?'الشعبة:':'Class:';

  // Class options
  const grOpts = {'gr-opt-1':[isAr?'الشعبة 1':'Class 1'],'gr-opt-2':[isAr?'الشعبة 2':'Class 2'],'gr-opt-4':[isAr?'الشعبة 4':'Class 4'],'gr-opt-5':[isAr?'الشعبة 5':'Class 5']};
  Object.entries(grOpts).forEach(([id,[txt]])=>{ const el=document.getElementById(id); if(el) el.textContent=txt; });

  // Search placeholder
  const gs = document.getElementById('gr-search');
  if(gs) gs.placeholder = isAr?'🔍 ابحث...':'🔍 Search...';

  // Table headers (grades tab uses renderGradesTableHead)
  renderGradesTableHead();
}

function applyPinsLang(){
  const isAr = currentLang === 'ar';

  // Title
  const pt = document.getElementById('pins-title');
  if(pt) pt.textContent = isAr?'🔑 نظام الرقم الوزاري كرمز دخول':'🔑 Ministry ID Login System';

  // Info paragraphs
  const p1 = document.getElementById('pins-info-1');
  if(p1) p1.innerHTML = isAr
    ?'• رمز دخول كل طالب هو <strong>رقمه الوزاري</strong> — لا يتغير ولا يحتاج إعداداً.'
    :'• Each student\'s login code is their <strong>Ministry ID</strong> — no setup needed.';

  const p2 = document.getElementById('pins-info-2');
  if(p2) p2.textContent = isAr
    ?'• ولي الأمر يختار اسم ابنه ثم يدخل رقمه الوزاري للوصول لبياناته فقط.'
    :'• Parent selects their son then enters the Ministry ID to access his data.';

  const p3 = document.getElementById('pins-info-3');
  if(p3) p3.textContent = isAr
    ?'• يمكنك نسخ الرقم بالضغط عليه ومشاركته مع ولي الأمر عبر واتساب.'
    :'• Click any ID to copy it and share with the parent via WhatsApp.';

  // Class label
  const pl = document.getElementById('pins-lbl-class');
  if(pl) pl.textContent = isAr?'الشعبة:':'Class:';

  // Class options
  ['1','2','4','5'].forEach(v=>{
    const el=document.getElementById('pins-opt-'+v);
    if(el) el.textContent = isAr?'الشعبة '+v:'Class '+v;
  });

  // Buttons
  const pb1 = document.getElementById('pins-copy-btn');
  if(pb1) pb1.textContent = isAr?'📋 نسخ كل الرموز':'📋 Copy All IDs';

  const pb2 = document.getElementById('pins-regen-btn');
  if(pb2) pb2.textContent = isAr?'🔄 توليد رموز جديدة':'🔄 Refresh Codes';

  // Table headers
  const pth = {'pins-th-name':isAr?'الاسم':'Name','pins-th-id':isAr?'الرقم الوزاري (رمز الدخول)':'Ministry ID (Login Code)','pins-th-action':isAr?'إجراء':'Action'};
  Object.entries(pth).forEach(([id,txt])=>{ const el=document.getElementById(id); if(el) el.textContent=txt; });

  // Re-render table (flips student names)
}

function applyBehaviorLang(){
  const isAr = currentLang === 'ar';
  const setText = (id,txt) => { const el=document.getElementById(id); if(el) el.textContent=txt; };
  const setHTML = (id,txt) => { const el=document.getElementById(id); if(el) el.innerHTML=txt; };
  const setPH   = (id,txt) => { const el=document.getElementById(id); if(el) el.placeholder=txt; };

  // Help text
  const ht = document.getElementById('behavior-help-text');
  if(ht) ht.innerHTML = isAr
    ?'🧑‍🎓 <strong>سجل السلوك والملاحظات:</strong> اختر الطالب وأدخل الملاحظة — تُرسل فوراً لولي الأمر وتُحفظ في السجل التاريخي. مستوى السلوك يُحسب تلقائياً من عدد المخالفات.'
    :'🧑‍🎓 <strong>Behavior Log:</strong> Select student and enter notes — sent instantly to parent and saved in history. Behavior level calculated automatically from violations.';

  // Class controls
  setText('bv-lbl-class', isAr?'الشعبة:':'Class:');
  ['1','2','4','5'].forEach(v=>{
    const el=document.getElementById('bv-opt-'+v);
    if(el) el.textContent=isAr?'الشعبة '+v:'Class '+v;
  });
  setText('bv-export-btn', isAr?'📥 تصدير Excel':'📥 Export Excel');

  // Add note form
  setText('bv-add-title', isAr?'➕ إضافة ملاحظة جديدة':'➕ Add New Note');
  setText('bv-lbl-student', isAr?'اسم الطالب':'Student Name');
  const bvSP = document.getElementById('bv-student-ph');
  if(bvSP) bvSP.textContent = isAr?'— اختر طالباً —':'— Select Student —';
  setText('bv-lbl-academic', isAr?'الملاحظة الأكاديمية':'Academic Note');
  setPH('bv-academic-ph', isAr?'مثال: لم يُسلّم الواجب...':'e.g. Did not submit homework...');
  setText('bv-lbl-violation', isAr?'نوع المخالفة السلوكية':'Violation Type');
  setText('bv-lbl-conduct', isAr?'ملاحظة سلوكية إضافية (اختياري)':'Behavioral Note (optional)');
  setPH('bv-conduct-ph', isAr?'أي تفاصيل إضافية...':'Any additional details...');
  setText('bv-save-btn', isAr?'💾 حفظ وإرسال لولي الأمر':'💾 Save & Send to Parent');

  // Log section
  setText('bv-log-title', isAr?'📋 سجل الملاحظات':'📋 Behavior Log');
  setPH('bv-search', isAr?'🔍 ابحث...':'🔍 Search...');
  setText('bv-analyze-btn', isAr?'📊 تحليل':'📊 Analyze');
  setText('bv-clear-btn', isAr?'🗑️ مسح الكل':'🗑️ Clear All');

  // Table headers
  const headers = {
    'bv-th-date':  isAr?'التاريخ':'Date',
    'bv-th-cls':   isAr?'الشعبة':'Class',
    'bv-th-name':  isAr?'الاسم':'Name',
    'bv-th-level': isAr?'مستوى السلوك':'Level',
    'bv-th-viol':  isAr?'المخالفة':'Violation',
    'bv-th-acad':  isAr?'أكاديمي':'Academic',
    'bv-th-note':  isAr?'ملاحظة':'Note',
    'bv-th-action':isAr?'إجراء':'Action',
  };
  Object.entries(headers).forEach(([id,txt])=>{ const el=document.getElementById(id); if(el) el.textContent=txt; });

  // Empty state text
  setText('bv-empty-txt', isAr?'لا توجد سجلات بعد':'No records yet');

  // Violation grid labels (re-render violations)

  // Re-render violation grid (flips labels)
  // Re-populate student dropdown
  // Re-render the log (flips student names + texts)

  // Re-populate student dropdown
  const bc = document.getElementById('behavior-class');
}

function applyMessagesLang(){
  const isAr = currentLang === 'ar';
  const setText = (id,txt) => { const el=document.getElementById(id); if(el) el.textContent=txt; };
  const setPH   = (id,txt) => { const el=document.getElementById(id); if(el) el.placeholder=txt; };

  // Send card
  setText('msg-send-title', isAr?'💬 إرسال رسالة لولي أمر':'💬 Send Message to Parent');
  setText('msg-lbl-class',   isAr?'الشعبة':'Class');
  setText('msg-lbl-student', isAr?'الطالب':'Student');
  setText('msg-lbl-type',    isAr?'نوع الرسالة':'Message Type');

  // Class options
  ['1','2','4','5'].forEach(v=>{
    const el=document.getElementById('msg-opt-'+v);
    if(el) el.textContent=isAr?'الشعبة '+v:'Class '+v;
  });

  // Message type options
  const mti=document.getElementById('msg-type-info');
  if(mti) mti.textContent=isAr?'📘 معلومات عامة':'📘 Information';
  const mtp=document.getElementById('msg-type-praise');
  if(mtp) mtp.textContent=isAr?'🌟 مدح وتشجيع':'🌟 Praise';
  const mtw=document.getElementById('msg-type-warning');
  if(mtw) mtw.textContent=isAr?'⚠️ تنبيه تقصير':'⚠️ Warning';

  // Template buttons
  const tpls = {
    'tpl-p1': isAr?'🌟 تفوق':'🌟 Excellent',
    'tpl-p2': isAr?'📈 تحسن':'📈 Rising',
    'tpl-w1': isAr?'📚 واجبات':'📚 Homework',
    'tpl-w2': isAr?'📉 انخفاض':'📉 Falling',
    'tpl-w3': isAr?'🔕 مشاركة':'🔕 Participation',
  };
  Object.entries(tpls).forEach(([id,txt])=>{ const el=document.getElementById(id); if(el) el.textContent=txt; });

  // Body label & placeholder
  setText('msg-lbl-body', isAr?'نص الرسالة':'Message Text');
  const msgBodyEl = document.getElementById('msg-body');
  if(msgBodyEl) msgBodyEl.placeholder = isAr?'اكتب الرسالة...':'Write message...';
  setText('msg-save-btn', isAr?'💾 حفظ الرسالة':'💾 Save Message');

  // Saved messages
  setText('msg-saved-title',  isAr?'📬 الرسائل المحفوظة':'📬 Saved Messages');
  setText('msg-clear-btn',    isAr?'🗑️ مسح الكل':'🗑️ Clear All');

  // Inbox
  setText('msg-inbox-title',     isAr?'📥 رسائل واردة من أولياء الأمور':'📥 Messages from Parents');
  setText('msg-inbox-clear-btn', isAr?'🗑️ مسح الكل':'🗑️ Clear All');

  // Re-render dynamic content (flips student names)

  // Re-populate student dropdown with bilingual names
}

function applyShareLang(){
  const isAr = currentLang === 'ar';
  const setText = (id,txt) => { const el=document.getElementById(id); if(el) el.textContent=txt; };
  const setHTML = (id,html) => { const el=document.getElementById(id); if(el) el.innerHTML=html; };

  // Help box
  const ht = document.getElementById('links-help-title');
  if(ht) ht.textContent = isAr?'طريقة المشاركة مع أولياء الأمور:':'How to share with parents:';

  const s1 = document.getElementById('links-step-1');
  if(s1) s1.innerHTML = isAr
    ?'1. اذهب إلى تبويب <strong>الرموز السرية</strong> ووزّع كل رمز على ولي الأمر المعني.'
    :'1. Go to the <strong>Ministry IDs</strong> tab and share each code with the respective parent.';

  const s2 = document.getElementById('links-step-2');
  if(s2) s2.textContent = isAr
    ?'2. أرسل لكل ولي أمر رابط التطبيق + اسم الشعبة + رمز PIN ابنه عبر واتساب.'
    :"2. Send each parent: app link + class name + their son's Ministry ID via WhatsApp.";

  const s3 = document.getElementById('links-step-3');
  if(s3) s3.textContent = isAr
    ?'3. ولي الأمر يختار الشعبة ← اسم ابنه ← يدخل الرمز ← يرى بيانات ابنه فقط ✅'
    :'3. Parent selects class → son\'s name → enters ID → views data only ✅';

  setText('links-app-lbl', isAr?'رابط التطبيق:':'App Link:');

  // Class controls
  setText('links-lbl-class', isAr?'الشعبة:':'Class:');
  ['1','2','4','5'].forEach(v=>{
    const el=document.getElementById('links-opt-'+v);
    if(el) el.textContent=isAr?'الشعبة '+v:'Class '+v;
  });
  setText('links-copy-all-btn', isAr?'📋 نسخ رسائل واتساب للكل':'📋 Copy WhatsApp Messages');

  // Table headers
  setText('links-th-name',   isAr?'الاسم':'Name');
  setText('links-th-code',   isAr?'الرمز السري':'Ministry ID');
  setText('links-th-action', isAr?'إجراء':'Action');

  // Re-render table (flips names + button texts)
}

function applyAnalysisLang(){
  const isAr = currentLang === 'ar';
  const setText = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };
  setText('an-lbl-class', 'anLblClass');
  setText('an-chart-dist-title', 'anChartDist');
  setText('an-chart-pass-title', 'anChartPass');
  setText('an-chart-week-title', 'anChartWeek');
  setText('an-remedial-title', 'anRemedialTitle');
  const ac = document.getElementById('analysis-class');
  const asec = document.getElementById('analysis-sec');
  if(ac && ac.options[0]) ac.options[0].textContent = t('adminAllOption');
  if(asec && asec.options[0]) asec.options[0].textContent = t('allSections');
  const gc = document.getElementById('grades-class');
  const gsec = document.getElementById('grades-sec');
  if(gc && gc.options[0]) gc.options[0].textContent = t('adminAllOption');
  if(gsec && gsec.options[0]) gsec.options[0].textContent = t('allSections');
  const pc = document.getElementById('pins-class');
  const psec = document.getElementById('pins-sec');
  if(pc && pc.options[0]) pc.options[0].textContent = t('adminAllOption');
  if(psec && psec.options[0]) psec.options[0].textContent = t('allSections');
  const lc = document.getElementById('links-class');
  const lsec = document.getElementById('links-sec');
  if(lc && lc.options[0]) lc.options[0].textContent = t('adminAllOption');
  if(lsec && lsec.options[0]) lsec.options[0].textContent = t('allSections');
  setText('teacher-complaints-empty', 'teacherComplaintsEmpty');
}

function applyAdminLang(){
  const isAr = currentLang === 'ar';
  const setText = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };

  setText('admin-school-name', 'adminSchoolName');
  setText('admin-sub', 'adminSub');
  setText('admin-logout-btn', 'adminLogout');
  setText('admin-tab-btn-upload', 'adminTabUpload');
  setText('admin-tab-btn-monitor', 'adminTabMonitor');
  setText('admin-tab-btn-complaints', 'tabComplaints');
  setText('admin-upload-title', 'adminUploadTitle');
  setText('admin-students-title', 'adminStudentsTitle');
  setText('admin-manage-title', 'adminManageTitle');
  setText('admin-manage-desc', 'adminManageDesc');
  setText('admin-add-title', 'adminAddTitle');
  setText('admin-add-lbl-grade', 'adminAddLblGrade');
  setText('admin-add-lbl-sec', 'adminAddLblSec');
  setText('admin-add-lbl-mid', 'adminAddLblMid');
  setText('admin-add-lbl-name', 'adminAddLblName');
  setText('admin-add-lbl-en', 'adminAddLblEn');
  setText('admin-add-btn', 'adminAddBtn');
  setText('admin-transfer-title', 'adminTransferTitle');
  setText('admin-xfer-lbl-grade', 'adminXferLblGrade');
  setText('admin-xfer-lbl-from', 'adminXferLblFrom');
  setText('admin-xfer-lbl-student', 'adminXferLblStudent');
  setText('admin-xfer-lbl-to', 'adminXferLblTo');
  setText('admin-xfer-btn', 'adminXferBtn');
  setText('admin-th-action', 'adminThAction');
  setText('admin-upload-btn', 'adminUploadFull');
  setText('admin-clear-btn', 'adminClearAll');
  setText('admin-complaints-title', 'tabComplaints');
  setText('admin-complaints-desc', 'adminComplaintsDesc');
  setText('admin-complaints-refresh', 'adminRefresh');
  setText('admin-monitor-refresh', 'adminRefresh');
  setText('admin-allowlist-title', 'adminAllowlistTitle');
  setText('admin-allowlist-desc', 'adminAllowlistDesc');
  setText('admin-allow-add-btn', 'adminAllowAddBtn');
  setText('admin-th-a-email', 'adminThAEmail');
  setText('admin-th-a-name', 'adminThAName');
  setText('admin-th-a-subject', 'adminThASubject');
  setText('admin-th-a-grades', 'adminThAGrades');
  setText('admin-th-a-regdate', 'adminThARegDate');
  setText('admin-th-a-status', 'adminThAStatus');
  setText('admin-th-a-action', 'adminThAAction');
  const allowEmail = document.getElementById('admin-allow-email');
  if(allowEmail) allowEmail.placeholder = t('adminAllowEmailPH');
  const allowName = document.getElementById('admin-allow-name');
  if(allowName) allowName.placeholder = t('adminAllowNamePH');
  setText('admin-parents-title', 'adminParentsTitle');
  setText('admin-th-grade', 'adminThGrade');
  setText('admin-th-sec', 'adminThSec');
  setText('admin-th-mid', 'adminThMid');
  setText('admin-th-name', 'adminThName');
  setText('admin-th-en', 'adminThEn');
  setText('admin-th-p-student', 'adminThPStudent');
  setText('admin-th-p-mid', 'adminThMid');
  setText('admin-th-p-grade', 'adminThGrade');
  setText('admin-th-p-sec', 'adminThSec');
  setText('admin-th-p-first', 'adminThPFirst');
  setText('admin-th-p-last', 'adminThPLast');
  setText('admin-th-p-action', 'adminThPAction');

  const uploadDesc = document.getElementById('admin-upload-desc');
  if(uploadDesc){
    uploadDesc.innerHTML = isAr
      ? 'ارفع ملف Excel لكل صف أو ملفاً واحداً يحتوي كل الصفوف (أوراق بأسماء <strong>5-1</strong> … <strong>8-6</strong>).<br>الهيكل: <strong>م | الصف | الشعبة | رقم الطالب | اسم بالعربية | اسم بالإنجليزية</strong> — الشعب أرقام <strong>1–6</strong>'
      : 'Upload one Excel per grade or one workbook with all grades (sheets named <strong>5-1</strong> … <strong>8-6</strong>).<br>Columns: <strong># | Grade | Section | Student ID | Arabic Name | English Name</strong> — sections <strong>1–6</strong>';
  }

  ['5','6','7','8'].forEach(g=>{
    const statEl = document.getElementById('admin-grade'+g+'-status');
    if(!statEl) return;
    const card = statEl.parentElement;
    const titleEl = card?.querySelector('div[style*="font-weight:700"]');
    const btn = card?.querySelector('button.btn-primary');
    if(titleEl) titleEl.textContent = `${t('adminGradeFolder')} ${g}`;
    if(btn) btn.textContent = `${t('adminUploadGradeBtn')} ${g}`;
  });

  const gradeFilter = document.getElementById('admin-grade-filter');
  if(gradeFilter){
    [...gradeFilter.options].forEach(o=>{
      if(!o.value) o.textContent = t('adminAllOption');
      else o.textContent = isAr ? 'الصف '+o.value : 'Grade '+o.value;
    });
  }
  const secFilter = document.getElementById('admin-sec-filter');
  if(secFilter && secFilter.options[0]) secFilter.options[0].textContent = t('adminAllSections');

  const clearGradeBtn = document.querySelector('#admin-tab-upload button[onclick="adminClearGrade()"]');
  if(clearGradeBtn) clearGradeBtn.textContent = t('adminClearGrade');

  const missingDesc = document.getElementById('admin-missing-desc');
  if(missingDesc && !missingDesc.dataset.dynamic){
    missingDesc.textContent = t('adminMissingDescDefault');
  }

  ['admin-stat-lbl-teachers','admin-stat-lbl-parents','admin-stat-lbl-missing'].forEach((id,i)=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.textContent = [isAr?'معلمون':'Teachers', isAr?'أولياء أمور':'Parents', isAr?'مواد غير مسجلة':'Unregistered slots'][i];
  });
  const mt = document.getElementById('admin-missing-title');
  if(mt) mt.textContent = isAr
    ? '⚠️ الصفوف والشعب — مواد لم يُسجّل معلم لها بعد'
    : '⚠️ Grades & sections — subjects without a teacher yet';

  if(typeof refreshAdminSecFilter === 'function') refreshAdminSecFilter();
  if(typeof adminRenderStudents === 'function' && Object.keys(adminStudentsCache||{}).length){
    try{ adminRenderStudents(); }catch(e){}
  }
}

function applySharedUiLang(){
  const isAr = currentLang === 'ar';
  const setText = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };
  const setPH = (id, key) => { const el=document.getElementById(id); if(el) el.placeholder=t(key); };

  const settingsModal = document.getElementById('settings-modal-title');
  if(settingsModal) settingsModal.textContent = t('settingsTitle');
  const setLbl = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };
  setLbl('settings-account-lbl', 'settingsAccountLabel');
  setLbl('settings-pw-lbl', 'settingsPwLabel');
  setLbl('settings-pw2-lbl', 'settingsPwConfirmLabel');
  setLbl('settings-url-lbl', 'settingsUrlLabel');
  setLbl('settings-phase3-lbl', 'settingsPhase3Label');
  setLbl('settings-notif-lbl', 'settingsNotifLabel');
  const hint = document.getElementById('settings-grades-toolbar-hint');
  if(hint) hint.textContent = t('settingsGradesToolbarHint');
  const notifHelp = document.getElementById('settings-notif-help');
  if(notifHelp) notifHelp.textContent = t('settingsNotifHelp');
  const exportBtn = document.getElementById('settings-export-grades-btn');
  if(exportBtn) exportBtn.textContent = t('settingsExportGrades');
  const delBtn = document.getElementById('settings-delete-grades-btn');
  if(delBtn) delBtn.textContent = t('settingsGradesDelete');
  const autoLbl = document.getElementById('settings-auto-refresh-lbl');
  if(autoLbl) autoLbl.textContent = t('settingsAutoRefresh');
  setPH('new-password', 'settingsPwPH');
  setPH('new-password-confirm', 'settingsPwConfirmPH');
  const copyBtn = document.getElementById('settings-copy-url-btn');
  if(copyBtn) copyBtn.textContent = t('settingsCopyUrl');
  const saveBtn = document.getElementById('settings-save-btn');
  if(saveBtn) saveBtn.textContent = t('settingsSave');
  const cancelBtn = document.getElementById('settings-cancel-btn');
  if(cancelBtn) cancelBtn.textContent = t('settingsCancel');
  if(typeof populateSettingsAccount === 'function') populateSettingsAccount();
  if(typeof populateSettingsPhase3 === 'function') populateSettingsPhase3();

  const alertEl = document.querySelector('#new-msg-alert > span');
  if(alertEl) alertEl.textContent = t('newMsgAlert');
  const alertBtn = document.querySelector('.new-msg-alert-btn');
  if(alertBtn) alertBtn.textContent = t('viewMsg');

  const bvModalTitle = document.querySelector('#bv-analytics-modal h3');
  if(bvModalTitle) bvModalTitle.textContent = t('bvAnalyticsTitle');
  const bvCloseBtn = document.querySelector('#bv-analytics-modal button[onclick*="bv-analytics-modal"]');
  if(bvCloseBtn) bvCloseBtn.textContent = t('bvAnalyticsClose');

  const pwaP = document.querySelector('#pwa-banner p');
  if(pwaP) pwaP.innerHTML = `<strong>${t('pwaTitle')}</strong>${t('pwaDesc')}`;
  const pwaInstallBtn = document.querySelector('#pwa-banner .btn-primary');
  if(pwaInstallBtn) pwaInstallBtn.textContent = t('pwaInstall');
  const pwaLaterBtn = document.querySelector('#pwa-banner button[onclick*="pwa-banner"]');
  if(pwaLaterBtn) pwaLaterBtn.textContent = t('pwaLater');
}

function applyTeacherLang(){
  const isAr = currentLang === 'ar';
  const setText = (id, key) => { const el=document.getElementById(id); if(el) el.textContent=t(key); };

  // Topbar — school + teacher profile from login data
  if(CURRENT_TEACHER) applyTeacherProfile();
  else {
    setText('teacher-school', 'teacherSchool');
    setText('teacher-name-el', 'teacherName');
  }
  setText('teacher-excel-lbl', 'updateExcelLbl');
  setText('teacher-refresh-lbl', 'refreshLbl');
  setText('teacher-settings-lbl', 'settingsLbl');
  setText('teacher-logout-lbl', 'logout');
  const tlb = document.getElementById('teacher-lang-lbl');
  if(tlb) tlb.textContent = isAr ? 'EN' : 'ع';
  // FB status
  if(typeof window.updateFirebaseConnectionStatus === 'function'){
    window.updateFirebaseConnectionStatus(window._fbReady);
  } else {
    const fbTxt = document.getElementById('fb-status-txt');
    if(fbTxt && (fbTxt.textContent.includes('جارٍ') || fbTxt.textContent.includes('Connecting')))
      fbTxt.textContent = isAr?'جارٍ الاتصال...':'Connecting...';
  }

  // Nav tabs
  setText('ttab-overview', 'tabOverview');
  setText('ttab-analysis', 'tabAnalysis');
  setText('ttab-grades',   'tabGrades');
  setText('ttab-pins',     'tabPins');
  setText('ttab-behavior', 'tabBehavior');
  setText('ttab-messages', 'tabMessages');
  setText('ttab-complaints', 'tabComplaints');
  setText('ttab-share',    'tabShare');
  setText('teacher-complaints-title', 'tabComplaints');
  // Rebuild grade dropdowns with correct language
  try{ refreshGradeDropdowns(); }catch(e){}

  // Walk all text nodes in teacher screen and translate
  const screen = document.getElementById('screen-teacher');
  if(!screen) return;

  // Translate all placeholders
  screen.querySelectorAll('[placeholder]').forEach(el=>{
    const ph = el.getAttribute('placeholder');
    if(ph.includes('ابحث') || ph.includes('Search')) el.placeholder = isAr?'ابحث...':'Search...';
    else if(ph.includes('الواجب') || ph.includes('homework')) el.placeholder = isAr?'مثال: لم يُسلّم الواجب...':'e.g. Did not submit homework...';
    else if(ph.includes('تفاصيل') || ph.includes('details')) el.placeholder = isAr?'أي تفاصيل إضافية...':'Any additional details...';
    else if(ph.includes('رسالة') || ph.includes('message')) el.placeholder = isAr?'اكتب الرسالة...':'Write message...';
    else if(ph.includes('طالباً') || ph.includes('Student')) el.placeholder = isAr?'اختر طالباً وأكتب رسالة...':'— Select Student —';
  });

  // Translate all select options
  screen.querySelectorAll('select option').forEach(opt=>{
    const v = opt.value;
    const txt = opt.textContent.trim();
    if(v==='' && (txt.includes('الكل') || txt==='All')) opt.textContent = isAr?'الكل':'All';
    else if(v==='' && (txt.includes('اختر') || txt.includes('Select'))) opt.textContent = isAr?'اختر طالباً —':'— Select Student —';
    else if(v==='1') opt.textContent = isAr?'الشعبة 1':'Class 1';
    else if(v==='2') opt.textContent = isAr?'الشعبة 2':'Class 2';
    else if(v==='4') opt.textContent = isAr?'الشعبة 4':'Class 4';
    else if(v==='5') opt.textContent = isAr?'الشعبة 5':'Class 5';
    else if(v==='praise') opt.textContent = isAr?'🌟 مدح وتشجيع':'🌟 Praise';
    else if(v==='warning') opt.textContent = isAr?'⚠️ تنبيه تقصير':'⚠️ Warning';
    else if(v==='info') opt.textContent = isAr?'📘 معلومة عامة':'📘 Information';
    else if(txt.includes('لا مخالفة') || txt.includes('No violation')) opt.textContent = isAr?'✅ لا مخالفة':'✅ No Violation';
  });

  // Translate labels
  screen.querySelectorAll('label').forEach(el=>{
    const txt = el.textContent.trim();
    if(txt==='فلتر:' || txt==='Filter:') el.textContent = isAr?'فلتر:':'Filter:';
    else if(txt==='الشعبة:' || txt==='Class:') el.textContent = isAr?'الشعبة:':'Class:';
    else if(txt==='الشعبة' || txt==='Class') el.textContent = isAr?'الشعبة':'Class';
    else if(txt==='الطالب' || txt==='Student') el.textContent = isAr?'الطالب':'Student';
    else if(txt==='نوع الرسالة' || txt==='Message Type') el.textContent = isAr?'نوع الرسالة':'Message Type';
    else if(txt==='نص الرسالة' || txt==='Message Text') el.textContent = isAr?'نص الرسالة':'Message Text';
    else if(txt.includes('المخالفة') || txt.includes('Violation')) el.textContent = isAr?'نوع المخالفة السلوكية':'Violation Type';
    else if(txt.includes('الأكاديمية') || txt.includes('Academic')) el.textContent = isAr?'الملاحظة الأكاديمية':'Academic Note';
    else if(txt.includes('سلوكية') || txt.includes('Behavioral')) el.textContent = isAr?'ملاحظة سلوكية إضافية (اختياري)':'Behavioral Note (optional)';
  });

  // Translate buttons (non-dynamic)
  screen.querySelectorAll('button:not([id])').forEach(el=>{
    const txt = el.textContent.trim();
    if(txt==='📋 نسخ كل الرموز' || txt==='📋 Copy All Codes') el.textContent = isAr?'📋 نسخ كل الرموز':'📋 Copy All Codes';
    else if(txt==='🔄 توليد رموز جديدة' || txt==='🔄 Refresh Codes') el.textContent = isAr?'🔄 توليد رموز جديدة':'🔄 Refresh Codes';
    else if(txt==='💾 حفظ الرسالة' || txt==='💾 Save Message') el.textContent = isAr?'💾 حفظ الرسالة':'💾 Save Message';
    else if(txt==='💾 حفظ وإرسال لولي الأمر' || txt==='💾 Save & Send to Parent') el.textContent = isAr?'💾 حفظ وإرسال لولي الأمر':'💾 Save & Send to Parent';
    else if(txt==='نسخ رسائل واتساب للكل' || txt==='Copy WhatsApp Messages') el.textContent = isAr?'نسخ رسائل واتساب للكل':'Copy WhatsApp Messages';
    else if(txt==='معاينة' || txt==='Preview') el.textContent = isAr?'معاينة':'Preview';
  });

  // Translate help text paragraphs
  screen.querySelectorAll('.help-box p, .help-box li').forEach(el=>{
    const txt = el.textContent.trim();
    if(txt.includes('سجل السلوك') || txt.includes('Behavior Log:')) {
      if(txt.includes('اختر')) el.innerHTML = isAr
        ?'🧑‍🎓 <strong>سجل السلوك والملاحظات:</strong> اختر الطالب وأدخل الملاحظة — تُرسل فوراً لولي الأمر.'
        :'🧑‍🎓 <strong>Behavior Log:</strong> Select student and enter notes — sent instantly to parent.';
    }
    if(txt.includes('رمز دخول') || txt.includes("Ministry ID is their login")) {
      el.textContent = isAr?"رمز دخول كل طالب هو رقمه الوزاري. لا يتغير ولا يحتاج إعداداً.":"Each student's Ministry ID is their login code. No setup needed.";
    }
    if(txt.includes('ولي الأمر يختار اسم') || txt.includes('Parent selects their son')) {
      el.textContent = isAr?'ولي الأمر يختار اسم ابنه ثم يدخل رقمه الوزاري للوصول لبيانات ابنه.':'Parent selects their son and enters Ministry ID to access data.';
    }
    if(txt.includes('يمكنك نسخ الرقم') || txt.includes('Click any ID')) {
      el.textContent = isAr?'يمكنك نسخ الرقم بالضغط عليه ومشاركته مع ولي الأمر عبر واتساب.':'Click any ID to copy and share via WhatsApp.';
    }
    if(txt.includes('أرسل لكل') || txt.includes('Send each parent')) {
      el.textContent = isAr?"أرسل لكل ولي أمر رابط التطبيق + اسم الشعبة + رمز PIN ابنه عبر واتساب.":"Send each parent: app link + class + their son's Ministry ID via WhatsApp.";
    }
    if(txt.includes('ولي الأمر يختار الشعبة') || txt.includes('Parent selects class')) {
      el.textContent = isAr?'ولي الأمر يختار الشعبة ← اسم ابنه ← يدخل الرمز ← يرى بيانات ابنه.':'Parent selects class → son → enters ID → views data.';
    }
    if(txt.includes('ووزّع') || txt.includes('Share each code')) {
      el.textContent = isAr?'ووزّع كل رمز على ولي الأمر المعني.':'Share each code with the respective parent.';
    }
    if(txt.includes('ولي الأمر يختار الشعبة ← اسم ابنه') || txt.includes('selects class →')) {
      el.textContent = isAr?'ولي الأمر يختار الشعبة ← اسم ابنه ← يدخل الرمز ← يرى بيانات ابنه.':'Parent: select class → student → enter code → view data.';
    }
  });

  // Re-render dynamic content
  applyOverviewLang();
  applyGradesLang();
}

function applyParentLang(){ applyGlobalLang(); }

function toggleLang(){
  try {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('portal_lang', currentLang);

    applyGlobalLang();

    const screenId = (document.querySelector('.screen.active')||{}).id || '';
    if(screenId === 'screen-teacher'){
      try{ renderOverview(); }catch(e){}
      try{ renderGradesTab(); }catch(e){}
      try{ renderAnalysisTab(); }catch(e){}
      try{ renderPinsTab(); }catch(e){}
      try{ renderViolationGrid(); }catch(e){}
      try{ populateBvStudents(); }catch(e){}
      try{ renderBvLog(); }catch(e){}
      try{ populateMsgStudents(); }catch(e){}
      try{ renderSavedMessages(); }catch(e){}
      try{ renderParentInbox(); }catch(e){}
      try{ renderTeacherComplaints(); }catch(e){}
      try{ renderLinksTab(); }catch(e){}
    } else if(screenId === 'screen-parent' && window._currentParent){
      rerenderParentDashboard({ preserveTab:true }).catch(e=>console.warn('parent rerender:', e));
    } else if(screenId === 'screen-admin'){
      try{ renderAdminComplaints(); }catch(e){}
      try{ updateAdminComplaintsBadge(); }catch(e){}
      if(document.getElementById('admin-tab-monitor')?.style.display !== 'none'){
        adminLoadMonitoring();
      } else if(Object.keys(adminStudentsCache||{}).length){
        adminRenderStudents();
      }
    } else if(screenId === 'screen-locked' && window._currentParent){
      const lockNameEl = document.getElementById('lock-student-name');
      if(lockNameEl) lockNameEl.textContent = displayStudentName(window._currentParent);
    } else if(screenId === 'screen-login'){
      const grade = document.getElementById('parent-grade')?.value;
      if(grade && typeof populateParentSections === 'function'){
        const sec = document.getElementById('parent-section')?.value;
        const nm  = document.getElementById('parent-name')?.value;
        populateParentSections();
        if(sec){
          setTimeout(()=>{
            const secSel = document.getElementById('parent-section');
            if(secSel) secSel.value = sec;
            if(sec && typeof populateParentNames === 'function') populateParentNames();
            if(nm){
              setTimeout(()=>{
                const nameSel = document.getElementById('parent-name');
                if(nameSel) nameSel.value = nm;
              }, 400);
            }
          }, 400);
        }
      }
    }

    showToast(currentLang === 'en' ? t('langToastEn') : t('langToastAr'));
  } catch(e){
    console.error('toggleLang error:', e);
  }
}


// ══════════════════════════════════════════════════
//  PARENT SUBJECT TABS — find all teachers for student
// ══════════════════════════════════════════════════

// Load all subjects/teachers for this student, then render tabs
function getActiveParentTabId(){
  const btn = document.querySelector('.p-main-tab.active');
  return btn ? btn.id.replace('btn-','') : 'tab-academic';
}

async function rerenderParentDashboard(options={}){
  if(!window._currentParent) return;
  const activeTabId = options.preserveTab !== false ? getActiveParentTabId() : 'tab-academic';
  if(window._parentListeners?.length){
    window._parentListeners.forEach(ref=>ref.off());
    window._parentListeners = [];
  }
  const { cls, name, mid } = window._currentParent;
  await loadParentSubjectTabs(cls, name, mid || '');
  if(activeTabId && activeTabId !== 'tab-academic'){
    const btn = document.getElementById('btn-'+activeTabId);
    if(btn) switchParentMainTab(activeTabId, btn);
  }
}

async function loadParentSubjectTabs(cls, studentName, mid){
  const body = document.getElementById('parent-body');
  if(!body) return;
  const isEn = currentLang==='en';
  body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--grey-3)">⏳ ${isEn?'Loading...':'جارٍ التحميل...'}</div>`;

  const grade   = cls;  // cls = grade (5,6,7,8)
  const section = window._currentParent?.section || '';

  let teachersList = [];

  if(typeof db !== 'undefined'){
    try{
      // Find all teachers registered for this grade
      const teachersSnap = await db.ref('publicTeachers').once('value');
      if(teachersSnap.exists()){
        Object.entries(teachersSnap.val()).forEach(([key, teacher])=>{
          if(!teacher.grades) return;
          if(!teacher.subject || teacher.role === 'admin') return;
          // Check if teacher teaches this grade
          if(!teacher.grades.includes(grade)) return;
          // Check if teacher teaches this section (if gradeMap exists)
          if(teacher.gradeMap && teacher.gradeMap[grade]){
            if(section && !teacher.gradeMap[grade].includes(section)) return;
          } else if(teacher.sections && section){
            if(!teacher.sections.includes(section)) return;
          }
          const subj = SUBJECTS[teacher.subject];
          teachersList.push({
            key,
            name: teacher.name || '',
            subject: teacher.subject || '',
            subjLabel: subj ? (isEn?subj.en:subj.ar) : (teacher.subject||''),
          });
        });
      }
    } catch(e){ console.warn('loadParentSubjectTabs:', e); }
  }

  teachersList = teachersList.filter(tc => tc.subject && tc.subjLabel);

    // Sort by subject name
  teachersList.sort((a,b)=>a.subjLabel.localeCompare(b.subjLabel));

  // Start Firebase listeners for all teachers found
  if(typeof window._startListenersForTeacher === 'function'){
    teachersList.forEach(tc=>window._startListenersForTeacher(tc.key));
  }

  // Always show tabs even if no teachers yet
  renderParentSubjectTabs(cls, studentName, mid, teachersList, section);
}


// ══════════════════════════════════════════════════
//  PARENT BADGE / NOTIFICATION SYSTEM
// ══════════════════════════════════════════════════

const _parentSeen = {msgs:{}, bv:{}}; // track seen timestamps

function _getSeenKey(type, cls, name){ return `seen_${type}_${cls}_${name}`; }

function _markSeen(type, cls, name){
  try{ localStorage.setItem(_getSeenKey(type,cls,name), new Date().toISOString()); }catch(e){}
  _updateParentBadges();
}

function _getSeenTime(type, cls, name){
  try{ return localStorage.getItem(_getSeenKey(type,cls,name))||''; }catch(e){ return ''; }
}

function _countUnseen(items, type, cls, name){
  const seen = _getSeenTime(type, cls, name);
  if(!seen) return items.length;
  return items.filter(i=>(i.ts||i.date||'') > seen).length;
}

function _isAdminMsgUnseen(msg, cls, name){
  const tk = msg.teacherKey || '';
  return _countUnseen([msg], 'admin_'+tk, cls, name) > 0;
}

function _getSubjectTabUnseenCount(i, cls, name, teacherKey){
  const sName = (name || '').trim();
  const myMsgs = (APP.messages || []).filter(m => m._src === teacherKey + '|msg');
  const myLogs = (APP.behaviorLog || []).filter(e => e._src === teacherKey + '|bv');
  const myAdmin = (APP.parentAdminMessages || []).filter(m =>
    m && m.cls === cls &&
    (m.studentName || '').trim() === sName &&
    (m.teacherKey || '') === teacherKey &&
    !isParentAdminMsgHidden(m)
  );
  return _countUnseen(myMsgs, 'msgs', cls, name) +
         _countUnseen(myLogs, 'bv', cls, name) +
         _countUnseen(myAdmin, 'admin_'+teacherKey, cls, name);
}

function _refreshSubjectTabBadge(i, cls, name, teacherKey){
  _setBadge('btn-tab-subj-'+i, _getSubjectTabUnseenCount(i, cls, name, teacherKey));
}

function _notifyNewAdminReplies(prevList, cls, name, teachersList){
  if(!window._parentAdminInboxReady){
    window._parentAdminInboxReady = true;
    return;
  }
  const prevIds = new Set((prevList || []).map(m => m.id));
  const isEn = currentLang === 'en';
  (teachersList || []).forEach(tc => {
    const fresh = (APP.parentAdminMessages || []).filter(m =>
      m && !prevIds.has(m.id) &&
      m.cls === cls &&
      (m.studentName || '').trim() === (name || '').trim() &&
      m.teacherKey === tc.key
    );
    if(!fresh.length) return;
    const subj = fresh[0].subjLabel || tc.subjLabel || '';
    showToast(isEn
      ? `✅ Admin replied${subj ? ' · '+subj : ''}`
      : `✅ تم الرد من المسؤول${subj ? ' · '+subj : ''}`);
  });
}

function _updateParentBadges(){
  if(!window._currentParent) return;
  const {cls, name} = window._currentParent;
  // Badges are updated after data loads in renderParentInboxAll / renderParentBehaviorTab
}

function _setBadge(btnId, count){
  // btnId could be 'btn-tab-subj-0' or 'tab-subj-0' — normalize
  const id = btnId.startsWith('btn-') ? btnId : 'btn-'+btnId;
  const btn = document.getElementById(id);
  if(!btn) return;
  const old = btn.querySelector('.tab-badge');
  if(old) old.remove();
  if(count > 0){
    const badge = document.createElement('span');
    badge.className = 'tab-badge';
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.cssText = 'background:#e53935;color:#fff;border-radius:10px;'+
      'font-size:10px;font-weight:800;padding:1px 6px;margin-right:4px;'+
      'vertical-align:middle;display:inline-block';
    btn.prepend(badge);
  }
}

// Start Firebase listeners for parent realtime updates
// Active Firebase listeners for parent view
window._parentListeners = [];

function _refreshParentGradeViews(cls, studentName, mid, teachersList){
  const ctx = window._parentSubjectContext;
  if(!ctx || ctx.cls !== cls || (ctx.name || '').trim() !== (studentName || '').trim()) return;

  if(document.getElementById('parent-academic-content')){
    renderParentAcademic(cls, studentName, mid, teachersList);
  }

  (teachersList || []).forEach((tc, i)=>{
    const tab = document.getElementById('tab-subj-'+i);
    if(tab && tab.style.display !== 'none'){
      loadSubjectTabContent(i, cls, studentName, mid, teachersList);
    }
  });
}

function parentGradeBuckets(cls, section){
  const sec = normalizeSectionCell(section);
  const buckets = [];
  if(sec) buckets.push(String(cls) + sec);
  buckets.push(String(cls));
  return [...new Set(buckets)];
}

function pickStudentGradeRecord(store, mid, studentName){
  if(!store || typeof store !== 'object') return null;
  const sName = String(studentName || '').trim();
  const m = String(mid || '').trim();
  if(m && store[m] && typeof store[m] === 'object') return store[m];
  const arr = Array.isArray(store) ? store : Object.values(store);
  return arr.find(x => x && typeof x === 'object' && (
    (m && String(x.mid).trim() === m) ||
    (sName && String(x.name).trim() === sName)
  )) || null;
}

async function fetchTeacherGradeRecord(teacherKey, cls, section, mid, studentName){
  if(typeof db === 'undefined' || !teacherKey) return null;
  for(const bucket of parentGradeBuckets(cls, section)){
    try{
      const snap = await db.ref(`teacherData/${teacherKey}/grades/${bucket}`).once('value');
      if(!snap.exists()) continue;
      const hit = pickStudentGradeRecord(snap.val(), mid, studentName);
      if(hit) return hit;
    }catch(e){}
  }
  const m = String(mid || '').trim();
  if(m){
    for(const bucket of parentGradeBuckets(cls, section)){
      try{
        const snap = await db.ref(`teacherData/${teacherKey}/grades/${bucket}/${m}`).once('value');
        if(snap.exists()) return snap.val();
      }catch(e){}
    }
  }
  // Fallback: scan all grade buckets for this class (handles section format differences)
  try{
    const snap = await db.ref(`teacherData/${teacherKey}/grades`).once('value');
    if(snap.exists()){
      for(const [bucket, store] of Object.entries(snap.val() || {})){
        if(!String(bucket).startsWith(String(cls))) continue;
        const hit = pickStudentGradeRecord(store, mid, studentName);
        if(hit) return hit;
      }
    }
  }catch(e){}
  return null;
}

function buildParentWeeklyGradeTable(gd, isEn){
  if(!gd) return '';
  const wk = n => isEn ? `W${n}` : `أ${n}`;
  const weekHead = Array.from({length:GRADE_WEEK_COUNT}, (_,i)=>`<th>${wk(i+1)}</th>`).join('');
  const weekCells = (arr)=> Array.from({length:GRADE_WEEK_COUNT}, (_,i)=>{
    const v = arr?.[i];
    if(v == null || v === '') return '<td>—</td>';
    const n = parseFloat(v);
    if(isNaN(n)) return '<td>—</td>';
    const txt = n <= 1 ? (n * 100).toFixed(0) : n.toFixed(0);
    return `<td>${txt}</td>`;
  }).join('');

  return `<div class="table-wrap parent-grades-wrap" style="margin-bottom:14px">
    <table class="grades-template-table parent-grades-table">
      <thead>
        <tr>
          <th rowspan="2">${isEn?'Diag.':'تشخيص'}</th>
          <th rowspan="2">${isEn?'F1':'ت1'}</th>
          <th rowspan="2">${isEn?'F2':'ت2'}</th>
          <th colspan="${GRADE_WEEK_COUNT}">${isEn?'Homework':'الواجبات'}</th>
          <th colspan="${GRADE_WEEK_COUNT}">${isEn?'Portal LMS':'بوابة LMS'}</th>
          <th colspan="${GRADE_WEEK_COUNT}">${isEn?'Participation':'المشاركة'}</th>
          <th rowspan="2">LAB</th>
          <th rowspan="2">${isEn?'Total':'المحصلة'}</th>
          <th rowspan="2">${isEn?'Final':'نهائي'}</th>
        </tr>
        <tr>${weekHead}${weekHead}${weekHead}</tr>
      </thead>
      <tbody><tr>
        <td>${(gd.diagnostic||0) ? gd.diagnostic.toFixed(1) : '—'}</td>
        <td>${(gd.t1||0).toFixed(1)}</td>
        <td>${(gd.t2||0).toFixed(1)}</td>
        ${weekCells(gd.hwWeeks)}
        ${weekCells(gd.portalWeeks)}
        ${weekCells(gd.actWeeks)}
        <td>${gd.lab ?? '—'}</td>
        <td><strong style="color:var(--teal-dark)">${(gd.total||0).toFixed(1)}%</strong></td>
        <td>${(gd.final||0) ? gd.final.toFixed(1) : '—'}</td>
      </tr></tbody>
    </table>
  </div>`;
}

function syncParentTeacherMessages(tc, cls, sName, snap){
  const tag = tc.key + '|msg';
  const entries = snap.exists() ? Object.entries(snap.val() || {}) : [];
  const mine = entries
    .filter(([, m]) => m && m.cls === cls && (m.name || '').trim() === sName)
    .map(([id, m]) => ({ id, ...m }));
  APP.messages = (APP.messages || []).filter(m => m._src !== tag);
  mine.forEach(m => APP.messages.push({ ...m, _src: tag, _teacherKey: tc.key }));
  saveState();
}

function syncParentTeacherBehavior(tc, cls, sName, snap){
  const tag = tc.key + '|bv';
  const entries = snap.exists() ? Object.entries(snap.val() || {}) : [];
  const mine = entries
    .filter(([, e]) => e && e.cls === cls && (e.name || '').trim() === sName)
    .map(([id, e]) => ({ id, ...e }));
  APP.behaviorLog = (APP.behaviorLog || []).filter(e => e._src !== tag);
  mine.forEach(e => APP.behaviorLog.push({ ...e, _src: tag, _teacherKey: tc.key }));
  saveState();
}

function syncParentTeacherParentMsgs(tc, cls, sName, snap){
  const tag = tc.key + '|pm';
  const entries = snap.exists() ? Object.entries(snap.val() || {}) : [];
  const mine = entries
    .filter(([, m]) => m && m.cls === cls && (m.name || '').trim() === sName)
    .map(([id, m]) => ({ id, ...m, teacherKey: tc.key, _teacherKey: tc.key }));
  APP.parentMessages = (APP.parentMessages || []).filter(m => m._src !== tag);
  mine.forEach(m => APP.parentMessages.push({ ...m, _src: tag }));
  saveState();
}

function syncParentAdminInbox(mid, cls, sName, snap){
  const all = snap.exists()
    ? Object.entries(snap.val() || {}).map(([id, m]) => ({ id, ...m }))
    : [];
  APP.parentAdminMessages = all.filter(m =>
    m && m.cls === cls && (m.studentName || '').trim() === sName.trim()
  );
  (APP.parentComplaints || []).forEach(pc => {
    if(all.some(m => m.complaintId === pc.id) && pc.status === 'pending'){
      pc.status = 'replied';
    }
  });
  saveState();
}

function parentAdminMsgHideKey(msg){
  return (msg.id || msg.ts || '') + '|' + (msg.teacherKey || '');
}

function isParentAdminMsgHidden(msg){
  return getParentHiddenMsgIds('admin_msg').includes(parentAdminMsgHideKey(msg));
}

function parentAdminMsgDeleteBtn(msg, idx){
  const isEn = currentLang === 'en';
  const enc = encodeURIComponent(parentAdminMsgHideKey(msg));
  return `<button type="button" class="parent-msg-del" onclick="hideParentAdminMsg('${enc}',${idx == null ? 'null' : idx})" title="${isEn ? 'Hide on my device' : 'إخفاء من جهازي'}">🗑️</button>`;
}

function hideParentAdminMsg(encodedHideId, idx){
  addParentHiddenMsgId('admin_msg', decodeURIComponent(encodedHideId));
  showToast(currentLang === 'en' ? '✅ Message hidden' : '✅ تم إخفاء الرسالة');
  const ctx = window._parentSubjectContext;
  if(ctx && idx != null){
    const tc = (ctx.teachers || [])[Number(idx)];
    renderParentAdminMessages(idx, tc?.key, ctx.cls, ctx.name);
  }
}

function renderParentAdminMessages(idx, teacherKey, cls, studentName){
  const div = document.getElementById('parent-admin-msgs-'+idx);
  if(!div) return;
  const isEn = currentLang==='en';
  const sName = studentName.trim();
  const list = (APP.parentAdminMessages || [])
    .filter(m => m && m.cls === cls && (m.studentName || '').trim() === sName && (m.teacherKey || '') === teacherKey)
    .filter(m => !isParentAdminMsgHidden(m))
    .sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));

  if(!list.length){ div.innerHTML=''; return; }
  const hasUnread = list.some(m => _isAdminMsgUnseen(m, cls, sName));
  div.innerHTML = `
    <div class="parent-admin-msgs-wrap${hasUnread?' has-unread':''}">
      <div class="section-title parent-admin-section-title${hasUnread?' unread':''}" style="margin-bottom:8px">
        🏫 ${isEn?'Admin Messages':'رسائل المسؤول'}
        ${hasUnread ? `<span class="parent-admin-new-pill">${isEn?'New reply':'رد جديد'}</span>` : ''}
      </div>
      ${list.map(m=>{
        const unread = _isAdminMsgUnseen(m, cls, sName);
        return `
        <div class="parent-admin-msg-card${unread?' unread':''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
            <span style="font-size:11px;font-weight:700;color:#1565c0">
              🏫 ${isEn?'School Admin':'إدارة المدرسة'}${unread ? ` · <span class="parent-admin-new-pill inline">${isEn?'New':'جديد'}</span>` : ''}
            </span>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--grey-3)">${m.date||''}</span>
              ${parentAdminMsgDeleteBtn(m, idx)}
            </div>
          </div>
          <p style="margin:0;font-size:13px;color:var(--grey-2);white-space:pre-line;line-height:1.7">${escapeHtml(m.body||'')}</p>
        </div>`;
      }).join('')}
    </div>`;
}

function _startParentListeners(cls, studentName, mid, teachersList, section){
  window._parentListeners.forEach(ref=>ref.off());
  window._parentListeners = [];
  window._parentAdminInboxReady = false;
  const sName = studentName.trim();
  const sec = section || window._currentParent?.section || window._parentSubjectContext?.section || '';

  teachersList.forEach((tc,i)=>{
    if(typeof db==='undefined'||!tc.key) return;

    // Grades → refresh academic + open subject tabs instantly
    const gradesRef = db.ref('teacherData/'+tc.key+'/grades');
    gradesRef.on('value', ()=>{
      _refreshParentGradeViews(cls, studentName, mid, teachersList);
    });
    window._parentListeners.push(gradesRef);

    // Messages → badge on subject tab
    const msgRef = db.ref('teacherData/'+tc.key+'/messages');
    msgRef.on('value', snap=>{
      syncParentTeacherMessages(tc, cls, sName, snap);
      _refreshSubjectTabBadge(i, cls, studentName, tc.key);
      if(document.getElementById('parent-inbox-all')){
        renderParentInboxAll(cls, studentName, teachersList);
      }
      const tabDiv = document.getElementById('tab-subj-'+i);
      if(tabDiv && tabDiv.style.display !== 'none'){
        loadSubjectTabContent(i, cls, studentName, mid, teachersList);
      }
    });
    window._parentListeners.push(msgRef);

    // BehaviorLog → badge on subject tab
    const bvRef = db.ref('teacherData/'+tc.key+'/behaviorLog');
    bvRef.on('value', snap=>{
      syncParentTeacherBehavior(tc, cls, sName, snap);
      _refreshSubjectTabBadge(i, cls, studentName, tc.key);
      if(document.getElementById('parent-behavior-content')){
        renderParentBehaviorTab(cls, studentName, mid, teachersList);
      }
      const tabDiv = document.getElementById('tab-subj-'+i);
      if(tabDiv && tabDiv.style.display !== 'none'){
        loadSubjectTabContent(i, cls, studentName, mid, teachersList);
      }
    });
    window._parentListeners.push(bvRef);

    // ParentMessages
    const pmRef = db.ref('teacherData/'+tc.key+'/parentMessages');
    pmRef.on('value', snap=>{
      syncParentTeacherParentMsgs(tc, cls, sName, snap);
      const tabDiv = document.getElementById('tab-subj-'+i);
      if(tabDiv && tabDiv.style.display !== 'none'){
        renderSubjectSentLog(i, tc.key, cls, studentName);
      }
    });
    window._parentListeners.push(pmRef);
  });

  if(mid && typeof db!=='undefined'){
    const adminInboxRef = db.ref('parentAdminInbox/'+mid);
    adminInboxRef.on('value', snap=>{
      const prevList = (APP.parentAdminMessages || []).slice();
      syncParentAdminInbox(mid, cls, sName, snap);
      _notifyNewAdminReplies(prevList, cls, studentName, teachersList);
      teachersList.forEach((tc, i)=>{
        _refreshSubjectTabBadge(i, cls, studentName, tc.key);
        renderParentAdminMessages(i, tc.key, cls, studentName);
        renderSubjectSentComplaintsLog(i, tc.key, cls, studentName);
      });
    });
    window._parentListeners.push(adminInboxRef);
  }
}


function renderParentSubjectTabs(cls, studentName, mid, teachersList, section){
  const isEn = currentLang==='en';

  // Get student info
  let student = findStudentInGrade(cls, studentName, mid, section);
  if(!student) student={name:studentName,nameEn:'',mid,section};

  const displayName = displayStudentName(student);
  const secLabel    = student.section||section||'';

  // Tabs: Academic + one per subject
  const fixedTabs = [
    {id:'tab-academic', icon:'📊', label:t('parentAcademicTab')}
  ];
  const subjectTabs = teachersList.map((tc,i)=>({
    id:'tab-subj-'+i, icon:'📚', label:tc.subjLabel, teacher:tc, idx:i
  }));
  const allTabs = [...fixedTabs, ...subjectTabs];

  const tabBtns = allTabs.map((tab,i)=>`
    <button class="parent-tab p-main-tab ${i===0?'active':''}"
      id="btn-${tab.id}"
      onclick="switchParentMainTab('${tab.id}',this)"
      style="font-size:12px;padding:8px 14px;white-space:nowrap;position:relative">
      ${tab.icon} ${tab.label}
    </button>`).join('');

  const academicHtml = `<div id="tab-academic" class="p-tab-content" style="display:block">
    <div id="parent-academic-content">
      <div style="text-align:center;padding:30px;color:var(--grey-3)">⏳</div>
    </div>
  </div>`;

  const subjectHtml = subjectTabs.map(tab=>`
    <div id="${tab.id}" class="p-tab-content" style="display:none">
      <div id="subj-content-${tab.idx}">
        <div style="text-align:center;padding:24px;color:var(--grey-3)">⏳</div>
      </div>
    </div>`).join('');

  document.getElementById('parent-body').innerHTML = `
    <div class="student-card" style="margin-bottom:16px">
      <div class="student-avatar">🎓</div>
      <div class="student-name">${displayName}</div>
      <div class="student-meta">${t('gradeLabelShort')} ${cls}${secLabel?' · '+t('sectionLabelShort')+' '+secLabel:''}</div>
    </div>
    <div class="parent-tabs-wrap" style="flex-wrap:wrap;gap:4px;margin-bottom:14px;overflow-x:auto;padding-bottom:4px">
      ${tabBtns}
    </div>
    ${academicHtml}${subjectHtml}`;

  window._parentSubjectContext = {cls, name:studentName, mid, teachers:teachersList, section};

  // Load academic tab immediately
  renderParentAcademic(cls, studentName, mid, teachersList);
  // Load first subject tab
  if(teachersList.length) loadSubjectTabContent(0, cls, studentName, mid, teachersList);
  // Start listeners for badges + live grades
  setTimeout(()=>_startParentListeners(cls, studentName, mid, teachersList, section), 400);
}


function switchSubjectTab(tabId, el){
  document.querySelectorAll('.parent-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.parent-tab-content').forEach(c=>{c.classList.remove('active');c.style.display='none';});
  if(el) el.classList.add('active');
  const target = document.getElementById(tabId);
  if(target){ target.classList.add('active'); target.style.display='block'; }
  // Extract index and load content
  const idx = parseInt(tabId.replace('subj-',''));
  if(!isNaN(idx) && window._parentSubjectContext){
    const {cls,name,mid,teachers} = window._parentSubjectContext;
    loadSubjectTabContent(idx, cls, name, mid, teachers);
  }
}


// ══════════════════════════════════════════════════
//  PARENT VIEW FUNCTIONS
// ══════════════════════════════════════════════════

function switchParentMainTab(tabId, el){
  document.querySelectorAll('.p-tab-content').forEach(c=>c.style.display='none');
  document.querySelectorAll('.p-main-tab').forEach(b=>b.classList.remove('active'));
  const target = document.getElementById(tabId);
  if(target) target.style.display='block';
  if(el) el.classList.add('active');

  const ctx = window._parentSubjectContext;
  if(!ctx) return;

  if(tabId==='tab-academic'){
    renderParentAcademic(ctx.cls, ctx.name, ctx.mid, ctx.teachers);
  }
  if(tabId.startsWith('tab-subj-')){
    const i = parseInt(tabId.replace('tab-subj-',''));
    const tc = ctx.teachers?.[i];
    _markSeen('msgs', ctx.cls, ctx.name);
    _markSeen('bv',   ctx.cls, ctx.name);
    if(tc?.key) _markSeen('admin_'+tc.key, ctx.cls, ctx.name);
    if(tc?.key) _refreshSubjectTabBadge(i, ctx.cls, ctx.name, tc.key);
    loadSubjectTabContent(i, ctx.cls, ctx.name, ctx.mid, ctx.teachers);
  }
}


function switchMsgTab(tab, el){
  document.getElementById('parent-inbox-all').style.display = tab==='inbox'?'block':'none';
  document.getElementById('parent-sent-all').style.display  = tab==='sent'?'block':'none';
  document.querySelectorAll('.p-msg-subtab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  // Reload on open
  const ctx = window._parentSubjectContext;
  if(!ctx) return;
  if(tab==='inbox') renderParentInboxAll(ctx.cls, ctx.name, ctx.teachers);
  if(tab==='sent')  renderParentSentAll(ctx.cls, ctx.name, ctx.teachers);
}

// ── ACADEMIC TAB ──
async function renderParentAcademic(cls, studentName, mid, teachersList){
  const div  = document.getElementById('parent-academic-content');
  if(!div) return;
  const isEnL = currentLang==='en';
  const section = window._currentParent?.section || window._parentSubjectContext?.section || '';

  let allGrades = [];

  if(typeof db !== 'undefined'){
    const results = await Promise.all(
      (teachersList || []).map(async tc=>{
        const s = await fetchTeacherGradeRecord(tc.key, cls, section, mid, studentName);
        if(!s) return null;
        return {...s, subject:tc.subject, subjLabel:tc.subjLabel, teacherName:tc.name};
      })
    );
    allGrades = results.filter(Boolean);
  }

  const hasGradeValue = g => (g.total||0) > 0 || (g.t1||0) > 0 || (g.t2||0) > 0 || (g.hw||0) > 0;

  const tableRows = (teachersList || []).map(tc=>{
    const g = allGrades.find(x=>x.subject===tc.subject);
    const total  = g && hasGradeValue(g) ? (g.total||0) : null;
    const color  = total===null?'var(--grey-3)':total>=80?'var(--green-soft)':total>=70?'var(--gold)':'var(--red-soft)';
    const badge  = total===null
      ? `<span style="color:var(--grey-3);font-size:12px">${isEnL?'Not entered':'لم يُدخل'}</span>`
      : `<strong style="color:${color}">${total.toFixed(1)}%</strong>`;
    return `<tr>
      <td style="font-weight:600">${tc.subjLabel}</td>
      <td style="font-size:12px;color:var(--grey-3)">${tc.name}</td>
      <td>${g?(g.diagnostic||0)?g.diagnostic.toFixed(1):'—':'—'}</td>
      <td>${g?(g.t1||0).toFixed(1):'—'}</td>
      <td>${g?(g.t2||0).toFixed(1):'—'}</td>
      <td>${g?(g.hw||0).toFixed(1)+'%':'—'}</td>
      <td>${g?(g.portal||0).toFixed(1)+'%':'—'}</td>
      <td>${g?(g.activity||0)+'%':'—'}</td>
      <td>${g?(g.lab||0):'—'}</td>
      <td>${badge}</td>
      <td>${g?(g.final||0)?g.final.toFixed(1):'—':'—'}</td>
    </tr>`;
  }).join('');

  const enteredGrades = allGrades.filter(g=>(g.total||0)>0);
  const overallAvg = enteredGrades.length
    ? (enteredGrades.reduce((s,g)=>s+(g.total||0),0)/enteredGrades.length).toFixed(1)
    : null;

  const sorted = [...enteredGrades].sort((a,b)=>(b.total||0)-(a.total||0));
  const best   = sorted[0];
  const weak   = sorted[sorted.length-1];

  div.innerHTML = `
    ${overallAvg ? `<div style="background:var(--teal-pale);border-radius:12px;padding:16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;color:var(--grey-3)">${isEnL?'Overall Average':'المتوسط العام'}</div>
        <div style="font-size:28px;font-weight:800;color:var(--teal-dark)">${overallAvg}%</div>
      </div>
      <div style="text-align:${isEnL?'left':'right'}">
        ${best?`<div style="font-size:12px;color:var(--green-soft)">🌟 ${isEnL?'Best:':'الأفضل:'} ${best.subjLabel}</div>`:''}
        ${weak&&weak!==best?`<div style="font-size:12px;color:var(--gold)">⚠️ ${isEnL?'Needs work:':'يحتاج تحسين:'} ${weak.subjLabel}</div>`:''}
      </div>
    </div>` : ''}

    <div class="card-header" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <h4>${isEnL?'📊 Academic Record':'📊 السجل الأكاديمي'}</h4>
      <span style="font-size:11px;color:var(--grey-3)">🔄 ${isEnL?'Live sync':'تحديث فوري'}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${isEnL?'Subject':'المادة'}</th>
          <th>${isEnL?'Teacher':'المعلم'}</th>
          <th>${isEnL?'Diag.':'تشخيص'}</th>
          <th>${isEnL?'F1':'ت1'}</th>
          <th>${isEnL?'F2':'ت2'}</th>
          <th>${isEnL?'HW':'واجبات'}</th>
          <th>${isEnL?'Portal':'بوابة'}</th>
          <th>${isEnL?'Activity':'نشاط'}</th>
          <th>LAB</th>
          <th>${isEnL?'Total':'المحصلة'}</th>
          <th>${isEnL?'Final':'نهائي'}</th>
        </tr></thead>
        <tbody>${tableRows||`<tr><td colspan="11" style="text-align:center;color:var(--grey-3);padding:20px">
          ${isEnL?'No grades yet — teacher will upload via Excel':'لا توجد درجات بعد — سيحدّثها المعلم من ملف Excel'}</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

// ── BEHAVIOR TAB ──
async function renderParentBehaviorTab(cls, studentName, mid, teachersList){
  const isEn  = currentLang==='en';
  const sName = studentName.trim();

  // Wait for DOM
  await new Promise(res=>setTimeout(res,100));
  const div = document.getElementById('parent-behavior-content');
  if(!div) return;
  div.innerHTML = `<div style="text-align:center;padding:24px;color:var(--grey-3)">⏳</div>`;

  let allLogs = [];

  // Read from every teacher's behaviorLog
  const promises = (teachersList||[]).map(tc=>
    db.ref('teacherData/'+tc.key+'/behaviorLog').once('value')
      .then(snap=>{
        if(!snap.exists()) return;
        const vals = Object.values(snap.val()||{});
        vals.forEach(e=>{
          if(!e||e.cls!==cls) return;
          if((e.name||'').trim()===sName)
            allLogs.push({...e,_teacher:tc.name,_subj:tc.subjLabel||''});
        });
      }).catch(()=>{})
  );


  await Promise.all(promises);
  allLogs.sort((a,b)=>(b.ts||b.date||'').localeCompare(a.ts||a.date||''));

  const violations = allLogs.filter(e=>e.violationId&&e.violationId!=='v0').length;
  const level   = violations===0?5:violations<=2?4:violations<=4?3:violations<=7?2:1;
  const bvInfo  = getBehaviorLevel(level);
  const color   = violations===0?'#2e7d32':violations<=2?'#1a9a9a':violations<=4?'#e65100':'#c62828';
  const bg      = violations===0?'#e8f5e9':violations<=2?'#e0f7f7':violations<=4?'#fff3e0':'#ffebee';

  const logRows = allLogs.map(e=>{
    const isV = e.violationId&&e.violationId!=='v0';
    const note = [e.violationLabel&&e.violationLabel!=='لا مخالفة'?e.violationLabel:'', e.academic, e.conduct, e.note].filter(Boolean).join(' · ');
    return `<div style="border-right:3px solid ${isV?'var(--red-soft)':'var(--green-soft)'};
      background:var(--white);border-radius:8px;padding:10px 14px;margin-bottom:8px;
      box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700;color:${isV?'var(--red-soft)':'var(--green-soft)'}">
          ${isV?'⚠️ مخالفة':'✅ إيجابي'}
        </span>
        <span style="font-size:11px;color:var(--grey-3)">${e.date||''}</span>
      </div>
      ${e._teacher?`<div style="font-size:11px;color:var(--grey-3);margin-bottom:4px">👨‍🏫 ${e._teacher}${e._subj?' · '+e._subj:''}</div>`:''}
      ${note?`<p style="margin:0;font-size:13px;color:var(--grey-2)">${note}</p>`:''}
    </div>`;
  }).join('');

  div.innerHTML = `
    <div style="background:${bg};border-right:4px solid ${color};border-radius:10px;
      padding:14px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:15px;font-weight:700;color:${color}">${bvInfo.icon} ${bvInfo.label}</div>
        <div style="font-size:12px;color:${color};margin-top:4px">${violations} ${isEn?'violation(s)':'مخالفة'} · ${allLogs.length} ${isEn?'total entries':'إجمالي الإدخالات'}</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:10px">
      🗒️ ${isEn?'Detailed Behavior Log':'سجل السلوك المفصّل'}
    </div>
    ${logRows||`<div class="empty-state" style="padding:20px"><div class="ico">✅</div><p>${isEn?'No behavior records yet':'لا توجد سجلات سلوكية بعد'}</p></div>`}`;
}



// ── INBOX ALL ──
async function renderParentInboxAll(cls, studentName, teachersList){
  const isEn  = currentLang==='en';
  const sName = studentName.trim();
  const div   = document.getElementById('parent-inbox-all');
  if(!div) return;

  const msgs = (APP.messages||[]).filter(m=>{
    if(!m||m.cls!==cls) return false;
    const n = (m.name||'').trim();
    if(!(n===sName || n.includes(sName) || sName.includes(n))) return false;
    const teacherKey = m._teacherKey || (m._src ? m._src.split('|')[0] : '');
    return !isParentMsgHidden('received', teacherKey, m);
  }).slice().reverse();

  const mi = {praise:'🌟', warning:'⚠️', info:'📘'};
  div.innerHTML = msgs.length
    ? msgs.map(m=>{
        const teacherKey = m._teacherKey || (m._src ? m._src.split('|')[0] : '');
        const tc = (teachersList||[]).find(t=>t.key===teacherKey);
        const subj = tc?.subjLabel || '';
        const idx = tc ? (teachersList||[]).findIndex(t=>t.key===teacherKey) : -1;
        return `
        <div class="msg-card" style="margin-bottom:10px">
          <div class="msg-header">
            <span class="msg-type ${m.type||'info'}">${mi[m.type]||'📘'} ${t((m.type||'info')+'Type')||''}${subj?' · '+escapeHtml(subj):''}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="msg-date">${m.date||''}</span>
              ${teacherKey ? parentMsgDeleteBtn('received', teacherKey, m, idx >= 0 ? idx : 'null') : ''}
            </div>
          </div>
          <p style="margin:4px 0 0;font-size:13px">${escapeHtml(m.body||'')}</p>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:24px"><div class="ico">📭</div>
        <p>${isEn?'No messages from teachers yet':'لا توجد رسائل من المعلمين بعد'}</p></div>`;
}




// ── SENT ALL ──
async function renderParentSentAll(cls, studentName, teachersList){
  const isEn  = currentLang==='en';
  const sName = studentName.trim();

  await new Promise(res=>setTimeout(res,200));
  const div = document.getElementById('parent-sent-all');
  if(!div) return;
  div.innerHTML = `<div style="text-align:center;padding:24px;color:var(--grey-3)">⏳</div>`;

  let allSent = [];

  const promises = (teachersList||[]).map(tc=>
    db.ref('teacherData/'+tc.key+'/parentMessages').once('value')
      .then(snap=>{
        if(!snap.exists()) return;
        Object.entries(snap.val()||{}).forEach(([id,m])=>{
          if(!m||m.cls!==cls) return;
          if((m.name||'').trim()===sName){
            const item = {
              ...m,
              id,
              _teacher: tc.name,
              _teacherKey: tc.key,
              _subj: m.subjLabel || tc.subjLabel || ''
            };
            if(!isParentMsgHidden('sent', tc.key, item)){
              allSent.push(item);
            }
          }
        });
      }).catch(()=>{})
  );


  await Promise.all(promises);
  allSent.sort((a,b)=>(b.ts||b.date||'').localeCompare(a.ts||a.date||''));

  div.innerHTML = allSent.length
    ? allSent.map(m=>{
        const idx = (teachersList||[]).findIndex(t=>t.key===m._teacherKey);
        return `
        <div style="background:var(--white);border:1px solid var(--grey-5);
          border-right:3px solid var(--teal-soft);border-radius:10px;padding:12px 14px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;align-items:center;gap:8px">
            <span style="font-size:11px;font-weight:700;color:var(--teal-mid)">
              📤 ${isEn?'To':'إلى'}: ${escapeHtml(m._teacher||'المعلم')}${m._subj?' · '+escapeHtml(m._subj):''}
            </span>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--grey-3)">${m.date||''}</span>
              ${m._teacherKey ? parentMsgDeleteBtn('sent', m._teacherKey, m, idx >= 0 ? idx : 'null') : ''}
            </div>
          </div>
          <p style="margin:0;font-size:13px;color:var(--grey-2);white-space:pre-line">${escapeHtml(m.body||'')}</p>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:24px"><div class="ico">📤</div><p>${isEn?'No sent messages yet':'لا توجد رسائل مرسلة بعد'}</p></div>`;
}


async function loadSubjectTabContent(idx, cls, studentName, mid, teachersList){
  const section = window._currentParent?.section || window._parentSubjectContext?.section || '';
  window._parentSubjectContext = {cls,name:studentName,mid,teachers:teachersList,section};
  const container = document.getElementById('subj-content-'+idx);
  if(!container) return;
  const tc   = teachersList[idx];
  if(!tc||!tc.key) return;
  const isEn = currentLang==='en';
  const sName   = studentName.trim();

  let gradeData=null, messages=[], behaviorLog=[];

  if(typeof db!=='undefined'){
    try{
      const [gData, mSnap, bSnap] = await Promise.all([
        fetchTeacherGradeRecord(tc.key, cls, section, mid, sName),
        db.ref('teacherData/'+tc.key+'/messages').once('value'),
        db.ref('teacherData/'+tc.key+'/behaviorLog').once('value'),
      ]);
      gradeData = gData;
      if(mSnap.exists()){
        messages = Object.entries(mSnap.val()||{})
          .map(([id,m])=>({id,...m}))
          .filter(m=>m&&m.cls===cls&&(m.name||'').trim()===sName)
          .filter(m=>!isParentMsgHidden('received', tc.key, m));
      }
      if(bSnap.exists()){
        behaviorLog = Object.values(bSnap.val()||{})
          .filter(e=>e&&e.cls===cls&&(e.name||'').trim()===sName);
      }
      if(mid){
        const aSnap = await db.ref('parentAdminInbox/'+mid).once('value');
        syncParentAdminInbox(mid, cls, sName, aSnap);
      }
    }catch(e){ console.warn('loadSubjectTabContent:',e); }
  }

  // Merge into APP for behavior/messages tabs (replace this teacher's slice for this student)
  const msgTag = tc.key + '|msg';
  const bvTag = tc.key + '|bv';
  APP.messages = (APP.messages || []).filter(m => m._src !== msgTag);
  messages.forEach(m => APP.messages.push({ ...m, _src: msgTag }));
  APP.behaviorLog = (APP.behaviorLog || []).filter(e => e._src !== bvTag);
  behaviorLog.forEach(e => APP.behaviorLog.push({ ...e, _src: bvTag }));

  const violations = behaviorLog.filter(e=>e.violationId&&e.violationId!=='v0').length;
  const bvLevel = violations===0?5:violations<=2?4:violations<=4?3:violations<=7?2:1;
  const bvInfo  = getBehaviorLevel(bvLevel);
  const color   = violations===0?'#2e7d32':violations<=2?'#1a9a9a':violations<=4?'#e65100':'#c62828';
  const bg      = violations===0?'#e8f5e9':violations<=2?'#e0f7f7':violations<=4?'#fff3e0':'#ffebee';

  const gd = gradeData||{};
  const gradeHtml = gradeData ? `
    <div class="parent-subject-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="section-title" style="margin:0">📊 ${isEn?'Subject Grades':'سجل المادة'}</div>
      <span style="font-size:11px;color:var(--grey-3)">🔄 ${isEn?'Live sync':'تحديث فوري'}</span>
    </div>
    ${buildParentWeeklyGradeTable(gd, isEn)}
    <div style="text-align:center;background:var(--teal-pale);border-radius:8px;padding:10px;margin-bottom:14px">
      <span style="font-size:22px;font-weight:800;color:var(--teal-dark)">${(gd.total||0).toFixed(1)}%</span>
      <span style="margin-right:8px">${gradeBadge(gd.total||0)}</span>
    </div></div>` : `<div class="empty-state" style="padding:20px;margin-bottom:14px">
      <div class="ico">📊</div>
      <p style="font-size:13px">${isEn?'No grades yet — teacher will upload via Excel':'لا توجد درجات بعد — سيحدّثها المعلم من ملف Excel'}</p>
    </div>`;

  const bvHtml = `<div style="background:${bg};border-right:3px solid ${color};border-radius:8px;
    padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:13px;font-weight:600;color:${color}">${bvInfo.icon} ${bvInfo.label}</span>
    ${violations?`<span style="font-size:12px;color:${color}">${violations} ${isEn?'violation(s)':'مخالفة'}</span>`:''}
  </div>`;

  const mi={praise:'🌟',warning:'⚠️',info:'📘'};
  const msgsHtml = messages.length
    ? `<div class="section-title" style="margin-bottom:8px">💬 ${isEn?'Teacher Messages':'رسائل المعلم'}</div>`
      +[...messages].reverse().map(m=>`
        <div class="msg-card" style="margin-bottom:8px">
          <div class="msg-header">
            <span class="msg-type ${m.type||'info'}">${mi[m.type]||'📘'}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="msg-date">${m.date||''}</span>
              ${parentMsgDeleteBtn('received', tc.key, m, idx)}
            </div>
          </div><p style="margin:4px 0 0">${escapeHtml(m.body||'')}</p>
        </div>`).join('')
    : `<div class="empty-state" style="padding:16px"><div class="ico" style="font-size:24px">📭</div>
        <p style="font-size:13px">${t('noMessages')}</p></div>`;

  const firstName = sName.split(' ')[0];
  const quickBtns = ['q1','q2','q3','q4','q5','q6'].map(key=>{
    const labels={
      q1:{ar:'📊 استفسار عن الدرجات',en:'📊 Grades Inquiry'},
      q2:{ar:'🧑‍🎓 وضع السلوك',en:'🧑‍🎓 Behavior Inquiry'},
      q3:{ar:'📅 طلب موعد زيارة',en:'📅 Request Meeting'},
      q4:{ar:'📚 طلب دعم إضافي',en:'📚 Extra Support'},
      q5:{ar:'📝 الواجبات المطلوبة',en:'📝 Homework Inquiry'},
      q6:{ar:'🙏 شكر وتقدير',en:'🙏 Thanks'},
    };
    const lbl = isEn?labels[key].en:labels[key].ar;
    return `<button onclick="selectQuickSubj(this,'${key}','${idx}','${firstName}')"
      style="font-size:11px;padding:6px 10px;border:1.5px solid var(--teal-soft);
      background:var(--teal-pale);color:var(--teal-dark);border-radius:20px;cursor:pointer;
      font-family:inherit;margin:3px">${lbl}</button>`;
  }).join('');

  container.innerHTML = gradeHtml + bvHtml + msgsHtml + `
    <div id="parent-admin-msgs-${idx}" style="margin-top:14px"></div>
    <div class="parent-msg-box" style="margin-top:14px">
      <h4 style="font-size:14px;font-weight:700;color:var(--teal-dark);margin-bottom:10px">
        ✉️ ${isEn?'Send Message to':'أرسل رسالة إلى'} ${tc.name}
      </h4>
      <div style="margin-bottom:10px;flex-wrap:wrap">${quickBtns}</div>
      <textarea id="subj-msg-input-${idx}" class="parent-msg-textarea"
        placeholder="${isEn?'Write your message...':'اكتب رسالتك...'}" rows="4"></textarea>
      <button class="parent-msg-send" id="parent-msg-send-${idx}"
        onclick="sendParentMsgToTeacher('${idx}','${tc.key}','${cls}','${studentName.replace(/'/g,"\\'")}')">
        ${isEn?'Send Message ←':'إرسال الرسالة ←'}
      </button>
      <div id="parent-msg-confirm-${idx}" class="parent-msg-confirm" style="display:none">
        ✅ ${isEn?'Message sent!':'تم الإرسال!'}
      </div>
      <div id="parent-sent-log-${idx}" style="margin-top:12px"></div>
    </div>
    <div class="parent-complaint-box" style="margin-top:14px">
      <button type="button" class="parent-complaint-toggle" id="parent-complaint-toggle-${idx}"
        onclick="toggleParentComplaintForm('${idx}')">
        📢 ${isEn?'Submit Complaint':'تقديم شكوى'}
      </button>
      <p style="font-size:11px;color:var(--grey-3);margin:8px 0 0;line-height:1.6">
        ${isEn?'Sent to school admin only — not visible to the teacher until forwarded.':'تُرسل للمسؤول فقط — لا يراها المعلم إلا بعد توجيهها من الإدارة.'}
      </p>
      <div id="parent-complaint-form-${idx}" class="parent-complaint-form" style="display:none;margin-top:12px">
        <textarea id="parent-complaint-input-${idx}" class="parent-msg-textarea" rows="4"
          placeholder="${isEn?'Describe your complaint...':'اكتب نص الشكوى...'}"></textarea>
        <button type="button" class="parent-msg-send" style="background:#e65100;margin-top:8px"
          onclick="submitParentComplaint('${idx}','${tc.key}','${cls}','${studentName.replace(/'/g,"\\'")}','${mid}')">
          ${isEn?'Send Complaint ←':'إرسال الشكوى ←'}
        </button>
        <div id="parent-complaint-confirm-${idx}" class="parent-msg-confirm" style="display:none">
          ✅ ${isEn?'Complaint sent to admin!':'تم إرسال الشكوى للمسؤول!'}
        </div>
      </div>
      <div id="parent-sent-complaints-${idx}" style="margin-top:12px"></div>
    </div>`;

  renderSubjectSentLog(idx, tc.key, cls, studentName);
  renderSubjectSentComplaintsLog(idx, tc.key, cls, studentName);
  renderParentAdminMessages(idx, tc.key, cls, studentName);
  _refreshSubjectTabBadge(idx, cls, studentName, tc.key);
}


function selectQuickSubj(btn, key, idx, firstName){
  const lang = currentLang==='en'?'en':'ar';
  const { subjLabel } = getSubjectTeacherContext(idx);
  const tplFn = PARENT_MSG_TEMPLATES[lang]?.[key];
  const text  = tplFn ? (tplFn.length > 1 ? tplFn(firstName, subjLabel) : tplFn(firstName)) : '';
  const ta    = document.getElementById('subj-msg-input-'+idx);
  if(ta) ta.value = text;
  document.querySelectorAll('[onclick*="selectQuickSubj"]').forEach(b=>{
    b.style.background='var(--teal-pale)'; b.style.borderColor='var(--teal-soft)'; b.style.color='var(--teal-dark)';
  });
  btn.style.background = 'var(--teal-mid)';
  btn.style.borderColor= 'var(--teal-dark)';
  btn.style.color      = '#fff';
}


async function sendParentMsgToTeacher(idx, teacherKey, cls, studentName){
  const body = (
    document.getElementById('subj-msg-input-'+idx)?.value ||
    document.getElementById('parent-msg-input-'+idx)?.value || ''
  ).trim();
  if(!body){
    const ta = document.getElementById('subj-msg-input-'+idx)||document.getElementById('parent-msg-input-'+idx);
    if(ta){ ta.style.borderColor='var(--red-soft)'; setTimeout(()=>{ ta.style.borderColor=''; },1500); }
    showToast(currentLang==='en' ? 'Please write a message' : 'يرجى كتابة الرسالة');
    return;
  }
  if(!teacherKey || typeof db==='undefined'){
    showToast(currentLang==='en' ? 'Cannot send — not connected' : 'تعذّر الإرسال — لا يوجد اتصال');
    return;
  }

  const isEn = currentLang==='en';
  const { subjLabel, subject } = getSubjectTeacherContext(idx);
  const d = new Date();
  const msg = {
    cls,
    name: studentName,
    body,
    subject,
    subjLabel,
    teacherKey,
    date: d.toLocaleDateString('ar-AE')+' '+d.toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit'}),
    ts: d.toISOString()
  };

  const sendBtn = document.querySelector('#subj-content-'+idx+' .parent-msg-send');
  const btnLabel = sendBtn ? sendBtn.textContent : '';
  if(sendBtn){ sendBtn.disabled = true; sendBtn.textContent = isEn ? 'Sending…' : 'جارٍ الإرسال…'; }

  try{
    const fbId = await window.fbPushParentMsg(teacherKey, msg);
    if(fbId) msg.id = fbId;
    APP.parentMessages = APP.parentMessages || [];
    APP.parentMessages.push({ ...msg, _src: teacherKey + '|pm', _teacherKey: teacherKey });
    saveState();

    const ta = document.getElementById('subj-msg-input-'+idx)||document.getElementById('parent-msg-input-'+idx);
    if(ta) ta.value='';
    const conf = document.getElementById('parent-msg-confirm-'+idx);
    if(conf){ conf.style.display='block'; setTimeout(()=>conf.style.display='none',3000); }
    renderSubjectSentLog(idx, teacherKey, cls, studentName);
    showToast(isEn ? '✅ Message sent' : '✅ تم إرسال الرسالة');
  }catch(err){
    console.error(err);
    showToast(isEn ? '❌ Send failed' : '❌ فشل الإرسال');
  }finally{
    if(sendBtn){ sendBtn.disabled = false; sendBtn.textContent = btnLabel || (isEn ? 'Send Message ←' : 'إرسال الرسالة ←'); }
  }
}


function renderSubjectSentLog(idx, teacherKey, cls, studentName){
  const div  = document.getElementById('parent-sent-log-'+idx);
  if(!div) return;
  const isEn = currentLang==='en';
  const sName= studentName.trim();
  const myMsgs = (APP.parentMessages||[]).filter(m=>{
    if(!m||m.cls!==cls) return false;
    if((m.name||'').trim()!==sName) return false;
    const tk = m._teacherKey || m.teacherKey || '';
    if(tk && tk !== teacherKey) return false;
    return !isParentMsgHidden('sent', teacherKey, m);
  }).slice().reverse();

  if(!myMsgs.length){ div.innerHTML=''; return; }
  div.innerHTML = '<div style="margin-top:12px">'
    +'<h4 style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:8px;border-bottom:2px solid var(--teal-light);padding-bottom:6px">'
    +(isEn?'📋 Sent Messages':'📋 رسائلي المرسلة')+'</h4>'
    +myMsgs.map(m=>`
      <div style="background:var(--white);border:1px solid var(--grey-5);
        border-right:3px solid var(--teal-soft);border-radius:10px;padding:10px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
          <span style="font-size:11px;font-weight:700;color:var(--teal-mid)">📤 ${isEn?'Sent':'أُرسلت'}${m.subjLabel?' · '+escapeHtml(m.subjLabel):''}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;color:var(--grey-3)">${m.date||''}</span>
            ${parentMsgDeleteBtn('sent', teacherKey, m, idx)}
          </div>
        </div>
        <p style="margin:0;font-size:13px;color:var(--grey-2);white-space:pre-line">${escapeHtml(m.body||'')}</p>
      </div>`).join('')
    +'</div>';
}

function parentComplaintStatusLabel(status, isEn){
  if(status==='forwarded') return isEn?'Forwarded to teacher':'مُوجّهة للمعلم';
  if(status==='forwarded_anonymous') return isEn?'Forwarded (general)':'مُوجّهة (شكوى عامة)';
  if(status==='replied') return isEn?'Admin replied':'تم الرد من المسؤول';
  return isEn?'Under review':'قيد المراجعة';
}

function parentComplaintHideKey(complaint){
  return (complaint.id || complaint.ts || '') + '|' + (complaint._teacherKey || complaint.teacherKey || '');
}

function isParentComplaintHidden(complaint){
  return getParentHiddenMsgIds('complaint').includes(parentComplaintHideKey(complaint));
}

function parentComplaintDeleteBtn(complaint, idx){
  const isEn = currentLang === 'en';
  const enc = encodeURIComponent(parentComplaintHideKey(complaint));
  return `<button type="button" class="parent-msg-del" onclick="hideParentSentComplaint('${enc}',${idx == null ? 'null' : idx})" title="${isEn ? 'Hide on my device' : 'إخفاء من جهازي'}">🗑️</button>`;
}

function hideParentSentComplaint(encodedHideId, idx){
  addParentHiddenMsgId('complaint', decodeURIComponent(encodedHideId));
  showToast(currentLang === 'en' ? '✅ Complaint hidden' : '✅ تم إخفاء الشكوى');
  const ctx = window._parentSubjectContext;
  if(ctx && idx != null){
    renderSubjectSentComplaintsLog(idx, (ctx.teachers||[])[idx]?.key, ctx.cls, ctx.name);
  }
}

function renderSubjectSentComplaintsLog(idx, teacherKey, cls, studentName){
  const div = document.getElementById('parent-sent-complaints-'+idx);
  if(!div) return;
  const isEn = currentLang==='en';
  const sName = studentName.trim();
  const myComplaints = (APP.parentComplaints||[]).filter(c=>{
    if(!c || c.cls!==cls) return false;
    if((c.studentName||'').trim()!==sName) return false;
    const tk = c._teacherKey || c.teacherKey || '';
    if(tk && tk !== teacherKey) return false;
    return !isParentComplaintHidden(c);
  }).slice().sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));

  if(!myComplaints.length){ div.innerHTML=''; return; }
  div.innerHTML = '<div style="margin-top:12px">'
    +'<h4 style="font-size:13px;font-weight:700;color:#e65100;margin-bottom:8px;border-bottom:2px solid #ffcc80;padding-bottom:6px">'
    +(isEn?'📋 My Sent Complaints':'📋 شكاواي المرسلة')+'</h4>'
    +myComplaints.map(c=>`
      <div class="parent-sent-complaint-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;color:#e65100">📢 ${escapeHtml(c.subjLabel||c.subject||'—')}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="parent-complaint-status-pill ${c.status||'pending'}">${parentComplaintStatusLabel(c.status, isEn)}</span>
            <span style="font-size:11px;color:var(--grey-3)">${c.date||''}</span>
            ${parentComplaintDeleteBtn(c, idx)}
          </div>
        </div>
        <div class="parent-sent-complaint-meta">
          <span>👨‍🎓 ${escapeHtml(displayStudentName(c.studentName, c.cls, c.section, c.mid))}</span>
          <span>👨‍🏫 ${escapeHtml(c.teacherName||'—')}</span>
          <span>📚 ${isEn?'Grade':'صف'} ${escapeHtml(c.cls||'—')} · ${isEn?'Sec':'ش'} ${escapeHtml(c.section||'—')}</span>
          <span>🆔 ${escapeHtml(c.mid||'—')}</span>
        </div>
        <p style="margin:0;font-size:13px;color:var(--grey-2);white-space:pre-line;line-height:1.7">${escapeHtml(c.body||'')}</p>
      </div>`).join('')
    +'</div>';
}

function renderParentView(cls,name){
  window._currentParent = enrichParentSession(cls, name, pendingLogin?.mid||'', pendingLogin?.section||'');
  const body=document.getElementById('parent-body');
  const student=getGradeStudents(cls).find(s=>s.name===name);
  if(!student){ body.innerHTML='<div class="empty-state"><div class="ico">❌</div><p>'+t('notFound')+'</p></div>'; return; }
  const tot=student.total;
  const grade=getGrade(tot);
  const ringColor=tot>=90?'#2e7d32':tot>=80?'#1a9a9a':tot>=70?'#c8961e':'#e53935';
  const r=44,circ=2*Math.PI*r,dash=(tot/100)*circ;
  const msgs=APP.messages.filter(m=>m.name===name&&m.cls===cls);
  const mi={praise:'🌟',warning:'⚠️',info:'📘'};
  const ml={praise:t('praiseType'),warning:t('warningType'),info:t('infoType')};
  // الترتيب
  const classStudents=[...getGradeStudents(cls)].sort((a,b)=>b.total-a.total);
  const rank=classStudents.findIndex(s=>s.name===name)+1;
  const classSize=classStudents.length;
  const rankMedal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
  // السلوك
  const bvKey=cls+'|'+name;
  const bv=APP.behavior[bvKey]||{level:5,academic:'',conduct:''};
  // احسب مستوى السلوك مباشرة من السجل (ليس من القيمة المخزنة)
  const liveLevel = calcBehaviorLevel(cls, name);
  const bvInfo=getBehaviorLevel(liveLevel);
  // التقرير
  const reportText=generateReport(student,cls,rank,t,classSize);

  body.innerHTML=`
    <div class="student-card">
      <div class="student-avatar">🎓</div>
      <div class="student-name">${displayStudentName(student)}</div>
      <div class="student-meta">${t('classLabel')} ${cls} · ${t('scienceGrade')}</div>
      <div class="score-ring-wrap">
        <div class="score-ring">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e8f0f0" stroke-width="10"/>
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="${ringColor}" stroke-width="10"
              stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
          </svg>
          <div class="score-ring-label"><span class="val">${tot.toFixed(1)}</span><span class="lbl">${grade}</span></div>
        </div>
      </div>
      <div class="rank-badge">
        <span class="rank-num">${rankMedal||'#'}${rank}</span>
        <div class="rank-lbl">
          <div style="font-weight:700;color:var(--grey-1)">${t('rankLabel')}</div>
          <div style="font-size:12px;color:var(--grey-3)">${t('rankFrom')} ${classSize} ${t('rankStudents')}</div>
        </div>
      </div>
      <div class="breakdown-grid">
        <div class="breakdown-item"><span class="ico">📝</span><div class="info"><div class="name">${t('t1')}</div><div class="score">${student.t1.toFixed(1)}%</div></div></div>
        <div class="breakdown-item"><span class="ico">📝</span><div class="info"><div class="name">${t('t2')}</div><div class="score">${student.t2.toFixed(1)}%</div></div></div>
        <div class="breakdown-item"><span class="ico">📚</span><div class="info"><div class="name">${t('hw')}</div><div class="score">${student.hw.toFixed(1)}%</div></div></div>
        <div class="breakdown-item"><span class="ico">🖥️</span><div class="info"><div class="name">${t('portal')}</div><div class="score">${student.portal.toFixed(1)}%</div></div></div>
        <div class="breakdown-item"><span class="ico">🏫</span><div class="info"><div class="name">${t('activity')}</div><div class="score">${student.activity.toFixed(0)}%</div></div></div>
        <div class="breakdown-item"><span class="ico">🔬</span><div class="info"><div class="name">${t('lab')}</div><div class="score">${student.lab}%</div></div></div>
      </div>
    </div>

    <div class="report-card">
      <h4>📋 ${t('reportCardTitle')}</h4>
      <p>${reportText}</p>
    </div>

    <div class="notes-section">
      <div class="notes-half">
        <h4>🧑‍🎓 ${t('generalBehavior')}</h4>
        ${(()=>{
          const logs = (APP.behaviorLog||[]).filter(e=>e.cls===cls&&e.name===name);
          const total = logs.length;
          const violations = logs.filter(e=>e.violationId && e.violationId!=='v0').length;
          const goodPct = total ? Math.round(((total-violations)/total)*100) : 100;
          const color = violations===0?'#2e7d32':violations<=2?'#1a9a9a':violations<=4?'#e65100':'#c62828';
          const bg    = violations===0?'#e8f5e9':violations<=2?'#e0f7f7':violations<=4?'#fff3e0':'#ffebee';
          const badge = violations===0?('🌟 '+t('noViolations')):violations===1?('✅ '+t('oneViolation')):('⚠️ '+violations+' '+t('violations'));
          return '<div id="parent-bv-badge-box" style="background:'+bg+';border-right:4px solid '+color+';border-radius:10px;padding:14px 16px;margin-top:10px">'
            +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            +'<span style="font-size:13px;font-weight:700;color:'+color+'">'+badge+'</span>'
            +'<strong style="font-size:20px;color:'+color+'">'+goodPct+'%</strong>'
            +'</div>'
            +'<div style="background:rgba(0,0,0,0.08);border-radius:20px;height:8px;overflow:hidden">'
            +'<div style="width:'+goodPct+'%;height:100%;background:'+color+';border-radius:20px;transition:width .6s"></div>'
            +'</div>'
            +(total?'<div style="font-size:11px;color:'+color+';margin-top:6px;opacity:.8">'+violations+' '+t('violationsLabel')+' '+total+' '+t('log')+'</div>':'')
            +'</div>';
        })()}
        <span id="parent-bv-badge-level" class="behavior-badge ${bvInfo.badge}" style="margin-top:10px">${bvInfo.icon} ${bvInfo.label}</span>
      </div>
      <div class="notes-half">
        <h4 style="color:var(--teal-dark)">${t('academicStatus')}</h4>
        ${(()=>{
          const tot = student.total||0;
          const acColor = tot>=85?'#1b5e20':tot>=70?'#1a9a9a':tot>=60?'#e65100':'#c62828';
          const bar = '<div style="display:flex;gap:24px;align-items:flex-end;justify-content:center;margin-top:8px">'
            +'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">'
            +'<div style="width:100%;background:var(--grey-5);border-radius:8px 8px 0 0;height:100px;display:flex;align-items:flex-end;overflow:hidden">'
            +'<div style="width:100%;height:'+Math.min(100,tot)+'%;background:'+acColor+';border-radius:8px 8px 0 0;transition:height .6s"></div>'
            +'</div>'
            +'<span style="font-size:12px;font-weight:700;color:'+acColor+'">'+tot.toFixed(1)+'%</span>'
            +'<span style="font-size:11px;color:var(--grey-3)">'+t('academicBar')+'</span>'
            +'</div>'
            +'<div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex:1">'
            +'<div style="width:100%;background:var(--grey-5);border-radius:8px 8px 0 0;height:100px;display:flex;align-items:flex-end;overflow:hidden">'
            +'<div style="width:100%;height:'+(100-Math.min(100,tot))+'%;background:#e0e0e0;border-radius:8px 8px 0 0;transition:height .6s"></div>'
            +'</div>'
            +'<span style="font-size:12px;font-weight:700;color:var(--grey-3)">'+(100-Math.min(100,Math.round(tot)))+'%</span>'
            +'<span style="font-size:11px;color:var(--grey-3)">'+t('remaining')+'</span>'
            +'</div></div>';
          const lastNote = (APP.behaviorLog||[]).filter(e=>e.cls===cls&&e.name===name&&e.academic).reverse();
          const noteText = lastNote.length ? lastNote[0].academic : (bv.academic||'');
          return bar+(noteText?'<p style="font-size:12px;color:var(--grey-2);margin-top:8px;text-align:center">'+noteText+'</p>':'');
        })()}
      </div>
      <div class="notes-half">
        <h4 style="color:var(--gold)">🤝 ${t('conductNotes')}</h4>
        <p>${(()=>{
          const logs = (APP.behaviorLog||[]).filter(e=>e.cls===cls&&e.name===name&&e.conduct).reverse();
          return logs.length ? logs[0].conduct : (bv.conduct||t('noConduct'));
        })()}</p>
      </div>
    </div>

    ${msgs.length?`
      <div class="section-title">💬 ${t('teacherMsg')}</div>
      ${msgs.map(m=>`<div class="msg-card">
        <div class="msg-header">
          <span class="msg-type ${m.type}">${mi[m.type]} ${ml[m.type]}</span>
          <span class="msg-date">${m.date}</span>
        </div><p>${m.body}</p>
      </div>`).join('')}`:''}

    <div style="text-align:center;font-size:12px;color:var(--grey-3);margin-top:24px;padding:16px">
      📌 ${t('footer')}
    </div>

    <div class="parent-tabs-wrap">
      <button class="parent-tab active" onclick="switchParentTab('outbox',this)" id="tab-btn-outbox">${t('outbox')}</button>
      <button class="parent-tab" id="tab-btn-inbox" onclick="switchParentTab('inbox',this)">${t('inbox')}</button>
      <button class="parent-tab" id="tab-btn-bvlog" onclick="switchParentTab('bvlog',this)">${t('bvlog')}</button>
    </div>

    <div id="ptab-outbox" class="parent-tab-content active">
      <div class="parent-msg-box" id="parent-msg-box-div">
        <h4 class="parent-msg-title" id="pmsg-title">${t('sendMsgTitle')}</h4>
        <p class="parent-msg-sub" id="pmsg-sub">${t('sendMsgSub')}</p>
        <div class="quick-btns" id="quick-btns-wrap">
          <button class="quick-btn" id="qb1" onclick="selectQuick(this,'q1')">${t('q1l')}</button>
          <button class="quick-btn" id="qb2" onclick="selectQuick(this,'q2')">${t('q2l')}</button>
          <button class="quick-btn" id="qb3" onclick="selectQuick(this,'q3')">${t('q3l')}</button>
          <button class="quick-btn" id="qb4" onclick="selectQuick(this,'q4')">${t('q4l')}</button>
          <button class="quick-btn" id="qb5" onclick="selectQuick(this,'q5')">${t('q5l')}</button>
          <button class="quick-btn" id="qb6" onclick="selectQuick(this,'q6')">${t('q6l')}</button>
        </div>
        <textarea id="parent-msg-input" class="parent-msg-textarea" placeholder="${t('msgPlaceholder')}" rows="3"></textarea>
        <button class="parent-msg-send" id="pmsg-send-btn" onclick="sendParentMessage(window._currentParent.cls,window._currentParent.name)">${t('sendBtn')}</button>
        <div id="parent-msg-confirm" class="parent-msg-confirm" style="display:none">${t('msgConfirm')}</div>
      </div>
      <!-- Sent Messages Log -->
      <div id="parent-sent-log" style="margin-top:16px"></div>
    </div>
    <div id="ptab-inbox" class="parent-tab-content" style="display:none">
      <div id="parent-teacher-msgs">
        <div class="empty-state" style="padding:32px 16px"><div class="ico">📭</div><p>${t('loading')}</p></div>
      </div>
    </div>

    <div id="ptab-bvlog" class="parent-tab-content" style="display:none">
      <div id="parent-bv-log">
        <div class="empty-state" style="padding:32px 16px"><div class="ico">📋</div><p>${t('loading')}</p></div>
      </div>
    </div>`;
  setTimeout(function(){
    refreshParentInbox(cls, name);
    renderParentBvLog(cls, name);
    renderParentSentLog(cls, name);
    renderNotifButton();
    updateParentBadges(cls, name);
    // افتح تبويب الرسائل تلقائياً إذا كان هناك رسائل
    const myMsgs = APP.messages.filter(m=>m.cls===cls&&m.name===name);
    if(myMsgs.length){
      const inboxTab = document.getElementById('tab-btn-inbox');
      if(inboxTab) switchParentTab('inbox', inboxTab);
    }
    // Poll until Firebase delivers data (max 5s)
      let _retryCount = 0;
      const _pollParent = function(){
        _retryCount++;
        if(_retryCount > 10) return;
        refreshParentInbox(cls, name);
        renderParentBvLog(cls, name);
        updateParentBadges(cls, name);
        const msgs = APP.messages.filter(m=>m.cls===cls&&m.name===name);
        const logs = (APP.behaviorLog||[]).filter(e=>e.cls===cls&&e.name===name);
        if(!msgs.length && !logs.length) setTimeout(_pollParent, 500);
      };
      if(!window._fbReady) setTimeout(_pollParent, 500);
  }, 100);
}


function updateParentBehaviorBox(cls, name){
  const box  = document.getElementById('parent-bv-badge-box');
  const span = document.getElementById('parent-bv-badge-level');
  if(!box && !span) return;

  const logs = (APP.behaviorLog||[]).filter(e=>e.cls===cls&&e.name===name);
  const total = logs.length;
  const violations = logs.filter(e=>e.violationId && e.violationId!=='v0').length;
  const goodPct = total ? Math.round(((total-violations)/total)*100) : 100;
  const color = violations===0?'#2e7d32':violations<=2?'#1a9a9a':violations<=4?'#e65100':'#c62828';
  const bg    = violations===0?'#e8f5e9':violations<=2?'#e0f7f7':violations<=4?'#fff3e0':'#ffebee';
  const badge = violations===0?('🌟 '+t('noViolations')):violations===1?('✅ '+t('oneViolation')):('⚠️ '+violations+' '+t('violations'));

  if(box){
    box.style.background = bg;
    box.style.borderRightColor = color;
    // Update content
    const badgeEl = box.querySelector('span:first-child');
    const pctEl   = box.querySelector('strong');
    const barEl   = box.querySelector('div > div');
    if(badgeEl){ badgeEl.style.color = color; badgeEl.textContent = badge; }
    if(pctEl)  { pctEl.style.color = color; pctEl.textContent = goodPct+'%'; }
    if(barEl)  { barEl.style.width = goodPct+'%'; barEl.style.background = color; }
    // Update violations count line
    const countEl = box.querySelector('div[style*="opacity"]');
    if(countEl && total){
      countEl.style.color = color;
      countEl.textContent = violations+' '+t('violationsLabel')+' '+total+' '+t('log');
    }
  }

  // Update level badge
  if(span){
    const level = calcBehaviorLevel(cls, name);
    const bvInfo = getBehaviorLevel(level);
    // Remove old level classes
    span.className = 'behavior-badge '+bvInfo.badge;
    span.textContent = bvInfo.icon+' '+bvInfo.label;
  }
}
function renderParentBvLog(cls, name){
  const div = document.getElementById('parent-bv-log');
  if(!div) return;
  // Update the behavior badge in student card too
  updateParentBehaviorBox(cls, name);
  const logs = [...(APP.behaviorLog||[])].filter(e=>e.cls===cls&&e.name===name).reverse();
  const level  = calcBehaviorLevel(cls, name);
  const bvInfo = getBehaviorLevel(level);
  const todayLocale = currentLang==='en' ? 'en-US' : 'ar-AE';
  const today  = new Date().toLocaleDateString(todayLocale);

  // عنوان المخالفات
  let html = '<div style="font-size:14px;font-weight:700;color:var(--teal-dark);margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--teal-light)">'+t('violationsTitle')+'</div>';

  if(!logs.length){
    html += '<div style="text-align:center;padding:16px;color:var(--grey-3);font-size:13px">'+t('noViolationsLog')+'</div>';
  } else {
    html += logs.map(e=>{
      const v = VIOLATIONS.find(x=>x.id===e.violationId)||{label:t('noViolationsText'),icon:'✅'};
      if(!v.label || v.label===t('noViolationsText')) return '';
      return '<div style="border:1px solid var(--red-pale);border-right:3px solid var(--red-soft);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--white)">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +'<span style="background:var(--red-pale);color:var(--red-soft);padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">'+v.icon+' '+v.label+'</span>'
        +'<span style="font-size:11px;color:var(--grey-3)">'+( e.date||'')+'</span>'
        +'</div>'
        +(e.academic?'<div style="font-size:12px;color:var(--grey-2);margin-top:4px">📖 '+e.academic+'</div>':'')
        +(e.conduct?'<div style="font-size:12px;color:var(--grey-2);margin-top:2px">🤝 '+e.conduct+'</div>':'')
        +'</div>';
    }).filter(Boolean).join('') || '<div style="text-align:center;padding:16px;color:var(--grey-3);font-size:13px">'+t('noViolationsLog')+'</div>';
  }

  // مستوى السلوك في الأسفل
  html += '<div style="margin-top:16px;padding-top:12px;border-top:2px solid var(--grey-5)">'
    +'<div style="font-size:13px;font-weight:700;color:var(--grey-2);margin-bottom:8px">'+t('bvLevelTitle')+' '+today+'</div>'
    +'<div style="display:flex;align-items:center;gap:10px;background:var(--teal-pale);border-radius:10px;padding:12px 16px">'
    +'<span style="font-size:24px">'+bvInfo.icon+'</span>'
    +'<div>'
    +'<div style="font-size:12px;color:var(--grey-3)">'+t('bvLevelLabel')+'</div>'
    +'<div style="font-size:16px;font-weight:700;color:var(--teal-dark)">'+bvInfo.label+'</div>'
    +'</div></div></div>';

  div.innerHTML = html;
}

function refreshParentInbox(cls, name){
  const div = document.getElementById('parent-teacher-msgs');
  if(!div) return;
  const myMsgs = APP.messages.filter(m => {
    if(m.name!==name || m.cls!==cls) return false;
    const teacherKey = m._teacherKey || (m._src ? m._src.split('|')[0] : '');
    return !isParentMsgHidden('received', teacherKey, m);
  });
  const icons  = {praise:'🌟', warning:'⚠️', info:'📘'};
  const labels = {praise:t('praiseType'), warning:t('warningType'), info:t('infoType')};
  if(!myMsgs.length){
    div.innerHTML = '<div class="empty-state" style="padding:32px 16px"><div class="ico">📭</div><p>'+t('noMessages')+'</p></div>';
  } else {
    div.innerHTML = [...myMsgs].reverse().map(m => {
      const teacherKey = m._teacherKey || (m._src ? m._src.split('|')[0] : '');
      const idx = (window._parentSubjectContext?.teachers||[]).findIndex(t=>t.key===teacherKey);
      return '<div class="msg-card">' +
        '<div class="msg-header">' +
          '<span class="msg-type ' + (m.type||'info') + '">' + (icons[m.type]||'📘') + ' ' + (labels[m.type]||'message') + '</span>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="msg-date">' + (m.date||m.ts||'') + '</span>' +
            (teacherKey ? parentMsgDeleteBtn('received', teacherKey, m, idx >= 0 ? idx : 'null') : '') +
          '</div>' +
        '</div>' +
        '<p>' + escapeHtml(m.body||'') + '</p>' +
      '</div>';
    }).join('');
  }
}

// ══════════════════════════════════════════════════
//  BEHAVIOR — نظام السلوك والمخالفات
// ══════════════════════════════════════════════════

// قائمة المخالفات
const VIOLATIONS = [
  {id:'v0',  label:'لا مخالفة',          labelEn:'No Violation',          icon:'✅', cls:'v-good', weight:0},
  {id:'v1',  label:'الكلام دون إذن',     labelEn:'Talking Without Permission', icon:'🗣️', cls:'v-mild', weight:1},
  {id:'v2',  label:'التشويش والإزعاج',   labelEn:'Disrupting Class',      icon:'📢', cls:'v-mild', weight:1},
  {id:'v3',  label:'عدم الانتباه',       labelEn:'Not Paying Attention',  icon:'😴', cls:'v-mild', weight:1},
  {id:'v4',  label:'اللعب بالهاتف',      labelEn:'Using Phone',           icon:'📱', cls:'',       weight:2},
  {id:'v5',  label:'عدم إحضار الكتاب',   labelEn:'No Book',               icon:'📚', cls:'',       weight:1},
  {id:'v6',  label:'عدم تسليم الواجب',   labelEn:'Missing Homework',      icon:'📝', cls:'',       weight:2},
  {id:'v7',  label:'مغادرة المقعد',      labelEn:'Leaving Seat',          icon:'🚶', cls:'',       weight:2},
  {id:'v8',  label:'إزعاج الزملاء',      labelEn:'Bothering Classmates',  icon:'👊', cls:'',       weight:2},
  {id:'v9',  label:'الغش في الاختبار',   labelEn:'Cheating in Exam',      icon:'👁️', cls:'',       weight:3},
  {id:'v10', label:'العبث بمتعلقات الغير',labelEn:'Touching Others Property',icon:'🖐️',cls:'',    weight:2},
  {id:'v11', label:'عدم الاستعداد للدرس', labelEn:'Unprepared for Class', icon:'🎒', cls:'v-mild', weight:1},
  {id:'v12', label:'سوء الأدب مع المعلم', labelEn:'Disrespecting Teacher',icon:'⚠️', cls:'',      weight:3},
  {id:'v13', label:'الشجار مع الزملاء',  labelEn:'Fighting with Classmates',icon:'🔴',cls:'',     weight:3},
  {id:'v14', label:'الخروج بدون إذن',    labelEn:'Leaving Without Permission',icon:'🚪',cls:'',   weight:2},
];

let selectedViolation = null;

function renderViolationGrid(){
  const grid = document.getElementById('violation-grid');
  if(!grid) return;
  const isEn = currentLang === 'en';
  grid.innerHTML = VIOLATIONS.map(v => {
    const lbl = isEn && v.labelEn ? v.labelEn : v.label;
    return `<button class="violation-btn ${v.cls}" data-vid="${v.id}"
      onclick="selectViolation('${v.id}',this)">
      ${v.icon} ${lbl}
    </button>`;
  }).join('');
}

function selectViolation(vid, btn){
  selectedViolation = vid;
  document.querySelectorAll('.violation-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function populateBvStudents(){
  const cls = document.getElementById('behavior-class')?.value||'';
  const sec = document.getElementById('behavior-sec')?.value||'';
  const sel = document.getElementById('bv-student-sel');
  if(!sel) return;
  const isEn = currentLang === 'en';
  const ph = isEn ? '— Select Student —' : '— اختر طالباً —';
  sel.innerHTML = `<option value="">${ph}</option>` +
    ((getFilteredStudents()[cls])||[]).filter(s=>!sec||s.section===sec).map(s => {
      const display = displayStudentName(s, cls, s.section, s.mid);
      return `<option value="${s.name}">${display}</option>`;
    }).join('');
}

function renderBehaviorTab(){
  populateBvStudents();
  renderViolationGrid();
  renderBvLog();
}

function calcBehaviorLevel(cls, name){
  // احسب من السجل: عدد المخالفات الكلي ووزنها
  const logs = APP.behaviorLog.filter(e => e.cls===cls && e.name===name);
  const totalWeight = logs.reduce((sum, e) => {
    const v = VIOLATIONS.find(x => x.id === e.violationId);
    return sum + (v ? v.weight : 0);
  }, 0);
  if(totalWeight === 0) return 5;      // ممتاز
  if(totalWeight <= 2) return 4;       // جيد جداً
  if(totalWeight <= 4) return 3;       // جيد
  if(totalWeight <= 7) return 2;       // يحتاج تحسين
  return 1;                            // ضعيف
}

function saveBehaviorEntry(){
  const cls     = document.getElementById('behavior-class')?.value||'';
  const sec     = document.getElementById('behavior-sec')?.value||'';
  const name    = document.getElementById('bv-student-sel')?.value||'';
  const academic= document.getElementById('bv-academic-input')?.value?.trim()||'';
  const conduct = document.getElementById('bv-conduct-input')?.value?.trim()||'';
  const vid     = selectedViolation;

  if(!name){ showToast('⚠️ اختر اسم الطالب'); return; }
  if(!vid && !academic && !conduct){ showToast('⚠️ أدخل ملاحظة أو اختر مخالفة'); return; }

  const vObj    = VIOLATIONS.find(v=>v.id===vid)||{label:'لا مخالفة', weight:0};
  const d       = new Date();
  const dateStr = d.toLocaleDateString('ar-AE')+' '+d.toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit'});
  const entry   = {cls, name, violationId:vid||'v0', violationLabel:vObj.label, academic, conduct, date:dateStr, ts:d.toISOString()};

  const key = getTeacherKey();
  if(typeof db!=='undefined' && key){
    window.fbPushBehavior(key, entry).catch(()=>{});
    // listener updates APP.behaviorLog automatically
  } else {
    APP.behaviorLog.push(entry);
  }

  // Update level
  const newLevel = calcBehaviorLevel(cls, name);
  APP.behavior[cls+'|'+name] = {level:newLevel, academic, conduct};
  saveState();

  // Send notification to parent
  const bvInfo  = BEHAVIOR_LEVELS[newLevel]||BEHAVIOR_LEVELS[5];
  const msgBody = buildBehaviorMsg(name, vObj.label, academic, conduct, bvInfo.label, dateStr);
  const parentMsg = {cls, name, body:msgBody,
    type: vObj.weight>=3?'warning':vObj.weight>=1?'info':'praise',
    date:dateStr, ts:d.toISOString()};
  if(typeof db!=='undefined' && key){
    window.fbPushMsg(key, parentMsg).catch(()=>{});
  } else {
    APP.messages.push(parentMsg); saveState();
  }

  // Reset form
  document.getElementById('bv-academic-input').value='';
  document.getElementById('bv-conduct-input').value='';
  selectedViolation=null;
  document.querySelectorAll('.violation-btn').forEach(b=>b.classList.remove('selected'));
  renderBvLog();
  showToast('✅ تم الحفظ والإرسال لولي الأمر');
}



function buildBehaviorMsg(name, violation, academic, conduct, levelLabel, date){
  let lines = [`تقرير سلوكي بتاريخ ${date}`, `الطالب: ${name}`];
  if(violation && violation !== 'لا مخالفة') lines.push(`المخالفة: ${violation}`);
  if(academic)  lines.push(`ملاحظة أكاديمية: ${academic}`);
  if(conduct)   lines.push(`ملاحظة سلوكية: ${conduct}`);
  return lines.join('\n');
}

// ربط أزرار المسح عبر event delegation
function bindDeleteBtns(){
  const tbody2 = document.getElementById('bv-log-tbody');
  if(!tbody2) return;
  tbody2.querySelectorAll('.bv-delete-btn').forEach(btn => {
    btn.onclick = function(){ deleteStudentLog(this.dataset.cls, this.dataset.name); };
  });
  tbody2.querySelectorAll('.bv-row-delete-btn').forEach(btn => {
    btn.onclick = function(){ deleteSingleBvEntry(this.dataset.id, this.dataset.cls, this.dataset.name); };
  });
}

function deleteSingleBvEntry(id, cls, name){
  if(!confirm('هل تريد حذف هذا السجل؟')) return;
  const key = getTeacherKey();
  APP.behaviorLog = APP.behaviorLog.filter(e => e.id !== id);
  saveState();
  renderBvLog();
  if(id && key && typeof db !== 'undefined'){
    window.fbDeleteBvEntry(key, id)
      .then(() => showToast('✅ تم حذف السجل'))
      .catch(() => showToast('⚠️ حُذف محلياً'));
  } else {
    showToast('✅ تم حذف السجل');
  }
}

function deleteStudentLog(cls, name){
  if(!confirm(currentLang==='en'
    ? `Delete all behavior records for ${name}?`
    : `هل تريد حذف كامل السجل السلوكي للطالب:\n${name}?`)) return;
  APP.behaviorLog = APP.behaviorLog.filter(e=>!(e.cls===cls&&e.name===name));
  delete APP.behavior[cls+'|'+name];
  saveState(); renderBvLog();
  const key = getTeacherKey();
  if(typeof db!=='undefined' && key){
    window.fbDeleteStudentBv(key, cls, name)
      .then(()=>showToast('✅ تم حذف السجل'))
      .catch(()=>showToast('⚠️ حُذف محلياً'));
  } else showToast('✅ تم الحذف');
}



function renderBvLog(){
  const cls   = document.getElementById('behavior-class')?.value || '';
  const tbody = document.getElementById('bv-log-tbody');
  if(!tbody) return;
  const allLogs = [...APP.behaviorLog].filter(e => !cls || e.cls===cls);
  if(!allLogs.length){
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="ico">📋</div><p>'+t('noMessages')+'</p></div></td></tr>';
    return;
  }
  // تجميع حسب الطالب ثم عرض السجلات
  const studentNames = [...new Set(allLogs.map(e=>e.cls+'||'+e.name))];
  tbody.innerHTML = studentNames.map(key => {
    const [eCls, eName] = key.split('||');
    const studentLogs = allLogs.filter(e=>e.cls===eCls&&e.name===eName).reverse();
    const level  = calcBehaviorLevel(eCls, eName);
    const bvInfo = BEHAVIOR_LEVELS[level] || BEHAVIOR_LEVELS[5];
    const rows = studentLogs.map((e, rowIdx) => {
      const vObj = VIOLATIONS.find(v => v.id === e.violationId);
      const entryId = e.id || '';
      return `<tr>
        <td style="font-size:11px;white-space:nowrap;padding-right:28px">${e.date||''}</td>
        <td><span class="badge badge-teal">${e.cls}</span></td>
        <td style="text-align:${currentLang==='en'?'left':'right'};font-size:12px;font-weight:500">${displayStudentName(e.name, eCls, e.section, e.mid)}</td>
        <td><span class="bv-level-badge bvl-${level}">${bvInfo.icon} ${bvInfo.label.split('—')[0].trim()}</span></td>
        <td style="font-size:12px">${vObj ? vObj.icon+' '+vObj.label : '—'}</td>
        <td style="font-size:12px;color:var(--grey-3)">${e.academic||'—'}</td>
        <td style="font-size:12px;color:var(--grey-3)">${e.conduct||'—'}</td>
        <td style="padding:4px 8px">
          <button class="action-btn danger bv-row-delete-btn" style="padding:3px 8px;font-size:11px"
            data-id="${entryId}" data-cls="${eCls}" data-name="${eName}" data-idx="${rowIdx}"
            title="${currentLang==='en'?'Delete':'حذف'}">🗑️</button>
        </td>
      </tr>`;
    });
    // صف رأس الطالب مع زر المسح — نستخدم data-attributes لتجنب مشاكل الأسماء العربية
    const safeIdx = studentNames.indexOf(key);
    const headerRow = `<tr style="background:var(--teal-pale)">
      <td colspan="7" style="text-align:right;font-weight:700;font-size:13px;color:var(--teal-dark);padding:10px 14px">
        ${displayStudentName(eName, eCls)} — ${studentLogs.length} ${currentLang==="en"?"records":"سجل"} | ${currentLang==="en"?"Level":"مستوى"}: ${bvInfo.icon} ${bvInfo.label.split('—')[0].trim()}
      </td>
      <td style="padding:6px 10px">
        <button class="action-btn danger bv-delete-btn"
          data-cls="${eCls}" data-name="${eName}"
          title="${currentLang==='en'?'Delete all records':'حذف كامل سجل هذا الطالب'}">
          🗑️ \${currentLang==="en"?"Delete":"مسح"}
        </button>
      </td>
    </tr>`;
    return headerRow + rows.join('');
  }).join('');
}

function exportBehaviorExcel(){
  if(!window.XLSX){ showToast('⚠️ مكتبة Excel غير محملة بعد'); return; }
  const cls   = document.getElementById('behavior-class')?.value || '';
  const logs  = APP.behaviorLog.filter(e => !cls || e.cls===cls);
  if(!logs.length){ showToast('⚠️ لا توجد بيانات للتصدير'); return; }
  const rows  = logs.map(e => ({
    'التاريخ': e.date||'',
    'الشعبة':  e.cls,
    'الاسم':   e.name,
    'مستوى السلوك': BEHAVIOR_LEVELS[calcBehaviorLevel(e.cls,e.name)]?.label.split('—')[0].trim()||'',
    'المخالفة': e.violationLabel||'',
    'ملاحظة أكاديمية': e.academic||'',
    'ملاحظة سلوكية': e.conduct||''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t('bvlog'));
  XLSX.writeFile(wb, 'سجل_السلوك.xlsx');
  showToast('✅ تم تصدير الملف');
}



function refreshDashboard(){
  const btn = event?.currentTarget;
  if(btn){
    btn.textContent = '⏳ جارٍ...';
    btn.disabled = true;
  }
  const finish = (msg)=>{
    if(btn){
      btn.textContent = currentLang==='en' ? '🔄 Refresh' : '🔄 تحديث';
      btn.disabled = false;
    }
    if(msg) showToast(msg);
  };
  const run = async ()=>{
    if(window.fbReloadAll){
      await window.fbReloadAll();
    }
    initDashboard();
    finish(currentLang==='en' ? '✅ Data updated' : '✅ تم تحديث البيانات');
  };
  run().catch(()=> finish(currentLang==='en' ? '✅ Refreshed' : '✅ تم التحديث'));
}

function refreshParentPage(){
  if(!window._currentParent && APP.savedParent){
    const sp = APP.savedParent;
    window._currentParent = enrichParentSession(sp.cls, sp.name, sp.mid||'', sp.section||'');
  }
  if(!window._currentParent){
    showToast(currentLang==='en'?'⚠️ Please login first':'⚠️ سجّل الدخول أولاً');
    return;
  }
  const btn = document.querySelector('[onclick="refreshParentPage()"]');
  if(btn){ btn.textContent='⏳'; btn.disabled=true; }

  rerenderParentDashboard({ preserveTab:true })
    .then(()=>{
      if(btn){ btn.textContent='🔄'; btn.disabled=false; }
      showToast(currentLang==='en'?'✅ Refreshed':'✅ تم التحديث');
    })
    .catch(err=>{
      console.warn('refreshParentPage:', err);
      if(btn){ btn.textContent='🔄'; btn.disabled=false; }
      showToast(currentLang==='en'?'⚠️ Refresh failed':'⚠️ فشل التحديث');
    });
}

function showBvAnalytics(){
  const cls  = document.getElementById('behavior-class')?.value || '';
  const modal = document.getElementById('bv-analytics-modal');
  const cont  = document.getElementById('bv-analytics-content');
  if(!modal||!cont) return;

  const logs = [...APP.behaviorLog].filter(e=>!cls||e.cls===cls).reverse();

  if(!logs.length){
    cont.innerHTML='<div class="empty-state"><div class="ico">📊</div><p>لا توجد بيانات للتحليل</p></div>';
    modal.style.display='flex'; return;
  }

  // إحصاءات عامة
  const students = [...new Set(logs.map(e=>e.cls+'|'+e.name))];
  const violations = logs.filter(e=>e.violationId&&e.violationId!=='v0');

  // أكثر المخالفات شيوعاً
  const vCount = {};
  violations.forEach(e=>{ vCount[e.violationId]=(vCount[e.violationId]||0)+1; });
  const topV = Object.entries(vCount).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // توزيع المخالفات على الطلاب
  const stuV = {};
  violations.forEach(e=>{ stuV[e.name]=(stuV[e.name]||0)+1; });
  const topStu = Object.entries(stuV).sort((a,b)=>b[1]-a[1]).slice(0,5);

  // المخطط الزمني (آخر 7 أيام)
  const today = new Date();
  const days  = Array.from({length:7},(_,i)=>{
    const d=new Date(today); d.setDate(d.getDate()-i);
    return d.toLocaleDateString('ar-AE');
  }).reverse();
  const dayCount = {};
  days.forEach(d=>{ dayCount[d]=0; });
  violations.forEach(e=>{
    const day = (e.date||'').split(' ')[0];
    if(dayCount[day]!==undefined) dayCount[day]++;
  });
  const maxDay = Math.max(1,...Object.values(dayCount));

  // بناء HTML
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">'
    +'<div style="background:var(--teal-pale);border-radius:10px;padding:14px;text-align:center">'
    +'<div style="font-size:24px;font-weight:700;color:var(--teal-dark)">'+logs.length+'</div>'
    +'<div style="font-size:12px;color:var(--grey-3)">إجمالي السجلات</div></div>'
    +'<div style="background:#ffebee;border-radius:10px;padding:14px;text-align:center">'
    +'<div style="font-size:24px;font-weight:700;color:#c62828">'+violations.length+'</div>'
    +'<div style="font-size:12px;color:var(--grey-3)">إجمالي المخالفات</div></div>'
    +'<div style="background:#e8f5e9;border-radius:10px;padding:14px;text-align:center">'
    +'<div style="font-size:24px;font-weight:700;color:#2e7d32">'+students.length+'</div>'
    +'<div style="font-size:12px;color:var(--grey-3)">عدد الطلاب</div></div>'
    +'</div>';

  // مخطط زمني
  html += '<div style="margin-bottom:20px">'
    +'<h4 style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:12px">📅 المخالفات خلال آخر 7 أيام</h4>'
    +'<div style="display:flex;gap:6px;align-items:flex-end;height:80px">';
  days.forEach(d=>{
    const count = dayCount[d]||0;
    const h = count ? Math.max(10,Math.round((count/maxDay)*70)) : 4;
    const col = count===0?'var(--grey-5)':count<=2?'#1a9a9a':count<=4?'#e65100':'#c62828';
    const label = d.split('/').slice(0,2).join('/');
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">'
      +'<span style="font-size:10px;color:var(--grey-3)">'+( count||'')+'</span>'
      +'<div style="width:100%;height:'+h+'px;background:'+col+';border-radius:4px 4px 0 0"></div>'
      +'<span style="font-size:9px;color:var(--grey-3)">'+label+'</span>'
      +'</div>';
  });
  html += '</div></div>';

  // أكثر المخالفات
  if(topV.length){
    html += '<div style="margin-bottom:16px">'
      +'<h4 style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:8px">🔝 أكثر المخالفات تكراراً</h4>';
    topV.forEach(([vid,cnt])=>{
      const v = VIOLATIONS.find(x=>x.id===vid)||{label:vid,icon:''};
      const pct = Math.round((cnt/violations.length)*100);
      html += '<div style="margin-bottom:8px">'
        +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">'
        +'<span>'+v.icon+' '+v.label+'</span><strong>'+cnt+' ('+pct+'%)</strong></div>'
        +'<div style="background:var(--grey-5);border-radius:20px;height:6px">'
        +'<div style="width:'+pct+'%;height:100%;background:#e53935;border-radius:20px"></div>'
        +'</div></div>';
    });
    html += '</div>';
  }

  // أكثر الطلاب مخالفات
  if(topStu.length){
    html += '<div><h4 style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:8px">👤 الطلاب الأكثر مخالفات</h4>';
    topStu.forEach(([name,cnt])=>{
      const pct = Math.round((cnt/violations.length)*100);
      html += '<div style="margin-bottom:8px">'
        +'<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">'
        +'<span>'+name+'</span><strong>'+cnt+' مخالفة</strong></div>'
        +'<div style="background:var(--grey-5);border-radius:20px;height:6px">'
        +'<div style="width:'+pct+'%;height:100%;background:#f57c00;border-radius:20px"></div>'
        +'</div></div>';
    });
    html += '</div>';
  }

  cont.innerHTML = html;
  modal.style.display = 'flex';
}




// ══════════════════════════════════════════════════
//  CLOUD FUNCTIONS (us-central1)
// ══════════════════════════════════════════════════
function getCloudFunctions(){
  if(typeof firebase === 'undefined' || !firebase.app) return null;
  try{ return firebase.app().functions('us-central1'); }
  catch(e){ return typeof firebase.functions === 'function' ? firebase.functions() : null; }
}

function populateSettingsAccount(){
  const wrap = document.getElementById('settings-account-section');
  const box = document.getElementById('settings-account-info');
  if(!wrap || !box) return;
  if(!CURRENT_TEACHER){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const isEn = currentLang === 'en';
  const subj = SUBJECTS[CURRENT_TEACHER.subject];
  const subjLabel = subj ? (isEn ? subj.en : subj.ar) : (CURRENT_TEACHER.subject || '—');
  const scope = getTeacherScope();
  const scopeText = formatTeacherScopeSummary(scope, isEn) || '—';
  const lines = [
    `<strong>${t('settingsAccountName')}:</strong> ${escapeHtml(CURRENT_TEACHER.name || '—')}`,
    `<strong>${t('settingsAccountEmail')}:</strong> ${escapeHtml(CURRENT_TEACHER.email || '—')}`,
    `<strong>${t('settingsAccountSubject')}:</strong> ${escapeHtml(subjLabel)}`,
    `<strong>${t('settingsAccountScope')}:</strong> ${escapeHtml(scopeText)}`,
  ];
  box.innerHTML = lines.join('<br>');
}

function formatSettingsSyncTime(iso){
  if(!iso) return '';
  try{
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(currentLang === 'en' ? 'en-GB' : 'ar-AE');
  }catch(e){ return iso; }
}

function populateSettingsPhase3(){
  const wrap = document.getElementById('settings-phase3-section');
  const syncEl = document.getElementById('settings-last-sync');
  const autoCb = document.getElementById('settings-auto-refresh');
  if(!wrap) return;
  if(!CURRENT_TEACHER || CURRENT_TEACHER.isAdmin){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  if(syncEl){
    const when = TEACHER_SETTINGS.lastGradeSync
      ? formatSettingsSyncTime(TEACHER_SETTINGS.lastGradeSync)
      : t('settingsLastSyncNever');
    syncEl.textContent = `${t('settingsLastSync')} ${when}`;
  }
  if(autoCb) autoCb.checked = TEACHER_SETTINGS.autoRefresh !== false;
  renderSettingsNotifAction();
}

function renderSettingsNotifAction(){
  const wrap = document.getElementById('settings-notif-action');
  if(!wrap) return;
  if(!('Notification' in window)){
    wrap.innerHTML = '';
    return;
  }
  const perm = Notification.permission;
  if(perm === 'granted'){
    wrap.innerHTML = '<div class="notif-allowed">'+t('notifEnabled')+'</div>';
  } else if(perm === 'denied'){
    wrap.innerHTML = '<div class="notif-denied">'+t('notifDenied')+'</div>';
  } else {
    wrap.innerHTML = '<button type="button" onclick="requestAndSubscribe()" style="width:100%;padding:10px 12px;background:var(--teal-mid);color:#fff;border:none;border-radius:10px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">'+t('notifBtn')+'</button>';
  }
}

function exportTeacherGradesExcel(){
  if(!window.XLSX){
    showToast(currentLang === 'en' ? '⚠️ Excel library not loaded' : '⚠️ مكتبة Excel لم تُحمَّل');
    return;
  }
  const list = getImportedGradeStudents('', '');
  if(!list.length){
    showToast(t('settingsGradesExportEmpty'));
    return;
  }
  const isEn = currentLang === 'en';
  const rows = list.map(s => isEn ? {
    Grade: s.cls,
    Section: s.section,
    Name: s.name,
    ID: s.mid,
    Diagnostic: s.diagnostic,
    T1: s.t1,
    T2: s.t2,
    Homework: s.hw,
    Portal: s.portal,
    Activity: s.activity,
    Lab: s.lab,
    Total: s.total,
    Final: s.final,
  } : {
    'الصف': s.cls,
    'الشعبة': s.section,
    'الاسم': s.name,
    'الرقم': s.mid,
    'تشخيص': s.diagnostic,
    'T1': s.t1,
    'T2': s.t2,
    'واجبات': s.hw,
    'بوابة': s.portal,
    'نشاط': s.activity,
    'م lab': s.lab,
    'المجموع': s.total,
    'نهائي': s.final,
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isEn ? 'Grades' : 'الدرجات');
  XLSX.writeFile(wb, isEn ? 'grades_backup.xlsx' : 'سجل_الدرجات_نسخة_احتياطية.xlsx');
  showToast(t('settingsGradesExportOk'));
}

function openSettings(){
  const urlInput = document.getElementById('site-url-input');
  if(urlInput) urlInput.value = APP.siteUrl || '';
  const pw1 = document.getElementById('new-password');
  const pw2 = document.getElementById('new-password-confirm');
  if(pw1) pw1.value = '';
  if(pw2) pw2.value = '';
  populateSettingsAccount();
  populateSettingsPhase3();
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings(){
  document.getElementById('settings-modal').classList.remove('open');
}

async function copySiteUrlFromSettings(){
  const url = (document.getElementById('site-url-input')?.value || APP.siteUrl || '').trim();
  if(!url){
    showToast(currentLang === 'en' ? '⚠️ No URL to copy' : '⚠️ لا يوجد رابط للنسخ');
    return;
  }
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(t('settingsUrlCopied'));
  }catch(e){
    showToast(t('settingsUrlCopyFail'));
  }
}

async function saveSettings(){
  const isEn = currentLang === 'en';
  const pw1 = document.getElementById('new-password')?.value || '';
  const pw2 = document.getElementById('new-password-confirm')?.value || '';
  const urlVal = document.getElementById('site-url-input')?.value.trim() || APP.siteUrl;

  if(pw1 || pw2){
    if(pw1.length < 8){
      showToast(t('settingsPwTooShort'));
      return;
    }
    if(pw1 !== pw2){
      showToast(t('settingsPwMismatch'));
      return;
    }
    if(typeof auth === 'undefined' || !auth.currentUser){
      showToast(t('settingsPwNeedLogin'));
      return;
    }
    try{
      await auth.currentUser.updatePassword(pw1);
      showToast(t('settingsPwChanged'));
      document.getElementById('new-password').value = '';
      document.getElementById('new-password-confirm').value = '';
    }catch(e){
      console.warn('updatePassword', e);
      const code = e?.code || '';
      if(code === 'auth/requires-recent-login'){
        showToast(t('settingsPwNeedLogin'));
      } else {
        showToast('❌ ' + (e.message || (isEn ? 'Password change failed' : 'فشل تغيير كلمة المرور')));
      }
      return;
    }
  }

  APP.siteUrl = urlVal;
  saveState();

  if(CURRENT_TEACHER && !CURRENT_TEACHER.isAdmin){
    const autoRefresh = document.getElementById('settings-auto-refresh')?.checked !== false;
    TEACHER_SETTINGS.autoRefresh = autoRefresh;
    if(typeof db !== 'undefined'){
      const tKey = getTeacherKey();
      if(tKey){
        try{
          await db.ref('teacherData/'+tKey+'/settings/autoRefresh').set(autoRefresh);
        }catch(e){ console.warn('save autoRefresh', e); }
      }
    }
  }

  closeSettings();
  const su = document.getElementById('site-url-display');
  if(su) su.textContent = APP.siteUrl;
  const si = document.getElementById('site-url-input');
  if(si) si.value = APP.siteUrl;
  if(window.saveToFirebase) window.saveToFirebase();
  showToast(t('settingsSaved'));
}

async function deleteTeacherGrades(){
  if(!CURRENT_TEACHER || CURRENT_TEACHER.isAdmin) return;
  if(!confirm(t('settingsGradesDeleteConfirm'))) return;
  const tKey = getTeacherKey();
  if(!tKey) return;
  try{
    if(typeof db !== 'undefined'){
      await db.ref('teacherData/'+tKey+'/grades').remove();
    }
    window.TEACHER_GRADES = {};
    renderAllTabs();
    populateSettingsPhase3();
    showToast(t('settingsGradesDeleted'));
  }catch(e){
    console.error('deleteTeacherGrades', e);
    showToast('❌ ' + (e.message || ''));
  }
}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════
function showToast(msg){
  const toastEl=document.getElementById('toast');
  toastEl.textContent=msg; toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'),3000);
}

// ══════════════════════════════════════════════════
//  PARENT → TEACHER MESSAGING
// ══════════════════════════════════════════════════

function getParentStudentStorageKey(){
  const ctx = window._parentSubjectContext || window._currentParent || {};
  const cls = ctx.cls || '';
  const id = ctx.mid || ctx.name || 'student';
  return cls + '_' + id;
}

function getParentHiddenMsgIds(type){
  try{
    return JSON.parse(localStorage.getItem('parent_hide_'+type+'_'+getParentStudentStorageKey()) || '[]');
  }catch(e){ return []; }
}

function addParentHiddenMsgId(type, hideId){
  const ids = getParentHiddenMsgIds(type);
  if(!ids.includes(hideId)) ids.push(hideId);
  try{ localStorage.setItem('parent_hide_'+type+'_'+getParentStudentStorageKey(), JSON.stringify(ids)); }catch(e){}
}

function parentMsgHideKey(teacherKey, msg){
  return (teacherKey || '') + '|' + (msg.id || msg.ts || msg.body || '');
}

function isParentMsgHidden(type, teacherKey, msg){
  return getParentHiddenMsgIds(type).includes(parentMsgHideKey(teacherKey, msg));
}

function parentMsgDeleteBtn(type, teacherKey, msg, idx){
  const isEn = currentLang === 'en';
  const hideId = parentMsgHideKey(teacherKey, msg);
  const enc = encodeURIComponent(hideId);
  const fn = type === 'sent'
    ? `hideParentSentMsg('${teacherKey}','${enc}',${idx == null ? 'null' : idx})`
    : `hideParentReceivedMsg('${teacherKey}','${enc}',${idx == null ? 'null' : idx})`;
  return `<button type="button" class="parent-msg-del" onclick="${fn}" title="${isEn ? 'Hide on my device' : 'إخفاء من جهازي'}">🗑️</button>`;
}

function hideParentSentMsg(teacherKey, encodedHideId, idx){
  addParentHiddenMsgId('sent', decodeURIComponent(encodedHideId));
  showToast(currentLang === 'en' ? '✅ Message hidden' : '✅ تم إخفاء الرسالة');
  const ctx = window._parentSubjectContext;
  if(ctx && idx != null && idx !== 'null'){
    renderSubjectSentLog(idx, teacherKey, ctx.cls, ctx.name);
  }
  if(ctx) renderParentSentAll(ctx.cls, ctx.name, ctx.teachers);
}

function hideParentReceivedMsg(teacherKey, encodedHideId, idx){
  addParentHiddenMsgId('received', decodeURIComponent(encodedHideId));
  showToast(currentLang === 'en' ? '✅ Message hidden' : '✅ تم إخفاء الرسالة');
  const ctx = window._parentSubjectContext;
  if(ctx){
    if(idx != null && idx !== 'null'){
      loadSubjectTabContent(Number(idx), ctx.cls, ctx.name, ctx.mid, ctx.teachers);
    }
    renderParentInboxAll(ctx.cls, ctx.name, ctx.teachers);
    refreshParentInbox(ctx.cls, ctx.name);
  }
}

function getSubjectTeacherContext(idx){
  const ctx = window._parentSubjectContext;
  const tc = ctx?.teachers?.[idx];
  const isEn = currentLang === 'en';
  return {
    tc,
    subjLabel: tc?.subjLabel || (isEn ? 'this subject' : 'المادة'),
    subject: tc?.subject || '',
    teacherKey: tc?.key || ''
  };
}

// Rich message templates for parent messages (subject is injected dynamically)
const PARENT_MSG_TEMPLATES = {
  ar: {
    q1: (name, subj) => `السلام عليكم ورحمة الله وبركاته
أستفسر عن درجات ابني ${name} في مادة ${subj}.
أرجو التكرم بإطلاعي على وضعه الأكاديمي الحالي وأي توصيات للتحسين.
شكراً جزيلاً على اهتمامكم ومتابعتكم.`,
    q2: (name) => `السلام عليكم ورحمة الله وبركاته
أود الاستفسار عن وضع ابني ${name} السلوكي داخل الفصل.
أحرص دائماً على متابعته ومساعدته في الالتزام بالسلوك القويم.
أرجو إطلاعي على أي ملاحظات أو توصيات تراها مناسبة.`,
    q3: (name) => `السلام عليكم ورحمة الله وبركاته
أرغب في تحديد موعد لزيارة المدرسة والحديث معكم مباشرةً بشأن ابني ${name}.
أرجو إعلامي بالوقت المناسب لكم.
وجزاكم الله خيراً على حرصكم وتفانيكم.`,
    q4: (name, subj) => `السلام عليكم ورحمة الله وبركاته
ابني ${name} يواجه بعض الصعوبات في مادة ${subj} وأرى أنه يحتاج إلى دعم إضافي.
أرجو إرشادي إلى أفضل الأساليب التي يمكنني اتباعها لمساعدته في المنزل.
أقدر جهودكم وحرصكم على نجاح أبنائنا.`,
    q5: (name) => `السلام عليكم ورحمة الله وبركاته
أرجو إطلاعي على الواجبات والأنشطة المطلوبة هذا الأسبوع للطالب ${name}.
أحرص على متابعة ابني يومياً وأريد التأكد من إنجازه لكل ما هو مطلوب منه.
شكراً جزيلاً لمتابعتكم المستمرة.`,
    q6: (name) => `السلام عليكم ورحمة الله وبركاته
أتقدم بجزيل الشكر والتقدير على حسن متابعتكم لابني ${name} ورعايتكم له.
جهودكم المخلصة تُلهمه وتشجعه على التميز والنجاح.
جزاكم الله خيراً وبارك في مسيرتكم التعليمية النبيلة.`
  },
  en: {
    q1: (name, subj) => `Dear Teacher,
I would like to inquire about ${name}'s grades in ${subj}.
Please share any updates on his academic progress and any recommendations for improvement.
Thank you for your dedication and continued support.`,
    q2: (name) => `Dear Teacher,
I would like to ask about ${name}'s behavior and conduct in class.
I always strive to support his discipline at home as well.
Please share any observations or recommendations you may have.`,
    q3: (name) => `Dear Teacher,
I would like to schedule a visit to the school to meet with you regarding ${name}.
Kindly let me know a convenient time for you.
Thank you for your care and commitment to our children.`,
    q4: (name, subj) => `Dear Teacher,
${name} is facing some difficulties in ${subj} and may need extra support.
I would appreciate your guidance on how best to help him at home.
Thank you for your continued efforts and dedication to our students.`,
    q5: (name) => `Dear Teacher,
Could you please share the homework and activities required this week for ${name}?
I closely monitor his study routine at home and want to make sure everything is covered.
Thank you for your ongoing follow-up.`,
    q6: (name) => `Dear Teacher,
I would like to express my sincere gratitude for your exceptional care and follow-up with ${name}.
Your dedicated efforts inspire and motivate him to excel.
May you be rewarded for your noble work in education.`
  }
};

function selectQuick(btn, key){
  document.querySelectorAll('.quick-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  const lang = currentLang === 'en' ? 'en' : 'ar';
  const studentName = window._currentParent ? window._currentParent.name : '';
  const cls = window._currentParent ? window._currentParent.cls : '';
  const student = findStudentInGrade(cls, studentName, window._currentParent?.mid, window._currentParent?.section);
  const displayName = displayStudentName(student || {name: studentName}).split(' ')[0];
  const subjLabel = window._parentSubjectContext?.teachers?.[0]?.subjLabel || (lang==='en' ? 'this subject' : 'المادة');
  const tplFn = PARENT_MSG_TEMPLATES[lang]?.[key];
  const text = tplFn ? (tplFn.length > 1 ? tplFn(displayName, subjLabel) : tplFn(displayName)) : t(key);
  const ta = document.getElementById('parent-msg-input');
  if(ta) ta.value = text;
}

function showNewMsgAlert(){
  const alert = document.getElementById('new-msg-alert');
  if(!alert) return;
  alert.classList.add('show');
  // أخفه بعد 8 ثوانٍ
  setTimeout(()=>alert.classList.remove('show'), 8000);
  // اهتزاز الهاتف إذا كان متاحاً
  if(navigator.vibrate) navigator.vibrate([200,100,200]);
}

function openInboxFromAlert(){
  document.getElementById('new-msg-alert').classList.remove('show');
  // انتقل لتبويب رسائل المعلم
  const inboxBtn = document.querySelector('[onclick*="switchParentTab(\'inbox\'"]');
  if(inboxBtn){ switchParentTab('inbox', inboxBtn); }
  else {
    const allTabs = document.querySelectorAll('.parent-tab');
    allTabs.forEach(t=>{ if(t.textContent.includes(t('teacherMsg'))) switchParentTab('inbox',t); });
  }
}

function parentLogout(){
  APP.savedParent = null;
  saveState();
  window._currentParent = null;
  clearPin();
  showScreen('login');
  // إزالة زر الإشعارات
  const wrap = document.getElementById('parent-notif-btn-wrap');
  if(wrap) wrap.remove();
}

function setParentTabBadge(tabId, count){
  const btn = document.getElementById('tab-btn-' + tabId);
  if(!btn) return;
  const existing = btn.querySelector('.tab-badge');
  if(count > 0){
    if(!existing){
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = count > 9 ? '9+' : count;
      btn.appendChild(badge);
    } else {
      existing.textContent = count > 9 ? '9+' : count;
    }
  } else {
    if(existing) existing.remove();
  }
}

// حفظ عدد العناصر المُشاهَدة (count-based, لا timestamp)
function getSeenCount(cls, name, tab){
  try { return parseInt(localStorage.getItem('seen_count_'+tab+'_'+cls+'_'+name)||'0'); } catch(e){ return 0; }
}
function setSeenCount(cls, name, tab, count){
  try { localStorage.setItem('seen_count_'+tab+'_'+cls+'_'+name, count.toString()); } catch(e){}
}

function updateParentBadges(cls, name){
  if(!cls || !name) return;
  // رسائل المعلم
  const totalMsgs = APP.messages.filter(m=>m.cls===cls && m.name===name).length;
  const seenMsgs  = getSeenCount(cls, name, 'inbox');
  setParentTabBadge('inbox', Math.max(0, totalMsgs - seenMsgs));

  // سجل السلوك
  const totalBv = (APP.behaviorLog||[]).filter(e=>e.cls===cls && e.name===name).length;
  const seenBv  = getSeenCount(cls, name, 'bvlog');
  setParentTabBadge('bvlog', Math.max(0, totalBv - seenBv));
}

function clearParentTabBadge(tabId, cls, name){
  setParentTabBadge(tabId, 0);
  // احفظ العدد الحالي كـ"مشاهَد"
  if(tabId === 'inbox'){
    const total = APP.messages.filter(m=>m.cls===cls && m.name===name).length;
    setSeenCount(cls, name, 'inbox', total);
  } else if(tabId === 'bvlog'){
    const total = (APP.behaviorLog||[]).filter(e=>e.cls===cls && e.name===name).length;
    setSeenCount(cls, name, 'bvlog', total);
  }
}

function switchParentTab(tab, el){
  document.querySelectorAll('.parent-tab').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.parent-tab-content').forEach(c=>{
    c.classList.remove('active'); c.style.display='none';
  });
  if(el) el.classList.add('active');
  const target = document.getElementById('ptab-'+tab);
  if(target){ target.classList.add('active'); target.style.display='block'; }
  // امسح البادج وسجّل وقت المشاهدة
  if(window._currentParent){
    clearParentTabBadge(tab, window._currentParent.cls, window._currentParent.name);
  }
}


function renderParentSentLog(cls, name){
  const div = document.getElementById('parent-sent-log');
  if(!div) return;
  const isEn = currentLang === 'en';
  const myMsgs = (APP.parentMessages||[])
    .filter(m => {
      if(m.cls!==cls || m.name!==name) return false;
      const tk = m._teacherKey || m.teacherKey || '';
      return !isParentMsgHidden('sent', tk, m);
    })
    .reverse();

  if(!myMsgs.length){
    div.innerHTML = '';
    return;
  }

  const title = isEn ? '📋 Sent Messages History' : '📋 سجل الرسائل المرسلة';
  let html = '<div style="margin-top:4px">'
    + '<h4 style="font-size:13px;font-weight:700;color:var(--teal-dark);margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--teal-light)">'
    + title + '</h4>';

  html += myMsgs.map((m) => {
    const dateStr = m.date || m.ts || '';
    const tk = m._teacherKey || m.teacherKey || '';
    const idx = (window._parentSubjectContext?.teachers||[]).findIndex(t=>t.key===tk);
    return '<div style="background:var(--white);border:1px solid var(--grey-5);border-right:3px solid var(--teal-soft);border-radius:10px;padding:12px 14px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">'
      + '<span style="font-size:11px;font-weight:700;color:var(--teal-mid)">📤 '+(isEn?'Sent':'أُرسلت')+(m.subjLabel?' · '+escapeHtml(m.subjLabel):'')+'</span>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="font-size:11px;color:var(--grey-3)">'+dateStr+'</span>'
      + (tk ? parentMsgDeleteBtn('sent', tk, m, idx >= 0 ? idx : 'null') : '')
      + '</div></div>'
      + '<p style="font-size:13px;color:var(--grey-2);line-height:1.6;margin:0;white-space:pre-line">'+escapeHtml(m.body||'')+'</p>'
      + '</div>';
  }).join('');

  html += '</div>';
  div.innerHTML = html;
}

async function sendParentMessage(cls, name){
  const body = document.getElementById('parent-msg-input')?.value.trim();
  if(!body){
    const ta = document.getElementById('parent-msg-input');
    if(ta){ ta.style.borderColor='var(--red-soft)'; setTimeout(()=>ta.style.borderColor='',1500); }
    return;
  }
  const teachers = window._parentSubjectContext?.teachers || [];
  const tc = teachers[0];
  if(!tc?.key || typeof db==='undefined'){
    showToast(currentLang==='en' ? 'Open a subject tab to send' : 'افتح تبويب مادة لإرسال الرسالة');
    return;
  }
  await sendParentMsgToTeacher(0, tc.key, cls, name);
  document.querySelectorAll('.quick-btn').forEach(b=>b.classList.remove('selected'));
  const conf = document.getElementById('parent-msg-confirm');
  if(conf){ conf.style.display='block'; setTimeout(()=>conf.style.display='none',4000); }
  renderParentSentLog(cls, name);
}

function deleteSingleParentMsg(id){
  const key = getTeacherKey();
  const delKey = 'del_pm_'+key;

  // Step 1: Add to local deleted IDs set (permanent)
  let deletedIds = [];
  try{ deletedIds = JSON.parse(localStorage.getItem(delKey)||'[]'); }catch(e){}
  if(!deletedIds.includes(id)) deletedIds.push(id);
  try{ localStorage.setItem(delKey, JSON.stringify(deletedIds)); }catch(e){}

  // Step 2: Remove from local list
  APP.parentMessages = APP.parentMessages.filter(m=>m.id!==id);
  saveState();

  // Step 3: Refresh inbox and badge
  renderParentInbox();
  updateInboxBadge();

  // Step 4: Delete from Firebase
  if(typeof db!=='undefined' && key){
    window.fbDeleteParentMsg(key, id)
      .then(()=>showToast('✅ تم حذف الرسالة'))
      .catch(()=>showToast('✅ تم الحذف محلياً'));
  } else showToast('✅ تم الحذف');
}


function renderParentInbox(){
  const wrap = document.getElementById('parent-inbox');
  if(!wrap) return;
  const msgs = [...APP.parentMessages].reverse();
  if(!msgs.length){
    wrap.innerHTML='<div class="empty-state"><div class="ico">📭</div><p>'+t('noInbox')+'</p></div>';
    updateInboxBadge();
    return;
  }
  wrap.innerHTML = msgs.map(m=>{
    const subj = m.subjLabel || '';
    const unread = !isTeacherParentMsgRead(m);
    const safeId = escapeHtml(m.id || '');
    return `
    <div class="inbox-card ${unread?'unread':''}" onclick="markRead('${safeId}')">
      <div class="inbox-header">
        <div style="flex:1">
          <div class="inbox-name">${displayStudentName(m.name, m.cls, m.section, m.mid)}${subj?' · '+escapeHtml(subj):''} — ${currentLang==="en"?"Class":"الشعبة"} ${m.cls}</div>
          <div class="inbox-date">${m.date||m.ts||''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${unread?'<div class="unread-dot" title="'+(currentLang==="en"?"Unread":"غير مقروءة")+'"></div>':''}
          ${m.id?`<button class="action-btn danger" style="padding:2px 8px;font-size:11px" onclick="event.stopPropagation();deleteSingleParentMsg('${safeId}')">🗑️</button>`:''}
        </div>
      </div>
      <p>${escapeHtml(m.body)}</p>
    </div>`;
  }).join('');
  updateInboxBadge();
}

function markRead(id){
  const msg = typeof id === 'string' && id
    ? APP.parentMessages.find(m=>m.id===id)
    : null;
  if(!msg) return;
  markTeacherParentMsgRead(msg);
  renderParentInbox();
}

function clearParentMessages(){
  const isEn = currentLang === 'en';
  const key = getTeacherKey();
  if(!APP.parentMessages.length && !key){
    showToast(isEn ? 'No messages' : 'لا توجد رسائل');
    return;
  }
  if(!confirm(isEn
    ? 'Delete ALL parent messages permanently?\nThis removes them from every device.'
    : 'هل تريد حذف جميع رسائل أولياء الأمور نهائياً؟\nسيُحذف من كل الأجهزة.')) return;
  if(!key || typeof db === 'undefined'){
    APP.parentMessages = [];
    saveState();
    renderParentInbox();
    showToast(isEn ? '✅ Cleared locally' : '✅ تم المسح محلياً');
    return;
  }
  window.fbClearParentMessages(key)
    .then(()=>{
      try{ localStorage.removeItem('del_pm_'+key); localStorage.removeItem('read_pm_'+key); }catch(e){}
      APP.parentMessages = [];
      saveState();
      renderParentInbox();
      updateInboxBadge();
      showToast(isEn ? '✅ Parent messages deleted permanently' : '✅ تم مسح رسائل أولياء الأمور نهائياً');
    })
    .catch(err=>{
      console.error(err);
      showToast(isEn ? '❌ Delete failed' : '❌ فشل الحذف');
    });
}

function clearTeacherMessages(){
  const isEn = currentLang === 'en';
  const key = getTeacherKey();
  if(!APP.messages.length && !key){
    showToast(isEn ? 'No messages' : 'لا توجد رسائل');
    return;
  }
  if(!confirm(isEn
    ? 'Delete ALL teacher messages permanently?\nParents will no longer see them.'
    : 'هل تريد حذف جميع رسائل المعلم نهائياً؟\nستختفي أيضاً من لوحة ولي الأمر.')) return;
  if(!key || typeof db === 'undefined'){
    APP.messages = [];
    saveState();
    renderSavedMessages();
    showToast(isEn ? '✅ Cleared locally' : '✅ تم المسح محلياً');
    return;
  }
  window.fbClearTeacherMessages(key)
    .then(()=>{
      APP.messages = [];
      saveState();
      renderSavedMessages();
      showToast(isEn ? '✅ Teacher messages deleted permanently' : '✅ تم مسح رسائل المعلم نهائياً');
    })
    .catch(err=>{
      console.error(err);
      showToast(isEn ? '❌ Delete failed' : '❌ فشل الحذف');
    });
}

function clearAllBehavior(){
  const isEn = currentLang === 'en';
  const key = getTeacherKey();
  if(!APP.behaviorLog.length && !key){
    showToast(isEn ? 'No records' : 'لا توجد سجلات');
    return;
  }
  if(!confirm(isEn
    ? 'Delete ALL behavior records permanently?\nThis removes them from parent dashboards too.'
    : 'هل تريد مسح كامل سجل السلوك نهائياً؟\nسيُحذف من لوحات أولياء الأمور أيضاً.')) return;
  if(!key || typeof db === 'undefined'){
    APP.behaviorLog = [];
    APP.behavior = {};
    saveState();
    renderBvLog();
    showToast(isEn ? '✅ Cleared locally' : '✅ تم المسح محلياً');
    return;
  }
  window.fbClearAllBehavior(key)
    .then(()=>{
      APP.behaviorLog = [];
      APP.behavior = {};
      saveState();
      renderBvLog();
      showToast(isEn ? '✅ Behavior log deleted permanently' : '✅ تم مسح سجل السلوك نهائياً');
    })
    .catch(err=>{
      console.error(err);
      showToast(isEn ? '❌ Delete failed' : '❌ فشل الحذف');
    });
}

function getReadParentMsgIds(key){
  if(!key) return [];
  try{ return JSON.parse(localStorage.getItem('read_pm_'+key)||'[]'); }catch(e){ return []; }
}

function parentMsgReadId(msg){
  if(!msg) return '';
  return msg.id || ((msg.ts||msg.date||'')+'|'+(msg.name||'')+'|'+(msg.body||'').slice(0,40));
}

function isTeacherParentMsgRead(msg){
  const key = getTeacherKey();
  if(!msg || !key) return true;
  return getReadParentMsgIds(key).includes(parentMsgReadId(msg));
}

function markTeacherParentMsgRead(msg){
  const key = getTeacherKey();
  if(!key || !msg) return;
  const readId = parentMsgReadId(msg);
  const ids = getReadParentMsgIds(key);
  if(!ids.includes(readId)) ids.push(readId);
  try{ localStorage.setItem('read_pm_'+key, JSON.stringify(ids)); }catch(e){}
  msg.read = true;
  saveState();
  updateInboxBadge();
}

function countUnreadParentMsgs(){
  return (APP.parentMessages||[]).filter(m => !isTeacherParentMsgRead(m)).length;
}

function markAllParentMsgsSeen(){
  const key = getTeacherKey();
  if(!key) return;
  const ids = getReadParentMsgIds(key);
  (APP.parentMessages||[]).forEach(m=>{
    const readId = parentMsgReadId(m);
    if(readId && !ids.includes(readId)) ids.push(readId);
    m.read = true;
  });
  try{ localStorage.setItem('read_pm_'+key, JSON.stringify(ids)); }catch(e){}
  saveState();
  updateInboxBadge();
}

function updateInboxBadge(){
  const newCnt = countUnreadParentMsgs();
  const tab = document.getElementById('ttab-messages');
  if(!tab) return;
  let badge = tab.querySelector('.inbox-badge');
  if(newCnt>0){
    if(!badge){
      badge=document.createElement('span');
      badge.className='inbox-badge';
      badge.style.cssText='background:var(--red-soft);color:#fff;border-radius:20px;font-size:11px;font-weight:700;padding:1px 7px;margin-right:6px;display:inline-block';
      tab.prepend(badge);
    }
    badge.textContent=newCnt;
  } else if(badge){ badge.remove(); }
}

function toggleParentComplaintForm(idx){
  const form = document.getElementById('parent-complaint-form-'+idx);
  if(!form) return;
  form.style.display = form.style.display==='none' ? 'block' : 'none';
}

async function submitParentComplaint(idx, teacherKey, cls, studentName, mid){
  const isEn = currentLang==='en';
  const body = (document.getElementById('parent-complaint-input-'+idx)?.value||'').trim();
  if(!body){
    showToast('⚠️ '+(isEn?'Write your complaint first':'اكتب نص الشكوى أولاً'));
    return;
  }
  const ctx = window._parentSubjectContext || {};
  const tc = (ctx.teachers||[])[Number(idx)];
  if(!tc) return;
  const section = ctx.section || window._currentParent?.section || '';
  const now = new Date();
  const payload = {
    cls,
    section,
    studentName: studentName.trim(),
    mid: String(mid||''),
    teacherKey,
    teacherName: tc.name||'',
    subject: tc.subject||'',
    subjLabel: tc.subjLabel||'',
    body,
    date: now.toLocaleDateString(isEn?'en-AE':'ar-AE')+' '+now.toLocaleTimeString(isEn?'en-AE':'ar-AE',{hour:'2-digit',minute:'2-digit'}),
    ts: now.toISOString(),
    status: 'pending',
  };
  try{
    let complaintId;
    if(typeof window.fbPushComplaint === 'function'){
      complaintId = await window.fbPushComplaint(payload);
    } else if(typeof db!=='undefined'){
      const ref = db.ref('complaints').push();
      await ref.set({...payload, status:'pending'});
      complaintId = ref.key;
    } else {
      throw new Error('no firebase');
    }
    const record = {...payload, id: complaintId, _teacherKey: teacherKey};
    APP.parentComplaints = APP.parentComplaints || [];
    APP.parentComplaints.push(record);
    saveState();

    const ta = document.getElementById('parent-complaint-input-'+idx);
    if(ta) ta.value = '';
    const conf = document.getElementById('parent-complaint-confirm-'+idx);
    if(conf){
      conf.style.display = 'block';
      setTimeout(()=>{ conf.style.display='none'; }, 4000);
    }
    renderSubjectSentComplaintsLog(idx, teacherKey, cls, studentName);
    showToast('✅ '+(isEn?'Complaint sent to admin':'تم إرسال الشكوى للمسؤول'));
  }catch(e){
    console.error('submitParentComplaint', e);
    showToast('⚠️ '+(isEn?'Failed to send complaint':'فشل إرسال الشكوى'));
  }
}

function renderTeacherComplaints(){
  const wrap = document.getElementById('teacher-complaints-inbox');
  if(!wrap) return;
  const isEn = currentLang==='en';
  const list = APP.complaintInbox || [];
  if(!list.length){
    wrap.innerHTML = `<div class="empty-state"><div class="ico">📭</div><p>${isEn?'No forwarded complaints yet':'لا توجد شكاوى موجّهة بعد'}</p></div>`;
    return;
  }
  wrap.innerHTML = list.map(c=>{
    const isGeneral = c.general || c.anonymous;
    const studentLine = isGeneral
      ? `<span class="teacher-complaint-tag general">🔒 ${isEn?'General complaint (anonymous)':'شكوى عامة — بدون بيانات صاحب الشكوى'}</span>`
      : `<span>👨‍🎓 ${escapeHtml(displayStudentName(c.studentName, c.cls, c.section, c.mid))} · 🆔 ${escapeHtml(c.mid||'—')}</span>`;
    return `
      <div class="teacher-complaint-card${c.read?' read':''}" onclick="markTeacherComplaintRead('${c.id}')">
        <div class="teacher-complaint-head">
          <span style="font-weight:700;color:var(--teal-dark)">📖 ${escapeHtml(c.subjLabel||formatAdminSubject(c.subject, isEn))}</span>
          <span style="font-size:11px;color:var(--grey-3)">${formatAdminDate(c.forwardedAt||c.ts, isEn)}</span>
        </div>
        <div class="teacher-complaint-meta">
          ${studentLine}
          <span>📚 ${isEn?'Grade':'صف'} ${escapeHtml(c.cls||'—')} · ${isEn?'Sec':'ش'} ${escapeHtml(c.section||'—')}</span>
        </div>
        <p class="teacher-complaint-body">${escapeHtml(c.body||'')}</p>
      </div>`;
  }).join('');
}

function updateTeacherComplaintsBadge(){
  const unread = (APP.complaintInbox||[]).filter(c=>!c.read).length;
  const tab = document.getElementById('ttab-complaints');
  if(!tab) return;
  let badge = tab.querySelector('.inbox-badge');
  if(unread>0){
    if(!badge){
      badge=document.createElement('span');
      badge.className='inbox-badge';
      badge.style.cssText='background:var(--red-soft);color:#fff;border-radius:20px;font-size:11px;font-weight:700;padding:1px 7px;margin-right:6px;display:inline-block';
      tab.prepend(badge);
    }
    badge.textContent=unread;
  } else if(badge){ badge.remove(); }
}

async function markTeacherComplaintRead(id){
  const item = (APP.complaintInbox||[]).find(c=>c.id===id);
  if(!item || item.read) return;
  item.read = true;
  saveState();
  updateTeacherComplaintsBadge();
  renderTeacherComplaints();
  const key = getTeacherKey();
  if(typeof db!=='undefined' && key){
    try{ await db.ref('teacherData/'+key+'/complaintInbox/'+id).update({read:true}); }catch(e){ console.warn(e); }
  }
}

async function markAllTeacherComplaintsRead(){
  const key = getTeacherKey();
  const unread = (APP.complaintInbox||[]).filter(c=>!c.read);
  if(!unread.length) return;
  unread.forEach(c=>{ c.read = true; });
  saveState();
  updateTeacherComplaintsBadge();
  if(typeof db!=='undefined' && key){
    const updates = {};
    unread.forEach(c=>{ updates[c.id+'/read'] = true; });
    try{ await db.ref('teacherData/'+key+'/complaintInbox').update(updates); }catch(e){ console.warn(e); }
  }
}



// ══════════════════════════════════════════════════
//  EXCEL IMPORT (SheetJS)
// ══════════════════════════════════════════════════

// ══════════════════════════════════════════════════
//  IMPORT STUDENTS ROSTER FROM EXCEL
// ══════════════════════════════════════════════════
function importStudentsExcel(input){
  const file = input.files[0];
  if(!file) return;
  if(!window.XLSX){ showToast('⚠️ '+(currentLang==="en"?"Excel library not loaded yet":"مكتبة Excel لم تُحمَّل بعد")); return; }

  const isEn = currentLang==='en';
  showToast('⏳ '+(isEn?'Reading file...':'جارٍ قراءة الملف...'));

  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, {type:'array'});
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});

      if(!rows.length){ showToast('⚠️ '+(isEn?'File is empty':'الملف فارغ')); return; }

      // Find header row (first row with الصف or grade keyword)
      let headerRow = 0;
      for(let i=0;i<Math.min(rows.length,10);i++){
        const r = rows[i].map(c=>String(c||'').trim());
        if(r.some(c=>c.includes('الصف')||c.toLowerCase().includes('grade'))){
          headerRow=i; break;
        }
      }
      console.log('[Import] Header row:', headerRow, 'Content:', rows[headerRow]);
      console.log('[Import] Total rows in file:', rows.length);
      // Count non-empty rows
      const nonEmpty = rows.slice(headerRow+1).filter(r=>r.some(c=>String(c||'').trim())).length;
      console.log('[Import] Non-empty data rows:', nonEmpty);

      // Map columns by position (based on known template structure):
      // A=م, B=الصف, C=الشعبة, D=الرقم الوزاري, E=الاسم بالعربية, F=الاسم بالإنجليزية
      // Also try to detect by header text as fallback
      const header = rows[headerRow].map(c=>String(c||'').trim());
      const findCol = (...keywords) => {
        let idx = header.findIndex(h=>keywords.some(k=>h.includes(k)));
        return idx >= 0 ? idx : -1;
      };

      // Positional defaults (A=0,B=1,C=2,D=3,E=4,F=5)
      const colGrade   = findCol('الصف','grade','Grade') >= 0 ? findCol('الصف','grade','Grade') : 1;
      const colSection = findCol('الشعبة','section','Section') >= 0 ? findCol('الشعبة','section','Section') : 2;
      const colMid     = findCol('الرقم','وزاري','mid','Mid','ID','id') >= 0 ? findCol('الرقم','وزاري','mid','Mid','ID','id') : 3;
      const colNameAr  = findCol('العربية','بالعربي','Arabic') >= 0 ? findCol('العربية','بالعربي','Arabic') : 4;
      const colNameEn  = findCol('الإنجليزية','الانجليزية','English') >= 0 ? findCol('الإنجليزية','الانجليزية','English') : 5;

      console.log('Column mapping:', {colGrade, colSection, colMid, colNameAr, colNameEn});

      // Get teacher scope
      const scope = getTeacherScope();
      const studentsByGrade = {}; // {grade: [{mid,name,nameEn,section}]}
      let total = 0, skipped = 0;

      for(let i=headerRow+1; i<rows.length; i++){
        const row     = rows[i];
        const grade   = String(row[colGrade]  ||'').trim();
        const section = normalizeSectionCell(row[colSection]);
        const mid     = String(row[colMid]    ||'').trim();
        const nameAr  = String(row[colNameAr] ||'').trim();
        const nameEn  = String(row[colNameEn] ||'').trim();

        // Skip empty rows
        if(!nameAr && !mid) continue;
        if(!grade)          continue;

        // Validate scope — only skip if scope exists AND grade not in scope
        if(scope){
          if(!scope.grades.includes(grade)){
            console.log('[Import] Skipped row - grade "'+grade+'" not in teacher scope:', scope.grades);
            skipped++; continue;
          }
          if(section && scope.sections.length && !scope.sections.includes(section)){
            console.log('[Import] Skipped row - section "'+section+'" not in teacher scope:', scope.sections);
            skipped++; continue;
          }
        }

        if(!studentsByGrade[grade]) studentsByGrade[grade] = [];
        studentsByGrade[grade].push({mid, name:nameAr, nameEn, section});
        total++;
      }

      console.log('[Import] Parsed:', total, 'students, skipped:', skipped);
      console.log('[Import] Grade keys found:', Object.keys(studentsByGrade));
      if(scope) console.log('[Import] Teacher scope grades:', scope.grades, 'sections:', scope.sections);

      if(!total){
        let scopeMsg = '';
        if(scope){
          scopeMsg = isEn
            ? `\n⚠️ Your account is registered for grades: ${scope.grades.join(', ')} — make sure the Excel grade column matches exactly (e.g. "7" not "الصف 7")`
            : `\n⚠️ حسابك مسجّل للصفوف: ${scope.grades.join('، ')} — تأكد أن عمود الصف في Excel مطابق تماماً (مثلاً "7" وليس "الصف 7")`;
        }
        const msg = (isEn?'⚠️ No students found':'⚠️ لم يتم العثور على طلاب صالحين')+scopeMsg;
        alert(msg); // use alert so full message is visible
        input.value=''; return;
      }

      // Store in TEACHER_STUDENTS and merge into STUDENTS
      Object.entries(studentsByGrade).forEach(([grade, students])=>{
        if(!window.TEACHER_STUDENTS[grade]) window.TEACHER_STUDENTS[grade]=[];
        window.TEACHER_STUDENTS[grade] = students.map(s=>({...s,t1:0,t2:0,hw:0,portal:0,activity:0,lab:0,total:0}));
      });
      // Save to Firebase
      const tKey = CURRENT_TEACHER && CURRENT_TEACHER.email ? emailKey(CURRENT_TEACHER.email) : '';
      if(typeof db!=='undefined' && tKey){
        const updates = {};
        Object.entries(studentsByGrade).forEach(([grade, students])=>{
          students.forEach((s,i)=>{
            updates['teacherData/'+tKey+'/students/'+grade+(s.section||'')+'/'+(s.mid||i)] = {
              mid:s.mid, name:s.name, nameEn:s.nameEn, section:s.section, grade
            };
          });
        });
        db.ref().update(updates)
          .then(()=>{
            showToast('✅ '+(isEn?`Imported ${total} students`:`تم رفع ${total} طالب`)+(skipped?` (${skipped} `+(isEn?'skipped)':'مُستبعَد)'):''));
            refreshGradeDropdowns(); initDashboard();
          })
          .catch(err=>showToast('⚠️ Firebase error: '+err.message));
      } else {
        showToast('✅ '+(isEn?`Imported ${total} students locally`:`تم استيراد ${total} طالب محلياً`));
        refreshGradeDropdowns(); initDashboard();
      }
      input.value='';
    } catch(err){
      console.error(err);
      showToast('❌ '+(isEn?'Error: ':'خطأ: ')+err.message);
      input.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}


// ══════════════════════════════════════════════════
//  GRADE EXCEL IMPORT — official template (grades-template.xlsx)
// ══════════════════════════════════════════════════

function parseSheetGradeSection(sheetName){
  const hint = parseSheetNameGradeSection(sheetName);
  if(hint) return hint;
  const n = String(sheetName || '').trim();
  const m = n.match(/(?:صف|grade)?\s*([5-8]).*?(?:ش|sec)?\s*([1-6])/i);
  if(m) return { grade: m[1], section: normalizeSectionCell(m[2]) };
  return null;
}

function isTeacherScopeMatch(scope, grade, section){
  if(!scope) return true;
  const g = String(grade || '');
  const sec = normalizeSectionCell(section);
  if(!g) return false;
  if(scope.grades?.length && !scope.grades.includes(g)) return false;
  const allowed = (getSectionsForGrade(g) || []).map(normalizeSectionCell).filter(Boolean);
  if(sec && allowed.length && !allowed.includes(sec)) return false;
  return true;
}

function shouldProcessGradeSheet(sheetName, scope){
  const hint = parseSheetGradeSection(sheetName);
  if(!scope) return { process: true, hint, reason: null };
  if(!hint) return { process: false, hint: null, reason: 'unparsed' };
  if(!isTeacherScopeMatch(scope, hint.grade, hint.section)){
    return { process: false, hint, reason: 'out_of_scope' };
  }
  return { process: true, hint, reason: null };
}

function showImportUnmatchedAlert(unmatched, isEn){
  if(!unmatched.length) return;
  const lines = unmatched.slice(0, 20).map(u => {
    const name = u.name && u.name !== '—' ? u.name : (isEn ? '(no name)' : '(بدون اسم)');
    const sheet = u.sheet ? (isEn ? ` [${u.sheet}]` : ` [${u.sheet}]`) : '';
    return isEn
      ? `• ${name} — ID ${u.mid}${sheet}`
      : `• ${name} — رقم ${u.mid}${sheet}`;
  }).join('\n');
  const more = unmatched.length > 20 ? `\n... +${unmatched.length - 20}` : '';
  alert(
    (isEn
      ? `⚠️ ${unmatched.length} student(s) not found in the admin list:\n\n`
      : `⚠️ ${unmatched.length} طالب/ة غير موجودين في قائمة المسؤول:\n\n`)
    + lines + more
  );
}

function normalizeGradeCell(val){
  const s = String(val||'').trim();
  const m = s.match(/[5-8]/);
  return m ? m[0] : s.replace(/\D/g,'') || '';
}

function normalizeSectionCell(val){
  let s = String(val||'').trim().replace(/شعبة/g,'').trim();
  if(!s) return '';
  if(/^([1-6])$/.test(s)) return s;
  const legacyLetters = { A:'1', B:'2', C:'3', D:'4', E:'5', F:'6' };
  const legacyArabic  = { 'أ':'1', 'ب':'2', 'ج':'3', 'د':'4', 'ه':'5', 'هـ':'5', 'و':'6' };
  const upper = s.toUpperCase();
  if(legacyLetters[upper]) return legacyLetters[upper];
  if(legacyArabic[s]) return legacyArabic[s];
  const digit = s.match(/([1-6])/);
  if(digit) return digit[1];
  return s.replace(/\D/g,'').slice(0,1) || '';
}

function findStudentByMid(mid, gradeHint, sectionHint){
  const m = String(mid||'').trim().replace(/\s/g,'');
  if(!m) return null;
  const grades = gradeHint ? [normalizeGradeCell(gradeHint)] : ['5','6','7','8'];
  for(const g of grades){
    if(!g) continue;
    if(sectionHint){
      const sec = normalizeSectionCell(sectionHint);
      const list = getGradeStudents(g, sec);
      const hit = list.find(s => String(s.mid).trim() === m);
      if(hit) return { grade:g, student:hit };
    }
    const allInGrade = getGradeStudents(g);
    const hit = allInGrade.find(s => String(s.mid).trim() === m);
    if(hit) return { grade:g, student:hit };
  }
  return null;
}

function buildGradeColumnMap(rows){
  const map = { hwWeeks:[], portalWeeks:[], actWeeks:[] };
  const headerRows = Math.min(rows.length, 6);
  const maxCols = Math.max(...rows.slice(0, headerRows).map(r => (r||[]).length), 0);
  const combined = [];
  for(let c=0; c<maxCols; c++){
    let h = '';
    for(let r=0; r<headerRows; r++) h += ' ' + String(rows[r]?.[c] ?? '').trim();
    combined[c] = h.replace(/\s+/g,' ').trim();
  }
  combined.forEach((h, c)=>{
    if(!h) return;
    if((/^م$|\bم\b|serial/i.test(h)) && map.serial == null) map.serial = c;
    if(h.includes('الصف') && !h.includes('الصفوف') && map.grade == null) map.grade = c;
    if(h.includes('الشعبة') && map.section == null) map.section = c;
    if((h.includes('رقم') && (h.includes('طالب') || h.includes('وزاري'))) && map.mid == null) map.mid = c;
    if(h.includes('عرب') && map.nameAr == null) map.nameAr = c;
    if((h.includes('إنج') || h.includes('انجل') || h.includes('English')) && map.nameEn == null) map.nameEn = c;
    if(h.includes('تشخيص') && map.diagnostic == null) map.diagnostic = c;
    if(h.includes('التكويني') && h.includes('أول') && map.t1 == null) map.t1 = c;
    if(h.includes('التكويني') && h.includes('ثان') && map.t2 == null) map.t2 = c;
    if((h.includes('LAB') || h.includes('مختبر')) && map.lab == null) map.lab = c;
    if((h.includes('محصلة') || h.includes('التقويم')) && map.total == null) map.total = c;
    if((h.includes('نهائي') || h.includes('Final')) && map.final == null) map.final = c;
    if(h.includes('الواجبات') && map.hwStart == null) map.hwStart = c;
    if(h.includes('بوابة') && map.portalStart == null) map.portalStart = c;
    if(h.includes('المشاركة') && map.actStart == null) map.actStart = c;
  });
  // Positional fallback for standard ministry template
  if(map.mid == null) map.mid = 3;
  if(map.grade == null) map.grade = 1;
  if(map.section == null) map.section = 2;
  if(map.nameAr == null) map.nameAr = 4;
  if(map.diagnostic == null) map.diagnostic = 6;
  if(map.t1 == null) map.t1 = 7;
  if(map.t2 == null) map.t2 = 8;
  if(map.hwStart == null) map.hwStart = 9;
  if(map.portalStart == null) map.portalStart = 20;
  if(map.actStart == null) map.actStart = 31;
  if(map.lab == null) map.lab = 42;
  if(map.total == null) map.total = 43;
  if(map.final == null) map.final = 44;
  for(let i=0; i<GRADE_WEEK_COUNT; i++){
    map.hwWeeks.push(map.hwStart + i);
    map.portalWeeks.push(map.portalStart + i);
    map.actWeeks.push(map.actStart + i);
  }
  return map;
}

function readWeekValues(row, cols){
  return cols.map(c=>{
    const v = parseFloat(row[c]);
    return isNaN(v) ? null : v;
  });
}

function avgWeekValues(vals){
  const nums = (vals || []).filter(v => v !== null && !isNaN(v));
  if(!nums.length) return 0;
  const sum = nums.reduce((a,b)=>a+b, 0);
  const avg = sum / nums.length;
  return avg <= 1 ? +(avg * 100).toFixed(1) : +avg.toFixed(1);
}

function pctVal(v){
  const n = parseFloat(v);
  if(isNaN(n)) return 0;
  return n <= 1 ? +(n * 100).toFixed(1) : +n.toFixed(1);
}

function findGradeDataStartRow(rows, map){
  for(let i=1; i<rows.length; i++){
    const mid = String(rows[i]?.[map.mid] ?? '').trim().replace(/\s/g,'');
    if(/^\d{4,}$/.test(mid)) return i;
  }
  return 3;
}

function persistGradeRecord(tKey, grade, sec, mId, gradeObj){
  const bucket = grade + sec;
  if(!window.TEACHER_GRADES[bucket]) window.TEACHER_GRADES[bucket] = {};
  window.TEACHER_GRADES[bucket][mId] = gradeObj;
  if(typeof db !== 'undefined' && tKey){
    return db.ref(`teacherData/${tKey}/grades/${bucket}/${mId}`).set(gradeObj);
  }
  return Promise.resolve();
}

function parseGradeRow(row, map, sheetHint){
  const mid = String(row[map.mid] ?? '').trim();
  const gradeHint = normalizeGradeCell(row[map.grade]) || sheetHint?.grade || '';
  const sectionHint = normalizeSectionCell(row[map.section]) || sheetHint?.section || '';
  const nameAr = String(row[map.nameAr] ?? '').trim();
  const nameEn = map.nameEn != null ? String(row[map.nameEn] ?? '').trim() : '';
  const displayName = nameAr || nameEn || '—';
  if(!mid) return { error:'empty_mid', mid, name:displayName };

  const hit = findStudentByMid(mid, gradeHint, sectionHint);
  if(!hit) return { error:'no_match', mid, name:displayName };

  const hwVals = readWeekValues(row, map.hwWeeks);
  const portalVals = readWeekValues(row, map.portalWeeks);
  const actVals = readWeekValues(row, map.actWeeks);

  const t1 = parseFloat(row[map.t1]) || 0;
  const t2 = parseFloat(row[map.t2]) || 0;
  const lab = parseFloat(row[map.lab]) || 0;
  let total = parseFloat(row[map.total]);
  if(isNaN(total)){
    total = parseFloat(row[map.final]) || 0;
  }
  total = pctVal(total);

  const gradeObj = {
    name: hit.student.name,
    mid: hit.student.mid,
    diagnostic: parseFloat(row[map.diagnostic]) || 0,
    t1: +t1.toFixed(1),
    t2: +t2.toFixed(1),
    hw: avgWeekValues(hwVals),
    portal: avgWeekValues(portalVals),
    activity: Math.round(avgWeekValues(actVals)),
    lab: +lab.toFixed(0),
    total,
    final: parseFloat(row[map.final]) || 0,
    hwWeeks: hwVals,
    portalWeeks: portalVals,
    actWeeks: actVals,
    updatedAt: new Date().toISOString(),
  };

  return { hit, gradeObj };
}

function importGradeSheet(ws, sheetName, tKey, scope){
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  if(!rows.length) return { imported:0, unmatched:[], skipped:true, saves:[] };

  const decision = shouldProcessGradeSheet(sheetName, scope);
  if(!decision.process){
    return { imported:0, unmatched:[], skipped:true, saves:[] };
  }
  const sheetHint = decision.hint;

  const map = buildGradeColumnMap(rows);
  const start = findGradeDataStartRow(rows, map);
  let imported = 0;
  const unmatched = [];
  const saves = [];

  for(let i=start; i<rows.length; i++){
    const row = rows[i];
    const midRaw = String(row[map.mid] ?? '').trim().replace(/\s/g,'');
    if(!midRaw || !/^\d+$/.test(midRaw)) continue;

    const parsed = parseGradeRow(row, map, sheetHint);
    if(parsed.error === 'no_match'){
      unmatched.push({ mid: midRaw, name: parsed.name || '—', sheet: sheetName });
      continue;
    }
    if(parsed.error) continue;

    const { hit, gradeObj } = parsed;
    const g = hit.grade;
    const sec = normalizeSectionCell(hit.student.section || sheetHint?.section);

    if(scope && !isTeacherScopeMatch(scope, g, sec)) continue;

    saves.push(persistGradeRecord(tKey, g, sec, hit.student.mid, gradeObj));
    imported++;
  }

  return { imported, unmatched, skipped:false, saves };
}

async function processGradesWorkbook(wb, opts){
  const silent = opts?.silent;
  const isEn = currentLang==='en';
  if(!wb?.SheetNames?.length){
    if(!silent) showToast('⚠️ '+(isEn?'File is empty':'الملف فارغ'));
    return false;
  }

  const tKey = CURRENT_TEACHER?.email ? emailKey(CURRENT_TEACHER.email) : getTeacherKey();
  const scope = getTeacherScope();
  let imported = 0;
  const unmatchedMap = new Map();
  const allSaves = [];
  let sheetsProcessed = 0;
  let sheetsSkipped = 0;
  const matchedSheets = [];
  const skippedSheets = [];

  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    if(!ws) continue;
    const decision = shouldProcessGradeSheet(sheetName, scope);
    if(!decision.process){
      sheetsSkipped++;
      skippedSheets.push(sheetName);
      continue;
    }
    const result = importGradeSheet(ws, sheetName, tKey, scope);
    if(result.skipped){
      sheetsSkipped++;
      skippedSheets.push(sheetName);
      continue;
    }
    sheetsProcessed++;
    matchedSheets.push(sheetName);
    imported += result.imported;
    result.unmatched.forEach(u=>{
      const key = String(u.mid);
      if(!unmatchedMap.has(key)) unmatchedMap.set(key, u);
    });
    allSaves.push(...result.saves);
  }

  await Promise.all(allSaves);
  const unmatched = [...unmatchedMap.values()];

  if(imported > 0){
    const sheetList = matchedSheets.slice(0, 8).join(', ')
      + (matchedSheets.length > 8 ? '…' : '');
    const skipInfo = sheetsSkipped
      ? (isEn ? ` — ignored ${sheetsSkipped} other sheet(s)` : ` — تم تجاهل ${sheetsSkipped} ورقة أخرى`)
      : '';
    if(!silent){
      showToast(
        isEn
          ? `✅ Updated ${imported} student(s) from ${sheetsProcessed} sheet(s): ${sheetList}${skipInfo}`
          : `✅ تم تحديث ${imported} طالب من ${sheetsProcessed} ورقة: ${sheetList}${skipInfo}`
      );
    }
    renderAllTabs();
    if(!silent) showImportUnmatchedAlert(unmatched, isEn);
    return true;
  }

  if(!silent){
    const expected = scope
      ? (scope.grades || []).flatMap(g =>
          (getSectionsForGrade(g) || []).map(sec => `${g}-${normalizeSectionCell(sec)}`)
        ).join(', ')
      : '';
    const hint = sheetsSkipped && !sheetsProcessed
      ? (isEn
        ? (expected ? ` — your sections: ${expected}` : ' — no sheets match your sections')
        : (expected ? ` — شعبك: ${expected}` : ' — لا توجد أوراق تطابق شعبك'))
      : '';
    showToast((isEn ? '⚠️ No grades imported' : '⚠️ لم يتم استيراد أي درجات') + hint);
    if(skippedSheets.length) console.log('[Import] Skipped sheets:', skippedSheets);
    showImportUnmatchedAlert(unmatched, isEn);
  }
  return false;
}

function importExcel(input){
  const file = input.files[0];
  if(!file) return;
  const isEn = currentLang==='en';
  if(!window.XLSX){
    showToast('⚠️ '+(isEn?'Excel library not loaded':'مكتبة Excel لم تُحمَّل'));
    return;
  }
  showToast('⏳ '+(isEn?'Reading grades file...':'جارٍ قراءة ملف الدرجات...'));
  const reader = new FileReader();
  reader.onload = async function(e){
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
      const ok = await processGradesWorkbook(wb);
      if(ok && typeof db !== 'undefined'){
        const tKey = getTeacherKey();
        const ts = new Date().toISOString();
        TEACHER_SETTINGS.lastGradeSync = ts;
        if(tKey) await db.ref('teacherData/'+tKey+'/settings/lastGradeSync').set(ts);
        populateSettingsPhase3();
      }
    } catch(err){
      console.error(err);
      showToast('❌ '+(isEn?'File error: ':'خطأ: ')+err.message);
    }
    input.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════════════
//  RESULTS ANALYSIS TAB
// ══════════════════════════════════════════════════
let _analysisCharts = [];

function destroyAnalysisCharts(){
  _analysisCharts.forEach(c => { try{ c.destroy(); }catch(_e){} });
  _analysisCharts = [];
}

function getStudentGradeRecord(student){
  const cls = student.cls || '';
  const sec = student.section || '';
  const bucket = cls + sec;
  const store = window.TEACHER_GRADES[bucket] || window.TEACHER_GRADES[cls] || {};
  return store[student.mid] || store[student.name] || {};
}

function renderAnalysisTab(){
  destroyAnalysisCharts();
  const statsEl = document.getElementById('analysis-stats');
  const listEl  = document.getElementById('analysis-remedial-list');
  if(!statsEl || !listEl) return;

  const isEn = currentLang==='en';
  const cls  = document.getElementById('analysis-class')?.value || '';
  const sec  = document.getElementById('analysis-sec')?.value || '';
  const students = allStudents(cls, sec);

  const withGrades = students.filter(s => (s.total||0) > 0 || (s.t1||0) > 0 || (s.t2||0) > 0);
  const avg = withGrades.length
    ? (withGrades.reduce((a,s)=>a+(s.total||0),0)/withGrades.length).toFixed(1)
    : '—';
  const pass = withGrades.filter(s=>(s.total||0)>=70).length;
  const fail = withGrades.filter(s=>(s.total||0)>0 && (s.total||0)<70).length;

  statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-icon teal">👥</div><div><div class="stat-val">${withGrades.length}</div><div class="stat-label">${isEn?'With grades':'طلاب بدرجات'}</div></div></div>
    <div class="stat-card"><div class="stat-icon gold">📈</div><div><div class="stat-val">${avg}${avg==='—'?'':'%'}</div><div class="stat-label">${isEn?'Class average':'المتوسط'}</div></div></div>
    <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-val">${pass}</div><div class="stat-label">${isEn?'Pass (70%+)':'نجاح 70%+'}</div></div></div>
    <div class="stat-card"><div class="stat-icon red">🎯</div><div><div class="stat-val">${fail}</div><div class="stat-label">${isEn?'Needs support':'يحتاج دعم'}</div></div></div>`;

  const buckets = isEn
    ? ['Excellent 90+','Very Good 80+','Good 70+','Acceptable 60+','Below 60']
    : ['ممتاز 90+','جيد جداً 80+','جيد 70+','مقبول 60+','ضعيف <60'];
  const bucketCounts = [0,0,0,0,0];
  withGrades.forEach(s=>{
    const t = s.total||0;
    if(t>=90) bucketCounts[0]++;
    else if(t>=80) bucketCounts[1]++;
    else if(t>=70) bucketCounts[2]++;
    else if(t>=60) bucketCounts[3]++;
    else bucketCounts[4]++;
  });

  const remedial = withGrades.filter(s=>{
    const t = s.total||0;
    return t < 70 || (s.t1||0) < 60 || (s.t2||0) < 60;
  }).sort((a,b)=>(a.total||0)-(b.total||0));

  document.getElementById('an-remedial-count').textContent =
    remedial.length
      ? (isEn ? `${remedial.length} student(s)` : `${remedial.length} طالب`)
      : (isEn ? 'None — great!' : 'لا أحد — ممتاز!');

  listEl.innerHTML = remedial.length
    ? remedial.map(s=>{
        const rec = getStudentGradeRecord(s);
        const name = displayStudentName(s, s.cls || cls, s.section, s.mid);
        const reasons = [];
        if((s.total||0)<70) reasons.push(isEn?'Total below 70%':'المحصلة دون 70%');
        if((s.t1||0)<60) reasons.push(isEn?'Formative 1 weak':'تكويني 1 ضعيف');
        if((s.t2||0)<60) reasons.push(isEn?'Formative 2 weak':'تكويني 2 ضعيف');
        return `<div class="remedial-card">
          <div>
            <strong>${name}</strong>
            <div class="remedial-meta">${isEn?'Grade':'الصف'} ${s.cls}${s.section?' · '+s.section:''} · ${isEn?'Total':'المحصلة'}: ${(s.total||0).toFixed(1)}%</div>
            <div class="remedial-meta">${reasons.join(' · ')}</div>
          </div>
          <span class="badge badge-red">${(s.total||0).toFixed(1)}%</span>
        </div>`;
      }).join('')
    : `<div class="empty-state"><div class="ico">🌟</div><p>${isEn?'No students need a remedial plan right now':'لا يوجد طلاب مستهدفون حالياً'}</p></div>`;

  if(typeof Chart === 'undefined') return;

  const distCtx = document.getElementById('chart-grade-dist');
  if(distCtx){
    _analysisCharts.push(new Chart(distCtx, {
      type:'bar',
      data:{
        labels: buckets,
        datasets:[{
          label: isEn ? 'Students' : 'عدد الطلاب',
          data: bucketCounts,
          backgroundColor:['#0d6e6e','#1a9a9a','#c8961e','#78909c','#e53935'],
          borderRadius:8,
        }]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ display:false } },
        scales:{ y:{ beginAtZero:true, ticks:{ stepSize:1 } } }
      }
    }));
  }

  const passCtx = document.getElementById('chart-pass-rate');
  if(passCtx){
    _analysisCharts.push(new Chart(passCtx, {
      type:'doughnut',
      data:{
        labels: isEn ? ['Pass 70%+','Below 70%'] : ['نجاح 70%+','دون 70%'],
        datasets:[{
          data:[pass, fail],
          backgroundColor:['#2e7d32','#e53935'],
          borderWidth:0,
        }]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom' } }
      }
    }));
  }

  const weekLabels = Array.from({length:11}, (_,i)=>(isEn?`W${i+1}`:`أ${i+1}`));
  const hwAvg = Array(11).fill(0);
  const portalAvg = Array(11).fill(0);
  const actAvg = Array(11).fill(0);
  const weekN = Array(11).fill(0);
  withGrades.forEach(s=>{
    const rec = getStudentGradeRecord(s);
    (rec.hwWeeks||[]).forEach((v,i)=>{ if(v!=null){ hwAvg[i]+=v; weekN[i]++; } });
    (rec.portalWeeks||[]).forEach((v,i)=>{ if(v!=null){ portalAvg[i]+=v; } });
    (rec.actWeeks||[]).forEach((v,i)=>{ if(v!=null){ actAvg[i]+=v; } });
  });
  for(let i=0;i<11;i++){
    if(weekN[i]>0){
      hwAvg[i] = +(hwAvg[i]/weekN[i]).toFixed(1);
      portalAvg[i] = +(portalAvg[i]/weekN[i]).toFixed(1);
      actAvg[i] = +(actAvg[i]/weekN[i]).toFixed(1);
    }
  }

  const weekCtx = document.getElementById('chart-weekly-trend');
  if(weekCtx){
    _analysisCharts.push(new Chart(weekCtx, {
      type:'line',
      data:{
        labels: weekLabels,
        datasets:[
          { label: isEn?'Homework':'الواجبات', data:hwAvg, borderColor:'#0d6e6e', backgroundColor:'rgba(13,110,110,.15)', fill:true, tension:.35 },
          { label: isEn?'Portal tests':'اختبارات البوابة', data:portalAvg, borderColor:'#c8961e', backgroundColor:'rgba(200,150,30,.1)', fill:true, tension:.35 },
          { label: isEn?'Participation':'المشاركة', data:actAvg, borderColor:'#2e7d32', backgroundColor:'rgba(46,125,50,.1)', fill:true, tension:.35 },
        ]
      },
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom' } },
        scales:{ y:{ beginAtZero:true, max:100 } }
      }
    }));
  }
}

function renderAllTabs(){
  renderOverview();
  renderAnalysisTab();
  renderGradesTab();
  renderPinsTab();
  renderBehaviorTab();
  renderLinksTab();
}

// ══════════════════════════════════════════════════
//  PWA — تثبيت وإشعارات (هاتف وكمبيوتر)
// ══════════════════════════════════════════════════
let swRegistration = null;
let deferredPrompt  = null;

// ─── SW Registration ───
async function registerSW(){
  if(!('serviceWorker' in navigator)) return;
  // تجنّب SW على localhost — يسبب تعارضات أثناء التطوير
  if(location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  try {
    swRegistration = await navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('message', e => {
      if(e.data?.type === 'NOTIFICATION_CLICK') openInboxFromAlert();
    });
    // إرسال عدد الرسائل الحالي للـ SW للـ polling
    swRegistration.active?.postMessage({
      type:'INIT_POLLING',
      count: APP.messages.length
    });
    // تسجيل Periodic Sync إذا كان مدعوماً (للإشعارات في الخلفية)
    if('periodicSync' in swRegistration){
      try {
        await swRegistration.periodicSync.register('check-messages', {minInterval: 60*1000});
        console.log('Periodic sync registered ✅');
      } catch(e){ console.log('Periodic sync not supported:', e.message); }
    }
    console.log('SW ✅');
  } catch(e){ console.warn('SW:', e); }
}
if('serviceWorker' in navigator) window.addEventListener('load', registerSW);
// تطبيق اللغة المحفوظة عند التحميل
document.addEventListener('DOMContentLoaded', ()=>{ applyGlobalLang(); });

// ─── Install prompt ───
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // أظهر بانر التثبيت
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.classList.add('show');
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.classList.remove('show');
  showToast('✅ تم التثبيت! فعّل الإشعارات الآن');
  setTimeout(requestAndSubscribe, 1500);
});

async function installPWA(){
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.classList.remove('show');
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else {
    showInstallOptions();
  }
}
function dismissBanner(){
  const banner = document.getElementById('pwa-banner');
  if(banner) banner.classList.remove('show');
}
function showInstallOptions(){
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  if(isIOS){
    alert('لتثبيت البوابة على الآيفون:\n\n1️⃣ اضغط زر المشاركة ↑ في Safari\n2️⃣ اختر "إضافة إلى الشاشة الرئيسية"\n3️⃣ اضغط "إضافة"');
  } else if(isAndroid){
    alert('لتثبيت البوابة على الأندرويد:\n\n1️⃣ اضغط قائمة Chrome ⋮\n2️⃣ اختر "إضافة إلى الشاشة الرئيسية"\nأو انتظر ظهور بانر التثبيت تلقائياً');
  } else {
    alert('لتثبيت البوابة على الكمبيوتر:\n\n1️⃣ ابحث عن أيقونة التثبيت ⊕ في شريط العنوان\nأو:\n2️⃣ قائمة Chrome ⋮ ← "تثبيت بوابة متابعة الطلاب"');
  }
}

// ─── Notifications ───
async function requestNotifPermission(){
  if(!('Notification' in window)) return 'unsupported';
  if(Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}

async function requestAndSubscribe(){
  const perm = await requestNotifPermission();
  if(perm === 'granted'){
    showToast('✅ تم تفعيل الإشعارات');
    renderNotifButton();
  } else if(perm === 'denied'){
    showToast('⚠️ مرفوض — فعّل الإشعارات من إعدادات المتصفح');
    renderNotifButton();
  }
}

async function sendLocalNotif(title, body){
  const APP_URL = 'https://emadabuhoujaila.github.io/science-portal/';
  const perm = await requestNotifPermission();
  if(perm !== 'granted'){
    // طلب الإذن مجدداً إذا لم يُمنح
    const newPerm = await Notification.requestPermission();
    if(newPerm !== 'granted') return false;
  }
  const opts = {
    body, dir:'rtl', lang:'ar',
    icon:               APP_URL + 'icon-192.png',
    badge:              APP_URL + 'icon-192.png',
    tag:                'portal-notif',
    renotify:           true,
    requireInteraction: true,
    silent:             false,
    vibrate:            [400, 100, 400, 100, 400]
  };
  try {
    if(swRegistration && swRegistration.active){
      swRegistration.active.postMessage({ type:'SEND_NOTIF', title, body });
      await swRegistration.showNotification(title, opts);
    } else if('Notification' in window){
      new Notification(title, opts);
    }
    return true;
  } catch(e){
    console.warn('Notif error:', e);
    // محاولة أخيرة بالطريقة البسيطة
    try { new Notification(title, {body, dir:'rtl'}); return true; } catch(e2){}
    return false;
  }
}

function renderNotifButton(){
  let wrap = document.getElementById('parent-notif-btn-wrap');
  const body = document.getElementById('parent-body');
  if(!body) return;
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'parent-notif-btn-wrap';
    wrap.style.cssText = 'padding:0 0 10px';
    body.insertBefore(wrap, body.firstChild);
  }
  if(!('Notification' in window)){ wrap.innerHTML = ''; return; }
  const perm = Notification.permission;
  if(perm === 'granted'){
    wrap.innerHTML = '<div class="notif-allowed">'+t('notifEnabled')+'</div>';
  } else if(perm === 'denied'){
    wrap.innerHTML = '<div class="notif-denied">'+t('notifDenied')+'</div>';
  } else {
    wrap.innerHTML = '<button onclick="requestAndSubscribe()" style="width:100%;padding:13px;background:var(--teal-mid);color:#fff;border:none;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:6px">'+t('notifBtn')+'</button>';
  }
}

// ─── Teacher notification sender ───
function populateNotifStudents(){
  const cls = document.getElementById('notif-class').value;
  const sel = document.getElementById('notif-student');
  sel.innerHTML = '<option value="">— الكل —</option>';
  ((getFilteredStudents()[cls])||[]).forEach(s=>{
    const o=document.createElement('option'); o.value=s.name; o.textContent=s.name; sel.appendChild(o);
  });
}
async function sendPushNotification(){
  const type = document.getElementById('notif-type').value;
  const body = document.getElementById('notif-body').value.trim();
  const cls  = document.getElementById('notif-class').value;
  const name = document.getElementById('notif-student').value;

  const typeLabels = {
    msg:   '💬 رسالة جديدة من المعلم',
    bv:    '🧑‍🎓 تحديث سلوكي جديد',
    grade: '📊 تحديث درجات',
    custom:'📌 تنبيه'
  };
  const title     = '📚 بوابة متابعة الطلاب';
  const notifBody = (name ? name + ' — ' : cls ? 'الشعبة '+cls+' — ' : '') +
                    (body || typeLabels[type] || 'تحديث جديد');

  // احفظ الإشعار في Firebase — سيظهر لولي الأمر فور فتح التطبيق
  if(window.fbSaveNotif){
    try {
      await window.fbSaveNotif({
        title, body: notifBody, type, cls, name,
        date: new Date().toLocaleString('ar-AE')
      });
      showToast('✅ تم إرسال الإشعار لولي الأمر');
      const el = document.getElementById('notif-body');
      if(el) el.value = '';
    } catch(e){
      showToast('❌ خطأ في الإرسال — تحقق من الاتصال');
    }
  } else {
    showToast('⚠️ Firebase غير متصل — انتظر لحظة وحاول مجدداً');
  }
}

// ══════════════════════════════════════════════════
//  INIT

// ─── تسجيل Service Worker ───


// ─── تسجيل دخول تلقائي لولي الأمر — ينتظر Firebase أولاً ───
function tryAutoLogin(){
  if(!APP.savedParent || !APP.savedParent.cls || !APP.savedParent.name) return;
  const sp = APP.savedParent;
  registerParentSession(sp);
  window._currentParent = enrichParentSession(sp.cls, sp.name, sp.mid||'', sp.section||'');
  showScreen('parent');
  loadParentSubjectTabs(sp.cls, sp.name, sp.mid||'');
}
// سيُستدعى من loadAll().then() بعد تحميل Firebase
// ─── تسجيل دخول فوري من localStorage (بعد شاشة الافتتاح) ───
(function(){
  try {
    const saved = JSON.parse(localStorage.getItem('portal_v4')||'{}');
    const sp = saved.savedParent;
    if(sp && sp.cls && sp.name){
      window._pendingParentAutoLogin = sp;
    }
  } catch(e){ console.warn('Auto-login prep error:', e); }
})();

if('serviceWorker' in navigator) window.addEventListener('load', registerSW);































// Load available grades from Firebase (called on parent tab open)
async function loadParentGrades(){
  const sel   = document.getElementById('parent-grade');
  const isEn  = currentLang==='en';
  if(!sel) return;

  // Always show 5-8 but mark which ones have students
  const allGrades = ['5','6','7','8'];
  let uploadedGrades = allGrades; // default: show all

  if(typeof db !== 'undefined'){
    try{
      const snap = await db.ref('students').once('value');
      if(snap.exists()){
        uploadedGrades = Object.keys(snap.val()).filter(g=>allGrades.includes(g)).sort();
      }
    }catch(e){}
  }

  sel.innerHTML = `<option value="">${isEn?'— Select Grade —':'— اختر الصف —'}</option>`
    + uploadedGrades.map(g=>`<option value="${g}">${isEn?'Grade '+g:'الصف '+g}</option>`).join('');
  // Re-attach onchange (innerHTML rebuilding removes event listeners)
  sel.onchange = populateParentSections;
}

function populateParentSections(){
  const grade = document.getElementById('parent-grade')?.value||'';
  const isEn  = currentLang==='en';
  document.getElementById('parent-sec-group').style.display  = 'none';
  document.getElementById('parent-name-group').style.display = 'none';
  document.getElementById('parent-next-btn').style.display   = 'none';
  const secSel  = document.getElementById('parent-section');
  const nameSel = document.getElementById('parent-name');
  secSel.innerHTML  = `<option value="">${isEn?'⏳ Loading...':'⏳ جارٍ التحميل...'}</option>`;
  nameSel.innerHTML = `<option value="">${isEn?'— Select Student —':'— اختر الاسم —'}</option>`;
  const oldCls = document.getElementById('parent-class');
  if(oldCls) oldCls.value = grade;
  if(!grade) return;
  document.getElementById('parent-sec-group').style.display = '';

  const renderSectionOptions = (sections)=>{
    const list = [...sections].filter(Boolean).sort((a,b)=>(Number(a)||0)-(Number(b)||0) || String(a).localeCompare(String(b)));
    secSel.innerHTML = `<option value="">${isEn?'— Select Section —':'— اختر الشعبة —'}</option>`
      + list.map(s=>`<option value="${s}">${formatSectionLabel(s, isEn)}</option>`).join('');
  };

  if(typeof db !== 'undefined'){
    db.ref(`students/${grade}`).once('value').then(snap=>{
      if(!snap.exists()){
        secSel.innerHTML = `<option value="">${isEn?'No sections available':'لا توجد شعب'}</option>`;
        return;
      }
      renderSectionOptions(Object.keys(snap.val()));
    }).catch(()=>{
      renderSectionOptions(SECTIONS_LIST);
    });
  } else {
    renderSectionOptions(SECTIONS_LIST);
  }
}

function populateParentNames(){
  const grade   = document.getElementById('parent-grade')?.value||'';
  const section = document.getElementById('parent-section')?.value||'';
  const isEn    = currentLang==='en';
  const errEl   = document.getElementById('cls-error-msg');
  const oldCls  = document.getElementById('parent-class');
  if(oldCls) oldCls.value = grade;
  if(errEl) errEl.style.display = 'none';

  // Reset
  document.getElementById('parent-name-group').style.display = 'none';
  document.getElementById('parent-next-btn').style.display   = 'none';
  const sel = document.getElementById('parent-name');
  sel.innerHTML = `<option value="">${isEn?'⏳ Loading...':'⏳ جارٍ التحميل...'}</option>`;
  document.getElementById('parent-name-group').style.display = '';

  if(!grade || !section){ sel.innerHTML=`<option value="">${isEn?'— Select Grade & Section —':'— اختر الصف والشعبة —'}</option>`; return; }

  // Load from Firebase /students/{grade}/{section}/
  if(typeof db !== 'undefined'){
    db.ref(`students/${grade}/${section}`).once('value').then(snap=>{
      if(!snap.exists() || !snap.val()){
        sel.innerHTML = `<option value="">${isEn?'— No students found —':'— لا يوجد طلاب —'}</option>`;
        if(errEl){
          errEl.textContent = isEn
            ? '⚠️ Student lists not uploaded yet for this class. Please contact the administration.'
            : '⚠️ لم يتم رفع قوائم الطلاب لهذا الصف والشعبة بعد — تواصل مع الإدارة.';
          errEl.style.display = 'block';
        }
        return;
      }
      const data = snap.val();
      const students = Object.values(data).filter(s=>s&&s.name).sort((a,b)=>a.name.localeCompare(b.name,'ar'));

      sel.innerHTML = `<option value="">${isEn?'— Select Student —':'— اختر الاسم —'}</option>`
        + students.map(s=>{
            const display = displayStudentName(s, grade, section, s.mid);
            return `<option value="${s.name}" data-mid="${s.mid||''}">${display}</option>`;
          }).join('');

      sel.onchange = ()=>{
        document.getElementById('parent-next-btn').style.display = sel.value ? '' : 'none';
      };
    }).catch(()=>{
      _loadParentNamesLocal(grade, section, sel, errEl, isEn);
    });
  } else {
    _loadParentNamesLocal(grade, section, sel, errEl, isEn);
  }
}

function _loadParentNamesLocal(grade, section, sel, errEl, isEn){
  const gradeStudents = getGradeStudents(grade);
  const filtered = gradeStudents.filter(s=> !s.section || s.section===section);
  if(!filtered.length){
    sel.innerHTML = `<option value="">${isEn?'— No students found —':'— لا يوجد طلاب —'}</option>`;
    if(errEl){
      errEl.textContent = isEn
        ? '⚠️ Student lists have not been uploaded yet.'
        : '⚠️ لم يتم رفع قوائم الطلاب بعد.';
      errEl.style.display = 'block';
    }
    return;
  }
  sel.innerHTML = `<option value="">${isEn?'— Select Student —':'— اختر الاسم —'}</option>`
    + filtered.map(s=>{
        const display = displayStudentName(s, grade, section, s.mid);
        return `<option value="${s.name}">${display}</option>`;
      }).join('');
  sel.onchange = ()=>{
    document.getElementById('parent-next-btn').style.display = sel.value ? '' : 'none';
  };
}































// ══════════════════════════════════════════════════
//  INIT — تهيئة الصفحة فور التحميل
// ══════════════════════════════════════════════════

loadState();
if(typeof applyGlobalLang==='function') applyGlobalLang();

document.addEventListener('DOMContentLoaded', async ()=>{
  if(typeof db === 'undefined') return;
  try{
    const snap = await db.ref('students').once('value');
    if(snap.exists()){
      window.ADMIN_STUDENTS = snap.val();
      syncPinsFromAdminStudents();
      saveState();
    }
  }catch(e){ console.warn('students preload', e); }
});
