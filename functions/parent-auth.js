const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

const region = functions.region('us-central1');
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PIN_MIN = 4;
const PIN_MAX = 6;
const PARENT_SESSION_MS = 24 * 60 * 60 * 1000;

async function issueParentSession(mid, cls, section, name) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await admin.database().ref(`parentSessions/${token}`).set({
    mid: String(mid),
    cls: String(cls),
    section: String(section || ''),
    name: String(name),
    createdAt: new Date(now).toISOString(),
    expiresAt: now + PARENT_SESSION_MS,
  });
  return token;
}

function makeSessionKey(cls, section, name) {
  const normalize = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return [String(cls || '').trim(), String(section || '').trim(), normalize(name)]
    .join('|')
    .replace(/[.#$/[\]]/g, '_');
}

function normalizePin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

function validatePinFormat(pin) {
  const p = normalizePin(pin);
  if (p.length < PIN_MIN || p.length > PIN_MAX) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `PIN must be ${PIN_MIN}-${PIN_MAX} digits`
    );
  }
  return p;
}

function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(String(pin), salt, 120000, 32, 'sha256').toString('hex');
}

function createPinRecord(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    pinSalt: salt,
    pinHash: hashPin(pin, salt),
    pinVersion: 1,
  };
}

function verifyPinHash(pin, record) {
  if (!record?.pinSalt || !record?.pinHash) return false;
  return hashPin(pin, record.pinSalt) === record.pinHash;
}

async function findStudentMid(cls, section, name) {
  const wantName = String(name || '').trim();
  const sec = String(section || '').trim();
  if (!cls || !wantName) return null;

  if (sec) {
    const secSnap = await admin.database().ref(`students/${cls}/${sec}`).once('value');
    if (secSnap.exists()) {
      let found = null;
      secSnap.forEach((child) => {
        if (found) return;
        const val = child.val() || {};
        if (String(val.name || '').trim() === wantName) {
          found = { mid: String(val.mid || child.key), ...val };
        }
      });
      if (found) return found;
    }
  }

  const gradeSnap = await admin.database().ref(`students/${cls}`).once('value');
  if (!gradeSnap.exists()) return null;
  let found = null;
  gradeSnap.forEach((secChild) => {
    if (found) return;
    secChild.forEach((stChild) => {
      if (found) return;
      const val = stChild.val() || {};
      if (String(val.name || '').trim() === wantName) {
        found = { mid: String(val.mid || stChild.key), ...val };
      }
    });
  });
  return found;
}

async function validateStudentMid(cls, section, name, mid) {
  const student = await findStudentMid(cls, section, name);
  if (!student?.mid) {
    throw new functions.https.HttpsError('not-found', 'Student not found');
  }
  if (String(student.mid) !== String(mid)) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid ministry ID');
  }
  return student;
}

function attemptsRef(sessionKey) {
  return admin.database().ref(`parentPinAttempts/${sessionKey}`);
}

async function assertNotLocked(sessionKey) {
  const snap = await attemptsRef(sessionKey).once('value');
  const data = snap.val() || {};
  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts — try later');
  }
}

async function recordFailedAttempt(sessionKey) {
  const ref = attemptsRef(sessionKey);
  const snap = await ref.once('value');
  const data = snap.val() || {};
  const count = (data.count || 0) + 1;
  const payload = { count, lastAttempt: Date.now() };
  if (count >= MAX_PIN_ATTEMPTS) payload.lockedUntil = Date.now() + LOCKOUT_MS;
  await ref.update(payload);
}

async function clearAttempts(sessionKey) {
  await attemptsRef(sessionKey).remove();
}

async function loadRegistration(mid) {
  const snap = await admin.database().ref(`registeredParents/${mid}`).once('value');
  return snap.exists() ? snap.val() : null;
}

async function writeRegistration(mid, cls, section, name, pinRecord, existing) {
  const now = new Date().toISOString();
  const sessionKey = makeSessionKey(cls, section, name);
  const parentRecord = {
    mid: String(mid),
    cls: String(cls),
    section: String(section || ''),
    name: String(name),
    registeredAt: existing?.registeredAt || now,
    lastLogin: now,
    hasPin: true,
    ...pinRecord,
  };
  const quickRecord = {
    cls: String(cls),
    section: String(section || ''),
    name: String(name),
    hasPin: true,
    registeredAt: existing?.registeredAt || now,
    lastLogin: now,
  };
  await admin.database().ref().update({
    [`registeredParents/${mid}`]: parentRecord,
    [`parentQuickLogin/${sessionKey}`]: quickRecord,
  });
}

exports.checkParentRegistration = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  if (!cls || !name) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing student info');
  }

  const student = await findStudentMid(cls, section, name);
  if (!student?.mid) return { registered: false };

  const reg = await loadRegistration(student.mid);
  if (!reg) return { registered: false };
  return { registered: !!reg.pinHash };
});

exports.setupParentPin = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  const mid = String(data?.mid || '').replace(/\s/g, '');
  const pin = validatePinFormat(data?.pin);
  const pinConfirm = validatePinFormat(data?.pinConfirm);

  if (pin !== pinConfirm) {
    throw new functions.https.HttpsError('invalid-argument', 'PIN confirmation mismatch');
  }

  await validateStudentMid(cls, section, name, mid);
  const existing = await loadRegistration(mid);
  if (existing?.pinHash) {
    throw new functions.https.HttpsError('already-exists', 'PIN already set');
  }

  const pinRecord = createPinRecord(pin);
  await writeRegistration(mid, cls, section, name, pinRecord, existing);
  const sessionKey = makeSessionKey(cls, section, name);
  await clearAttempts(sessionKey);
  const sessionToken = await issueParentSession(mid, cls, section, name);

  return { ok: true, mid, sessionToken };
});

exports.verifyParentPin = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  const pin = validatePinFormat(data?.pin);
  const sessionKey = makeSessionKey(cls, section, name);

  await assertNotLocked(sessionKey);

  const student = await findStudentMid(cls, section, name);
  if (!student?.mid) {
    await recordFailedAttempt(sessionKey);
    throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
  }

  const reg = await loadRegistration(student.mid);
  if (!reg?.pinHash || !verifyPinHash(pin, reg)) {
    await recordFailedAttempt(sessionKey);
    throw new functions.https.HttpsError('permission-denied', 'Invalid PIN');
  }

  await clearAttempts(sessionKey);
  const now = new Date().toISOString();
  await admin.database().ref().update({
    [`registeredParents/${student.mid}/lastLogin`]: now,
    [`parentQuickLogin/${sessionKey}/lastLogin`]: now,
  });

  const sessionToken = await issueParentSession(
    student.mid,
    cls,
    section,
    name
  );

  return { ok: true, mid: student.mid, sessionToken };
});

exports.verifyParentMid = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  const mid = String(data?.mid || '').replace(/\s/g, '');
  if (!cls || !name || !mid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing fields');
  }

  const sessionKey = makeSessionKey(cls, section, name);
  await assertNotLocked(sessionKey);

  try {
    await validateStudentMid(cls, section, name, mid);
  } catch (e) {
    await recordFailedAttempt(sessionKey);
    throw new functions.https.HttpsError('permission-denied', 'Invalid ministry ID');
  }

  const existing = await loadRegistration(mid);
  if (existing?.pinHash) {
    throw new functions.https.HttpsError('already-exists', 'PIN already set — use PIN login');
  }

  await clearAttempts(sessionKey);
  return { ok: true, mid };
});

/** Verify ministry ID when parent forgot PIN (must already have PIN registered). */
exports.verifyParentMidForReset = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  const mid = String(data?.mid || '').replace(/\s/g, '');
  if (!cls || !name || !mid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing fields');
  }

  const sessionKey = makeSessionKey(cls, section, name);
  await assertNotLocked(sessionKey);

  try {
    await validateStudentMid(cls, section, name, mid);
  } catch (e) {
    await recordFailedAttempt(sessionKey);
    throw new functions.https.HttpsError('permission-denied', 'Invalid ministry ID');
  }

  const existing = await loadRegistration(mid);
  if (!existing?.pinHash) {
    throw new functions.https.HttpsError('failed-precondition', 'No PIN set — use first-time setup');
  }

  await clearAttempts(sessionKey);
  return { ok: true, mid };
});

/** Replace forgotten PIN after ministry ID verification. */
exports.resetParentPin = region.https.onCall(async (data) => {
  const cls = String(data?.cls || '').trim();
  const section = String(data?.section || '').trim();
  const name = String(data?.name || '').trim();
  const mid = String(data?.mid || '').replace(/\s/g, '');
  const pin = validatePinFormat(data?.pin);
  const pinConfirm = validatePinFormat(data?.pinConfirm);

  if (pin !== pinConfirm) {
    throw new functions.https.HttpsError('invalid-argument', 'PIN confirmation mismatch');
  }

  await validateStudentMid(cls, section, name, mid);
  const existing = await loadRegistration(mid);
  if (!existing?.pinHash) {
    throw new functions.https.HttpsError('failed-precondition', 'No PIN to reset');
  }

  const pinRecord = createPinRecord(pin);
  await writeRegistration(mid, cls, section, name, pinRecord, existing);
  const sessionKey = makeSessionKey(cls, section, name);
  await clearAttempts(sessionKey);
  const sessionToken = await issueParentSession(mid, cls, section, name);

  return { ok: true, mid, sessionToken };
});
