const API = '';
let token = localStorage.getItem('token') || '';
let user = JSON.parse(localStorage.getItem('user') || 'null');
let currentExam = null;
let timerHandle = null;

const $ = (id) => document.getElementById(id);

function toast(msg, type) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3800);
}

async function api(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, Object.assign({}, options, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pctBadge(p) {
  const cls = p >= 60 ? 'badge-ok' : p >= 40 ? 'badge-warn' : 'badge-bad';
  return '<span class="badge ' + cls + '">' + p + '%</span>';
}

function statusBadge(status) {
  const map = {
    submitted: ['badge-ok', 'Submitted'],
    not_attempted: ['badge-neutral', 'Not started'],
    in_progress: ['badge-warn', 'In progress'],
    expired: ['badge-bad', 'Expired']
  };
  const [cls, label] = map[status] || ['badge-neutral', status];
  return '<span class="badge ' + cls + '">' + label + '</span>';
}

function show(view) {
  ['view-auth', 'view-student', 'view-admin'].forEach((v) => $(v).classList.add('hidden'));
  $(view).classList.remove('hidden');
  $('user-bar').classList.toggle('hidden', !user);
  if (user) $('user-info').textContent = user.name + ' · ' + (user.role === 'admin' ? 'Administrator' : 'Student');
}

function logout() {
  token = '';
  user = null;
  currentExam = null;
  if (timerHandle) clearInterval(timerHandle);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  show('view-auth');
  toast('Signed out', 'success');
}

// ---------- Auth ----------
document.querySelectorAll('[data-auth-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-auth-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const isLogin = btn.dataset.authTab === 'login';
    $('login-form').classList.toggle('hidden', !isLogin);
    $('register-form').classList.toggle('hidden', isLogin);
  });
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('login-email').value, password: $('login-password').value })
    });
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    toast('Welcome back, ' + user.name, 'success');
    route();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: $('reg-name').value, email: $('reg-email').value, password: $('reg-password').value })
    });
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    toast('Account created — welcome!', 'success');
    route();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('logout-btn').addEventListener('click', logout);

// ---------- Student ----------
async function loadStudentExams() {
  const { exams } = await api('/api/exams');
  const tbody = $('student-exams-table').querySelector('tbody');
  tbody.innerHTML = '';
  $('student-exams-empty').classList.toggle('hidden', exams.length > 0);
  exams.forEach((exam) => {
    const tr = document.createElement('tr');
    const canStart = exam.status === 'not_attempted' || exam.status === 'in_progress';
    tr.innerHTML =
      '<td><strong>' + esc(exam.title) + '</strong></td>' +
      '<td>' + esc(exam.subject) + '</td>' +
      '<td>' + exam.questionCount + '</td>' +
      '<td>' + exam.durationMinutes + ' min</td>' +
      '<td>' + statusBadge(exam.status) +
      (exam.score != null ? ' ' + pctBadge(Math.round((exam.score / exam.totalMarks) * 100)) : '') +
      '</td>' +
      '<td>' + (canStart ? '<button class="btn btn-primary btn-small" data-exam="' + exam.id + '">' +
        (exam.status === 'in_progress' ? 'Resume' : 'Start') + '</button>' : '') + '</td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-exam]').forEach((btn) => {
    btn.addEventListener('click', () => startExam(btn.dataset.exam));
  });
}

function updateProgress() {
  if (!currentExam) return;
  const total = currentExam.questions.length;
  let answered = 0;
  currentExam.questions.forEach((q) => {
    if (document.querySelector('input[name="q_' + q.id + '"]:checked')) answered++;
  });
  $('answered-count').textContent = answered;
  $('total-count').textContent = total;
  $('answered-progress').style.width = (total ? (answered / total) * 100 : 0) + '%';
  document.querySelectorAll('.nav-dot').forEach((dot) => {
    const idx = Number(dot.dataset.index);
    const q = currentExam.questions[idx];
    dot.classList.toggle('answered', !!document.querySelector('input[name="q_' + q.id + '"]:checked'));
  });
}

async function startExam(examId) {
  try {
    const data = await api('/api/exams/' + examId + '/start', { method: 'POST' });
    currentExam = data.exam;
    $('exam-taking-card').classList.remove('hidden');
    $('exam-taking-title').textContent = currentExam.title;

    const navigator = $('exam-navigator');
    navigator.innerHTML = '';
    currentExam.questions.forEach((q, qi) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'nav-dot';
      dot.dataset.index = qi;
      dot.textContent = qi + 1;
      dot.addEventListener('click', () => {
        const el = document.getElementById('question-' + qi);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      navigator.appendChild(dot);
    });

    const container = $('exam-questions');
    container.innerHTML = '';
    currentExam.questions.forEach((q, qi) => {
      const div = document.createElement('div');
      div.className = 'question-block';
      div.id = 'question-' + qi;
      div.innerHTML = '<p class="q-text">Q' + (qi + 1) + '. ' + esc(q.text) +
        ' <span class="q-marks">(' + (q.marks || 1) + ' mark' + ((q.marks || 1) === 1 ? '' : 's') + ')</span></p>';
      const opts = document.createElement('div');
      opts.className = 'q-options';
      q.options.forEach((opt, oi) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'q_' + q.id;
        input.value = oi;
        input.addEventListener('change', updateProgress);
        label.appendChild(input);
        label.appendChild(document.createTextNode(opt));
        opts.appendChild(label);
      });
      div.appendChild(opts);
      container.appendChild(div);
    });
    updateProgress();

    const deadline = new Date(data.attempt.startedAt).getTime() + currentExam.durationMinutes * 60000;
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const pill = $('exam-timer');
      pill.textContent = m + ':' + String(s).padStart(2, '0');
      pill.classList.toggle('danger', left < 60000);
      if (left <= 0) {
        clearInterval(timerHandle);
        submitExam(true);
      }
    }, 1000);
    $('exam-taking-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    toast(err.message, 'error');
    loadStudentExams();
  }
}

async function submitExam(auto) {
  if (!currentExam) return;
  if (!auto) {
    const answered = document.querySelectorAll('#exam-questions input:checked').length;
    const total = currentExam.questions.length;
    if (answered < total &&
        !confirm('You have answered ' + answered + ' of ' + total + ' questions. Submit anyway?')) {
      return;
    }
  }
  const btn = $('submit-exam-btn');
  btn.disabled = true;
  const answers = {};
  currentExam.questions.forEach((q) => {
    const selected = document.querySelector('input[name="q_' + q.id + '"]:checked');
    if (selected) answers[q.id] = Number(selected.value);
  });
  try {
    const data = await api('/api/exams/' + currentExam.id + '/submit', {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    toast('Submitted! You scored ' + data.result.score + '/' + data.result.totalMarks +
      ' (' + data.result.percentage + '%)', 'success');
    $('exam-taking-card').classList.add('hidden');
    currentExam = null;
    if (timerHandle) clearInterval(timerHandle);
    loadStudentExams();
    loadMyResults();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

$('submit-exam-btn').addEventListener('click', () => submitExam(false));
$('student-refresh').addEventListener('click', () => loadStudentExams().catch((e) => toast(e.message, 'error')));
$('results-refresh').addEventListener('click', () => loadMyResults().catch((e) => toast(e.message, 'error')));

async function loadMyResults() {
  const { results } = await api('/api/results/my');
  const tbody = $('results-table').querySelector('tbody');
  $('results-empty').classList.toggle('hidden', results.length > 0);
  tbody.innerHTML = results
    .map(
      (r) =>
        '<tr><td><strong>' + esc(r.examTitle) + '</strong></td><td>' + r.score + '</td><td>' + r.totalMarks +
        '</td><td>' + pctBadge(r.percentage) + '</td><td>' + new Date(r.submittedAt).toLocaleString() + '</td></tr>'
    )
    .join('');
}

// ---------- Admin ----------
async function loadStudents() {
  const { students } = await api('/api/students');
  $('stat-students').textContent = students.length;
  $('students-table').querySelector('tbody').innerHTML = students
    .map(
      (s) =>
        '<tr><td><strong>' + esc(s.name) + '</strong></td><td>' + esc(s.email) +
        '</td><td>' + esc(s.rollNumber) + '</td><td>' + esc(s.course) + '</td></tr>'
    )
    .join('');
}

async function loadQuestions() {
  const { questions } = await api('/api/questions');
  $('stat-questions').textContent = questions.length;
  $('questions-table').querySelector('tbody').innerHTML = questions
    .map(
      (q) =>
        '<tr><td>' + esc(q.text) + '</td><td>' + esc(q.subject) + '</td><td>' + q.marks +
        '</td><td><span class="badge badge-brand">' + esc(q.options[q.correctIndex]) + '</span></td>' +
        '<td><button class="btn btn-danger btn-small" data-del-q="' + q.id + '">Delete</button></td></tr>'
    )
    .join('');
  $('exam-question-picker').innerHTML = questions
    .map((q) => '<label><input type="checkbox" value="' + q.id + '" /> ' + esc(q.text) + '</label>')
    .join('');
  document.querySelectorAll('[data-del-q]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this question?')) return;
      try {
        await api('/api/questions/' + btn.dataset.delQ, { method: 'DELETE' });
        toast('Question deleted', 'success');
        loadQuestions();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

$('question-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const options = [$('q-opt0').value, $('q-opt1').value, $('q-opt2').value, $('q-opt3').value].filter(Boolean);
  try {
    await api('/api/questions', {
      method: 'POST',
      body: JSON.stringify({
        text: $('q-text').value,
        options,
        correctIndex: Number($('q-correct').value),
        subject: $('q-subject').value,
        marks: Number($('q-marks').value)
      })
    });
    toast('Question added', 'success');
    $('question-form').reset();
    $('q-correct').value = '0';
    $('q-marks').value = '1';
    $('q-subject').value = 'General';
    loadQuestions();
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('exam-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const questionIds = Array.from(document.querySelectorAll('#exam-question-picker input:checked')).map((c) => c.value);
  if (questionIds.length === 0) return toast('Select at least one question', 'error');
  try {
    await api('/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        title: $('e-title').value,
        subject: $('e-subject').value,
        durationMinutes: Number($('e-duration').value),
        questionIds
      })
    });
    toast('Exam created', 'success');
    $('exam-form').reset();
    $('e-subject').value = 'General';
    $('e-duration').value = '30';
    loadAdminExams();
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function loadAdminExams() {
  const { exams } = await api('/api/exams');
  $('stat-exams').textContent = exams.length;
  $('admin-exams-table').querySelector('tbody').innerHTML = exams
    .map(
      (e) =>
        '<tr><td><strong>' + esc(e.title) + '</strong></td><td>' + esc(e.subject) +
        '</td><td>' + e.questionCount + '</td><td>' + e.durationMinutes + ' min</td>' +
        '<td><button class="btn btn-secondary btn-small" data-exam-attempts="' + e.id + '">Attempts</button></td></tr>'
    )
    .join('');
  document.querySelectorAll('[data-exam-attempts]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const { attempts } = await api('/api/exams/' + btn.dataset.examAttempts + '/attempts');
        if (attempts.length === 0) return toast('No submissions yet');
        const max = Math.max.apply(null, attempts.map((a) => a.score));
        toast(attempts.length + ' submission(s) · highest score: ' + max, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

async function loadAdminResults() {
  const { results } = await api('/api/results');
  $('stat-results').textContent = results.length;
  $('admin-results-table').querySelector('tbody').innerHTML = results
    .map(
      (r) =>
        '<tr><td><strong>' + esc(r.studentName || r.userId) + '</strong></td><td>' + esc(r.examTitle) +
        '</td><td>' + r.score + ' / ' + r.totalMarks + '</td><td>' + pctBadge(r.percentage) +
        '</td><td>' + new Date(r.submittedAt).toLocaleString() + '</td></tr>'
    )
    .join('');
}

$('students-refresh').addEventListener('click', () => loadStudents().catch((e) => toast(e.message, 'error')));
$('questions-refresh').addEventListener('click', () => loadQuestions().catch((e) => toast(e.message, 'error')));
$('exams-refresh').addEventListener('click', () => loadAdminExams().catch((e) => toast(e.message, 'error')));
$('admin-results-refresh').addEventListener('click', () => loadAdminResults().catch((e) => toast(e.message, 'error')));

// ---------- Routing ----------
async function route() {
  if (!user) return show('view-auth');
  if (user.role === 'admin') {
    show('view-admin');
    loadStudents().catch((e) => toast(e.message, 'error'));
    loadQuestions().catch((e) => toast(e.message, 'error'));
    loadAdminExams().catch((e) => toast(e.message, 'error'));
    loadAdminResults().catch((e) => toast(e.message, 'error'));
  } else {
    show('view-student');
    loadStudentExams().catch((e) => toast(e.message, 'error'));
    loadMyResults().catch((e) => toast(e.message, 'error'));
  }
}

route();
