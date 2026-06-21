import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
const htmlPath = path.join(www, 'index.source.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const lines = html.split(/\r?\n/);

const styleStart = lines.findIndex(l => l.trim() === '<style>');
const styleEnd = lines.findIndex(l => l.trim() === '</style>');
const cssLines = lines.slice(styleStart + 1, styleEnd);
fs.mkdirSync(path.join(www, 'css'), { recursive: true });
fs.writeFileSync(path.join(www, 'css', 'app.css'), cssLines.join('\n'), 'utf8');

const scriptStart = lines.findIndex(l => l.trim() === '<script>');
const scriptEnd = lines.findIndex((l, i) => i > scriptStart && l.trim() === '</script>');
let appJs = lines.slice(scriptStart + 1, scriptEnd).join('\n');

console.log(`Extracted app.js: ${appJs.length} chars from lines ${scriptStart + 2}-${scriptEnd}`);

// Remove trailing duplicate initPage + empty STUDENT DATA section (keep main code)
const initMatches = [...appJs.matchAll(/\(function initPage\(\)\{[\s\S]*?\}\)\(\);/g)];
if (initMatches.length > 1) {
  const tailStart = initMatches[1].index;
  appJs = appJs.slice(0, tailStart).replace(/\s+$/, '\n');
}

appJs = appJs.replace(
  /const STUDENTS = \{[\s\S]*?\};;/,
  `const STUDENTS = {}; // legacy alias — use getGradeStudents()

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
  return getGradeStudents(cls, section).find(s=>
    (name && s.name===name) || (mid && String(s.mid)===String(mid))
  );
}`
);

appJs = appJs.replace(/\(STUDENTS\[([^\]]+)\]\|\|\[\]\)/g, '(getGradeStudents($1)||[])');
appJs = appJs.replace(/STUDENTS\[([^\]]+)\]\?\.find/g, 'getGradeStudents($1).find');
appJs = appJs.replace(/STUDENTS\[([^\]]+)\]\|\|\[\]/g, 'getGradeStudents($1)');
appJs = appJs.replace(/const student=STUDENTS\[cls\]\?\.find\(s=>s\.name===name\);/g,
  'const student=findStudentInGrade(cls,name);');
appJs = appJs.replace(/const lockStudent = STUDENTS\[cls\]\?\.find\(s=>s\.name===name\);/g,
  'const lockStudent = findStudentInGrade(cls,name);');
appJs = appJs.replace(/if\(!student\) student=\(STUDENTS\[cls\]\|\|\[\]\)\.find\(s=>s\.name===studentName\|\|s\.mid===mid\);/g,
  'if(!student) student=findStudentInGrade(cls,studentName,mid,section);');
appJs = appJs.replace(/const student = STUDENTS\[sp\.cls\]\?\.find\(s=>s\.name===sp\.name\);/g,
  'const student = findStudentInGrade(sp.cls,sp.name,sp.mid,sp.section);');
appJs = appJs.replace(/const student = \(STUDENTS\[sp\.cls\]\|\|\[\]\)\.find\(s=>s\.name===sp\.name\);/g,
  'const student = findStudentInGrade(sp.cls,sp.name,sp.mid,sp.section);');
appJs = appJs.replace(/const gradeStudents = STUDENTS\[grade\] \|\| \[\];/g,
  'const gradeStudents = getGradeStudents(grade);');

// Teacher roster import: stop merging into empty STUDENTS object
appJs = appJs.replace(
  /\/\/ Merge into local STUDENTS[\s\S]*?\}\);\s*\n\s*\/\/ Save to Firebase/,
  `// Save to Firebase`
);

appJs = appJs.replace(
  /const classStudents=\[\.\.\.STUDENTS\[cls\]\]\.sort/,
  'const classStudents=[...getGradeStudents(cls)].sort'
);

appJs = appJs.replace(/let APP = \{\s*password:'teacher123',/, 'let APP = {');
appJs = appJs.replace(/const ADMIN_PASSWORD = '[^']+';\n/, '');

appJs = appJs.replace(
  /function loadState\(\)\{[\s\S]*?saveState\(\);\s*\}/,
  `function loadState(){
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
}`
);

appJs = appJs.replace(
  /function getFilteredStudents\(\)\{[\s\S]*?^\}/m,
  `function getFilteredStudents(){
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
}`
);

if (!appJs.includes('function escapeHtml')) {
  appJs = appJs.replace(
    /function showTab\(name,el\)\{/,
    `function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function showTab(name,el){`
  );
}

// Escape only message/note bodies in saved message lists
appJs = appJs.replace(
  /(<div style="font-size:13px;color:var\(--grey-2\);line-height:1\.6;margin-top:4px">)\$\{m\.body\}/g,
  '$1${escapeHtml(m.body)}'
);
appJs = appJs.replace(
  /wrap\.innerHTML = msgs\.map\(m=>`[\s\S]*?\$\{m\.body\}/,
  m => m.replace('${m.body}', '${escapeHtml(m.body)}')
);

appJs = appJs.replace(
  /const teacherData=\{[\s\S]*?password: btoa\(pw\),\s*createdAt: new Date\(\)\.toISOString\(\)\s*\};/,
  `const teacherData={
    name, email, subject,
    grades: checkedGrades,
    sections: allSections,
    gradeMap,
    _key: key,
    createdAt: new Date().toISOString()
  };`
);

appJs = appJs.replace(
  /if\(typeof db!=='undefined'\)\{\s*db\.ref\('teachers\/'\+key\)\.set\(teacherData\)\.then\(onSuccess\)\.catch\(onError\);\s*\} else \{/,
  `if(typeof auth !== 'undefined' && auth){
    auth.createUserWithEmailAndPassword(email, pw)
      .then(cred=>{
        teacherData.uid = cred.user.uid;
        const updates = {};
        updates['teachers/' + key] = teacherData;
        updates['teacherLookup/' + cred.user.uid] = { key, role: 'teacher' };
        return db.ref().update(updates);
      })
      .then(onSuccess)
      .catch(onError);
  } else if(typeof db!=='undefined'){
    db.ref('teachers/'+key).set(teacherData).then(onSuccess).catch(onError);
  } else {`
);

appJs = appJs.replace(
  /function teacherLogin\(\)\{[\s\S]*?\n\}/,
  `async function teacherLogin(){
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
    if(lookup?.role === 'admin' || teacher.role === 'admin'){
      IS_ADMIN = true;
      return _enterAdminDashboard();
    }
    _enterDashboard(teacher);
  }catch(e){
    console.error('teacherLogin', e);
    showErr(isEn?'Incorrect email or password':'البريد أو كلمة المرور غير صحيحة');
  }
}`
);

appJs = appJs.replace(
  /function adminLogin\(\)\{[\s\S]*?adminLoadStudents\(\);\s*\}/,
  `async function adminLogin(){
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
}`
);

appJs = appJs.replace(/function adminLogout\(\)\{/, `async function adminLogout(){
  try{ if(typeof auth!=='undefined' && auth) await auth.signOut(); }catch(e){}
  IS_ADMIN = false;`);
appJs = appJs.replace(/function logout\(\)\{/, `async function logout(){
  try{ if(typeof auth!=='undefined' && auth) await auth.signOut(); }catch(e){}`);

appJs = appJs.replace(
  /if\(adminSnap\.exists\(\)\) window\.ADMIN_STUDENTS = adminSnap\.val\(\);/g,
  `if(adminSnap.exists()) window.ADMIN_STUDENTS = adminSnap.val();
        syncPinsFromAdminStudents();`
);

appJs = appJs.replace(
  /const student = STUDENTS\[pendingLogin\.cls\]\?\.find\(s=>s\.name===pendingLogin\.name\);\s*const correct = fMid \|\| \(student \? student\.mid : APP\.pins\[key\]\);/,
  `const correct = fMid || APP.pins[key];`
);

// Remove legacy password change in settings
appJs = appJs.replace(
  /const pw=document\.getElementById\('new-password'\)\.value;\s*if\(pw\) APP\.password=pw;\s*/,
  ''
);

appJs = appJs.replace(
  /if\(sp && sp\.cls && sp\.name\)\{\s*const student = \(getGradeStudents\(sp\.cls\)\|\|\[\]\)\.find\(s=>s\.name===sp\.name\);\s*if\(student\)\{/,
  `if(sp && sp.cls && sp.name){`
);

// Bootstrap app state once DOM is ready
if(!appJs.includes('loadState();')){
  appJs += `\nloadState();\nif(typeof applyGlobalLang==='function') applyGlobalLang();\n`;
}

fs.mkdirSync(path.join(www, 'js'), { recursive: true });
fs.writeFileSync(path.join(www, 'js', 'app.js'), appJs, 'utf8');

const firebaseJs = fs.readFileSync(path.join(__dirname, 'firebase-init.template.js'), 'utf8');
fs.writeFileSync(path.join(www, 'js', 'firebase-init.js'), firebaseJs, 'utf8');

// HTML body: from </style> to first <script>
const bodyStart = lines.findIndex(l => l.trim() === '<body>');
const bodyEnd = scriptStart;
let bodyHtml = lines.slice(bodyStart, bodyEnd).join('\n');

// Remove duplicate admin screen (keep first block only)
bodyHtml = bodyHtml.replace(
  /(<!--[^>]*ADMIN DASHBOARD[^>]*-->[\s\S]*?<\/div>\s*<\/div>\s*)\s*(<!--[^>]*ADMIN DASHBOARD[^>]*-->[\s\S]*?)(<!--[^>]*PARENT VIEW[^>]*-->)/,
  '$1$3'
);

bodyHtml = bodyHtml.replace(
  `<div id="login-admin" style="display:none">
      <div class="error-msg" id="admin-error-msg" style="display:none"></div>
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:36px;margin-bottom:8px">⚙️</div>
        <h3 id="admin-login-title" style="color:var(--teal-dark);margin:0 0 4px">دخول المسؤول</h3>
        <p id="admin-login-sub" style="font-size:13px;color:var(--grey-3);margin:0">صلاحيات كاملة لإدارة البيانات</p>
      </div>
      <div class="form-group">
        <label id="admin-pw-label">كلمة مرور المسؤول</label>`,
  `<div id="login-admin" style="display:none">
      <div class="error-msg" id="admin-error-msg" style="display:none"></div>
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:36px;margin-bottom:8px">⚙️</div>
        <h3 id="admin-login-title" style="color:var(--teal-dark);margin:0 0 4px">دخول المسؤول</h3>
        <p id="admin-login-sub" style="font-size:13px;color:var(--grey-3);margin:0">صلاحيات كاملة لإدارة البيانات</p>
      </div>
      <div class="form-group">
        <label id="admin-email-label">البريد الإلكتروني</label>
        <input type="email" id="admin-email-input" placeholder="admin@school.ae"
          onkeydown="if(event.key==='Enter')adminLogin()">
      </div>
      <div class="form-group">
        <label id="admin-pw-label">كلمة المرور</label>`
);

const headStart = lines.slice(0, styleStart).join('\n');
const finalHtml = `${headStart}
<link rel="stylesheet" href="css/app.css">
</head>
${bodyHtml}
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
<script src="js/firebase-init.js"></script>
<script src="js/app.js"></script>
</html>
`;

fs.writeFileSync(path.join(www, 'index.html'), finalHtml, 'utf8');

fs.writeFileSync(path.join(root, 'database.rules.json'), JSON.stringify({
  rules: {
    ".read": false,
    ".write": false,
    students: {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
    },
    teachers: {
      "$key": {
        ".read": "auth != null && (root.child('teacherLookup').child(auth.uid).child('key').val() === $key || root.child('admins').child(auth.uid).val() === true)",
        ".write": "auth != null && ((!data.exists() && newData.child('uid').val() === auth.uid) || root.child('teacherLookup').child(auth.uid).child('key').val() === $key || root.child('admins').child(auth.uid).val() === true)"
      }
    },
    teacherLookup: {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid && !data.exists()"
      }
    },
    admins: {
      ".read": "auth != null && root.child('admins').child(auth.uid).val() === true",
      ".write": false
    },
    teacherData: {
      "$key": {
        ".read": true,
        ".write": "auth != null && root.child('teacherLookup').child(auth.uid).child('key').val() === $key"
      }
    }
  }
}, null, 2), 'utf8');

fs.writeFileSync(path.join(root, 'firebase.json'), JSON.stringify({ database: { rules: 'database.rules.json' } }, null, 2), 'utf8');

console.log('Done. app.js size:', appJs.length);
