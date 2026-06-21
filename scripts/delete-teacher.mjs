/**
 * Delete a teacher completely (Auth + Realtime Database).
 *
 * Usage:
 *   node scripts/delete-teacher.mjs teacher@school.ae
 *   node scripts/delete-teacher.mjs --key emad_school_ae
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function emailKey(addr) {
  return addr.trim().toLowerCase().replace(/[.@]/g, '_');
}

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

const auth = admin.auth();
const db = admin.database();

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/delete-teacher.mjs <email>');
    console.error('   or: node scripts/delete-teacher.mjs --key <teacherKey>');
    process.exit(1);
  }

  let key;
  let email;

  if (arg === '--key') {
    key = process.argv[3];
    if (!key) {
      console.error('Missing teacher key');
      process.exit(1);
    }
  } else {
    email = arg.trim().toLowerCase();
    key = emailKey(email);
  }

  const teacherSnap = await db.ref('teachers/' + key).once('value');
  const teacher = teacherSnap.val();
  if (!teacher) {
    console.error('Teacher not found:', key);
    process.exit(1);
  }

  email = email || teacher.email;
  const uid = teacher.uid;

  if (uid) {
    try {
      await auth.deleteUser(uid);
      console.log('Deleted Auth user:', uid, email || '');
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      console.warn('Auth user not found:', uid);
    }
    await db.ref('teacherLookup/' + uid).remove();
  }

  await Promise.all([
    db.ref('teachers/' + key).remove(),
    db.ref('teacherData/' + key).remove(),
    db.ref('publicTeachers/' + key).remove(),
  ]);

  console.log('Deleted teacher data for key:', key);
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
