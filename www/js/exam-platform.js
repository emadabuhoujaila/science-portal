(function () {
  const EXAM_GRADES = [9, 10, 11, 12];
  const SESSION_KEY = 'examStudent';

  const STR = {
    ar: {
      tabStudent: '👨‍🎓 الطالب',
      studentMidLbl: 'الرقم الوزاري',
      studentMidHint: 'أدخل رقمك الوزاري للدخول إلى الاختبار التشخيصي في الفيزياء',
      studentMidPh: 'مثال: 123456789012',
      studentLoginBtn: 'دخول الاختبار',
      notFound: 'لا يوجد اسم مطابق للرقم تواصل مع المعلم',
      notStarted: 'لم يبدأ الاختبار، انتظر تعليمات المعلم',
      locked: 'الاختبار مقفل. تواصل مع المعلم للسماح بالدخول',
      tooMany: 'محاولات كثيرة — حاول لاحقاً',
      connErr: 'تعذر الاتصال. حاول مرة أخرى',
      waitTitle: 'الاختبار التشخيصي — الفيزياء',
      hello: 'مرحباً',
      grade: 'الصف',
      section: 'الشعبة',
      mid: 'الرقم الوزاري',
      waitHint: 'عندما يرفع المعلم أسئلة اختبار صفك سيظهر الاختبار هنا.',
      back: '→ رجوع',
      tabExams: '🧪 الاختبار التشخيصي',
      examsTitle: 'اختبارات الفيزياء التشخيصية',
      examsSub: 'منصة واحدة لأربعة صفوف. كل صف له اختبار مستقل وأهدافه الخاصة.',
      statusNotStarted: 'لم يبدأ — بانتظار رفع الأسئلة',
      statusReady: 'جاهز للبدء',
      statusActive: 'الاختبار جارٍ',
      statusClosed: 'مغلق',
      students: 'الطلاب',
      questions: 'الأسئلة',
      objectives: 'الأهداف',
      btnStudents: 'رفع الطلاب (Excel)',
      btnPdf: 'رفع أسئلة PDF',
      btnObjectives: 'إدخال الأهداف',
      nextStep: 'يُفعَّل في الخطوة التالية',
      noneYet: 'لا يوجد بعد',
      uploaded: 'مرفوع',
      gradeCard: 'الصف',
    },
    en: {
      tabStudent: '👨‍🎓 Student',
      studentMidLbl: 'Ministerial number',
      studentMidHint: 'Enter your ministerial number to open the physics diagnostic exam',
      studentMidPh: 'e.g. 123456789012',
      studentLoginBtn: 'Enter exam',
      notFound: 'No matching name for this number. Contact your teacher',
      notStarted: 'The exam has not started. Wait for your teacher’s instructions',
      locked: 'The exam is locked. Ask your teacher to allow re-entry',
      tooMany: 'Too many attempts — try later',
      connErr: 'Could not connect. Try again',
      waitTitle: 'Physics diagnostic exam',
      hello: 'Hello',
      grade: 'Grade',
      section: 'Section',
      mid: 'Ministerial number',
      waitHint: 'When your teacher uploads your grade’s questions, the exam will appear here.',
      back: '← Back',
      tabExams: '🧪 Diagnostic exam',
      examsTitle: 'Physics diagnostic exams',
      examsSub: 'One platform, four grades. Each grade has its own exam and learning objectives.',
      statusNotStarted: 'Not started — waiting for questions',
      statusReady: 'Ready',
      statusActive: 'In progress',
      statusClosed: 'Closed',
      students: 'Students',
      questions: 'Questions',
      objectives: 'Objectives',
      btnStudents: 'Upload students (Excel)',
      btnPdf: 'Upload questions PDF',
      btnObjectives: 'Enter objectives',
      nextStep: 'Enabled in the next step',
      noneYet: 'None yet',
      uploaded: 'Uploaded',
      gradeCard: 'Grade',
    },
  };

  let examsCache = {};
  let examsListener = null;

  function isEn() {
    return typeof currentLang !== 'undefined' && currentLang === 'en';
  }
  function et(key) {
    return (STR[isEn() ? 'en' : 'ar'] || STR.ar)[key] || key;
  }
  function fns() {
    if (typeof getCloudFunctions === 'function') return getCloudFunctions();
    try {
      return firebase.app().functions('us-central1');
    } catch (_e) {
      return null;
    }
  }

  function defaultExam(grade) {
    const g = Number(grade);
    return {
      grade: g,
      subject: 'physics',
      titleAr: 'اختبار تشخيصي في الفيزياء — الصف ' + g,
      titleEn: 'Physics diagnostic exam — Grade ' + g,
      status: 'not_started',
      pdfUploaded: false,
      questionsReady: false,
      rosterCount: 0,
      objectivesCount: 0,
    };
  }

  function statusLabel(exam) {
    if (exam?.questionsReady) {
      if (exam.status === 'closed') return et('statusClosed');
      if (exam.status === 'active') return et('statusActive');
      return et('statusReady');
    }
    return et('statusNotStarted');
  }

  function applyExamLang() {
    const setText = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.textContent = et(key);
    };
    setText('tab-student', 'tabStudent');
    setText('exam-student-mid-lbl', 'studentMidLbl');
    setText('exam-student-mid-hint', 'studentMidHint');
    setText('exam-student-login-btn', 'studentLoginBtn');
    setText('ttab-exams', 'tabExams');
    setText('exam-student-back-btn', 'back');
    const ph = document.getElementById('exam-student-mid-input');
    if (ph) ph.placeholder = et('studentMidPh');
    const wait = document.getElementById('exam-wait-title');
    if (wait) wait.textContent = et('waitTitle');
    renderStudentWait();
    if (document.getElementById('tab-exams')?.classList.contains('active')) renderExamDashboard();
  }

  function showStudentError(msg) {
    const el = document.getElementById('exam-student-error');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function saveStudentSession(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (_e) {}
  }

  function loadStudentSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function clearStudentSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_e) {}
  }

  function renderStudentWait() {
    const session = loadStudentSession();
    if (!session?.student) return;
    const { student, exam } = session;
    const nameEl = document.getElementById('exam-wait-name');
    const metaEl = document.getElementById('exam-wait-meta');
    const msgEl = document.getElementById('exam-wait-msg');
    const hintEl = document.getElementById('exam-wait-hint');
    if (nameEl) nameEl.textContent = et('hello') + (student.name ? ' ' + student.name : '');
    if (metaEl) {
      metaEl.textContent =
        et('grade') + ' ' + student.grade +
        (student.section ? ' · ' + et('section') + ' ' + student.section : '') +
        ' · ' + et('mid') + ' ' + student.mid;
    }
    const box = document.getElementById('exam-wait-box');
    const locked = exam?.sessionStatus === 'locked';
    const ready = exam?.questionsReady === true && !locked;
    if (box) box.classList.toggle('exam-wait-locked', locked);
    if (msgEl) {
      if (locked) msgEl.textContent = et('locked');
      else if (!exam?.questionsReady) msgEl.textContent = et('notStarted');
      else msgEl.textContent = isEn() ? 'Your exam is ready.' : 'اختبارك جاهز.';
    }
    if (hintEl) {
      hintEl.style.display = ready ? 'none' : '';
      hintEl.textContent = et('waitHint');
    }
  }

  function enterStudentWait(payload) {
    saveStudentSession(payload);
    if (typeof showScreen === 'function') showScreen('exam-student');
    applyExamLang();
  }

  async function examStudentLogin() {
    const input = document.getElementById('exam-student-mid-input');
    const btn = document.getElementById('exam-student-login-btn');
    const mid = String(input?.value || '').replace(/\s/g, '');
    showStudentError('');
    if (!/^\d{5,14}$/.test(mid)) {
      showStudentError(et('notFound'));
      return;
    }
    const cloud = fns();
    if (!cloud) {
      showStudentError(et('connErr'));
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const res = await cloud.httpsCallable('examStudentLogin')({ mid });
      const data = res?.data || {};
      if (!data.ok) {
        showStudentError(data.code === 'not_found' ? et('notFound') : et('notFound'));
        return;
      }
      enterStudentWait({ student: data.student, exam: data.exam });
    } catch (e) {
      const code = e?.code || '';
      if (String(code).includes('resource-exhausted')) showStudentError(et('tooMany'));
      else showStudentError(et('connErr'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function examStudentLogout() {
    clearStudentSession();
    showStudentError('');
    const input = document.getElementById('exam-student-mid-input');
    if (input) input.value = '';
    if (typeof showScreen === 'function') showScreen('login');
    const tab = document.getElementById('tab-student');
    if (tab && typeof switchTab === 'function') switchTab('student', tab);
  }

  async function ensureExamsClient() {
    if (typeof db === 'undefined') return;
    const updates = {};
    for (const g of EXAM_GRADES) {
      if (!examsCache[g] && !examsCache[String(g)]) updates['physicsExams/exams/' + g] = defaultExam(g);
    }
    if (Object.keys(updates).length) {
      try {
        await db.ref().update(updates);
      } catch (e) {
        console.warn('ensureExamsClient', e);
      }
    }
  }

  async function loadTeacherExams() {
    const cloud = fns();
    if (cloud) {
      try {
        const res = await cloud.httpsCallable('ensurePhysicsExams')({});
        if (res?.data?.exams) examsCache = res.data.exams;
      } catch (e) {
        console.warn('ensurePhysicsExams', e);
      }
    }
    if (typeof db === 'undefined') {
      renderExamDashboard();
      return;
    }
    if (examsListener) {
      renderExamDashboard();
      return;
    }
    const ref = db.ref('physicsExams/exams');
    examsListener = ref;
    ref.on('value', async (snap) => {
      examsCache = snap.val() || {};
      await ensureExamsClient();
      renderExamDashboard();
    });
  }

  function renderExamDashboard() {
    const grid = document.getElementById('exam-grade-grid');
    const title = document.getElementById('exam-dash-title');
    const sub = document.getElementById('exam-dash-sub');
    if (title) title.textContent = et('examsTitle');
    if (sub) sub.textContent = et('examsSub');
    if (!grid) return;
    grid.innerHTML = EXAM_GRADES.map((g) => {
      const exam = examsCache[g] || examsCache[String(g)] || defaultExam(g);
      const roster = Number(exam.rosterCount || 0);
      const objCount = Number(exam.objectivesCount || 0);
      const qReady = exam.questionsReady === true || exam.pdfUploaded === true;
      return `<article class="exam-grade-card">
        <div class="exam-grade-card-head">
          <div class="exam-grade-num">${et('gradeCard')} ${g}</div>
          <span class="exam-status-pill">${typeof escapeHtml === 'function' ? escapeHtml(statusLabel(exam)) : statusLabel(exam)}</span>
        </div>
        <p class="exam-grade-title">${typeof escapeHtml === 'function' ? escapeHtml(isEn() ? (exam.titleEn || '') : (exam.titleAr || '')) : (isEn() ? (exam.titleEn || '') : (exam.titleAr || ''))}</p>
        <ul class="exam-grade-meta">
          <li>${et('students')}: <strong>${roster}</strong></li>
          <li>${et('questions')}: <strong>${qReady ? et('uploaded') : et('noneYet')}</strong></li>
          <li>${et('objectives')}: <strong>${objCount ? objCount : et('noneYet')}</strong></li>
        </ul>
        <div class="exam-grade-actions">
          <button type="button" class="exam-action-btn" disabled title="${et('nextStep')}">📋 ${et('btnStudents')}</button>
          <button type="button" class="exam-action-btn" disabled title="${et('nextStep')}">📄 ${et('btnPdf')}</button>
          <button type="button" class="exam-action-btn" disabled title="${et('nextStep')}">🎯 ${et('btnObjectives')}</button>
        </div>
      </article>`;
    }).join('');
  }

  function onTeacherEnter() {
    loadTeacherExams();
  }

  function resumeStudentIfAny() {
    if (typeof auth !== 'undefined' && auth.currentUser) return;
    const session = loadStudentSession();
    if (!session?.student) return;
    enterStudentWait(session);
  }

  window.ExamPlatform = {
    applyLang: applyExamLang,
    studentLogin: examStudentLogin,
    studentLogout: examStudentLogout,
    onTeacherEnter,
    renderDashboard: renderExamDashboard,
    resumeStudentIfAny,
  };
  window.examStudentLogin = examStudentLogin;
  window.examStudentLogout = examStudentLogout;
  window.applyExamLang = applyExamLang;

  document.addEventListener('splashDone', () => {
    setTimeout(resumeStudentIfAny, 0);
  });
})();
