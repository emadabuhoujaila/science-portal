const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const region = functions.region('us-central1');
const ALLOWED_GRADES = ['5', '6', '7', '8'];

function normalizeStudentName(val) {
  const name = String(val?.name || '').trim();
  if (!name) return null;
  const nameEn = String(val?.nameEn || '').trim();
  return nameEn ? { name, nameEn } : { name };
}

exports.listParentGrades = region.https.onCall(async () => {
  const snap = await admin.database().ref('students').once('value');
  if (!snap.exists()) return { grades: [] };
  const grades = Object.keys(snap.val())
    .filter((g) => ALLOWED_GRADES.includes(g))
    .sort();
  return { grades };
});

exports.listParentSections = region.https.onCall(async (data) => {
  const grade = String(data?.grade || '').trim();
  if (!ALLOWED_GRADES.includes(grade)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid grade');
  }
  const snap = await admin.database().ref(`students/${grade}`).once('value');
  if (!snap.exists()) return { sections: [] };
  const sections = Object.keys(snap.val())
    .filter(Boolean)
    .sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || String(a).localeCompare(String(b)));
  return { sections };
});

exports.listParentStudentNames = region.https.onCall(async (data) => {
  const grade = String(data?.grade || '').trim();
  const section = String(data?.section || '').trim();
  if (!ALLOWED_GRADES.includes(grade) || !section) {
    throw new functions.https.HttpsError('invalid-argument', 'Grade and section required');
  }

  const snap = await admin.database().ref(`students/${grade}/${section}`).once('value');
  if (!snap.exists()) return { students: [] };

  const students = [];
  snap.forEach((child) => {
    const row = normalizeStudentName(child.val());
    if (row) students.push(row);
  });
  students.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return { students };
});

async function assertParentSession(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) {
    throw new functions.https.HttpsError('unauthenticated', 'Session required');
  }
  const snap = await admin.database().ref(`parentSessions/${token}`).once('value');
  const session = snap.val();
  if (!session?.mid) {
    throw new functions.https.HttpsError('unauthenticated', 'Invalid session');
  }
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await admin.database().ref(`parentSessions/${token}`).remove();
    throw new functions.https.HttpsError('unauthenticated', 'Session expired');
  }
  return session;
}

function parentGradeBuckets(cls, section) {
  const sec = String(section || '').trim();
  const buckets = [];
  if (sec) buckets.push(String(cls) + sec);
  buckets.push(String(cls));
  return [...new Set(buckets)];
}

function pickStudentGradeRecord(store, mid, studentName) {
  if (!store || typeof store !== 'object') return null;
  const sName = String(studentName || '').trim();
  const m = String(mid || '').trim();
  if (m && store[m] && typeof store[m] === 'object') return store[m];
  const arr = Array.isArray(store) ? store : Object.values(store);
  return (
    arr.find(
      (x) =>
        x &&
        typeof x === 'object' &&
        ((m && String(x.mid).trim() === m) ||
          (sName && String(x.name).trim() === sName))
    ) || null
  );
}

async function fetchTeacherGradeRecordServer(teacherKey, cls, section, mid, studentName) {
  for (const bucket of parentGradeBuckets(cls, section)) {
    const snap = await admin
      .database()
      .ref(`teacherData/${teacherKey}/grades/${bucket}`)
      .once('value');
    if (!snap.exists()) continue;
    const hit = pickStudentGradeRecord(snap.val(), mid, studentName);
    if (hit) return hit;
  }

  const m = String(mid || '').trim();
  if (m) {
    for (const bucket of parentGradeBuckets(cls, section)) {
      const snap = await admin
        .database()
        .ref(`teacherData/${teacherKey}/grades/${bucket}/${m}`)
        .once('value');
      if (snap.exists()) return snap.val();
    }
  }

  const allSnap = await admin
    .database()
    .ref(`teacherData/${teacherKey}/grades`)
    .once('value');
  if (!allSnap.exists()) return null;
  for (const [bucket, store] of Object.entries(allSnap.val() || {})) {
    if (!String(bucket).startsWith(String(cls))) continue;
    const hit = pickStudentGradeRecord(store, mid, studentName);
    if (hit) return hit;
  }
  return null;
}

exports.getParentGrades = region.https.onCall(async (data) => {
  const session = await assertParentSession(data?.sessionToken);
  const teacherKey = String(data?.teacherKey || '').trim();
  if (!teacherKey) {
    throw new functions.https.HttpsError('invalid-argument', 'teacherKey required');
  }
  const grade = await fetchTeacherGradeRecordServer(
    teacherKey,
    session.cls,
    session.section,
    session.mid,
    session.name
  );
  return { grade: grade || null };
});

exports.getParentGradesBatch = region.https.onCall(async (data) => {
  const session = await assertParentSession(data?.sessionToken);
  const teacherKeys = Array.isArray(data?.teacherKeys)
    ? [...new Set(data.teacherKeys.map((k) => String(k || '').trim()).filter(Boolean))]
    : [];
  if (!teacherKeys.length) return { grades: {} };

  const grades = {};
  await Promise.all(
    teacherKeys.map(async (teacherKey) => {
      grades[teacherKey] = await fetchTeacherGradeRecordServer(
        teacherKey,
        session.cls,
        session.section,
        session.mid,
        session.name
      );
    })
  );
  return { grades };
});

function studentNameMatches(recordName, wantName) {
  return String(recordName || '').trim() === String(wantName || '').trim();
}

async function loadTeacherParentMessagesForStudent(teacherKey, cls, sName) {
  const snap = await admin.database().ref(`teacherData/${teacherKey}/parentMessages`).once('value');
  if (!snap.exists()) return [];
  const deleted = await loadDeletedSet();
  return Object.entries(snap.val() || {})
    .filter(([, m]) => m && m.cls === cls && studentNameMatches(m.name, sName))
    .filter(([id]) => !isDeleted(deleted, `teacherParentMsg/${teacherKey}/${id}`))
    .map(([id, m]) => ({ id, ...m }));
}

async function loadTeacherMessagesForStudent(teacherKey, cls, sName) {
  const snap = await admin.database().ref(`teacherData/${teacherKey}/messages`).once('value');
  if (!snap.exists()) return [];
  const deleted = await loadDeletedSet();
  return Object.entries(snap.val() || {})
    .filter(([, m]) => m && m.cls === cls && studentNameMatches(m.name, sName))
    .filter(([id]) => !isDeleted(deleted, `teacherMsg/${teacherKey}/${id}`))
    .map(([id, m]) => ({ id, ...m }));
}

async function loadTeacherBehaviorForStudent(teacherKey, cls, sName) {
  const snap = await admin.database().ref(`teacherData/${teacherKey}/behaviorLog`).once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val() || {})
    .filter(([, e]) => e && e.cls === cls && studentNameMatches(e.name, sName))
    .map(([id, e]) => ({ id, ...e }));
}

exports.getParentTeacherDataBatch = region.https.onCall(async (data) => {
  const session = await assertParentSession(data?.sessionToken);
  const cls = String(session.cls || '').trim();
  const sName = String(session.name || '').trim();
  const teacherKeys = Array.isArray(data?.teacherKeys)
    ? [...new Set(data.teacherKeys.map((k) => String(k || '').trim()).filter(Boolean))]
    : [];
  if (!teacherKeys.length) return { byTeacher: {} };

  const byTeacher = {};
  await Promise.all(
    teacherKeys.map(async (teacherKey) => {
      const [messages, behaviorLog, parentMessages] = await Promise.all([
        loadTeacherMessagesForStudent(teacherKey, cls, sName),
        loadTeacherBehaviorForStudent(teacherKey, cls, sName),
        loadTeacherParentMessagesForStudent(teacherKey, cls, sName),
      ]);
      byTeacher[teacherKey] = { messages, behaviorLog, parentMessages };
    })
  );
  return { byTeacher };
});

function parseComplaintLog(raw) {
  return Object.entries(raw || {})
    .filter(([, v]) => v && typeof v === 'object' && v.body)
    .map(([id, v]) => {
      const threadRaw = v.thread && typeof v.thread === 'object' ? v.thread : {};
      const thread = Object.entries(threadRaw)
        .map(([tid, t]) => ({ id: tid, ...t }))
        .sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      return { id, ...v, thread };
    })
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
}

async function loadDeletedSet() {
  const snap = await admin.database().ref('portalDeleted').once('value');
  return new Set(Object.keys(snap.val() || {}));
}

function isDeleted(deletedSet, key) {
  return !!key && deletedSet.has(String(key));
}

exports.getParentSchoolData = region.https.onCall(async (data) => {
  const session = await assertParentSession(data?.sessionToken);
  const mid = String(session.mid || '');
  const cls = String(session.cls || '').trim();
  const sName = String(session.name || '').trim();
  const deleted = await loadDeletedSet();

  const [inboxSnap, complaintSnap, sentSnap] = await Promise.all([
    admin.database().ref(`parentAdminInbox/${mid}`).once('value'),
    admin.database().ref(`parentComplaintLog/${mid}`).once('value'),
    admin.database().ref(`parentMessagesToAdmin/${mid}`).once('value'),
  ]);

  const allInbox = inboxSnap.exists()
    ? Object.entries(inboxSnap.val()).map(([id, m]) => ({ id, ...m }))
    : [];
  const adminInbox = allInbox.filter(
    (m) => m && m.cls === cls && String(m.studentName || '').trim() === sName
      && !isDeleted(deleted, `parentAdminInbox/${mid}/${m.id}`)
      && !(m.outboxId && isDeleted(deleted, `adminOutbox/${m.outboxId}`))
  );

  const complaintLog = complaintSnap.exists()
    ? parseComplaintLog(complaintSnap.val()).filter(
        (c) => !isDeleted(deleted, `parentComplaint/${mid}/${c.id}`) && !isDeleted(deleted, `complaint/${c.id}`)
      )
    : [];

  const messagesToAdmin = sentSnap.exists()
    ? Object.entries(sentSnap.val())
        .map(([id, m]) => ({ id, ...m }))
        .filter((m) => !isDeleted(deleted, `parentToAdmin/${mid}/${m.id}`))
        .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    : [];

  return { adminInbox, complaintLog, messagesToAdmin };
});
