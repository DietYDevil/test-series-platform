// ============================================================
// Chat - student support widget (bottom-right) + admin Inbox
// Requires sql/migration_support_chat.sql to be run in Supabase.
// ============================================================
window.Chat = (function () {
  var sb = null;
  var myId = null;
  var isAdmin = false;
  var ready = false;
  var open = false;
  var threadUser = null;
  var cache = {};
  var meta = {};
  var channel = null;
  var pollTimer = null;
  var K_STUDENT = 'chat_seen_student';
  var K_ADMIN = 'chat_seen_admin';

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function fmtTime(iso) {
    var d = new Date(iso), n = new Date();
    var hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === n.toDateString()) return hm;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    var s = (p[0] ? p[0][0] : '?') + (p[1] ? p[1][0] : '');
    return s.toUpperCase();
  }

  function adminSeenMap() { return lsGet(K_ADMIN, {}); }
  function sortCache(uid) {
    cache[uid].sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
  }
  function mergeMsg(m) {
    if (!m || !m.thread_user) return;
    if (!cache[m.thread_user]) cache[m.thread_user] = [];
    var arr = cache[m.thread_user];
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === m.id) return; }
    arr.push(m);
    sortCache(m.thread_user);
  }

  function unreadForStudent() {
    var arr = cache[myId] || [];
    var s = lsGet(K_STUDENT, null), n = 0;
    arr.forEach(function (m) {
      if (m.is_admin && (!s || new Date(m.created_at) > new Date(s))) n++;
    });
    return n;
  }
  function unreadForThread(uid) {
    var s = adminSeenMap()[uid], n = 0;
    (cache[uid] || []).forEach(function (m) {
      if (!m.is_admin && (!s || new Date(m.created_at) > new Date(s))) n++;
    });
    return n;
  }
  function unreadForAdmin() {
    var n = 0;
    Object.keys(cache).forEach(function (uid) { n += unreadForThread(uid); });
    return n;
  }

  function setBadge(elm, n) {
    if (!elm) return;
    if (n > 0) { elm.textContent = n > 99 ? '99+' : n; elm.classList.remove('hidden'); }
    else elm.classList.add('hidden');
  }
  function refreshUnread() {
    if (!ready) return;
    setBadge(el('chatFabBadge'), isAdmin ? unreadForAdmin() : unreadForStudent());
    if (isAdmin) setBadge(el('inboxTabBadge'), unreadForAdmin());
  }
  function markSeenStudent() {
    var arr = cache[myId] || [];
    lsSet(K_STUDENT, arr.length ? arr[arr.length - 1].created_at : new Date().toISOString());
    refreshUnread();
  }
  function markSeenAdmin(uid) {
    var arr = cache[uid] || [];
    var map = adminSeenMap();
    map[uid] = arr.length ? arr[arr.length - 1].created_at : new Date().toISOString();
    lsSet(K_ADMIN, map);
    refreshUnread();
  }

  // ---------------- data ----------------
  async function syncThread(uid) {
    if (!sb) return;
    var r = await sb.from('support_messages').select('*').eq('thread_user', uid).order('created_at', { ascending: true });
    if (r.error) return;
    cache[uid] = r.data || [];
    meta[uid] = meta[uid] || {};
    if (threadUser === uid) { isAdmin ? renderInboxChat() : renderPanel(); }
    refreshUnread();
  }

  async function loadAll() {
    if (!sb) return;
    var rows = null;
    try {
      var r = await sb.from('support_messages')
        .select('id,thread_user,sender_id,is_admin,body,created_at,student:profiles!support_messages_thread_user_fkey(name,phone)')
        .order('created_at', { ascending: true });
      if (r.error) throw r.error;
      rows = r.data || [];
    } catch (e) {
      var r2 = await sb.from('support_messages').select('*').order('created_at', { ascending: true });
      rows = r2.data || [];
      try {
        var pr = await sb.from('profiles').select('id,name,phone');
        var pm = {};
        (pr.data || []).forEach(function (p) { pm[p.id] = p; });
        rows.forEach(function (x) { x.student = pm[x.thread_user]; });
      } catch (e2) {}
    }
    cache = {}; meta = {};
    rows.forEach(function (m) {
      var u = m.thread_user;
      if (!cache[u]) cache[u] = [];
      cache[u].push(m);
      if (m.student && !meta[u]) meta[u] = { name: m.student.name, phone: m.student.phone };
    });
    Object.keys(cache).forEach(sortCache);
    refreshUnread();
  }

  // ---------------- realtime + polling ----------------
  function subscribe() {
    try {
      if (channel && sb) { try { sb.removeChannel(channel); } catch (e) {} }
      channel = sb.channel('support-chat-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, function (payload) {
          onInsert(payload.new);
        })
        .subscribe();
    } catch (e) {}
  }
  function onInsert(m) {
    if (!ready || !m) return;
    mergeMsg(m);
    if (!isAdmin && m.thread_user === myId) {
      if (open) { renderPanel(); markSeenStudent(); } else refreshUnread();
    } else if (isAdmin) {
      var inboxShowing = el('admInbox') && !el('admInbox').classList.contains('hidden') && el('admInbox').dataset.built;
      if (inboxShowing) {
        renderInboxList();
        if (threadUser === m.thread_user) {
          renderInboxChat();
          if (!m.is_admin) markSeenAdmin(m.thread_user);
        } else refreshUnread();
      } else refreshUnread();
    }
  }
  function pollTick() {
    if (!ready) return;
    if (isAdmin) {
      var inboxShowing = el('admInbox') && !el('admInbox').classList.contains('hidden') && el('admInbox').dataset.built;
      if (inboxShowing) { loadAll().then(renderInboxList); if (threadUser) renderInboxChat(); }
      else if (threadUser) syncThread(threadUser);
    } else if (open) {
      syncThread(myId).then(function () { if (open) { renderPanel(); markSeenStudent(); } });
    }
  }

  // ---------------- lifecycle ----------------
  function start() {
    try {
      sb = App.getClient();
      myId = App.state.user.id;
      isAdmin = App.state.profile.role === 'admin';
      ready = true;
      open = false; threadUser = null; cache = {}; meta = {};
      setOpen(false);
      subscribe();
      if (isAdmin) loadAll(); else syncThread(myId);
      if (!pollTimer) pollTimer = setInterval(pollTick, 20000);
      setTimeout(refreshUnread, 1500);
    } catch (e) {}
  }
  function teardown() {
    try { if (channel && sb) sb.removeChannel(channel); } catch (e) {}
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    channel = null; sb = null; myId = null; isAdmin = false; ready = false;
    open = false; threadUser = null; cache = {}; meta = {};
    setOpen(false);
    setBadge(el('chatFabBadge'), 0);
    setBadge(el('inboxTabBadge'), 0);
    var f = el('chatFab'); if (f) f.classList.add('hidden');
    var ib = el('admInbox'); if (ib) { ib.innerHTML = ''; delete ib.dataset.built; }
  }
  function onRouteChange(viewId) {
    var fab = el('chatFab'); if (!fab) return;
    var show = !!(ready && App.state.user && viewId !== 'viewTest' && viewId !== 'viewAuth');
    fab.classList.toggle('hidden', !show);
    if (!show && open) setOpen(false);
  }

  // ---------------- floating panel (students) ----------------
  function setOpen(v) {
    open = v;
    var p = el('chatPanel'); if (p) p.classList.toggle('hidden', !v);
  }
  function toggle() {
    if (!ready) return;
    if (isAdmin) { App.adminTab('inbox'); return; }
    if (open) setOpen(false);
    else {
      setOpen(true);
      renderPanel();
      markSeenStudent();
      var inp = el('cpInput');
      if (inp) setTimeout(function () { inp.focus(); }, 80);
    }
  }
  function close() { setOpen(false); }

  function bubbleHtml(m) {
    var mine = m.sender_id === myId;
    return '<div class="bubRow ' + (mine ? 'me' : 'them') + '"><div class="bub">' + esc(m.body) +
      '<span class="bubTime">' + fmtTime(m.created_at) + '</span></div></div>';
  }
  function bubblesHtml(arr) {
    if (!arr.length) return '<div class="chatEmpty">No messages yet.<br>Say hello &#128075;</div>';
    var h = '';
    arr.forEach(function (m) { h += bubbleHtml(m); });
    return h;
  }
  function renderPanel() {
    var box = el('cpMsgs'); if (!box) return;
    box.innerHTML = bubblesHtml(cache[myId] || []);
    box.scrollTop = box.scrollHeight;
  }

  async function deliver(uid, txt) {
    var payload = { thread_user: uid, sender_id: myId, is_admin: isAdmin, body: txt };
    var r = await sb.from('support_messages').insert(payload);
    if (r.error) { App.toast('Could not send: ' + r.error.message); return; }
    await syncThread(uid);
    if (isAdmin) markSeenAdmin(uid); else markSeenStudent();
  }
  async function send() {
    if (!ready || isAdmin || !sb) return;
    var inp = el('cpInput'); if (!inp) return;
    var txt = inp.value.trim(); if (!txt) return;
    inp.value = '';
    await deliver(myId, txt);
    inp.focus();
  }

  // ---------------- admin inbox ----------------
  async function renderInbox() {
    var box = el('admInbox'); if (!box) return;
    if (!box.dataset.built) {
      box.innerHTML =
        '<div class="inboxWrap">' +
          '<div class="inboxListWrap"><div class="inboxListHead">Chats</div><div id="inboxList"></div></div>' +
          '<div class="inboxChat">' +
            '<div class="icEmpty" id="icEmpty"><div class="icEmptyIcon">&#128172;</div>Select a conversation to read and reply.<br>Messages students send from the chat bubble appear here.</div>' +
            '<div class="icPane hidden" id="icPane">' +
              '<div class="icHead"><div class="tAvatar" id="icAvatar"></div><div class="icHeadInfo"><b id="icName"></b><span id="icSub"></span></div></div>' +
              '<div class="msgsArea" id="icMsgs"></div>' +
              '<div class="inputRow"><input type="text" id="icInput" placeholder="Type a message..." maxlength="1000" onkeydown="if(event.key===\'Enter\')Chat.sendCurrent()">' +
              '<button class="btn primary icSendBtn" onclick="Chat.sendCurrent()">Send</button></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      box.dataset.built = '1';
    }
    var prev = threadUser;
    threadUser = null;
    await loadAll();
    renderInboxList();
    if (prev && cache[prev]) openThread(prev);
    else {
      el('icPane').classList.add('hidden');
      el('icEmpty').classList.remove('hidden');
    }
  }

  function threadIdsSorted() {
    return Object.keys(cache).sort(function (a, b) {
      var la = cache[a][cache[a].length - 1], lb = cache[b][cache[b].length - 1];
      return new Date(lb.created_at) - new Date(la.created_at);
    });
  }
  function renderInboxList() {
    var list = el('inboxList'); if (!list) return;
    var ids = threadIdsSorted();
    if (!ids.length) {
      list.innerHTML = '<div class="chatEmpty">No messages yet.<br>Student chats will appear here.</div>';
      refreshUnread();
      return;
    }
    var h = '';
    ids.forEach(function (uid) {
      var arr = cache[uid], last = arr[arr.length - 1];
      var m0 = meta[uid] || {};
      var un = unreadForThread(uid);
      h += '<div class="threadItem' + (uid === threadUser ? ' active' : '') + '" onclick="Chat.openThread(\'' + uid + '\')">' +
        '<div class="tAvatar">' + esc(initials(m0.name)) + '</div>' +
        '<div class="thMid"><div class="thTop"><b>' + esc(m0.name || 'Student') + '</b><span class="thTime">' + fmtTime(last.created_at) + '</span></div>' +
        '<div class="thPrev">' + (last.is_admin ? 'You: ' : '') + esc(String(last.body).slice(0, 46)) + (String(last.body).length > 46 ? '\u2026' : '') + '</div></div>' +
        (un ? '<span class="thUnread">' + un + '</span>' : '') +
        '</div>';
    });
    list.innerHTML = h;
    refreshUnread();
  }
  function openThread(uid) {
    threadUser = uid;
    var m0 = meta[uid] || {};
    el('icEmpty').classList.add('hidden');
    el('icPane').classList.remove('hidden');
    el('icName').textContent = m0.name || 'Student';
    el('icSub').textContent = m0.phone || '';
    el('icAvatar').textContent = initials(m0.name);
    renderInboxChat();
    renderInboxList();
    markSeenAdmin(uid);
    var inp = el('icInput');
    if (inp) setTimeout(function () { inp.focus(); }, 60);
  }
  function renderInboxChat() {
    var box = el('icMsgs'); if (!box || !threadUser) return;
    box.innerHTML = bubblesHtml(cache[threadUser] || []);
    box.scrollTop = box.scrollHeight;
  }
  async function sendCurrent() {
    if (!ready || !isAdmin || !threadUser || !sb) return;
    var inp = el('icInput'); if (!inp) return;
    var txt = inp.value.trim(); if (!txt) return;
    inp.value = '';
    await deliver(threadUser, txt);
    inp.focus();
  }

  return {
    start: start,
    teardown: teardown,
    onRouteChange: onRouteChange,
    toggle: toggle,
    close: close,
    send: send,
    renderInbox: renderInbox,
    openThread: openThread,
    sendCurrent: sendCurrent
  };
})();
