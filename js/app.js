  // ============================================================
  // App - auth, routing, dashboard, admin panel
  // ============================================================
  // The COSMO Test Portal
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
    if (window.Chat) Chat.onRouteChange(id);
    window.scrollTo(0, 0);
  }
  
  function back() {
    viewStack.pop();
    var prev = viewStack[viewStack.length - 1];
    if (prev) showView(prev);
  }
  
  function toggleCategorySection(headerElement) {
    var content = headerElement.nextElementSibling;
    if (content && content.classList.contains('categoryContent')) {
      var isVisible = content.style.display === 'block';
      content.style.display = isVisible ? 'none' : 'block';
      var arrow = headerElement.querySelector('.categoryArrow');
      if (arrow) {
        arrow.textContent = isVisible ? '▶' : '▼';
      }
    }
  }

  // ---------------- init ----------------
   function init() {
    var savedTheme = 'light';
    try { savedTheme = localStorage.getItem('theme') || 'light'; } catch (e) {}
    applyTheme(savedTheme);
    var c = cfg();
    if (!c.SUPABASE_URL || c.SUPABASE_URL.indexOf('PASTE_') === 0 || c.SUPABASE_ANON_KEY.indexOf('PASTE_') === 0) {
      var v = el('viewAuth');
      v.classList.remove('hidden');
      el('authBrand').textContent = 'Setup Required';
      el('authSub').textContent = 'Open js/config.js and paste your Supabase URL and anon key.';
      return;
    }
    sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    el('authBrand').textContent = 'The COSMO Test Portal';
    el('authSub').textContent = c.APP_SUBTITLE;
    el('hBrand').textContent = 'The COSMO Test Portal';
    el('hSub').textContent = c.APP_SUBTITLE;
    document.title = 'The COSMO Test Portal';
    setTimeout(fillCountryCodes, 100);
    sb.auth.getSession().then(function (res) {
      if (res.data && res.data.session) { state.user = res.data.session.user; bootstrap(); }
      else showAuth();
    });
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === 'SIGNED_OUT') { state.user = null; state.profile = null; if (window.Chat) Chat.teardown(); showAuth(); }
      else if (ev === 'SIGNED_IN' && session) { state.user = session.user; bootstrap(); }
    });
  }

   function fillCountryCodes() {
    var def = cfg().DEFAULT_COUNTRY_CODE || '+91';
    ['su-cc', 'li-cc'].forEach(function (selId) {
      var sel = el(selId);
      if (!sel) {
        console.log("Element with ID: " + selId + " not found");
        return;
      }
      COUNTRIES.forEach(function (pair) {
        var o = document.createElement('option');
        o.value = pair[0]; o.textContent = pair[1];
        sel.appendChild(o);
      });
      sel.value = def;
    });
  }

  // ---------------- theme ----------------
  function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    var b = el('themeBtn');
    if (b) b.innerHTML = t === 'dark' ? '&#9728;&#65039;' : '&#127769;';
    try { localStorage.setItem('theme', t); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
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
    console.log("Login attempt with phone: " + phone);
    var res = await sb.auth.signInWithPassword({ phone: phone, password: pass });
    if (res.error) { err.textContent = 'Incorrect phone number or password.'; console.log("Login error: " + res.error.message); return; }
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
    if (window.Chat) Chat.start();
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
    dashCatId = null;
    if (window.Chat) Chat.teardown();
    showView('viewAuth');
  }

  // ---------------- student dashboard ----------------
  var dashCatId = null; // null = show folder grid; '__none__' = General (uncategorized); otherwise category id
  var dashTestFilter = null; // null = all | 'unit' | 'minor' | 'full'
  var FC_ACCENTS = ['fc-a', 'fc-b', 'fc-c', 'fc-d', 'fc-e'];

  function classifyTest(t) {
    var s = String(t.title || '').toLowerCase();
    if (/unit/.test(s)) return 'unit';
    if (/minor/.test(s)) return 'minor';
    if (/full|mock/.test(s)) return 'full';
    return null;
  }

  function detailsUrlFor(name) {
    var n = String(name || '').toLowerCase();
    if (n.indexOf('csir') >= 0) return 'https://course.onlinecareerendeavour.com/product-detail?id=621733edf2a17b2eb12b1a0f';
    if (n.indexOf('gate') >= 0) return 'https://course.onlinecareerendeavour.com/product-detail?id=621733e9f2a17b2eb12b1a0a';
    return null;
  }

  function makeFolderCard(cat, tests, accent) {
    var isGen = cat.id === null;
    var list = isGen ? tests.filter(function (t) { return !t.category_id; })
                     : tests.filter(function (t) { return t.category_id === cat.id; });
    var detUrl = detailsUrlFor(cat.name);
    var card = document.createElement('div');
    card.className = 'fcard ' + (accent || 'fc-a');
    card.innerHTML =
      '<div class="fc-top">' +
        '<div class="fc-icon">' + (cat.icon || '📁') + '</div>' +
        '<h3>' + esc(cat.name) + '</h3>' +
      '</div>' +
      '<p>' + esc(cat.description || '') + '</p>' +
      (detUrl ? '<div class="fcDetails">Details : <a href="' + esc(detUrl) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + esc(detUrl) + '</a></div>' : '') +
      '<span class="fc-count">' + list.length + ' test' + (list.length === 1 ? '' : 's') + '</span>';
    card.onclick = function () {
      dashCatId = isGen ? '__none__' : cat.id;
      renderDashboard();
    };
    return card;
  }

  function makeTestCards(tests, map) {
    var cards = document.createElement('div');
    cards.className = 'cards';
    tests.forEach(function (t) { cards.appendChild(makeTestCard(t, map[t.id])); });
    return cards;
  }

  function renderFolderGrid(grid, tests, categories, map) {
    grid.innerHTML = '';
    var hasUncat = tests.some(function (t) { return !t.category_id; });
    var usedCats = categories.filter(function (c) {
      return tests.some(function (t) { return t.category_id === c.id; });
    });
    if (!usedCats.length) {
      // No visible folders (e.g. RLS hides categories from this student).
      // If tests exist, show them as a flat list instead of a false "no tests" message.
      if (!tests.length) {
        grid.innerHTML = '<div class="empty">No tests available yet. Please check back later.</div>';
      } else {
        grid.appendChild(makeTestCards(tests, map));
      }
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'folderGrid';
    var ai = 0;
    usedCats.forEach(function (c) { wrap.appendChild(makeFolderCard(c, tests, FC_ACCENTS[ai++ % FC_ACCENTS.length])); });
    if (hasUncat) {
      wrap.appendChild(makeFolderCard({ id: null, name: 'General', description: 'Tests without a folder', icon: '📄' }, tests, FC_ACCENTS[ai++ % FC_ACCENTS.length]));
    }
    grid.appendChild(wrap);
  }

   function renderCategoryPage(grid, cat, testsAll, map) {
    grid.innerHTML = '';
    var shown = dashTestFilter ? testsAll.filter(function (t) { return classifyTest(t) === dashTestFilter; }) : testsAll;
    var head = document.createElement('div');
    head.className = 'catHead';
    var left = document.createElement('div');
    left.className = 'catLeft';
    var back = document.createElement('button');
    back.className = 'btn backbtn';
    back.textContent = '← All Folders';
    back.onclick = function () { dashCatId = null; dashTestFilter = null; renderDashboard(); };
    left.appendChild(back);
    var title = document.createElement('div');
    title.className = 'folderTitle';
    title.innerHTML = '<span>' + (cat.icon || '📁') + '</span> <b>' + esc(cat.name) + '</b> <span class="ftcount">(' + shown.length + ')</span>';
    left.appendChild(title);
    head.appendChild(left);
    if (testsAll.length) {
      var filterButtons = document.createElement('div');
      filterButtons.className = 'filterButtons';
      var defs = [['none', 'All Tests'], ['unit', 'Unit Tests'], ['minor', 'Minor Tests'], ['full', 'Full Mock Tests']];
      defs.forEach(function (d) {
        var b = document.createElement('button');
        b.textContent = d[1];
        if ((dashTestFilter || 'none') === d[0]) b.classList.add('active');
        b.onclick = function () { dashTestFilter = d[0] === 'none' ? null : d[0]; renderDashboard(); };
        filterButtons.appendChild(b);
      });
      head.appendChild(filterButtons);
    }
    grid.appendChild(head);
    if (!testsAll.length) {
      grid.insertAdjacentHTML('beforeend', '<div class="empty">No tests in this folder yet.</div>');
      return;
    }
    if (!shown.length) {
      grid.insertAdjacentHTML('beforeend', '<div class="empty">No tests match this filter.</div>');
      return;
    }
    grid.appendChild(makeTestCards(shown, map));
  }
  function makeTestCard(t, res) {
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
    (function (t2, r2) {
      btn.onclick = function () { r2 ? viewResult(t2, r2) : TestRunner.openInstructions(t2); };
    })(t, res);
    foot.appendChild(btn);
    card.appendChild(foot);
    return card;
  }

  async function renderDashboard() {
    showView('viewDash');
    el('greetName').textContent = state.profile.name || 'there';
    el('greetSub').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    el('dashMeta').textContent = state.profile.phone;
    var uid = state.user.id;
    var grid = el('dashGrid');
    grid.innerHTML = '<div class="empty"><span class="spinner"></span> Loading tests...</div>';

    var tests = [];
    var myResults = [];
    var categories = [];

    try {
      var cr = await sb.from('categories').select('*').eq('is_active', true).order('display_order', { ascending: true });
      categories = cr.data || [];
      var tr = await sb.from('tests').select('*, categories(name, icon)').eq('status', 'active').order('created_at', { ascending: false });
      tests = tr.data || [];
    } catch (e) {
      // categories table not available yet -> fall back to plain query
      var tr2 = await sb.from('tests').select('*').eq('status', 'active').order('created_at', { ascending: false });
      tests = tr2.data || [];
    }
    var rr = await sb.from('results').select('*').eq('user_id', uid);
    myResults = rr.data || [];

    var map = {};
    myResults.forEach(function (r) { map[r.test_id] = r; });

    // Folder-first navigation: grid of folders, or tests inside one folder
    if (!dashCatId) {
      renderFolderGrid(grid, tests, categories, map);
    } else if (dashCatId === '__none__') {
      var genTests = tests.filter(function (t) { return !t.category_id; });
      renderCategoryPage(grid, { name: 'General', icon: '📄' }, genTests, map);
    } else {
      var cat = null;
      categories.forEach(function (c) { if (c.id === dashCatId) cat = c; });
      if (!cat && tests.length && tests[0].categories) { /* category hidden by RLS */ }
      renderCategoryPage(grid, cat || { name: 'Folder', icon: '📁' },
        tests.filter(function (t) { return t.category_id === dashCatId; }), map);
    }

    // history table
    var hist = el('dashHistory');
    if (!myResults.length) {
      hist.innerHTML = '<div class="empty">You have not attempted any test yet.</div>';
    } else {
      var rows = myResults.map(function (r) {
        var t = (tests || []).find(function (x) { return x.id === r.test_id; });
        var pct = r.max_score ? (r.score / r.max_score * 100).toFixed(1) : '0';
        return '<tr><td>' + esc(t ? t.title : 'Test') + '</td><td><b>' + r.score + '/' + r.max_score + '</b></td>' +
          '<td><span class="badge ok">' + r.correct + '</span></td><td><span class="badge bad">' + r.incorrect + '</span></td>' +
          '<td><span class="badge u">' + r.unattempted + '</span></td><td>' + pct + '%</td>' +
          '<td>' + esc(new Date(r.submitted_at).toLocaleString()) + '</td>' +
          '<td><button class="btn" onclick="App.viewResultRow(' + "'" + r.id + "'" + ')">View</button></td></tr>';
      }).join('');
      hist.innerHTML = '<table class="tbl"><thead><tr><th>Test</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>%</th><th>Submitted</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
  }

  async function viewResult(testId, resultRow) {
    var t = (typeof testId === 'object' && testId.id) ? testId : null;
    if (!t) {
      var { data } = await sb.from('tests').select('*').eq('id', testId).maybeSingle();
      if (!data) { 
        toast('Test not found.'); 
        return; 
      }
      t = data;
    }
    
    // Ensure the test data is valid before trying to display it
    if (!t || !t.data || !t.data.questions || !Array.isArray(t.data.questions)) {
      toast('Invalid test data. Unable to display report.');
      return;
    }
    
    TestRunner.viewStoredResult(t, resultRow);
  }

  async function viewResultRow(resultId) {
    try {
      var { data: rr, error } = await sb.from('results').select('*').eq('id', resultId).maybeSingle();
      if (error || !rr) { toast('Result not found.'); return; }
      var { data: t } = await sb.from('tests').select('*').eq('id', rr.test_id).maybeSingle();
      if (!t || !t.data || !t.data.questions || !Array.isArray(t.data.questions)) {
        toast('Invalid or missing test data. Test may have been deleted.');
        return;
      }
      TestRunner.viewStoredResult(t, rr);
    } catch (e) {
      console.error('Report error:', e && e.message);
      toast('Failed to load report. Please try again.');
      App.backToDash();
    }
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
    el('admCategories').classList.toggle('hidden', tab !== 'categories');
    el('admTests').classList.toggle('hidden', tab !== 'tests');
    el('admResults').classList.toggle('hidden', tab !== 'results');
    el('admInbox').classList.toggle('hidden', tab !== 'inbox');
    if (tab === 'users') renderUsers();
    if (tab === 'categories') renderCategories();
    if (tab === 'tests') renderTests();
    if (tab === 'results') renderResults();
    if (tab === 'inbox' && window.Chat) Chat.renderInbox();
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

  // ---------------- admin: categories ----------------
  async function renderCategories() {
    var box = el('admCategories');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading categories...</div>';
    var { data: categories, error } = await sb.from('categories').select('*').order('display_order', { ascending: true });
    var { data: access } = await sb.from('category_access').select('category_id, user_id, approved, profiles(name, phone)');
    var accessMap = {};
    (access || []).forEach(function (a) {
      if (!accessMap[a.category_id]) accessMap[a.category_id] = [];
      accessMap[a.category_id].push({ name: a.profiles ? a.profiles.name : '?', phone: a.profiles ? a.profiles.phone : '', approved: a.approved, user_id: a.user_id });
    });
    // Also count students who got access via individual test assignments
    // (tests inside this folder) so the folder view stays consistent.
    var { data: viaTests } = await sb.from('test_access').select('user_id, tests(category_id), profiles(name, phone)').order('user_id');
    (viaTests || []).forEach(function (ta) {
      var cid = ta.tests && ta.tests.category_id;
      if (!cid) return;
      if (!accessMap[cid]) accessMap[cid] = [];
      var already = accessMap[cid].some(function (x) { return x.user_id === ta.user_id; });
      if (!already) {
        accessMap[cid].push({ name: ta.profiles ? ta.profiles.name : '?', phone: ta.profiles ? ta.profiles.phone : '', approved: true, user_id: ta.user_id, viaTest: true });
      }
    });
    var { data: testsCount } = await sb.from('tests').select('category_id');
    var testCountMap = {};
    (testsCount || []).forEach(function (t) {
      testCountMap[t.category_id] = (testCountMap[t.category_id] || 0) + 1;
    });
    var html = '<div class="admCard"><h3>Create New Category</h3>' +
      '<div class="field"><label>Category Name</label><input id="cat-name" placeholder="e.g. CSIR NET Dec 2026"></div>' +
      '<div class="field"><label>Description (optional)</label><input id="cat-desc" placeholder="Short description"></div>' +
      '<div class="field"><label>Icon (emoji)</label><input id="cat-icon" placeholder="🧪" maxlength="4"></div>' +
      '<div class="field"><label>Display Order</label><input id="cat-order" type="number" value="0"></div>' +
      '<div class="chk" style="margin:12px 0"><input type="checkbox" id="cat-active" checked><span>Active (visible to students with access)</span></div>' +
      '<div class="msg" id="cat-err"></div>' +
      '<button class="btn primary" onclick="App.createCategory()">Create Category</button></div>';
    if (!categories.length) {
      html += '<div class="empty">No categories yet. Create your first category above.</div>';
    } else {
      var rows = categories.map(function (c) {
        var status = c.is_active ? '<span class="badge ok">Active</span>' : '<span class="badge u">Inactive</span>';
        var assigned = accessMap[c.id] ? accessMap[c.id].map(function (a) {
          return '<span class="u" style="margin-right:8px">' + esc(a.name) + ' · ' + esc(a.phone) + ' ' +
            (a.viaTest ? '<span class="badge info" style="font-size:10px;padding:1px 6px">via tests</span>'
                       : (a.approved ? '<span class="badge ok" style="font-size:10px;padding:1px 6px">Approved</span>' : '<span class="badge gold" style="font-size:10px;padding:1px 6px">Pending</span>')) +
            '</span>';
        }).join('') : '';
        var testCount = testCountMap[c.id] || 0;
        return '<div class="admCard" data-category-id="' + c.id + '"><div class="pageHead" style="margin:0 0 8px"><h3>' + (c.icon || '📁') + ' ' + esc(c.name) + ' ' + status + '</h3>' +
          '<div class="actions">' +
          '<button onclick="App.editCategory(' + "'" + c.id + "'" + ')">Edit</button>' +
          '<button onclick="App.toggleCategoryStatus(' + "'" + c.id + "'" + ')">' + (c.is_active ? 'Deactivate' : 'Activate') + '</button>' +
          '<button class="primary" onclick="App.manageCategoryUsers(' + "'" + c.id + "'" + ')">Manage Users</button>' +
          '<button class="danger" onclick="App.removeAllCategoryUsers(' + "'" + c.id + "'" + ')">Remove All Users</button>' +
          '<button class="danger" onclick="App.deleteCategory(' + "'" + c.id + "'" + ')">Delete</button>' +
          '</div></div>' +
          '<div class="stat"><span>Description</span><b>' + esc(c.description || '—') + '</b></div>' +
          '<div class="stat"><span>Tests in Category</span><b>' + testCount + '</b></div>' +
          '<div class="stat"><span>Display Order</span><b>' + c.display_order + '</b></div>' +
          '<div class="stat"><span>Students with Access</span><b>' + (accessMap[c.id] ? accessMap[c.id].length : 0) + '</b></div>' +
          (assigned ? '<div class="assigned" style="margin-top:8px">' + assigned + '</div>' : '<div class="empty" style="margin-top:8px;text-align:left">No students assigned yet. Students get access when approved below.</div>') +
          '</div>';
      }).join('');
      html += rows;
    }
    box.innerHTML = html;
  }

  async function createCategory() {
    var name = el('cat-name').value.trim();
    var desc = el('cat-desc').value.trim();
    var icon = el('cat-icon').value.trim();
    var order = parseInt(el('cat-order').value, 10) || 0;
    var active = el('cat-active').checked;
    var err = el('cat-err');
    err.textContent = '';
    if (!name) { err.textContent = 'Please enter a category name.'; return; }
    var { error } = await sb.from('categories').insert({ name: name, description: desc || null, icon: icon || null, display_order: order, is_active: active });
    if (error) { err.textContent = 'Save failed: ' + error.message; return; }
    toast('Category created!');
    el('cat-name').value = ''; el('cat-desc').value = ''; el('cat-icon').value = ''; el('cat-order').value = '0';
    renderCategories();
  }

  async function editCategory(id) {
    var { data } = await sb.from('categories').select('*').eq('id', id).maybeSingle();
    if (!data) return;
    var name = prompt('Category name:', data.name);
    if (!name) return;
    var desc = prompt('Description:', data.description || '');
    var icon = prompt('Icon (emoji):', data.icon || '');
    var order = parseInt(prompt('Display order:', data.display_order), 10) || 0;
    var { error } = await sb.from('categories').update({ name: name, description: desc || null, icon: icon || null, display_order: order }).eq('id', id);
    if (error) { toast('Failed: ' + error.message); return; }
    toast('Category updated');
    renderCategories();
  }

  async function toggleCategoryStatus(id) {
    var { data } = await sb.from('categories').select('is_active').eq('id', id).maybeSingle();
    if (!data) return;
    await sb.from('categories').update({ is_active: !data.is_active }).eq('id', id);
    renderCategories();
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this category? Tests in this category will become uncategorized.')) return;
    await sb.from('categories').delete().eq('id', id);
    toast('Category deleted');
    renderCategories();
  }

  async function assignAllStudentsToCategory(categoryId) {
    var { data: students } = await sb.from('profiles').select('id, name').eq('role', 'student').eq('approved', true);
    if (!students || !students.length) { toast('No approved students found.'); return; }
    var rows = students.map(function (s) {
      return {
        category_id: categoryId,
        user_id: s.id,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: state.user.id
      };
    });
    var { error } = await sb.from('category_access').upsert(rows, { onConflict: 'category_id,user_id' });
    if (error) { toast('Failed: ' + error.message); return; }
    toast('Assigned ' + rows.length + ' student(s) to this folder!');
    renderCategories();
  }

  async function manageCategoryUsers(categoryId) {
    var { data: cat } = await sb.from('categories').select('name, icon').eq('id', categoryId).maybeSingle();
    if (!cat) { toast('Category not found.'); return; }
    var { data: students } = await sb.from('profiles').select('id, name, phone, approved').eq('role', 'student').order('name', { ascending: true });
    var { data: access } = await sb.from('category_access').select('user_id').eq('category_id', categoryId);
    var current = {};
    (access || []).forEach(function (a) { current[a.user_id] = true; });
    var html = '';
    if (!(students || []).length) {
      html = '<div class="empty">No students registered yet.</div>';
    } else {
      (students || []).forEach(function (s) {
        html += '<div class="chk" style="padding:5px 0"><input type="checkbox" data-uid="' + s.id + '" ' + (current[s.id] ? 'checked' : '') + '>' +
          '<span>' + esc(s.name) + ' &middot; ' + esc(s.phone) + ' ' +
          (s.approved ? '<span class="badge ok" style="font-size:10px;padding:1px 6px">Approved</span>' : '<span class="badge gold" style="font-size:10px;padding:1px 6px">Pending</span>') +
          '</span></div>';
      });
    }
    var modal = document.createElement('div');
    modal.id = 'catUsersModal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="box"><h3>' + (cat.icon || '📁') + ' ' + esc(cat.name) + ' &mdash; Manage Users</h3>' +
      '<p class="note">Tick the students who should have access to this folder. Unticked students will be removed.</p>' +
      '<div class="chk" style="margin:8px 0"><input type="checkbox" id="cuSelectAll" onchange="App.cuToggleAll(this)"><span><b>Select / deselect all</b></span></div>' +
      '<input type="hidden" id="cuCatId" value="' + categoryId + '">' +
      '<div id="catUsersBox" style="max-height:320px;overflow-y:auto;border-top:1px solid var(--line);padding-top:8px">' + html + '</div>' +
      '<div class="acts">' +
      '<button style="background:#eee;color:#3a4c5e" onclick="App.closeCatUsersModal()">Cancel</button>' +
      '<button style="background:var(--brand);color:#fff" onclick="App.saveCategoryUsers()">Save</button>' +
      '</div></div>';
    document.body.appendChild(modal);
    modal.classList.add('show');
  }

  function cuToggleAll(master) {
    document.querySelectorAll('#catUsersBox input[type=checkbox][data-uid]').forEach(function (b) { b.checked = master.checked; });
  }

  function closeCatUsersModal() {
    var m = el('catUsersModal');
    if (m) m.remove();
  }

  async function saveCategoryUsers() {
    var catId = el('cuCatId').value;
    var boxes = document.querySelectorAll('#catUsersBox input[type=checkbox][data-uid]');
    var selected = [];
    boxes.forEach(function (b) { if (b.checked) selected.push(b.getAttribute('data-uid')); });
    var del = await sb.from('category_access').delete().eq('category_id', catId);
    if (del.error) { toast('Failed: ' + del.error.message); return; }
    for (var i = 0; i < selected.length; i++) {
      await sb.from('category_access').upsert({
        category_id: catId,
        user_id: selected[i],
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: state.user.id
      });
    }
    closeCatUsersModal();
    toast(selected.length + ' student(s) now have access to this folder');
    // Force re-render of the specific category's assigned users
    var { data: access } = await sb.from('category_access').select('category_id, user_id, approved, profiles(name, phone)').eq('category_id', catId);
    var accessMap = {};
    (access || []).forEach(function (a) {
      if (!accessMap[a.category_id]) accessMap[a.category_id] = [];
      accessMap[a.category_id].push({ name: a.profiles ? a.profiles.name : '?', phone: a.profiles ? a.profiles.phone : '', approved: a.approved, user_id: a.user_id });
    });
    // Now update the DOM for this specific category
    var categoryElement = document.querySelector('div[data-category-id="' + catId + '"]');
    if (categoryElement) {
      var assigned = accessMap[catId] ? accessMap[catId].map(function (a) {
        return '<span class="u" style="margin-right:8px">' + esc(a.name) + ' · ' + esc(a.phone) + ' ' +
          (a.approved ? '<span class="badge ok" style="font-size:10px;padding:1px 6px">Approved</span>' : '<span class="badge gold" style="font-size:10px;padding:1px 6px">Pending</span>') +
          '</span>';
      }).join('') : '';
      var assignedElement = categoryElement.querySelector('.assigned');
      if (assignedElement) {
        assignedElement.innerHTML = assigned;
      }
      var studentsWithAccessElement = categoryElement.querySelector('.stat span:nth-child(2)');
      if (studentsWithAccessElement) {
        studentsWithAccessElement.textContent = accessMap[catId] ? accessMap[catId].length : 0;
      }
    }
    // Also call renderCategories after a short delay to ensure everything is up to date
    setTimeout(renderCategories, 500);
  }

  async function removeAllCategoryUsers(categoryId) {
    if (!confirm('Remove ALL students from this folder? They will immediately lose access to its tests.')) return;
    var { error } = await sb.from('category_access').delete().eq('category_id', categoryId);
    if (error) { toast('Failed: ' + error.message); return; }
    toast('All users removed from this folder');
    renderCategories();
  }

  // ---------------- admin: tests ----------------
  async function renderTests() {
    var box = el('admTests');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading tests...</div>';
    var { data: tests } = await sb.from('tests').select('*, categories(name, icon)').order('created_at', { ascending: false });
    var { data: access } = await sb.from('test_access').select('test_id, user_id, profiles(name)');
    var accessMap = {};
    (access || []).forEach(function (a) {
      if (!accessMap[a.test_id]) accessMap[a.test_id] = [];
      accessMap[a.test_id].push(a.profiles ? a.profiles.name : '?');
    });
    var html = await uploadFormHtml();
    if (!tests.length) {
      html += '<div class="empty">No tests yet. Upload your first test above.</div>';
    } else {
      var rows = tests.map(function (t) {
        var status = t.status === 'active' ? '<span class="badge ok">Active</span>' : '<span class="badge u">Archived</span>';
        var vis = t.all_users ? 'All approved students' : 'Selected students only';
        var cat = t.categories ? (t.categories.icon || '📁') + ' ' + esc(t.categories.name) : '—';
        var assigned = accessMap[t.id] ? accessMap[t.id].map(function (n) { return '<span class="u">' + esc(n) + '</span>'; }).join('') : '';
        return '<div class="admCard"><div class="pageHead" style="margin:0 0 8px"><h3>' + esc(t.title) + ' ' + status + '</h3>' +
          '<div class="actions">' +
          '<button onclick="App.toggleArchive(' + "'" + t.id + "'" + ')">' + (t.status === 'active' ? 'Archive' : 'Activate') + '</button>' +
          '<button onclick="App.assignTest(' + "'" + t.id + "'" + ')">Assign Users</button>' +
          '<button onclick="App.moveTestCategory(' + "'" + t.id + "'" + ')">Move to Category</button>' +
          '<button class="danger" onclick="App.deleteTest(' + "'" + t.id + "'" + ')">Delete</button>' +
          '</div></div>' +
          '<div class="stat"><span>Category</span><b>' + cat + '</b></div>' +
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

  async function uploadFormHtml() {
    var { data: cats } = await sb.from('categories').select('id, name, icon').eq('is_active', true).order('display_order', { ascending: true });
    var catOptions = '<option value="">-- Select Category --</option>' + (cats || []).map(function (c) { return '<option value="' + c.id + '">' + (c.icon || '📁') + ' ' + esc(c.name) + '</option>'; }).join('');
    return '<div class="admCard"><h3>Upload New Test</h3>' +
      '<div class="field"><label>Category</label><select id="up-category">' + catOptions + '</select></div>' +
      '<div class="field"><label>Test Title</label><input id="up-title" placeholder="e.g. Physics Thermodynamics Class Test 10-08-2026"></div>' +
      '<div class="field"><label>Subject (optional)</label><input id="up-subject" placeholder="e.g. Physics Thermodynamics"></div>' +
      '<div class="field"><label>Description (optional)</label><input id="up-desc" placeholder="Short description shown to students"></div>' +
      '<div class="field"><label>Duration (minutes)</label><input id="up-dur" type="number" value="60"></div>' +
      '<div class="field"><label>Test data — paste the dataset JSON, or upload your .html / .json test file below</label>' +
      '<textarea id="up-json" rows="5" placeholder=\'Paste the dataset JSON here (from the <script type="application/json" id="dataset"> block of your test HTML file)\'></textarea></div>' +
      '<div class="uploadZone" onclick="document.getElementById(\'up-file\').click()">' +
      '<b>Click to choose a file</b><p>Accepts .html (your existing test file) or .json</p></div>' +
      '<input type="file" id="up-file" accept=".html,.json,.txt" class="hidden" onchange="App.readFile(this)">' +
      '<div class="chk" style="margin:12px 0"><input type="checkbox" id="up-all" checked><span>Visible to all approved students (with category access)</span></div>' +
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
        json = normalizeDataset(json);
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

  // Normalize a CE-exported dataset (standalone HTML replica) into the
  // canonical format TestRunner expects:
  //  - question.part must reference section.id (CE uses names like "PART-A MCQ")
  //  - NAT questions need numeric natAns (CE stores ans:[num] with type DTQ/NAT)
  //  - MAQ -> MSQ; every question keeps a subject label for reports
  function normalizeDataset(d) {
    try {
      if (!d || !Array.isArray(d.questions)) return d;
      var secs = Array.isArray(d.sections) ? d.sections : [];
      var nameToId = {};
      secs.forEach(function (s, i) {
        if (!s.id) s.id = s.key || ('S' + (i + 1));
        if (!s.name) s.name = 'Section ' + s.id;
        nameToId[s.name] = s.id;
      });
      d.questions.forEach(function (q) {
        var t = String(q.type || 'MCQ').toUpperCase();
        if (t === 'MAQ' || t === 'MSQ') q.type = 'MSQ';
        else if (t === 'DTQ' || t === 'NAT') q.type = 'NAT';
        else q.type = 'MCQ';
        if (q.part && nameToId[q.part]) {
          q.subject = q.subject || q.part;
          q.part = nameToId[q.part];
        }
        q.subject = q.subject || q.part || (secs[0] && secs[0].name) || '';
        if (q.type === 'NAT') {
          if (Array.isArray(q.ans) && q.ans.length === 2 && isFinite(Number(q.ans[0])) && isFinite(Number(q.ans[1]))) {
            q.natAnsMin = Math.min(Number(q.ans[0]), Number(q.ans[1]));
            q.natAnsMax = Math.max(Number(q.ans[0]), Number(q.ans[1]));
            q.natAns = q.natAnsMin;
            q.ans = [q.natAnsMin, q.natAnsMax];
          } else {
            var n = Array.isArray(q.ans) ? Number(q.ans[0]) : Number(q.natAns !== undefined ? q.natAns : q.ans);
            if (isFinite(n)) { q.natAns = n; q.ans = [n]; }
          }
        } else if (!Array.isArray(q.ans)) {
          q.ans = (q.ans === null || q.ans === undefined) ? [] : [q.ans];
        }
      });
      return d;
    } catch (e) { return d; }
  }

  async function uploadTest() {
    var title = el('up-title').value.trim();
    var subject = el('up-subject').value.trim();
    var desc = el('up-desc').value.trim();
    var dur = parseInt(el('up-dur').value, 10) || 60;
    var categoryId = el('up-category').value || null;
    var raw = el('up-json').value.trim();
    var err = el('up-err');
    err.textContent = '';
    if (!title) { err.textContent = 'Please enter a test title.'; return; }
    if (!raw) { err.textContent = 'Please paste test data JSON or upload a file.'; return; }
    var data;
    try { data = JSON.parse(raw); } catch (e) { err.textContent = 'Invalid JSON: ' + e.message; return; }
    data = normalizeDataset(data);
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
      category_id: categoryId,
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

  async function moveTestCategory(testId) {
    var { data: cats } = await sb.from('categories').select('id, name, icon').order('display_order', { ascending: true });
    var { data: test } = await sb.from('tests').select('title, category_id').eq('id', testId).maybeSingle();
    if (!test) { toast('Test not found.'); return; }
    var opts = '<option value="">-- No category (uncategorized) --</option>' + (cats || []).map(function (c) { return '<option value="' + c.id + '"' + (c.id === test.category_id ? ' selected' : '') + '>' + (c.icon || '📁') + ' ' + esc(c.name) + '</option>'; }).join('');
    var html = '<div class="modal show"><div class="box"><h3>Move Test to Category</h3><p class="note">Choose which folder this test belongs in.</p>' +
      '<div class="field"><label>Category</label><select id="mv-cat">' + opts + '</select></div>' +
      '<div class="acts">' +
      '<button style="background:#eee;color:#3a4c5e" onclick="App.hideModal(\'mvModal\')">Cancel</button>' +
      '<button style="background:var(--brand);color:#fff" onclick="App.saveTestCategory(' + "'" + testId + "'" + ')">Save</button>' +
      '</div></div></div>';
    var modal = document.createElement('div');
    modal.id = 'mvModal';
    modal.className = 'modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.classList.add('show');
  }

  async function saveTestCategory(testId) {
    var catId = el('mv-cat').value || null;
    var { error } = await sb.from('tests').update({ category_id: catId }).eq('id', testId);
    var modal = el('mvModal');
    if (modal) modal.remove();
    if (error) { toast('Failed: ' + error.message); return; }
    toast('Test moved!');
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
    var del = await sb.from('test_access').delete().eq('test_id', testId);
    if (del.error) { toast('Failed: ' + del.error.message); return; }
    for (var i = 0; i < selected.length; i++) {
      await sb.from('test_access').insert({ test_id: testId, user_id: selected[i] });
    }
    // Grant the selected students access to the test's folder (category) as well,
    // so the folder shows them under "Students with Access" and they can see it.
    var { data: t } = await sb.from('tests').select('category_id').eq('id', testId).maybeSingle();
    if (t && t.category_id && selected.length) {
      for (var j = 0; j < selected.length; j++) {
        await sb.from('category_access').upsert({
          category_id: t.category_id,
          user_id: selected[j],
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: state.user.id
        });
      }
    }
    hideModal('assignModal');
    toast(selected.length + ' student(s) assigned' + (t && t.category_id ? ' + folder access granted' : ''));
    renderTests();
  }

  // ---------------- admin: results ----------------
  var resultsModeCur = 'test';

  function jsonAttr(o) { return esc(JSON.stringify(o)).replace(/'/g, '&#39;'); }

  async function renderResults() {
    var box = el('admResults');
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading...</div>';
    var { data: tests } = await sb.from('tests').select('id, title').order('created_at', { ascending: false });
    var { data: students } = await sb.from('profiles').select('id, name, phone').eq('role', 'student').order('name', { ascending: true });
    var tOpts = '<option value="">-- Select a test --</option>' + (tests || []).map(function (t) { return '<option value="' + t.id + '">' + esc(t.title) + '</option>'; }).join('');
    var sOpts = '<option value="">-- Select a student --</option>' + (students || []).filter(function (s) { return s.name; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + ' \u00b7 ' + esc(s.phone) + '</option>'; }).join('');
    var inner = '<div class="admCard"><h3>Results</h3>' +
      '<div class="filterButtons" style="margin-bottom:14px">' +
      '<button class="' + (resultsModeCur === 'test' ? 'active' : '') + '" onclick="App.setResultsMode(\'test\')">Test-wise</button>' +
      '<button class="' + (resultsModeCur === 'user' ? 'active' : '') + '" onclick="App.setResultsMode(\'user\')">User-wise</button>' +
      '</div>' +
      '<div id="resTestPane" class="' + (resultsModeCur === 'test' ? '' : 'hidden') + '">' +
        '<div class="field"><label>Choose test</label><select id="res-test" onchange="App.loadResults()">' + tOpts + '</select></div>' +
        '<div id="res-table"><div class="empty">Select a test above to see who attempted it.</div></div>' +
      '</div>' +
      '<div id="resUserPane" class="' + (resultsModeCur === 'user' ? '' : 'hidden') + '">' +
        '<div class="field"><label>Choose student</label><select id="res-user" onchange="App.loadUserResults()">' + sOpts + '</select></div>' +
        '<div id="res-user-table"><div class="empty">Select a student above to see their complete performance.</div></div>' +
      '</div>' +
      '</div>';
    box.innerHTML = inner;
  }

  function setResultsMode(m) {
    resultsModeCur = m;
    el('resTestPane').classList.toggle('hidden', m !== 'test');
    el('resUserPane').classList.toggle('hidden', m !== 'user');
    document.querySelectorAll('#admResults .filterButtons button').forEach(function (b, i) {
      b.classList.toggle('active', (i === 0) === (m === 'test'));
    });
  }

  async function loadUserResults() {
    var userId = el('res-user').value;
    var box = el('res-user-table');
    if (!userId) { box.innerHTML = '<div class="empty">Select a student above.</div>'; return; }
    box.innerHTML = '<div class="empty"><span class="spinner"></span> Loading...</div>';
    var rr = await sb.from('results')
      .select('*, tests(title)')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false });
    var rows = rr.data || [];
    if (!rows.length) { box.innerHTML = '<div class="empty">This student has not attempted any test yet.</div>'; return; }
    var totalPct = 0, bestPct = 0, totalTime = 0;
    rows.forEach(function (r) {
      var pct = r.max_score ? (r.score / r.max_score * 100) : 0;
      totalPct += pct; totalTime += (r.time_used_sec || 0);
      if (pct > bestPct) bestPct = pct;
    });
    var avgPct = totalPct / rows.length;
    var summary = '<div class="ov-grid" style="margin-bottom:16px">' +
      '<div class="ov-box"><div class="val">' + rows.length + '</div><div class="lbl">Tests Attempted</div></div>' +
      '<div class="ov-box"><div class="val ' + (avgPct >= 60 ? 'ok' : (avgPct >= 40 ? 'gold' : 'bad')) + '">' + avgPct.toFixed(1) + '%</div><div class="lbl">Average Score</div></div>' +
      '<div class="ov-box"><div class="val ok">' + bestPct.toFixed(1) + '%</div><div class="lbl">Best Score</div></div>' +
      '<div class="ov-box"><div class="val">' + fmtSec(totalTime) + '</div><div class="lbl">Total Time Spent</div></div>' +
      '</div>';
    var tbl = '<table class="tbl"><thead><tr><th>Test</th><th>Score</th><th>%</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Time</th><th>Submitted</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var pct = r.max_score ? (r.score / r.max_score * 100).toFixed(1) : '0';
      tbl += '<tr><td><b>' + esc(r.tests ? r.tests.title : 'Test') + '</b></td>' +
        '<td><b>' + r.score + '/' + r.max_score + '</b></td>' +
        '<td>' + pct + '%</td>' +
        '<td><span class="badge ok">' + r.correct + '</span></td><td><span class="badge bad">' + r.incorrect + '</span></td>' +
        '<td><span class="badge u">' + r.unattempted + '</span></td>' +
        '<td>' + fmtSec(r.time_used_sec) + '</td>' +
        '<td>' + esc(new Date(r.submitted_at).toLocaleString()) + '</td>' +
        '<td><button class="ok" onclick="App.viewResultRow(' + "'" + r.id + "'" + ')">View Report</button></td></tr>';
    });
    tbl += '</tbody></table>';
    box.innerHTML = summary + '<p class="note">Click <b>View Report</b> to open the full analysis of that attempt.</p>' + tbl;
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
        '<td><div class="actions"><button class="ok" onclick="App.viewResultRow(' + "'" + r.id + "'" + ')">View Report</button>' +
        '<button class="danger" onclick="App.resetResult(' + "'" + r.id + "'" + ')">Reset</button></div></td></tr>';
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
    getClient: function () { return sb; },
    toggleTheme: toggleTheme,
    showAuthTab: showAuthTab,
    login: login,
    signup: signup,
    logout: logout,
    checkApproval: checkApproval,
    adminTab: adminTab,
    approveUser: approveUser,
    removeUser: removeUser,
    renderCategories: renderCategories,
    createCategory: createCategory,
    editCategory: editCategory,
    toggleCategoryStatus: toggleCategoryStatus,
    deleteCategory: deleteCategory,
    assignAllStudentsToCategory: assignAllStudentsToCategory,
    manageCategoryUsers: manageCategoryUsers,
    cuToggleAll: cuToggleAll,
    closeCatUsersModal: closeCatUsersModal,
    saveCategoryUsers: saveCategoryUsers,
    removeAllCategoryUsers: removeAllCategoryUsers,
    renderTests: renderTests,
    uploadTest: uploadTest,
    readFile: readFile,
    toggleArchive: toggleArchive,
    deleteTest: deleteTest,
    moveTestCategory: moveTestCategory,
    saveTestCategory: saveTestCategory,
    assignTest: assignTest,
    saveAssignments: saveAssignments,
    renderResults: renderResults,
    loadResults: loadResults,
    setResultsMode: setResultsMode,
    loadUserResults: loadUserResults,
    resetResult: resetResult,
    backToDash: backToDash,
    closeInst: closeInst,
    saveResult: saveResult,
    viewResult: viewResult,
    viewResultRow: viewResultRow,
    renderDashboard: renderDashboard,
    showModal: showModal,
    hideModal: hideModal,
    showView: showView,
    toggleCategorySection: toggleCategorySection,
    toast: toast,
    state: state
  };
})();

document.addEventListener('DOMContentLoaded', function () { App.init(); });