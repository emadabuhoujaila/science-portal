/**
 * Migrate legacy /teachers records (btoa password) to Firebase Authentication.
 *
 * Usage:
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key
 *   2. Save as serviceAccountKey.json in project root (never commit)
 *   3. npm install
 *   4. node scripts/migrate-teachers.mjs [--dry-run] [--admin-email=you@school.ae]
 *
 * Legacy passwords were stored as base64 (btoa) in RTDB — this script decodes them
 * when creating Auth users. Teachers keep the same password after migration.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const adminEmailArg = args.find(a => a.startsWith('--admin-email='));
const forceAdminEmail = adminEmailArg ? adminEmailArg.split('=')[1].trim().toLowerCase() : '';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(root, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('Missing service account key.');
  console.error('Save Firebase service account JSON as:', keyPath);
  console.error('Or set GOOGLE_APPLICATION_CREDENTIALS to its path.');
  process.exit(1);
}

const EXPECTED_PROJECT = 'students-portal-34231';
const DATABASE_URL = `https://${EXPECTED_PROJECT}-default-rtdb.firebaseio.com`;

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
if (serviceAccount.project_id !== EXPECTED_PROJECT) {
  console.error('Wrong service account key!');
  console.error(`  File project_id: ${serviceAccount.project_id}`);
  console.error(`  Expected:        ${EXPECTED_PROJECT}`);
  console.error('Download the key from Firebase project: students-portal-34231');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});

const auth = admin.auth();
const db = admin.database();

function emailKey(email) {
  return email.trim().toLowerCase().replace(/[.@]/g, '_');
}

function decodeLegacyPassword(encoded) {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const plain = Buffer.from(encoded, 'base64').toString('utf8');
    return plain.length >= 6 ? plain : null;
  } catch {
    return null;
  }
}

async function getUserByEmail(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') return null;
    throw e;
  }
}

async function migrateTeacher(key, teacher) {
  const email = (teacher.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { key, status: 'skipped', reason: 'no valid email' };
  }

  if (teacher.uid && teacher.migratedAt) {
    return { key, status: 'skipped', reason: 'already migrated' };
  }

  const legacyPw = decodeLegacyPassword(teacher.password);
  const isAdmin = teacher.role === 'admin'
    || teacher.isAdmin === true
    || key === 'emad_school_ae'
    || (forceAdminEmail && email === forceAdminEmail);

  let user = await getUserByEmail(email);
  let created = false;

  if (!user) {
    if (!legacyPw) {
      return { key, email, status: 'failed', reason: 'no legacy password and no Auth user' };
    }
    if (dryRun) {
      return { key, email, status: 'would-create', role: isAdmin ? 'admin' : 'teacher' };
    }
    user = await auth.createUser({ email, password: legacyPw, displayName: teacher.name || email });
    created = true;
  } else if (legacyPw && !dryRun) {
    await auth.updateUser(user.uid, { password: legacyPw, displayName: teacher.name || undefined });
  }

  const lookup = { key, role: isAdmin ? 'admin' : 'teacher' };
  const profile = {
    ...teacher,
    uid: user.uid,
    _key: key,
    email,
    migratedAt: new Date().toISOString(),
    password: null,
  };
  delete profile.password;

  if (!dryRun) {
    const updates = {};
    updates[`teachers/${key}`] = profile;
    updates[`teacherLookup/${user.uid}`] = lookup;
    if (isAdmin) updates[`admins/${user.uid}`] = true;
    await db.ref().update(updates);
  }

  return {
    key,
    email,
    uid: user?.uid,
    status: dryRun ? 'dry-run' : (created ? 'created' : 'linked'),
    role: isAdmin ? 'admin' : 'teacher',
  };
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no writes\n' : 'Live migration\n');

  const snap = await db.ref('teachers').once('value');
  if (!snap.exists()) {
    console.log('No teachers found in /teachers/');
    return;
  }

  const teachers = snap.val();
  const results = [];

  for (const [key, teacher] of Object.entries(teachers)) {
    if (!teacher || typeof teacher !== 'object') continue;
    try {
      const r = await migrateTeacher(key, teacher);
      results.push(r);
      console.log(`${r.status.padEnd(12)} ${key} ${r.email || ''} ${r.reason || r.role || ''}`);
    } catch (e) {
      results.push({ key, status: 'error', reason: e.message });
      console.error(`error        ${key} ${e.message}`);
    }
  }

  const ok = results.filter(r => ['created', 'linked', 'would-create', 'dry-run'].includes(r.status)).length;
  const skip = results.filter(r => r.status === 'skipped').length;
  const fail = results.filter(r => r.status === 'failed' || r.status === 'error').length;
  console.log(`\nDone: ${ok} migrated/linked, ${skip} skipped, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
