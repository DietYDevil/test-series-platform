// ============================================================
// TestRunner - the test-taking engine
// Reuses the logic from the original standalone HTML test file.
// ============================================================
window.TestRunner = (function () {
  var DATA = null;      // full dataset {testName, timeLimitMin, totalQs, maxScore, subjects, topper, questions}
  var Q = [];
  var N = 0;
  var answers = [];
  var timeSpent = [];
  var marked = [];
  var visited = [];
  var cur = 0;
  var remaining = 0;
  var timerInt = null;
  var running = false;
  var RES = null;
  var TOT = 0;
  var KEYS = ['A', 'B', 'C', 'D', 'E'];
  var _lastTestId = null;
  var _lastData = null;

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h > 0 ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function who() {
    try { return (App.state.profile && App.state.profile.name) || 'You'; } catch (e) { return 'You'; }
  }

  // ---------- load a test ----------
  var SECS = [];
  var SECQ = {};
  function buildSections() {
    SECS = DATA.sections || [];
    SECQ = {};
    if (SECS.length) {
      SECS.forEach(function (s) { SECQ[s.id] = []; });
      Q.forEach(function (q, i) { var pid = q.part || (SECS[0] && SECS[0].id); if (SECQ[pid]) SECQ[pid].push(i); else { SECQ[pid] = [i]; } });
    // Reconcile orphan buckets (CSIR: q.part="Part A" vs sec.name="Part A MCQ")
    for (var pi in SECQ) {
      if (pi === SECS[0].id) continue; // skip main bucket
      var idxs = SECQ[pi];
      var matched = false;
      SECS.forEach(function(s){
        if (s.name.indexOf(pi)!==-1 || pi.indexOf(s.name)!==-1 || s.name.toLowerCase().replace(/\s/g,'')===pi.toLowerCase().replace(/\s/g,'')) {
          SECQ[s.id] = SECQ[s.id] || [];
          SECQ[s.id] = SECQ[s.id].concat(idxs);
          matched = true;
        }
      });
      if (!matched && SECS[0]) { // move other orphans to default bucket
        SECQ[SECS[0].id] = SECQ[SECS[0].id] || [];
        SECQ[SECS[0].id] = SECQ[SECS[0].id].concat(idxs);
      }
    }
    } else {
      SECS = [{ id: 'A', name: 'All Questions', type: 'MCQ', count: N }];
      SECQ['A'] = Q.map(function (_, i) { return i; });
    }
  }
  
  // Ensure we have the topper data available for rankings
  function ensureToppersData() {
    if (!DATA.toppers || !Array.isArray(DATA.toppers) || DATA.toppers.length === 0) {
      // If no topper data exists in the test, create a minimal default to avoid errors
      DATA.toppers = [
        { name: 'Not Available', rank: 1, score: 0, correct: 0, incorrect: 0, timeMin: 0 }
      ];
    }
  }
  function secActiveFor(i) {
    for (var s = 0; s < SECS.length; s++) { var ids = SECQ[SECS[s].id]; if (i >= ids[0] && i <= ids[ids.length - 1]) return SECS[s].id; }
    return SECS[SECS.length - 1].id;
  }
  function loadTest(testObj) {
    _lastTestId = testObj.id || null;
    _lastData = testObj.data || {};
    DATA = testObj.data || {};
    
    // Ensure backward compatibility - normalize legacy test data to expected format
    if (!DATA.questions && DATA.question && Array.isArray(DATA.question)) {
      // Older format: convert from question[] to questions[]
      DATA.questions = DATA.question;
    }
    
    Q = DATA.questions || [];
    N = Q.length;
    answers = new Array(N).fill(null);
    timeSpent = new Array(N).fill(0);
    marked = new Array(N).fill(false);
    visited = new Array(N).fill(false);
    cur = 0; remaining = (DATA.timeLimitMin || testObj.duration_min || 60) * 60;
    buildSections();
    ensureToppersData();
    
    var title = testObj.title || DATA.testName || 'Test';
    var catName = (testObj.categories && testObj.categories.name) || '';
    var isCsir = /csir/i.test(catName);
    
    document.getElementById('tbName').textContent = title;
    document.getElementById('tbBrand').textContent = isCsir ? 'CSIR NET DEC 2026 TEST SERIES' : ((catName || 'ONLINE') + ' TEST SERIES').toUpperCase();
    document.getElementById('tbSub').textContent = isCsir ? 'Council of Scientific & Industrial Research — National Eligibility Test' : 'Secure Online Test Portal';
    document.getElementById('sbInstr').textContent = 'Green = answered, Red = visited-not-answered, Purple = marked, White = not visited.';
    var nm = who();
    document.getElementById('candName').textContent = nm;
// remove candRoll line for CE format
    updateAnswered();
  }

  function openInstructions(testObj) {
    loadTest(testObj);
    document.getElementById('instTitle').textContent = testObj.title || DATA.testName;
    document.getElementById('instQs').textContent = N;
    document.getElementById('instDur').textContent = (DATA.timeLimitMin || testObj.duration_min) + ' minutes';
    document.getElementById('instMax').textContent = DATA.maxScore || testObj.max_score || '—';
    var pos = (Q[0] && Q[0].marksPos) || 0, neg = (Q[0] && Q[0].marksNeg) || 0;
    document.getElementById('instMarks').textContent = '+'+pos+' / -'+neg;
    document.getElementById('instRules').innerHTML =
      '<b>Instructions</b><ul class="instList">' +
      '<li>' + N + ' questions, ' + (DATA.timeLimitMin || testObj.duration_min) + ' minutes total.</li>' +
      '<li>The clock runs continuously; the test auto-submits at 0:00.</li>' +
      '<li>+'+pos+' for correct, -'+neg+' for incorrect. No negative for unattempted.</li>' +
      '<li>Use the palette to navigate. Mark questions for review to come back later.</li>' +
      '<li>Submitting locks your attempt — it can only be reset by the administrator.</li></ul>';
    document.getElementById('instNote').textContent = 'Your name and phone are recorded with this attempt.';
    document.getElementById('instErr').textContent = '';
    App.showModal('instModal');
  }

  function start() {
    App.hideModal('instModal');
    App.showView('viewTest');
    running = true;
    timerInt = setInterval(tick, 1000);
    updateTimer();
    renderSecBar();
    renderPalette();
    updateAnswered();
    showQ(0);
    if (document.documentElement.requestFullscreen) { try { document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {} }
  }

  function tick() {
    remaining--;
    updateTimer();
    timeSpent[cur]++;
    if (remaining <= 0) { clearInterval(timerInt); finish(true); }
  }
  function updateTimer() {
    var el = document.getElementById('timer');
    el.textContent = fmt(remaining);
    el.classList.toggle('warn', remaining <= 300 && remaining > 0);
  }

  // ---------- question rendering ----------
  function renderPalette() {
    var p = document.getElementById('palette'); p.innerHTML = '';
    SECS.forEach(function (s) {
      var ids = SECQ[s.id] || [];
      var head = document.createElement('div');
      head.className = 'sechead';
      head.textContent = s.name + ' (' + ids.length + ')';
      p.appendChild(head);
      ids.forEach(function (i) {
        var b = document.createElement('button');
        b.textContent = i + 1;
        b.id = 'pal' + i;
        if (i === cur) b.classList.add('cur');
        if (marked[i] && hasAns(i)) b.classList.add('answered', 'marked');
        else if (hasAns(i)) b.classList.add('answered');
        else if (marked[i]) b.classList.add('marked');
        else if (visited[i]) b.classList.add('nanswered');
        (function (idx) { b.onclick = function () { showQ(idx); }; })(i);
        p.appendChild(b);
      });
    });
    renderSecBar();
  }
  function renderSecBar() {
    var bar = document.getElementById('secbar');
    if (!bar) return;
    bar.innerHTML = '';
    SECS.forEach(function (s) {
      var ids = SECQ[s.id] || [];
      var answered = 0; ids.forEach(function (i) { if (hasAns(i)) answered++; });
      var d = document.createElement('button');
      d.className = 'sec-tab' + (secActiveFor(cur) === s.id ? ' active' : '');
      d.innerHTML = '<span class="sname">' + esc(s.name) + '</span>' +
        '<span class="smeta"><span class="schip">' + esc(s.type) + ' (' + ids.length + ')</span> +' + (s.marksPos || 0) +
        ((s.marksNeg || 0) > 0 ? ' / &minus;' + s.marksNeg : ' / 0') + ' &middot; answered ' + answered + '/' + ids.length + '</span>';
      (function (pid) { d.onclick = function () { jumpSection(pid); }; })(s.id);
      bar.appendChild(d);
    });
  }
  function jumpSection(pid) {
    var ids = SECQ[pid] || [];
    var target = null;
    for (var k = 0; k < ids.length; k++) { if (!visited[ids[k]]) { target = ids[k]; break; } }
    if (target === null) target = ids[0];
    showQ(target);
  }
  function hasAns(i) { var a = answers[i]; return Array.isArray(a) ? a.length > 0 : (a !== null && a !== undefined && String(a).trim() !== ''); }
  function updateAnswered() {
    var el = document.getElementById('answeredChip');
    if (el) el.textContent = 'Answered: ' + countAns() + ' / ' + N;
  }

  function showQ(i) {
    cur = i; visited[i] = true;
    var q = Q[i];
    document.getElementById('qnum').textContent = 'Question ' + (i + 1) + ' of ' + N;
    var qt = document.getElementById('qtype');
    if (qt) { qt.textContent = q.type || ''; }
    var qs = document.getElementById('qsec');
    if (qs) qs.textContent = (q.subject || '').replace('PART-', 'PART ');
    document.getElementById('qsubj').textContent = q.subject || '';
    var qm = document.getElementById('qmarks');
    if (qm) qm.textContent = '+' + (q.marksPos || 0) + ((q.marksNeg || 0) > 0 ? ' / &minus;' + q.marksNeg : ' / 0');
    var body = document.getElementById('qbody');
    body.innerHTML = (Q[i].passage ? ('<div style="background:#f7fafc;border:1px solid #e4ebf2;border-radius:8px;padding:12px 14px;margin-bottom:12px;font-size:14px">' + Q[i].passage + '</div>') : '') + (Q[i].question || '');
    var opts = document.getElementById('opts'); opts.innerHTML = '';
    var natwrap = document.getElementById('natwrap');
    if (Q[i].type === 'NAT') {
      natwrap.classList.remove('hidden');
      var inp = document.getElementById('natinput');
      inp.value = hasAns(i) ? answers[i] : '';
      document.getElementById('natsaved').textContent = hasAns(i) ? 'Answer saved.' : '';
    } else {
      natwrap.classList.add('hidden');
      if (isMultiType(Q[i])) {
        var note = document.createElement('div'); note.className = 'msqnote';
        note.textContent = 'MSQ: One or more options may be correct. Select all that apply.';
        opts.appendChild(note);
      }
      (Q[i].options || []).forEach(function (op, oi) {
        var d = document.createElement('div');
        d.className = 'opt' + (selectedOpt(i, oi) ? ' selected' : '');
        var k = document.createElement('span'); k.className = 'key'; k.textContent = KEYS[oi];
        var v = document.createElement('span'); v.className = 'val'; v.innerHTML = op;
        d.appendChild(k); d.appendChild(v);
        (function (qi, oi2) { d.onclick = function () { choose(qi, oi2); }; })(i, oi);
        opts.appendChild(d);
      });
    }
    document.getElementById('nav').children[0].disabled = (i === 0);
    renderPalette();
  }
  function selectedOpt(i, oi) { var a = answers[i]; return Array.isArray(a) ? a.indexOf(oi) >= 0 : a === oi; }
  function isMultiType(q) { return q.type === 'MSQ' || q.type === 'MAQ' || q.type === 'VMAQ' || q.type === 'MTQ'; }
  function choose(i, oi) {
    var q = Q[i];
    if (isMultiType(q)) {
      if (!Array.isArray(answers[i])) answers[i] = [];
      var a = answers[i], p = a.indexOf(oi);
      if (p >= 0) a.splice(p, 1); else a.push(oi);
    } else {
      answers[i] = oi;
    }
    renderPalette(); showQ(i); updateAnswered();
  }
  function saveNAT() {
    var inp = document.getElementById('natinput');
    var v = inp.value.trim();
    if (v === '') { answers[cur] = null; document.getElementById('natsaved').textContent = ''; }
    else {
      if (isNaN(parseFloat(v))) { document.getElementById('natsaved').textContent = 'Please enter a valid number.'; return; }
      answers[cur] = v;
      document.getElementById('natsaved').textContent = 'Answer saved.';
    }
    renderPalette(); updateAnswered();
  }
  function clearNAT() {
    answers[cur] = null;
    document.getElementById('natinput').value = '';
    document.getElementById('natsaved').textContent = '';
    renderPalette(); updateAnswered();
  }
  function go(d) { var ni = cur + d; if (ni >= 0 && ni < N) showQ(ni); }
  function markReview() { marked[cur] = !marked[cur]; renderPalette(); }
  function saveNext() { var ni = cur + 1; if (ni < N) showQ(ni); else renderPalette(); }
  function markReviewNext() { marked[cur] = !marked[cur]; var ni = cur + 1; if (ni < N) showQ(ni); else renderPalette(); }
  function clearResponse() {
    var q = Q[cur];
    if (q.type === 'NAT') {
      answers[cur] = null;
      var inp = document.getElementById('natinput'); if (inp) inp.value = '';
      document.getElementById('natsaved').textContent = '';
    } else {
      answers[cur] = null;
    }
    renderPalette(); showQ(cur);
  }

  function openSubmit() {
    if (!running) return;
    document.getElementById('smTotal').textContent = N;
    var ans = countAns(), mk = marked.filter(Boolean).length;
    document.getElementById('smAns').textContent = ans;
    document.getElementById('smNa').textContent = N - ans;
    document.getElementById('smMk').textContent = mk;
    document.getElementById('smTime').textContent = fmt(remaining);
    App.showModal('submitModal');
  }
  function closeSubmit() { App.hideModal('submitModal'); }
  function countAns() { var c = 0; for (var i = 0; i < N; i++) if (hasAns(i)) c++; return c; }

  function finish(auto) {
    clearInterval(timerInt); running = false;
    App.hideModal('submitModal');
    App.saveResult().then(function (ok) {
      if (ok === false) App.toast('Attempt could not be saved. You may already have an attempt for this test.');
      App.showView('viewResult');
      renderAnalysis();
      window.scrollTo(0, 0);
      if (document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} }
    });
  }

  // ---------- grading ----------
  function numEq(a, b) { return Math.abs(parseFloat(a) - b) < 1e-6; }
  function grade() {
    var res = [];
    for (var i = 0; i < N; i++) {
      var q = Q[i], a = answers[i];
      var status, marks;
      if (q.type === 'NAT') {
        if (a === null || a === undefined || String(a).trim() === '') { status = 'unattempted'; marks = 0; }
        else if (numEq(a, q.natAns)) { status = 'correct'; marks = q.marksPos || 0; }
        else { status = 'incorrect'; marks = 0; }
      } else {
        var selected = Array.isArray(a) ? a : (a === null ? [] : [a]);
        var correct = selected.length === (q.ans || []).length && selected.every(function (s) { return (q.ans || []).indexOf(s) >= 0; });
        status = selected.length === 0 ? 'unattempted' : (correct ? 'correct' : 'incorrect');
        marks = selected.length === 0 ? 0 : (correct ? (q.marksPos || 0) : -(q.marksNeg || 0));
      }
      res.push({ i: i, correct: status === 'correct', status: status, marks: marks, time: timeSpent[i] });
    }
    return res;
  }

  function gradeSnapshot() {
    var tot = 0, correct = 0, incorrect = 0, unattempted = 0;
    for (var i = 0; i < N; i++) {
      var q = Q[i], a = answers[i];
      if (q.type === 'NAT') {
        if (a === null || a === undefined || String(a).trim() === '') { unattempted++; }
        else if (numEq(a, q.natAns)) { correct++; tot += (q.marksPos || 0); }
        else { incorrect++; tot -= (q.marksNeg || 0); }
      } else {
        var sel = Array.isArray(a) ? a : (a === null ? [] : [a]);
        var ca = (q.ans || []);
        var ok = sel.length === ca.length && sel.every(function (s) { return ca.indexOf(s) >= 0; });
        if (!sel.length) { unattempted++; }
        else if (ok) { correct++; tot += (q.marksPos || 0); }
        else { incorrect++; tot -= (q.marksNeg || 0); }
      }
    }
    var totalTime = timeSpent.reduce(function (s, x) { return s + (x || 0); }, 0);
    return { tot: tot, max: DATA ? (DATA.maxScore || 0) : 0, correct: correct, incorrect: incorrect, unattempted: unattempted, time: totalTime };
  }

  function renderAnalysis() {
    RES = grade();
    document.getElementById('anName').textContent = who() + ' — ' + (DATA.testName || 'Test');
    TOT = 0; RES.forEach(function (r) { TOT += r.marks; });
    renderOV(); renderSub(); renderQ(); renderTime(); renderTop();
    showTab('ov');
  }
  function showTab(id) {
    document.querySelectorAll('#viewResult .tabs button').forEach(function (b) {
      b.classList.toggle('active', b.textContent.trim().indexOf(
        id === 'ov' ? 'Score' : id === 'sub' ? 'Subject' : id === 'q' ? 'Question' : id === 'time' ? 'Time' : 'Topper') === 0);
    });
    ['ov', 'sub', 'q', 'time', 'top'].forEach(function (t) {
      document.getElementById('tp-' + t).classList.toggle('active', t === id);
    });
  }

  function renderOV() {
    var c = RES.filter(function (r) { return r.status === 'correct'; }).length;
    var w = RES.filter(function (r) { return r.status === 'incorrect'; }).length;
    var u = RES.filter(function (r) { return r.status === 'unattempted'; }).length;
    var pct = DATA.maxScore ? (TOT / DATA.maxScore * 100) : 0;
    var totalTime = RES.reduce(function (s, r) { return s + r.time; }, 0);
    var c1 = N ? c / N * 100 : 0, c2 = N ? (c + w) / N * 100 : 0;
    var donut = '<div class="donut" style="--c1:' + c1 + '%;--c2:' + c2 + '%"><div class="inner"><b>' + TOT + '/' + DATA.maxScore + '</b><span>' + pct.toFixed(1) + '%</span></div></div>';
    document.getElementById('tp-ov').innerHTML =
      '<div class="donutwrap">' + donut +
      '<div style="flex:1;min-width:260px"><div class="ov-grid">' +
      '<div class="ov-box"><div class="val ok">' + c + '</div><div class="lbl">Correct</div></div>' +
      '<div class="ov-box"><div class="val bad">' + w + '</div><div class="lbl">Incorrect</div></div>' +
      '<div class="ov-box"><div class="val">' + u + '</div><div class="lbl">Unattempted</div></div>' +
      '<div class="ov-box"><div class="val">' + fmt(totalTime) + '</div><div class="lbl">Time Taken</div></div>' +
      '</div></div></div>';
  }

  function renderSub() {
    var map = {};
    Q.forEach(function (q, i) {
      if (!map[q.subject]) map[q.subject] = { name: q.subject, pos: 0, neg: 0, total: 0, time: 0, qids: [] };
      map[q.subject].total++; map[q.subject].time += timeSpent[i]; map[q.subject].qids.push(i);
    });
    Object.keys(map).forEach(function (k) {
      var g = map[k];
      g.qids.forEach(function (i) { var r = RES[i]; if (r.status === 'correct') g.pos++; else if (r.status === 'incorrect') g.neg++; });
    });
    var rows = Object.keys(map).map(function (k) {
      var g = map[k];
      var sc = g.qids.reduce(function (s, i) { return s + RES[i].marks; }, 0);
      return '<tr><td>' + esc(g.name) + '</td><td>' + g.total + '</td><td style="color:var(--ok)">' + g.pos +
        '</td><td style="color:var(--bad)">' + g.neg + '</td><td>' + (g.total - g.pos - g.neg) + '</td><td><b>' +
        sc + '</b></td><td>' + fmt(g.time) + '</td></tr>';
    }).join('');
    document.getElementById('tp-sub').innerHTML =
      '<table class="tbl"><thead><tr><th>Subject</th><th>Questions</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Score</th><th>Time</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function uaText(i) {
    var q = Q[i], a = answers[i];
    if (q.type === 'NAT') { return (a === null || a === undefined || String(a).trim() === '') ? 'Not attempted' : String(a); }
    if (a === null || a === undefined) return 'Not attempted';
    if (Array.isArray(a)) return a.length ? a.map(function (x) { return KEYS[x]; }).join(', ') : 'Not attempted';
    return KEYS[a];
  }
  function caText(q) {
    if (q.type === 'NAT') return String(q.natAns);
    return (q.ans || []).map(function (a) { return KEYS[a]; }).join(', ');
  }

  function renderQ() {
    var h = '';
    RES.forEach(function (r) {
      var q = Q[r.i];
      var badge = r.status === 'correct' ? '<span class="badge ok">Correct</span>' : r.status === 'incorrect' ? '<span class="badge bad">Incorrect</span>' : '<span class="badge u">Unattempted</span>';
      var marksTxt = r.status === 'unattempted' ? '0' : (r.marks > 0 ? '+' + r.marks : String(r.marks));
      h += '<div class="qcard"><div class="qtop"><b>Q' + (r.i + 1) + '</b>' + badge + '<span>' + esc(q.subject || '') + '</span><span style="color:#5a6b7c">' + fmt(r.time) + ' &middot; ' + marksTxt + ' marks</span></div>' +
        '<div class="qtext">' + (q.question || '') + '</div>' +
        '<div class="ansrow"><span class="' + (r.status === 'correct' ? 'ok' : 'bad') + '">Your Answer: ' + esc(uaText(r.i)) + '</span>' +
        '<span class="ok">Correct Answer: ' + esc(caText(q)) + '</span></div></div>';
    });
    document.getElementById('tp-q').innerHTML = h;
  }

  function renderTime() {
    var total = RES.reduce(function (s, r) { return s + r.time; }, 0);
    var avg = N ? total / N : 0;
    var bars = '';
    RES.forEach(function (r) {
      var pct = total ? (r.time / total * 100) : 0;
      bars += '<div class="bar"><div class="bl"><span>Q' + (r.i + 1) + ' ' + esc(Q[r.i].subject || '') + '</span><span>' + fmt(r.time) + '</span></div><div class="track"><div class="fill time" style="width:' + pct.toFixed(1) + '%"></div></div></div>';
    });
    document.getElementById('tp-time').innerHTML =
      '<div class="ov-grid" style="margin-bottom:14px">' +
      '<div class="ov-box"><div class="val">' + fmt(total) + '</div><div class="lbl">Total Time</div></div>' +
      '<div class="ov-box"><div class="val">' + fmt(avg) + '</div><div class="lbl">Avg / Question</div></div>' +
      '<div class="ov-box"><div class="val">' + fmt((DATA.topper && DATA.topper.timeMin ? DATA.topper.timeMin : 0) * 60) + '</div><div class="lbl">Topper Time</div></div>' +
      '</div>' + bars;
  }
  
  // Helper functions for ranking and badges
  function computeRank(obtained) {
    var score = Math.round(obtained * 100) / 100;
    var myRank = 1;
    (DATA.toppers || []).forEach(function (t) { if (score < t.score) myRank++; });
    return myRank;
  }
  
  function renderRankBadge(obtained) {
    var rank = computeRank(obtained);
    var totalToppers = DATA.toppers ? DATA.toppers.length : 0;
    if (rank <= totalToppers) {
      return '<b>Rank ' + rank + '</b> (within Top ' + totalToppers + ')';
    }
    return '<b>Below ' + totalToppers + '</b>';
  }

  function renderTop() {
    var c = RES.filter(function (r) { return r.status === 'correct'; }).length;
    var w = RES.filter(function (r) { return r.status === 'incorrect'; }).length;
    var u = RES.filter(function (r) { return r.status === 'unattempted'; }).length;
    var myPct = DATA.maxScore ? (TOT / DATA.maxScore * 100) : 0;
    var totalTime = RES.reduce(function (s, r) { return s + r.time; }, 0);
    
    // Calculate rank
    var myRank = 1;
    (DATA.toppers || []).forEach(function (t) { if (TOT < t.score) myRank++; });
    var totalToppers = DATA.toppers ? DATA.toppers.length : 0;
    var lastScore = totalToppers ? DATA.toppers[totalToppers - 1].score : 0;
    var rank1Score = totalToppers ? DATA.toppers[0].score : 0;
    
    var html = '<div class="ov-grid" style="margin-bottom:14px">' +
      '<div class="ov-box"><div class="val gold">' + myRank + '</div><div class="lbl">Your Rank</div></div>' +
      '<div class="ov-box"><div class="val">' + TOT + '</div><div class="lbl">Your Score</div></div>' +
      '<div class="ov-box"><div class="val">' + rank1Score + '</div><div class="lbl">Rank 1 Score</div></div>' +
      '<div class="ov-box"><div class="val">' + lastScore + '</div><div class="lbl">Top-' + totalToppers + ' Cutoff</div></div>' +
      '</div>';
    
    if (TOT >= lastScore) {
      html += '<p style="margin-top:12px">You would be <b>#' + myRank + '</b> among the top ' + totalToppers + ' toppers of this test. Score needed for Rank 1: <b>' + rank1Score + '</b>.</p>';
    } else {
      html += '<p style="margin-top:12px">Your score <b>' + TOT + '</b> is less than the ' + totalToppers + 'th topper\'s score (<b>' + lastScore + '</b>), so you are not in the top ' + totalToppers + ' list.</p>';
    }
    
    // Calculate time comparison
    var myTimeMin = Math.round(totalTime / 60);
    if (totalTime < (DATA.topper && DATA.topper.timeMin ? DATA.topper.timeMin * 60 : 0)) {
      html += '<p style="margin-top:10px;color:#2fa84f">You completed this test ' + (Math.round(totalTime) - (DATA.topper && DATA.topper.timeMin ? Math.round(DATA.topper.timeMin * 60) : 0)) + ' seconds faster than the topper.</p>';
    } else if (totalTime > (DATA.topper && DATA.topper.timeMin ? DATA.topper.timeMin * 60 : 0)) {
      html += '<p style="margin-top:10px;color:#b82a1f">You took ' + (Math.round(totalTime) - (DATA.topper && DATA.topper.timeMin ? Math.round(DATA.topper.timeMin * 60) : 0)) + ' seconds longer than the topper.</p>';
    }
    
    html += '<h3 style="margin:20px 0 10px;color:#0b4f8a;border-bottom:2px solid #eef3f8;padding-bottom:6px">Toppers Table (Top ' + totalToppers + ')</h3>';
    html += '<table class="tbl"><thead><tr><th style="min-width:40px">Rank</th><th style="min-width:120px">Name</th><th style="min-width:60px">Score</th><th style="min-width:60px">Correct</th><th style="min-width:60px">Incorrect</th><th style="min-width:80px">Time (min)</th></tr></thead><tbody>';
    
    (DATA.toppers || []).forEach(function (t) {
      var rankStyle = t.rank <= Math.min(3, totalToppers) ? ' style="color:#b8860b;font-weight:bold"' : '';
      var name = t.name ? t.name.replace('(Top scorer)', '').trim() : 'Top Scorer';
      if (t.rank === 1) name += ' (Top Scorer)';
      
      html += '<tr' + rankStyle + '><td style="text-align:center">#' + t.rank + '</td>' +
              '<td>' + esc(name) + '</td>' +
              '<td style="text-align:center"><b>' + t.score + '</b></td>' +
              '<td style="text-align:center">' + (t.correct !== undefined ? t.correct : '—') + '</td>' +
              '<td style="text-align:center">' + (t.incorrect !== undefined ? t.incorrect : '—') + '</td>' +
              '<td style="text-align:center">' + (t.timeMin !== undefined ? t.timeMin.toFixed(1) + ' min' : '—') + '</td></tr>';
    });
    
    html += '</tbody></table>';
    document.getElementById('tp-top').innerHTML = html;
  }

  // ---------- exports ----------
  function analysisTitle() { 
    return (DATA.testName || 'Test') + ' — ' + new Date().toLocaleString();
  }
  
  function analysisHTMLBody() {
    var c = RES.filter(function (r) { return r.status === 'correct'; }).length;
    var w = RES.filter(function (r) { return r.status === 'incorrect'; }).length;
    var u = RES.filter(function (r) { return r.status === 'unattempted'; }).length;
    var pct = DATA.maxScore ? (TOT / DATA.maxScore * 100) : 0;
    var totalTime = RES.reduce(function (s, r) { return s + r.time; }, 0);
    var myRank = computeRank(TOT);
    
    var h = '<div style="text-align:center;border-bottom:3px solid #0b2e59;padding-bottom:12px;margin-bottom:16px">' +
      '<h1 style="margin:0;font-size:20px;color:#0b2e59">' + esc(DATA.testName || 'Test') + '</h1>' +
      '<p style="margin:4px 0;color:#556">Attempt completed: ' + esc(new Date().toLocaleString()) + '</p>' +
      '</div>';
    
    h += '<h2 style="color:#0b2e59;border-bottom:2px solid #0e4f8f;padding-bottom:3px;font-size:15px">Score Overview</h2>' +
      '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12.5px">' +
      '<tr><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Score</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Correct</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Incorrect</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Unattempted</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Percentage</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Time Used</th><th style="border:1px solid #ccc;background:#eef2f8;padding:6px">Rank</th></tr>' +
      '<tr><td style="border:1px solid #ccc;padding:6px;font-weight:700">' + TOT.toFixed(2) + ' / ' + DATA.maxScore + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;color:#1e7a38">' + c + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;color:#b82a1f">' + w + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + u + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + pct.toFixed(1) + '%</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + fmt(totalTime) + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px">' + renderRankBadge(TOT) + '</td></tr></table>';
    
    // Top 20 table
    h += '<h2 style="color:#0b2e59;border-bottom:2px solid #0e4f8f;padding-bottom:3px;font-size:15px;margin-top:18px">Top ' + (DATA.toppers ? Math.min(20, DATA.toppers.length) : 0) + ' Toppers</h2>' +
      '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px">' +
      '<tr><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Rank</th><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Name</th><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Score</th><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Correct</th><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Incorrect</th><th style="border:1px solid #ccc;background:#eef2f8;padding:5px">Time</th></tr>';
    
    var timeUnit = (DATA.toppers && DATA.toppers[0] && DATA.toppers[0].timeMin) ? 'min' : 's';
    var timeFactor = (DATA.toppers && DATA.toppers[0] && DATA.toppers[0].timeMin) ? 60 : 1;
    
    (DATA.toppers || []).slice(0, 20).forEach(function (t) {
      h += '<tr><td style="border:1px solid #ccc;padding:5px;text-align:center">' + t.rank + '</td>' +
           '<td style="border:1px solid #ccc;padding:5px">' + esc(t.name ? t.name.replace('(Top scorer)', '').trim() : 'Top Scorer ' + t.rank) + '</td>' +
           '<td style="border:1px solid #ccc;padding:5px;text-align:center">' + t.score + '</td>' +
           '<td style="border:1px solid #ccc;padding:5px;text-align:center">' + (t.correct !== undefined ? t.correct : '—') + '</td>' +
           '<td style="border:1px solid #ccc;padding:5px;text-align:center">' + (t.incorrect !== undefined ? t.incorrect : '—') + '</td>' +
           '<td style="border:1px solid #ccc;padding:5px;text-align:center">' + (timeFactor ? Math.round((t.timeMin || t.timeTakenSec) / timeFactor) + (timeUnit === 'min' ? ' min' : ' sec') : '—') + '</td></tr>';
    });
    h += '</table>';
    
    // Question-wise details
    h += '<h2 style="color:#0b2e59;border-bottom:2px solid #0e4f8f;padding-bottom:3px;font-size:15px;margin-top:18px">Question-Wise Report</h2>';
    RES.forEach(function (p) {
      var q = Q[p.i];
      var caTxt = q.type === 'NAT' ? String(typeof q.natAns !== 'undefined' ? q.natAns : (q.ans ? q.ans[0] : '')) : (q.ans ? q.ans.map(function (a) { return KEYS[a]; }).join(', ') : '');
      var statusbadge = p.status === 'correct' ? '<span style="color:#1e7a38;font-weight:700">Correct</span>' : p.status === 'incorrect' ? '<span style="color:#b82a1f;font-weight:700">Incorrect</span>' : '<span style="color:#8a99a8;font-weight:700">Unattempted</span>';
      var markOrUnattempted = q.type === 'NAT' ? (answers[p.i] === null || answers[p.i] === undefined || String(answers[p.i]).trim() === '') ? 'Unattempted' : (numEq(String(answers[p.i]), q.natAns || NaN) ? statusbadge : statusbadge) : '';
      h += '<div style="border:1px solid #dbe1ea;border-radius:6px;padding:12px 14px;margin:10px 0;page-break-inside:avoid">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px">' +
        '<b>Q' + (p.i + 1) + ' [' + esc(q.subject || '') + ']</b>' + statusbadge +
        '<span style="color:#5a6578">+' + (q.marksPos || 0) + ' / -' + (q.marksNeg || 0) + ' &nbsp; ' + (p.mark > 0 ? '+' + p.mark : p.mark) + ' marks</span></div>' +
        '<div style="font-size:13px;line-height:1.55">' + (q.question || q.q || '') + '</div>' +
        '<div style="margin-top:8px;font-size:12.5px">';
      (q.options || []).forEach(function (op, oi) {
        var isUser = p.selected && p.selected.indexOf(oi) >= 0;
        var isCorrect = (q.ans ? q.ans.indexOf(oi) >= 0 : false) || (q.type === 'NAT' && numEq(String(op), String(q.natAns || (q.ans && q.ans[0]))));
        var style = 'border:1px solid #dbe1ea;border-radius:4px;padding:5px 8px;margin:3px 0;background:#fff';
        var tag = '';
        if (isCorrect) { style += ';background:#e9f7ee;border-color:#2fa84f;'; tag = ' <span style="color:#1e7a38;font-weight:700">✔ Correct</span>'; }
        if (isUser && !isCorrect) { style += ';background:#fdeeec;border-color:#e0392b;'; tag = ' <span style="color:#b82a1f;font-weight:700">✘ Your pick</span>'; }
        h += '<div style="' + style + '"><b>' + KEYS[oi] + '.</b> ' + op + tag + '</div>';
      });
      h += '</div>' +
        '<div style="margin-top:8px;font-size:12.5px;color:#23303f"><b>Your Answer:</b> ' + esc(uaText(p.i)) + ' &nbsp;|&nbsp; <b>Correct Answer:</b> <span style="color:#1e7a38;font-weight:700">' + caTxt + '</span></div>';
      if (q.solution) {
        h += '<div style="margin-top:8px;padding:9px 11px;background:#f7fafc;border-left:3px solid #0e4f8f;font-size:12.5px;color:#23303f"><b>Solution:</b><br>' + q.solution + '</div>';
      }
      h += '</div>';
    });
    
    return h;
  }
  function download(name, type, content) {
    var blob = new Blob([content], { type: type + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }
  function exportHTML() {
    var css = 'body{font-family:Segoe UI,Arial,sans-serif;margin:30px;color:#20293a;font-size:13px}img{max-width:100%}table{font-size:12px}h2{margin-top:22px}';
    var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Test Report - ' + esc(DATA.testName || 'Test') + '</title><style>' + css + '</style></head><body>' + analysisHTMLBody() + '</body></html>';
    var filename = (DATA.testName || 'test').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '_report.html';
    download(filename, 'text/html', doc);
  }
  function exportMD() {
    var c = RES.filter(function (r) { return r.status === 'correct'; }).length;
    var w = RES.filter(function (r) { return r.status === 'incorrect'; }).length;
    var u = RES.filter(function (r) { return r.status === 'unattempted'; }).length;
    var pct = DATA.maxScore ? (TOT / DATA.maxScore * 100) : 0;
    var totalTime = RES.reduce(function (s, r) { return s + r.time; }, 0);
    var tp = DATA.topper || {};
    var md = '# ' + (DATA.testName || 'Test') + '\n\n_' + new Date().toLocaleString() + '_\n\n';
    md += '## Score Overview\n\n| Score | Correct | Incorrect | Unattempted | Percentage | Time |\n|---|---|---|---|---|---|\n';
    md += '| ' + TOT + '/' + DATA.maxScore + ' | ' + c + ' | ' + w + ' | ' + u + ' | ' + pct.toFixed(1) + '% | ' + fmt(totalTime) + ' |\n\n';
    md += '## Compare with Topper\n\n- Topper: **' + (tp.name || '—') + '** — ' + (tp.score || 0) + '/' + DATA.maxScore + '\n- Difference: **' + (TOT - (tp.score || 0)) + '**\n\n';
    md += '## Question Wise\n\n';
    RES.forEach(function (r) {
      var q = Q[r.i];
      var plain = (q.question || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      md += '### Q' + (r.i + 1) + ' — ' + r.status.toUpperCase() + ' (' + fmt(r.time) + ', ' + (r.marks > 0 ? '+' + r.marks : r.marks) + ' marks)\n\n' + plain + '\n\n- Your Answer: ' + uaText(r.i) + '\n- Correct Answer: ' + caText(q) + '\n\n';
    });
    
    // Enhanced: add topper table (like standalone HTML replica)
    var top20 = Math.min(20, DATA.toppers ? DATA.toppers.length : 0);
    if (top20 > 0) {
      var beforeTable = md.indexOf('## Question Wise');
      var topperTable = '\n\n## Toppers (Top ' + top20 + ')\n\n| Rank | Name | Score |\n|---|---|---|\n';
      (DATA.toppers || []).slice(0, top20).forEach(function(t) {
        var name = t.name ? t.name.replace('(Top scorer)', '').trim() : ('Top Scorer ' + t.rank);
        if (t.rank === 1) name += ' (Top Scorer)';
        topperTable += '| ' + t.rank + ' | ' + name.replace(/\*|_|`/g, '') + ' | ' + t.score + ' |\n';
      });
      if (beforeTable >= 0) {
        md = md.substring(0, beforeTable) + topperTable + md.substring(beforeTable);
      }
    }
    
    var filename = (DATA.testName || 'test').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_') + '_report.md';
    download(filename, 'text/markdown', md);
  }
  function exportPDF() {
    var doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(analysisTitle()) + '</title><style>@page{size:A4;margin:14mm}body{font-family:Segoe UI,Arial,sans-serif;color:#1c2733;font-size:12px}h1{color:#0b4f8a;font-size:18px}h2{border-bottom:2px solid #0b4f8a;padding-bottom:3px;font-size:14px;color:#0b4f8a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:5px 7px;text-align:left}h3{font-size:12px;margin:10px 0 2px}img{max-width:100%}</style></head><body>' + analysisHTMLBody() + '</body></html>';
    var w = window.open('', '_blank');
    if (!w) { App.toast('Please allow popups to save as PDF.'); return; }
    w.document.write(doc); w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  }

  // ---------- show a previously saved result ----------
  function viewStoredResult(testObj, resultRow) {
    loadTest(testObj);
    answers = (resultRow.answers || []).slice();
    timeSpent = (resultRow.time_spent || []).slice();
    marked = (resultRow.marked || []).slice();
    visited = new Array(N).fill(true);
    remaining = 0;
    App.showView('viewResult');
    renderAnalysis();
    window.scrollTo(0, 0);
  }

  // ---------- Scientific Calculator (CSIR NET standalone format) ----------
  var calcDisplay = document.getElementById("calcDisplay");
  var memIndicatorEl = document.getElementById("memIndicator");
  var curr = "0", prevVal = null, pendingOp = null, justEvaluated = false, memory = 0;
  var angleMode = "Deg";

  function cupdate() { if (!calcDisplay) return; calcDisplay.value = curr; if (memIndicatorEl) memIndicatorEl.textContent = memory !== 0 ? "M" : ""; }
  function cfmt(n) { if (!isFinite(n)) return "Error"; if (Number.isInteger(n)) return String(n); return String(parseFloat(n.toPrecision(10))); }
  function cdigit(d) { if (curr === "0" || justEvaluated || curr === "Error") { curr = d; justEvaluated = false; } else { curr += d; } cupdate(); }
  function cdot() { if (justEvaluated) { curr = "0."; justEvaluated = false; } else if (curr.indexOf(".") < 0) { curr += "."; } cupdate(); }
  function cop(op) { if (pendingOp && !justEvaluated) ccompute(); prevVal = parseFloat(curr); pendingOp = op; justEvaluated = true; }
  function ccompute() {
    if (pendingOp === null || prevVal === null) return;
    var c = parseFloat(curr), result;
    switch (pendingOp) {
      case "+": result = prevVal + c; break;
      case "-": result = prevVal - c; break;
      case "*": result = prevVal * c; break;
      case "/": result = prevVal / c; break;
      case "%": case "mod": result = prevVal % c; break;
      case "^": case "xy": result = Math.pow(prevVal, c); break;
      case "logy": result = Math.log(c) / Math.log(prevVal); break;
      default: result = c;
    }
    curr = cfmt(result);
    pendingOp = null; prevVal = null; justEvaluated = true;
    cupdate();
  }
  function cclear() { curr = "0"; prevVal = null; pendingOp = null; justEvaluated = false; cupdate(); }
  function cback() { curr = curr.length > 1 ? curr.slice(0, -1) : "0"; if (curr === "-") curr = "0"; cupdate(); }
  function ctoRad(x) { return angleMode === "Deg" ? x * Math.PI / 180 : x; }
  function cfromRad(x) { return angleMode === "Deg" ? x * 180 / Math.PI : x; }
  function cunary(fn) { var c = parseFloat(curr); curr = cfmt(fn(c)); justEvaluated = true; cupdate(); }
  function cconst(v) { curr = cfmt(v); justEvaluated = true; cupdate(); }

  var modeDegEl = document.getElementById("modeDeg");
  var modeRadEl = document.getElementById("modeRad");
  if (modeDegEl) modeDegEl.onchange = function () { angleMode = "Deg"; };
  if (modeRadEl) modeRadEl.onchange = function () { angleMode = "Rad"; };

  var calcGrid = document.getElementById("calcGrid");
  function addCalcBtn(label, handler, cls) {
    if (!calcGrid) return;
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = label;
    if (cls) b.classList.add(cls);
    b.onclick = handler;
    calcGrid.appendChild(b);
  }
  addCalcBtn("MC", function () { memory = 0; cupdate(); }, "mem");
  addCalcBtn("MR", function () { curr = cfmt(memory); justEvaluated = true; cupdate(); }, "mem");
  addCalcBtn("MS", function () { memory = parseFloat(curr) || 0; cupdate(); }, "mem");
  addCalcBtn("M+", function () { memory += parseFloat(curr) || 0; cupdate(); }, "mem");
  addCalcBtn("M-", function () { memory -= parseFloat(curr) || 0; cupdate(); }, "mem");
  addCalcBtn("C", cclear, "clr");
  addCalcBtn("sinh", function () { cunary(Math.sinh); });
  addCalcBtn("cosh", function () { cunary(Math.cosh); });
  addCalcBtn("tanh", function () { cunary(Math.tanh); });
  addCalcBtn("sinh&#8315;&#185;", function () { cunary(Math.asinh); });
  addCalcBtn("cosh&#8315;&#185;", function () { cunary(Math.acosh); });
  addCalcBtn("tanh&#8315;&#185;", function () { cunary(Math.atanh); });
  addCalcBtn("sin", function () { cunary(function (x) { return Math.sin(ctoRad(x)); }); });
  addCalcBtn("cos", function () { cunary(function (x) { return Math.cos(ctoRad(x)); }); });
  addCalcBtn("tan", function () { cunary(function (x) { return Math.tan(ctoRad(x)); }); });
  addCalcBtn("sin&#8315;&#185;", function () { cunary(function (x) { return cfromRad(Math.asin(x)); }); });
  addCalcBtn("cos&#8315;&#185;", function () { cunary(function (x) { return cfromRad(Math.acos(x)); }); });
  addCalcBtn("tan&#8315;&#185;", function () { cunary(function (x) { return cfromRad(Math.atan(x)); }); });
  addCalcBtn("log", function () { cunary(Math.log10); });
  addCalcBtn("ln", function () { cunary(Math.log); });
  addCalcBtn("log&#8322;x", function () { cunary(Math.log2); });
  addCalcBtn("log&#7500;x", function () { cop("logy"); }, "op");
  addCalcBtn("&pi;", function () { cconst(Math.PI); });
  addCalcBtn("e", function () { cconst(Math.E); });
  addCalcBtn("x^y", function () { cop("^"); }, "op");
  addCalcBtn("x&#178;", function () { cunary(function (x) { return x * x; }); });
  addCalcBtn("x&#179;", function () { cunary(function (x) { return x * x * x; }); });
  addCalcBtn("&#8730;x", function () { cunary(Math.sqrt); });
  addCalcBtn("&#8731;x", function () { cunary(Math.cbrt); });
  addCalcBtn("1/x", function () { cunary(function (x) { return 1 / x; }); });
  addCalcBtn("e&#7497;", function () { cunary(Math.exp); });
  addCalcBtn("10&#7491;", function () { cunary(function (x) { return Math.pow(10, x); }); });
  addCalcBtn("n!", function () { cunary(function (x) { var n = Math.round(x), r = 1; if (n < 0) return NaN; for (var i = 2; i <= n; i++) r *= i; return r; }); });
  addCalcBtn("|x|", function () { cunary(Math.abs); });
  addCalcBtn("&#8970;x&#8971;", function () { cunary(Math.floor); });
  addCalcBtn("&#8968;x&#8971;", function () { cunary(Math.ceil); });
  ["7", "8", "9"].forEach(function (d) { addCalcBtn(d, function () { cdigit(d); }); });
  addCalcBtn("/", function () { cop("/"); }, "op");
  addCalcBtn("mod", function () { cop("mod"); }, "op");
  addCalcBtn("&#9003;", cback, "op");
  ["4", "5", "6"].forEach(function (d) { addCalcBtn(d, function () { cdigit(d); }); });
  addCalcBtn("*", function () { cop("*"); }, "op");
  addCalcBtn("+/-", function () { cunary(function (x) { return -x; }); }, "op");
  addCalcBtn("%", function () { cop("%"); }, "op");
  ["1", "2", "3"].forEach(function (d) { addCalcBtn(d, function () { cdigit(d); }); });
  addCalcBtn("-", function () { cop("-"); }, "op");
  addCalcBtn("EXP", function () { if (curr !== "Error") { curr += "e"; cupdate(); } }, "op");
  addCalcBtn("=", ccompute, "eq");
  addCalcBtn("0", function () { cdigit("0"); });
  addCalcBtn("00", function () { cdigit("0"); cdigit("0"); });
  addCalcBtn(".", cdot);
  addCalcBtn("CE", function () { curr = "0"; cupdate(); }, "op");
  addCalcBtn("+", function () { cop("+"); }, "op");
  addCalcBtn("=", ccompute, "eq");
  cupdate();

  return {
    loadTest: loadTest,
    openInstructions: openInstructions,
    start: start,
    go: go,
    markReview: markReview,
    saveNext: saveNext,
    markReviewNext: markReviewNext,
    clearResponse: clearResponse,
    openSubmit: openSubmit,
    closeSubmit: closeSubmit,
    finish: finish,
    saveNAT: saveNAT,
    clearNAT: clearNAT,
    showTab: showTab,
    renderAnalysis: renderAnalysis,
    viewStoredResult: viewStoredResult,
    exportPDF: exportPDF,
    exportMD: exportMD,
    exportHTML: exportHTML,
    isRunning: function () { return running; },
    currentAnswers: function () { return answers; },
    currentTimeSpent: function () { return timeSpent; },
    currentMarked: function () { return marked; },
    currentScore: function () { return gradeSnapshot(); },
    gradeSnapshot: gradeSnapshot,
    lastTestId: function () { return _lastTestId; }
  };
})();