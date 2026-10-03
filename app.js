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
  loadAccounts().then(function () { loadState(); loadAll(); requestRefresh(); loadTodo(); })
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
function card(k, v, u, d, mom, upIsGood) {
  // ★ mom = 环比昨日（罗盘 compareDayRate）。原来卡片只有静态数字，
  //   完全没有上下文 —— 看不出"掉了还是涨了"。数据本来就在罗盘接口里，搬上来零成本。
  // ★ upIsGood：涨是好事还是坏事。准时率涨=好，不满意率/复合时长涨=坏，
  //   同一套红绿会误导，所以按指标区分颜色。
  var m = '';
  if (mom != null && !isNaN(mom)) {
    var up = mom >= 0;
    var good = upIsGood == null ? true : (up ? upIsGood : !upIsGood);
    m = '<div class="mom ' + (good ? 'good' : 'bad') + '">环比 ' +
        (up ? '▲' : '▼') + Math.abs(mom * 100).toFixed(1) + '%</div>';
  }
  return '<div class="card"><div class="k">' + k + '</div><div class="v">' + v +
    (u ? '<span class="u">' + u + '</span>' : '') + '</div>' + m +
    (d ? '<div class="d">' + d + '</div>' : '') + '</div>';
}

// 罗盘环比缓存（/api/realtime 拉一次，按指标名索引）
var MOM = {};
function momOf(name) {
  for (var k in MOM) {
    if (k.indexOf(name) >= 0 && MOM[k] && MOM[k].dayRate != null) return MOM[k].dayRate;
  }
  return null;
}
function renderCards(t) {
  var mi = t.mealImpact || {}, sci = t.secondcallImpact || {};
  var t8d = '考核口径', dud = '复合超时时长 ÷ 有效完单';
  if (mi.orders) {
    var sh = (mi.share == null ? '—' : mi.share + '%');
    t8d += ' · 卡餐 ' + num(mi.delivered) + '单(' + sh + ')';
    if (mi.t8_delta_pct) t8d += '，若剔除 ' + (mi.t8_delta_pct > 0 ? '+' : '') + mi.t8_delta_pct + '%';
    dud += ' · 卡餐 ' + num(mi.delivered) + '单(' + sh + ')';
    if (mi.duration_delta_pct) dud += '，若剔除 ' + (mi.duration_delta_pct > 0 ? '+' : '') + mi.duration_delta_pct + '%';
  }
  // ★ 二呼单：考核口径下【不记复合时长】，准时判定用骑手T（无 8 分钟缓冲）。
  //   标注它的占比与非准时数，便于判断 T0 预估里有多少是二呼贡献的。
  if (sci.orders) {
    var ssh = (sci.share == null ? '—' : sci.share + '%');
    t8d += ' · 二呼 ' + num(sci.delivered) + '单(' + ssh + ')';
    dud += ' · 二呼 ' + num(sci.delivered) + '单(' + ssh + '，不计复合)';
  }
  var c = [card('完单量', num(t.orders), '单', '运单总数 ' + num(t.ordersTotal), momOf('完单'))];
  if (S.level !== 'rider') {
    c.push(card('出勤骑手数', num(t.attendRiders), '人', '有完单的骑手'));
    c.push(card('人效', t.efficiency == null ? '—' : t.efficiency, '单/人', '完单量 ÷ 出勤骑手数'));
  } else {
    c.push(card('完单占比', pct(t.ordersTotal ? t.orders / t.ordersTotal : null), '', '该骑手 / 全部'));
  }
  c.push(card('完全妥投率', pct(t.likt), '', '考核口径', momOf('妥投'), true));
  c.push(card('预测T8准时率', pct(t.t8), '', t8d, momOf('准时'), true));
  // ↓ 这两个涨了是变差，颜色要反过来
  c.push(card('单均复合时长', t.duration == null ? '—' : t.duration, '秒', dud, momOf('复合'), false));
  c.push(card('非时效不满意率', pct(t.dissat, 3), '', '（差评×5+投诉×5+索赔×1）/接单量', momOf('不满意'), false));
  // ★ 标明这排数字是"谁"的 —— 否则点了站点，卡片数字变了却看不出在讲哪个站点。
  //   整商维度不设 S.key，卡片固定是整商汇总（考核按商圈片结算，想看单个请切「商圈片」）。
  var scope = (S.level === 'agency') ? '整商（全部商圈片）'
            : S.key ? (S.keyName || S.key)
            : ({ district: '商圈片（UB考核单位）' })[S.level] || '全部';
  $('cards').innerHTML = '<div class="cardScope">当前对象：<b>' + esc(scope) + '</b></div>' + c.join('');
}

/* ── 得分（按商圈片）──────────────────────────────────────────────── */
var SB = { districts: [], sel: null };
var LIST_ROWS = {};   // 行 id → 行数据（objScore 回写分数时要用）
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
        '<span class="sc ' + scoreCls(m.score) + '">' + (m.score == null ? '—' : Number(m.score).toFixed(2)) + '</span></div></div>';
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
          ((t && t.dayNet != null) ? Number(t.dayNet).toFixed(2) : '—') + '</div>' +
          '<div class="k2">' + (t ? ('完单 ' + num(t.orders) + ' · 出勤 ' + num(t.attend) +
            ' · 人效 ' + (t.efficiency == null ? '—' : t.efficiency)) : '当日无数据') + '</div></div>' +
        '<div class="sb-h"><div class="k">全月得分</div><div class="v ' + scoreCls(m.bigNet) + '">' +
          (m.bigNet != null ? Number(m.bigNet).toFixed(2) : '—') + '</div>' +
          '<div class="k2">' + (j.from + ' ~ ' + j.to) + '</div></div>' +
      '</div>' +
      block('今日（' + (t ? t.date.slice(5) : '—') + '）', t) +
      block('全月', m) +
      '</div>';
  }).join('');
  Array.prototype.forEach.call($('sbSummary').querySelectorAll('.sb-card'), function (el) {
    el.onclick = function () { SB.sel = el.getAttribute('data-id'); renderScoreBoard(j); loadAbn(); };
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

var LVL_NAME = { agency: '整商', district: '商圈片（UB考核单位）', site: '站点', rider: '骑手' };

/* 考核得分现在挂在列表下方（旧的全月得分板已隐藏）。
   保留这个函数名给 loadAll 调用，内部转给 loadObjScore。 */
function loadScore() {
  $('scorePanel').hidden = true;
  loadObjScore();
}

/* ── 点开某一行：在列表下方显示该对象的考核得分 ─────────────────────
   ★ 明细与考核得分合成一个模块：列表在上，得分在下。
     得分直接复用 /api/scoreboard（level/key 与当前一致）。 */
function loadObjScore(el) {
  var box = $('objScore');
  // ★ 得分对象与列表【同一层级】——之前 agency 被降级成 district，
  //   于是点「整商」查出的是商圈片得分，颗粒度被偷换。
  var key = S.key || (el ? el.getAttribute('data-id') : '');
  var name = S.keyName || (el ? el.getAttribute('data-nm') : '');
  var lv = S.level;
  if (!key) { box.hidden = true; return; }
  var r = computeRange();
  var day = r[0] || today();
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  box.hidden = false;
  box.innerHTML = '<div class="loading">正在加载 ' + esc(name || key) + ' 的考核得分…</div>';
  api('/api/scoreboard?' + aq + 'month=' + q(day.slice(0, 7)) + '&day=' + q(day) +
      '&level=' + q(lv) + '&key=' + q(key))
    .then(function (j) {
      var d = (j.districts || [])[0];
      if (!d) { box.innerHTML = '<div class="empty">该对象本月暂无考核数据</div>'; return; }
      box.innerHTML = objScoreHtml(d, j);
      // ★ 分数写回行数据，并只重绘这一行的明细区 —— 分数与数据同处一张卡片，
      //   不必滚到下面的 objScore 面板去对照。
      var row = LIST_ROWS[key];
      if (row) {
        row.bigNet = (d.month || {}).bigNet;
        row.monthBigNet = (d.month || {}).bigNet;
        var el = $('list').querySelector('.item[data-id="' + key + '"] .row3');
        if (el) el.innerHTML = detailGrid(row);
      }
    })
    .catch(function (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

var SB_W = { likt: 0.2, ontime: 0.3, dissat: 0.2, dur: 0.15 };

function objScoreHtml(d, j) {
  var M4 = ['likt', 'ontime', 'dissat', 'dur'];
  function fmt(k, v) {
    if (v == null) return '—';
    return (k === 'dur') ? Number(v).toFixed(2) : (v * 100).toFixed(k === 'dissat' ? 3 : 2) + '%';
  }
  var m = d.month || {}, t = d.today;
  // ★ 分层可信度提示：T0 平台还没出日考核（天气层按 normal 保守兜底），
  //   T-1 及更早若查不到则说明该日数据没拉全。两种都要标出来。
  var est = (j.estimated || []), unl = (j.unlabeled || []);
  var warn = '';
  if (est.length) warn += '<div class="os-warn">⚠ ' + est.map(function(x){return x.slice(5);}).join('、') +
    ' 为当天，平台尚未出场景分层，天气按正常天保守估算</div>';
  if (unl.length) warn += '<div class="os-warn err">⚠ ' + unl.map(function(x){return x.slice(5);}).join('、') +
    ' 缺场景分层（该日数据可能没拉全）</div>';
  function block(title, obj, sub) {
    if (!obj) return '<div class="os-sec">' + title + '</div><div class="os-none">暂无数据</div>';
    var h = '<div class="os-sec">' + title +
      (sub ? ' <span class="hint">' + sub + '</span>' : '') + '</div><div class="os-grid">';
    M4.forEach(function (k) {
      var mm = (obj.metrics || {})[k] || {};
      h += '<div class="os-cell"><div class="k">' + esc(mm.label || k) + '</div>' +
        '<div class="r2"><span class="val">' + fmt(k, mm.value) + '</span>' +
        '<span class="sc ' + scoreCls(mm.score) + '">' +
        // ★ 得分统一【两位小数】——原来子项 toFixed(1)、总分 toFixed(2) 不一致，
        //   子项截断后四项相加对不上总分（用户看着别扭，也无法验算）。
        (mm.score == null ? '—' : Number(mm.score).toFixed(2)) + '</span></div></div>';
    });
    return h + '</div>';
  }
  return '<div class="os-head">' +
      '<div class="os-nm">' + esc(d.name) + ' <span class="badge">' + d.days + '天</span></div>' +
      '<div class="os-tot"><span class="k">全月大网质量得分</span><b class="' + scoreCls(m.bigNet) + '">' +
        (m.bigNet != null ? Number(m.bigNet).toFixed(2) : '—') + '</b></div>' +
    '</div>' +
    block('全月（' + (j.from || '') + ' ~ ' + (j.to || '') + '）', m) +
    // ★ 去掉「今日」那组：它跟顶部指标卡逐字相同，是重复信息，白占一屏。
    //   月度四指标 + 总分才是真正的新信息（考核已判责）。
    //   要看今日就切日期区间到「今天」，顶部指标卡就是它。
    (d.scene ? '<div class="os-warn">场景分层：' + esc(d.scene) + '</div>' : '');
}
/* ── 异常单明细（点标签弹窗看具体运单）── */
var ABN = { counts: null, scope: null };
var ABN_LABEL = {
  undelivered: '未妥投', logi_cancel: '物流责取消', late: '非准时（超时）',
  highpay_miss: '高笔单非准时', bad: '差评', complaint: '投诉', claim: '索赔',
  early: '提前点送达', meal: '卡餐/出餐慢', timeout: '复合超时'
};

function abnScope() {
  if (S.level === 'site' || S.level === 'rider') return { level: S.level, key: S.key };
  if (S.level === 'district') return { level: 'district', key: SB.sel };
  return { level: 'agency', key: '' };
}

function loadAbn() {
  var sc = abnScope();
  var r = computeRange();
  var d1 = r[0] || today(), d2 = r[1] || d1;
  ABN.scope = { level: sc.level, key: sc.key, from: d1, to: d2 };
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('abnWrap').hidden = false;
  $('abnBar').innerHTML = '<span class="hint">加载中…</span>';
  api('/api/orders?' + aq + 'level=' + q(sc.level) + '&key=' + q(sc.key || '') +
      '&from=' + d1 + '&to=' + d2)
    .then(function (j) { ABN.counts = j.counts || {}; renderAbn(); })
    .catch(function () { $('abnWrap').hidden = true; });
}

function renderAbn() {
  var c = ABN.counts || {};
  $('abnBar').innerHTML = Object.keys(ABN_LABEL).map(function (k) {
    var n = c[k] || 0;
    return '<button class="abnchip' + (n ? '' : ' zero') + '" data-f="' + k + '"' +
      (n ? '' : ' disabled') + '>' + ABN_LABEL[k] + ' <b>' + num(n) + '</b></button>';
  }).join('');
  Array.prototype.forEach.call($('abnBar').querySelectorAll('.abnchip'), function (b) {
    b.onclick = function () { openAbn(b.getAttribute('data-f')); };
  });
}

function openAbn(flag) {
  var s = ABN.scope; if (!s) return;
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('abnTitle').textContent = (ABN_LABEL[flag] || flag) + ' · 明细';
  $('abnMeta').textContent = '加载中…';
  $('abnTbl').innerHTML = ''; $('abnMore').textContent = '';
  $('abnModal').hidden = false;
  api('/api/orders?' + aq + 'level=' + q(s.level) + '&key=' + q(s.key || '') +
      '&from=' + s.from + '&to=' + s.to + '&flag=' + q(flag) + '&limit=500')
    .then(function (j) {
      var rows = j.rows || [], tot = (j.counts || {})[flag] || 0;
      $('abnMeta').textContent = j.from + ' ~ ' + j.to + ' · 命中 ' + num(tot) + ' 单';
      if (!rows.length) { $('abnTbl').innerHTML = '<tbody><tr><td>无数据</td></tr></tbody>'; return; }
      var th = '<thead><tr><th>日期</th><th>运单ID</th><th>站点</th><th>骑手</th>' +
        '<th>超时类型</th><th>超时秒</th><th>复合秒</th><th>状态</th></tr></thead>';
      var tb = rows.map(function (r) {
        return '<tr><td>' + esc(String(r.date).slice(5)) + '</td>' +
          '<td class="mono">' + esc(String(r.waybill_id || '')) + '</td>' +
          '<td>' + esc(r.site_name || '') + '</td>' +
          '<td>' + esc(r.rider_name || '') + '</td>' +
          '<td>' + esc(r.overtime_type || '—') + '</td>' +
          '<td>' + (r.overtime_sec == null ? '—' : Number(r.overtime_sec).toFixed(0)) + '</td>' +
          '<td>' + (r.composite_sec == null ? '—' : Number(r.composite_sec).toFixed(0)) + '</td>' +
          '<td>' + (r.is_delivered ? '已妥投' : '未妥投') + '</td></tr>';
      }).join('');
      $('abnTbl').innerHTML = th + '<tbody>' + tb + '</tbody>';
      if (rows.length < tot) $('abnMore').textContent = '共 ' + num(tot) + ' 单，只展示前 ' + rows.length + ' 单';
    })
    .catch(function (e) { $('abnMeta').textContent = '加载失败：' + e.message; });
}

/* ── 对象列表 ─────────────────────────────────────────────────────── */
/* 展开后的详情：核心指标 + 可展开的「考核口径明细」。
   分子/分母这类对账信息单独折一层 —— 常看的是「准时率多少、完单多少」，
   分子分母只在需要核数时才翻出来。全铺开会让展开行高到 300px。 */
function detailGrid(r) {
  var p = r.parts || {}, mi = r.mealImpact || {}, sci = r.secondcallImpact || {};
  var mp = r.monthParts || {};                     // 本月（考核）口径，红色
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function kvR(k, v) { return '<div class="kv red"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function sgn(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v + '%'; }

  // ★ 分数并入卡片：原来分数在独立的 objScore 面板里，与这些数据分属两块、
  //   滚动才能对照。现在直接排在同一张卡片内。
  var W = { likt: 0.20, ontime: 0.30, dissat: 0.20, dur: 0.15 };
  function scoreLine(v, tag, red) {
    if (v == null) return '';
    return '<div class="kv score' + (red ? ' red' : '') + '"><span>' + tag + '</span><b>' +
      Number(v).toFixed(2) + '</b></div>';
  }

  var core = [
    kv('完单量', num(r.orders)), kv('接单量', num(r.ordersTotal)),
    kv('出勤骑手', num(r.attendRiders)), kv('人效', r.efficiency == null ? '—' : r.efficiency),
    kv('物流妥投', pct(r.likt)), kv('考核准时', pct(r.t8)),
    kv('不满意率', pct(r.dissat, 3)),
    kv('单均复合', sec(r.duration)),
    kv('电联率', pct(r.callRate)), kv('IM及时率', pct(r.imRate)),
    kv('卡餐单量', num(mi.orders)),
    kv('卡餐影响·准时', sgn(mi.t8_delta_pct)),
    kv('二呼单量', num(sci.orders)),
    kv('二呼占比', sci.share == null ? '—' : sci.share + '%')
  ];
  // ★ 后端 dur 若哪天忘了截断，这里兜底 —— 否则会显示出 14.99061767005473 这种。
  function sec(v) { return v == null ? '—' : Number(Number(v).toFixed(2)) + ' 秒'; }
  // ★ 本月（考核口径）单独一组，红色标注 —— 与上面的「所选日期」区分开。
  var mon = [
    kvR('本月·完单量', num(mp.orders)),
    kvR('本月·物流妥投', pct(mp.likt)),
    kvR('本月·考核准时', pct(mp.ontime)),
    kvR('本月·不满意率', pct(mp.dissat, 3)),
    kvR('本月·单均复合', sec(mp.dur)),
    kvR('本月·出勤骑手', num(mp.attendRiders)),
    kvR('本月·人效', mp.efficiency == null ? '—' : mp.efficiency)
  ];
  // ★ 只保留【分数】和【分子分母】：其余指标与上面的卡片重复，不再重复展示。
  var deep = [
    scoreLine(r.bigNet, '所选日期·大网得分', false),
    scoreLine(mp.bigNet, '本月·大网得分', true),
    kv('妥投 分子/分母', num(p.likt_n) + ' / ' + num(p.likt_d)),
    kv('准时 分子/分母', num(p.ont_n) + ' / ' + num(p.ont_d)),
    kv('不满意 分子/分母', num(p.dis_n) + ' / ' + num(p.dis_d)),
    kv('复合 合计/完单', num(p.dur_n) + ' / ' + num(p.dur_d)),
    kv('卡餐影响·复合', sgn(mi.duration_delta_pct)),
    kv('二呼·非准时', num(sci.late)),
    kv('二呼·复合合计', num(sci.composite_excl) + '（不计）'),
    kv('二呼影响·复合', sgn(sci.duration_delta_pct))
  ];
  var monHtml = mon.length ? '<div class="deepGrid mon">' + mon.join('') + '</div>' : '';
  return '<details class="deep"><summary>考核口径明细 ▾</summary>' +
    '<div class="deepGrid">' + core.join('') + '</div>' + monHtml +
    '<div class="deepGrid">' + deep.join('') + '</div></details>';
}

function itemHtml(r) {
  return '<div class="item" data-id="' + esc(r.id) + '" data-nm="' + esc(r.name || '') + '">' +
    '<div class="row1">' +
      '<div class="nm"><b>' + esc(r.name || r.id) + '</b></div>' +
      '<div class="sc">' + num(r.orders) + '</div>' +
    '</div>' +
    '<div class="row2">' +
      '<span>人效 <b>' + (r.efficiency == null ? '—' : r.efficiency) + '</b></span>' +
      '<span>妥投 <b>' + pct(r.likt) + '</b></span>' +
      '<span>准时 <b>' + pct(r.t8) + '</b></span>' +
      '<span>不满意 <b>' + pct(r.dissat, 3) + '</b></span>' +
    '</div>' +
    '<div class="row3">' + detailGrid(r) + '</div>' +
  '</div>';
}

function renderList(rows) {
  // ★ 四个颗粒度严格分开：整商=代理商本身(1行)、商圈片=各商圈片、站点、骑手。
  //   原来把 agency 降级成 district 复用商圈片口径，等于凭空造了一个不存在的层级。
  var mlv = S.level;

  // ★ 整商层级【不出列表】：整个代理商就一行，"福州…公司 4,312 | 31.47 | 99.86%…"
  //   信息量等于零，还占掉一屏。改成一行「已选：整商」提示。
  //   整商数据本来就在顶部卡片里，看明细请切到商圈片/站点/骑手。
  if (S.level === 'agency') {
    $('listPanel').hidden = false;
    $('listTitle').firstChild.nodeValue = '整商';
    $('list').innerHTML = '<div class="empty">当前层级：整商（数据见上方指标卡）。' +
      '要看逐个对象，请切到<b>商圈片 / 站点 / 骑手</b>。</div>';
    $('objScore').hidden = true;
    return;
  }

  $('listPanel').hidden = false;
  $('listTitle').firstChild.nodeValue = ({
    district: '商圈片明细', site: '站点明细', rider: '骑手明细'
  })[S.level] || '明细';
  if (!rows.length) { $('list').innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }
  // ★ 行数据存全局：objScore 拿到分数后要写回对应行，卡片内的分数才能显示。
  LIST_ROWS = {};
  $('list').innerHTML = rows.slice(0, 200).map(function (r) {
    LIST_ROWS[r.id] = r;
    // ★ 紧凑行：默认只一行摘要；点开的那个才展开完整指标（master-detail）。
    //   原来每行都铺开 4 个指标 + 大字号单量，4 个站点就占满一屏。
    return itemHtml(r);
  }).join('');
  var items = $('list').querySelectorAll('.item');
  // 手风琴：只展开当前选中的那一个，其他全部收起
  function mark(el) {
    Array.prototype.forEach.call(items, function (x) {
      x.classList.remove('on');
      x.classList.remove('open');
    });
    if (el) { el.classList.add('on'); el.classList.add('open'); }
  }
  Array.prototype.forEach.call(items, function (el) {
    if (el.getAttribute('data-id') === S.key) { el.classList.add('on'); el.classList.add('open'); }
    el.onclick = function () {
      // ★ 四个颗粒度行为完全一致：选中即切 key、卡片跟着走、得分同步刷新。
      //   之前给 agency 开特例（不设 S.key、卡片不刷新），
      //   是为了掩盖"agency 被降级成 district"造成的口径错位。
      S.key = el.getAttribute('data-id'); S.keyName = el.getAttribute('data-nm');
      mark(el);
      // ★ 卡片也要跟着切到该站点：只调 loadScore() 的话，
      //   上面那排数据卡片始终是整段日期的总量，看着像"点了没反应"。
      //   不能用 loadAll() —— 本函数就是在它的 then() 里跑的，会递归。
      loadCards();
      // ★ 点开某一行 → 在列表下方渲染【该对象】的考核得分
      loadObjScore(el);
    };
  });
  // 「考核口径明细」的展开/收起不应触发整行选中（否则每点一下就重新拉数据）
  Array.prototype.forEach.call($('list').querySelectorAll('.deep summary'), function (s) {
    s.addEventListener('click', function (e) { e.stopPropagation(); });
  });
  // ★ 四个颗粒度统一：列表渲完自动选中第一行，并直接带上它的考核得分。
  //   不自动选中的话「点站点/骑手维度」只会看到一句提示语，永远出不来分。
  if (items.length &&
      !Array.prototype.some.call(items, function (x) {
        return x.getAttribute('data-id') === S.key;
      })) {
    var first = items[0];
    S.key = first.getAttribute('data-id');
    S.keyName = first.getAttribute('data-nm');
    mark(first);
    // 首行也要展开 + 刷新卡片，否则自动选中后卡片还是整段总量
    loadCards(); loadObjScore();
  }
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
  loadCards(r[0], r[1], true);
  loadScore();
  loadRt();
}

/* 单独刷新顶部数据卡片。抽出成独立函数，点站点/骑手时只重拉卡片，
   不重跑 loadAll（那会连列表一起重渲、把当前选中态冲掉）。
   withList=false 时不重渲对象列表 —— 点站点时列表内容没变，重复渲会把选中态闪掉。 */
function loadCards(dfrom, dto, withList) {
  var r = computeRange();
  dfrom = dfrom || r[0]; dto = dto || r[1];
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('cards').innerHTML = '<div class="loading">加载中…</div>';
  // ★ 选中站点/骑手后要带上 key，否则卡片永远是整段日期的总量
  //   （之前请求里只有 level，从没传过 key —— 点了站点卡片数字不动）
  var keyq = S.key ? '&key=' + q(S.key) : '';
  // ★ 每个颗粒度严格按自己的层级取数，不再把 agency 降级成 district。
  //   之前这里硬写 'agency'→'district'，导致点「整商」看到的是商圈片数据。
  //   现在 agency 就查 agency（1 家公司），district 查 district（各商圈片），互不串。
  var mlv = S.level;
  return api('/api/metrics?' + aq + 'level=' + mlv + '&from=' + dfrom + '&to=' + dto + keyq)
    .then(function (j) {
      renderCards(j.total);
      if (withList) renderList(j.rows || []);
    })
    .catch(function (e) { $('cards').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

/* 旧版 loadScore 已移除（会覆盖新版并因 dailyTbl 不存在而抛错） */

function loadRt() {
  var aq = ACCT ? '?acct=' + q(ACCT) : '';
  api('/api/realtime' + aq).then(function (j) {
    if (j.ok && j.indicators) {
      // ★ 顺带把环比喂给顶部指标卡（一次请求，两个用途）
      MOM = j.indicators;
      $('rtPanel').hidden = false;
      renderRt(j);
    }
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

/* ══ 待办任务 · 甘特图 ═══════════════════════════════════════════════
   时间轴设计要点（★ 这决定了图怎么画）：
   · 离职审批：有 initiatingAt（发起）和 发起+72h（自动通过）两个端点 → 天然的甘特条
   · 商站任务：平台【只给到期时间 taskExpireTime，没有开始时间】
     → 画成「一段虚线（已开启，来历不明）+ 到期日之前的实心条」
     虚线只是示意，右端实心条才是真的（有终点的量）。
*/
var TODO = { items: [], errors: {}, summary: {}, fetchedAt: 0, loaded: false };

function dstr2(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
function mdd(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate(); }
function hm(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

function durText(h) {
  if (h == null) return '';
  var a = Math.abs(h);
  var s = a >= 48 ? (a / 24).toFixed(0) + ' 天'
        : a >= 1  ? a.toFixed(0) + ' 小时'
        : a * 60 >= 1 ? (a * 60).toFixed(0) + ' 分钟' : '<1 小时';
  return (h < 0 ? '已逾期 ' + s : '剩 ' + s);
}

/* 统一算出每条的 start / end（start 可能为 null = 平台未提供） */
function todoNorm(it) {
  var now = Date.now();
  var end = it.end || null;
  var start = it.start || null;
  var openLeft = false;      // 没有起点 → 画虚线示意段
  if (!start) { start = now; openLeft = true; }   // 虚线段：今天 → 起点未知
  return {
    it: it, start: start, end: end, openLeft: openLeft,
    over: !!(end && end < now),
    left: end == null ? null : (end - now) / 3600000
  };
}

function renderTodo() {
  var box = $('todoChart');
  var items = (TODO.items || []).map(todoNorm);
  var s = TODO.summary || {};
  var errs = Object.keys(TODO.errors || {});

  $('todoStat').innerHTML = ['商站任务', '离职审批', '发薪任务'].map(function (g) {
    var n = s[g] || 0;
    return '<span class="tchip' + (n ? ' on' : ' off') + '">' + g + ' <b>' + n + '</b></span>';
  }).join('') + (errs.length ? '<span class="tchip err" title="' + esc(TODO.errors[errs[0]]) + '">⚠ ' + errs.length + '源失败</span>' : '')
    // ★ 数据是缓存、正在后台刷新时，给个不抢眼的提示（数据本身照常显示）
    + (TODO.stale ? '<span class="tchip stale" title="显示的是缓存数据，后台正在刷新">'
        + '⟳ ' + (TODO.ageSec >= 60 ? Math.floor(TODO.ageSec / 60) + '分钟前' : TODO.ageSec + '秒前')
        + '</span>' : '');

  if (!items.length) {
    box.innerHTML = '<div class="empty">' +
      (errs.length ? ('待办拉取失败：' + esc(Object.values(TODO.errors)[0]))
                   : '暂无待办（任务已全部完成 / 离职已审完）') + '</div>';
    $('todoTip').textContent = '';
    return;
  }

  /* ── 时间轴范围：以【今天】为中心，向左留出足够的已过去时长，向右留足到期 ── */
  var now = Date.now();
  var DAY = 86400000;
  var starts = items.map(function (r) { return r.start; });
  var ends = items.filter(function (r) { return r.end; }).map(function (r) { return r.end; });
  var lo = Math.min.apply(null, starts.concat([now]));
  var hi = Math.max.apply(null, ends.concat([now]));
  // 左右各留 1 天，并向上取整到「天」
  var d0 = new Date(lo); d0.setHours(0, 0, 0, 0); d0 = d0.getTime() - DAY;
  var d1 = new Date(hi); d1.setHours(0, 0, 0, 0); d1 = d1.getTime() + 2 * DAY;
  var total = d1 - d0;
  var X = function (ms) { return ((ms - d0) / total) * 100; };   // 百分比定位

  /* 按天画竖线；★ 标签密度要跟【可见轨道宽度】走，不能只看天数。
     原来条件是 ticks.length > 34，34 天刚好不触发 → 34 个标签全画出来挤成一团。
     每个标签 "9/26" 约 30px 宽，留 24px 间隙 → 按每 110px 一个标签估算，
     再夹到 1~10 个，宁可少标也不要糊成一片。 */
  var ticks = [];
  var t = new Date(d0); t.setHours(0, 0, 0, 0);
  while (t.getTime() <= d1) { ticks.push(t.getTime()); t = new Date(t.getTime() + DAY); }
  var boxEl = $('todoChart');
  var trackPx = Math.max(200, (boxEl ? boxEl.clientWidth : 900) - 300);
  var maxLabels = Math.max(1, Math.min(10, Math.floor(trackPx / 110)));
  var labelEvery = Math.max(1, Math.ceil(ticks.length / maxLabels));

  var h = ['<div class="gantt-wrap">'];
  h.push('<div class="gantt-axis"><div class="g-lab"></div><div class="g-track">' +
    ticks.map(function (ms, i) {
      var isToday = dstr2(ms) === today();
      var show = (i % labelEvery) === 0;
      /* ★ 靠右的刻度：span 是 nowrap + left:3px，文字必然向右伸出容器
         → gantt-wrap 出现几 px 横向溢出。给这类刻度加 .r 让 CSS 改成右对齐。 */
      var edge = X(ms) >= 88 ? ' r' : '';
      return '<div class="g-tick' + (isToday ? ' now' : '') + edge + '" style="left:' + X(ms) + '%">' +
        (show ? '<span>' + mdd(ms) + '</span>' : '') + '</div>';
    }).join('') + '<div class="g-nowline" style="left:' + X(now) + '%"></div></div></div>');

  /* 按 group 分行，行内按结束时间排序（快到期的在前） */
  var groups = ['离职审批', '发薪任务', '商站任务'];
  groups.forEach(function (g) {
    var rows = items.filter(function (r) { return r.it.group === g; });
    if (!rows.length) return;
    rows.sort(function (a, b) { return (a.end || 0) - (b.end || 0); });
    h.push('<div class="g-group"><div class="g-groupname">' + esc(g) + ' <b>' + rows.length + '</b></div>');
    rows.forEach(function (r) {
      var it = r.it;
      var a = X(r.start), b = r.end == null ? a : X(r.end);
      if (b < a) b = a;
      var wid = Math.max(0.6, b - a);
      /* ★ 夹到 [0,100]：平台偶尔返回轴范围之外的时间（open 任务 end=null、
         或极端时间戳），不夹的话条子会溢出轨道 —— 手机版上直接横飞出去。 */
      var ax = Math.max(0, Math.min(100, a));
      var bx = Math.max(0, Math.min(100, b));
      if (bx < ax) bx = ax;
      a = ax; b = bx; wid = Math.max(0.6, b - a);
      var cls = r.over ? 'over' : (r.left != null && r.left <= 12 ? 'soon' : 'ok');
      if (r.openLeft) cls += ' open';
      var meta = [];
      if (r.end) meta.push('到期 ' + mdd(r.end) + ' ' + hm(r.end));
      else meta.push('无期限');
      if (r.left != null) meta.push(durText(r.left));
      h.push('<div class="g-row ' + cls + '" data-url="' + esc(it.url || '') + '"' +
        (it.url ? ' role="link"' : '') + '>' +
        '<div class="g-lab"><div class="g-title" title="' + esc(it.title) + '">' + esc(it.title) + '</div>' +
          '<div class="g-sub">' + esc(it.site || '') + (it.owner ? ' · ' + esc(it.owner) : '') + '</div></div>' +
        '<div class="g-track' + (it.tip ? ' has-tip' : '') + '">' +
        '<div class="g-bar" style="left:' + a + '%;width:' + wid + '%" ' +
          'title="' + esc(it.title + ' · ' + meta.join(' · ')) + '">' +
          (it.priority ? '<span class="g-pri">' + esc(it.priority) + '</span>' : '') + '</div>' +
        (it.tip ? '<div class="g-tip">' + esc(it.tip) + '</div>' : '') + '</div>' +
        '<div class="g-right">' + (r.left != null
          ? '<b class="' + (r.over ? 'over' : (r.left <= 12 ? 'soon' : '')) + '">' + durText(r.left) + '</b>'
          : '<span class="dim">' + esc(it.status || '') + '</span>') + '</div></div>');
    });
    h.push('</div>');
  });
  h.push('</div>');

  var overN = items.filter(function (r) { return r.over; }).length;
  $('todoTip').innerHTML = '数据 ' + (TODO.fetchedAt ? new Date(TODO.fetchedAt).toLocaleString('zh-CN') : '—') +
    ' · 虚线段表示平台未提供开始时间（实心段才是有明确终点的部分）' +
    ' · 离职只列【待审核】状态（已通过/已撤回/已离职不算待办）' +
    (overN ? ' · <b class="over">' + overN + ' 条已逾期</b>' : '');

  box.innerHTML = h.join('');
  Array.prototype.forEach.call(box.querySelectorAll('.g-row[data-url]'), function (el) {
    el.onclick = function () { var u = el.getAttribute('data-url'); if (u) window.open(u, '_blank', 'noopener'); };
  });
}

function loadTodo(force) {
  var aq = ACCT ? '?acct=' + q(ACCT) + (force ? '&force=1' : '') : (force ? '?force=1' : '');
  // ★ 先把上次的结果画出来，别让用户盯着「加载中…」
  //   后端已改成 stale-while-revalidate：命中过期缓存会【立即返回旧的】+ 后台刷，
  //   所以这里正常情况下是毫秒级返回，不会再有 10 秒空窗。
  if (TODO.loaded && TODO.items.length) { TODO.loading = false; renderTodo(); }
  else $('todoStat').textContent = '加载中…';
  api('/api/todo' + aq).then(function (j) {
    TODO.items = j.items || []; TODO.errors = j.errors || {};
    TODO.summary = j.summary || {}; TODO.fetchedAt = j.fetchedAt || 0; TODO.loaded = true;
    TODO.stale = !!j.stale; TODO.ageSec = j.ageSec || 0; TODO.loading = false;
    renderTodo();
  }).catch(function (e) {
    // ★ 已有旧数据时不要清空 —— 后端抖动不该让看板变空
    if (!TODO.items.length) {
      TODO.items = []; TODO.errors = { '接口': e.message };
    }
    TODO.loaded = true; TODO.loading = false;
    renderTodo();
  });
}

$('todoRefresh').onclick = function () { this.textContent = '…'; loadTodo(true); setTimeout(todoRefreshIdle, 1200); };
function todoRefreshIdle() { $('todoRefresh').textContent = '↻'; }
// ★ 待办与罗盘都默认折叠（index.html 里 body 带 hidden）。
//   折叠状态写 localStorage：刷新后保持用户上次的选择，不会每次都被强制弹开。
//   两块共用一个 toggle —— 逻辑一样，别复制两份。
function initFold(btnId, bodyId, lsKey, openTip, closeTip) {
  var btn = $(btnId), body = $(bodyId);
  if (!btn || !body) return;
  btn.onclick = function () {
    var f = body.hidden;
    body.hidden = !f;
    this.textContent = f ? '▾' : '▸';
    this.title = f ? closeTip : openTip;
    try { localStorage.setItem(lsKey, f ? '1' : '0'); } catch (e) {}
  };
  // 恢复上次状态（首次访问无记录 → 保持默认折叠）
  try {
    if (localStorage.getItem(lsKey) === '1') {
      body.hidden = false;
      btn.textContent = '▾';
      btn.title = closeTip;
    }
  } catch (e) {}
}
initFold('todoFold', 'todoBody', 'fs.todoFold', '展开待办', '折叠待办');
initFold('rtFold', 'rtBody', 'fs.rtFold', '展开罗盘', '折叠罗盘');

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
    .then(function () { S.key = ''; loadState(); loadAll(); loadAccounts(); loadTodo(true); });
};
$('btnCfg').onclick = function () {
  $('cfgApi').value = API;
  $('cfgModal').hidden = false;
  loadAccounts(); loadState();
};
$('btnClose').onclick = function () { $('cfgModal').hidden = true; };
$('abnClose').onclick = function () { $('abnModal').hidden = true; };
$('abnModal').onclick = function (e) { if (e.target === this) this.hidden = true; };
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
