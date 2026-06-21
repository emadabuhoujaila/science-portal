/**
 * Seed teacherAllowlist from existing teachers (and optional extra emails).
 *
 * Usage:
 *   node scripts/seed-teacher-allowlist.mjs
 *   node scripts/seed-teacher-allowlist.mjs teacher1@school.ae teacher2@school.ae
 *
 * Requires serviceAccountKey.json in project root.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const extraEmails = process.argv.slice(2).map(e => e.trim().toLowerCase()).filter(Boolean);

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
  console.error(`Wrong service account key (expected ${EXPECTED_PROJECT}).`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL,
});

const db = admin.database();

function emailKey(addr) {
  return String(addr || '').trim().toLowerCase().replace(/[.@]/g, '_');
}

async function main() {
  const teachersSnap = await db.ref('teachers').once('value');
  const updates = {};
  const seen = new Set();

  if (teachersSnap.exists()) {
    teachersSnap.forEach(child => {
      const t = child.val();
      const email = String(t?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) return;
      const key = emailKey(email);
      if (seen.has(key)) return;
      seen.add(key);
      updates[`teacherAllowlist/${key}`] = {
        email,
        name: t?.name || null,
        addedAt: t?.createdAt || new Date().toISOString(),
        source: 'seed-from-teachers',
      };
    });
  }

  for (const email of extraEmails) {
    const key = emailKey(email);
    if (seen.has(key)) continue;
    seen.add(key);
    updates[`teacherAllowlist/${key}`] = {
      email,
      addedAt: new Date().toISOString(),
      source: 'seed-cli',
    };
  }

  if (!Object.keys(updates).length) {
    console.log('Nothing to seed — no teachers found and no extra emails provided.');
    return;
  }

  await db.ref().update(updates);
  console.log(`Seeded ${Object.keys(updates).length} allowlist entries:`);
  Object.values(updates).forEach(entry => console.log('  •', entry.email));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
