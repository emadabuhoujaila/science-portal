/**
 * Create the first Firebase Auth admin for the portal.
 *
 * Usage:
 *   node scripts/create-admin.mjs admin@school.ae "YourSecurePassword123"
 *
 * Requires serviceAccountKey.json in project root (see migrate-teachers.mjs).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(root, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('Missing serviceAccountKey.json — download from Firebase Console.');
  process.exit(1);
}

const EXPECTED_PROJECT = 'students-portal-34231';
const DATABASE_URL = `https://${EXPECTED_PROJECT}-default-rtdb.firebaseio.com`;

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (serviceAccount.project_id !== EXPECTED_PROJECT) {
  console.error('Wrong service account key!');
  console.error(`  File project_id: ${serviceAccount.project_id}`);
  console.error(`  Expected:        ${EXPECTED_PROJECT}`);
  console.error('');
  console.error('Download a new key from Firebase Console → students-portal-34231 →');
  console.error('Project settings → Service accounts → Generate new private key');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});

const auth = admin.auth();
const db = admin.database();

function emailKey(addr) {
  return addr.trim().toLowerCase().replace(/[.@]/g, '_');
}

async function main() {
  const normalized = email.trim().toLowerCase();
  const key = emailKey(normalized);
  let user;

  try {
    user = await auth.getUserByEmail(normalized);
    await auth.updateUser(user.uid, { password });
    console.log('Updated password for existing user:', normalized);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await auth.createUser({ email: normalized, password, displayName: 'Portal Admin' });
    console.log('Created Auth user:', normalized);
  }

  const updates = {
    [`admins/${user.uid}`]: true,
    [`teacherLookup/${user.uid}`]: { key, role: 'admin' },
    [`teachers/${key}`]: {
      name: 'مسؤول النظام',
      email: normalized,
      role: 'admin',
      uid: user.uid,
      _key: key,
      grades: ['5', '6', '7', '8'],
      sections: ['A', 'B', 'C', 'D', 'E', 'F'],
      gradeMap: {
        '5': ['A', 'B', 'C', 'D', 'E', 'F'],
        '6': ['A', 'B', 'C', 'D', 'E', 'F'],
        '7': ['A', 'B', 'C', 'D', 'E', 'F'],
        '8': ['A', 'B', 'C', 'D', 'E', 'F'],
      },
      createdAt: new Date().toISOString(),
    },
  };

  await db.ref().update(updates);
  console.log('Admin linked. UID:', user.uid);
  console.log('Login at the app → تبويب المسؤول with this email and password.');
}

main().catch(e => {
  const msg = e.message || String(e);
  if (msg.includes('no configuration corresponding') || e.code === 'auth/configuration-not-found') {
    console.error('\n❌ Firebase Authentication غير مفعّل في المشروع students-portal-34231\n');
    console.error('الحل:');
    console.error('  1. افتح https://console.firebase.google.com');
    console.error('  2. اختر مشروع students-portal-34231');
    console.error('  3. Build → Authentication → Get started (إن ظهر)');
    console.error('  4. Sign-in method → Email/Password → Enable → Save');
    console.error('  5. أعد تشغيل: npm run create:admin -- admin@school.ae "YourPassword123"\n');
  } else {
    console.error(msg);
  }
  process.exit(1);
});
