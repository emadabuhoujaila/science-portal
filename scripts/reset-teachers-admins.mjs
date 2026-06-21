/**
 * Remove all teachers, admins, and their Auth accounts from Firebase.
 * Also clears teacherData and publicTeachers (per-teacher app data).
 *
 * Usage:
 *   node scripts/reset-teachers-admins.mjs --confirm
 *
 * Does NOT delete /students (student lists stay).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

if (!process.argv.includes('--confirm')) {
  console.error('This deletes ALL teachers, admins, Auth users, and teacherData.');
  console.error('Student lists (/students) are kept.');
  console.error('');
  console.error('Run: node scripts/reset-teachers-admins.mjs --confirm');
  process.exit(1);
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(root, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('Missing serviceAccountKey.json');
  process.exit(1);
}

const EXPECTED_PROJECT = 'students-portal-34231';
const DATABASE_URL = `https://${EXPECTED_PROJECT}-default-rtdb.firebaseio.com`;

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (serviceAccount.project_id !== EXPECTED_PROJECT) {
  console.error(`Wrong project_id: ${serviceAccount.project_id}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});

const auth = admin.auth();
const db = admin.database();

async function deleteAllAuthUsers() {
  let deleted = 0;
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    if (result.users.length) {
      await auth.deleteUsers(result.users.map(u => u.uid));
      deleted += result.users.length;
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return deleted;
}

async function main() {
  console.log('Deleting Firebase Auth users...');
  const authCount = await deleteAllAuthUsers();
  console.log(`  Auth users deleted: ${authCount}`);

  const paths = ['teachers', 'teacherLookup', 'admins', 'publicTeachers', 'teacherData'];
  console.log('Clearing Realtime Database paths...');
  await Promise.all(paths.map(p => db.ref(p).remove()));
  paths.forEach(p => console.log(`  /${p} cleared`));

  console.log('');
  console.log('Done. /students was NOT touched.');
  console.log('Next: npm run create:admin -- email password');
  console.log('Then register teachers from the app or create accounts manually.');
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
