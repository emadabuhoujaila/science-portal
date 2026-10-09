// ══════════════════════════════════════════════════
//  ADMIN — الإدخال (students · teachers · subjects · assignments)
//  DB: schoolSubjects/{key}            {ar, en}
//      curriculum/{grade}/{track}/{key} true   (track: GEN | ADV | ELITE | ALL)
//      teachingAssignments/{id}        {email, name, subject, grade, section}
//      teacherAllowlist/{emailKey}     + subject, subjects, gradeMap (derived)
// ══════════════════════════════════════════════════

window.INPUT_DATA = window.INPUT_DATA || {
  loaded: false,
  subjects: {},
  curriculum: {},
  assignments: {},
  allowlist: {},
  teachers: {},
};

const INPUT_TRACK_LABELS = {
  ALL:   { ar: 'كل المسارات', en: 'All tracks' },
  GEN:   { ar: 'عام',         en: 'General' },
  ADV:   { ar: 'متقدم',       en: 'Advanced' },
  ELITE: { ar: 'نخبة',        en: 'Elite' },
};

let inputAssignView = 'list';

function inputIsEn(){ return currentLang === 'en'; }

function inputSetStatus(id, msg, warn){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = msg || '';
  el.classList.toggle('warn', !!warn);
}

function inputTrackLabel(track){
  const t = INPUT_TRACK_LABELS[track];
  return t ? t[inputIsEn() ? 'en' : 'ar'] : track;
}

function inputTrackOfSection(section){
  const m = String(section || '').match(/^([A-Z]+)\d*$/);
  return m && INPUT_TRACK_LABELS[m[1]] ? m[1] : 'ALL';
}

function inputParseTrack(val){
  const s = String(val || '').trim().toLowerCase();
  if(!s || /^(الكل|كل|كل المسارات|all|both)$/.test(s)) return 'ALL';
  if(/عام|^gen|general/.test(s)) return 'GEN';
  if(/متقدم|^adv/.test(s)) return 'ADV';
  if(/نخب|elite/.test(s)) return 'ELITE';
  return '';
}

function inputTracksForGrade(grade){
  const tracks = new Set(getSchoolSections(grade).map(inputTrackOfSection).filter(t => t !== 'ALL'));
  return ['ALL', ...['GEN','ADV','ELITE'].filter(t => tracks.has(t))];
}

function inputSplitList(val){
  return String(val ?? '').split(/[،,;\/+\n]|\s+و\s+/).map(s => s.trim()).filter(Boolean);
}

// Subject names may contain "و" or "/", so only split on list separators.
function inputSplitSubjects(val){
  return String(val ?? '').split(/[،,؛;+\n]/).map(s => s.trim()).filter(Boolean);
}

// ── Subjects ──

function inputNormName(s){
  return String(s || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/^ال/, '');
}

function inputFindSubjectKey(name){
  const n = inputNormName(name);
  if(!n) return '';
  for(const [key, v] of Object.entries(SUBJECTS)){
    if(key === n || inputNormName(v.ar) === n || inputNormName(v.en) === n) return key;
  }
  return '';
}

function inputEnsureSubject(name, nameEn, updates){
  const ar = String(name || '').trim();
  const en = String(nameEn || '').trim();
  const existing = inputFindSubjectKey(ar) || (en && inputFindSubjectKey(en));
  if(existing){
    if(en && !SUBJECTS[existing].en){
      SUBJECTS[existing].en = en;
      updates[`schoolSubjects/${existing}`] = { ...SUBJECTS[existing] };
    }
    return existing;
  }
  const isLatin = !/[\u0600-\u06FF]/.test(ar);
  const rec = { ar: ar || en, en: en || (isLatin ? ar : '') };
  let key = (rec.en || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  if(!key || SUBJECTS[key]) key = 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  SUBJECTS[key] = rec;
  INPUT_DATA.subjects[key] = rec;
  updates[`schoolSubjects/${key}`] = rec;
  return key;
}

function inputSubjectLabel(key){
  const s = SUBJECTS[key];
  if(!s) return key || '—';
  return inputIsEn() ? (s.en || s.ar) : (s.ar || s.en);
}

function inputSubjectsForClass(grade, section){
  const g = INPUT_DATA.curriculum?.[grade] || {};
  const track = inputTrackOfSection(section);
  return Object.keys({ ...(g.ALL || {}), ...(track !== 'ALL' ? (g[track] || {}) : {}) });
}

function inputSyncSubjectSelects(){
  const regSel = document.getElementById('reg-subject');
  if(regSel){
    const prev = regSel.value;
    const ph = regSel.querySelector('option[value=""]')?.outerHTML || '<option value="">—</option>';
    regSel.innerHTML = ph + Object.keys(SUBJECTS)
      .sort((a, b) => inputSubjectLabel(a).localeCompare(inputSubjectLabel(b), 'ar'))
      .map(k => `<option value="${escapeHtml(k)}">${escapeHtml(inputSubjectLabel(k))}</option>`).join('');
    if(prev && SUBJECTS[prev]) regSel.value = prev;
  }
  const dl = document.getElementById('input-assign-subject-list');
  if(dl){
    dl.innerHTML = Object.keys(SUBJECTS).map(k => `<option value="${escapeHtml(inputSubjectLabel(k))}"></option>`).join('');
  }
}

async function loadSchoolSubjects(){
  if(typeof db === 'undefined') return;
  try{
    const snap = await db.ref('schoolSubjects').once('value');
    const val = snap.val() || {};
    INPUT_DATA.subjects = val;
    Object.entries(val).forEach(([k, v]) => { if(v && (v.ar || v.en)) SUBJECTS[k] = { ar: v.ar || v.en, en: v.en || '' }; });
  }catch(e){ console.warn('loadSchoolSubjects', e); }
  inputSyncSubjectSelects();
}

// ── Loading ──

async function inputLoadAll(){
  if(typeof db === 'undefined') return INPUT_DATA;
  try{
    const [subj, cur, asg, allow, teachers] = await Promise.all([
      db.ref('schoolSubjects').once('value'),
      db.ref('curriculum').once('value'),
      db.ref('teachingAssignments').once('value'),
      db.ref('teacherAllowlist').once('value'),
      db.ref('teachers').once('value'),
    ]);
    INPUT_DATA.subjects = subj.val() || {};
    Object.entries(INPUT_DATA.subjects).forEach(([k, v]) => { if(v && (v.ar || v.en)) SUBJECTS[k] = { ar: v.ar || v.en, en: v.en || '' }; });
    INPUT_DATA.curriculum = cur.val() || {};
    INPUT_DATA.assignments = asg.val() || {};
    INPUT_DATA.allowlist = allow.val() || {};
    INPUT_DATA.teachers = teachers.val() || {};
    INPUT_DATA.loaded = true;
  }catch(e){
    console.warn('inputLoadAll', e);
  }
  inputRenderAll();
  return INPUT_DATA;
}

function inputRenderAll(){
  inputSyncSubjectSelects();
  inputFillSelects();
  inputRenderCounts();
  inputRenderTeachers();
  inputRenderCurriculum();
  inputRenderAssignments();
}

function inputRenderCounts(){
  const isEn = inputIsEn();
  const set = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
  const students = Object.values(adminStudentsCache || {}).reduce((n, secs) =>
    n + Object.values(secs || {}).reduce((m, list) => m + Object.keys(list || {}).length, 0), 0);
  const teachers = Object.keys(INPUT_DATA.allowlist || {}).length;
  const subjects = new Set();
  Object.values(INPUT_DATA.curriculum || {}).forEach(tr => Object.values(tr || {}).forEach(s => Object.keys(s || {}).forEach(k => subjects.add(k))));
  const assignments = Object.keys(INPUT_DATA.assignments || {}).length;
  set('input-step-count-students', students ? `${students} ${isEn ? 'students' : 'طالب'}` : '');
  set('input-step-count-teachers', teachers ? `${teachers} ${isEn ? 'teachers' : 'معلم'}` : '');
  set('input-step-count-subjects', subjects.size ? `${subjects.size} ${isEn ? 'subjects' : 'مادة'}` : '');
  set('input-step-count-assignments', assignments ? `${assignments} ${isEn ? 'items' : 'تكليف'}` : '');
}

function showInputPanel(name, el){
  document.querySelectorAll('#admin-tab-upload .input-panel').forEach(p => { p.style.display = 'none'; });
  document.querySelectorAll('#admin-tab-upload .input-step').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('input-panel-' + name);
  if(panel) panel.style.display = 'block';
  (el || document.querySelector(`#admin-tab-upload .input-step[data-panel="${name}"]`))?.classList.add('active');
  if(name !== 'students' && !INPUT_DATA.loaded) inputLoadAll();
  else inputRenderAll();
}

function inputFillSelects(){
  const isEn = inputIsEn();
  const grades = getSchoolGrades();
  const subjGrade = document.getElementById('input-subject-grade');
  fillSelectOptions(subjGrade, ['ALL', ...grades], g => g === 'ALL' ? (isEn ? 'All grades' : 'كل الصفوف') : formatGradeLabel(g, isEn));
  if(subjGrade && !subjGrade.onchange) subjGrade.onchange = inputFillSubjectTracks;
  inputFillSubjectTracks();
  fillSelectOptions(document.getElementById('input-assign-grade'), grades, g => formatGradeLabel(g, isEn));
  inputFillAssignSections();
  const dl = document.getElementById('input-assign-teacher-list');
  if(dl){
    dl.innerHTML = Object.values(INPUT_DATA.allowlist || {}).filter(t => t?.email)
      .map(t => `<option value="${escapeHtml(t.email)}">${escapeHtml(t.name || '')}</option>`).join('');
  }
}

function inputFillSubjectTracks(){
  const grade = document.getElementById('input-subject-grade')?.value || 'ALL';
  const tracks = grade === 'ALL'
    ? ['ALL', ...['GEN','ADV','ELITE'].filter(t => getSchoolSections().some(s => inputTrackOfSection(s) === t))]
    : inputTracksForGrade(grade);
  fillSelectOptions(document.getElementById('input-subject-track'), tracks, inputTrackLabel);
}

function inputFillAssignSections(){
  const isEn = inputIsEn();
  const grade = document.getElementById('input-assign-grade')?.value || '';
  const secs = getSchoolSections(grade);
  const tracks = inputTracksForGrade(grade).filter(t => t !== 'ALL');
  const opts = [
    ...secs.map(s => ({ v: s, l: formatSectionLabel(s, isEn) })),
    ...tracks.map(t => ({ v: 'TRACK:' + t, l: (isEn ? 'All ' : 'كل شعب ') + inputTrackLabel(t) })),
    { v: 'ALL', l: isEn ? 'All sections' : 'كل شعب الصف' },
  ];
  const sel = document.getElementById('input-assign-section');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = opts.map(o => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.l)}</option>`).join('');
  if(opts.some(o => o.v === prev)) sel.value = prev;
}

// ── Excel helpers ──

function inputReadWorkbook(input){
  return new Promise((resolve, reject) => {
    const file = input.files?.[0];
    if(!file) return reject(new Error('no file'));
    if(!window.XLSX) return reject(new Error(inputIsEn() ? 'Excel library not loaded' : 'مكتبة Excel لم تُحمَّل'));
    const reader = new FileReader();
    reader.onload = e => {
      try{ resolve(XLSX.read(new Uint8Array(e.target.result), { type: 'array' })); }
      catch(err){ reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Finds the header row and maps columns by keyword. spec: {field: [keywords...]}
function inputSheetRows(wb, spec, requiredFields){
  const out = [];
  (wb.SheetNames || []).forEach(name => {
    if(/تعليمات|instructions/i.test(name)) return;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    for(let i = 0; i < Math.min(rows.length, 15); i++){
      const cells = (rows[i] || []).map(c => String(c || '').trim().toLowerCase());
      const map = {};
      Object.entries(spec).forEach(([field, kws]) => {
        const idx = cells.findIndex((c, j) => c && !Object.values(map).includes(j) && kws.some(k => c.includes(k)));
        if(idx >= 0) map[field] = idx;
      });
      if(!requiredFields.every(f => map[f] != null)) continue;
      for(let r = i + 1; r < rows.length; r++){
        const row = rows[r] || [];
        const rec = {};
        Object.entries(map).forEach(([f, j]) => { rec[f] = String(row[j] ?? '').trim(); });
        if(Object.values(rec).some(Boolean)) out.push(rec);
      }
      break;
    }
  });
  return out;
}

function inputDownloadTemplate(kind){
  if(!window.XLSX) return showToast(inputIsEn() ? '⚠️ Excel library not loaded' : '⚠️ مكتبة Excel لم تُحمَّل');
  const templates = {
    teachers: {
      file: 'نموذج_المعلمين.xlsx',
      rows: [
        ['اسم المعلم', 'البريد الإلكتروني', 'رقم الهاتف'],
        ['أحمد محمد علي', 'ahmed.ali@school.ae', '0501234567'],
        ['سارة خالد', 'sara.k@school.ae', ''],
      ],
    },
    subjects: {
      file: 'نموذج_المواد.xlsx',
      rows: [
        ['المادة', 'Subject', 'الصف', 'المسار'],
        ['اللغة العربية', 'Arabic Language', 'الكل', 'الكل'],
        ['الفيزياء', 'Physics', '9', 'الكل'],
        ['الرياضيات المتقدمة', 'Advanced Mathematics', '10، 11، 12', 'متقدم'],
        ['الرياضيات', 'Mathematics', '10', 'عام'],
      ],
    },
    assignments: {
      file: 'نموذج_التكليفات.xlsx',
      rows: [
        ['اسم المعلم', 'البريد الإلكتروني', 'المادة', 'الصف', 'الشعبة'],
        ['أحمد محمد علي', 'ahmed.ali@school.ae', 'الفيزياء', '9', 'عام 1، عام 2، عام 3'],
        ['أحمد محمد علي', 'ahmed.ali@school.ae', 'الكيمياء', '9', 'عام 4، عام 5'],
        ['أحمد محمد علي', 'ahmed.ali@school.ae', 'الفيزياء', '10', 'متقدم 1'],
        ['سارة خالد', 'sara.k@school.ae', 'الرياضيات', '11', 'عام'],
        ['سارة خالد', 'sara.k@school.ae', 'الإحصاء', '12', 'متقدم 1، متقدم 2'],
        ['منى سعيد', 'mona.s@school.ae', 'الأحياء، علوم البيئة', '10', 'عام 1، عام 2'],
        ['خالد عمر', 'khaled.o@school.ae', 'اللغة العربية', '12', 'الكل'],
      ],
      help: [
        ['تعليمات تعبئة نموذج التكليفات'],
        [''],
        ['1', 'كل سطر = معلّم واحد + مادة (أو أكثر) + صف واحد + شعبة أو أكثر.'],
        ['2', 'المعلّم الذي يدرّس أكثر من مادة: اكتب سطراً لكل مادة مع شعبها (مثل أحمد: الفيزياء لشعب، والكيمياء لشعب أخرى).'],
        ['3', 'المعلّم الذي يدرّس نفس المادة لأكثر من صف: اكتب سطراً لكل صف.'],
        ['4', 'إن كان يدرّس مادتين لنفس الشعب، اكتبهما في خانة المادة مفصولتين بفاصلة (مثل: الأحياء، علوم البيئة).'],
        ['5', 'الشعبة: اكتب «عام 1» أو «متقدم 2»، أو عدة شعب مفصولة بفاصلة، أو «عام» لكل الشعب العامة، أو «متقدم» لكل الشعب المتقدمة، أو «الكل» لكل شعب الصف.'],
        ['6', 'البريد الإلكتروني ضروري — هو ما يسجّل به المعلّم ويُربط به حسابه. اكتب نفس البريد في كل أسطر المعلّم.'],
        ['7', 'أسماء المواد تُكتب بالعربية أو الإنجليزية، ويتعرّف التطبيق على المواد الموجودة مسبقاً ويضيف الجديدة تلقائياً.'],
        ['8', 'احذف الأسطر المثال قبل الرفع.'],
      ],
    },
  };
  const t = templates[kind];
  if(!t) return;
  const ws = XLSX.utils.aoa_to_sheet(t.rows);
  ws['!cols'] = t.rows[0].map(() => ({ wch: 26 }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }, { RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, kind === 'assignments' ? 'التكليفات' : 'Sheet1');
  if(t.help){
    const hs = XLSX.utils.aoa_to_sheet(t.help);
    hs['!cols'] = [{ wch: 6 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, hs, 'تعليمات');
  }
  XLSX.writeFile(wb, t.file);
}

// ── Teachers ──

function inputAllowlistUpdate(updates, email, name, phone){
  const key = emailKey(email);
  const prev = INPUT_DATA.allowlist[key];
  const rec = { ...(prev || {}), email };
  if(name && !prev?.name) rec.name = name;
  if(name) updates[`teacherAllowlist/${key}/name`] = rec.name || name;
  if(phone) { rec.phone = phone; updates[`teacherAllowlist/${key}/phone`] = phone; }
  updates[`teacherAllowlist/${key}/email`] = email;
  if(!prev){
    rec.addedAt = new Date().toISOString();
    updates[`teacherAllowlist/${key}/addedAt`] = rec.addedAt;
    updates[`teacherAllowlist/${key}/addedBy`] = auth?.currentUser?.uid || null;
  }
  INPUT_DATA.allowlist[key] = rec;
  return { key, isNew: !prev };
}

async function inputImportTeachers(input){
  const isEn = inputIsEn();
  try{
    const wb = await inputReadWorkbook(input);
    const rows = inputSheetRows(wb, {
      email: ['بريد', 'email', 'e-mail', 'ايميل', 'إيميل'],
      name: ['اسم', 'المعلم', 'name', 'teacher'],
      phone: ['هاتف', 'جوال', 'phone', 'mobile', 'واتس'],
    }, ['email']);
    const updates = {};
    let added = 0, updated = 0;
    const bad = [];
    rows.forEach(r => {
      const email = String(r.email || '').trim().toLowerCase();
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        if(r.name || r.email) bad.push(r.name || r.email);
        return;
      }
      const res = inputAllowlistUpdate(updates, email, r.name, normalizeParentPhone(r.phone || ''));
      res.isNew ? added++ : updated++;
    });
    if(!added && !updated){
      inputSetStatus('input-teachers-status', isEn ? '⚠️ No valid emails found — check the "Email" column' : '⚠️ لم يُعثر على بريد صحيح — تأكد من عمود «البريد الإلكتروني»', true);
      return;
    }
    await db.ref().update(updates);
    inputSetStatus('input-teachers-status',
      (isEn ? `✅ ${added} added, ${updated} updated` : `✅ أُضيف ${added} معلماً، وحُدّث ${updated}`)
      + (bad.length ? (isEn ? `\n⚠️ Skipped (no valid email): ` : `\n⚠️ تم تجاهل (بدون بريد صحيح): `) + bad.slice(0, 10).join('، ') : ''),
      bad.length > 0);
    inputRenderAll();
  }catch(e){
    console.error('inputImportTeachers', e);
    inputSetStatus('input-teachers-status', '❌ ' + (e.message || e), true);
  }finally{ input.value = ''; }
}

async function inputAddTeacherManual(){
  const isEn = inputIsEn();
  const nameEl = document.getElementById('input-teacher-name');
  const emailEl = document.getElementById('input-teacher-email');
  const name = (nameEl?.value || '').trim();
  const email = (emailEl?.value || '').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast(isEn ? '⚠️ Enter a valid email' : '⚠️ أدخل بريداً إلكترونياً صحيحاً');
  if(!name) return showToast(isEn ? '⚠️ Enter the teacher name' : '⚠️ أدخل اسم المعلم');
  try{
    const updates = {};
    inputAllowlistUpdate(updates, email, name, '');
    await db.ref().update(updates);
    if(nameEl) nameEl.value = '';
    if(emailEl) emailEl.value = '';
    showToast(isEn ? '✅ Teacher added' : '✅ تمت إضافة المعلم');
    inputRenderAll();
  }catch(e){
    console.error('inputAddTeacherManual', e);
    showToast(isEn ? '❌ Failed to add teacher' : '❌ فشل إضافة المعلم');
  }
}

async function inputRemoveTeacher(key){
  const isEn = inputIsEn();
  const t = INPUT_DATA.allowlist[key];
  if(!t) return;
  const count = Object.values(INPUT_DATA.assignments).filter(a => emailKey(a.email) === key).length;
  if(!confirm(isEn
    ? `Remove "${t.name || t.email}" from approved teachers${count ? ` and delete ${count} assignments` : ''}?`
    : `إزالة "${t.name || t.email}" من المعلمين المعتمدين${count ? ` وحذف ${count} تكليفاً له` : ''}؟`)) return;
  try{
    Object.entries(INPUT_DATA.assignments).forEach(([id, a]) => { if(emailKey(a.email) === key) delete INPUT_DATA.assignments[id]; });
    delete INPUT_DATA.allowlist[key];
    await db.ref('teacherAllowlist/' + key).remove();
    if(count) await inputSaveAssignments();
    inputRenderAll();
  }catch(e){
    console.error('inputRemoveTeacher', e);
    showToast(isEn ? '❌ Remove failed' : '❌ فشل الحذف');
  }
}

function inputTeacherSummaries(){
  const map = {};
  Object.values(INPUT_DATA.assignments || {}).forEach(a => {
    if(!a?.email) return;
    const key = emailKey(a.email);
    if(!map[key]) map[key] = { email: a.email, name: a.name || '', subjects: {} };
    if(!map[key].name && a.name) map[key].name = a.name;
    const subj = map[key].subjects[a.subject] = map[key].subjects[a.subject] || {};
    (subj[a.grade] = subj[a.grade] || new Set()).add(a.section);
  });
  return map;
}

function inputFormatClasses(gradeSecs){
  const isEn = inputIsEn();
  return sortGradeKeys(Object.keys(gradeSecs)).map(g =>
    `${isEn ? 'G' : 'ص'}${g}: ${sortSectionKeys([...gradeSecs[g]]).map(s => formatSectionLabel(s, isEn)).join('، ')}`
  ).join(' · ');
}

function inputRenderTeachers(){
  const tbody = document.getElementById('input-teachers-tbody');
  if(!tbody) return;
  const isEn = inputIsEn();
  const summaries = inputTeacherSummaries();
  const keys = new Set([...Object.keys(INPUT_DATA.allowlist || {}), ...Object.keys(summaries)]);
  if(!keys.size){
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="ico">👩‍🏫</div><p>${isEn ? 'No teachers yet' : 'لا يوجد معلمون بعد'}</p></td></tr>`;
    return;
  }
  const rows = [...keys].map(key => {
    const allow = INPUT_DATA.allowlist[key] || {};
    const sum = summaries[key];
    const teacher = INPUT_DATA.teachers?.[key];
    return { key, name: allow.name || sum?.name || teacher?.name || '', email: allow.email || sum?.email || teacher?.email || '', sum, registered: !!teacher?.uid };
  }).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'ar'));
  tbody.innerHTML = rows.map(r => {
    const subjects = r.sum ? Object.keys(r.sum.subjects).map(inputSubjectLabel).join('، ') : '—';
    const classes = r.sum
      ? Object.entries(r.sum.subjects).map(([subj, gs]) =>
          `<div><strong>${escapeHtml(inputSubjectLabel(subj))}:</strong> ${escapeHtml(inputFormatClasses(gs))}</div>`).join('')
      : '—';
    return `<tr>
      <td style="font-weight:600">${escapeHtml(r.name || '—')}</td>
      <td style="font-size:12px;direction:ltr;text-align:left">${escapeHtml(r.email)}</td>
      <td>${escapeHtml(subjects)}</td>
      <td style="font-size:12px;line-height:1.7">${classes}</td>
      <td style="font-size:12px">${r.registered ? (isEn ? '✅ Registered' : '✅ مسجّل') : (isEn ? '⏳ Not registered yet' : '⏳ لم يسجّل بعد')}</td>
      <td>${r.registered ? '' : `<button type="button" class="action-btn danger" style="font-size:12px;padding:4px 10px" onclick="inputRemoveTeacher('${escapeHtml(r.key)}')">🗑️</button>`}</td>
    </tr>`;
  }).join('');
}

// ── Subjects per grade/track (curriculum) ──

function inputCurriculumAdd(updates, grades, tracks, key){
  grades.forEach(g => tracks.forEach(t => {
    if(!INPUT_DATA.curriculum[g]) INPUT_DATA.curriculum[g] = {};
    if(!INPUT_DATA.curriculum[g][t]) INPUT_DATA.curriculum[g][t] = {};
    INPUT_DATA.curriculum[g][t][key] = true;
    updates[`curriculum/${g}/${t}/${key}`] = true;
  }));
}

function inputParseGradesCell(val){
  const all = getSchoolGrades();
  const parts = inputSplitList(val);
  if(!parts.length || parts.some(p => /^(الكل|كل|all)$/i.test(p))) return all;
  return [...new Set(parts.map(normalizeGradeCell).filter(Boolean))];
}

async function inputImportSubjects(input){
  const isEn = inputIsEn();
  try{
    const wb = await inputReadWorkbook(input);
    const rows = inputSheetRows(wb, {
      en: ['subject', 'english', 'بالانجليزي', 'بالإنجليزي'],
      ar: ['المادة', 'مادة', 'بالعربي'],
      grade: ['الصف', 'grade', 'class'],
      track: ['المسار', 'track', 'stream'],
    }, ['ar']);
    const updates = {};
    let count = 0;
    const bad = [];
    rows.forEach(r => {
      if(!r.ar && !r.en) return;
      const grades = inputParseGradesCell(r.grade);
      const tracks = inputSplitList(r.track).map(inputParseTrack);
      if(tracks.includes('') || !grades.length){ bad.push(r.ar || r.en); return; }
      const key = inputEnsureSubject(r.ar || r.en, r.en, updates);
      inputCurriculumAdd(updates, grades, tracks.length ? tracks : ['ALL'], key);
      count++;
    });
    if(!count){
      inputSetStatus('input-subjects-status', isEn ? '⚠️ No subjects found — check the "Subject" column' : '⚠️ لم يُعثر على مواد — تأكد من عمود «المادة»', true);
      return;
    }
    await db.ref().update(updates);
    inputSetStatus('input-subjects-status',
      (isEn ? `✅ ${count} rows saved` : `✅ حُفظ ${count} سطراً من المواد`)
      + (bad.length ? (isEn ? '\n⚠️ Unrecognized grade/track: ' : '\n⚠️ صف أو مسار غير مفهوم: ') + bad.slice(0, 10).join('، ') : ''),
      bad.length > 0);
    inputRenderAll();
  }catch(e){
    console.error('inputImportSubjects', e);
    inputSetStatus('input-subjects-status', '❌ ' + (e.message || e), true);
  }finally{ input.value = ''; }
}

async function inputAddSubjectManual(){
  const isEn = inputIsEn();
  const grade = document.getElementById('input-subject-grade')?.value || 'ALL';
  const track = document.getElementById('input-subject-track')?.value || 'ALL';
  const arEl = document.getElementById('input-subject-ar');
  const enEl = document.getElementById('input-subject-en');
  const ar = (arEl?.value || '').trim();
  const en = (enEl?.value || '').trim();
  if(!ar && !en) return showToast(isEn ? '⚠️ Enter the subject name' : '⚠️ أدخل اسم المادة');
  try{
    const updates = {};
    const key = inputEnsureSubject(ar || en, en, updates);
    inputCurriculumAdd(updates, grade === 'ALL' ? getSchoolGrades() : [grade], [track], key);
    await db.ref().update(updates);
    if(arEl) arEl.value = '';
    if(enEl) enEl.value = '';
    showToast(isEn ? '✅ Subject added' : '✅ تمت إضافة المادة');
    inputRenderAll();
  }catch(e){
    console.error('inputAddSubjectManual', e);
    showToast(isEn ? '❌ Failed to add subject' : '❌ فشل إضافة المادة');
  }
}

async function inputRemoveCurriculum(grade, track, key){
  const isEn = inputIsEn();
  if(!confirm(isEn
    ? `Remove "${inputSubjectLabel(key)}" from Grade ${grade} (${inputTrackLabel(track)})?`
    : `حذف "${inputSubjectLabel(key)}" من الصف ${grade} (${inputTrackLabel(track)})؟`)) return;
  try{
    await db.ref(`curriculum/${grade}/${track}/${key}`).remove();
    delete INPUT_DATA.curriculum?.[grade]?.[track]?.[key];
    inputRenderAll();
  }catch(e){
    console.error('inputRemoveCurriculum', e);
    showToast(isEn ? '❌ Remove failed' : '❌ فشل الحذف');
  }
}

function inputRenderCurriculum(){
  const wrap = document.getElementById('input-curriculum-view');
  if(!wrap) return;
  const isEn = inputIsEn();
  const cur = INPUT_DATA.curriculum || {};
  const grades = sortGradeKeys([...getSchoolGrades(), ...Object.keys(cur)]);
  const blocks = grades.map(g => {
    const tracks = [...new Set([...inputTracksForGrade(g), ...Object.keys(cur[g] || {})])];
    const rows = tracks.map(t => {
      const keys = Object.keys(cur[g]?.[t] || {});
      if(!keys.length) return '';
      const chips = keys.sort((a, b) => inputSubjectLabel(a).localeCompare(inputSubjectLabel(b), 'ar')).map(k =>
        `<span class="input-chip">📚 ${escapeHtml(inputSubjectLabel(k))}<button type="button" title="${isEn ? 'Remove' : 'حذف'}" onclick="inputRemoveCurriculum('${escapeHtml(g)}','${escapeHtml(t)}','${escapeHtml(k)}')">✕</button></span>`
      ).join('');
      return `<div class="admin-sec-row"><div class="admin-sec-label">${escapeHtml(inputTrackLabel(t))}</div><div class="admin-missing-chips">${chips}</div></div>`;
    }).join('');
    if(!rows) return '';
    return `<div class="admin-grade-block"><h4 class="admin-grade-title">🎓 ${escapeHtml(formatGradeLabel(g, isEn))}</h4>${rows}</div>`;
  }).join('');
  wrap.innerHTML = blocks || `<div class="empty-state"><div class="ico">📚</div><p>${isEn ? 'No subjects yet — upload a list, add manually, or upload assignments' : 'لا توجد مواد بعد — ارفع قائمة أو أضف يدوياً أو ارفع التكليفات'}</p></div>`;
}

// ── Assignments ──

function inputAssignmentId(a){
  return [emailKey(a.email), a.subject, a.grade, a.section].join('__');
}

function inputResolveTeacher(text, nameHint){
  const s = String(text || '').trim().toLowerCase();
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)){
    const allow = INPUT_DATA.allowlist[emailKey(s)];
    return { email: s, name: nameHint || allow?.name || '' };
  }
  const n = inputNormName(nameHint || text);
  if(!n) return null;
  const hit = Object.values(INPUT_DATA.allowlist || {}).find(t => inputNormName(t?.name) === n)
    || Object.values(INPUT_DATA.assignments || {}).find(a => inputNormName(a?.name) === n);
  return hit?.email ? { email: hit.email, name: nameHint || hit.name || '' } : null;
}

// Returns {classes:[{grade, section}], warn}
function inputExpandClasses(gradeCell, sectionCell, trackCell){
  let grade = '';
  let sectionTokens = inputSplitList(sectionCell);
  const fromTitle = parseClassTitle(gradeCell) || parseClassTitle('الصف ' + gradeCell);
  if(fromTitle){
    grade = fromTitle.grade;
    if(!sectionTokens.length) sectionTokens = [fromTitle.section];
  }else{
    grade = normalizeGradeCell(gradeCell);
  }
  if(!grade) return { classes: [], warn: 'grade' };
  const existing = getSchoolSections(grade);
  const track = trackCell ? inputParseTrack(trackCell) : '';
  if(!sectionTokens.length){
    const list = track && track !== 'ALL' ? existing.filter(s => inputTrackOfSection(s) === track) : existing;
    return { classes: list.map(section => ({ grade, section })), warn: list.length ? '' : 'section' };
  }
  const out = [];
  let warn = '';
  sectionTokens.forEach(tok => {
    if(/^(الكل|كل|كل الشعب|all)$/i.test(tok) || tok === 'ALL'){
      existing.forEach(section => out.push({ grade, section }));
      return;
    }
    let code = tok.startsWith('TRACK:') ? tok.slice(6) : normalizeSectionCell(/^\d+$/.test(tok) && track && track !== 'ALL' ? track + tok : tok);
    if(!code){ warn = 'section'; return; }
    if(existing.includes(code)){ out.push({ grade, section: code }); return; }
    if(INPUT_TRACK_LABELS[code] && code !== 'ALL'){
      const list = existing.filter(s => inputTrackOfSection(s) === code);
      if(list.length){ list.forEach(section => out.push({ grade, section })); return; }
    }
    if(existing.length) warn = 'section';
    out.push({ grade, section: code });
  });
  return { classes: out, warn };
}

async function inputImportAssignments(input){
  const isEn = inputIsEn();
  try{
    if(!INPUT_DATA.loaded) await inputLoadAll();
    const wb = await inputReadWorkbook(input);
    const rows = inputSheetRows(wb, {
      email: ['بريد', 'email', 'e-mail', 'ايميل', 'إيميل'],
      name: ['اسم المعلم', 'المعلم', 'المعلمة', 'teacher', 'الاسم'],
      subject: ['المادة', 'subject', 'مادة'],
      grade: ['الصف', 'grade', 'class'],
      section: ['الشعبة', 'الشعب', 'section'],
      track: ['المسار', 'track', 'stream'],
    }, ['subject', 'grade']);
    if(!rows.length){
      inputSetStatus('input-assign-status', isEn ? '⚠️ Header row not found — use the template columns' : '⚠️ لم يُعثر على صف العناوين — استخدم أعمدة النموذج', true);
      return;
    }
    const replace = !!document.getElementById('input-assign-replace')?.checked;
    if(replace && !confirm(isEn ? 'Replace ALL current assignments with this file?' : 'استبدال كل التكليفات الحالية بمحتوى هذا الملف؟')) return;
    const subjectUpdates = {};
    const next = replace ? {} : { ...INPUT_DATA.assignments };
    const noTeacher = new Set(), badClass = new Set();
    let added = 0;
    rows.forEach(r => {
      if(!r.subject) return;
      const teacher = inputResolveTeacher(r.email || r.name, r.name);
      if(!teacher){ noTeacher.add(r.name || r.email || '?'); return; }
      const { classes, warn } = inputExpandClasses(r.grade, r.section, r.track);
      if(warn) badClass.add(`${r.grade} ${r.section}`.trim());
      if(!classes.length) return;
      inputSplitSubjects(r.subject).forEach(subjName => {
        const subject = inputEnsureSubject(subjName, '', subjectUpdates);
        classes.forEach(c => {
          const a = { email: teacher.email, name: teacher.name || '', subject, grade: c.grade, section: c.section };
          const id = inputAssignmentId(a);
          if(!next[id]) added++;
          next[id] = a;
        });
      });
    });
    INPUT_DATA.assignments = next;
    const summary = await inputSaveAssignments(subjectUpdates);
    let msg = isEn
      ? `✅ ${Object.keys(next).length} assignments saved (${added} new) — ${summary.teachers} teachers, ${summary.subjects} subjects`
      : `✅ حُفظ ${Object.keys(next).length} تكليفاً (${added} جديد) — ${summary.teachers} معلماً، ${summary.subjects} مادة`;
    if(noTeacher.size) msg += (isEn ? '\n⚠️ No email for teacher: ' : '\n⚠️ معلم بدون بريد (أضف عمود البريد أو أضفه في قسم المعلمين): ') + [...noTeacher].slice(0, 10).join('، ');
    if(badClass.size) msg += (isEn ? '\n⚠️ Unknown class/section: ' : '\n⚠️ صف أو شعبة غير موجودة في قائمة الطلاب: ') + [...badClass].slice(0, 10).join('، ');
    inputSetStatus('input-assign-status', msg, noTeacher.size > 0 || badClass.size > 0);
  }catch(e){
    console.error('inputImportAssignments', e);
    inputSetStatus('input-assign-status', '❌ ' + (e.message || e), true);
  }finally{ input.value = ''; }
}

async function inputAddAssignmentManual(){
  const isEn = inputIsEn();
  if(!INPUT_DATA.loaded) await inputLoadAll();
  const teacherText = (document.getElementById('input-assign-teacher')?.value || '').trim();
  const subjectText = (document.getElementById('input-assign-subject')?.value || '').trim();
  const grade = document.getElementById('input-assign-grade')?.value || '';
  const section = document.getElementById('input-assign-section')?.value || '';
  if(!teacherText) return showToast(isEn ? '⚠️ Enter the teacher email' : '⚠️ أدخل بريد المعلم');
  if(!subjectText) return showToast(isEn ? '⚠️ Enter the subject' : '⚠️ أدخل المادة');
  if(!grade) return showToast(isEn ? '⚠️ Upload the student list first' : '⚠️ ارفع قائمة الطلاب أولاً');
  const teacher = inputResolveTeacher(teacherText, '');
  if(!teacher) return showToast(isEn ? '⚠️ Teacher not found — type the email' : '⚠️ المعلم غير موجود — اكتب بريده الإلكتروني');
  const { classes } = inputExpandClasses(grade, section, '');
  if(!classes.length) return showToast(isEn ? '⚠️ No sections in this grade' : '⚠️ لا توجد شعب في هذا الصف');
  try{
    const updates = {};
    const subjects = inputSplitSubjects(subjectText);
    subjects.forEach(subjName => {
      const subject = inputEnsureSubject(subjName, '', updates);
      classes.forEach(c => {
        const a = { email: teacher.email, name: teacher.name || '', subject, grade: c.grade, section: c.section };
        INPUT_DATA.assignments[inputAssignmentId(a)] = a;
      });
    });
    await inputSaveAssignments(updates);
    const subjEl = document.getElementById('input-assign-subject');
    if(subjEl) subjEl.value = '';
    const n = subjects.length * classes.length;
    showToast(isEn ? `✅ ${n} assignment(s) added` : `✅ أُضيف ${n} تكليف`);
  }catch(e){
    console.error('inputAddAssignmentManual', e);
    showToast(isEn ? '❌ Save failed' : '❌ فشل الحفظ');
  }
}

async function inputRemoveAssignment(id){
  const isEn = inputIsEn();
  if(!INPUT_DATA.assignments[id]) return;
  delete INPUT_DATA.assignments[id];
  try{ await inputSaveAssignments(); }
  catch(e){ console.error('inputRemoveAssignment', e); showToast(isEn ? '❌ Delete failed' : '❌ فشل الحذف'); }
}

// Saves assignments and derives teachers (allowlist + registered profiles) and curriculum from them.
async function inputSaveAssignments(extraUpdates){
  const updates = { ...(extraUpdates || {}) };
  const assignments = INPUT_DATA.assignments;
  updates['teachingAssignments'] = Object.keys(assignments).length ? assignments : null;

  const summaries = inputTeacherSummaries();
  const now = new Date().toISOString();
  const subjectsUsed = new Set();

  Object.values(assignments).forEach(a => {
    subjectsUsed.add(a.subject);
    const track = inputTrackOfSection(a.section);
    if(!INPUT_DATA.curriculum?.[a.grade]?.ALL?.[a.subject] && !INPUT_DATA.curriculum?.[a.grade]?.[track]?.[a.subject]){
      inputCurriculumAdd(updates, [a.grade], [track], a.subject);
    }
  });

  Object.entries(summaries).forEach(([key, s]) => {
    inputAllowlistUpdate(updates, s.email, s.name, '');
    const counts = Object.entries(s.subjects).map(([subj, gs]) =>
      [subj, Object.values(gs).reduce((n, set) => n + set.size, 0)]).sort((a, b) => b[1] - a[1]);
    const gradeMap = {};
    const subjectMap = {};
    Object.entries(s.subjects).forEach(([subj, gs]) => {
      subjectMap[subj] = {};
      Object.entries(gs).forEach(([g, set]) => {
        subjectMap[subj][g] = sortSectionKeys([...set]);
        gradeMap[g] = sortSectionKeys([...(gradeMap[g] || []), ...set]);
      });
    });
    const derived = {
      subject: counts[0][0],
      subjects: Object.fromEntries(counts.map(([k]) => [k, true])),
      subjectMap,
      gradeMap,
      grades: sortGradeKeys(Object.keys(gradeMap)),
      sections: sortSectionKeys(Object.values(gradeMap).flat()),
    };
    ['subject', 'subjects', 'subjectMap', 'gradeMap'].forEach(f => { updates[`teacherAllowlist/${key}/${f}`] = derived[f]; });
    updates[`teacherAllowlist/${key}/assignedAt`] = now;
    Object.assign(INPUT_DATA.allowlist[key], derived, { assignedAt: now });
    const teacher = INPUT_DATA.teachers?.[key];
    if(teacher?.uid && teacher.role !== 'admin'){
      Object.entries(derived).forEach(([f, v]) => { updates[`teachers/${key}/${f}`] = v; });
      Object.assign(teacher, derived);
    }
  });

  Object.entries(INPUT_DATA.allowlist).forEach(([key, t]) => {
    if(summaries[key] || !t?.assignedAt) return;
    ['subject', 'subjects', 'subjectMap', 'gradeMap', 'assignedAt'].forEach(f => { updates[`teacherAllowlist/${key}/${f}`] = null; delete t[f]; });
  });

  await db.ref().update(updates);
  Object.entries(summaries).forEach(([key]) => {
    const teacher = INPUT_DATA.teachers?.[key];
    if(teacher?.uid && teacher.role !== 'admin' && typeof syncPublicTeacher === 'function'){
      syncPublicTeacher(key, teacher).catch(() => {});
    }
  });
  inputRenderAll();
  return { teachers: Object.keys(summaries).length, subjects: subjectsUsed.size };
}

function inputSetAssignView(view, el){
  inputAssignView = view;
  document.querySelectorAll('#input-panel-assignments .input-view-switch .nav-tab').forEach(b => b.classList.toggle('active', b === el || b.dataset.view === view));
  inputRenderAssignments();
}

function inputRenderAssignments(){
  const wrap = document.getElementById('input-assign-view');
  if(!wrap) return;
  const isEn = inputIsEn();
  const list = Object.entries(INPUT_DATA.assignments || {}).map(([id, a]) => ({ id, ...a }));
  if(!list.length){
    wrap.innerHTML = `<div class="empty-state"><div class="ico">🗂️</div><p>${isEn ? 'No assignments yet' : 'لا توجد تكليفات بعد'}</p></div>`;
    return;
  }
  const teacherName = a => a.name || INPUT_DATA.allowlist[emailKey(a.email)]?.name || a.email;

  if(inputAssignView === 'teachers'){
    const summaries = inputTeacherSummaries();
    wrap.innerHTML = `<div class="input-matrix">` + Object.entries(summaries)
      .sort((a, b) => (a[1].name || a[1].email).localeCompare(b[1].name || b[1].email, 'ar'))
      .map(([key, s]) => {
        const rows = Object.entries(s.subjects).map(([subj, gs]) =>
          `<div class="admin-sec-row"><div class="admin-sec-label">📚 ${escapeHtml(inputSubjectLabel(subj))}</div><div class="admin-missing-chips">${
            sortGradeKeys(Object.keys(gs)).map(g => sortSectionKeys([...gs[g]]).map(sec =>
              `<span class="input-chip">${escapeHtml(formatGradeLabel(g, isEn))} — ${escapeHtml(formatSectionLabel(sec, isEn))}</span>`).join('')).join('')
          }</div></div>`).join('');
        return `<div class="admin-grade-block"><h4 class="admin-grade-title">👩‍🏫 ${escapeHtml(s.name || s.email)} <small style="font-weight:500;color:var(--grey-3);direction:ltr">${escapeHtml(s.email)}</small></h4>${rows}</div>`;
      }).join('') + `</div>`;
    return;
  }

  if(inputAssignView === 'classes'){
    const byClass = {};
    list.forEach(a => {
      const k = a.grade + '|' + a.section;
      (byClass[k] = byClass[k] || {})[a.subject] = teacherName(a);
    });
    const grades = sortGradeKeys([...getSchoolGrades(), ...list.map(a => a.grade)]);
    wrap.innerHTML = `<div class="input-matrix">` + grades.map(g => {
      const secs = sortSectionKeys([...getSchoolSections(g), ...list.filter(a => a.grade === g).map(a => a.section)]);
      const tracks = [...new Set(secs.map(inputTrackOfSection))];
      const trackBlocks = tracks.map(t => {
        const rows = secs.filter(s => inputTrackOfSection(s) === t).map(sec => {
          const assigned = byClass[g + '|' + sec] || {};
          const expected = inputSubjectsForClass(g, sec);
          const all = [...new Set([...Object.keys(assigned), ...expected])]
            .sort((a, b) => inputSubjectLabel(a).localeCompare(inputSubjectLabel(b), 'ar'));
          const chips = all.map(subj => assigned[subj]
            ? `<span class="input-chip">📚 ${escapeHtml(inputSubjectLabel(subj))} — ${escapeHtml(assigned[subj])}</span>`
            : `<span class="input-chip missing">📚 ${escapeHtml(inputSubjectLabel(subj))} — ${isEn ? 'no teacher' : 'بلا معلم'}</span>`).join('');
          return `<div class="admin-sec-row"><div class="admin-sec-label">${escapeHtml(formatSectionLabel(sec, isEn))}</div><div class="admin-missing-chips">${chips || '—'}</div></div>`;
        }).join('');
        const title = t === 'ALL' ? '' : `<div style="font-size:12px;font-weight:700;color:var(--grey-2);margin:8px 0 6px">🛤️ ${isEn ? 'Track' : 'المسار'}: ${escapeHtml(inputTrackLabel(t))}</div>`;
        return title + rows;
      }).join('');
      return `<div class="admin-grade-block"><h4 class="admin-grade-title">🎓 ${escapeHtml(formatGradeLabel(g, isEn))}</h4>${trackBlocks}</div>`;
    }).join('') + `</div>`;
    return;
  }

  const secOrder = {};
  sortSectionKeys(list.map(a => a.section)).forEach((s, i) => { secOrder[s] = i; });
  list.sort((a, b) => (Number(a.grade) - Number(b.grade))
    || (secOrder[a.section] - secOrder[b.section])
    || inputSubjectLabel(a.subject).localeCompare(inputSubjectLabel(b.subject), 'ar'));
  wrap.innerHTML = `<div class="table-wrap admin-table-wrap"><table class="admin-table">
    <thead><tr><th>${isEn ? 'Teacher' : 'المعلم'}</th><th>${isEn ? 'Subject' : 'المادة'}</th><th>${isEn ? 'Grade' : 'الصف'}</th><th>${isEn ? 'Section' : 'الشعبة'}</th><th></th></tr></thead>
    <tbody>${list.map(a => `<tr>
      <td>${escapeHtml(teacherName(a))}</td>
      <td>${escapeHtml(inputSubjectLabel(a.subject))}</td>
      <td>${escapeHtml(a.grade)}</td>
      <td>${escapeHtml(formatSectionLabel(a.section, isEn))}</td>
      <td><button type="button" class="action-btn danger" style="font-size:12px;padding:3px 8px" onclick="inputRemoveAssignment('${escapeHtml(a.id)}')">🗑️</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

setTimeout(() => { loadSchoolSubjects(); }, 0);
