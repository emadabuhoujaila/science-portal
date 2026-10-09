// Daily follow-up: the teacher's daily table, its overview, and the parent's daily view and weekly report.
// Records: teacherData/{teacherKey}/daily/{grade}{section}/{subject}/{mid}/{YYYY-MM-DD}
// Days off: teacherData/{teacherKey}/dailyOff/{YYYY-MM-DD}

const DF_ATT = [
  ['p', '✓', 'Present', 'حاضر', 'good'],
  ['a', '✗', 'Absent', 'غائب', 'bad'],
  ['l', '⏰', 'Late', 'متأخر', 'mid'],
];
const DF_HW = [
  ['done', '✓', 'Done', 'أنجزه', 'good'],
  ['part', '◐', 'Incomplete', 'ناقص', 'mid'],
  ['none', '✗', 'Not done', 'لم ينجزه', 'bad'],
];
const DF_TOOLS = [
  ['ok', '✓', 'Complete', 'مكتملة', 'good'],
  ['miss', '✗', 'Missing', 'ناقصة', 'bad'],
];
const DF_BEH = [
  { id: 'good', kind: 'ok', icon: '🙂', ar: 'ملتزم ومنضبط', en: 'Well-behaved' },
  { id: 'ex', kind: 'pos', icon: '🌟', ar: 'سلوك ممتاز', en: 'Excellent behaviour' },
  { id: 'star', kind: 'pos', icon: '🙋', ar: 'مشاركة متميزة', en: 'Excellent participation' },
  { id: 'help', kind: 'pos', icon: '🤝', ar: 'ساعد زملاءه', en: 'Helped his classmates' },
  { id: 'improve', kind: 'pos', icon: '📈', ar: 'تحسّن واضح', en: 'Clear improvement' },
  { id: 'lead', kind: 'pos', icon: '🧭', ar: 'مبادر وقيادي', en: 'Took the initiative' },
  { id: 'team', kind: 'pos', icon: '👥', ar: 'متعاون في العمل الجماعي', en: 'Good teamwork' },
  { id: 'tidy', kind: 'pos', icon: '📒', ar: 'دفتر وعمل منظم', en: 'Tidy, organised work' },
  { id: 'respect', kind: 'pos', icon: '🫡', ar: 'يحترم المعلم وزملاءه', en: 'Respectful' },
  { id: 'creative', kind: 'pos', icon: '💡', ar: 'إبداع وإنجاز إضافي', en: 'Creative / extra work' },
  { id: 'talk', kind: 'neg', icon: '🗣', ar: 'كثرة الكلام ومقاطعة الدرس', en: 'Talking / interrupting' },
  { id: 'focus', kind: 'neg', icon: '💭', ar: 'عدم الانتباه والشرود', en: 'Not paying attention' },
  { id: 'sleep', kind: 'neg', icon: '😴', ar: 'النوم في الحصة', en: 'Sleeping in class' },
  { id: 'phone', kind: 'neg', icon: '📵', ar: 'استخدام الهاتف', en: 'Using the phone' },
  { id: 'out', kind: 'neg', icon: '🚶', ar: 'الخروج دون إذن', en: 'Left without permission' },
  { id: 'instr', kind: 'neg', icon: '🚫', ar: 'عدم اتباع التعليمات', en: 'Not following instructions' },
  { id: 'noise', kind: 'neg', icon: '📢', ar: 'إثارة الفوضى', en: 'Disruptive' },
  { id: 'eat', kind: 'neg', icon: '🍫', ar: 'الأكل في الحصة', en: 'Eating in class' },
  { id: 'uniform', kind: 'neg', icon: '👕', ar: 'مخالفة الزي المدرسي', en: 'Uniform violation' },
  { id: 'disrespect', kind: 'severe', icon: '😠', ar: 'عدم احترام المعلم أو الزملاء', en: 'Disrespectful' },
  { id: 'fight', kind: 'severe', icon: '🥊', ar: 'شجار أو إيذاء زميل', en: 'Fighting / hurting a classmate' },
  { id: 'bully', kind: 'severe', icon: '⛔', ar: 'تنمّر', en: 'Bullying' },
  { id: 'damage', kind: 'severe', icon: '🔨', ar: 'إتلاف الممتلكات', en: 'Damaging property' },
  { id: 'cheat', kind: 'severe', icon: '🙈', ar: 'غش', en: 'Cheating' },
];
const DF_BEH_SCORE = { pos: 1, ok: 0.85, neg: 0.3, severe: 0 };
const DF_EXAMS = [
  ['diag', 'الاختبار التشخيصي', 'Diagnostic test', 'التشخيصي', 'Diagnostic'],
  ['f1', 'الاختبار التكويني الأول', 'Formative test 1', 'التكويني الأول', 'Formative 1'],
  ['f2', 'الاختبار التكويني الثاني', 'Formative test 2', 'التكويني الثاني', 'Formative 2'],
];
const DF_DAY_NAMES = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

// ── Helpers ──
function dfIsEn() { return typeof currentLang !== 'undefined' && currentLang === 'en'; }
function dfT(en, ar) { return dfIsEn() ? en : ar; }
function dfEsc(v) {
  if (typeof escapeHtml === 'function') return escapeHtml(v);
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dfSafeId(v) { return String(v ?? '').replace(/[^0-9A-Za-z_-]/g, ''); }
const dfPad = (n) => String(n).padStart(2, '0');
function dfIso(d) { return `${d.getFullYear()}-${dfPad(d.getMonth() + 1)}-${dfPad(d.getDate())}`; }
function dfParse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function dfAddDays(s, n) { const d = dfParse(s); d.setDate(d.getDate() + n); return dfIso(d); }
function dfToday() { return dfIso(new Date()); }
function dfWeekStart(s) { return dfAddDays(s, -((dfParse(s).getDay() + 6) % 7)); }
function dfWeekDays(start) { return [0, 1, 2, 3, 4].map((i) => dfAddDays(start, i)); }
function dfIsWeekend(s) { return [0, 6].includes(dfParse(s).getDay()); }
function dfDayName(s) { return DF_DAY_NAMES[dfIsEn() ? 'en' : 'ar'][dfParse(s).getDay()]; }
function dfShortDate(s) { const d = dfParse(s); return `${d.getDate()}/${d.getMonth() + 1}`; }
function dfWeekLabel(start) {
  const end = dfAddDays(start, 4);
  return `${dfShortDate(start)} – ${dfShortDate(end)}/${dfParse(end).getFullYear()}`;
}
function dfDefaultDay() { const now = dfToday(); return dfIsWeekend(now) ? dfAddDays(dfWeekStart(now), 4) : now; }
// The weekly report of a Monday–Friday week is released on its Friday at 12:00 noon.
function dfReportReady(start, now = new Date()) {
  const fri = dfParse(dfAddDays(start, 4));
  fri.setHours(12, 0, 0, 0);
  return now >= fri;
}
function dfItem(list, v) { return list.find((x) => x[0] === v) || null; }
function dfItemText(it) { return it ? `${it[1]} ${dfIsEn() ? it[2] : it[3]}` : '—'; }
function dfBeh(id) { return DF_BEH.find((b) => b.id === id) || null; }
function dfBehLabel(b) { return b ? (dfIsEn() ? b.en : b.ar) : ''; }
function dfBehText(b) { return b ? `${b.icon} ${dfBehLabel(b)}` : '—'; }
function dfBehTone(b) { return !b ? '' : (b.kind === 'pos' || b.kind === 'ok') ? 'good' : 'bad'; }
function dfExamName(e, short) { return dfIsEn() ? (short ? e[4] : e[2]) : (short ? e[3] : e[1]); }
function dfNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function dfFmtNum(n) { return n == null ? '—' : String(Math.round(n * 10) / 10); }
function dfPctText(v) { return v == null ? '—' : v + '%'; }
function dfTone(p) { return p == null ? '' : p >= 80 ? 'good' : p >= 65 ? 'mid' : 'bad'; }
function dfBand(p) {
  if (p == null) return '';
  return p >= 90 ? dfT('Excellent', 'ممتاز') : p >= 80 ? dfT('Very good', 'جيد جدًا') : p >= 65 ? dfT('Good', 'جيد') : dfT('Needs follow-up', 'يحتاج متابعة');
}
function dfSubjectLabel(key) {
  const s = typeof SUBJECTS !== 'undefined' ? SUBJECTS[key] : null;
  return s ? ((dfIsEn() ? s.en : s.ar) || s.ar || key) : key;
}
// Summary of one student's records over a list of school days (a missing record counts as present).
function dfSummarize(recs, days) {
  const out = { days: 0, absent: 0, late: 0, hw: { done: 0, part: 0, none: 0 }, tools: { ok: 0, miss: 0 }, stars: [], beh: [], pos: {}, neg: {}, posCount: 0, negCount: 0, notes: [], exams: {}, daily: [] };
  let hwSum = 0;
  let hwN = 0;
  (days || []).forEach((d) => {
    const r = recs?.[d] || {};
    const att = r.att || 'p';
    out.days++;
    out.daily.push({ date: d, ...r, att });
    if (att === 'a') out.absent++;
    if (att === 'l') out.late++;
    if (att !== 'a') {
      if (r.hw && out.hw[r.hw] != null) {
        out.hw[r.hw]++;
        hwSum += r.hw === 'done' ? 1 : r.hw === 'part' ? 0.5 : 0;
        hwN++;
      }
      if (r.tools && out.tools[r.tools] != null) out.tools[r.tools]++;
      if (r.part > 0) out.stars.push(Number(r.part));
      const b = dfBeh(r.beh);
      if (b) {
        out.beh.push(DF_BEH_SCORE[b.kind] ?? 0.85);
        const label = dfBehLabel(b);
        if (b.kind === 'pos') { out.pos[label] = (out.pos[label] || 0) + 1; out.posCount++; }
        if (b.kind === 'neg' || b.kind === 'severe') { out.neg[label] = (out.neg[label] || 0) + 1; out.negCount++; }
      }
    }
    DF_EXAMS.forEach(([k]) => { const n = dfNum(r[k]); if (n != null) out.exams[k] = { v: n, date: d }; });
    if (String(r.note || '').trim()) out.notes.push({ date: d, text: String(r.note).trim() });
  });
  const pct = (s, n) => (n ? Math.round((s / n) * 100) : null);
  const n = out.days;
  out.attendance = n ? Math.round(((n - out.absent - 0.5 * out.late) / n) * 100) : null;
  out.homework = pct(hwSum, hwN);
  out.toolsPct = pct(out.tools.ok, out.tools.ok + out.tools.miss);
  out.participation = out.stars.length ? Math.round((out.stars.reduce((a, v) => a + v, 0) / out.stars.length / 3) * 100) : null;
  out.behaviour = out.beh.length ? Math.round((out.beh.reduce((a, v) => a + v, 0) / out.beh.length) * 100) : null;
  const parts = [[out.attendance, 0.25], [out.homework, 0.25], [out.toolsPct, 0.1], [out.participation, 0.2], [out.behaviour, 0.2]].filter(([v]) => v != null);
  const w = parts.reduce((a, [, x]) => a + x, 0);
  out.overall = n && w ? Math.max(0, Math.min(100, Math.round(parts.reduce((a, [v, x]) => a + v * x, 0) / w))) : null;
  return out;
}

function dfLatestExams(recs) {
  const out = {};
  Object.keys(recs || {}).sort().forEach((d) => {
    DF_EXAMS.forEach(([k]) => { const n = dfNum(recs[d]?.[k]); if (n != null) out[k] = { v: n, date: d }; });
  });
  return out;
}

function dfCellChip(it, flash) {
  if (!it) return '<span class="df-chip">—</span>';
  return `<span class="df-chip t-${it[4]}${flash && it[4] === 'bad' ? ' df-flash-bad' : ''}">${dfItemText(it)}</span>`;
}
function dfBehChip(b, flash) {
  if (!b) return '<span class="df-chip">—</span>';
  const tone = dfBehTone(b);
  return `<span class="df-chip df-beh-${tone}${flash ? ' df-flash-' + tone : ''}">${dfBehText(b)}</span>`;
}
function dfStarsText(n) {
  const v = Number(n) || 0;
  return v ? '★'.repeat(v) + '<span class="df-star-off">' + '★'.repeat(3 - v) + '</span>' : '—';
}

// Weekly report body (shared by the teacher's preview and the parent's view).
function dfReportHtml(o) {
  const w = o.w;
  const en = dfIsEn();
  if (!w || !w.days) return `<p class="df-muted">${dfT('Nothing was recorded this week.', 'لم يُسجَّل شيء في هذا الأسبوع.')}</p>`;
  const first = String(o.name || '').trim().split(/\s+/)[0] || dfT('Your child', 'ابنكم');
  const present = w.days - w.absent;
  const intro = en
    ? `${first} attended ${present} of ${w.days} school day(s)${w.late ? ` and was late ${w.late} time(s)` : ''}.`
    : `أيام حضور ${first}: ${present} من ${w.days}${w.late ? ` · مرات التأخر: ${w.late}` : ''}.`;
  const good = [];
  const improve = [];
  const tips = [];
  if (w.absent === 0) good.push(dfT('Full attendance', 'انتظام كامل في الحضور'));
  else {
    improve.push(dfT(`Absent ${w.absent} day(s)`, `أيام الغياب: ${w.absent}`));
    tips.push(dfT('Make sure he attends every day and catches up on what he missed.', 'الحرص على الحضور اليومي ومتابعة ما فاته من دروس.'));
  }
  if (w.homework != null) {
    if (w.homework >= 80) good.push(dfT('Does his homework regularly', 'الالتزام بحل الواجبات'));
    else if (w.homework < 65) {
      improve.push(dfT('Homework', 'حل الواجبات'));
      tips.push(dfT('Check his homework with him every evening.', 'متابعة الواجبات معه كل مساء.'));
    }
  }
  if (w.toolsPct != null) {
    if (w.toolsPct >= 90) good.push(dfT('Brings his books and tools', 'إحضار الكتب والأدوات'));
    else if (w.toolsPct < 80) {
      improve.push(dfT('Bringing his books and tools', 'إحضار الكتب والأدوات'));
      tips.push(dfT('Prepare the school bag with him the night before.', 'تجهيز الحقيبة معه في الليلة السابقة.'));
    }
  }
  if (w.participation != null) {
    if (w.participation >= 70) good.push(dfT('Active participation', 'المشاركة الفاعلة في الحصة'));
    else if (w.participation < 40) {
      improve.push(dfT('Participation in class', 'المشاركة في الحصة'));
      tips.push(dfT('Encourage him to ask and answer questions in class.', 'تشجيعه على السؤال والمشاركة في الحصة.'));
    }
  }
  Object.entries(w.pos).forEach(([l, c]) => good.push(c > 1 ? `${l} (${c})` : l));
  Object.entries(w.neg).forEach(([l, c]) => improve.push(c > 1 ? `${l} (${c})` : l));
  if (w.negCount) tips.push(dfT('Talk with him about his behaviour in class and praise every improvement.', 'الحوار معه حول سلوكه في الحصة وتعزيز أي تحسّن.'));
  if (!tips.length) tips.push(dfT('Keep encouraging him — he is doing well.', 'الاستمرار في تشجيعه، فأداؤه جيد.'));
  const list = (arr, cls) => `<ul class="df-rep-list ${cls}">${arr.map((x) => `<li>${dfEsc(x)}</li>`).join('')}</ul>`;
  const exams = DF_EXAMS.filter(([k]) => w.exams[k]).map((e) => `<span class="df-chip df-exam-chip">${dfEsc(dfExamName(e))}: <b>${dfFmtNum(w.exams[e[0]].v)}</b></span>`).join(' ');
  const notes = w.notes.map((n) => `<li><b>${dfDayName(n.date)} ${dfShortDate(n.date)}:</b> ${dfEsc(n.text)}</li>`).join('');
  const bars = [
    [dfT('Attendance', 'الحضور'), w.attendance],
    [dfT('Homework', 'الواجب'), w.homework],
    [dfT('Books & tools', 'الأدوات والكتاب'), w.toolsPct],
    [dfT('Participation', 'المشاركة'), w.participation],
    [dfT('Behaviour', 'السلوك'), w.behaviour],
  ].filter(([, v]) => v != null).map(([l, v]) => `<div class="df-bar"><span>${l}</span><div class="df-bar-track"><div class="df-bar-fill t-bg-${dfTone(v)}" style="width:${v}%"></div></div><b>${v}%</b></div>`).join('');
  return `<div class="df-report">
    <div class="df-rep-head">
      <div>${o.subjLabel ? `<b>📚 ${dfEsc(o.subjLabel)}</b>` : ''}${o.teacherName ? ` <span class="df-muted">· ${dfEsc(o.teacherName)}</span>` : ''}</div>
      ${w.overall != null ? `<span class="df-level t-${dfTone(w.overall)}">${dfT('Overall level', 'المستوى العام')}: <b>${w.overall}%</b> · ${dfBand(w.overall)}</span>` : ''}
    </div>
    <p class="df-rep-intro">${dfEsc(intro)}</p>
    ${bars ? `<div class="df-bars">${bars}</div>` : ''}
    <div class="df-rep-grid">
      ${good.length ? `<div><h5>🌟 ${dfT('What went well', 'ما تميّز به هذا الأسبوع')}</h5>${list(good, 'good')}</div>` : ''}
      ${improve.length ? `<div><h5>⚠️ ${dfT('What needs work', 'ما يحتاج إلى تحسين')}</h5>${list(improve, 'bad')}</div>` : ''}
      <div><h5>🏠 ${dfT('How you can help at home', 'كيف تساعدونه في المنزل')}</h5>${list(tips, '')}</div>
    </div>
    ${exams ? `<div class="df-rep-exams"><h5>📝 ${dfT('Tests this week', 'اختبارات هذا الأسبوع')}</h5>${exams}</div>` : ''}
    ${notes ? `<div class="df-rep-notes"><h5>🗒 ${dfT("Teacher's notes", 'ملاحظات المعلم')}</h5><ul class="df-rep-list">${notes}</ul></div>` : ''}
  </div>`;
}

function dfOpenModal(title, html) {
  let ov = document.getElementById('df-modal');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'df-modal';
    ov.className = 'modal-overlay';
    ov.addEventListener('click', (e) => { if (e.target === ov) dfCloseModal(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<div class="modal-box df-modal-box">
    <div class="df-modal-head"><h3>${dfEsc(title)}</h3><button type="button" class="df-btn ghost" onclick="dfCloseModal()">✕</button></div>
    ${html}
  </div>`;
  ov.classList.add('open');
}
function dfCloseModal() { document.getElementById('df-modal')?.classList.remove('open'); }

// ══════════════════════════════════════════════════
//  TEACHER — DAILY TABLE
// ══════════════════════════════════════════════════
const DF = { key: '', loaded: false, data: {}, off: {}, active: '', day: '', ovClass: '', ovPeriod: 'week' };

function dfTeacherKey() {
  if (typeof getTeacherKey === 'function') { try { const k = getTeacherKey(); if (k) return k; } catch (e) { /* fall through */ } }
  return (typeof CURRENT_TEACHER !== 'undefined' && CURRENT_TEACHER?._key) || '';
}

// The teacher's classes: one entry per subject, grade and section from the admin assignments.
function dfTeacherClasses() {
  const tc = typeof CURRENT_TEACHER !== 'undefined' ? CURRENT_TEACHER : null;
  if (!tc) return [];
  const rows = [];
  const add = (subj, grade, section) => {
    if (!subj || !grade || !section) return;
    const id = `${subj}|${grade}|${section}`;
    if (!rows.some((r) => r.id === id)) rows.push({ id, subj, grade: String(grade), section: String(section), bucket: String(grade) + String(section) });
  };
  if (tc.subjectMap && Object.keys(tc.subjectMap).length) {
    Object.entries(tc.subjectMap).forEach(([subj, grades]) => {
      Object.entries(grades || {}).forEach(([g, secs]) => (Array.isArray(secs) ? secs : Object.values(secs || {})).forEach((s) => add(subj, g, s)));
    });
  } else {
    const subj = tc.subject || 'general';
    (tc.grades || []).forEach((g) => {
      const secs = tc.gradeMap?.[g] || tc.sections || [];
      secs.forEach((s) => add(subj, g, s));
    });
  }
  const gradeOrder = (g) => Number(g) || 0;
  const secSort = typeof sortSectionKeys === 'function' ? (a, b) => { const o = sortSectionKeys([a, b]); return o[0] === a ? -1 : 1; } : (a, b) => a.localeCompare(b);
  rows.sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade) || (a.section === b.section ? 0 : secSort(a.section, b.section)) || a.subj.localeCompare(b.subj));
  const multiSubj = new Set(rows.map((r) => r.subj)).size > 1;
  rows.forEach((r) => { r.multiSubj = multiSubj; });
  return rows;
}
function dfClassLabel(c, withSubj) {
  const sec = typeof formatSectionLabel === 'function' ? formatSectionLabel(c.section, dfIsEn()) : c.section;
  const base = `${c.grade} - ${sec}`;
  return withSubj ?? c.multiSubj ? `${base} · ${dfSubjectLabel(c.subj)}` : base;
}
function dfClassStudents(c) {
  const list = typeof getGradeStudents === 'function' ? getGradeStudents(c.grade, c.section) : [];
  return list
    .filter((s) => s && s.mid)
    .map((s) => ({ ...s, mid: String(s.mid) }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
}
function dfStudentRecs(c, mid) { return DF.data?.[c.bucket]?.[c.subj]?.[mid] || {}; }
function dfRec(c, mid, date) { return dfStudentRecs(c, mid)[date] || null; }
function dfActiveClass() {
  const list = dfTeacherClasses();
  return list.find((c) => c.id === DF.active) || list[0] || null;
}
// Days of a list on which the class was followed up (at least one record), without days off.
function dfTakenDays(c, students, days) {
  return days.filter((d) => !DF.off[d] && students.some((s) => dfRec(c, s.mid, d)));
}
function dfAllTakenDays(c, students) {
  const set = new Set();
  students.forEach((s) => Object.keys(dfStudentRecs(c, s.mid)).forEach((d) => { if (!DF.off[d]) set.add(d); }));
  return [...set].sort();
}

async function dfLoad(key, force) {
  key = key || dfTeacherKey();
  if (!key || typeof db === 'undefined') return;
  if (DF.loaded && DF.key === key && !force) return;
  const [dSnap, oSnap] = await Promise.all([
    db.ref('teacherData/' + key + '/daily').once('value'),
    db.ref('teacherData/' + key + '/dailyOff').once('value'),
  ]);
  DF.key = key;
  DF.data = dSnap.val() || {};
  DF.off = oSnap.val() || {};
  DF.loaded = true;
  try { DF.active = localStorage.getItem('df_active_' + key) || DF.active; } catch (e) { /* ignore */ }
}
function dfReset() { Object.assign(DF, { key: '', loaded: false, data: {}, off: {}, active: '', day: '', ovClass: '' }); }

function dfWrite(c, mid, date, rec) {
  const b = (DF.data[c.bucket] ||= {});
  const s = (b[c.subj] ||= {});
  const m = (s[mid] ||= {});
  m[date] = rec;
  if (typeof db === 'undefined' || !DF.key) return Promise.resolve();
  return db.ref(`teacherData/${DF.key}/daily/${c.bucket}/${c.subj}/${mid}/${date}`).set(rec).catch((e) => {
    console.warn('dfWrite', e);
    if (typeof showToast === 'function') showToast(dfT('❌ Could not save — check the connection', '❌ تعذّر الحفظ — تحقّق من الاتصال'));
  });
}
function dfPatch(mid, patch) {
  const c = dfActiveClass();
  if (!c) return;
  const day = DF.day;
  const cur = dfRec(c, mid, day) || { att: 'p' };
  const rec = { att: 'p', ...cur, ...patch, ts: new Date().toISOString() };
  Object.keys(rec).forEach((k) => { if (rec[k] === '' || rec[k] == null) delete rec[k]; });
  dfWrite(c, mid, day, rec);
  dfRenderRow(c, mid);
  dfRenderWeekBar();
}

function dfNextValue(list, v, allowEmpty) {
  const keys = list.map((x) => x[0]);
  const i = keys.indexOf(v);
  if (i === keys.length - 1) return allowEmpty ? '' : keys[0];
  return keys[i + 1];
}
function dfCycle(mid, field) {
  const c = dfActiveClass();
  if (!c) return;
  const r = dfRec(c, mid, DF.day) || { att: 'p' };
  const list = field === 'att' ? DF_ATT : field === 'hw' ? DF_HW : DF_TOOLS;
  if (field === 'att' && !dfRec(c, mid, DF.day)) return dfPatch(mid, { att: 'a' });
  dfPatch(mid, { [field]: dfNextValue(list, r[field] || '', field !== 'att') });
}
function dfStar(mid, n) {
  const c = dfActiveClass();
  const r = c ? dfRec(c, mid, DF.day) : null;
  dfPatch(mid, { part: r?.part === n ? 0 : n });
}
function dfSetBeh(mid, v) { dfPatch(mid, { beh: v }); }
function dfSetExam(mid, field, v) {
  const n = dfNum(v);
  if (v !== '' && (n == null || n < 0 || n > 1000)) {
    if (typeof showToast === 'function') showToast(dfT('⚠️ Enter a valid score', '⚠️ أدخل درجة صحيحة'));
    return dfRenderRow(dfActiveClass(), mid);
  }
  dfPatch(mid, { [field]: n });
}
function dfSetNote(mid, v) { dfPatch(mid, { note: String(v || '').trim().slice(0, 500) }); }

function dfSetAll(field, value) {
  const c = dfActiveClass();
  if (!c || DF.off[DF.day]) return;
  const students = dfClassStudents(c);
  const ts = new Date().toISOString();
  const updates = {};
  students.forEach((s) => {
    const cur = dfRec(c, s.mid, DF.day) || { att: 'p' };
    if (field !== 'att' && cur.att === 'a') return;
    const rec = { att: 'p', ...cur, [field]: value, ts };
    const m = ((DF.data[c.bucket] ||= {})[c.subj] ||= {});
    (m[s.mid] ||= {})[DF.day] = rec;
    updates[`${c.bucket}/${c.subj}/${s.mid}/${DF.day}`] = rec;
  });
  if (typeof db !== 'undefined' && DF.key && Object.keys(updates).length) {
    db.ref(`teacherData/${DF.key}/daily`).update(updates).catch((e) => {
      console.warn('dfSetAll', e);
      if (typeof showToast === 'function') showToast(dfT('❌ Could not save — check the connection', '❌ تعذّر الحفظ — تحقّق من الاتصال'));
    });
  }
  dfRenderDaily();
}

function dfSetClass(id) {
  DF.active = id;
  try { localStorage.setItem('df_active_' + DF.key, id); } catch (e) { /* ignore */ }
  dfRenderDaily();
}
function dfSetDay(d) { DF.day = d; dfRenderDaily(); }
function dfGoWeek(delta) { DF.day = dfAddDays(DF.day || dfDefaultDay(), delta * 7); dfRenderDaily(); }
function dfThisWeek() { DF.day = dfDefaultDay(); dfRenderDaily(); }
function dfToggleOff() {
  const d = DF.day;
  const off = !DF.off[d];
  if (off) DF.off[d] = true; else delete DF.off[d];
  if (typeof db !== 'undefined' && DF.key) db.ref(`teacherData/${DF.key}/dailyOff/${d}`).set(off ? true : null).catch((e) => console.warn('dfToggleOff', e));
  dfRenderDaily();
}

function dfCycleBtn(list, value, mid, field, disabled, placeholder) {
  const it = dfItem(list, value);
  const shown = it || placeholder;
  const cls = it ? `t-${it[4]}` : placeholder ? 'faded' : 'empty';
  return `<button type="button" class="df-dv ${cls}" ${disabled ? 'disabled' : ''} onclick="dfCycle('${mid}','${field}')">${shown ? dfItemText(shown) : '—'}</button>`;
}
function dfBehSelect(mid, value, disabled) {
  const b = dfBeh(value);
  const opt = (x) => `<option value="${x.id}" ${x.id === value ? 'selected' : ''}>${x.icon} ${dfEsc(dfBehLabel(x))}</option>`;
  const tone = dfBehTone(b);
  return `<select class="df-beh ${tone ? 'df-beh-' + tone : ''}${b && b.kind !== 'ok' ? ' df-flash-' + tone : ''}" ${disabled ? 'disabled' : ''} onchange="dfSetBeh('${mid}',this.value)">
    <option value="">—</option>
    <optgroup label="${dfT('Positive', 'سلوك إيجابي')}">${DF_BEH.filter((x) => x.kind === 'ok' || x.kind === 'pos').map(opt).join('')}</optgroup>
    <optgroup label="${dfT('Negative', 'سلوك سلبي')}">${DF_BEH.filter((x) => x.kind === 'neg').map(opt).join('')}</optgroup>
    <optgroup label="${dfT('Serious', 'سلوك غير مقبول')}">${DF_BEH.filter((x) => x.kind === 'severe').map(opt).join('')}</optgroup>
  </select>`;
}
function dfRowHtml(c, s, i) {
  const mid = dfSafeId(s.mid);
  const rec = dfRec(c, s.mid, DF.day);
  const r = { att: 'p', ...(rec || {}) };
  const absent = r.att === 'a';
  const name = typeof displayStudentName === 'function' ? displayStudentName(s, c.grade, c.section, s.mid) : s.name;
  const exam = (k) => `<td><input type="number" inputmode="decimal" min="0" step="0.5" class="df-exam" value="${r[k] ?? ''}" ${absent ? 'disabled' : ''} onchange="dfSetExam('${mid}','${k}',this.value)"></td>`;
  return `<tr id="df-row-${mid}" class="${absent ? 'df-absent' : ''}">
    <td class="df-muted">${i + 1}</td>
    <td class="df-name">${dfEsc(name)}</td>
    <td>${dfCycleBtn(DF_ATT, rec ? r.att : '', mid, 'att', false, DF_ATT[0])}</td>
    <td>${dfCycleBtn(DF_HW, r.hw, mid, 'hw', absent)}</td>
    <td>${dfCycleBtn(DF_TOOLS, r.tools, mid, 'tools', absent)}</td>
    <td class="df-stars">${[1, 2, 3].map((n) => `<button type="button" class="df-star ${(r.part || 0) >= n ? 'on' : ''}" ${absent ? 'disabled' : ''} onclick="dfStar('${mid}',${n})">★</button>`).join('')}</td>
    <td>${dfBehSelect(mid, r.beh || '', absent)}</td>
    ${DF_EXAMS.map(([k]) => exam(k)).join('')}
    <td><input type="text" class="df-note" dir="auto" maxlength="500" value="${dfEsc(r.note || '')}" onchange="dfSetNote('${mid}',this.value)"></td>
  </tr>`;
}
function dfRenderRow(c, mid) {
  if (!c) return;
  const tr = document.getElementById('df-row-' + dfSafeId(mid));
  if (!tr) return;
  const students = dfClassStudents(c);
  const i = students.findIndex((s) => s.mid === String(mid));
  if (i < 0) return;
  tr.outerHTML = dfRowHtml(c, students[i], i);
}
// Day tabs (the green dot shows the days already followed up).
function dfDayTabsHtml(c, students) {
  const now = dfToday();
  const days = dfWeekDays(dfWeekStart(DF.day));
  const taken = dfTakenDays(c, students, days);
  return days.map((d) => `<button type="button" class="df-tab ${d === DF.day ? 'active' : ''} ${d === now ? 'today' : ''}" onclick="dfSetDay('${d}')">
      <b>${dfDayName(d)}</b> <span class="df-small">${dfShortDate(d)}</span>
      ${DF.off[d] ? `<span class="df-small df-muted"> · ${dfT('off', 'عطلة')}</span>` : taken.includes(d) ? '<span class="df-ok-dot">●</span>' : ''}
    </button>`).join('');
}
function dfRenderWeekBar() {
  const c = dfActiveClass();
  const el = document.getElementById('df-day-tabs');
  if (c && el) el.innerHTML = dfDayTabsHtml(c, dfClassStudents(c));
  const sum = document.getElementById('df-week-summary');
  if (c && sum) sum.innerHTML = dfWeekSummaryHtml(c, dfClassStudents(c));
}

function dfWeekSummaryHtml(c, students) {
  const start = dfWeekStart(DF.day);
  const taken = dfTakenDays(c, students, dfWeekDays(start));
  const ready = dfReportReady(start);
  const head = `<div class="df-row-between"><h3>${dfT('Week summary', 'ملخص الأسبوع')} — ${dfWeekLabel(start)}</h3>
    <span class="df-small df-muted">${dfT(`${taken.length} day(s) followed up`, `أيام المتابعة: ${taken.length}`)}</span></div>
    <p class="df-hint">${ready
      ? dfT('✅ The weekly report of this week has been released to the parents.', '✅ صدر التقرير الأسبوعي لهذا الأسبوع وأصبح متاحًا لأولياء الأمور.')
      : dfT('📝 The weekly report is released to the parents automatically on Friday at 12:00 noon. Use 👁 to preview it.', '📝 يصدر التقرير الأسبوعي لولي الأمر تلقائيًا يوم الجمعة الساعة 12 ظهرًا. اضغط 👁 لمعاينته.')}</p>`;
  if (!taken.length) return head + `<p class="df-hint">${dfT('Nothing recorded for this class in this week yet.', 'لم يُسجَّل شيء لهذه الشعبة في هذا الأسبوع بعد.')}</p>`;
  const rows = students.map((s) => {
    const w = dfSummarize(dfStudentRecs(c, s.mid), taken);
    const name = typeof displayStudentName === 'function' ? displayStudentName(s, c.grade, c.section, s.mid) : s.name;
    return `<tr>
      <td class="df-name">${dfEsc(name)}</td>
      <td class="${w.absent ? 't-bad' : ''}">${w.absent}</td>
      <td class="${w.late ? 't-mid' : ''}">${w.late}</td>
      <td class="t-${dfTone(w.homework)}">${dfPctText(w.homework)}</td>
      <td class="t-${dfTone(w.toolsPct)}">${dfPctText(w.toolsPct)}</td>
      <td class="t-${dfTone(w.participation)}">${dfPctText(w.participation)}</td>
      <td class="t-${dfTone(w.behaviour)}">${dfPctText(w.behaviour)}</td>
      <td class="t-good">${w.posCount || ''}</td>
      <td class="t-bad">${w.negCount || ''}</td>
      <td class="t-${dfTone(w.overall)}"><b>${dfPctText(w.overall)}</b> <span class="df-small">${dfBand(w.overall)}</span></td>
      <td><button type="button" class="df-link" title="${dfT('Preview the report', 'معاينة التقرير')}" onclick="dfShowReport('${dfSafeId(s.mid)}')">👁</button></td>
    </tr>`;
  }).join('');
  return head + `<div class="table-wrap"><table class="df-table df-summary">
    <thead><tr>
      <th class="df-name">${dfT('Student', 'الطالب')}</th><th>${dfT('Absent', 'غياب')}</th><th>${dfT('Late', 'تأخر')}</th>
      <th>${dfT('Homework', 'الواجبات')}</th><th>${dfT('Tools', 'الأدوات')}</th><th>${dfT('Participation', 'المشاركة')}</th>
      <th>${dfT('Behaviour', 'السلوك')}</th><th>👍</th><th>👎</th><th>${dfT('Overall', 'التقييم العام')}</th><th>${dfT('Report', 'التقرير')}</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}
function dfShowReport(mid) {
  const c = dfActiveClass();
  if (!c) return;
  const s = dfClassStudents(c).find((x) => dfSafeId(x.mid) === mid);
  if (!s) return;
  const start = dfWeekStart(DF.day);
  const taken = dfTakenDays(c, dfClassStudents(c), dfWeekDays(start));
  const name = typeof displayStudentName === 'function' ? displayStudentName(s, c.grade, c.section, s.mid) : s.name;
  dfOpenModal(`${dfT('Weekly report', 'التقرير الأسبوعي')} — ${name} — ${dfWeekLabel(start)}`, dfReportHtml({ name, subjLabel: dfSubjectLabel(c.subj), w: dfSummarize(dfStudentRecs(c, s.mid), taken) }));
}

function dfRenderDaily() {
  const root = document.getElementById('df-root');
  if (!root) return;
  const btn = document.getElementById('ttab-daily');
  if (btn) btn.textContent = dfT('📅 Daily follow-up', '📅 المتابعة اليومية');
  if (!DF.day) DF.day = dfDefaultDay();
  const classes = dfTeacherClasses();
  if (!classes.length) {
    root.innerHTML = `<div class="card df-card"><h3>📅 ${dfT('Daily follow-up', 'المتابعة اليومية')}</h3>
      <p class="df-hint">${dfT('No classes are assigned to you yet. Ask the school admin to add your assignments (subject, grade and sections) in the «Data input» tab.', 'لم تُسنَد إليك صفوف بعد. اطلب من مسؤول المدرسة إضافة تكليفاتك (المادة والصف والشعب) من تبويب «الإدخال».')}</p></div>`;
    return;
  }
  if (!DF.loaded) {
    root.innerHTML = `<div class="card df-card" style="text-align:center;color:var(--grey-3)">⏳ ${dfT('Loading…', 'جارٍ التحميل…')}</div>`;
    dfLoad().then(() => { if (DF.loaded) dfRenderDaily(); }).catch((e) => console.warn('dfLoad', e));
    return;
  }
  const c = classes.find((x) => x.id === DF.active) || classes[0];
  DF.active = c.id;
  const students = dfClassStudents(c);
  const start = dfWeekStart(DF.day);
  const off = !!DF.off[DF.day];
  const thisWeek = dfWeekStart(dfToday());

  const classTabs = classes.map((x) => `<button type="button" class="df-tab ${x.id === c.id ? 'active' : ''}" onclick="dfSetClass('${dfEsc(x.id)}')">
      ${dfEsc(dfClassLabel(x))} <span class="df-small df-muted">(${dfClassStudents(x).length})</span></button>`).join('');

  const table = !students.length
    ? `<p class="df-hint">${dfT('No students in this class yet. The school admin uploads the student lists in the «Data input» tab.', 'لا يوجد طلاب في هذه الشعبة بعد. يرفع مسؤول المدرسة قوائم الطلبة من تبويب «الإدخال».')}</p>`
    : off
      ? `<p class="df-hint">${dfT('This day is a day off: it is not counted in the weekly report.', 'هذا اليوم عطلة: لا يُحسب في التقرير الأسبوعي.')}</p>`
      : `<div class="table-wrap"><table class="df-table">
        <thead><tr>
          <th>#</th>
          <th class="df-name">${dfT('Student', 'الطالب')}</th>
          <th>${dfT('Attendance', 'الحضور')}<button type="button" class="df-all" onclick="dfSetAll('att','p')">${dfT('all present', 'الكل حاضر')}</button></th>
          <th>${dfT('Homework', 'الواجب')}<button type="button" class="df-all" onclick="dfSetAll('hw','done')">${dfT('all done', 'الكل أنجز')}</button></th>
          <th>${dfT('Books & tools', 'الأدوات والكتاب')}<button type="button" class="df-all" onclick="dfSetAll('tools','ok')">${dfT('all complete', 'الكل مكتمل')}</button></th>
          <th>${dfT('Participation', 'المشاركة')}</th>
          <th>${dfT('Behaviour', 'السلوك')}<button type="button" class="df-all" onclick="dfSetAll('beh','good')">${dfT('all well-behaved', 'الكل ملتزم')}</button></th>
          ${DF_EXAMS.map((e) => `<th class="df-exam-th">${dfEsc(dfExamName(e))}</th>`).join('')}
          <th>${dfT('Note', 'ملاحظة')}</th>
        </tr></thead>
        <tbody>${students.map((s, i) => dfRowHtml(c, s, i)).join('')}</tbody>
      </table></div>`;

  root.innerHTML = `
    <div class="card df-card">
      <div class="df-row-between">
        <h3>📅 ${dfT('Daily follow-up', 'المتابعة اليومية')}</h3>
        <span class="df-small df-muted">${dfT('Saved automatically · the parents see it right away', 'يُحفظ تلقائيًا · يطّلع عليه ولي الأمر فورًا')}</span>
      </div>
      <div class="df-tabs">${classTabs}</div>
      <div class="df-row-between df-week-nav">
        <button type="button" class="df-btn ghost" onclick="dfGoWeek(-1)">${dfT('◀ Previous week', '▶ الأسبوع السابق')}</button>
        <b>${dfT('Week', 'الأسبوع')} ${dfWeekLabel(start)}</b>
        <span class="df-row-gap">
          ${start !== thisWeek ? `<button type="button" class="df-btn ghost" onclick="dfThisWeek()">${dfT('This week', 'هذا الأسبوع')}</button>` : ''}
          <button type="button" class="df-btn ghost" onclick="dfGoWeek(1)">${dfT('Next week ▶', 'الأسبوع التالي ◀')}</button>
        </span>
      </div>
      <div class="df-tabs df-day-tabs" id="df-day-tabs">${dfDayTabsHtml(c, students)}</div>
    </div>
    <div class="card df-card">
      <div class="df-row-between">
        <h3>${dfDayName(DF.day)} ${dfShortDate(DF.day)} — ${dfEsc(dfClassLabel(c, true))}</h3>
        <button type="button" class="df-btn ghost" onclick="dfToggleOff()">${off ? dfT('↺ Not a day off', '↺ إلغاء العطلة') : dfT('🏖 Mark as a day off', '🏖 تحديد اليوم عطلة')}</button>
      </div>
      ${table}
    </div>
    <div class="card df-card" id="df-week-summary">${dfWeekSummaryHtml(c, students)}</div>`;
}

// ══════════════════════════════════════════════════
//  TEACHER — OVERVIEW (linked to the daily table)
// ══════════════════════════════════════════════════
function dfOvSet(field, v) { DF[field] = v; dfRenderOverview(); }
function dfOpenDaily(classId) {
  if (classId) DF.active = classId;
  const btn = document.getElementById('ttab-daily');
  if (typeof showTab === 'function') showTab('daily', btn);
}

function dfRenderOverview() {
  const root = document.getElementById('df-overview');
  if (!root) return;
  const btn = document.getElementById('ttab-overview');
  if (btn) btn.textContent = dfT('📊 Overview', '📊 نظرة عامة');
  const classes = dfTeacherClasses();
  if (!DF.loaded && classes.length) {
    root.innerHTML = `<div class="card df-card" style="text-align:center;color:var(--grey-3)">⏳ ${dfT('Loading…', 'جارٍ التحميل…')}</div>`;
    dfLoad().then(() => { if (DF.loaded) dfRenderOverview(); }).catch((e) => console.warn('dfLoad', e));
    return;
  }
  const shown = DF.ovClass ? classes.filter((c) => c.id === DF.ovClass) : classes;
  const thisWeek = dfWeekStart(dfToday());
  const periodDays = (c, students) => {
    if (DF.ovPeriod === 'term') return dfAllTakenDays(c, students);
    const start = DF.ovPeriod === 'last' ? dfAddDays(thisWeek, -7) : thisWeek;
    return dfTakenDays(c, students, dfWeekDays(start));
  };

  const rows = [];
  shown.forEach((c) => {
    const students = dfClassStudents(c);
    const days = periodDays(c, students);
    students.forEach((s) => {
      const recs = dfStudentRecs(c, s.mid);
      rows.push({ c, s, w: dfSummarize(recs, days), exams: dfLatestExams(recs) });
    });
  });

  const followed = rows.filter((r) => r.w.days);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, v) => a + v, 0) / arr.length) : null);
  const attAvg = avg(followed.map((r) => r.w.attendance).filter((v) => v != null));
  const hwAvg = avg(followed.map((r) => r.w.homework).filter((v) => v != null));
  const pos = rows.reduce((a, r) => a + r.w.posCount, 0);
  const neg = rows.reduce((a, r) => a + r.w.negCount, 0);
  const examAvg = (k) => {
    const vals = rows.map((r) => r.exams[k]?.v).filter((v) => v != null);
    return vals.length ? dfFmtNum(vals.reduce((a, v) => a + v, 0) / vals.length) : '—';
  };
  const multi = classes.some((c) => c.multiSubj);

  const classOpts = `<option value="">${dfT('All my classes', 'كل شعبي')}</option>` + classes.map((c) => `<option value="${dfEsc(c.id)}" ${c.id === DF.ovClass ? 'selected' : ''}>${dfEsc(dfClassLabel(c))}</option>`).join('');
  const periodOpts = [['week', dfT('This week', 'هذا الأسبوع')], ['last', dfT('Last week', 'الأسبوع الماضي')], ['term', dfT('The whole term', 'الفصل كاملًا')]]
    .map(([v, l]) => `<option value="${v}" ${v === DF.ovPeriod ? 'selected' : ''}>${l}</option>`).join('');
  const stat = (icon, cls, val, label) => `<div class="stat-card"><div class="stat-icon ${cls}">${icon}</div><div><div class="stat-val">${val}</div><div class="stat-label">${label}</div></div></div>`;

  const watch = rows.filter((r) => r.w.days && ((r.w.overall != null && r.w.overall < 65) || r.w.negCount >= 2 || r.w.absent >= 2));
  const tableRows = rows.map((r, i) => {
    const name = typeof displayStudentName === 'function' ? displayStudentName(r.s, r.c.grade, r.c.section, r.s.mid) : r.s.name;
    const w = r.w;
    return `<tr>
      <td class="df-muted">${i + 1}</td>
      <td class="df-name">${dfEsc(name)}</td>
      <td><button type="button" class="df-link" title="${dfT('Open in the daily table', 'افتح في جدول المتابعة')}" onclick="dfOpenDaily('${dfEsc(r.c.id)}')">${dfEsc(dfClassLabel(r.c, multi))}</button></td>
      <td class="${w.absent ? 't-bad' : ''}">${w.days ? w.absent : '—'}</td>
      <td class="${w.late ? 't-mid' : ''}">${w.days ? w.late : '—'}</td>
      <td class="t-${dfTone(w.homework)}">${dfPctText(w.homework)}</td>
      <td class="t-${dfTone(w.toolsPct)}">${dfPctText(w.toolsPct)}</td>
      <td class="t-${dfTone(w.participation)}">${dfPctText(w.participation)}</td>
      <td class="t-${dfTone(w.behaviour)}">${dfPctText(w.behaviour)}</td>
      <td class="t-good">${w.posCount || ''}</td>
      <td class="t-bad">${w.negCount || ''}</td>
      ${DF_EXAMS.map(([k]) => `<td>${dfFmtNum(r.exams[k]?.v)}</td>`).join('')}
      <td class="t-${dfTone(w.overall)}"><b>${dfPctText(w.overall)}</b> <span class="df-small">${dfBand(w.overall)}</span></td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="df-filters">
      <select onchange="dfOvSet('ovClass',this.value)">${classOpts}</select>
      <select onchange="dfOvSet('ovPeriod',this.value)">${periodOpts}</select>
      <button type="button" class="df-btn" onclick="dfOpenDaily('${dfEsc(DF.ovClass || '')}')">📅 ${dfT('Open the daily table', 'فتح جدول المتابعة اليومية')}</button>
    </div>
    <div class="stat-grid">
      ${stat('👥', 'teal', rows.length, dfT('Students', 'إجمالي الطلاب'))}
      ${stat('✅', 'green', dfPctText(attAvg), dfT('Attendance', 'نسبة الحضور'))}
      ${stat('📚', 'gold', dfPctText(hwAvg), dfT('Homework', 'إنجاز الواجبات'))}
      ${stat('👍', 'green', pos, dfT('Positive behaviour', 'سلوك إيجابي'))}
      ${stat('👎', 'red', neg, dfT('Negative behaviour', 'سلوك سلبي'))}
      ${DF_EXAMS.map((e) => stat('📝', 'teal', examAvg(e[0]), dfT('Average — ', 'متوسط ') + dfExamName(e, true))).join('')}
    </div>
    <div class="card df-card">
      <div class="df-row-between"><h3>📋 ${dfT('Students', 'قائمة الطلاب')}</h3>
        <input class="search-input" type="text" placeholder="🔍 ${dfT('Search…', 'ابحث...')}" oninput="filterTable('df-ov-table',this.value)"></div>
      <p class="df-hint">${dfT('Figures come from the daily follow-up table; the test columns show the latest score recorded. Click a class to open its daily table.', 'الأرقام محسوبة من جدول المتابعة اليومية، وأعمدة الاختبارات تعرض آخر درجة مسجّلة. اضغط على الشعبة لفتح جدولها اليومي.')}</p>
      ${rows.length ? `<div class="table-wrap"><table class="df-table df-summary" id="df-ov-table">
        <thead><tr>
          <th>#</th><th class="df-name">${dfT('Student', 'الطالب')}</th><th>${dfT('Class', 'الشعبة')}</th>
          <th>${dfT('Absent', 'غياب')}</th><th>${dfT('Late', 'تأخر')}</th><th>${dfT('Homework', 'الواجبات')}</th><th>${dfT('Tools', 'الأدوات')}</th>
          <th>${dfT('Participation', 'المشاركة')}</th><th>${dfT('Behaviour', 'السلوك')}</th><th>👍</th><th>👎</th>
          ${DF_EXAMS.map((e) => `<th>${dfEsc(dfExamName(e, true))}</th>`).join('')}
          <th>${dfT('Overall', 'التقييم العام')}</th>
        </tr></thead><tbody>${tableRows}</tbody></table></div>`
        : `<p class="df-hint">${dfT('No students yet.', 'لا يوجد طلاب بعد.')}</p>`}
    </div>
    <div class="card df-card">
      <h3>🎯 ${dfT('Students who need follow-up', 'طلاب يحتاجون متابعة')} <span class="df-small df-muted">(${watch.length})</span></h3>
      ${watch.length ? `<ul class="df-rep-list bad">${watch.map((r) => {
        const why = [];
        if (r.w.absent >= 2) why.push(dfT(`absent ${r.w.absent} days`, `أيام الغياب: ${r.w.absent}`));
        if (r.w.negCount >= 2) why.push(dfT(`${r.w.negCount} negative behaviours`, `${r.w.negCount} سلوك سلبي`));
        if (r.w.overall != null && r.w.overall < 65) why.push(dfT(`overall ${r.w.overall}%`, `التقييم العام ${r.w.overall}%`));
        const name = typeof displayStudentName === 'function' ? displayStudentName(r.s, r.c.grade, r.c.section, r.s.mid) : r.s.name;
        return `<li><b>${dfEsc(name)}</b> — ${dfEsc(dfClassLabel(r.c, multi))}: ${dfEsc(why.join('، '))}</li>`;
      }).join('')}</ul>` : `<p class="df-hint">${dfT('No student needs special follow-up in this period. 👏', 'لا يوجد طالب يحتاج متابعة خاصة في هذه الفترة. 👏')}</p>`}
    </div>`;
}

// ══════════════════════════════════════════════════
//  PARENT — DAILY VIEW AND WEEKLY REPORT
// ══════════════════════════════════════════════════
const PDF = { byTeacher: {}, week: '', loadedFor: '' };

async function pdfLoad(teachersList) {
  const sessionToken = typeof getParentSessionToken === 'function' ? getParentSessionToken() : '';
  if (!sessionToken || !teachersList?.length || typeof callParentPublicFn !== 'function') return false;
  const items = teachersList.map((tc) => ({ teacherKey: tc.key, subjects: tc.subjects?.length ? tc.subjects : [tc.subject] })).filter((x) => x.teacherKey);
  const data = await callParentPublicFn('getParentDaily', { sessionToken, items });
  if (!data?.byTeacher) return false;
  PDF.byTeacher = data.byTeacher;
  PDF.loadedFor = sessionToken;
  return true;
}
function pdfEntries(teachersList) {
  const out = [];
  (teachersList || []).forEach((tc, idx) => {
    (tc.subjects?.length ? tc.subjects : [tc.subject]).filter(Boolean).forEach((subj) => {
      out.push({ idx, tc, subj, label: dfSubjectLabel(subj), recs: PDF.byTeacher?.[tc.key]?.subjects?.[subj] || {}, off: PDF.byTeacher?.[tc.key]?.off || {} });
    });
  });
  return out;
}
function pdfWeek() { if (!PDF.week) PDF.week = dfWeekStart(dfDefaultDay()); return PDF.week; }
function pdfGoWeek(delta) {
  PDF.week = delta === 0 ? dfWeekStart(dfDefaultDay()) : dfAddDays(pdfWeek(), delta * 7);
  pdfRefreshViews();
}
// The class's school days in a week: days with a record of this student, without the teacher's days off.
function pdfTakenDays(e, start) { return dfWeekDays(start).filter((d) => !e.off[d] && e.recs[d]); }

function pdfWeekNavHtml() {
  const start = pdfWeek();
  const thisWeek = dfWeekStart(dfDefaultDay());
  return `<div class="df-row-between df-week-nav">
    <button type="button" class="df-btn ghost" onclick="pdfGoWeek(-1)">${dfT('◀ Previous', '▶ السابق')}</button>
    <b>${dfT('Week', 'الأسبوع')} ${dfWeekLabel(start)}</b>
    <span class="df-row-gap">
      ${start !== thisWeek ? `<button type="button" class="df-btn ghost" onclick="pdfGoWeek(0)">${dfT('This week', 'هذا الأسبوع')}</button>` : ''}
      <button type="button" class="df-btn ghost" onclick="pdfGoWeek(1)">${dfT('Next ▶', 'التالي ◀')}</button>
    </span>
  </div>`;
}

function pdfEventCard(e, r, date) {
  if (!r) return '';
  const absent = r.att === 'a';
  const att = dfItem(DF_ATT, r.att || 'p');
  const b = dfBeh(r.beh);
  const exams = DF_EXAMS.filter(([k]) => dfNum(r[k]) != null).map((x) => `<span class="df-chip df-exam-chip">📝 ${dfEsc(dfExamName(x))}: <b>${dfFmtNum(dfNum(r[x[0]]))}</b></span>`).join('');
  const tone = absent || (b && dfBehTone(b) === 'bad') ? 'bad' : b && b.kind === 'pos' ? 'good' : '';
  return `<div class="df-event ${tone ? 'df-event-' + tone + ' df-flash-' + tone : ''}">
    <div class="df-row-between"><b>📚 ${dfEsc(e.label)}</b><span class="df-small df-muted">${dfEsc(e.tc.name || '')}${date ? ' · ' + dfDayName(date) + ' ' + dfShortDate(date) : ''}</span></div>
    <div class="df-event-chips">
      ${dfCellChip(att, true)}
      ${absent ? '' : `${r.hw ? `<span class="df-small df-muted">${dfT('Homework', 'الواجب')}:</span> ${dfCellChip(dfItem(DF_HW, r.hw))}` : ''}
      ${r.tools ? `<span class="df-small df-muted">${dfT('Tools', 'الأدوات')}:</span> ${dfCellChip(dfItem(DF_TOOLS, r.tools))}` : ''}
      ${r.part ? `<span class="df-small df-muted">${dfT('Participation', 'المشاركة')}:</span> <span class="df-chip df-stars-chip">${dfStarsText(r.part)}</span>` : ''}
      ${b ? `<span class="df-small df-muted">${dfT('Behaviour', 'السلوك')}:</span> ${dfBehChip(b, true)}` : ''}`}
      ${exams}
    </div>
    ${r.note ? `<p class="df-event-note">🗒 ${dfEsc(r.note)}</p>` : ''}
  </div>`;
}

// Parent's main tab: today's events, the week at a glance, the weekly report and the test scores.
function pdfOverviewHtml(ctx) {
  const entries = pdfEntries(ctx.teachers);
  if (!entries.length) return `<div class="empty-state" style="padding:24px"><div class="ico">📅</div><p>${dfT('No teachers are assigned to this class yet.', 'لم يُسنَد معلمون لهذه الشعبة بعد.')}</p></div>`;
  const today = dfToday();
  let lastDay = '';
  entries.forEach((e) => Object.keys(e.recs).forEach((d) => { if (d <= today && !e.off[d] && d > lastDay) lastDay = d; }));
  const dayEvents = lastDay ? entries.map((e) => pdfEventCard(e, e.recs[lastDay], '')).filter(Boolean).join('') : '';
  const eventsTitle = lastDay === today ? `📌 ${dfT("Today's events", 'أحداث اليوم')} — ${dfDayName(today)} ${dfShortDate(today)}`
    : lastDay ? `📌 ${dfT('Latest recorded events', 'آخر الأحداث المسجّلة')} — ${dfDayName(lastDay)} ${dfShortDate(lastDay)}` : `📌 ${dfT("Today's events", 'أحداث اليوم')}`;

  const start = pdfWeek();
  const days = dfWeekDays(start);
  const matrix = entries.map((e) => `<tr><td class="df-name">${dfEsc(e.label)}</td>${days.map((d) => {
    if (e.off[d]) return `<td class="df-muted df-small">${dfT('off', 'عطلة')}</td>`;
    const r = e.recs[d];
    if (!r) return '<td class="df-muted">—</td>';
    const att = dfItem(DF_ATT, r.att || 'p');
    const b = r.att === 'a' ? null : dfBeh(r.beh);
    const tone = r.att === 'a' ? 'bad' : b ? dfBehTone(b) : '';
    return `<td class="${tone ? 'df-cell-' + tone + (b && b.kind !== 'ok' || r.att === 'a' ? ' df-flash-' + tone : '') : ''}" title="${dfEsc([dfItemText(att), b ? dfBehLabel(b) : '', r.note || ''].filter(Boolean).join(' · '))}">
      <span>${att[1]}</span>${b ? ` <span>${b.icon}</span>` : ''}${DF_EXAMS.some(([k]) => dfNum(r[k]) != null) ? ' <span>📝</span>' : ''}${r.note ? ' <span>🗒</span>' : ''}</td>`;
  }).join('')}</tr>`).join('');

  const ready = dfReportReady(start);
  const reportBody = ready
    ? entries.map((e) => {
      const taken = pdfTakenDays(e, start);
      if (!taken.length) return '';
      return dfReportHtml({ name: ctx.name, subjLabel: e.label, teacherName: e.tc.name, w: dfSummarize(e.recs, taken) });
    }).filter(Boolean).join('') || `<p class="df-hint">${dfT('Nothing was recorded this week.', 'لم يُسجَّل شيء في هذا الأسبوع.')}</p>`
    : `<p class="df-hint">⏳ ${dfT('The weekly report is released automatically on Friday at 12:00 noon.', 'يصدر التقرير الأسبوعي تلقائيًا يوم الجمعة الساعة 12 ظهرًا.')}</p>`;

  const examRows = entries.map((e) => {
    const ex = dfLatestExams(e.recs);
    return `<tr><td class="df-name">${dfEsc(e.label)}</td>${DF_EXAMS.map(([k]) => `<td>${ex[k] ? `<b>${dfFmtNum(ex[k].v)}</b> <span class="df-small df-muted">${dfShortDate(ex[k].date)}</span>` : '—'}</td>`).join('')}</tr>`;
  }).join('');

  return `
    <div class="df-section">
      <h4>${eventsTitle}</h4>
      ${dayEvents || `<p class="df-hint">${dfT('Nothing has been recorded yet.', 'لم يُسجَّل شيء بعد.')}</p>`}
    </div>
    <div class="df-section">
      <h4>🗓 ${dfT('The week at a glance', 'الأسبوع في لمحة')}</h4>
      ${pdfWeekNavHtml()}
      <div class="table-wrap"><table class="df-table df-matrix">
        <thead><tr><th class="df-name">${dfT('Subject', 'المادة')}</th>${days.map((d) => `<th>${dfDayName(d)}<br><span class="df-small">${dfShortDate(d)}</span></th>`).join('')}</tr></thead>
        <tbody>${matrix}</tbody>
      </table></div>
      <p class="df-small df-muted">✓ ${dfT('present', 'حاضر')} · ✗ ${dfT('absent', 'غائب')} · ⏰ ${dfT('late', 'متأخر')} · 📝 ${dfT('test', 'اختبار')} · 🗒 ${dfT('note', 'ملاحظة')} — ${dfT('green: good behaviour, red: unacceptable behaviour. Open a subject tab for the details.', 'الأخضر: سلوك جيد، الأحمر: سلوك غير مقبول. افتح تبويب المادة للتفاصيل.')}</p>
    </div>
    <div class="df-section">
      <h4>📝 ${dfT('Weekly report', 'التقرير الأسبوعي')} — ${dfWeekLabel(start)}</h4>
      ${reportBody}
    </div>
    <div class="df-section">
      <h4>🧪 ${dfT('Test scores', 'درجات الاختبارات')}</h4>
      <div class="table-wrap"><table class="df-table">
        <thead><tr><th class="df-name">${dfT('Subject', 'المادة')}</th>${DF_EXAMS.map((e) => `<th>${dfEsc(dfExamName(e))}</th>`).join('')}</tr></thead>
        <tbody>${examRows}</tbody>
      </table></div>
    </div>`;
}

// One subject tab: the daily table of the week (Monday–Friday) and its weekly report at the bottom.
function pdfSubjectHtml(idx, ctx) {
  const entries = pdfEntries(ctx.teachers).filter((e) => e.idx === Number(idx));
  if (!entries.length) return '';
  const start = pdfWeek();
  const days = dfWeekDays(start);
  const ready = dfReportReady(start);
  return entries.map((e) => {
    const rows = days.map((d) => {
      if (e.off[d]) return `<tr><td class="df-name">${dfDayName(d)} <span class="df-small">${dfShortDate(d)}</span></td><td colspan="${6 + DF_EXAMS.length}" class="df-muted">🏖 ${dfT('Day off', 'عطلة')}</td></tr>`;
      const r = e.recs[d];
      if (!r) return `<tr><td class="df-name">${dfDayName(d)} <span class="df-small">${dfShortDate(d)}</span></td><td colspan="${6 + DF_EXAMS.length}" class="df-muted">—</td></tr>`;
      const absent = r.att === 'a';
      const b = absent ? null : dfBeh(r.beh);
      return `<tr class="${absent ? 'df-absent' : ''}">
        <td class="df-name">${dfDayName(d)} <span class="df-small">${dfShortDate(d)}</span></td>
        <td>${dfCellChip(dfItem(DF_ATT, r.att || 'p'), true)}</td>
        <td>${absent || !r.hw ? '—' : dfCellChip(dfItem(DF_HW, r.hw))}</td>
        <td>${absent || !r.tools ? '—' : dfCellChip(dfItem(DF_TOOLS, r.tools))}</td>
        <td class="df-stars-ro">${absent ? '—' : dfStarsText(r.part)}</td>
        <td>${b ? dfBehChip(b, b.kind !== 'ok') : '—'}</td>
        ${DF_EXAMS.map(([k]) => `<td>${dfFmtNum(dfNum(r[k]))}</td>`).join('')}
        <td class="df-note-ro">${dfEsc(r.note || '')}</td>
      </tr>`;
    }).join('');
    const taken = pdfTakenDays(e, start);
    const report = ready
      ? (taken.length ? dfReportHtml({ name: ctx.name, subjLabel: e.label, teacherName: e.tc.name, w: dfSummarize(e.recs, taken) }) : `<p class="df-hint">${dfT('Nothing was recorded this week.', 'لم يُسجَّل شيء في هذا الأسبوع.')}</p>`)
      : `<p class="df-hint">⏳ ${dfT('The weekly report is released automatically on Friday at 12:00 noon.', 'يصدر التقرير الأسبوعي تلقائيًا يوم الجمعة الساعة 12 ظهرًا.')}</p>`;
    return `<div class="parent-subject-panel df-section">
      <div class="df-row-between"><div class="section-title" style="margin:0">📅 ${dfT('Daily follow-up', 'المتابعة اليومية')}${entries.length > 1 ? ' — ' + dfEsc(e.label) : ''}</div>
        <span class="df-small df-muted">🔄 ${dfT('Live sync', 'تحديث فوري')}</span></div>
      ${pdfWeekNavHtml()}
      <div class="table-wrap"><table class="df-table df-parent-table">
        <thead><tr>
          <th class="df-name">${dfT('Day', 'اليوم')}</th><th>${dfT('Attendance', 'الحضور')}</th><th>${dfT('Homework', 'الواجب')}</th>
          <th>${dfT('Books & tools', 'الأدوات والكتاب')}</th><th>${dfT('Participation', 'المشاركة')}</th><th>${dfT('Behaviour', 'السلوك')}</th>
          ${DF_EXAMS.map((x) => `<th>${dfEsc(dfExamName(x, true))}</th>`).join('')}<th>${dfT('Note', 'ملاحظة')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <h4 class="df-rep-title">📝 ${dfT('Weekly report', 'التقرير الأسبوعي')} — ${dfWeekLabel(start)}</h4>
      ${report}
    </div>`;
  }).join('');
}

function pdfRefreshViews() {
  const ctx = window._parentSubjectContext;
  if (!ctx) return;
  const ov = document.getElementById('pdf-overview');
  if (ov) ov.innerHTML = pdfOverviewHtml(ctx);
  document.querySelectorAll('.pdf-subject[data-idx]').forEach((el) => { el.innerHTML = pdfSubjectHtml(el.dataset.idx, ctx); });
}
async function pdfReload(teachersList) {
  try {
    if (await pdfLoad(teachersList)) pdfRefreshViews();
  } catch (e) { console.warn('pdfReload', e); }
}
