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
      if (r.status === 401) {
        // ★ 区分两种 401：
        //   · 看板自己的会话过期（NO_SESSION / BAD_KEY）→ 必须清本地登录态
        //   · 后端探测到【风神账号】登录态失效（needRelogin，如「账户下线」）
        //     → 那是风神那边的问题，跟看板账号无关，登出会把用户白踢出看板。
        if (!j || !j.needRelogin) logoutLocal();
        throw new Error((j && j.error) || '未登录');
      }
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
function gotoLogin() { logoutLocal(); location.reload(); }
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
  // ★ 进入看板就要显示同步条。
  //   原来 syncTick 只在【手动拉取】时才被调用，正常打开页面从不调用 ——
  //   于是 syncBar 一直带着 HTML 里的 hidden，同步条从来没出现过
  //   （用户反馈"看不到同步条"，而拉取后又能看到，才更迷惑）。
  // 顺带把「正在拉取的任务」也拉起来，用户能随时看到并取消。
  syncTick();
  pollPulling();
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
/* 预取得分：用 /api/trend 的 dayNet 序列，顺带填卡片与趋势缓存。
 * /api/scoreboard 只在用户点开某行时才用（那时才需要该对象的完整月得分）。 */
/** 用 trend 缓存把得分填进行内明细（不再单独请求） */
function fillRowScore(key) {
  var row = LIST_ROWS[key];
  if (!row) return;
  row.score = { cur: curScoreFor(), month: monScoreFor() };
  var box = $('list').querySelector('.item[data-id="' + key + '"] .row3');
  if (box) box.innerHTML = detailGrid(row);
}

function prefetchScore(from, to) {
  // ★ from/to 可省略（点某行时只关心【当前对象】的得分，日期沿用当前区间）
  var r0 = computeRange();
  from = from || r0[0]; to = to || r0[1];
  var lv = S.level, key = S.key || '';
  // ★ 缓存只服务于【当前层级 + 当前对象】。切维度/切对象后旧的立刻作废，
  //   否则新维度还没算出来时会拿【上一个层级】的分数顶上，
  //   表现为「还没点明细就显示别的层级的数据」。
  if (CUR_SCORE.scope !== (lv + '|' + key)) {
    CUR_SCORE.cur = null; CUR_SCORE.month = null; CUR_SCORE.scope = '';
    if (TREND && TREND.key !== (lv + '|' + key)) TREND.points = null;
  }
  var ym = from.slice(0, 7);
  var m0 = ym + '-01';
  var m1 = new Date(+ym.slice(0,4), +ym.slice(5,7), 0).toISOString().slice(0,10);
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/trend?' + aq + 'level=' + q(lv) + '&key=' + q(key) + '&from=' + q(m0) + '&to=' + q(to))
    .then(function (j) {
      TREND.points = j.points || [];
      TREND.key = lv + '|' + key;
      CUR_SCORE.cur = j.todayBigNet;
      CUR_SCORE.month = j.monthBigNet;
      CUR_SCORE.scope = lv + '|' + key;
      var hi = $('cards').querySelector('.tcard.hi');
      if (hi) {
        var v = hi.querySelector('.v'), cm = hi.querySelector('.cmp');
        if (v) v.textContent = j.todayBigNet == null ? '—' : Number(j.todayBigNet).toFixed(2);
        if (cm) cm.innerHTML = '<span>全月 ' + (j.monthBigNet == null ? '—' : Number(j.monthBigNet).toFixed(2)) + '</span>';
      }
    }).catch(function () {});
}

/* KPI 奖励 / 订单 / 单均奖励（整商 + 商圈片；站点与骑手层级平台不下发） */
var KPI = {};
function loadKpi(from, to) {
  var lv = S.level;
  if (lv !== 'agency' && lv !== 'district') { KPI = {}; return; }
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/kpi_reward?' + aq + 'level=' + q(lv) + '&key=' + q(S.key || ''))
    .then(function (j) {
      KPI = {};
      (j.items || []).forEach(function (x) {
        KPI[x.level + '|' + x.key] = x;
      });
      renderCards(LAST_TOTAL || {});
    }).catch(function () {});
}

function kpiOf() {
  // 选中具体对象 → 取该对象那一行
  if (S.key) return KPI[S.level + '|' + S.key] || null;
  // 未选中：整商取 agency 行（它的 key 是 agencyId，不能用 'agency|' 精确匹配）
  if (S.level === 'agency') {
    var ks = Object.keys(KPI);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i].indexOf('agency|') === 0) return KPI[ks[i]];
    }
  }
  return null;
}

function renderCards(t) {
  var mi = t.mealImpact || {}, sci = t.secondcallImpact || {};
  var t8d = '考核口径', dud = '复合超时时长 ÷ 有效完单';
  // ★ 只报【超时单数 + 占完单比例】，不再显示"若剔除后指标变动多少"——
  //   那个是推导值，含义绕而且看不出到底有多少单受影响。
  function lateTxt(imp) {
    if (!imp.orders) return '';
    var late = imp.late != null ? imp.late : 0;
    var sh = imp.lateShare != null ? imp.lateShare + '%'
            : (imp.share != null ? imp.share + '%' : '—');
    return '超时 ' + num(late) + '单(' + sh + ')';
  }
  if (mi.orders) {
    t8d += ' · 卡餐' + lateTxt(mi);
    dud += ' · 卡餐' + lateTxt(mi);
  }
  // ★ 二呼单：考核口径下【不记复合时长】，准时判定用骑手T（无 8 分钟缓冲）。
  if (sci.orders) {
    t8d += ' · 二呼' + lateTxt(sci);
    dud += ' · 二呼' + lateTxt(sci) + '（不计复合）';
  }
  // ★★★ 统一在一处显示：所选日期 / 全月 / 环比昨天，三行合一。
  //   数据全部本地运单自算（全月与前一天走同一条 _range_parts 路径，只是区间不同）。
  //   「得分 + 对比 + 环比」原本散在三个地方（明细展开区 / objScore / 罗盘），
  //   现在合并到顶部「当前对象」卡片。
  var mp = t.monthParts || {}, pv = t.prevParts || {};
  // ★★ 环比「今天」时改用【昨天同一时刻】做基准（用户 2026-10-06）。
  //   原因：今天还没过完 —— 10-06 13:07 实测
  //       今天 1,931 vs 昨天全天 6,007 → -67.9%  ← 假的暴跌
  //       今天 1,931 vs 昨天同期 1,809 →  +6.7%  ← 真实
  //   昨天同期数由后端按 finished_at 切到"当前时刻"算出（sameTimeOrders）。
  //   同理，环比的"基准值"显示也要用同期，否则左边显示昨天全天、右边标同期，不一致。
  var pvSame = (pv && pv.sameTime);
  var pvOrders = pv ? (pvSame && pv.sameTimeOrders != null ? pv.sameTimeOrders : pv.orders) : null;
  // monthLabel: 覆盖第二栏的标签文字。默认「全月」，
  //   像完单量这格显示的是【日均】时，写「全月日均」才不会让人误读成月累计。
  function cell(label, cur, month, prev, kind, hint, monthLabel) {
    var f = function (v) {
      if (v == null) return '—';
      if (kind === 'num') return num(v);
      if (kind === 'score') return v == null ? '—' : Number(v).toFixed(2);
      if (kind === 'money') return v == null ? '—' : Number(v).toLocaleString('zh-CN',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (kind === 'int') return v == null ? '—' : num(Math.round(v));
      if (kind === 'sec') return Number(Number(v).toFixed(2)) + 's';
      return pct(v, kind === 'rate3' ? 3 : 2);
    };
    var d = '';
    if (cur != null && prev != null && prev !== 0) {
      var diff, txt, upIsGood;
      if (kind === 'num') {
        diff = (cur - prev) / Math.abs(prev) * 100;
        txt = (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
        upIsGood = label.indexOf('满意') < 0;
      } else if (kind === 'sec') {
        diff = cur - prev;
        txt = (diff > 0 ? '+' : '') + Number(diff.toFixed(2)) + 's';
        upIsGood = false;
      } else {
        diff = (cur - prev) * 100;
        txt = (diff > 0 ? '+' : '') + diff.toFixed(2) + 'pp';
        upIsGood = label.indexOf('满意') < 0;
      }
      var good = diff >= 0 ? upIsGood : !upIsGood;
      d = '<span class="dl ' + (good ? 'good' : 'bad') + '">' + txt + '</span>';
    }
    return '<div class="tcard' + (label.indexOf('大网质量得分') === 0 ? ' hi' : '') +
      '" data-trend="' + esc(label) + '" title="点击查看整月趋势">' +
      '<div class="k">' + esc(label) + '</div>' +
      '<div class="v">' + f(cur) + '</div>' +
      '<div class="cmp"><span>' + (monthLabel || '全月') + ' ' + f(month) + '</span>' + d + '</div>' +
      (hint ? '<div class="d">' + hint + '</div>' : '') +
    '</div>';
  }

  var c = [
    cell('大网质量得分', t.bigNet != null ? t.bigNet : curScoreFor(),
      t.monthBigNet != null ? t.monthBigNet : monScoreFor(), null, 'score'),
    // ★ 全月显示【日均订单】而非月累计（用户 2026-10-06）。
    //   左边是单日 1,692、右边是月累计 29,975 —— 日 vs 月放一起没法比。
    //   环比昨天那栏同理：prevDays 绝大多数是 1，日均=原值，
    //   但若昨天那天无数据（days=0）就不显示，避免除零/误导。
    //   单日区间时 ordersDailyAvg === orders，显示完全不变。
    cell('完单量', t.orders,
      mp.ordersDailyAvg != null ? mp.ordersDailyAvg : mp.orders,
      pvOrders,
      'num', '全月为日均', '全月日均'),
    // ★ 多天区间显示【日均】出勤（累计 ÷ 有数据天数），单日区间等于当天人数。
    //   人效仍用累计出勤做分母，两者等价：总订单/累计出勤 = (订单/天)/(出勤/天)。
    cell('出勤骑手数', t.attendRiders, mp.attendRiders, pv.attendRiders, 'num',
      '按天去重后跨天累加 ÷ 天数', '全月日均'),
    cell('人效', t.efficiency, mp.efficiency, pv.efficiency, 'num', '完单 ÷ 出勤'),
    cell('完全妥投率', t.likt, mp.likt, pv.likt, null, '考核口径'),
    cell('预测T8准时率', t.t8, mp.ontime, pv.ontime, null, t8d),
    cell('单均复合时长', t.duration, mp.dur, pv.dur, 'sec', '有效完单'),
    cell('非时效不满意率', t.dissat, mp.dissat, pv.dissat, 'rate3', '差评×5+投诉×5+索赔×1')
  ];
  // ★ 标明这排数字是"谁"的 —— 否则点了站点，卡片数字变了却看不出在讲哪个站点。
  var scope = (S.level === 'agency') ? '整商（全部商圈片）'
            : S.key ? (S.keyName || S.key)
            : ({ district: '商圈片（UB考核单位）' })[S.level] || '全部';
  // KPI 奖励三行（仅整商/商圈片）
  var kk = kpiOf();
  var kpiCells = '';
  if (kk) {
    function money(v) {
      return v == null ? '—' : Number(v).toLocaleString('zh-CN',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // ★ KPI 是【当月结算口径】的数据，本身就是月的累计值，
    //   所以"所选日期"和"全月"是同一个数（不存在日/月的区别）。
    //   原来 month/prev 都传 null → 三栏永远显示「全月 —」，看起来像没数据。
    kpiCells =
      cell('KPI奖励(元)', kk.reward, kk.reward, null, 'money',
           '考核方案结算 · ' + (S.level === 'agency' ? '整商' : '商圈片')) +
      cell('订单(大网接单)', kk.orders, kk.orders, null, 'int', '单均奖励的分母') +
      cell('单均奖励(元/单)', kk.perOrder, kk.perOrder, null, 'money',
           'KPI奖励 ÷ 订单');
  }
  // ★ 月度指标只统计 T-1 及之前（今日 T0 还在跑，数据不完整）。
  //   必须写明截止日，否则用户看到「全月」数字对不上今天，会以为漏算了。
  var thru = mp && mp.through === 'T-1'
    ? '<span class="wtag">全月截至 T-1（今日未完）</span>' : '';
  // ★ 说明为什么只有「完单量」按同期比：率类指标即使切到昨天同一时刻，
  //   两边也是【不同判责口径】（T0 运单推算 vs T-1 考核定稿），
  //   同期化后反而制造一个"看起来可比、其实不可比"的数。
  //   完单量是纯计数，两边口径一致，同期比才有意义。
  if (pvSame) {
    thru += '<span class="wtag" title="今天还没过完，完单量与昨天同一时刻相比，'
      + '避免把"今天进度落后"误读成"业务变差"">环比已按昨日同期</span>';
  }
  $('cards').innerHTML = '<div class="cardScope">当前对象：<b>' + esc(scope) + '</b>' +
    '<span class="hint">　每格＝所选日期 · 全月 · 环比昨天　· 点卡片看整月趋势</span>' + thru + '</div>' +
    c.join('') + kpiCells;
  // ★ 点任一卡片 → 展开该指标的整月趋势（四层级通用）
  Array.prototype.forEach.call($('cards').querySelectorAll('[data-trend]'), function (el) {
    el.onclick = function () { openTrend(el.getAttribute('data-trend')); };
  });
}

/* ── 得分（按商圈片）──────────────────────────────────────────────── */
var SB = { districts: [], sel: null };
var LIST_ROWS = {};   // 行 id → 行数据（objScore 回写分数时要用）
// ★ 必须带 scope：记录这份得分属于【哪个层级 + 哪个对象】。
//   否则切到商圈片/站点时，该维度得分还没回来，就会拿【整商的缓存】顶上，
//   看起来像"数据出来了"，实际是别的层级的数字（用户反馈「没点明细就显示整商缓存」）。
var CUR_SCORE = { cur: null, month: null, scope: '' };
function scoreScope() { return S.level + '|' + (S.key || ''); }
function curScoreFor() {
  return CUR_SCORE.scope === scoreScope() ? CUR_SCORE.cur : null;
}
function monScoreFor() {
  return CUR_SCORE.scope === scoreScope() ? CUR_SCORE.month : null;
}
var LAST_TOTAL = {};
var SUPPRESS_AUTO = false;  // 保留字段（已无「返回全量」交互）
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
  // ★ 得分已由 prefetchScore（/api/trend，~60ms）负责，不再在这里跑
  //   /api/scoreboard —— 它要逐日按场景算，慢一个数量级，
  //   而且会和 prefetchScore 抢同一格，造成闪烁/来回覆盖。
}

/* ── 点开某一行：在列表下方显示该对象的考核得分 ─────────────────────
   ★ 明细与考核得分合成一个模块：列表在上，得分在下。
     得分直接复用 /api/scoreboard（level/key 与当前一致）。 */
/* 拉某对象的考核得分 → 回写进该行的卡片（分数已并入数据卡片，不再单独渲染面板） */
function loadObjScore(el) {
  var key = S.key || (el ? el.getAttribute('data-id') : '');
  var lv = S.level;
  if (!key) return;
  var r = computeRange();
  var day = r[0] || today();
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/scoreboard?' + aq + 'month=' + q(day.slice(0, 7)) + '&day=' + q(day) +
      '&level=' + q(lv) + '&key=' + q(key))
    .then(function (j) {
      var d = (j.districts || [])[0];
      if (!d) return;
      // ★ 得分有两套值，不能混用：
//     所选日期得分 = d.today.dayNet   （当日四项加权 + 过程项 15）
//     全月得分     = d.month.bigNet  （全月四项加权 + 过程项 15）
//   之前 cur 和 month 都取了 d.month.bigNet → 两格显示同一个数。
var dayS = (d.today || {}).dayNet;
var monS = (d.month || {}).bigNet;
CUR_SCORE.cur = dayS; CUR_SCORE.month = monS;
      // ★ 得分写回行数据并重绘这一行
      var row = LIST_ROWS[key];
      if (row) {
        row.score = { cur: dayS, month: monS };
        var itemEl = $('list').querySelector('.item[data-id="' + key + '"]');
        if (itemEl) {
          var box = itemEl.querySelector('.row3');
          if (box) box.innerHTML = detailGrid(row);
          // ★ 六格里的「得分」也要跟着更新！
          //   只改 row3 的话，.row2 里的得分格永远是渲染时的旧值（多半是 —），
          //   因为得分是异步回来的（objScore），列表早画完了。
          var sc = itemEl.querySelector('.row2 .sc-cell b');
          if (sc) sc.textContent = dayS == null ? '\u2014' : Number(dayS).toFixed(2);
        }
      }
      // ★ 同时【原地更新顶部卡片的「大网质量得分」格】。
      //   得分只来自 /api/scoreboard，/api/metrics 的 total 里没有这个字段，
      //   所以 loadCards 渲染时只能显示「—」，必须等得分回来再补。
      //   用原地改 textContent 而不是 renderCards() 重渲，避免整排卡片闪烁 + 重复请求。
      var hi = $('cards').querySelector('.tcard.hi');
      if (hi) {
        var v = hi.querySelector('.v'), cm = hi.querySelector('.cmp');
        if (v) v.textContent = dayS == null ? '—' : Number(dayS).toFixed(2);
        if (cm) cm.innerHTML = '<span>全月 ' + (monS == null ? '—' : Number(monS).toFixed(2)) + '</span>';
      }
    })
    .catch(function () { /* 得分取不到就只显示数据，不打断 */ });
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

/* ── 对象列表 ─────────────────────────────────────────────────────── *//* ── 数据卡片：所选日期 / 全月 / 环比昨天 三行合一 ────────────────
 * 撤销上一版的「本月红字段独立分组 + 分数内嵌」做法，改为每个指标一格、
 * 格内三行对照：所选日期、全月平均、环比昨天。
 * 全部数据由【本地运单】自算：站点级能算出商圈片（按订单比例加权），
 * 环比一律用所选日期 vs 前一天，不用平台罗盘的现成字段，维度更灵活。
 */
/* 明细展开区：只放【得分】和【分子分母】。
 * 所选日期 / 全月 / 环比 的三行对比已移到顶部「当前对象」卡片，
 * 这里不再重复 —— 同一个数字在两个地方出现，看着就乱。 */
function detailGrid(r) {
  var p = r.parts || {}, sc = r.score || {};
  function kv(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  var g = [];
  if (sc.cur != null || sc.month != null) {
    g.push(kv('得分·所选日期', sc.cur == null ? '—' : Number(sc.cur).toFixed(2)));
    g.push(kv('得分·全月', sc.month == null ? '—' : Number(sc.month).toFixed(2)));
  }
  g.push(kv('妥投 分子/分母', num(p.likt_n) + ' / ' + num(p.likt_d)));
  g.push(kv('准时 分子/分母', num(p.ont_n) + ' / ' + num(p.ont_d)));
  g.push(kv('不满意 分子/分母', num(p.dis_n) + ' / ' + num(p.dis_d)));
  g.push(kv('复合 合计/完单', num(p.dur_n) + ' / ' + num(p.dur_d)));
  return '<div class="deepGrid">' + g.join('') + '</div>';
}

/* 秒值格式化（fv('sec') 不处理 null，这里补一个安全版） */
function secVal(v) {
  return v == null ? '—' : Number(Number(v).toFixed(2)) + 's';
}

function itemHtml(r) {
  // ★ 骑手行：站点与名字【同一行并排】（用户 2026-10-05）。
  //   站点是骑手的归属信息，比名字次要，所以用小字灰色跟在名字后面。
  //   siteCount>1 说明该骑手区间内跨站点，不静默挑一个冒充，显式提示。
  var nm = '<b>' + esc(r.name || r.id) + '</b>' +
    (r.siteName ? '<span class="site">' + esc(r.siteName) +
      (r.siteCount > 1 ? '<i class="multi">多</i>' : '') + '</span>' : '');
  return '<div class="item" data-id="' + esc(r.id) + '" data-nm="' + esc(r.name || '') + '">' +
    '<div class="row1">' +
      '<div class="nm">' + nm + '</div>' +
      '<div class="sc">' + num(r.orders) + '</div>' +
    '</div>' +
    '<div class="row2 g6">' +
      '<span>完单 <b>' + num(r.orders) + '</b></span>' +
      '<span class="sc-cell">得分 <b>' + (r.score && r.score.cur != null
        ? Number(r.score.cur).toFixed(2) : '—') + '</b></span>' +
      '<span>妥投 <b>' + pct(r.likt) + '</b></span>' +
      '<span>准时 <b>' + pct(r.t8) + '</b></span>' +
      '<span>单均复合 <b>' + secVal(r.duration) + '</b></span>' +
      '<span>不满意 <b>' + pct(r.dissat, 3) + '</b></span>' +
    '</div>' +
    '<div class="row3">' + detailGrid(r) + '</div>' +
  '</div>';
}
/* ══ 明细列表：排序 + 骑手分位筛选 ════════════════════════════════
 * 排序对四个层级通用（整商/商圈片/站点/骑手）；
 * 10%/15%/20% 分位筛选按用户需求只对【骑手】开放 —— 站点/商圈片数量本来就少，
 * 再切百分比没有意义。
 */
var SORT_KEYS = [
  { k: 'orders', n: '单量',   good: 1 },
  { k: 'efficiency', n: '人效', good: 1 },
  // ★ 得分放在 score.cur 上，不能用 r.score 直接排（那是对象），
  //   也不能用 score.month —— 排序要和明细显示的是同一个数。
  { k: 'score.cur', n: '得分', good: 1 },
  { k: 't8', n: '准时率',  good: 1 },
  { k: 'likt', n: '妥投率',  good: 1 },
  { k: 'dissat', n: '不满意', good: -1 },
  { k: 'duration', n: '复合',  good: -1 }
];
var LIST_F = { sortKey: 'orders', sortDir: -1, quant: 0.10,   // ★ 默认只看前 10%
              sites: null };   // sites: null = 全选（不过滤），否则为站点名数组
var LAST_ROWS = [];

function applySort(rows) {
  var m = null;
  for (var i = 0; i < SORT_KEYS.length; i++) if (SORT_KEYS[i].k === LIST_F.sortKey) m = SORT_KEYS[i];
  if (!m) return rows;
  var dir = LIST_F.sortDir;
  return rows.slice().sort(function (a, b) {
    // 支持 'score.cur' 这种点号路径（SORT_KEYS 里得分用的是 score.cur）
    var x = a, y = b;
    if (m.k.indexOf('.') > 0) {
      var path = m.k.split('.');
      x = a; y = b;
      for (var pi = 0; pi < path.length; pi++) {
        x = x ? x[path[pi]] : null;
        y = y ? y[path[pi]] : null;
      }
    } else { x = a[m.k]; y = b[m.k]; }
    if (x == null && y == null) return 0;
    if (x == null) return 1;                 // 空值沉底
    if (y == null) return -1;
    return (x - y) * dir;
  });
}

/* 骑手分位：按【当前排序指标】取前 N%（N=0 表示不筛）。
 * 「前」跟随当前排序方向 —— 单量降序 → 完单最多的前 10%；
 * 想看最差的，把方向点成升序即可。 */
/* 站点筛选：LIST_F.sites 为 null 表示全选（不过滤）。
 * 放在【排序与分位之前】—— 否则「只看前 10%」会先在全站骑手里取前 10%，
 * 再过滤站点，结果某站点可能只剩 0 人，看起来像坏了。 */
function applySites(rows) {
  if (S.level !== 'rider' || !LIST_F.sites || !LIST_F.sites.length) return rows;
  return rows.filter(function (r) { return r.siteName && LIST_F.sites.indexOf(r.siteName) >= 0; });
}

function applyQuantile(rows) {
  if (S.level !== 'rider' || !LIST_F.quant) return rows;
  var n = Math.max(1, Math.ceil(rows.length * LIST_F.quant));
  return rows.slice(0, n);
}

function renderListBar(rows) {
  var bar = $('listBar');
  if (!bar) return;
  // ★ 排序与分位筛选【只在骑手模块】提供（用户要求）。
  //   整商/商圈片/站点 数量都很少，按指标排序意义不大，保持默认按单量降序。
  if (S.level !== 'rider') { bar.hidden = true; bar.innerHTML = ''; return; }
  var h = '<div class="lb-row"><span class="lb-lab">排序</span>';
  SORT_KEYS.forEach(function (k) {
    var on = LIST_F.sortKey === k.k;
    h += '<button class="lb' + (on ? ' on' : '') + '" data-sort="' + k.k + '">' + k.n +
      (on ? (LIST_F.sortDir < 0 ? ' ↓' : ' ↑') : '') + '</button>';
  });
  h += '</div>';
  {
    h += '<div class="lb-row"><span class="lb-lab">只看前</span>';
    [0, 0.10, 0.15].forEach(function (p) {
      var on = Math.abs(LIST_F.quant - p) < 1e-9;
      h += '<button class="lb' + (on ? ' on' : '') + '" data-q="' + p + '">' +
        (p ? Math.round(p * 100) + '%' : '全部') + '</button>';
    });
    // ★ 20% 改为【自定义】（用户 2026-10-05）：写任意百分比，1~100。
    //   条件必须同时看 customOpen —— 原来只看 quant 是不是"自定义值"，
    //   而点开输入框时 quant 仍停在 0.10（默认值），于是输入框永远不出现，
    //   点「自定义」毫无反应。
    var isCustomVal = LIST_F.quant !== 0
      && Math.abs(LIST_F.quant - 0.10) > 1e-9
      && Math.abs(LIST_F.quant - 0.15) > 1e-9;
    var custom = (LIST_F.customOpen || isCustomVal)
      ? '<span class="lb-inwrap">' +
        '<input class="lb-in" type="number" inputmode="numeric" min="1" max="100" step="1" ' +
        'value="' + Math.round(LIST_F.quant * 100) + '" data-qin>' +
        '<span class="lb-pct">%</span>' +
        '<button class="lb-ok" data-qok>确定</button>' +
        '<button class="lb-x" data-qclose title="收起">✕</button></span>'
      : '<button class="lb" data-qopen>自定义</button>';
    h += custom;
    h += '<span class="lb-hint">' + (LIST_F.quant
      ? '显示 ' + Math.max(1, Math.ceil(rows.length * LIST_F.quant)) + ' / ' + rows.length + ' 人'
      : '共 ' + rows.length + ' 人') + '</span></div>';
  }
  // ★ 站点筛选：默认全选（sites=null），可单选（点一个）或多选（点多个）。
  var siteNames = [];
  rows.forEach(function (r) { if (r.siteName && siteNames.indexOf(r.siteName) < 0) siteNames.push(r.siteName); });
  if (siteNames.length) {
    var sel = LIST_F.sites;
    var allOn = !sel;
    // ★ 下拉多选（用户 2026-10-05 要求）。
    //   原来是一排按钮，4 个站点还行，10+ 就会把整行撑爆、挤掉排序按钮。
    //   不用原生 <select multiple>：手机上要长按才能多选，实际不可用。
    var selCount = allOn ? siteNames.length : (sel ? sel.length : 0);
    var label = allOn ? '全部 ' + siteNames.length + ' 个站点'
            : (selCount ? '已选 ' + selCount + ' 个' : '未选择');
    h += '<div class="lb-row"><span class="lb-lab">站点</span>' +
      '<div class="msel' + (LIST_F.siteOpen ? ' open' : '') + '">' +
      '<button class="msel-btn" data-sitetoggle>' +
        '<span>' + label + '</span>' +
        '<svg class="msel-ar" viewBox="0 0 12 12" width="10" height="10">' +
          '<path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" ' +
          'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<div class="msel-pop"' + (LIST_F.siteOpen ? '' : ' hidden') + '>' +
      '<label class="msel-all"><input type="checkbox" data-site="__all__"' +
        (allOn ? ' checked' : '') + '><span>全部（' + siteNames.length + '）</span></label>' +
      siteNames.map(function (nm) {
        return '<label class="msel-it"><input type="checkbox" data-site="' + esc(nm) + '"' +
          ((allOn || (sel && sel.indexOf(nm) >= 0)) ? ' checked' : '') +
          '><span>' + esc(nm) + '</span></label>';
      }).join('') +
      '</div></div></div>';
  }
  bar.innerHTML = h;
  bar.hidden = false;
  Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-sort');
      if (LIST_F.sortKey === k) LIST_F.sortDir = -LIST_F.sortDir;   // 再点一次反向
      else { LIST_F.sortKey = k; LIST_F.sortDir = -1; }             // 换指标默认从大到小
      refreshList();
    };
  });
  Array.prototype.forEach.call(bar.querySelectorAll('[data-q]'), function (b) {
    b.onclick = function () {
      LIST_F.quant = parseFloat(b.getAttribute('data-q')) || 0;
      LIST_F.customOpen = false;
      refreshList();
    };
  });
  // 自定义百分比：点「自定义」展开输入框，回车/失焦生效
  var qopen = bar.querySelector('[data-qopen]');
  if (qopen) qopen.onclick = function () {
    LIST_F.customOpen = true;
    refreshList();
    var inp = $('listBar').querySelector('[data-qin]');
    if (inp) { inp.focus(); inp.select(); }
  };
  var qclose = bar.querySelector('[data-qclose]');
  if (qclose) qclose.onclick = function () {
    LIST_F.customOpen = false;
    refreshList();
  };
  var qin = bar.querySelector('[data-qin]');
  if (qin) {
    var applyQin = function () {
      var v = Math.max(1, Math.min(100, Math.round(Number(qin.value) || 0)));
      LIST_F.quant = v / 100;
      LIST_F.customOpen = false;      // 确定后收起
      refreshList();
    };
    // ★ 必须有【确定按钮】（用户 2026-10-05 明确要求）。
    //   原来只靠 blur 生效：手机上点完数字想去点别的，input 先失焦、
    //   renderList 重建工具条 → 正在点的按钮被抽走，点不到，非常难用。
    //   取消 blur 自动生效，改为回车或点「确定」。
    qin.onkeydown = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyQin(); }
    };
    var qok = bar.querySelector('[data-qok]');
    if (qok) qok.onclick = applyQin;
  }
  // ★ 下拉开关：点外面关闭，点内部不关
  var msel = bar.querySelector('.msel');
  if (msel) {
    var tg = msel.querySelector('[data-sitetoggle]');
    if (tg) tg.onclick = function (e) {
      e.stopPropagation();
      LIST_F.siteOpen = !LIST_F.siteOpen;
      // 只重画工具条，不重算列表 —— 展开/收起不该触发一次取数+渲染
      renderListBar(LAST_ROWS);
    };
  }
  // 站点多选：复选框。下拉保持打开，方便连续勾选。
  Array.prototype.forEach.call(bar.querySelectorAll('input[data-site]'), function (cb) {
    cb.onclick = function (e) { e.stopPropagation(); };
    cb.onchange = function (e) {
      e.stopPropagation();
      var v = cb.getAttribute('data-site');
      if (v === '__all__') {
        // 勾选全部 → 取消勾选 → null(全选)；否则 → 按当前勾选集合
        LIST_F.sites = (LIST_F.sites === null && cb.checked) ? [] : null;
        if (LIST_F.sites === null && !cb.checked) {
          // 点了"全部"想取消全选 → 全不选
          LIST_F.sites = [];
        }
      } else {
        var cur = LIST_F.sites === null
          ? Array.prototype.slice.call(msel.querySelectorAll('input[data-site]'))
              .filter(function (x) { return x.getAttribute('data-site') !== '__all__' && x.checked; })
              .map(function (x) { return x.getAttribute('data-site'); })
          : LIST_F.sites.slice();
        var i = cur.indexOf(v);
        if (cb.checked) { if (i < 0) cur.push(v); }
        else if (i >= 0) cur.splice(i, 1);
        LIST_F.sites = cur;
      }
      refreshListKeepOpen();
    };
  });
  if (msel) {
    msel.onclick = function (e) { e.stopPropagation(); };
    msel.querySelector('.msel-pop').onclick = function (e) { e.stopPropagation(); };
  }
}

/* 排序/筛选只影响列表，不重新请求接口 —— 复用已取到的全量行 */
function refreshList() { renderList(LAST_ROWS.slice()); }

/* ★ 批量拉取骑手得分。
   原来得分只在【点开某一行】时请求（loadObjScore），于是列表里每行的
   「得分」格永远是「—」—— 用户明确指出「明明有数据，明细却没有」。
   现在进入骑手维度时一次取回（后端带 ids 白名单，只算当前列表里出现的那些），
   回来后只改 .row2 的得分格，不整表重绘（避免闪烁与重复请求）。 */
var SCORE_BUSY = false;
function loadRiderScores() {
  if (S.level !== 'rider' || SCORE_BUSY) return;
  var rows = LAST_ROWS || [];
  if (!rows.length) return;
  var ids = rows.slice(0, 200).map(function (r) { return r.id; });
  var missing = ids.filter(function (id) {
    var r = LIST_ROWS[id]; return !(r && r.score && r.score.cur != null); });
  if (!missing.length) return;
  SCORE_BUSY = true;
  var r0 = computeRange();
  var day = r0[0] || today();
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/scoreboard?' + aq + 'month=' + q(day.slice(0, 7)) + '&day=' + q(day) +
      '&level=rider&ids=' + q(missing.join(',')))
    .then(function (j) {
      (j.districts || []).forEach(function (d) {
        var row = LIST_ROWS[d.id];
        if (!row) return;
        row.score = { cur: (d.today || {}).dayNet, month: (d.month || {}).bigNet };
        var cell = $('list').querySelector('.item[data-id="' + d.id + '"] .row2 .sc-cell b');
        if (cell) cell.textContent = row.score.cur == null ? '—' : Number(row.score.cur).toFixed(2);
        var box = $('list').querySelector('.item[data-id="' + d.id + '"] .row3');
        if (box) box.innerHTML = detailGrid(row);
      });
    }).catch(function () {})
    .then(function () { SCORE_BUSY = false; });
}
/* 站点下拉多选专用：勾选后要重画列表，但下拉必须【保持展开】，
 * 否则用户连点两个站点，第二次勾选时下拉已经合上了 —— 没法连续勾。
 * renderList 会走 renderListBar 重建工具条，所以这里把 open 状态清掉再还回去。 */
function refreshListKeepOpen() {
  LIST_F.siteOpen = true;
  renderList(LAST_ROWS.slice());
}
function renderList(rows) {
  // ★ 四个颗粒度严格分开、行为一致：整商=代理商本身(1行)、商圈片、站点、骑手。
  //   原来 agency 被降级成 district，又额外开了「不出列表」特例，
  //   导致点整商看到的是商圈片数据、或干脆什么都不显示。
  var mlv = S.level;

  $('listPanel').hidden = false;
  $('listTitle').firstChild.nodeValue = ({
    district: '商圈片明细', site: '站点明细', rider: '骑手明细'
  })[S.level] || '明细';
  if (!rows.length) { $('list').innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }

  // ★ 排序 + 骑手分位筛选（在渲染前应用，作用于全量行）
  LAST_ROWS = rows;
  renderListBar(rows);
  rows = applySites(rows);
  rows = applySort(rows);
  rows = applyQuantile(rows);
  // ★ 行数据存全局：objScore 拿到分数后要写回对应行，卡片内的分数才能显示。
  LIST_ROWS = {};
  $('list').innerHTML = rows.slice(0, 200).map(function (r) {
    LIST_ROWS[r.id] = r;
    // ★ 紧凑行：默认只一行摘要；点开的那个才展开完整指标（master-detail）。
    //   原来每行都铺开 4 个指标 + 大字号单量，4 个站点就占满一屏。
    return itemHtml(r);
  }).join('');
  loadRiderScores();          // ★ 骑手得分异步补齐（只改得分格，不重绘整表）
  var items = $('list').querySelectorAll('.item');
  // 选中态：只高亮，【不自动展开】。
// ★ 之前恢复选中/自动选中首行时都顺手 add('open')，用户没点就被迫看一屏数据，
//   手机端一个站点就占满整屏（用户反馈「我都没点击怎么默认展开了」）。
//   现在：点哪行展开哪行；其余（含自动选中的首行）一律收起。
function mark(el, expand) {
  Array.prototype.forEach.call(items, function (x) {
    x.classList.remove('on');
    x.classList.remove('open');
  });
  if (el) {
    el.classList.add('on');
    if (expand) el.classList.add('open');
  }
}
  Array.prototype.forEach.call(items, function (el) {
    if (el.getAttribute('data-id') === S.key) el.classList.add('on');
    el.onclick = function () {
      // ★ 四个颗粒度行为完全一致：选中即切 key、卡片跟着走、得分同步刷新。
      //   之前给 agency 开特例（不设 S.key、卡片不刷新），
      //   是为了掩盖"agency 被降级成 district"造成的口径错位。
      S.key = el.getAttribute('data-id'); S.keyName = el.getAttribute('data-nm');
      mark(el, true);
      // ★ 换了对象就清掉上一个的得分，否则新得分还没回来时会短暂显示别人的分。
      CUR_SCORE.cur = null; CUR_SCORE.month = null; CUR_SCORE.scope = '';
      // ★ 卡片也要跟着切到该站点：只调 loadScore() 的话，
      //   上面那排数据卡片始终是整段日期的总量，看着像"点了没反应"。
      //   不能用 loadAll() —— 本函数就是在它的 then() 里跑的，会递归。
      // ★ 只刷新卡片（切到该对象），列表保持【该维度全量】并把该行标色。
      //   列表是横向对比用的，收窄成一行就没法看了 —— 用户也明确要求取消
      //   「点进去只剩一个 + 再点返回」这种绕路交互。
      loadCards(undefined, undefined, false);
      // ★ 得分跟着选中对象走：prefetchScore 会重新拉该对象的当日+月得分。
      //   不调它的话，上一对象的得分会一直留在卡片上（或者干脆是「—」）。
      prefetchScore();
      // ★ 罗盘是【该维度的横向对比清单】，列出这一层全部对象 ——
      //   所以不随选中变化，点某行不用重取它（要变的是卡片和得分）。
      // ★ 点开某一行 → 在列表下方渲染【该对象】的考核得分
      // ★ 得分已由 prefetchScore 填好，这里不再跑 /api/scoreboard（慢）。
      fillRowScore(key);
    };
  });
  // 「考核口径明细」的展开/收起不应触发整行选中（否则每点一下就重新拉数据）
  Array.prototype.forEach.call($('list').querySelectorAll('.deep summary'), function (s) {
    s.addEventListener('click', function (e) { e.stopPropagation(); });
  });
  // ★ 不自动选中首行。
  //   原来会自动选中 → 于是请求带上 key → 后端 rows 按 key 过滤只剩 1 行 →
  //   列表刚渲染出来就只剩一个人，用户既看不到全量、也没法比较。
  //   现在：切维度只看全量列表，卡片显示该层级合计；点某一行才收窄到它。
  //   （之前"切维度看不到卡片"是因为 agency 特例清空了列表，那已单独修好。）

}

/* ══ 卡片趋势图 · 整月逐日变化 ══════════════════════════════════
 * 点任意一张数据卡片 → 展开该指标的整月趋势（SVG 折线，无需外部库）。
 * 四个层级通用（整商/商圈片/站点/骑手），数据来自 /api/trend。
 */
var TREND = { key: null, points: null, metric: null, loading: false };

// 每个卡片指标 → 趋势字段。kind 决定 Y 轴量纲与格式化
var T_METRICS = {
  '大网质量得分': { f: 'dayNet',  label: '每日得分', unit: '' },
  '完单量':      { f: 'orders',  label: '完单量',   unit: '单' },
  '出勤骑手数':  { f: 'attendRiders', label: '出勤人数', unit: '人' },
  '人效':        { f: 'efficiency', label: '人效', unit: '单/人' },
  '完全妥投率':  { f: 'likt',     label: '妥投率',   unit: '', rate: true },
  '预测T8准时率':{ f: 't8',       label: 'T8准时率', unit: '', rate: true },
  '单均复合时长':{ f: 'duration', label: '复合时长', unit: 's' },
  '非时效不满意率':{ f: 'dissat', label: '不满意率', unit: '', rate: true, dp: 3 }
};

function trendBox() {
  var b = $('trendBox');
  if (!b) return null;
  return b;
}

function openTrend(label) {
  var m = T_METRICS[label];
  if (!m) return;
  var box = trendBox();
  if (!box) return;
  var lv = S.level, key = S.key || '';
  var r = computeRange();
  var ym = r[0].slice(0, 7);
  // 整月趋势 = 所选日期所在月的 1 号 ~ 今天
  var to = r[1];
  var last = (r[0] > to ? r[0] : to);
  var d1 = last + ' 23:59:59';
  box.hidden = false;
  TREND.metric = m; TREND.label = label;
  if (!TREND.points || TREND.key !== (lv + '|' + key)) {
    box.innerHTML = '<div class="loading">正在加载 ' + esc(label) + ' 的整月趋势…</div>';
    var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
    api('/api/trend?' + aq + 'level=' + q(lv) + '&key=' + q(key) +
        '&from=' + q(ym + '-01') + '&to=' + q(to))
      .then(function (j) {
        TREND.points = j.points || [];
        TREND.key = lv + '|' + key;
        // ★ 顺带把得分回填到卡片：/api/trend 已经算了「当日得分 + 月得分」，
        //   不必再等 /api/scoreboard —— 那是得分出不来 + 首屏慢的根源。
        if (label === '大网质量得分') {
          CUR_SCORE.cur = j.todayBigNet;
          CUR_SCORE.month = j.monthBigNet;
          var hi = $('cards').querySelector('.tcard.hi');
          if (hi) {
            var v = hi.querySelector('.v'), cm = hi.querySelector('.cmp');
            if (v) v.textContent = j.todayBigNet == null ? '—' : Number(j.todayBigNet).toFixed(2);
            if (cm) cm.innerHTML = '<span>全月 ' + (j.monthBigNet == null ? '—' : Number(j.monthBigNet).toFixed(2)) + '</span>';
          }
          drawTrend(label);
          return;
        }
        drawTrend(label);
      })
      .catch(function (e) { box.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  } else drawTrend(label);
}

function closeTrend() {
  var b = trendBox(); if (b) b.hidden = true;
}

function drawTrend(label) {
  var m = T_METRICS[label];
  var pts = TREND.points || [];
  var box = trendBox();
  if (!pts.length) { box.innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }
  var vals = pts.map(function (p) { return p[m.f]; }).filter(function (v) { return v != null; });
  if (!vals.length) { box.innerHTML = '<div class="empty">该指标暂无数据</div>'; return; }

  var W = Math.max(320, pts.length * 40 + 96), H = 200;
  var pad = { l: 44, r: 12, t: 14, b: 26 };
  var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (m.rate) { lo = Math.max(0, lo - 0.02); hi = Math.min(1, hi + 0.02); }
  else { var sp = (hi - lo) || Math.max(1, hi * 0.1); lo = Math.max(0, lo - sp * 0.2); hi = hi + sp * 0.2; }
  var X = function (i) { return pad.l + (pts.length === 1 ? iw / 2 : iw * i / (pts.length - 1)); };
  var Y = function (v) { return pad.t + ih * (1 - (v - lo) / ((hi - lo) || 1)); };
  function fv(v) {
    if (v == null) return '—';
    if (m.rate) return (v * 100).toFixed(m.dp || 2) + '%';
    if (m.f === 'score') return Number(v).toFixed(2);
    return Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : Number(v).toFixed(2);
  }

  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" class="trendsvg">'];
  // 5 条参考线
  for (var g = 0; g <= 4; g++) {
    var v = lo + (hi - lo) * g / 4, y = Y(v);
    out.push('<line x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y +
      '" stroke="#eef1f6" stroke-width="1"/>');
    out.push('<text x="' + (pad.l - 5) + '" y="' + (y + 3) + '" font-size="9" fill="#9aa3af" text-anchor="end">' +
      fv(v) + '</text>');
  }
  pts.forEach(function (p, i) {
    if (pts.length > 12 && i % Math.ceil(pts.length / 10) !== 0 && i !== pts.length - 1) return;
    out.push('<text x="' + X(i) + '" y="' + (H - 8) + '" font-size="9" fill="#9aa3af" text-anchor="middle">' +
      p.date.slice(5) + '</text>');
  });
  // 折线
  var seg = [], poly = [];
  pts.forEach(function (p, i) {
    var v = p[m.f];
    if (v == null) { if (poly.length > 1) seg.push(poly); poly = []; return; }
    poly.push(X(i) + ',' + Y(v));
  });
  if (poly.length > 1) seg.push(poly);
  seg.forEach(function (s) {
    out.push('<polyline points="' + s.join(' ') + '" fill="none" stroke="#1f6feb" stroke-width="2.2"/>');
  });
  // ★ 点 + tooltip + 【每点数值标签】
  //   点少时全标；点多时隔点标，避免挤成一团互相遮挡。
  //   标签画在点的【正上方】，折线不会压住文字；且用白描边保证叠在网格线上也清晰。
  var stepLbl = pts.length <= 12 ? 1 : Math.ceil(pts.length / 10);
  pts.forEach(function (p, i) {
    var v = p[m.f]; if (v == null) return;
    out.push('<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="2.6" fill="#1f6feb">' +
      '<title>' + p.date + '  ' + esc(m.label) + ' ' + fv(v) + m.unit + '</title></circle>');
    if (i % stepLbl !== 0 && i !== pts.length - 1) return;
    out.push('<text x="' + X(i) + '" y="' + (Y(v) - 8) + '" font-size="10" font-weight="600"' +
      ' fill="#1f6feb" text-anchor="middle" stroke="#fff" stroke-width="2.6"' +
      ' paint-order="stroke">' + fv(v) + '</text>');
  });
  out.push('</svg>');
  box.innerHTML = '<div class="tr-head"><b>' + esc(label) + '</b>' +
    '<span class="hint">' + (pts.length) + ' 天 · ' + pts[0].date + ' ~ ' + pts[pts.length - 1].date + '</span>' +
    '<button class="mini tr-close">✕</button></div>' + out.join('');
  box.querySelector('.tr-close').onclick = function (e) { e.stopPropagation(); closeTrend(); };
}
/* ── 取数：卡片 + 明细列表 ────────────────────────────────────────
 * ★ 这两个函数（loadAll / loadCards）曾被我用 Python 切片替换时误删过，
 *   页面不报错、列表也不动，只是卡片永远停在「加载中…」——极难察觉。
 *   改这个文件请优先用 file_edit，别用脚本做区间替换。 */
function loadAll() {
  var r = computeRange();
  S.from = r[0]; S.to = r[1];
  $('rangeText').textContent = r[0] === r[1] ? r[0] : (r[0] + ' ~ ' + r[1]);
  $('heroSub').textContent = '数据区间 ' + (r[0] === r[1] ? r[0] : (r[0] + ' ~ ' + r[1])) +
    ' · ' + ({ agency: '整商', district: '商圈片（UB考核单位）', site: '站点', rider: '骑手' })[S.level];
  loadCards(r[0], r[1], true);
  loadScore();
  loadRt();
  // ★ 预取得分：/api/trend 顺带返回「当日 + 月度」得分（约 60ms），
  //   比等 /api/scoreboard 快一个数量级，卡片上的大网得分不用再空着。
  prefetchScore(r[0], r[1]);
  loadKpi(r[0], r[1]);
}

/* withList=false 时不重渲列表 —— 点对象时列表内容没变，重复渲会把选中态闪掉。 */
function loadCards(dfrom, dto, withList) {
  var r = computeRange();
  dfrom = dfrom || r[0]; dto = dto || r[1];
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('cards').innerHTML = '<div class="loading">加载中…</div>';
  var keyq = S.key ? '&key=' + q(S.key) : '';
  return api('/api/metrics?' + aq + 'level=' + S.level + '&from=' + dfrom + '&to=' + dto + keyq)
    .then(function (j) {
      LAST_TOTAL = j.total || {};
      renderCards(j.total);
      // ★ 本地指标到达后同步给罗盘，让「平台 / 我算」两列都能显示 ——
      //   罗盘接口要 2.4 秒，比 metrics 慢，两者到达时间不同。
      if (S.level === 'agency' && Object.keys(RT_PLAT).length) {
        renderRt();
      }
      if (withList) renderList(j.rows || []);
      return j;
    })
    .catch(function (e) { $('cards').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
}

/* ── 实时 ─────────────────────────────────────────────────────────── */
/* 今日实时（风神实时运营罗盘）
 * ────────────────────────────────────────────────────────────────
 * 数据来源：**风神后台原样拉取**（/api/realtime → basicAnalysis）。
 * ★ 这个模块存在的意义是【核对】：把平台给的今日实时值和本地运单算出来的值
 *   并排放，一眼看出差多少。自己算自己核对毫无意义，所以平台值必须是原值，
 *   不做任何换算/覆盖。
 * ★ 只在【整商】维度显示 —— 平台 basicAnalysis 只有整商粒度，
 *   硬套到商圈片/站点/骑手上会给出对不上的数字（维度错配比不显示更糟）。
 */
var RT_PLAT = {};   // 平台指标缓存：key → {name, value}
var RT_ERR = '';

function renderRt(state) {
  var box = $('rt');
  if (S.level !== 'agency') { $('rtPanel').hidden = true; return; }
  $('rtPanel').hidden = false;
  // ★ 折叠时在标题上给个提示（"有 N 项 · 点开核对"），
  //   否则默认折叠 = 用户看不到有数据，以为模块坏了。
  var fc = $('rtFold'), rb = $('rtBody');
  var n = Object.keys(RT_PLAT).length;
  if (fc) fc.title = rb && rb.hidden
    ? (n ? '展开核对（平台 ' + n + ' 项）' : '展开')
    : '折叠';
  if (n && rb && rb.hidden) {
    fc.textContent = '▸ ' + n;
  } else if (fc) {
    fc.textContent = '▾';
  }

  if (state === 'loading' && !Object.keys(RT_PLAT).length) {
    box.innerHTML = '<div class="empty">正在拉取风神后台实时数据…（该接口较慢，约 3 秒）</div>';
    return;
  }
  if (!Object.keys(RT_PLAT).length) {
    box.innerHTML = '<div class="empty">暂时取不到风神后台实时数据'
      + (RT_ERR ? '（' + esc(RT_ERR) + '）' : '')
      + '。平台实时接口时常超时，稍后会自动重试；本地指标不受影响。</div>';
    return;
  }

  // 平台指标 → 本地对应口径，用于核对
  var MINE = {
    complete_order_count: function (t) { return t.orders; },
    complete_order_rate: function (t) { return t.likt; },
    wl_complete_order_rate: function (t) { return t.likt; },
    driver_t_ontime_rate: function (t) { return t.t8; },
    predict_t8_ontime_rate: function (t) { return t.t8; },
    attend_driver_count: function (t) { return t.attendRiders; },
    complain_order_rate: function (t) { return t.dissat; }
  };
  // ★ 按平台实际返回的 21 个指标来选，不要凭空猜字段名
  //   （原来写了 rider_efficiency，平台根本没有 → 可展示项少一半，看起来"没有数据"）。
  var NAME = {
    push_order_count: '推单量',
    complete_order_count: '完单量',
    delivering_order_count: '配送中运单',
    cancel_order_count: '取消单量',
    complete_order_rate: '完单率',
    wl_complete_order_rate: '物流妥投率',
    logistics_un_complete_count: '物流责取消',
    driver_t_ontime_rate: '骑手准时送达率',
    predict_t8_ontime_rate: '预测T8准时率',
    attend_driver_count: '出勤骑手数',
    online_driver_count: '在线骑手',
    delivering_driver_count: '配送中骑手',
    avg_delivery_time: '平均时长',
    complain_order_rate: '投诉率',
    bad_rating_order_rate: '差评率',
    illegal_operation_order_rate: '违规操作率',
    overtime_claim_count: '超时申诉',
    bad_weather_final_order_rate: '恶劣天气占比'
  };
  var isRate = { complete_order_rate: 1, wl_complete_order_rate: 1,
                 driver_t_ontime_rate: 1, complain_order_rate: 1 };

  // ★ 直接读 LAST_TOTAL —— 它由 loadCards 写入，而请求本身带了当前 level+key，
  //   所以它【天然就是当前对象】的指标。
  //   之前绕道 RT_TOTAL 中间变量，而它只在两个时机赋值：
  //     ① loadRt 开头（此时 LAST_TOTAL 可能还是空的）
  //     ② loadCards 完成 且 罗盘已有数据（如果 metrics 先回来就被跳过）
  //   两个接口谁先返回不确定 → 经常两边都错过，「我算」那列永远是 —。
  var t = LAST_TOTAL || {};
  var h = '<div class="rt-note">左＝<b>风神后台</b>原值，右＝本地运单计算值，差值用于核对</div>';
  h += Object.keys(NAME).filter(function (k) {
    return RT_PLAT[k] && RT_PLAT[k].value != null;
  }).map(function (k) {
    var pv = RT_PLAT[k].value;
    var mine = MINE[k] ? MINE[k](t) : null;
    var fmt = function (v) {
      if (v == null || v === '') return '—';
      var n = typeof v === 'number' ? v : parseFloat(v);
      if (isNaN(n)) return String(v);      // ★ 平台偶尔返字符串，原样显示别强行算
      if (isRate[k]) return (n * 100).toFixed(2) + '%';
      return num(n);
    };
    // 差值：率用 pp，其他用绝对差。平台值可能是字符串，先转数字
    var pvN = typeof pv === 'number' ? pv : parseFloat(pv);
    var mineN = typeof mine === 'number' ? mine : parseFloat(mine);
    var diff = '';
    if (!isNaN(pvN) && mineN != null && !isNaN(mineN)) {
      if (isRate[k]) {
        var dpp = (pvN - mineN) * 100;
        var ok = Math.abs(dpp) < 0.5;
        diff = '<span class="rt-d ' + (ok ? 'good' : 'bad') + '">' +
          (dpp > 0 ? '+' : '') + dpp.toFixed(2) + 'pp</span>';
      } else if (Math.abs(pvN - mineN) >= 1) {
        diff = '<span class="rt-d ' + (mineN >= pvN ? 'good' : 'bad') + '">' +
          (mineN - pvN > 0 ? '+' : '') + Math.round(mineN - pvN) + '</span>';
      } else {
        diff = '<span class="rt-d good">一致</span>';
      }
    }
    return '<div class="rt-row">' +
      '<div class="rt-nm"><b>' + esc(NAME[k]) + '</b>' +
        '<span class="rt-sub">' + esc(RT_PLAT[k].name || '') + '</span></div>' +
      '<div class="rt-cells">' +
        '<div class="rt-cell"><div class="k">平台</div><div class="v">' + fmt(pv) + '</div></div>' +
        '<div class="rt-cell"><div class="k">我算</div><div class="v">' + fmt(mine) + '</div>' + diff + '</div>' +
      '</div></div>';
  }).join('');
  box.innerHTML = h + (h.length > 60 ? '' : '<div class="empty">风神后台未返回实时指标</div>');
}

/* 拉风神后台实时数据（平台原值，不做任何加工）+ 当前对象 total 供核对 */
function loadRt() {
  // ★ 罗盘只保留在【整商】维度（平台 basicAnalysis 只有整商粒度），
  //   而且放在页面最底部、默认折叠 —— 它是用来核对数据的，不是主内容。
  if (S.level !== 'agency') { $('rtPanel').hidden = true; return; }
  $('rtPanel').hidden = false;          // ★ 先显示面板，取不到数据也保留（并说明原因）
  var aq = ACCT ? '?acct=' + q(ACCT) : '';
  // ★ 该接口要 2 秒以上，而 loadAll 是并发的：首次进来时它必然还没回来，
  //   之后没有任何机制再取一次 —— 于是罗盘永远停在「暂时取不到」。
  //   这里加一次延迟重取（并显示"加载中"），保证数据最终一定上屏。
  RT_PLAT = {}; RT_ERR = '';
  renderRt('loading');
  setTimeout(function () { if (S.level === 'agency') fetchRt(); }, 2600);
  fetchRt();
}

function fetchRt() {
  var aq = ACCT ? '?acct=' + q(ACCT) : '';
  return api('/api/realtime' + aq).then(function (j) {
    if (j.ok && j.indicators && Object.keys(j.indicators).length) {
      RT_PLAT = j.indicators;
      MOM = j.indicators;
      // 两个接口谁先返回不确定：平台值到了就画一次，
      // 之后 metrics 到达时 loadCards 里还会再刷一次 —— 两边都到齐。
      renderRt();
    } else {
      // ★ 不再把面板藏掉：之前一失败就 hidden=true，用户完全看不到这个模块，
      //   也不知道它存在。改成显示"暂时取不到"。
      RT_PLAT = {};
      renderRt();
    }
  }).catch(function (e) {
    RT_PLAT = {};
    RT_ERR = e && e.message ? e.message : '接口不可用';
    renderRt();
  });
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
// 最近一次已消费的同步特征（完成时间|水位|新增行数）。变了 = 有新数据入库。
// 首屏置空，保证第一次进来就会 loadAll 一次。
var _lastSig = '';

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
  // ★ 同步条【常驻可见】，不再因「当前没有任务」就整条隐藏 ——
  //   用户反馈"看不到同步条"：非运行时只有 finished/error 才显示，
  //   而 finished 是服务启动后才有，页面首屏经常什么都不显示。
  //   现在无论状态如何都显示，至少能告诉用户上次同步到什么时候。
  bar.hidden = false;
  bar.classList.toggle('on', running);
  bar.classList.toggle('done', !running && !p.error && (p.percent >= 100 || p.finished));
  bar.classList.toggle('err', !running && !!p.error);

  var pct = Number(p.percent || 0);
  if (!running && !p.error) pct = 100;
  $('sbPct').textContent = (p.error && !running ? '失败' : Math.max(0, Math.min(100, pct)).toFixed(0) + '%');
  $('sbFill').style.width = Math.max(0, Math.min(100, pct)) + '%';

  function hhmm(ts) {
    return ts ? new Date(ts * 1000).toLocaleTimeString('zh-CN',
      { hour: '2-digit', minute: '2-digit' }) : '';
  }
  var stage = p.stage || (running ? '同步中…' : (p.error ? '同步失败' : '已完成'));
  if (!running && !p.error && p.finished) {
    stage = '已是最新 · ' + new Date(p.finished * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  $('sbStage').textContent = stage;

  var b = [];
  // ★ 运单更新条要显示【最近一次更新开始时间】（用户要求）——
  //   之前只有「已是最新 · 结束时间」，看不出这轮是什么时候开始的。
  // ★ 只要时间，不要日期（用户要求）—— 开始时间 + 用时够了
  if (p.started) b.push('开始 ' + hhmm(p.started));
  else if (p.lastSync) b.push('上次 ' + hhmm(p.lastSync));
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

/* 没更新成功的日期：标出来，并说明会自动补 */
function renderPending(list) {
  var el = $('pendingTip');
  if (!el) return;
  if (!list || !list.length) { el.hidden = true; el.textContent = ''; return; }
  var t1 = list.filter(function (x) { return x.isToday; }).map(function (x) { return x.date; });
  var t2 = list.filter(function (x) { return !x.isToday; }).map(function (x) { return x.date; });
  var parts = [];
  if (t2.length) parts.push('待补：' + t2.join('、'));
  if (t1.length) parts.push('今日同步未完成：' + t1.join('、'));
  el.hidden = false;
  el.innerHTML = '⚠ ' + esc(parts.join('　')) +
    '<span class="hint">（重试 3 次仍失败才标记，下一轮有条件会自动补更新）</span>';
}

function syncTick() {
  if (_syncPoll) { clearTimeout(_syncPoll); _syncPoll = null; }
  api('/api/progress').then(function (j) {
    var p = (j && j.progress) || {};
    renderSync(p);
    // ★ 显示「没拉成功的日期」—— 用户要求能看见哪几天缺了。
    //   后端会在下一轮定时任务里自动补更新（连续 3 次失败才标记）。
    renderPending((j && j.pending) || []);
    if (p.running) {
      _wasRunning = true;
      _syncPoll = setTimeout(syncTick, 1200);
    } else {
      // ★★★ 判定「有新数据入库」不能只看 running 的下降沿。
      //
      //   后端每 600 秒自动同步一次，而前端空闲时 20 秒才轮询一次 ——
      //   一次同步常常在【两次轮询之间】开始并结束，
      //   于是 p.running 一直是 false，_wasRunning 永远不置 true，
      //   下面的 loadAll() 永远不执行 → 用户看到「同步完了但数据不更新，
      //   必须自己刷页面」。
      //
      //   ★ 改成比对「最近一次完成的批次时间戳」：只要它变了就是有新数据，
      //     不管那次同步有没有被我们「看见」在跑。
      var sig = String(p.finished || '') + '|' + String(p.watermark || '') + '|' + String(p.newRows || '');
      if (_wasRunning || (sig !== _lastSig)) {
        _wasRunning = false;
        _lastSig = sig;
        loadAll();
        loadState();
      }
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
    // ★ 需要人工处理时（风神账号失效/账户下线）：把原因和动作直接显示出来。
    //   原来只把原始 JSON 塞进 title，用户看到「账户下线 AeolusAccountSerivce...」
    //   完全不知道该干嘛。现在给一句人话 + 一个「去登录」按钮。
    + (TODO.needRelogin && TODO.errMsg
        ? '<span class="tchip err auth" title="' + esc(TODO.errMsg) + '">⚠ ' + esc(TODO.errMsg) +
          '<button class="mini tfix" onclick="loadTodo(true)">重试</button></span>' : '')
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
    TODO.needRelogin = !!j.needRelogin; if (j.ok) TODO.errMsg = '';
    renderTodo();
  }).catch(function (e) {
    // ★ 已有旧数据时不要清空 —— 后端抖动不该让看板变空
    TODO.errMsg = e.message;
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
// 手动重取：平台实时接口慢且偶发失败，给用户一个不用等 3 秒的手段
$('rtReload').onclick = function () {
  this.textContent = '…';
  RT_PLAT = {}; RT_ERR = ''; renderRt('loading');
  fetchRt().then(function () { setTimeout(function () { $('rtReload').textContent = '↻'; }, 400); });
};

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

/* 正在跑的拉取任务列表（含取消）—— 用户要求：
   原来只显示一句「已有拉取任务在跑」，不知道卡在哪天、也没法中断。 */
function renderPulling(tasks) {
  var box = $('pullingBox');
  if (!box) return;
  if (!tasks || !tasks.length) { box.hidden = true; box.innerHTML = ''; return; }
  var SRC = { waybill: '运单（生成时间）', assess: '考核明细' };
  box.hidden = false;
  box.innerHTML = '<div class="pl-head">正在拉取的任务（新的拉取需等这些结束、暂停或取消）</div>' +
    tasks.map(function (t) {
      var src = SRC[t.source] || t.source || '';
      var st = t.cancelling ? '取消中…' : (t.pausing ? '暂停中…' : '运行中');
      return '<div class="pl-row" data-d="' + esc(t.date) + '">' +
        '<span class="pl-d">' + esc(t.date) + '</span>' +
        '<span class="pl-s">' + esc(src) + ' · ' + st + '</span>' +
        '<span class="pl-t">已跑 ' + (t.elapsed != null ? Math.round(t.elapsed) + 's' : '—') + '</span>' +
        '<button class="pl-p" data-pause="' + esc(t.date) + '">' +
          (t.pausing ? '恢复' : '暂停') + '</button>' +
        '<button class="pl-x" data-cancel="' + esc(t.date) + '">取消</button>' +
      '</div>';
    }).join('');
  // 暂停 / 恢复
  Array.prototype.forEach.call(box.querySelectorAll('[data-pause]'), function (b) {
    b.onclick = function () {
      var d = b.getAttribute('data-pause');
      var act = b.textContent === '暂停' ? 'pause' : 'resume';
      b.disabled = true;
      api('/api/pull_pause', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, action: act, acct: ACCT }) })
        .then(function (j) {
          $('progText').textContent = j.ok ? (j.msg || '已处理')
            : '✗ ' + (j.error || '操作失败');
          pollPulling();
        }).catch(function () { b.disabled = false; });
    };
  });
  Array.prototype.forEach.call(box.querySelectorAll('[data-cancel]'), function (b) {
    b.onclick = function () {
      var d = b.getAttribute('data-cancel');
      b.textContent = '取消中…'; b.disabled = true;
      api('/api/pull_cancel', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: d, acct: ACCT }) })
        .then(function (j) {
          $('progText').textContent = j.ok ? (j.msg || '已取消')
            : '✗ ' + (j.error || '取消失败');
          pollPulling();
        }).catch(function (e) { b.textContent = '✗ 失败'; });
    };
  });
}

function pollPulling() {
  // ★ 必须用 POST：这两个接口注册在 do_POST 里（与 /api/pull 同分支），
  //   用 GET 会落到 do_GET 直接 404。
  api('/api/pulling', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acct: ACCT }) }).then(function (j) {
    renderPulling(j.tasks || []);
    if ((j.tasks || []).length) setTimeout(pollPulling, 2500);
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
      pollPulling();          // ★ 展示在跑的任务并允许取消
    })
    .catch(function (e) { $('progText').textContent = '✗ ' + e.message; });
}

/* ── 事件 ─────────────────────────────────────────────────────────── */
$('lvlTabs').onclick = function (e) {
  var b = e.target.closest('button'); if (!b) return;
  Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
  b.classList.add('on');
  S.level = b.getAttribute('data-lvl'); S.key = ''; S.keyName = '';
  SUPPRESS_AUTO = false; loadAll();
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
/* ★ 顶部「立即刷新」= 刷新【今日运单增量】，不是补历史日期。
 *   原来 btnPull 调的是 startPull() → /api/pull，那是"拉取页面"用的全量接口，
 *   点它不会触发今日增量同步（用户反馈"点击立即刷新目前不会更新"）。
 *   btnPull2 保留给拉取页面（那个确实是补指定日期区间）。 */
$('btnPull').onclick = function () {
  var r = computeRange();
  if (r[0] !== today()) {
    // 不是看今天 → 提示去拉取页面补该区间，避免"点了没反应"
    $('progText').textContent = '当前区间是 ' + r[0] +
      (r[0] === r[1] ? '' : ' ~ ' + r[1]) + '，今日增量刷新只针对今天；' +
      '补历史日期请用「拉取数据」';
    return;
  }
  requestRefresh(true);
};

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
