const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const region = functions.region('us-central1');
const APP_URL = 'https://emadabuhoujaila.github.io/science-portal/';

async function findParentMids(cls, name) {
  const mids = new Set();
  if (!cls || !name) return [];
  const snap = await admin.database().ref('registeredParents').once('value');
  if (!snap.exists()) return [];
  snap.forEach((child) => {
    const p = child.val();
    if (p && String(p.cls) === String(cls) && String(p.name).trim() === String(name).trim()) {
      mids.add(String(p.mid || child.key));
    }
  });
  return [...mids];
}

async function collectTokens(basePath) {
  const snap = await admin.database().ref(basePath).once('value');
  if (!snap.exists()) return [];
  const tokens = [];
  snap.forEach((child) => {
    const t = child.val()?.token;
    if (t) tokens.push(String(t));
  });
  return tokens;
}

async function collectParentTokensForStudent(cls, name) {
  const mids = await findParentMids(cls, name);
  const all = [];
  for (const mid of mids) {
    const tokens = await collectTokens(`fcmTokens/parents/${mid}`);
    all.push(...tokens);
  }
  return [...new Set(all)];
}

async function collectTeacherTokens(teacherKey) {
  if (!teacherKey) return [];
  return collectTokens(`fcmTokens/teachers/${teacherKey}`);
}

async function collectAdminTokens() {
  const uids = new Set();
  const adminsSnap = await admin.database().ref('admins').once('value');
  if (adminsSnap.exists()) {
    adminsSnap.forEach((c) => { if (c.val() === true) uids.add(c.key); });
  }
  const lookupSnap = await admin.database().ref('teacherLookup').once('value');
  if (lookupSnap.exists()) {
    lookupSnap.forEach((c) => { if (c.val()?.role === 'admin') uids.add(c.key); });
  }
  const tokens = [];
  for (const uid of uids) {
    tokens.push(...(await collectTokens(`fcmTokens/admins/${uid}`)));
  }
  return [...new Set(tokens)];
}

async function removeBadToken(pathPrefix, tokenId) {
  if (!pathPrefix || !tokenId) return;
  try {
    await admin.database().ref(`${pathPrefix}/${tokenId}`).remove();
  } catch (e) { /* ignore */ }
}

async function sendToTokens(tokens, notification, data, tokenPathPrefix) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const messaging = admin.messaging();
  let sent = 0;
  let failed = 0;

  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [k, String(v ?? '')])
        ),
        android: {
          priority: 'high',
          notification: {
            channelId: 'portal_alerts',
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            icon: APP_URL + 'icon-192.png',
            badge: APP_URL + 'icon-192.png',
            silent: false,
            requireInteraction: true,
          },
          fcmOptions: { link: data?.url || APP_URL },
        },
      });
      sent++;
    } catch (e) {
      failed++;
      if (
        e.code === 'messaging/invalid-registration-token' ||
        e.code === 'messaging/registration-token-not-registered'
      ) {
        const snap = await admin.database().ref(tokenPathPrefix).once('value');
        if (snap.exists()) {
          snap.forEach((child) => {
            if (child.val()?.token === token) removeBadToken(tokenPathPrefix, child.key);
          });
        }
      }
      console.warn('FCM send failed:', e.code || e.message);
    }
  }
  return { sent, failed };
}

async function notifyParents(cls, name, title, body, data) {
  const mids = await findParentMids(cls, name);
  let totalSent = 0;
  for (const mid of mids) {
    const path = `fcmTokens/parents/${mid}`;
    const tokens = await collectTokens(path);
    const r = await sendToTokens(tokens, { title, body }, data, path);
    totalSent += r.sent;
  }
  return totalSent;
}

async function notifyTeacher(teacherKey, title, body, data) {
  const path = `fcmTokens/teachers/${teacherKey}`;
  const tokens = await collectTokens(path);
  const r = await sendToTokens(tokens, { title, body }, data, path);
  return r.sent;
}

async function notifyAdmins(title, body, data) {
  const uids = new Set();
  const adminsSnap = await admin.database().ref('admins').once('value');
  if (adminsSnap.exists()) adminsSnap.forEach((c) => { if (c.val() === true) uids.add(c.key); });
  const lookupSnap = await admin.database().ref('teacherLookup').once('value');
  if (lookupSnap.exists()) lookupSnap.forEach((c) => { if (c.val()?.role === 'admin') uids.add(c.key); });

  let totalSent = 0;
  for (const uid of uids) {
    const path = `fcmTokens/admins/${uid}`;
    const tokens = await collectTokens(path);
    const r = await sendToTokens(tokens, { title, body }, data, path);
    totalSent += r.sent;
  }
  return totalSent;
}

function studentLabel(msg) {
  const name = msg?.name || msg?.studentName || '';
  const cls = msg?.cls ? `الصف ${msg.cls}` : '';
  return [name, cls].filter(Boolean).join(' — ');
}

exports.notifyParentOnTeacherMessage = region.database
  .ref('teacherData/{teacherKey}/messages/{msgId}')
  .onCreate(async (snap, ctx) => {
    const msg = snap.val() || {};
    const name = studentLabel(msg);
    const typeMap = { praise: '👏', warning: '⚠️', info: 'ℹ️' };
    const icon = typeMap[msg.type] || '💬';
    const body = name
      ? `${name}: ${(msg.body || 'رسالة جديدة من المعلم').slice(0, 120)}`
      : (msg.body || 'رسالة جديدة من المعلم');
    await notifyParents(msg.cls, msg.name, `${icon} رسالة من المعلم`, body, {
      type: 'teacher_message',
      teacherKey: ctx.params.teacherKey,
      cls: msg.cls || '',
      name: msg.name || '',
      url: APP_URL,
    });
  });

exports.notifyParentOnBehaviorNote = region.database
  .ref('teacherData/{teacherKey}/behaviorLog/{entryId}')
  .onCreate(async (snap, ctx) => {
    const entry = snap.val() || {};
    const name = studentLabel(entry);
    const parts = [];
    if (entry.violationLabel) parts.push(entry.violationLabel);
    if (entry.academic) parts.push(`أكاديمي: ${entry.academic}`);
    if (entry.conduct) parts.push(`سلوك: ${entry.conduct}`);
    const body = name
      ? `${name}: ${(parts.join(' · ') || 'ملاحظة جديدة').slice(0, 120)}`
      : (parts.join(' · ') || 'ملاحظة سلوكية/أكاديمية جديدة');
    await notifyParents(entry.cls, entry.name, '🧑‍🎓 ملاحظة جديدة', body, {
      type: 'behavior_note',
      teacherKey: ctx.params.teacherKey,
      cls: entry.cls || '',
      name: entry.name || '',
      url: APP_URL,
    });
  });

exports.notifyTeacherOnParentMessage = region.database
  .ref('teacherData/{teacherKey}/parentMessages/{msgId}')
  .onCreate(async (snap, ctx) => {
    const msg = snap.val() || {};
    const name = studentLabel(msg);
    const body = name
      ? `${name}: ${(msg.body || 'رسالة من ولي أمر').slice(0, 120)}`
      : (msg.body || 'رسالة جديدة من ولي أمر');
    await notifyTeacher(ctx.params.teacherKey, '💬 رسالة من ولي أمر', body, {
      type: 'parent_message',
      teacherKey: ctx.params.teacherKey,
      cls: msg.cls || '',
      name: msg.name || '',
      url: APP_URL,
    });
  });

exports.notifyAdminOnComplaint = region.database
  .ref('complaints/{complaintId}')
  .onCreate(async (snap) => {
    const c = snap.val() || {};
    const name = studentLabel(c);
    const body = name
      ? `${name}: ${(c.body || 'شكوى جديدة').slice(0, 120)}`
      : (c.body || 'شكوى جديدة من ولي أمر');
    await notifyAdmins('📢 شكوى جديدة', body, {
      type: 'complaint',
      complaintId: snap.key,
      teacherKey: c.teacherKey || '',
      url: APP_URL,
    });
  });

exports.notifyTeacherOnComplaintInbox = region.database
  .ref('teacherData/{teacherKey}/complaintInbox/{inboxId}')
  .onCreate(async (snap, ctx) => {
    const c = snap.val() || {};
    const student = c.studentName || c.name || 'طالب';
    const body = `${student}: ${(c.body || 'شكوى موجهة إليك').slice(0, 120)}`;
    await notifyTeacher(ctx.params.teacherKey, '📢 شكوى موجهة إليك', body, {
      type: 'complaint_inbox',
      teacherKey: ctx.params.teacherKey,
      url: APP_URL,
    });
  });

exports.notifyParentOnAdminReply = region.database
  .ref('parentAdminInbox/{mid}/{replyId}')
  .onCreate(async (snap, ctx) => {
    const msg = snap.val() || {};
    const mid = ctx.params.mid;
    const name = studentLabel(msg);
    const body = name
      ? `${name}: ${(msg.body || 'رد من إدارة المدرسة').slice(0, 120)}`
      : (msg.body || 'رد من إدارة المدرسة');
    const path = `fcmTokens/parents/${mid}`;
    const tokens = await collectTokens(path);
    await sendToTokens(tokens, {
      title: '📩 رد من الإدارة',
      body,
    }, {
      type: 'admin_reply',
      mid,
      cls: msg.cls || '',
      name: msg.studentName || msg.name || '',
      url: APP_URL,
    }, path);
  });
