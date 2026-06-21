const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

const region = functions.region('us-central1');
const BUCKET = 'students-portal-34231.firebasestorage.app';

const IMAGE_MAX = 5 * 1024 * 1024;
const PDF_MAX = 6 * 1024 * 1024;

function safeName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-()+\u0600-\u06FF\s]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'file';
}

function sniffBufferType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/heic|heix|hevc|hevx|mif1|msf1/i.test(brand)) return 'image/heic';
    if (/avif/i.test(brand)) return 'image/avif';
  }
  return '';
}

function isAllowedType(type) {
  const t = String(type || '').trim().toLowerCase();
  return t === 'application/pdf' || t.startsWith('image/');
}

function normalizeContentType(contentType, fileName, buffer) {
  const aliases = {
    'image/jpg': 'image/jpeg',
    'image/pjpeg': 'image/jpeg',
    'image/x-citrix-jpeg': 'image/jpeg',
    'image/x-png': 'image/png',
    'image/x-bmp': 'image/bmp',
    'application/x-pdf': 'application/pdf',
  };
  let type = aliases[String(contentType || '').trim().toLowerCase()] || String(contentType || '').trim().toLowerCase();
  if (isAllowedType(type)) return type;

  const ext = String(fileName || '').split('.').pop().toLowerCase();
  const extMap = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', svg: 'image/svg+xml',
    pdf: 'application/pdf',
  };
  if (extMap[ext]) return extMap[ext];

  const sniffed = sniffBufferType(buffer || Buffer.alloc(0));
  if (sniffed) return sniffed;

  return type;
}

function validateMeta(contentType, size) {
  if (!isAllowedType(contentType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported file type');
  }
  if (contentType === 'application/pdf') {
    if (size > PDF_MAX) throw new functions.https.HttpsError('invalid-argument', 'PDF max 6 MB');
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
    const fileBase64 = data?.fileBase64;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Missing file data');
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length) {
      throw new functions.https.HttpsError('invalid-argument', 'Empty file');
    }
    const contentType = normalizeContentType(data?.contentType, fileName, buffer);
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
