/**
 * Copy teacher name/subject/grades into publicTeachers (readable by parents).
 *
 * Usage: node scripts/sync-public-teachers.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(root, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('Missing serviceAccountKey.json');
  process.exit(1);
}

const EXPECTED_PROJECT = 'students-portal-34231';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (serviceAccount.project_id !== EXPECTED_PROJECT) {
  console.error(`Wrong project_id: ${serviceAccount.project_id}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${EXPECTED_PROJECT}-default-rtdb.firebaseio.com`,
});

const db = admin.database();

function buildPublicTeacherProfile(teacher) {
  if (!teacher?.subject || teacher.role === 'admin') return null;
  return {
    name: teacher.name || '',
    subject: teacher.subject || '',
    grades: teacher.grades || [],
    sections: teacher.sections || [],
    gradeMap: teacher.gradeMap || null,
  };
}

async function main() {
  const snap = await db.ref('teachers').once('value');
  const updates = {};
  let count = 0;
  if (snap.exists()) {
    snap.forEach(child => {
      const teacher = child.val() || {};
      const profile = buildPublicTeacherProfile(teacher);
      if (!profile) return;
      updates[`publicTeachers/${child.key}`] = profile;
      count++;
    });
  }
  const pubSnap = await db.ref('publicTeachers').once('value');
  if (pubSnap.exists()) {
    pubSnap.forEach(child => {
      if (!updates[`publicTeachers/${child.key}`]) {
        updates[`publicTeachers/${child.key}`] = null;
      }
    });
  }
  if (!Object.keys(updates).length) {
    console.log('Nothing to sync.');
    return;
  }
  await db.ref().update(updates);
  console.log(`Synced ${count} teacher(s) to publicTeachers (removed stale entries).`);
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
