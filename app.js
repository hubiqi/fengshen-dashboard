/* 风神考核看板 · 前端（CF Pages / GitHub Pages 双部署 + 账号登录） */
'use strict';

var CF_ORIGIN = 'https://fengshen-dashboard.pages.dev';
var LS_API = 'fs_api', LS_TOKEN = 'fs_token', LS_KEY = 'fs_key', LS_ACCT = 'fs_acct';
var LS_USER = 'fs_user';

/* GitHub Pages 上没有后端，接口走 CF Pages 的边缘网关；其余情况同源 */
function defaultApi() {
  return /github\.io$/i.test(location.hostname) ? CF_ORIGIN : '';
}
var API = localStorage.getItem(LS_API);
if (API === null) API = defaultApi();
var TOKEN = localStorage.getItem(LS_TOKEN) || '';
var APIKEY = localStorage.getItem(LS_KEY) || '';
var USER = localStorage.getItem(LS_USER) || '';
var ACCT = localStorage.getItem(LS_ACCT) || '';

var S = { level: 'agency', quick: 'today', from: '', to: '', key: '', keyName: '' };
var ACC = { active: null, list: [] };
var LOGIN = { sid: null, account: '' };

/* ── 工具 ─────────────────────────────────────────────────────────── */
function dstr(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
function today() { return dstr(new Date()); }
function shift(n) { var d = new Date(); d.setDate(d.getDate() + n); return dstr(d); }
function pct(v, dp) { return v == null ? '—' : (v * 100).toFixed(dp == null ? 2 : dp) + '%'; }
function num(v) { return v == null ? '—' : Number(v).toLocaleString('zh-CN'); }
function scoreCls(s) { return s == null ? '' : (s >= 90 ? 'g' : s >= 60 ? '' : 'r'); }
function $ (id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
function q(s) { return encodeURIComponent(s == null ? '' : s); }

function api(path, opt) {
  opt = opt || {};
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  var url = (API || '').replace(/\/$/, '') + path;
  var h = Object.assign({}, opt.headers || {});
  if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  if (APIKEY) h['X-Api-Key'] = APIKEY;
  opt.headers = h;
  return fetch(url, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401) { logoutLocal(); throw new Error(j.error || '未登录'); }
      if (!r.ok) throw new Error(j.error || j.detail || ('HTTP ' + r.status));
      return j;
    });
  });
}

/* ── 登录 ─────────────────────────────────────────────────────────── */
var MODE = 'login';
function showLogin(needSetup) {
  MODE = needSetup ? 'setup' : 'login';
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('setupTip').hidden = !needSetup;
  $('lgPwd2Wrap').hidden = !needSetup;
  $('lgBtn').textContent = needSetup ? '创建并进入' : '登录';
  $('lgMsg').textContent = '';
  $('apiHint').textContent = '接口：' + (API || location.origin);
}
function logoutLocal() {
  TOKEN = ''; APIKEY = ''; USER = '';
  localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_USER);
}
function enterApp() {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('d1').value = today(); $('d2').value = today();
  $('pFrom').value = today(); $('pTo').value = today();
  loadAccounts().then(function () { loadState(); loadAll(); pollProgress(); })
    .catch(function (e) { $('heroState').textContent = '后端不可用：' + e.message; });
}

$('lgBtn').onclick = function () {
  var u = $('lgUser').value.trim(), p = $('lgPwd').value;
  if (!u || !p) { $('lgMsg').textContent = '请填账号和密码'; return; }
  if (MODE === 'setup') {
    if (p.length < 8) { $('lgMsg').textContent = '密码至少 8 位'; return; }
    if (p !== $('lgPwd2').value) { $('lgMsg').textContent = '两次密码不一致'; return; }
  }
  $('lgMsg').textContent = '处理中…';
  api('/api/auth/' + (MODE === 'setup' ? 'setup' : 'login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  }).then(function (j) {
    TOKEN = j.token; APIKEY = j.apiKey; USER = j.user;
    localStorage.setItem(LS_TOKEN, TOKEN);
    localStorage.setItem(LS_KEY, APIKEY);
    localStorage.setItem(LS_USER, USER);
    $('lgPwd').value = ''; $('lgPwd2').value = '';
    enterApp();
  }).catch(function (e) { $('lgMsg').textContent = '✗ ' + e.message; });
};
$('lgCfg').onclick = function () {
  var v = prompt('接口地址（留空 = 同源）', API);
  if (v === null) return;
  API = v.trim();
  localStorage.setItem(LS_API, API);
  $('apiHint').textContent = '接口：' + (API || location.origin);
};

/* ── 日期区间 ─────────────────────────────────────────────────────── */
function computeRange() {
  if (S.quick === 'today') return [today(), today()];
  if (S.quick === 'yesterday') return [shift(-1), shift(-1)];
  if (S.quick === 'before') return [shift(-2), shift(-2)];
  return [S.from, S.to];
}

/* ── 指标卡 ───────────────────────────────────────────────────────── */
function card(k, v, u, d) {
  return '<div class="card"><div class="k">' + k + '</div><div class="v">' + v +
    (u ? '<span class="u">' + u + '</span>' : '') + '</div>' + (d ? '<div class="d">' + d + '</div>' : '') + '</div>';
}
function renderCards(t) {
  var c = [card('完单量', num(t.orders), '单', '运单总数 ' + num(t.ordersTotal))];
  if (S.level !== 'rider') {
    c.push(card('出勤骑手数', num(t.attendRiders), '人', '有完单的骑手'));
    c.push(card('人效', t.efficiency == null ? '—' : t.efficiency, '单/人', '完单量 ÷ 出勤骑手数'));
  } else {
    c.push(card('完单占比', pct(t.ordersTotal ? t.orders / t.ordersTotal : null), '', '该骑手 / 全部'));
  }
  c.push(card('完全妥投率', pct(t.likt), '', '考核口径'));
  c.push(card('预测T8准时率', pct(t.t8), '', '考核口径'));
  c.push(card('单均复合时长', t.duration == null ? '—' : t.duration, '秒', '复合超时时长 ÷ 有效完单'));
  c.push(card('非时效不满意率', pct(t.dissat, 3), '', '（投诉×5+差评×5+索赔+虚假报备）/接单数'));
  $('cards').innerHTML = c.join('');
}

/* ── 得分（按商圈片）──────────────────────────────────────────────── */
var SB = { districts: [], sel: null };
function fmt1(v) { return v == null ? '—' : Number(v).toFixed(1); }

function renderScoreBoard(j) {
  SB.districts = j.districts || [];
  if (!SB.districts.length) {
    $('sbSummary').innerHTML = '<div class="empty">该月暂无数据（先去 ⚙ 拉取）</div>';
    $('sbTbl').innerHTML = '';
    $('sbChart').innerHTML = '';
    $('sbLegend').innerHTML = '';
    return;
  }
  if (!SB.sel || !SB.districts.some(function (d) { return d.id === SB.sel; })) SB.sel = SB.districts[0].id;

  $('sbSummary').innerHTML = SB.districts.map(function (d) {
    var m = d.month || {}, t = d.today || {};
    return '<div class="sb-card' + (d.id === SB.sel ? ' on' : '') + '" data-id="' + esc(d.id) + '">' +
      '<div class="nm">' + esc(d.name) + '</div>' +
      '<div class="big">' + fmt1(m.bigNet) + '</div>' +
      '<div class="sub2">全月 · ' + d.days + '天</div>' +
      '<div class="sub2">今日 <b>' + (t.dayNet == null ? '—' : fmt1(t.dayNet)) + '</b>' +
      ' · 完单 ' + num(d.todayOrders) + ' · 出勤 ' + num(d.todayAttend) + '</div>' +
      '</div>';
  }).join('');
  Array.prototype.forEach.call($('sbSummary').querySelectorAll('.sb-card'), function (el) {
    el.onclick = function () { SB.sel = el.getAttribute('data-id'); renderScoreBoard(j); };
  });

  // 明细表：每个商圈片一行 —— 全月得分 + 今日得分 + 今日指标
  var h = '<thead><tr><th>商圈片</th><th>全月得分</th><th>全月妥投</th><th>全月准时</th>' +
    '<th>全月不满意</th><th>今日得分</th><th>今日完单</th><th>今日出勤</th>' +
    '<th>今日妥投率</th><th>今日准时率</th><th>今日不满意率</th><th>今日人效</th></tr></thead><tbody>';
  SB.districts.forEach(function (d) {
    var m = d.month || {}, t = d.today || {};
    h += '<tr><td>' + esc(d.name) + '</td>' +
      '<td class="' + scoreCls(m.bigNet) + '"><b>' + fmt1(m.bigNet) + '</b></td>' +
      '<td>' + fmt1(m.likt) + '</td><td>' + fmt1(m.ontime) + '</td><td>' + fmt1(m.dissat) + '</td>' +
      '<td class="' + scoreCls(t.dayNet) + '"><b>' + fmt1(t.dayNet) + '</b></td>' +
      '<td>' + num(d.todayOrders) + '</td><td>' + num(d.todayAttend) + '</td>' +
      '<td>' + pct(t.likt) + '</td><td>' + pct(t.ontime) + '</td><td>' + pct(t.dissat, 3) + '</td>' +
      '<td>' + (t.efficiency == null ? '—' : t.efficiency) + '</td></tr>';
  });
  $('sbTbl').innerHTML = h + '</tbody>';
  $('scoreHint').textContent = '（今日数据来自运单明细实时聚合；考核明细 T+1 才更新，两者可交叉验证）';
  drawChart();
}

function drawChart() {
  var d = SB.districts.filter(function (x) { return x.id === SB.sel; })[0];
  if (!d || !d.series || !d.series.length) { $('sbChart').innerHTML = ''; $('sbLegend').innerHTML = ''; return; }
  var rows = d.series;
  var W = Math.max(320, rows.length * 42 + 90), H = 190;
  var pad = { l: 34, r: 10, t: 10, b: 24 };
  var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  var SER = [
    { k: 'dayNet', c: '#1f6feb', w: 2.4, dash: '', name: '大网质量得分' },
    { k: 'likt_score', c: '#12855a', w: 1.4, dash: '5 3', name: '妥投得分' },
    { k: 'ontime_score', c: '#b7791f', w: 1.4, dash: '5 3', name: '准时得分' },
    { k: 'dissat_score', c: '#c9362b', w: 1.4, dash: '5 3', name: '不满意得分' },
  ];
  var X = function (i) { return pad.l + (rows.length === 1 ? iw / 2 : iw * i / (rows.length - 1)); };
  var Y = function (v) { return pad.t + ih * (1 - Math.max(0, Math.min(100, v)) / 100); };
  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'];
  [0, 20, 40, 60, 80, 100].forEach(function (g) {
    out.push('<line x1="' + pad.l + '" y1="' + Y(g) + '" x2="' + (W - pad.r) + '" y2="' + Y(g) +
      '" stroke="#eef1f6" stroke-width="1"/>');
    out.push('<text x="' + (pad.l - 4) + '" y="' + (Y(g) + 3) + '" font-size="9" fill="#9aa3af" text-anchor="end">' + g + '</text>');
  });
  rows.forEach(function (r, i) {
    out.push('<text x="' + X(i) + '" y="' + (H - 7) + '" font-size="9" fill="#9aa3af" text-anchor="middle">' +
      r.date.slice(5) + '</text>');
  });
  SER.forEach(function (sr) {
    var pts = [];
    rows.forEach(function (r, i) { if (r[sr.k] != null) pts.push(X(i) + ',' + Y(r[sr.k])); });
    if (pts.length > 1) {
      out.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + sr.c +
        '" stroke-width="' + sr.w + '"' + (sr.dash ? ' stroke-dasharray="' + sr.dash + '"' : '') + '/>');
    }
    rows.forEach(function (r, i) {
      if (r[sr.k] == null) return;
      out.push('<circle cx="' + X(i) + '" cy="' + Y(r[sr.k]) + '" r="' + (sr.dash ? 1.8 : 2.6) +
        '" fill="' + sr.c + '"><title>' + r.date + ' ' + sr.name + ' ' + fmt1(r[sr.k]) + '</title></circle>');
    });
  });
  out.push('</svg>');
  $('sbChart').innerHTML = out.join('');
  $('sbLegend').innerHTML = SER.map(function (sr) {
    return '<span><i style="background:' + sr.c + '"></i>' + sr.name + '</span>';
  }).join('');
}

function loadScore() {
  var r = computeRange();
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  var day = r[0] || today();
  var month = day.slice(0, 7);
  $('sbSummary').innerHTML = '<div class="loading">加载中…</div>';
  api('/api/scoreboard?' + aq + 'month=' + month + '&day=' + day)
    .then(renderScoreBoard)
    .catch(function (e) {
      $('sbSummary').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      $('sbTbl').innerHTML = ''; $('sbChart').innerHTML = '';
    });
}

/* ── 对象列表 ─────────────────────────────────────────────────────── */
function renderList(rows) {
  if (S.level === 'agency') { $('listPanel').hidden = true; return; }
  $('listPanel').hidden = false;
  $('listTitle').textContent = ({ district: '商圈片明细', site: '站点明细', rider: '骑手明细' })[S.level] || '明细';
  if (!rows.length) { $('list').innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }
  $('list').innerHTML = rows.slice(0, 200).map(function (r) {
    return '<div class="item" data-id="' + esc(r.id) + '" data-nm="' + esc(r.name || '') + '">' +
      '<div class="nm"><b>' + esc(r.name || r.id) + '</b><div class="sub">' +
      '完单 ' + num(r.orders) + ' · 人效 ' + (r.efficiency == null ? '—' : r.efficiency) +
      ' · 妥投 ' + pct(r.likt) + ' · 准时 ' + pct(r.t8) + '</div></div>' +
      '<div class="sc">' + num(r.orders) + '</div></div>';
  }).join('');
  Array.prototype.forEach.call($('list').querySelectorAll('.item'), function (el) {
    el.onclick = function () { S.key = el.getAttribute('data-id'); S.keyName = el.getAttribute('data-nm'); loadScore(); };
  });
}

/* ── 实时 ─────────────────────────────────────────────────────────── */
function renderRt(j) {
  var ind = j.indicators || {};
  var pick = ['complete_order_count', 'attend_driver_count', 'online_driver_count',
    'wl_complete_order_rate', 'predict_t8_ontime_rate', 'avg_delivery_time',
    'complain_order_rate', 'bad_rating_order_rate'];
  var h = pick.filter(function (k) { return ind[k]; }).map(function (k) {
    var x = ind[k], v = x.value;
    if (k.indexOf('rate') >= 0) v = (parseFloat(v) * 100).toFixed(2) + '%';
    return '<div class="item"><div class="nm"><b>' + esc(x.name) + '</b>' +
      (x.dayRate != null ? '<div class="sub">环比昨日 ' + (x.dayRate * 100).toFixed(1) + '%</div>' : '') +
      '</div><div class="sc">' + v + '</div></div>';
  }).join('');
  $('rt').innerHTML = h || '<div class="empty">无实时数据</div>';
}

/* ── 账号 ─────────────────────────────────────────────────────────── */
function loadAccounts() {
  return api('/api/accounts').then(function (j) {
    ACC = j;
    var sel = $('acctSel');
    if (!j.list.length) {
      sel.innerHTML = '<option value="">未配置风神账号</option>';
      $('acctState').textContent = '';
    } else {
      sel.innerHTML = j.list.map(function (a) {
        return '<option value="' + esc(a.id) + '"' + (a.id === j.active ? ' selected' : '') + '>' +
          esc(a.accountMask || a.account) + (a.agencyName ? ' · ' + esc(a.agencyName.slice(0, 8)) : '') + '</option>';
      }).join('');
      var act = j.list.filter(function (a) { return a.id === j.active; })[0];
      $('acctState').textContent = act ? (act.status === 'ok' ? '登录态 ✓' : '登录态 ✗') : '';
    }
    if (j.active && ACCT !== j.active) { ACCT = j.active; localStorage.setItem(LS_ACCT, ACCT); }
    renderAcctList();
    return j;
  });
}
function renderAcctList() {
  if (!ACC.list.length) { $('acctList').innerHTML = '<div class="empty">还没有风神账号，下面添加一个</div>'; return; }
  $('acctList').innerHTML = ACC.list.map(function (a) {
    var on = a.id === ACC.active;
    return '<div class="acct-row' + (on ? ' on' : '') + '">' +
      '<div class="nm"><b>' + esc(a.accountMask) + '</b>' +
      '<div class="sub">' + (a.agencyName ? esc(a.agencyName) : '未取到代理商') +
      (a.user ? ' · ' + esc(a.user) : '') + ' · ' +
      (a.status === 'ok' ? '<span class="g">登录态✓</span>' : '<span class="r">未登录</span>') + '</div></div>' +
      '<button class="mini" data-act="use" data-id="' + esc(a.id) + '">' + (on ? '当前' : '切换') + '</button>' +
      '<button class="mini" data-act="login" data-id="' + esc(a.id) + '">登录</button>' +
      '<button class="mini danger" data-act="del" data-id="' + esc(a.id) + '">删</button>' +
      '</div>';
  }).join('');
  Array.prototype.forEach.call($('acctList').querySelectorAll('button'), function (b) {
    b.onclick = function () {
      var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'use') {
        api('/api/accounts/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function () { ACCT = id; localStorage.setItem(LS_ACCT, id); return loadAccounts(); })
          .then(function () { S.key = ''; loadAll(); });
      } else if (act === 'login') {
        var a = ACC.list.filter(function (x) { return x.id === id; })[0];
        doLogin(a.account, null);
      } else if (act === 'del') {
        if (!confirm('删除该风神账号？')) return;
        api('/api/accounts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function () { return loadAccounts(); }).then(function () { loadAll(); });
      }
    };
  });
}

function doLogin(account, password) {
  if (!TOKEN || $('appView').hidden) { showLogin(false); return; }
  $('cfgStatus').textContent = '正在启动无头浏览器登录 ' + account + ' …（约 20-40 秒）';
  api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: account, password: password }) })
    .then(function (j) {
      if (j.status === 'captcha') {
        // ★ 验证码只可能在「已登录看板 + 添加风神账号」时出现
        if (!TOKEN || document.getElementById('appView').hidden) {
          $('cfgStatus').textContent = '✗ 需要先登录看板';
          return;
        }
        LOGIN.sid = j.sid; LOGIN.account = account;
        // 只用内嵌 base64（图片 URL 需要额外放行，不安全）
        var mime = j.captchaMime || 'image/png';
        $('capImg').src = 'data:' + mime + ';base64,' + j.captcha;
        $('capMsg').textContent = j.tip || '';
        $('capModal').hidden = false;
        $('cfgStatus').textContent = '需要图形验证码';
        return;
      }
      if (j.status === 'ok') {
        $('cfgStatus').textContent = '✓ 登录成功 · ' + (j.agencyName || '') + ' · ' + (j.user || '');
        return loadAccounts().then(function () { loadAll(); });
      }
      $('cfgStatus').textContent = '✗ ' + (j.error || '登录失败');
    })
    .catch(function (e) { $('cfgStatus').textContent = '✗ ' + e.message; });
}

/* ── 主流程 ───────────────────────────────────────────────────────── */
function loadAll() {
  var r = computeRange();
  S.from = r[0]; S.to = r[1];
  $('rangeText').textContent = r[0] === r[1] ? r[0] : (r[0] + ' ~ ' + r[1]);
  $('heroSub').textContent = '数据区间 ' + (r[0] === r[1] ? r[0] : r[0] + ' ~ ' + r[1]) +
    ' · ' + ({ agency: '整商', district: '商圈片（UB考核单位）', site: '站点', rider: '骑手' })[S.level];
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('cards').innerHTML = '<div class="loading">加载中…</div>';
  api('/api/metrics?' + aq + 'level=' + S.level + '&from=' + r[0] + '&to=' + r[1])
    .then(function (j) { renderCards(j.total); renderList(j.rows || []); })
    .catch(function (e) { $('cards').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  loadScore();
  loadRt();
}

function loadScore() {
  var r = computeRange();
  var key = (S.level === 'agency') ? '' : S.key;
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('dailyTbl').innerHTML = '<tr><td class="loading">加载中…</td></tr>';
  api('/api/score?' + aq + 'level=' + S.level + '&key=' + q(key) + '&from=' + r[0] + '&to=' + r[1])
    .then(function (j) {
      renderScore(j);
      $('scorePanel').querySelector('h2').innerHTML = '考核得分 <span class="hint">' +
        (key ? (esc(S.keyName) + ' · ') : '') + '9月原UB商圈片口径</span>';
    })
    .catch(function (e) { $('dailyTbl').innerHTML = '<tr><td class="empty">' + esc(e.message) + '</td></tr>'; });
}

function loadRt() {
  var aq = ACCT ? '?acct=' + q(ACCT) : '';
  api('/api/realtime' + aq).then(function (j) {
    if (j.ok && j.indicators) { $('rtPanel').hidden = false; renderRt(j); }
  }).catch(function () { $('rtPanel').hidden = true; });
}

function loadState() {
  var aq = ACCT ? '?acct=' + q(ACCT) : '';
  api('/api/status' + aq).then(function (j) {
    var have = j.cachedDates || [];
    var st = [];
    st.push(j.hasCookie ? '登录态 ✓' : '登录态 ✗（去 ⚙ 登录）');
    st.push('已缓存 ' + have.length + ' 天' + (have.length ? '（最新 ' + have[have.length - 1] + '）' : ''));
    if ((j.pulling || []).length) st.push('正在拉取 ' + j.pulling.length + ' 天');
    $('heroState').textContent = st.join(' · ');
    if (!$('pFrom').value) { $('pFrom').value = have[0] || today(); $('pTo').value = today(); }
    return j;
  }).catch(function (e) { $('heroState').textContent = '后端不可用：' + e.message; });
}

function pollProgress() {
  api('/api/progress').then(function (j) {
    var p = j.progress || {};
    if (p.running) {
      $('progText').textContent = '拉取中：' + (p.current || '') + ' ' +
        (p.currentRows || 0) + '/' + (p.currentTotal || '?') + ' 条';
      $('btnPull2').disabled = true;
    } else {
      $('btnPull2').disabled = false;
      if (p.result) {
        var r = p.result;
        $('progText').textContent = '上次拉取：新 ' + ((r.pulled || []).length) + ' 天 / 跳过 ' +
          ((r.skipped || []).length) + ' 天' + ((r.errors || []).length ? ' / 有错误' : '');
        loadState(); loadAll();
        p.result = null;
      }
    }
    if ((j.pulling || []).length) setTimeout(pollProgress, 5000);
  }).catch(function () {});
}

function startPull(f, t) {
  var fc = !!($('forcePull') && $('forcePull').checked);
  $('progText').textContent = '已提交拉取任务 ' + f + ' ~ ' + t + (fc ? '（覆盖模式）' : '（跳过已完整拉取的日期）') + ' …';
  api('/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: f, to: t, acct: ACCT, force: !!($('forcePull') && $('forcePull').checked) }) })
    .then(function (j) {
      if (!j.ok && j.error) { $('progText').textContent = '✗ ' + j.error; return; }
      pollProgress();
    })
    .catch(function (e) { $('progText').textContent = '✗ ' + e.message; });
}

/* ── 事件 ─────────────────────────────────────────────────────────── */
$('lvlTabs').onclick = function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
  b.classList.add('on');
  S.level = b.getAttribute('data-lvl'); S.key = ''; S.keyName = ''; loadAll();
};
$('quick').onclick = function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
  b.classList.add('on');
  S.quick = b.getAttribute('data-q');
  $('dates').hidden = (S.quick !== 'custom' && S.quick !== 'range');
  if (S.quick === 'custom') { $('d1').value = $('d1').value || today(); $('d2').hidden = true; }
  else if (S.quick === 'range') { $('d2').hidden = false; }
  if (S.quick === 'custom' || S.quick === 'range') {
    if (!$('d1').value) { $('d1').value = today(); $('d2').value = today(); }
    return;
  }
  S.key = ''; loadAll();
};
$('btnApply').onclick = function () {
  S.from = $('d1').value; S.to = (S.quick === 'custom') ? $('d1').value : $('d2').value;
  if (S.from > S.to) { var t = S.from; S.from = S.to; S.to = t; }
  S.key = ''; loadAll();
};
$('acctSel').onchange = function () {
  ACCT = this.value;
  localStorage.setItem(LS_ACCT, ACCT);
  api('/api/accounts/active', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ACCT }) })
    .then(function () { S.key = ''; loadState(); loadAll(); loadAccounts(); });
};
$('btnCfg').onclick = function () {
  $('cfgApi').value = API;
  $('cfgModal').hidden = false;
  loadAccounts(); loadState();
};
$('btnClose').onclick = function () { $('cfgModal').hidden = true; };
$('btnAdd').onclick = function () {
  var a = $('newAcc').value.trim(), p = $('newPwd').value;
  if (!a || !p) { $('cfgStatus').textContent = '请填手机号和密码'; return; }
  $('cfgStatus').textContent = '创建账号…';
  api('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: a, password: p }) })
    .then(function () { $('newPwd').value = ''; return loadAccounts(); })
    .then(function () { doLogin(a, p); });
};
$('cfgSave').onclick = function () {
  API = $('cfgApi').value.trim();
  localStorage.setItem(LS_API, API);
  $('cfgStatus').textContent = '已保存';
  loadAccounts().then(loadState);
};
$('btnPw').onclick = function () {
  var n = $('pwNew').value;
  if (n.length < 8) { $('cfgStatus').textContent = '新密码至少 8 位'; return; }
  var old = prompt('请输入当前密码');
  if (old === null) return;
  api('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: old, newPassword: n }) })
    .then(function () { $('cfgStatus').textContent = '✓ 密码已修改'; $('pwNew').value = ''; })
    .catch(function (e) { $('cfgStatus').textContent = '✗ ' + e.message; });
};
$('btnLogout').onclick = function () {
  api('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .catch(function () {}).then(function () { logoutLocal(); showLogin(false); });
};
$('btnPull2').onclick = function () { startPull($('pFrom').value || today(), $('pTo').value || today()); };
$('btnPull').onclick = function () { var r = computeRange(); startPull(r[0], r[1]); };

$('capOk').onclick = function () {
  var code = $('capCode').value.trim();
  if (!code) return;
  $('capMsg').textContent = '提交中…';
  api('/api/login/captcha', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid: LOGIN.sid, code: code, account: LOGIN.account }) })
    .then(function (j) {
      if (j.status === 'ok') {
        $('capModal').hidden = true; $('capCode').value = '';
        $('cfgStatus').textContent = '✓ 登录成功 · ' + (j.agencyName || '');
        return loadAccounts().then(function () { loadAll(); });
      }
      if (j.status === 'captcha') {
        $('capImg').src = 'data:' + (j.captchaMime || 'image/png') + ';base64,' + j.captcha;
        $('capMsg').textContent = '验证码不对，换一个再试';
        return;
      }
      $('capMsg').textContent = '✗ ' + (j.error || '失败');
    })
    .catch(function (e) { $('capMsg').textContent = '✗ ' + e.message; });
};
$('capCancel').onclick = function () {
  $('capModal').hidden = true;
  if (LOGIN.sid) api('/api/login/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid: LOGIN.sid }) });
};

/* ── 启动 ─────────────────────────────────────────────────────────── */
(function init() {
  var p = new URLSearchParams(location.search);
  if (p.get('api') !== null) { API = p.get('api'); localStorage.setItem(LS_API, API); }
  if (p.get('from')) {
    S.quick = (p.get('to') && p.get('to') !== p.get('from')) ? 'range' : 'custom';
    S.from = p.get('from'); S.to = p.get('to') || p.get('from');
  }
  api('/api/auth/state').then(function (j) {
    if (j.needSetup) return showLogin(true);
    if (!j.user) return showLogin(false);
    if (TOKEN && APIKEY) return enterApp();
    showLogin(false);
  }).catch(function (e) {
    showLogin(false);
    $('lgMsg').textContent = '无法连接接口：' + e.message;
  });
})();
