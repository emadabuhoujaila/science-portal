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
