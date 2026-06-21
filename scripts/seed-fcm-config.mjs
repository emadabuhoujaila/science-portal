#!/usr/bin/env node
/**
 * Seed FCM web push VAPID key into Firebase RTDB publicConfig/fcm/vapidKey
 *
 * Get the key from Firebase Console:
 * Project Settings → Cloud Messaging → Web Push certificates → Key pair
 *
 * Usage:
 *   node scripts/seed-fcm-config.mjs YOUR_VAPID_KEY_HERE
 *
 * Credentials (first match wins):
 *   1. GOOGLE_APPLICATION_CREDENTIALS env var
 *   2. science-portal-app/serviceAccountKey.json
 *   3. ~/.firebase/students-portal-34231-firebase-adminsdk.json
 */
import admin from 'firebase-admin';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const PROJECT = 'students-portal-34231';
const DATABASE_URL = `https://${PROJECT}-default-rtdb.firebaseio.com`;

const vapidKey = process.argv.slice(2).join('').replace(/\s+/g, '').trim();
if (!vapidKey) {
  console.error('Usage: node scripts/seed-fcm-config.mjs <VAPID_KEY>');
  console.error('');
  console.error('Get key from Firebase Console:');
  console.error('  Project Settings → Cloud Messaging → Web Push certificates → Key pair');
  console.error('');
  console.error('Or set manually in Realtime Database:');
  console.error('  publicConfig/fcm/vapidKey = your key (one line, no spaces)');
  process.exit(1);
}

function findServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(root, 'serviceAccountKey.json'),
    join(homedir(), '.firebase', `${PROJECT}-firebase-adminsdk.json`),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  const firebaseDir = join(homedir(), '.firebase');
  if (existsSync(firebaseDir)) {
    const jsonFiles = readdirSync(firebaseDir).filter(
      (f) => f.endsWith('.json') && f.includes('adminsdk')
    );
    if (jsonFiles.length) return join(firebaseDir, jsonFiles[0]);
  }

  return null;
}

const keyPath = findServiceAccountPath();
if (!keyPath) {
  console.error('❌ Service account JSON not found.');
  console.error('');
  console.error('Option A — download key file:');
  console.error('  1. Firebase Console → Project Settings → Service accounts');
  console.error('  2. Generate new private key');
  console.error('  3. Save as:');
  console.error(`     ${join(root, 'serviceAccountKey.json')}`);
  console.error('  4. Run this command again');
  console.error('');
  console.error('Option B — set VAPID manually (no script):');
  console.error('  Firebase Console → Realtime Database → add node:');
  console.error('    publicConfig/fcm/vapidKey = (paste your key, one line)');
  process.exit(1);
}

let cred;
try {
  cred = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (e) {
  console.error('Invalid JSON at', keyPath, e.message);
  process.exit(1);
}

if (cred.project_id && cred.project_id !== PROJECT) {
  console.error(`Wrong project in ${keyPath}: ${cred.project_id} (expected ${PROJECT})`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(cred),
  databaseURL: DATABASE_URL,
});

await admin.database().ref('publicConfig/fcm').update({
  vapidKey,
  updatedAt: new Date().toISOString(),
});

console.log('✅ Saved publicConfig/fcm/vapidKey');
console.log('   Key length:', vapidKey.length, 'chars');
console.log('   Using credentials:', keyPath);
process.exit(0);
