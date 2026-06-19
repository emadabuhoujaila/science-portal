const firebaseConfig = {
  apiKey:      "AIzaSyD9fIhL5ctwwIH3qyJnrvJ1OQyQQYhLiBg",
  authDomain:  "students-portal-34231.firebaseapp.com",
  databaseURL: "https://students-portal-34231-default-rtdb.firebaseio.com",
  projectId:   "students-portal-34231",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
window.db = db;
window.auth = auth;
window._fbReady = false;

db.ref('.info/connected').on('value', snap=>{
  window._fbReady = snap.val()===true;
  const el = document.getElementById('fb-status');
  if(el) el.innerHTML = window._fbReady
    ? '🟢 <span id="fb-status-txt">'+(typeof currentLang!=='undefined' && currentLang==='en'?'Connected':'متصل')+'</span>'
    : '🔴 <span id="fb-status-txt">'+(typeof currentLang!=='undefined' && currentLang==='en'?'Connecting...':'جارٍ الاتصال...')+'</span>';
});

window.fbGetTeacher = k => db.ref('teachers/'+k).once('value').then(s=>s.val());
window.fbSetTeacher = (k,data) => db.ref('teachers/'+k).set(data);
window.fbGetStudents = () => db.ref('students').once('value').then(s=>s.val()||{});
window.fbSetGrade = (g,sec,data) => db.ref('students/'+g+'/'+sec).set(data);
window.fbDelGrade = g => db.ref('students/'+g).remove();
window.fbDelAll = () => db.ref('students').remove();
window.fbPushMsg = (key,msg) => db.ref('teacherData/'+key+'/messages').push({...msg, ts:new Date().toISOString()});
window.fbDeleteMsg = (key,id) => db.ref('teacherData/'+key+'/messages/'+id).remove();
window.fbPushBehavior = (key,entry) => db.ref('teacherData/'+key+'/behaviorLog').push({...entry, ts:new Date().toISOString()});
window.fbDeleteBvEntry = (key,id) => db.ref('teacherData/'+key+'/behaviorLog/'+id).remove();
window.fbDeleteStudentBv = (key,cls,name) =>
  db.ref('teacherData/'+key+'/behaviorLog').once('value').then(snap=>{
    if(!snap.exists()) return;
    const del={};
    Object.entries(snap.val()||{}).forEach(([id,e])=>{
      if(e.cls===cls && e.name===name) del[id]=null;
    });
    return db.ref('teacherData/'+key+'/behaviorLog').update(del);
  });
window.fbPushParentMsg = (key,msg) => db.ref('teacherData/'+key+'/parentMessages').push({...msg, ts:new Date().toISOString()});
window.fbDeleteParentMsg = (key,id) => db.ref('teacherData/'+key+'/parentMessages/'+id).remove();
window.fbSaveGrades = (key,cls,sec,mid,data) => db.ref('teacherData/'+key+'/grades/'+cls+sec+'/'+mid).update(data);

window._teacherListeners = [];

function startTeacherListener(key){
  if(!key || typeof db==='undefined') return;
  window._teacherListeners.forEach(r=>r.off());
  window._teacherListeners = [];

  const msgRef = db.ref('teacherData/'+key+'/messages');
  msgRef.on('value', snap=>{
    APP.messages = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(a.ts||'').localeCompare(b.ts||''))
      : [];
    saveState();
    const el = document.getElementById('saved-messages');
    if(el) renderSavedMessages();
  });
  window._teacherListeners.push(msgRef);

  const bvRef = db.ref('teacherData/'+key+'/behaviorLog');
  bvRef.on('value', snap=>{
    APP.behaviorLog = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(a.ts||'').localeCompare(b.ts||''))
      : [];
    saveState();
    const el = document.getElementById('bv-log-tbody');
    if(el) renderBvLog();
  });
  window._teacherListeners.push(bvRef);

  const pmRef = db.ref('teacherData/'+key+'/parentMessages');
  pmRef.on('value', snap=>{
    const delKey = 'del_pm_'+key;
    let deletedIds = [];
    try{ deletedIds = JSON.parse(localStorage.getItem(delKey)||'[]'); }catch(e){}
    const allMsgs = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''))
      : [];
    APP.parentMessages = allMsgs.filter(m=>!deletedIds.includes(m.id));
    saveState();
    const inbox = document.getElementById('parent-inbox');
    if(inbox) renderParentInbox();
    updateInboxBadge();
  });
  window._teacherListeners.push(pmRef);
}

auth.onAuthStateChanged(async user=>{
  if(!user) return;
  try{
    const loginScreen = document.getElementById('screen-login');
    if(!loginScreen || !loginScreen.classList.contains('active')) return;

    const adminSnap = await db.ref('admins/'+user.uid).once('value');
    const lookupSnap = await db.ref('teacherLookup/'+user.uid).once('value');
    const lookup = lookupSnap.val();
    if(adminSnap.val() === true || lookup?.role === 'admin'){
      IS_ADMIN = true;
      _enterAdminDashboard();
      return;
    }
    if(lookup?.key){
      const teacherSnap = await db.ref('teachers/'+lookup.key).once('value');
      const teacher = teacherSnap.val();
      if(teacher){
        teacher._key = lookup.key;
        teacher.uid = user.uid;
        _enterDashboard(teacher);
      }
    }
  }catch(e){ console.warn('auth restore', e); }
});
