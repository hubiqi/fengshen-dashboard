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
  loadAccounts().then(function () { loadState(); loadAll(); requestRefresh(); })
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
  var mi = t.mealImpact || {};
  var t8d = '考核口径', dud = '复合超时时长 ÷ 有效完单';
  if (mi.orders) {
    var sh = (mi.share == null ? '—' : mi.share + '%');
    t8d += ' · 卡餐 ' + num(mi.delivered) + '单(' + sh + ')';
    if (mi.t8_delta_pct) t8d += '，若剔除 ' + (mi.t8_delta_pct > 0 ? '+' : '') + mi.t8_delta_pct + '%';
    dud += ' · 卡餐 ' + num(mi.delivered) + '单(' + sh + ')';
    if (mi.duration_delta_pct) dud += '，若剔除 ' + (mi.duration_delta_pct > 0 ? '+' : '') + mi.duration_delta_pct + '%';
  }
  var c = [card('完单量', num(t.orders), '单', '运单总数 ' + num(t.ordersTotal))];
  if (S.level !== 'rider') {
    c.push(card('出勤骑手数', num(t.attendRiders), '人', '有完单的骑手'));
    c.push(card('人效', t.efficiency == null ? '—' : t.efficiency, '单/人', '完单量 ÷ 出勤骑手数'));
  } else {
    c.push(card('完单占比', pct(t.ordersTotal ? t.orders / t.ordersTotal : null), '', '该骑手 / 全部'));
  }
  c.push(card('完全妥投率', pct(t.likt), '', '考核口径'));
  c.push(card('预测T8准时率', pct(t.t8), '', t8d));
  c.push(card('单均复合时长', t.duration == null ? '—' : t.duration, '秒', dud));
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
    $('sbChart').innerHTML = ''; $('sbLegend').innerHTML = '';
    $('scoreHint').textContent = '';
    return;
  }
  if (!SB.sel || !SB.districts.some(function (d) { return d.id === SB.sel; })) SB.sel = SB.districts[0].id;

  var M4 = ['likt', 'ontime', 'dissat', 'dur'];
  function pctOrNum(k, v) {
    if (v == null) return '—';
    return (k === 'dur') ? (Number(v).toFixed(2)) : (v * 100).toFixed(k === 'dissat' ? 3 : 2) + '%';
  }
  function block(title, obj) {
    if (!obj) return '<div class="sb-sec">' + title + '</div><div class="sb-none">暂无数据</div>';
    var h = '<div class="sb-sec">' + title + '</div><div class="sb-grid">';
    M4.forEach(function (k) {
      var m = (obj.metrics || {})[k] || {};
      h += '<div class="sb-cell"><div class="k">' + esc(m.label || k) + '</div>' +
        '<div class="row2"><span class="val">' + pctOrNum(k, m.value) + '</span>' +
        '<span class="sc ' + scoreCls(m.score) + '">' + (m.score == null ? '—' : Number(m.score).toFixed(1)) + '</span></div></div>';
    });
    return h + '</div>';
  }

  $('sbSummary').innerHTML = SB.districts.map(function (d) {
    var m = d.month || {}, t = d.today;
    return '<div class="sb-card' + (d.id === SB.sel ? ' on' : '') + '" data-id="' + esc(d.id) + '">' +
      '<div class="sb-name">' + esc(d.name) + ' <span class="badge">' + d.days + '天</span></div>' +
      '<div class="sb-head">' +
        '<div class="sb-h"><div class="k">今日得分 <span class="wtag">未判责·仅供参考</span></div>' +
        '<div class="v ' + scoreCls(t && t.dayNet) + '">' +
          ((t && t.dayNet != null) ? Number(t.dayNet).toFixed(1) : '—') + '</div>' +
          '<div class="k2">' + (t ? ('完单 ' + num(t.orders) + ' · 出勤 ' + num(t.attend) +
            ' · 人效 ' + (t.efficiency == null ? '—' : t.efficiency)) : '当日无数据') + '</div></div>' +
        '<div class="sb-h"><div class="k">全月得分</div><div class="v ' + scoreCls(m.bigNet) + '">' +
          (m.bigNet != null ? Number(m.bigNet).toFixed(1) : '—') + '</div>' +
          '<div class="k2">' + (j.from + ' ~ ' + j.to) + '</div></div>' +
      '</div>' +
      block('今日（' + (t ? t.date.slice(5) : '—') + '）', t) +
      block('全月', m) +
      '</div>';
  }).join('');
  Array.prototype.forEach.call($('sbSummary').querySelectorAll('.sb-card'), function (el) {
    el.onclick = function () { SB.sel = el.getAttribute('data-id'); renderScoreBoard(j); };
  });

  $('scoreHint').textContent = '（本表恒为整月，不受顶部日期区间影响；今日数据来自运单分页，全月来自 T-1 考核明细）';
  drawChart();
}

function loadCompare() {
  api('/api/compare' + (ACCT ? ('?acct=' + q(ACCT)) : '')).then(function (j) {
    var c = j.compare;
    if (!c) { $('cmpBox').hidden = true; return; }
    var rows = Object.keys(c).map(function (k) {
      var n = c[k][0], same = c[k][1], diff = c[k][2];
      var rate = n ? (100 * same / n) : 0;
      return '<tr><td>' + esc((j.labels || {})[k] || k) + '</td><td>' + num(n) + '</td>' +
        '<td class="' + (rate >= 99 ? 'g' : rate >= 90 ? '' : 'r') + '"><b>' + rate.toFixed(1) + '%</b></td>' +
        '<td>' + num(diff) + '</td></tr>';
    }).join('');
    $('cmpBox').hidden = false;
    $('cmpMeta').textContent = j.from + ' ~ ' + j.to + ' · 比对于 ' + (j.at || '').replace('T', ' ');
    $('cmpTbl').innerHTML = '<thead><tr><th>字段</th><th>可比对</th><th>一致率</th><th>不一致</th></tr></thead><tbody>' + rows + '</tbody>';
  }).catch(function () { $('cmpBox').hidden = true; });
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
    .then(loadCompare)
    .catch(function (e) {
      $('sbSummary').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
      $('sbChart').innerHTML = '';
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

/* 旧版 loadScore 已移除（会覆盖新版并因 dailyTbl 不存在而抛错） */

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

/* ── 今日数据同步：进度条 + 明细 + 百分比 ──────────────────────────── */
var _syncPoll = null, _wasRunning = false;

function fmtDur(s) {
  s = Math.max(0, Math.round(s || 0));
  if (s < 60) return s + ' 秒';
  var m = Math.floor(s / 60);
  return m + ' 分 ' + (s % 60) + ' 秒';
}

function renderSync(p) {
  var bar = $('syncBar'); if (!bar) return;
  p = p || {};
  var running = !!p.running;
  if (!running && !p.finished && !p.error) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.classList.toggle('on', running);
  bar.classList.toggle('done', !running && !p.error && (p.percent >= 100 || p.finished));
  bar.classList.toggle('err', !running && !!p.error);

  var pct = Number(p.percent || 0);
  if (!running && !p.error) pct = 100;
  $('sbPct').textContent = (p.error && !running ? '失败' : Math.max(0, Math.min(100, pct)).toFixed(0) + '%');
  $('sbFill').style.width = Math.max(0, Math.min(100, pct)) + '%';

  var stage = p.stage || (running ? '同步中…' : (p.error ? '同步失败' : '已完成'));
  if (!running && !p.error && p.finished) {
    stage = '已是最新 · ' + new Date(p.finished * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  $('sbStage').textContent = stage;

  var b = [];
  if (p.date) b.push(p.date);
  if (p.watermark) b.push('水位 ' + p.watermark);
  if (p.pages) b.push('页 ' + (p.page || 0) + '/' + p.pages);
  if (p.total) b.push('接口 ' + p.total + ' 单');
  if (p.scanned) b.push('已扫 ' + p.scanned);
  if (p.newRows !== null && p.newRows !== undefined) b.push('入库 ' + p.newRows);
  if (p.elapsed) b.push('用时 ' + fmtDur(p.elapsed));
  if (running && p.eta) b.push('约剩 ' + fmtDur(p.eta));
  if (p.error) b.push('⚠ ' + p.error);
  $('sbMeta').textContent = b.join(' · ');
}

function syncTick() {
  if (_syncPoll) { clearTimeout(_syncPoll); _syncPoll = null; }
  api('/api/progress').then(function (j) {
    var p = (j && j.progress) || {};
    renderSync(p);
    if (p.running) {
      _wasRunning = true;
      _syncPoll = setTimeout(syncTick, 1200);
    } else {
      if (_wasRunning) { _wasRunning = false; loadAll(); loadState(); }
      _syncPoll = setTimeout(syncTick, 20000);
    }
  }).catch(function () {
    _syncPoll = setTimeout(syncTick, 15000);
  });
}

/* 保留旧名字，拉取页面的按钮还在用 */
function pollProgress() { syncTick(); }

function requestRefresh(force) {
  api('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acct: ACCT, force: !!force, minGap: 40 }) })
    .then(function (j) {
      if (j && j.progress) renderSync(j.progress);
      syncTick();
    })
    .catch(function () { syncTick(); });
}

if ($('sbNow')) {
  $('sbNow').onclick = function () {
    this.disabled = true;
    var self = this;
    requestRefresh(true);
    setTimeout(function () { self.disabled = false; }, 3000);
  };
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
