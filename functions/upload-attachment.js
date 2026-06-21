const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

const region = functions.region('us-central1');
const BUCKET = 'students-portal-34231.firebasestorage.app';

const IMAGE_MAX = 5 * 1024 * 1024;
const PDF_MAX = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-()+\u0600-\u06FF\s]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'file';
}

function validateMeta(contentType, size) {
  if (!ALLOWED.has(contentType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported file type');
  }
  if (contentType === 'application/pdf') {
    if (size > PDF_MAX) throw new functions.https.HttpsError('invalid-argument', 'PDF max 10 MB');
  } else if (size > IMAGE_MAX) {
    throw new functions.https.HttpsError('invalid-argument', 'Image max 5 MB');
  }
  if (!size || size < 1) throw new functions.https.HttpsError('invalid-argument', 'Empty file');
}

async function isAdminUid(uid) {
  const [adminSnap, lookupSnap] = await Promise.all([
    admin.database().ref('admins/' + uid).once('value'),
    admin.database().ref('teacherLookup/' + uid).once('value'),
  ]);
  return adminSnap.val() === true || lookupSnap.val()?.role === 'admin';
}

async function getTeacherKey(uid) {
  const snap = await admin.database().ref('teacherLookup/' + uid).once('value');
  return snap.val()?.key || null;
}

async function validateParentStudent(mid, cls, name, section) {
  if (!mid || !cls || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing parent student info');
  }
  const wantName = String(name).trim();
  const sec = String(section || '').trim();

  if (sec) {
    const secSnap = await admin.database().ref('students/' + cls + '/' + sec + '/' + mid).once('value');
    if (secSnap.exists() && String(secSnap.val()?.name || '').trim() === wantName) return;
  }

  const gradeSnap = await admin.database().ref('students/' + cls).once('value');
  if (gradeSnap.exists()) {
    let ok = false;
    gradeSnap.forEach((secChild) => {
      if (ok) return;
      secChild.forEach((stChild) => {
        if (stChild.key === String(mid) && String(stChild.val()?.name || '').trim() === wantName) ok = true;
      });
    });
    if (ok) return;
  }

  const regSnap = await admin.database().ref('registeredParents/' + mid).once('value');
  if (regSnap.exists()) {
    const p = regSnap.val();
    if (String(p.cls) === String(cls) && String(p.name || '').trim() === wantName) return;
  }
  throw new functions.https.HttpsError('permission-denied', 'Parent session invalid');
}

function buildPath(channel, ownerId, fileName) {
  const id = crypto.randomBytes(8).toString('hex');
  return `attachments/${channel}/${ownerId}/${id}_${safeName(fileName)}`;
}

function downloadUrl(bucketName, path, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function assertUploadAccess(data, context) {
  const channel = String(data?.channel || '');
  const meta = data?.meta || {};
  const allowedChannels = ['tm', 'pm', 'pa', 'ta', 'ap', 'at'];
  if (!allowedChannels.includes(channel)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid channel');
  }

  if (channel === 'pm' || channel === 'pa') {
    await validateParentStudent(meta.mid, meta.cls, meta.name, meta.section);
    return { channel, ownerId: String(meta.mid) };
  }

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const uid = context.auth.uid;
  const isAdminUser = await isAdminUid(uid);
  const teacherKey = await getTeacherKey(uid);

  if (channel === 'tm' || channel === 'ta') {
    if (!teacherKey || (meta.teacherKey && meta.teacherKey !== teacherKey && !isAdminUser)) {
      throw new functions.https.HttpsError('permission-denied', 'Teacher only');
    }
    return { channel, ownerId: teacherKey };
  }

  if (channel === 'ap' || channel === 'at') {
    if (!isAdminUser) throw new functions.https.HttpsError('permission-denied', 'Admin only');
    if (channel === 'ap' && !meta.mid) {
      throw new functions.https.HttpsError('invalid-argument', 'mid required');
    }
    if (channel === 'at' && !meta.teacherKey) {
      throw new functions.https.HttpsError('invalid-argument', 'teacherKey required');
    }
    return { channel, ownerId: channel === 'ap' ? String(meta.mid) : String(meta.teacherKey) };
  }

  throw new functions.https.HttpsError('permission-denied', 'Not allowed');
}

/** Direct upload via Cloud Function (avoids signed-URL / CORS issues). */
exports.uploadAttachment = region.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (data, context) => {
  try {
    const fileName = String(data?.fileName || 'file');
    const contentType = String(data?.contentType || '');
    const fileBase64 = data?.fileBase64;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Missing file data');
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length) {
      throw new functions.https.HttpsError('invalid-argument', 'Empty file');
    }
    validateMeta(contentType, buffer.length);

    const access = await assertUploadAccess(data, context);
    const path = buildPath(access.channel, access.ownerId, fileName);
    const bucket = admin.storage().bucket(BUCKET);
    const file = bucket.file(path);
    const token = crypto.randomBytes(16).toString('hex');

    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    return {
      url: downloadUrl(bucket.name, path, token),
      path,
      name: fileName,
      type: contentType,
      size: buffer.length,
    };
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('uploadAttachment failed:', e);
    throw new functions.https.HttpsError('internal', e.message || 'Upload failed');
  }
});
