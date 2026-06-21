const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const region = functions.region('us-central1');

function encodeOneDriveShareUrl(shareUrl) {
  const base64 = Buffer.from(String(shareUrl))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\//g, '_')
    .replace(/\+/g, '-');
  return 'u!' + base64;
}

function validateExcelBuffer(buf) {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Downloaded file is not a valid Excel (.xlsx) file'
    );
  }
  return Buffer.from(buf).toString('base64');
}

async function fetchShareBuffer(url, headers = {}) {
  const res = await fetch(url, { redirect: 'follow', headers });
  if (!res.ok) return { ok: false, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, buf };
}

async function downloadViaGraphShareId(shareId) {
  const graphHeaders = {
    Accept: 'application/json',
    Prefer: 'redeemSharingLink',
  };

  const metaRes = await fetch(
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$select=id,name,@microsoft.graph.downloadUrl`,
    { redirect: 'follow', headers: graphHeaders }
  );
  if (metaRes.ok) {
    const meta = await metaRes.json();
    const downloadUrl = meta['@microsoft.graph.downloadUrl'];
    if (downloadUrl) {
      const file = await fetchShareBuffer(downloadUrl);
      if (file.ok) return validateExcelBuffer(file.buf);
    }
  }

  const contentRes = await fetchShareBuffer(
    `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem/content`,
    graphHeaders
  );
  if (contentRes.ok) return validateExcelBuffer(contentRes.buf);

  const consumerRes = await fetchShareBuffer(
    `https://api.onedrive.com/v1.0/shares/${shareId}/root/content`
  );
  if (consumerRes.ok) return validateExcelBuffer(consumerRes.buf);

  return { status: metaRes.status || contentRes.status || consumerRes.status || 401 };
}

async function downloadOneDriveShare(shareUrl) {
  const trimmed = String(shareUrl || '').trim();
  if (!trimmed) {
    throw new functions.https.HttpsError('invalid-argument', 'OneDrive URL required');
  }
  if (!/onedrive|1drv\.ms|sharepoint\.com/i.test(trimmed)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid OneDrive link');
  }

  const shareId = encodeOneDriveShareUrl(trimmed);
  const result = await downloadViaGraphShareId(shareId);
  if (typeof result === 'string') return result;

  const status = result?.status || 401;
  let detail;
  if (status === 404) {
    detail = 'File not found — check the link and sharing settings';
  } else if (status === 401 || status === 403) {
    detail = 'OneDrive denied access — open sharing and choose "Anyone with the link can view" (not Edit-only or Sign-in required)';
  } else {
    detail = `OneDrive download failed (${status})`;
  }
  throw new functions.https.HttpsError('failed-precondition', detail);
}

function emailKey(addr) {
  return String(addr || '').trim().toLowerCase().replace(/[.@]/g, '_');
}

async function assertTeacher(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  const lookupSnap = await admin.database().ref('teacherLookup/' + context.auth.uid).once('value');
  const lookup = lookupSnap.val();
  if (!lookup?.key || lookup.role === 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Teachers only');
  }
  return lookup.key;
}

async function assertAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  const [adminSnap, lookupSnap] = await Promise.all([
    admin.database().ref('admins/' + context.auth.uid).once('value'),
    admin.database().ref('teacherLookup/' + context.auth.uid).once('value'),
  ]);
  const isAdmin = adminSnap.val() === true || lookupSnap.val()?.role === 'admin';
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  return true;
}

const FIREBASE_WEB_API_KEY = 'AIzaSyD9fIhL5ctwwIH3qyJnrvJ1OQyQQYhLiBg';

async function sendPasswordResetEmailServer(email) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(body?.error?.message || '');
    if (msg.includes('EMAIL_NOT_FOUND')) {
      throw new functions.https.HttpsError('not-found', 'No Firebase account for this email');
    }
    if (msg.includes('INVALID_EMAIL')) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email');
    }
    throw new functions.https.HttpsError('internal', msg || 'Password reset send failed');
  }
  return body;
}

exports.checkTeacherAllowlist = region.https.onCall(async (data) => {
  const email = String(data?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid email');
  }

  const key = emailKey(email);
  const [allowSnap, teacherSnap] = await Promise.all([
    admin.database().ref('teacherAllowlist/' + key).once('value'),
    admin.database().ref('teachers/' + key).once('value'),
  ]);

  if (teacherSnap.exists() && teacherSnap.val()?.uid) {
    return { allowed: false, reason: 'already_registered' };
  }

  return {
    allowed: allowSnap.exists(),
    reason: allowSnap.exists() ? 'ok' : 'not_on_list',
  };
});

exports.fetchOneDriveExcel = region.https.onCall(async (data, context) => {
  const teacherKey = await assertTeacher(context);
  let shareUrl = String(data?.url || '').trim();

  if (!shareUrl) {
    const settingsSnap = await admin.database().ref(`teacherData/${teacherKey}/settings/oneDriveUrl`).once('value');
    shareUrl = String(settingsSnap.val() || '').trim();
  }
  if (!shareUrl) {
    throw new functions.https.HttpsError('failed-precondition', 'OneDrive URL not configured');
  }

  const base64 = await downloadOneDriveShare(shareUrl);
  await admin.database().ref(`teacherData/${teacherKey}/settings`).update({
    oneDriveUrl: shareUrl,
    lastGradeSyncAttempt: new Date().toISOString(),
  });

  return { ok: true, base64, size: Buffer.from(base64, 'base64').length };
});

exports.adminResetTeacherPassword = region.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const email = String(data?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid email required');
  }

  const key = emailKey(email);
  const [allowSnap, teacherSnap] = await Promise.all([
    admin.database().ref('teacherAllowlist/' + key).once('value'),
    admin.database().ref('teachers/' + key).once('value'),
  ]);
  if (!allowSnap.exists() && !teacherSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Email not on approved teacher list');
  }
  if (!teacherSnap.exists() || !teacherSnap.val()?.uid) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Teacher has not registered yet — no password to reset'
    );
  }

  await sendPasswordResetEmailServer(email);
  return { ok: true, email };
});

exports.adminDeleteTeacher = region.https.onCall(async (data, context) => {
  await assertAdmin(context);

  const key = data?.key;
  const uid = data?.uid;
  if (!key) {
    throw new functions.https.HttpsError('invalid-argument', 'Teacher key required');
  }
  if (uid && uid === context.auth.uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot delete your own admin account');
  }

  const teacherSnap = await admin.database().ref('teachers/' + key).once('value');
  const teacher = teacherSnap.val();
  const targetUid = uid || teacher?.uid;

  if (targetUid) {
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
    await admin.database().ref('teacherLookup/' + targetUid).remove();
  }

  await Promise.all([
    admin.database().ref('teachers/' + key).remove(),
    admin.database().ref('teacherData/' + key).remove(),
    admin.database().ref('publicTeachers/' + key).remove(),
  ]);

  const complaintsSnap = await admin.database().ref('complaints').once('value');
  if (complaintsSnap.exists()) {
    const updates = {};
    complaintsSnap.forEach((child) => {
      if (child.val()?.teacherKey === key) updates[child.key] = null;
    });
    if (Object.keys(updates).length) {
      await admin.database().ref('complaints').update(updates);
    }
  }

  return { ok: true, key, uid: targetUid || null };
});

Object.assign(exports, require('./push-notifications'));
Object.assign(exports, require('./upload-attachment'));
Object.assign(exports, require('./parent-auth'));
Object.assign(exports, require('./parent-public-data'));
