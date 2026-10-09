const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const region = functions.region('us-central1');
const EXAM_GRADES = ['9', '10', '11', '12'];
const MAX_LOOKUP_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

function defaultExam(grade) {
  const g = String(grade);
  return {
    grade: Number(g),
    subject: 'physics',
    titleAr: `اختبار تشخيصي في الفيزياء — الصف ${g}`,
    titleEn: `Physics diagnostic exam — Grade ${g}`,
    status: 'not_started',
    pdfUploaded: false,
    questionsReady: false,
    rosterCount: 0,
    objectivesCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

async function clearLookupAttempts(mid) {
  await lookupAttemptsRef(mid).remove();
}

function lookupAttemptsRef(mid) {
  const key = String(mid || '').replace(/\s/g, '').replace(/[.#$/[\]]/g, '_');
  return admin.database().ref(`examMidLookupAttempts/${key}`);
}

async function assertLookupNotLocked(mid) {
  const snap = await lookupAttemptsRef(mid).once('value');
  const data = snap.val() || {};
  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts — try later');
  }
}

async function recordFailedLookup(mid) {
  const ref = lookupAttemptsRef(mid);
  const snap = await ref.once('value');
  const data = snap.val() || {};
  const count = (data.count || 0) + 1;
  const payload = { count, lastAttempt: Date.now() };
  if (count >= MAX_LOOKUP_ATTEMPTS) payload.lockedUntil = Date.now() + LOCKOUT_MS;
  await ref.update(payload);
}

async function assertTeacherOrAdmin(context) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  const uid = context.auth.uid;
  const adminSnap = await admin.database().ref('admins/' + uid).once('value');
  if (adminSnap.val() === true) return { role: 'admin', uid };
  const lookupSnap = await admin.database().ref('teacherLookup/' + uid).once('value');
  const lookup = lookupSnap.val();
  if (!lookup) {
    throw new functions.https.HttpsError('permission-denied', 'Teacher only');
  }
  return { role: lookup.role || 'teacher', key: lookup.key, uid };
}

async function seedExamsIfNeeded() {
  const updates = {};
  const exams = {};
  for (const grade of EXAM_GRADES) {
    const ref = admin.database().ref('physicsExams/exams/' + grade);
    const snap = await ref.once('value');
    if (!snap.exists()) {
      const exam = defaultExam(grade);
      updates['physicsExams/exams/' + grade] = exam;
      exams[grade] = exam;
    } else {
      exams[grade] = snap.val();
    }
  }
  if (Object.keys(updates).length) {
    await admin.database().ref().update(updates);
  }
  return exams;
}

exports.ensurePhysicsExams = region.https.onCall(async (_data, context) => {
  await assertTeacherOrAdmin(context);
  const exams = await seedExamsIfNeeded();
  return { ok: true, exams };
});

exports.examStudentLogin = region.https.onCall(async (data) => {
  const mid = String(data?.mid || '').replace(/\s/g, '');
  if (!/^\d{5,14}$/.test(mid)) {
    return { ok: false, code: 'not_found' };
  }
  await assertLookupNotLocked(mid);

  const rosterSnap = await admin.database().ref('physicsExams/roster/' + mid).once('value');
  if (!rosterSnap.exists()) {
    await recordFailedLookup(mid);
    return { ok: false, code: 'not_found' };
  }

  const student = rosterSnap.val() || {};
  const grade = String(student.grade || '');
  if (!EXAM_GRADES.includes(grade)) {
    await recordFailedLookup(mid);
    return { ok: false, code: 'not_found' };
  }

  let examSnap = await admin.database().ref('physicsExams/exams/' + grade).once('value');
  if (!examSnap.exists()) {
    await seedExamsIfNeeded();
    examSnap = await admin.database().ref('physicsExams/exams/' + grade).once('value');
  }
  const exam = examSnap.val() || defaultExam(grade);
  const sessionSnap = await admin.database().ref(`physicsExams/sessions/${grade}/${mid}`).once('value');
  const session = sessionSnap.val() || {};
  await clearLookupAttempts(mid);

  return {
    ok: true,
    student: {
      mid,
      name: String(student.name || '').trim(),
      grade: Number(grade),
      section: String(student.section || ''),
    },
    exam: {
      grade: Number(grade),
      status: exam.status || 'not_started',
      questionsReady: exam.questionsReady === true,
      pdfUploaded: exam.pdfUploaded === true,
      sessionStatus: session.status || 'none',
    },
  };
});
