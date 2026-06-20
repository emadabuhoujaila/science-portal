#!/usr/bin/env node
/**
 * Seed FCM web push VAPID key into Firebase RTDB publicConfig/fcm/vapidKey
 *
 * Get the key from Firebase Console:
 * Project Settings → Cloud Messaging → Web Push certificates → Key pair
 *
 * Usage:
 *   node scripts/seed-fcm-config.mjs YOUR_VAPID_KEY_HERE
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const vapidKey = process.argv[2]?.trim();
if (!vapidKey) {
  console.error('Usage: node scripts/seed-fcm-config.mjs <VAPID_KEY>');
  console.error('Get key from Firebase Console → Cloud Messaging → Web Push certificates');
  process.exit(1);
}

const credPath = join(homedir(), '.firebase', 'students-portal-34231-firebase-adminsdk.json');
let cred;
try {
  cred = JSON.parse(readFileSync(credPath, 'utf8'));
} catch {
  console.error('Service account not found at', credPath);
  console.error('Download from Firebase Console → Project Settings → Service accounts');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(cred),
  databaseURL: 'https://students-portal-34231-default-rtdb.firebaseio.com',
});

await admin.database().ref('publicConfig/fcm').update({
  vapidKey,
  updatedAt: new Date().toISOString(),
});

console.log('✅ Saved publicConfig/fcm/vapidKey');
process.exit(0);
