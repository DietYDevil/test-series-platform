// ============================================================
// App - auth, routing, dashboard, admin panel
// ============================================================
window.App = (function () {
  var sb = null;
  var state = { user: null, profile: null };
  var viewStack = [];
  var COUNTRIES = [
    ['+91', 'India (+91)'], ['+1', 'USA/Canada (+1)'], ['+44', 'UK (+44)'],
    ['+61', 'Australia (+61)'], ['+971', 'UAE (+971)'], ['+966', 'Saudi Arabia (+966)'],
    ['+974', 'Qatar (+974)'], ['+973', 'Bahrain (+973)'], ['+968', 'Oman (+968)'],
    ['+880', 'Bangladesh (+880)'], ['+92', 'Pakistan (+92)'], ['+94', 'Sri Lanka (+94)'],
    ['+977', 'Nepal (+977)'], ['+975', 'Bhutan (+975)'], ['+65', 'Singapore (+65)']
  ];

  // ---------------- helpers ----------------
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cfg() { return window.APP_CONFIG || {}; }
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function showModal(id) { el(id).classList.add('show'); }
  function hideModal(id) { el(id).classList.remove('show'); }
  function showView(id) {
    if (viewStack.length === 0 || viewStack[viewStack.length - 1] !== id) viewStack.push(id);
    var views = ['viewAuth', 'viewPending', 'viewDash', 'viewTest', 'viewResult', 'viewAdmin'];
    views.forEach(function (v) { el(v).classList.toggle('hidden', v !== id); });
    var showHeader = ['viewDash', 'viewResult', 'viewAdmin'].indexOf(id) >= 0;
    el('appHeader').classList.toggle('hidden', !showHeader);
    window.scrollTo(0, 0);
  }
  function back() {
    viewStack.pop();
    var prev = viewStack[viewStack.length - 1];
    if (prev) showView(prev);
  }

  // ---------------- init ----------------
  function init() {
    var c = cfg();
    if (!c.SUPABASE_URL || c.SUPABASE_URL.indexOf('PASTE_') === 0 || c.SUPABASE_ANON_KEY.indexOf('PASTE_') === 0) {
      var v = el('viewAuth');
      v.classList.remove('hidden');
      el('authBrand').textContent = 'Setup Required';
      el('authSub').textContent = 'Open js/config.js and paste your Supabase URL and anon key.';
      return;
    }
    sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    el('authBrand').textContent = c.APP_NAME;
    el('authSub').textContent = c.APP_SUBTITLE;
    el('hBrand').textContent = c.APP_NAME;
    el('hSub').textContent = c.APP_SUBTITLE;
    document.title = c.APP_NAME;
    fillCountryCodes();
    sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) { state.user = res.data.session.user; bootstrap(); }
      else showAuth();
    });
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === 'SIGNED_OUT') { state.user = null; state.profile = null; showAuth(); }
      else if (ev === 'SIGNED_IN' && session) { state.user = session.user; bootstrap(); }
    });
  }

  function fillCountryCodes() {
    var def = cfg().DEFAULT_COUNTRY_CODE || '+91';
    ['su-cc', 'li-cc'].forEach(function (selId) {
      var sel = el(selId);
      if (!sel) return;
      COUNTRIES.forEach(function (pair) {
        var o = document.createElement('option');
        o.value = pair[0]; o.textContent = pair[1];
        sel.appendChild(o);
      });
      sel.value = def;
    });
  }

  // ---------------- auth ----------------
  function showAuth() {
    showView('viewAuth');
    showAuthTab('login');
  }
  function showAuthTab(tab) {
    document.querySelectorAll('#viewAuth .tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    el('authLogin').classList.toggle('hidden', tab !== 'login');
    el('authSignup').classList.toggle('hidden', tab !== 'signup');
  }

  function normalizePhone(country, digits) {
    digits = String(digits || '').replace(/\D/g, '');
    if (!digits) return '';
    var c = country || cfg().DEFAULT_COUNTRY_CODE || '+91';
    c = String(c).replace(/[^+\d]/g, '');
    return c + digits;
  }

  async function signup() {
    var name = el('su-name').value.trim();
    var cc = el('su-cc').value;
    var digits = el('su-phone').value.trim();
    var p1 = el('su-pass').value;
    var p2 = el('su-pass2').value;
    var err = el('su-err');
    err.textContent = '';
    if (!name) { err.textContent = 'Please enter your full name.'; return; }
    var digitsOnly = digits.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 14) { err.textContent = 'Please enter a valid phone number.'; return; }
    if (p1.length < cfg().MIN_PASSWORD) { err.textContent = 'Password must be at least ' + cfg().MIN_PASSWORD + ' characters.'; return; }
    if (p1 !== p2) { err.textContent = 'Passwords do not match.'; return; }
    err.textContent = 'Creating account...';
    var phone = normalizePhone(cc, digits);
    var res = await sb.auth.signUp({ phone: phone, password: p1 });
    if (res.error) {
      var msg = res.error.message || 'Sign up failed.';
      if (/already registered|duplicate|exists/i.test(msg)) err.textContent = 'This phone number is already registered. Please login.';
      else err.textContent = msg;
      return;
    }
    var uid = (res.data && res.data.session && res.data.session.user && res.data.session.user.id) ||
              (res.data && res.data.user && res.data.user.id);
    if (!uid) { err.textContent = 'Account created. Please login now.'; showAuthTab('login'); el('li-phone').value = digits; return; }
    var r = await sb.rpc('create_profile', { p_name: name, p_phone: phone });
    if (r.error) { err.textContent = 'Account created but profile save failed: ' + r.error.message; return; }
    state.user = { id: uid };
    bootstrap();
  }

  async function login() {
    var cc = el('li-cc').value;
    var digits = el('li-phone').value.trim();
    var pass = el('li-pass').value;
    var err = el('li-err');
    err.textContent = '';
    if (!digits || !pass) { err.textContent = 'Please enter phone and password.'; return; }
    err.textContent = 'Logging in...';
    var phone = normalizePhone(cc, digits);
    var res = await sb.auth.signInWithPassword({ phone: phone, password: pass });
    if (res.error) { err.textContent = 'Incorrect phone number or password.'; return; }
    state.user = res.data.user;
    bootstrap();
  }

  async function bootstrap() {
    // load profile
    var uid = state.user && state.user.id;
    if (!uid) { showAuth(); return; }
    var { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error || !data) {
      // user exists in auth but has no profile (never finished signup)
      state.profile = { id: uid, name: '', phone: '', role: 'student', approved: false };
      showPending();
      return;
    }
    state.profile = data;
    el('huName').textContent = data.name;
    el('huPhone').textContent = data.phone;
    if (data.role === 'admin') { adminTab('users'); return; }
    if (data.approved) { renderDashboard(); return; }
    showPending();
  }

  function showPending() {
    el('pendName').textContent = state.profile.name || 'there';
    showView('viewPending');
  }

  async function checkApproval() {
    var uid = state.user && state.user.id;
    var { data } = await sb.from('profiles').select('approved, role').eq('id', uid).maybeSingle();
    if (data) {
      state.profile = Object.assign({}, state.profile, data);
      if (data.role === 'admin') { adminTab('users'); return; }
      if (data.approved) { renderDashboard(); return; }
    }
    toast('Still pending approval. Please check back later.');
  }

  async function logout() {
    try { if (sb) await sb.auth.signOut(); } catch (e) {}
    state.user = null; state.profile = null;
    showView('viewAuth');
  }

  // ---------------- student dashboard ----------------
  async function renderDashboard() {
    showView('viewDash');
    el('dashMeta').textContent = state.profile.name + '  \u00b7  ' + state.profile.phone;
    var uid = state.user.id;
    var { data: tests, error: te } = await sb.from('tests').select('*').order('created_at', { ascending: false });
    var { data: myResults } = await sb.from('results').select('*').eq('user_id', uid);
    var grid = el('dashGrid');
    grid.innerHTML = '';
    if (te) { toast('Could not load tests.'); return; }
    if (!tests || !tests.length) {
      grid.innerHTML = '<div class="empty">No tests available yet. Please check back later.</div>';
    } else {
      var map = {};
      (myResults || []).forEach(function (r) { map[r.test_id] = r; });
      tests.forEach(function (t) {
        var res = map[t.id];
        var card = document.createElement('div');
        card.className = 'tcard';
        var subj = t.subject ? '<span class="pill">' + esc(t.subject) + '</span>' : '';
        card.innerHTML =
          '<div class="tc-head"><h3>' + esc(t.title) + '</h3>' + subj + '</div>' +
          '<div class="tc-body">' +
          '<div class="stat"><span>Questions</span><b>' + (t.total_qs || (t.data && t.data.totalQs) || 0) + '</b></div>' +
          '<div class="stat"><span>Duration</span><b>' + t.duration_min + ' min</b></div>' +
          '<div class="stat"><span>Max Marks</span><b>' + (t.max_score || (t.data && t.data.maxScore) || 0) + '</b></div>' +
          (res ? '<div class="stat"><span>Your Score</span><b>' + res.score + '/' + res.max_score + '</b></div>' : '') +
          '</div>';
        var foot = document.createElement('div');
        foot.className = 'tc-foot';
        var btn = document.createElement('button');
        btn.className = 'btn ' + (res ? '' : 'primary');
        btn.textContent = res ? 'View Result' : 'Take Test';
        btn.onclick = function () { res ? viewResult(t, res) : TestRunner.openInstructions(t); };
        foot.appendChild(btn);
        card.appendChild(foot);
        grid.appendChild(card);
      });
    }
    // history table
    var hist = el('dashHistory');
    if (!(myResults || []).length) {
      hist.innerHTML = '<div class="empty">You have not attempted any test yet.</div>';
    } else {
      var rows = (myResults || []).map(function (r) {
        var t = (tests || []).find(function (x) { return x.id === r.test_id; });
        var pct = r.max_score ? (r.score / r.max_score * 100).toFixed(1) : '0';
        return '<tr><td>' + esc(t ? t.title : 'Test') + '</td><td><b>' + r.score + '/' + r.max_score + '</b></td>' +
          '<td><span class="badge ok">' + r.correct + '</span></td><td><span class="badge bad">' + r.incorrect + '</span></td>' +
          '<td><span class="badge u">' + r.unattempted + '</span></td><td>' + pct + '%</td>' +
          '<td>' + esc(new Date(r.submitted_at).toLocaleString()) + '</td>' +
          '<td><button class="btn" onclick="App.viewResult(' + "'" + r.test_id + "'" + ',' + JSON.stringify(r) + ')">View</button></td></tr>';
      }).join('');
      hist.innerHTML = '<table class="tbl"><thead><tr><th>Test</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>%</th><th>Submitted</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
  }

  async function viewResult(testId, resultRow) {
    var t = (typeof testId === 'object' && testId.id) ? testId : null;
    if (!t) {
      var { data } = await sb.from('tests').select('*').eq('id', testId).maybeSingle();
      if (!data) { toast('Test not found.'); return; }
      t = data;
    }
    TestRunner.viewStoredResult(t, resultRow);
  }

  // ---------------- save result ----------------
  async function saveResult() {
    if (!state.user) return false;
    var g = TestRunner.gradeSnapshot();
    var payload = {
      test_id: TestRunner.lastTestId(),
      user_id: state.user.id,
      score: g.tot || 0,
      max_score: g.max || 0,
      correct: g.correct,
      incorrect: g.incorrect,
      unattempted: g.unattempted,
      time_used_sec: g.time,
      answers: TestRunner.currentAnswers(),
      time_spent: TestRunner.currentTimeSpent(),
      marked: TestRunner.currentMarked(),
      submitted_at: new Date().toISOString()
    };
    var { error } = await sb.from('results').insert(payload);
    if (error) {
      toast('Could not save attempt: ' + (error.message || 'already attempted'));
      return false;
    }
    return true;
  }

  // ---------------- admin ----------------
  async function adminTab(tab) {
    showView('viewAdmin');
    document.querySelectorAll('#viewAdmin .tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    el('admUsers').classList.toggle('hidden', tab !== 'users');
    el('admTests').classList.toggle('hidden', tab !== 'tests');
    el('admResults').classList.toggle('hidden', tab !== 'results');
    if (tab === 'users') renderUsers();
    if (tab === 'tests') renderTests();
    if (tab === 'results') renderResults();
  }

  async function renderUsers() {
    var box = el('admUsers');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading users...</div>';
    var { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { box.innerHTML = '<div class="empty">Could not load users.</div>'; return; }
    if (!data.length) { box.innerHTML = '<div class="empty">No users yet.</div>'; return; }
    var rows = data.map(function (u) {
      var statusBadge = u.role === 'admin' ? '<span class="badge info">Admin</span>'
        : u.approved ? '<span class="badge ok">Approved</span>' : '<span class="badge gold">Pending</span>';
      var actions = '';
      if (u.role !== 'admin') {
        if (!u.approved) actions += '<button class="ok" onclick="App.approveUser(' + "'" + u.id + "'" + ',true)">Approve</button>';
        else actions += '<button class="danger" onclick="App.approveUser(' + "'" + u.id + "'" + ',false)">Revoke</button>';
        actions += '<button class="danger" onclick="App.removeUser(' + "'" + u.id + "'" + ')">Remove</button>';
      }
      return '<tr><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.phone) + '</td><td>' + statusBadge + '</td>' +
        '<td>' + esc(new Date(u.created_at).toLocaleDateString()) + '</td><td><div class="actions">' + actions + '</div></td></tr>';
    }).join('');
    box.innerHTML = '<div class="admCard"><h3>All Users</h3><div class="tableWrap"><table class="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="note">Name and phone are locked after signup and cannot be edited. Approve a user to let them see and take tests.</p></div>';
  }

  async function approveUser(id, val) {
    var { error } = await sb.from('profiles').update({ approved: val }).eq('id', id);
    if (error) { toast('Failed: ' + error.message); return; }
    toast(val ? 'User approved' : 'Access revoked');
    renderUsers();
  }

  async function removeUser(id) {
    if (!confirm('Remove this user? Their test results will be deleted. (The Supabase auth account can also be removed later from the Supabase dashboard.)')) return;
    var { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) { toast('Failed: ' + error.message); return; }
    toast('User removed');
    renderUsers();
  }

  // ---------------- admin: tests ----------------
  async function renderTests() {
    var box = el('admTests');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading tests...</div>';
    var { data: tests } = await sb.from('tests').select('*').order('created_at', { ascending: false });
    var { data: access } = await sb.from('test_access').select('test_id, user_id, profiles(name)');
    var accessMap = {};
    (access || []).forEach(function (a) {
      if (!accessMap[a.test_id]) accessMap[a.test_id] = [];
      accessMap[a.test_id].push(a.profiles ? a.profiles.name : '?');
    });
    var html = uploadFormHtml();
    if (!tests.length) {
      html += '<div class="empty">No tests yet. Upload your first test above.</div>';
    } else {
      var rows = tests.map(function (t) {
        var status = t.status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge u">Archived</span>';
        var vis = t.all_users ? 'All approved students' : 'Selected students only';
        var assigned = accessMap[t.id] ? accessMap[t.id].map(function (n) { return '<span class="u">' + esc(n) + '</span>'; }).join('') : '';
        return '<div class="admCard"><div class="pageHead" style="margin:0 0 8px"><h3>' + esc(t.title) + ' ' + status + '</h3>' +
          '<div class="actions">' +
          '<button onclick="App.toggleArchive(' + "'" + t.id + "'" + ')">' + (t.status === 'active' ? 'Archive' : 'Activate') + '</button>' +
          '<button onclick="App.assignTest(' + "'" + t.id + "'" + ')">Assign Users</button>' +
          '<button class="danger" onclick="App.deleteTest(' + "'" + t.id + "'" + ')">Delete</button>' +
          '</div></div>' +
          '<div class="stat"><span>Duration</span><b>' + t.duration_min + ' min</b></div>' +
          '<div class="stat"><span>Questions</span><b>' + (t.total_qs || 0) + '</b></div>' +
          '<div class="stat"><span>Max Marks</span><b>' + (t.max_score || 0) + '</b></div>' +
          '<div class="stat"><span>Visibility</span><b>' + vis + '</b></div>' +
          (assigned ? '<div class="assigned">' + assigned + '</div>' : '') +
          '</div>';
      }).join('');
      html += rows;
    }
    box.innerHTML = html;
  }

  function uploadFormHtml() {
    return '<div class="admCard"><h3>Upload New Test</h3>' +
      '<div class="field"><label>Test Title</label><input id="up-title" placeholder="e.g. Physics Thermodynamics Class Test 10-08-2026"></div>' +
      '<div class="field"><label>Subject (optional)</label><input id="up-subject" placeholder="e.g. Physics Thermodynamics"></div>' +
      '<div class="field"><label>Description (optional)</label><input id="up-desc" placeholder="Short description shown to students"></div>' +
      '<div class="field"><label>Duration (minutes)</label><input id="up-dur" type="number" value="60"></div>' +
      '<div class="field"><label>Test data — paste the dataset JSON, or upload your .html / .json test file below</label>' +
      '<textarea id="up-json" rows="5" placeholder=\'Paste the dataset JSON here (from the <script type="application/json" id="dataset"> block of your test HTML file)\'></textarea></div>' +
      '<div class="uploadZone" onclick="document.getElementById(\'up-file\').click()">' +
      '<b>Click to choose a file</b><p>Accepts .html (your existing test file) or .json</p></div>' +
      '<input type="file" id="up-file" accept=".html,.json,.txt" class="hidden" onchange="App.readFile(this)">' +
      '<div class="chk" style="margin:12px 0"><input type="checkbox" id="up-all" checked><span>Visible to all approved students</span></div>' +
      '<div class="msg" id="up-err"></div>' +
      '<button class="btn primary" onclick="App.uploadTest()">Save Test</button></div>';
  }

  function readFile(input) {
    var f = input.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var text = ev.target.result;
      var json = extractJson(text, f.name);
      if (json) {
        el('up-json').value = JSON.stringify(json);
        if (!el('up-title').value && json.testName) el('up-title').value = json.testName;
        if (!el('up-dur').value && json.timeLimitMin) el('up-dur').value = json.timeLimitMin;
        el('up-err').textContent = 'Parsed test data: ' + (json.questions ? json.questions.length : 0) + ' questions.';
      } else {
        el('up-err').textContent = 'Could not find a valid dataset in that file. Try pasting the JSON directly.';
      }
    };
    reader.readAsText(f);
  }

  function extractJson(text, fname) {
    try {
      var parsed = JSON.parse(text);
      if (parsed.questions) return parsed;
    } catch (e) {}
    // try to pull out the <script type="application/json" id="dataset"> block
    var m = text.match(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
      try { var p2 = JSON.parse(m[1]); if (p2.questions) return p2; } catch (e2) {}
    }
    m = text.match(/<script\b[^>]*id=["']dataset["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
      try { var p3 = JSON.parse(m[1]); if (p3.questions) return p3; } catch (e3) {}
    }
    // try find "questions":[  ...  ] pattern
    m = text.match(/\{[\s\S]*?"questions"\s*:\s*\[[\s\S]*\]\s*\}/);
    if (m) {
      try { var p4 = JSON.parse(m[0]); if (p4.questions) return p4; } catch (e4) {}
    }
    return null;
  }

  async function uploadTest() {
    var title = el('up-title').value.trim();
    var subject = el('up-subject').value.trim();
    var desc = el('up-desc').value.trim();
    var dur = parseInt(el('up-dur').value, 10) || 60;
    var raw = el('up-json').value.trim();
    var err = el('up-err');
    err.textContent = '';
    if (!title) { err.textContent = 'Please enter a test title.'; return; }
    if (!raw) { err.textContent = 'Please paste test data JSON or upload a file.'; return; }
    var data;
    try { data = JSON.parse(raw); } catch (e) { err.textContent = 'Invalid JSON: ' + e.message; return; }
    if (!data.questions || !data.questions.length) { err.textContent = 'The JSON must contain a "questions" array.'; return; }
    if (!data.testName) data.testName = title;
    var payload = {
      title: title,
      subject: subject || (data.subjects && data.subjects[0]) || null,
      description: desc || null,
      duration_min: dur,
      total_qs: data.totalQs || data.questions.length,
      max_score: data.maxScore || 0,
      all_users: el('up-all').checked,
      status: 'active',
      data: data
    };
    var { error } = await sb.from('tests').insert(payload);
    if (error) { err.textContent = 'Save failed: ' + error.message; return; }
    toast('Test saved!');
    // reset form
    el('up-title').value = ''; el('up-subject').value = ''; el('up-desc').value = ''; el('up-json').value = '';
    renderTests();
  }

  async function toggleArchive(id) {
    var { data } = await sb.from('tests').select('status').eq('id', id).maybeSingle();
    if (!data) return;
    var newStatus = data.status === 'active' ? 'archived' : 'active';
    await sb.from('tests').update({ status: newStatus }).eq('id', id);
    renderTests();
  }

  async function deleteTest(id) {
    if (!confirm('Delete this test and all its results? This cannot be undone.')) return;
    await sb.from('tests').delete().eq('id', id);
    toast('Test deleted');
    renderTests();
  }

  async function assignTest(testId) {
    var { data: students } = await sb.from('profiles').select('id, name, phone').eq('role', 'student').eq('approved', true);
    var { data: existing } = await sb.from('test_access').select('user_id').eq('test_id', testId);
    var current = {};
    (existing || []).forEach(function (a) { current[a.user_id] = true; });
    var html = '';
    if (!(students || []).length) { html = '<div class="empty">No approved students yet.</div>'; }
    else {
      (students || []).forEach(function (s) {
        html += '<div class="chk" style="padding:5px 0"><input type="checkbox" data-uid="' + s.id + '" ' + (current[s.id] ? 'checked' : '') + '>' +
          '<span>' + esc(s.name) + ' &middot; ' + esc(s.phone) + '</span></div>';
      });
    }
    document.getElementById('assignBox').innerHTML = html;
    document.getElementById('assignTestId').value = testId;
    showModal('assignModal');
  }

  async function saveAssignments() {
    var testId = el('assignTestId').value;
    var boxes = document.querySelectorAll('#assignBox input[type=checkbox]');
    var selected = [];
    boxes.forEach(function (b) { if (b.checked) selected.push(b.getAttribute('data-uid')); });
    // remove all existing access for this test, then insert
    await sb.from('test_access').delete().eq('test_id', testId);
    for (var i = 0; i < selected.length; i++) {
      await sb.from('test_access').insert({ test_id: testId, user_id: selected[i] });
    }
    hideModal('assignModal');
    toast('Assignment saved');
    renderTests();
  }

  // ---------------- admin: results ----------------
  async function renderResults() {
    var box = el('admResults');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading...</div>';
    var { data: tests } = await sb.from('tests').select('id, title').order('created_at', { ascending: false });
    var opts = '<option value="">-- Select a test --</option>' + (tests || []).map(function (t) { return '<option value="' + t.id + '">' + esc(t.title) + '</option>'; }).join('');
    var inner = '<div class="admCard"><h3>Results</h3>' +
      '<div class="field"><label>Choose test</label><select id="res-test" onchange="App.loadResults()">' + opts + '</select></div>' +
      '<div id="res-table"><div class="empty">Select a test above to see who attempted it.</div></div></div>';
    box.innerHTML = inner;
  }

  async function loadResults() {
    var testId = el('res-test').value;
    var box = el('res-table');
    if (!testId) { box.innerHTML = '<div class="empty">Select a test above.</div>'; return; }
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading...</div>';
    var { data: rows } = await sb.from('results')
      .select('*, profiles(name, phone)')
      .eq('test_id', testId)
      .order('score', { ascending: false });
    if (!(rows || []).length) { box.innerHTML = '<div class="empty">No attempts for this test yet.</div>'; return; }
    var total = rows.length;
    var rankMap = {}; rows.forEach(function (r, i) { rankMap[r.id] = i + 1; });
    var tbl = '<table class="tbl"><thead><tr><th>Rank</th><th>Name</th><th>Phone</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Time</th><th>Submitted</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var p = r.profiles || {};
      var pct = r.max_score ? (r.score / r.max_score * 100).toFixed(1) : '0';
      tbl += '<tr><td><b>#' + rankMap[r.id] + '</b></td><td>' + esc(p.name || '?') + '</td><td>' + esc(p.phone || '') + '</td>' +
        '<td><b>' + r.score + '/' + r.max_score + '</b> (' + pct + '%)</td>' +
        '<td><span class="badge ok">' + r.correct + '</span></td><td><span class="badge bad">' + r.incorrect + '</span></td>' +
        '<td><span class="badge u">' + r.unattempted + '</span></td>' +
        '<td>' + fmtSec(r.time_used_sec) + '</td>' +
        '<td>' + esc(new Date(r.submitted_at).toLocaleString()) + '</td>' +
        '<td><button class="danger" onclick="App.resetResult(' + "'" + r.id + "'" + ')">Reset</button></td></tr>';
    });
    tbl += '</tbody></table>';
    box.innerHTML = '<p class="note">' + total + ' attempt(s). Use <b>Reset</b> to allow a student to retake the test (their old attempt is deleted).</p>' + tbl;
  }

  function fmtSec(s) {
    s = Math.max(0, Math.round(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return (h > 0 ? h + 'h ' : '') + m + 'm ' + sec + 's';
  }

  async function resetResult(id) {
    if (!confirm('Delete this attempt so the student can retake the test?')) return;
    await sb.from('results').delete().eq('id', id);
    toast('Attempt reset');
    loadResults();
  }

  // ---------------- misc ----------------
  function closeInst() { hideModal('instModal'); }
  function backToDash() {
    if (document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
    renderDashboard();
  }

  return {
    init: init,
    showAuthTab: showAuthTab,
    login: login,
    signup: signup,
    logout: logout,
    checkApproval: checkApproval,
    adminTab: adminTab,
    approveUser: approveUser,
    removeUser: removeUser,
    renderTests: renderTests,
    uploadTest: uploadTest,
    readFile: readFile,
    toggleArchive: toggleArchive,
    deleteTest: deleteTest,
    assignTest: assignTest,
    saveAssignments: saveAssignments,
    renderResults: renderResults,
    loadResults: loadResults,
    resetResult: resetResult,
    backToDash: backToDash,
    closeInst: closeInst,
    saveResult: saveResult,
    viewResult: viewResult,
    renderDashboard: renderDashboard,
    showModal: showModal,
    hideModal: hideModal,
    showView: showView,
    toast: toast,
    state: state
  };
})();

document.addEventListener('DOMContentLoaded', function () { App.init(); });