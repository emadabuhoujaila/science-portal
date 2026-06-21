const firebaseConfig = {
  apiKey:      "AIzaSyD9fIhL5ctwwIH3qyJnrvJ1OQyQQYhLiBg",
  authDomain:  "students-portal-34231.firebaseapp.com",
  databaseURL: "https://students-portal-34231-default-rtdb.firebaseio.com",
  projectId:   "students-portal-34231",
  messagingSenderId: "148177464784",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const functions = firebase.app().functions('us-central1');
window.db = db;
window.auth = auth;
window.functions = functions;
window._fbReady = false;

function updateFirebaseConnectionStatus(connected) {
  window._fbReady = connected === true;
  const wrap = document.getElementById('fb-status');
  const txt = document.getElementById('fb-status-txt');
  if (!wrap || !txt) return;
  const isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
  wrap.classList.toggle('fb-connected', window._fbReady);
  wrap.classList.toggle('fb-connecting', !window._fbReady);
  txt.textContent = window._fbReady
    ? (isEn ? 'Connected' : '\u0645\u062A\u0635\u0644')
    : (isEn ? 'Connecting...' : '\u062C\u0627\u0631\u064D \u0627\u0644\u0627\u062A\u0635\u0627\u0644...');
}
window.updateFirebaseConnectionStatus = updateFirebaseConnectionStatus;

db.ref('.info/connected').on('value', snap => {
  updateFirebaseConnectionStatus(snap.val());
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
window.fbPushParentMsg = (key, msg) => {
  const ref = db.ref('teacherData/'+key+'/parentMessages').push();
  const payload = {...msg, ts: msg.ts || new Date().toISOString()};
  return ref.set(payload).then(() => ref.key);
};
window.fbDeleteParentMsg = (key,id) => db.ref('teacherData/'+key+'/parentMessages/'+id).remove();
window.fbClearTeacherMessages = key => db.ref('teacherData/'+key+'/messages').remove();
window.fbClearParentMessages = key => db.ref('teacherData/'+key+'/parentMessages').remove();
window.fbClearAllBehavior = key => db.ref('teacherData/'+key+'/behaviorLog').remove();
window.fbSaveGrades = (key,cls,sec,mid,data) => db.ref('teacherData/'+key+'/grades/'+cls+sec+'/'+mid).update(data);
window.fbPushComplaint = msg => {
  const ref = db.ref('complaints').push();
  const payload = {...msg, ts: msg.ts || new Date().toISOString(), status: 'pending'};
  return ref.set(payload).then(() => ref.key);
};
window.fbPushParentAdminReply = (mid, msg) => {
  const ref = db.ref('parentAdminInbox/'+mid).push();
  const payload = {...msg, mid: String(mid), ts: msg.ts || new Date().toISOString()};
  return ref.set(payload).then(() => ref.key);
};

window._teacherListeners = [];

function startTeacherListener(key){
  if(!key || typeof db==='undefined') return;
  window._teacherAdminMsgsReady = false;
  window._teacherListeners.forEach(r=>r.off());
  window._teacherListeners = [];

  const msgRef = db.ref('teacherData/'+key+'/messages');
  msgRef.on('value', snap=>{
    APP.messages = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(a.ts||'').localeCompare(b.ts||''))
      : [];
    saveState();
    if(typeof renderSavedMessages === 'function') renderSavedMessages();
  });
  window._teacherListeners.push(msgRef);

  const bvRef = db.ref('teacherData/'+key+'/behaviorLog');
  bvRef.on('value', snap=>{
    APP.behaviorLog = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(a.ts||'').localeCompare(b.ts||''))
      : [];
    saveState();
    if(typeof renderBvLog === 'function') renderBvLog();
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

  const ciRef = db.ref('teacherData/'+key+'/complaintInbox');
  ciRef.on('value', snap=>{
    APP.complaintInbox = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(b.forwardedAt||b.ts||'').localeCompare(a.forwardedAt||a.ts||''))
      : [];
    saveState();
    if(document.getElementById('teacher-complaints-inbox') && typeof renderTeacherComplaints === 'function') renderTeacherComplaints();
    if(typeof updateTeacherSchoolBadge === 'function') updateTeacherSchoolBadge();
  });
  window._teacherListeners.push(ciRef);

  const amRef = db.ref('teacherData/'+key+'/adminMessages');
  amRef.on('value', snap=>{
    const prev = (APP.teacherAdminMessages || []).slice();
    APP.teacherAdminMessages = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''))
      : [];
    saveState();
    if(!window._teacherAdminMsgsReady){
      window._teacherAdminMsgsReady = true;
    } else if(typeof _notifyNewTeacherAdminMessages === 'function'){
      _notifyNewTeacherAdminMessages(prev);
    }
    if(document.getElementById('teacher-admin-msgs-list') && typeof renderTeacherAdminMessages === 'function') renderTeacherAdminMessages();
    if(typeof updateTeacherSchoolBadge === 'function') updateTeacherSchoolBadge();
  });
  window._teacherListeners.push(amRef);

  const tmaRef = db.ref('teacherMessagesToAdmin/'+key);
  tmaRef.on('value', snap=>{
    APP.teacherMessagesToAdmin = snap.exists()
      ? Object.entries(snap.val()).map(([id,v])=>({id,...v})).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''))
      : [];
    saveState();
    if(document.getElementById('teacher-admin-sent-list') && typeof renderTeacherSentToAdmin === 'function') renderTeacherSentToAdmin();
  });
  window._teacherListeners.push(tmaRef);
}

auth.onAuthStateChanged(async user=>{
  if(!user) return;
  const runRestore = async ()=>{
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
  };
  if(window._splashDone) runRestore();
  else document.addEventListener('splashDone', runRestore, {once:true});
});
