const firebaseConfig = {
  apiKey:      "AIzaSyD9fIhL5ctwwIH3qyJnrvJ1OQyQQYhLiBg",
  authDomain:  "students-portal-34231.firebaseapp.com",
  databaseURL: "https://students-portal-34231-default-rtdb.firebaseio.com",
  projectId:   "students-portal-34231",
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
