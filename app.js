/* 风神考核看板 · 前端（CF Pages / GitHub Pages 双部署 + 账号登录） */
'use strict';

var CF_ORIGIN = 'https://fengshen-dashboard.pages.dev';

/* 2026-10-22：按用户要求【取消】镜像站自动跳转到直连入口，
   恢复 GitHub Pages / Cloudflare Pages 各自的静态托管（接口仍走 CF 边缘网关）。
   直连入口 http://158.178.244.142.sslip.io:8080/ 保留可用，只是不再自动跳。 */
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
  // ★ 2026-10-18：CF 边缘节点偶发 30 秒无响应（实测同一接口连打 3 次，
  //   1 次 000、1 次 1.1s、1 次 9.9s），手机上就表现成「无法连接接口：Failed to fetch」。
  //   这里对 GET 做 2 次自动重试；POST/DELETE 不重试（避免重复建账号、重复删除）。
  // ★ 2026-10-18 第二版：重试 2 次 → 1 次。页面首屏同时发 6~8 个请求，
  //   每个都重试两次的话，CF 一抖动就会堆出十几秒白屏（用户反馈"刷新变慢"）。
  //   一次重试已能把 10% 的偶发失败压到 1%。
  var _tries = String(opt.method || 'GET').toUpperCase() === 'GET' ? 1 : 0;
  function _go(n) {
    // 每次尝试最多等 9 秒：CF 那边卡住时要 30 秒才断，不设超时就是干等
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var o = opt;
    if (ctl) { o = Object.assign({}, opt, { signal: ctl.signal }); }
    var tid = ctl ? setTimeout(function () { ctl.abort(); }, 7000) : 0;
    function done() { if (tid) clearTimeout(tid); }
    return fetch(url, o).then(function (r) { done(); return r; }, function (e) { done(); throw e; })
      .catch(function (e) {
        if (n > 0) {
          return new Promise(function (r) { setTimeout(r, 700); })
            .then(function () { return _go(n - 1); });
        }
        throw e;
      });
  }
  return _go(_tries).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401) {
        // ★ 区分两种 401：
        //   · 看板自己的会话过期（NO_SESSION / BAD_KEY）→ 必须清本地登录态
        //   · 后端探测到【风神账号】登录态失效（needRelogin，如「账户下线」）
        //     → 那是风神那边的问题，跟看板账号无关，登出会把用户白踢出看板。
        if (!j || !j.needRelogin) {
          logoutLocal();
          // ★ 2026-10-18：原来只清 token、不跳转 —— 页面停在看板上，
          //   hero 里挂着一行「后端不可用：未登录或会话已过期」，用户以为系统坏了。
          //   会话确实过期了就老老实实回登录页（用户名会预填）。
          forceLogin();
        }
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
  var lu = $('lgUser');
  if (lu && !lu.value) lu.value = localStorage.getItem(LS_USER) || USER || '';
  $('apiHint').textContent = '接口：' + (API || location.origin);
}
function gotoLogin() { logoutLocal(); location.reload(); }
function logoutLocal() {
  TOKEN = ''; APIKEY = '';
  localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_KEY);
  // ★ 保留 USER：下次登录页预填用户名，少打一遍
}
/* 会话过期时把用户送回登录页（只做一次，避免并发请求重复触发） */
function forceLogin() {
  if (window.__toLogin) return;
  window.__toLogin = 1;
  try { showLogin(false); } catch (e) { location.reload(); }
}
function enterApp() {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('d1').value = today(); $('d2').value = today();
  $('pFrom').value = today(); $('pTo').value = today();
  // ★ 2026-10-18：原来 loadAccounts() 是前置串行 —— 首屏白白多等一个 RTT
  //   （CF 边缘国内响应 1~4 秒，等于白等 1~4 秒）。账号下拉和看板数据互不依赖，
  //   并行发出去，谁先回谁先渲染。
  // ★ 有缓存账号（localStorage）就并行发；首次访问（新域名 localStorage 为空）
  //   必须等 loadAccounts 回来拿到 ACCT，否则 metrics 不带 acct 参数、
  //   后端按 default 用户查 → 卡片一片空白。
  var _needAcct = !ACCT;
  var _accP = loadAccounts().catch(function (e) {
    $('heroState').textContent = '后端不可用：' + e.message;
  });
  if (_needAcct) {
    _accP.then(function () { loadState(); loadAll(); requestRefresh(); loadTodo(); });
  } else {
    loadState(); loadAll(); requestRefresh(); loadTodo();
  }
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
    if (TREND && TREND.key !== (lv + '|' + key)) TREND.points = null;   // 换层级才清空
  }
  var ym = from.slice(0, 7);
  // ★ 与 openTrend 用【同一个取数区间】，否则两处写进 TREND.points 的
  //   数据范围不同、key 又是同一个，谁后跑谁覆盖 —— 打开图表时
  //   拿到的可能是另一个范围的数据（7点 vs 30点），滑动也就触发不了。
  var m0 = (S.quick === 'range') ? from : (ym + '-01');
  var tkey = lv + '|' + key + '|' + m0 + '~' + to;
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/trend?' + aq + 'level=' + q(lv) + '&key=' + q(key) + '&from=' + q(m0) + '&to=' + q(to))
    .then(function (j) {
      TREND.points = j.points || [];
      TREND.key = tkey;
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
  // ★ 只报【超时单数 + 比例】，不显示"若剔除后指标变动多少"——
  //   那个是推导值，含义绕而且看不出到底有多少单受影响。
  // ★★ 用户 2026-10-14：改成【分数】显示 ——
  //   分子 = 卡餐超时单，分母 = 卡餐单量（卡餐且妥投）；
  //   括号里是 (分子占比, 分母占比) —— 即两者各占【完单量】的比重，不是两者的比值。
  function lateTxt(imp) {
    if (!imp.orders) return '';
    var late = imp.late != null ? imp.late : 0;
    var den = imp.delivered != null ? imp.delivered : null;      // 卡餐/二呼 且妥投 = 单量
    var ns = imp.lateShare != null ? imp.lateShare + '%' : '—';  // 分子占比 = 超时单/完单量
    var ds = imp.share != null ? imp.share + '%' : '—';          // 分母占比 = 单量/完单量
    var frac = (den != null) ? (num(late) + '/' + num(den) + '单') : (num(late) + '单');
    return '超时 ' + frac + '(' + ns + ', ' + ds + ')';
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
  var pvSt = (pv && pv.sameTimeParts) || {};
  var sameUsable = pvSame && pvSt && Object.keys(pvSt).length > 0 && pvSt.orders != null;      // 昨天同一时刻的各指标
  // ★ 选今天时，除出勤外全部改用【昨天同期】做基准（用户 2026-10-06）。
  //   实测"截至此刻 vs 全天"的偏差：完单 -68.5% / 人效 -68.1% /
  //   单均复合 -6.00s / T8准时率 +1.79pp / 完全妥投 0.01pp。
  //   完单与人效偏差极大（今天才跑了一半），必须同期。
  //   【出勤骑手数不同期】—— 骑手早在线，偏差仅 1.4%，
  //   拿它当基准只会给一个本来稳定的数字平添误差。
  function pvV(v, same) {
    return (pvSame && same != null) ? same : v;
  }
  var pvOrders = pv ? pvV(pv.orders, pvSt.orders) : null;
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
    cell('人效', t.efficiency, mp.efficiency, pvV(pv.efficiency, pvSt.efficiency),
      'num', '完单 ÷ 出勤（当前选今天时按昨日同期）'),
    cell('完全妥投率', t.likt, mp.likt, pvV(pv.likt, pvSt.likt), null,
      '考核口径' + (sameUsable ? ' · 环比按昨日同期' : (pvSame ? ' · 环比为昨日全天（同期数据缺失）' : ''))),
    cell('预测T8准时率', t.t8, mp.ontime, pvV(pv.ontime, pvSt.t8), null,
      t8d + (sameUsable ? ' · 环比按昨日同期' : (pvSame ? ' · 环比为昨日全天（同期数据缺失）' : ''))),
    cell('单均复合时长', t.duration, mp.dur, pvV(pv.dur, pvSt.duration), 'sec',
      '有效完单' + (sameUsable ? ' · 环比按昨日同期' : (pvSame ? ' · 环比为昨日全天（同期数据缺失）' : ''))),
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
  // ★ 哪些格按同期比、哪些不按（依据实测"截至此刻 vs 全天"的偏差）：
  //     完单量    -68.5%   → 同期（偏差极大，今天才跑一半）
  //     人效      -68.1%   → 同期（同分子逻辑）
  //     单均复合   -6.00s   → 同期（白天以短单为主）
  //     T8准时率  +1.79pp  → 同期（下午高峰更易超时）
  //     完全妥投率  0.01pp  → 同期（偏差极小，同期后仍一致，不引入误差）
  //     出勤骑手数 -1.4%    → 【不同期】骑手早在线，同期化只添噪声
  //   为什么不因"判责口径不同"而全部拒绝：口径差异是纵向的（T0 vs T-1），
  //   同期化消除的是横向的时间窗口偏差（今天半场 vs 昨天全天），后者大得多。
  // ★ 只有【同期数据真的拿到了】才敢写"已按昨日同期"——
  //   sameTimeParts 为 null 时前端会退回昨天全天，若文案还写"已按同期"，
  //   用户就会把 -30.6% 的假暴跌当成业务结论。数据缺失必须说出来。
  if (sameUsable) {
    thru += '<span class="wtag" title="今天还没过完，完单/人效/准时率/复合时长均与昨天同一时刻相比，'
      + '避免把今天进度落后误读成业务变差；出勤骑手数例外（骑手早在线，偏差仅约 1.4%，同期化反而添噪）">'
      + '环比已按昨日同期（出勤除外）</span>';
  } else if (pvSame) {
    thru += '<span class="wtag wtag-warn" title="同一时刻的切片数据没有取到，当前环比仍显示昨日全天做基准">'
      + '⚠ 同期数据缺失（环比为昨日全天）</span>';
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

/* ⚠️ 本函数当前【没有调用方】—— 全月得分板（#scorePanel）已隐藏，
   得分改在列表每行内联显示。保留代码是为了万一要恢复面板。

   ★★ 若要恢复它，记得【后端已经不再默认返回逐日明细】了：
       drawChart 读的 d.series 现在是空数组（后端为了省流量，
       默认不带 series，177 个对象能省 600KB+）。
       恢复面板时要改成请求 /api/scoreboard?series=1，
       否则图表会是空白的 —— 而页面不会报任何错。 */
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
        '<div class="sb-h"><div class="k">' + scoreLabel() +
          ' <span class="wtag">未判责·仅供参考</span></div>' +
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
  // 同趋势图：容器宽与点数所需宽取大者，宽屏铺满、窄屏才滚动
  var sbAvail = Math.max(320, (($('sbChart') || {}).clientWidth || 360) - 2);
  var W = Math.max(sbAvail, rows.length * 42 + 90), H = 190;
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
  var sby = [];
  [0, 20, 40, 60, 80, 100].forEach(function (g) {
    out.push('<line x1="' + pad.l + '" y1="' + Y(g) + '" x2="' + (W - pad.r) + '" y2="' + Y(g) +
      '" stroke="#eef1f6" stroke-width="1"/>');
    // 刻度文字进左侧固定 SVG（SVG 内才能保持和原来一致的字号/字重）
    out.push('<text x="' + (pad.l - 4) + '" y="' + Y(g) + '" font-size="9" ' +
      'dominant-baseline="middle" fill="#9aa3af" text-anchor="end">' + g + '</text>');
  });
  rows.forEach(function (r, i) {
    var da = (i === 0) ? 'start' : (i === rows.length - 1) ? 'end' : 'middle';
    out.push('<text x="' + X(i) + '" y="' + (H - 7) + '" font-size="9" fill="#9aa3af" text-anchor="' + da + '">' +
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
  var sbHost = $('sbChart');
  // 全屏 / 导出 两枚按钮
  sbHost.innerHTML = out.join('');
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
  var dayTo = r[1] || day;
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  api('/api/scoreboard?' + aq + 'month=' + q(day.slice(0, 7)) + '&day=' + q(day) +
      '&from=' + q(day) + '&to=' + q(dayTo) +
      '&level=' + q(lv) + '&key=' + q(key))
    .then(function (j) {
      var d = (j.districts || [])[0];
      if (!d) return;
      // ★ 得分有两套值，不能混用：
//     所选日期得分 = d.today.dayNet   （当日四项加权 + 过程项 15）
//     全月得分     = d.month.bigNet  （全月四项加权 + 过程项 15）
//   之前 cur 和 month 都取了 d.month.bigNet → 两格显示同一个数。
var dayS = scoreOfRow(d);
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

/* ★ 导出当前列表为 CSV（用户 2026-10-06）。
 * 导出的是【当前筛选 + 排序后的完整结果】，不是屏幕上这 200 行 ——
 * 骑手有 143 人时如果只导 200 行就正好全了，但换个大单量就会静默少数据。
 * 用 BOM + CRLF：Excel 打开中文不乱码。
 */
function exportCsv(rows) {
  var tip = $('progText');
  if (!rows || !rows.length) { if (tip) tip.textContent = '没有可导出的数据'; return; }
  var head = ['排名', '骑手', '站点', '完单', '得分', '出勤', '人效',
              '完全妥投率', 'T8准时率', '单均复合时长(s)', '不满意率',
              '妥投分子', '妥投分母', '准时分子', '准时分母',
              '不满意加权分子', '不满意分母', '复合合计', '得分全月'];
  function q(v) {                       // CSV 转义：含逗号/引号/换行要加引号
    if (v == null) return '';
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  var lines = [head.join(',')];
  rows.forEach(function (r, i) {
    var p = r.parts || {}, sc = r.score || {};
    lines.push([
      i + 1, r.name || r.id, r.siteName || '',
      r.orders, sc.cur == null ? '' : Number(sc.cur).toFixed(2),
      r.attendRiders, r.efficiency,
      r.likt == null ? '' : (r.likt * 100).toFixed(2) + '%',
      r.t8 == null ? '' : (r.t8 * 100).toFixed(2) + '%',
      r.duration == null ? '' : Number(r.duration).toFixed(2),
      r.dissat == null ? '' : (r.dissat * 100).toFixed(3) + '%',
      p.likt_n, p.likt_d, p.ont_n, p.ont_d, p.dis_n, p.dis_d, p.dur_n,
      sc.month == null ? '' : Number(sc.month).toFixed(2)
    ].map(q).join(','));
  });
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var lv = { agency: '整商', district: '商圈片', site: '站点', rider: '骑手' }[S.level] || S.level;
  a.download = '骑手明细_' + S.level + '_' + (S.from || today()) + '_' + (S.to || S.from) + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  if (tip) tip.textContent = '已导出 ' + rows.length + ' 行 CSV';
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
      '<span class="sc-cell" title="' + esc(scoreHint()) + '">' + scoreLabel() +
        ' <b>' + (r.score && r.score.cur != null
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
// ★★ 默认按【得分升序】（用户 2026-10-06）：得分低的排最前。
//   配合默认的「只看前 10%」，进去看到的就是【得分最低的那批骑手】——
//   这才是骑手模块的用途：找拖后腿的人。原先默认「单量降序」，
//   前 10% 等于"单量最高的10%"，跟质量无关，方向刚好反了。
var LIST_F = { sortKey: 'score.cur', sortDir: 1, quant: 0.10,   // ★ 默认只看前 10%
              sites: null,     // sites: null = 全选（不过滤），否则为站点名数组
              kw: '',          // ★ 骑手姓名/ID 搜索（本地过滤，2026-10-15 用户要求）
              showAll: false };// 显示明细：true = 全部行都展开详情
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

/* ★ 骑手姓名 / ID 搜索（用户 2026-10-15：「骑手明细增加筛选」）。
   走【本地过滤】，不发请求 —— LAST_ROWS 已经是该维度的全量行。
   位置在【站点筛选之后、排序与分位之前】：这样「只看前 10%」的分母
   是"搜出来的这批人"，而不是全站 142 人。 */
function applyKw(rows) {
  if (S.level !== 'rider') return rows;
  var k = (LIST_F.kw || '').replace(/^\s+|\s+$/g, '').toLowerCase();
  if (!k) return rows;
  var digits = k.replace(/\D/g, '');
  return rows.filter(function (r) {
    if (String(r.name || '').toLowerCase().indexOf(k) >= 0) return true;
    if (digits && String(r.id || '').indexOf(digits) >= 0) return true;
    return false;
  });
}

function renderListBar(rows) {
  var bar = $('listBar');
  if (!bar) return;
  // ★ 排序与分位筛选【只在骑手模块】提供（用户要求）。
  //   整商/商圈片/站点 数量都很少，按指标排序意义不大，保持默认按单量降序。
  if (S.level !== 'rider') { bar.hidden = true; bar.innerHTML = ''; return; }
  // ★「显示明细」+「导出」两枚按钮（用户 2026-10-06）。
  //   显示明细 = 全部行都展开分子/分母详情，且【不受 200 行渲染上限】限制 ——
  //   平时只渲染 200 行，点"全部展开"却只有 200 行展开，会让人以为就这么多。
  var h = '<div class="lb-row">' +
    '<button class="lb' + (LIST_F.showAll ? ' on' : '') + '" data-showall>' +
      (LIST_F.showAll ? '收起明细' : '显示明细') + '</button>' +
    '<button class="lb" data-export>导出 CSV</button>' +
    '<button class="lb" data-exportimg>导出图片</button>' +
    '</div>';
  h += '<div class="lb-row"><span class="lb-lab">排序</span>';
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
    // ★ 分位的分母必须是【站点筛选之后】的人数 —— 那才是"当前这批人"。
    //   用全量做分母时，勾了只一个站点仍显示"显示 15 / 149 人"，
    //   实际只渲染了 3 行，看起来像漏了人。
    var poolN = applyKw(applySites((rows || []).slice())).length;
    var shownN = LIST_F.quant ? Math.max(1, Math.ceil(poolN * LIST_F.quant)) : poolN;
    // ★ 未出分的人数要显式说出来 —— 按得分排序时，没分的行会沉到最后，
    //   被分位筛掉。不提示的话，用户只会看到"人数对不上"。
    var noScore = (rows || []).filter(function (r) {
      return !(r.score && r.score.cur != null); }).length;
    h += '<span class="lb-hint">' + (LIST_F.quant
      ? '显示 ' + shownN + ' / ' + poolN + ' 人'
      : '共 ' + poolN + ' 人') +
      (noScore && LIST_F.sortKey === 'score.cur'
        ? '　<em class="lb-noscore" title="这些人在所选日期没有可计分的完单，按得分排序时排在最后">'
          + noScore + ' 人未出分</em>' : '') +
      '</span></div>';
  }
  // ★ 骑手姓名搜索（用户 2026-10-15 要求）：本地过滤，边打边筛，不用点按钮。
  h += '<div class="lb-row"><span class="lb-lab">搜索</span>' +
    '<span class="lb-inwrap lb-kwwrap">' +
    '<input class="lb-in lb-kw" type="search" autocomplete="off" ' +
      'placeholder="骑手姓名 / 骑手ID" value="' + esc(LIST_F.kw || '') + '" data-kw>' +
    (LIST_F.kw ? '<button class="lb-x" data-kwclear title="清除">✕</button>' : '') +
    '</span></div>';
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
  // 显示明细 / 导出
  var saBtn = bar.querySelector('[data-showall]');
  if (saBtn) saBtn.onclick = function () {
    LIST_F.showAll = !LIST_F.showAll;
    renderList(LAST_ROWS.slice());
  };
  var exImg = bar.querySelector('[data-exportimg]');
  if (exImg) exImg.onclick = function () {
    var rows = applyKw(applySites((LAST_ROWS || []).slice()));
    rows = applyQuantile(applySort(rows));
    if (typeof exportImage === 'function') exportImage(rows);   // export_img.js
    else { var t = $('progText'); if (t) t.textContent = '导出图片功能未加载'; }
  };
  var exBtn = bar.querySelector('[data-export]');
  if (exBtn) exBtn.onclick = function () {
    var rows = applyKw(applySites((LAST_ROWS || []).slice()));
    rows = applySort(rows);
    rows = applyQuantile(rows);
    exportCsv(rows);          // 导出【当前筛选+排序后的完整结果】
  };
  Array.prototype.forEach.call(bar.querySelectorAll('[data-sort]'), function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-sort');
      if (LIST_F.sortKey === k) {
        LIST_F.sortDir = -LIST_F.sortDir;                 // 再点一次反向
      } else {
        LIST_F.sortKey = k;
        // ★★ 「得分」换过来时【固定升序】—— 得分低的排最前才是这个模块的用途
        //   （找拖后腿的人）。跟随"换指标默认从大到小"会让它变成"得分最高的前 10%"，
        //   跟进来时的默认方向刚好相反，用户会以为排序坏了（用户 2026-10-07）。
        LIST_F.sortDir = (k === 'score.cur') ? 1 : -1;
      }
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
  // ★ 搜索框：边打边筛（300ms 防抖）。
  //   重画工具条会让 input 失焦，所以刷完要把光标还回去 —— 否则打第二个字就断。
  var kwi = bar.querySelector('[data-kw]');
  if (kwi) {
    kwi.onclick = function (e) { e.stopPropagation(); };
    var kwT = null;
    kwi.oninput = function () {
      clearTimeout(kwT);
      kwT = setTimeout(function () {
        LIST_F.kw = kwi.value;
        var pos = kwi.value.length;
        renderList(LAST_ROWS.slice());
        var el2 = $('listBar') && $('listBar').querySelector('[data-kw]');
        if (el2) { el2.focus(); try { el2.setSelectionRange(pos, pos); } catch (e) {} }
      }, 300);
    };
    kwi.onkeydown = function (e) { if (e.key === 'Enter') e.preventDefault(); };
  }
  var kwc = bar.querySelector('[data-kwclear]');
  if (kwc) kwc.onclick = function (e) {
    e.stopPropagation();
    LIST_F.kw = '';
    renderList(LAST_ROWS.slice());
  };
}

/* 排序/筛选只影响列表，不重新请求接口 —— 复用已取到的全量行 */
function refreshList() { renderList(LAST_ROWS.slice()); }

/* ★ 批量拉取【全量】得分。
   原来得分只在【点开某一行】时请求（loadObjScore），于是列表里每行的
   「得分」格永远是「—」—— 用户明确指出「明明有数据，明细却没有」。
   现在进入该维度时一次取回全部对象的分，回来后只改 .row2 的得分格。 */
var SCORE_BUSY = false;
// 最近一次取分拿到的条数（0 条要显式提示，不能静默显示一排「—」）
var _scoreGot = null;
// ★ 四个层级都要取得分（原来只做骑手 → 商圈片/站点永远是「—」，用户 2026-10-06 反馈）。
//   后端 scoreboard 对四个层级行为一致，带 ids 白名单只算这些对象。
//   实测：district 2/2、site 4/4 都正常返回，且耗时 <5ms（day_score 缓存命中）。
var SCORE_LEVELS = ['agency', 'district', 'site', 'rider'];

/* ★★★ 数据版本号：/api/metrics 取到【内容不同】的数据时 +1。
   得分是"当天运单聚合"的函数，而 T0 数据一整天都在变 ——
   数据一变，上一轮的得分就过期了，必须重算并重排
   （用户 2026-10-07：「如果分数又更新了，那么必须刷新骑手排序并显示新的排序」）。
   没有版本号时，一行只要已有 score 就再也不重算 →
   骑手得分永远停在第一次进入时的值，排序也永远不刷新。 */
var DATA_VER = 0;
// 上一次算分对应的签名（数据版本 + 维度 + 对象 + 日期）。不一致 = 需要重算。
var SCORE_SIG = '';
// 上一次 /api/metrics 的行集指纹 —— 用来判断"数据到底变没变"
var _lastRowsFp = '';
// ★ 最近一次取分【失败】的签名。同签名的数据不再自动重试 ——
//   否则后端一直报错时，renderList 会「显示占位 → 请求失败 → 再显示占位」无限循环。
//   新的数据到来会换签名，重试自然恢复。
var SCORE_FAIL_SIG = '';

/* ★★ 得分结果缓存：签名 → { 对象id: {cur, month} }。
   实测全量 149 个骑手的得分要 1.4 秒，而"切到站点再切回骑手"用的是同一批数据 ——
   没有缓存就要白等一次。缓存键就是那个签名（含数据版本），
   所以数据一变缓存立刻失效，不会拿旧分糊弄（用户 2026-10-07 的要求）。
   只保留最近几次，避免长时间浏览时无限增长。 */
var SCORE_CACHE = {};
var SCORE_CACHE_MAX = 6;

function scoreSigNow() {
  var r0 = computeRange();
  return DATA_VER + '|' + S.level + '|' + (S.key || '') + '|' + (r0[0] || today());
}

/* 若有缓存，把分数直接写回行里并落实签名。
   ★ 必须在 renderList 判断"要不要重算"【之前】调用：
     否则会先显示"正在计算…"、再被缓存填上，白闪一下。 */
function applyCachedScores() {
  var sig = scoreSigNow();
  var hit = SCORE_CACHE[sig];
  if (!hit) return false;
  var rows = LAST_ROWS || [];
  for (var i = 0; i < rows.length; i++) {
    var v = hit[rows[i].id];
    if (v === undefined) continue;
    rows[i].score = v;              // v 可能是 {cur:null,month:null}（该人本就无分）
    rows[i].scoreTried = sig;
  }
  SCORE_SIG = sig;
  return true;
}

/* 行集的廉价指纹：用来判断"这轮数据到底变没变"。
   只累加单量，不用整段 JSON 比较 —— 149 行比字符串更快也更省。 */
function rowsFingerprint(rows) {
  var n = rows.length, sum = 0, mix = 0;
  for (var i = 0; i < rows.length; i++) {
    var o = Number(rows[i].orders) || 0;
    sum += o;
    mix = (mix + o * (i + 7) + (Number(rows[i].duration) || 0) * 3) % 1000000007;
  }
  return n + ':' + sum + ':' + mix;
}

/* ★★ 得分的取值口径 = 跟随【所选区间】（2026-10-13 用户反馈后修）。
   原来取 `d.today.dayNet`，而那是按【区间第一天】算的单日分；
   卡片上的完单/准时/妥投/复合却是【整个区间】的汇总 ——
   一张卡上两个口径，看着自相矛盾。
   实测（区间 10-08~10-13）：曾洪 区间准时 95.62%/复合 13.03s，分却只有 55.00，
   因为 55.00 是 10-08 那天（准时 70.59%、复合 101.41s）的分。
   现在优先用后端新给的 `range.bigNet`（与月得分同一套场景加权算法，只是限定在所选区间）。 */
function scoreOfRow(d) {
  if (!d) return null;
  if (d.range && d.range.bigNet != null) return d.range.bigNet;
  return (d.today || {}).dayNet;     // 后端未给区间（旧版）时退回原行为
}

/* 得分标签：单日显示「今日得分」，多日区间显示「区间得分」（别再把区间第一天叫"今日"） */
function scoreLabel() {
  var r = computeRange();
  return (r[0] === r[1]) ? '今日得分' : '区间得分';
}

/* ★ 得分口径随层级不同（2026-10-13 用户定）：
     整商 / 商圈片 → 平台考核门槛（T0/T60/T100 分段线性）
     站点 / 骑手   → 「对大盘的影响率」（占比）
   在得分格上给个 title，避免看的人以为两处是一套算法。 */
function scoreHint() {
  if (S.level === 'site' || S.level === 'rider') {
    return '按「对大盘的影响率」算分：该项问题占全层级的比重 × 权重'
         + '（非妥投20% + T8超时30% + 复合时长15% + 不满意20%），只看占比不看绝对门槛';
  }
  return '按平台考核门槛分段线性算分（T0/T60/T100 三个基准点）';
}

/* 得分是否处于"要重算"状态（供 renderList 决定先显示占位还是直接渲染）。
 * ★ 同一个签名刚失败过就不再算"需要重算" —— 否则会死循环。 */
function scoresStale() {
  var r0 = computeRange();
  var day = r0[0] || today();
  var sig = DATA_VER + '|' + S.level + '|' + (S.key || '') + '|' + day + '~' + (r0[1] || day);
  if (sig === SCORE_FAIL_SIG) return false;
  return SCORE_SIG !== sig;
}

function loadListScores() {
  if (SCORE_LEVELS.indexOf(S.level) < 0 || SCORE_BUSY) return;
  var rows = LAST_ROWS || [];
  if (!rows.length) return;
  var r0 = computeRange();
  var day = r0[0] || today();
  var dayTo = r0[1] || day;
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  var sig = DATA_VER + '|' + S.level + '|' + (S.key || '') + '|' + day + '~' + dayTo;
  var stale = (SCORE_SIG !== sig);
  // ★★★ 必须按【全量 LAST_ROWS】判断谁还没分，不能用 LIST_ROWS，也【不做 200 截断】。
  //   ① 不能用 LIST_ROWS：它只装了已经渲染出来的那几行（默认分位 10%
  //      意味着 149 个骑手只渲染 15 行），用它算 missing 会漏掉绝大多数人。
  //   ② 不能截断：按得分排序要求【每个人都有分】才能排出正确顺序 ——
  //      只算前 200 个的"局部有序"拼在全量上仍是乱序。
  //      实测后端全量 149 人 1.38s，代价可接受。
  //   ③ stale 时【全部视为缺分】：数据变了就得重算，否则分数永远是旧的。
  //   ④ ★★ 判据必须是【"这一轮问过没有"（scoreTried）】而不是【"有没有值"】——
  //      有些骑手【本来就出不了分】（当天没有可计分的完单），
  //      用"有没有值"判断会永远认为他缺分 → 每次重绘都再请求一次 →
  //      实测打出了 2000+ 次请求的循环。问过就记账，无论有没有拿到值。
  var want = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (stale || r.scoreTried !== sig) want.push(r.id);
  }
  if (!want.length) { SCORE_SIG = sig; return; }
  SCORE_BUSY = true;
  // ★ 记下这次请求属于哪个层级：响应回来时用户可能已经切走，
  //   把上一层级的结果（比如"接口没返回得分"）贴到新层级上是错的。
  var reqLevel = S.level;
  _scoreGot = null;
  // 取分期间允许工具条显示进度（大列表时用户要看得见"在算"）
  var pc = $('listBar');
  if (pc && stale) {
    var tip = pc.querySelector('.lb-hint');
    if (tip) tip.innerHTML = '正在计算 ' + want.length + ' 人得分…';
  }
  api('/api/scoreboard?' + aq + 'month=' + q(day.slice(0, 7)) + '&day=' + q(day) +
      '&from=' + q(day) + '&to=' + q(dayTo) +
      '&level=' + q(S.level) + '&ids=' + q(want.join(',')))
    .then(function (j) {
      // ★ 回填要写进【LAST_ROWS 里的那一行】(排序用的就是它的 score.cur)，
      //   而不是只写 LIST_ROWS —— 分位筛选下 LIST_ROWS 只有少数行，
      //   写它等于没写全量，排序时其余行全是 undefined。
      var idx = {};
      (LAST_ROWS || []).forEach(function (r) { idx[r.id] = r; });
      (j.districts || []).forEach(function (d) {
        var row = idx[d.id];
        if (!row) return;
        row.score = { cur: scoreOfRow(d), month: (d.month || {}).bigNet };
        if (LIST_ROWS[d.id]) LIST_ROWS[d.id].score = row.score;
        var cell = $('list').querySelector('.item[data-id="' + d.id + '"] .row2 .sc-cell b');
        if (cell) cell.textContent = row.score.cur == null ? '—' : Number(row.score.cur).toFixed(2);
        var box = $('list').querySelector('.item[data-id="' + d.id + '"] .row3');
        if (box) box.innerHTML = detailGrid(row);
      });
      // ★ 签名在这里就落实：重绘时 renderList 会再调 loadListScores，
      //   若签名还是旧的就会无限递归下去（实测会把浏览器卡死）。
      SCORE_SIG = sig;
      SCORE_FAIL_SIG = '';        // 这次成功了，清掉失败标记
      _scoreGot = (j.districts || []).length;
      // ★★★ 给【这一轮问过的每一个人】记账，不管他最终有没有拿到分值。
      //   没有这一步，那个"本来就出不了分"的骑手会永远被判定为缺分，
      //   每次重绘都再请求一遍 —— 实测打出了 2092 次请求的死循环。
      var tried = {};
      for (var wi = 0; wi < want.length; wi++) tried[want[wi]] = 1;
      // ★ 顺手把这一轮的结果存进缓存：同签名（同数据版本/维度/日期）内
      //   切走再切回不必重算 —— 实测全量骑手 1.4s。
      var snap = {};
      for (var ci = 0; ci < want.length; ci++) {
        var cr = idx[want[ci]];
        if (cr) snap[want[ci]] = cr.score || { cur: null, month: null };
      }
      SCORE_CACHE[sig] = snap;
      var keys = Object.keys(SCORE_CACHE);
      if (keys.length > SCORE_CACHE_MAX) delete SCORE_CACHE[keys[0]];
      for (var ri = 0; ri < (LAST_ROWS || []).length; ri++) {
        var rw = LAST_ROWS[ri];
        if (tried[rw.id]) rw.scoreTried = sig;
      }
    }).catch(function () {
      // ★ 记下失败的签名：同签名不再自动重试，否则「占位 → 失败 → 占位」会无限循环。
      //   数据一变签名就不同，重试自然恢复。
      SCORE_FAIL_SIG = sig;
    })
    .then(function () {
      // ★★ 必须【先复位 SCORE_BUSY，再重排】。
      //   原来在 .then 里先调 renderList → 里面又调 loadListScores，
      //   而此时 SCORE_BUSY 还是 true → 直接 return，剩余骑手的分再也补不上，
      //   标志位因为异常路径也没复位 → 整个模块的取分从此死锁（实测只请求 1 个 id）。
      SCORE_BUSY = false;
      // ★★★ 分数到了就要【立刻重排并按新的顺序显示】（用户 2026-10-07 明确要求）。
      //   原来这里有个 `every(有分)` 闸门，只要有一个骑手没分就【永远不重排】——
      //   实测 149 人里 148 人有分、1 人没有 → 闸门恒假 → 列表始终是按 null
      //   排出来的原始顺序，"按得分排序"完全不起作用。
      //   现在：不再要求人人有分。缺分的行由 applySort 统一沉底（规则固定），
      //   所以只要有【新分进来】就重排，顺序就是对的。
      if (LIST_F.sortKey === 'score.cur') {
        renderList(LAST_ROWS.slice());
      } else {
        renderListBar(LAST_ROWS);   // 不是按得分排的：只需刷新"未出分"计数
      }
      // ★ 取到 0 条要能看出来（别静默显示一排「—」）。
      //   但只在【响应仍属于当前层级】时才提示 —— 切维度时上一层的响应
      //   后到会把提示贴到新层级上（实测整商的提示漏到了骑手视图）。
      if (_scoreGot === 0 && reqLevel === S.level) {
        var nb = $('listBar');
        var t2 = nb && nb.querySelector('.lb-hint');
        if (t2) t2.innerHTML = t2.innerHTML + '　<em class="lb-noscore">接口没返回得分</em>';
      }
    });
}
/* 站点下拉多选专用：勾选后要重画列表，但下拉必须【保持展开】，
 * 否则用户连点两个站点，第二次勾选时下拉已经合上了 —— 没法连续勾。
 * renderList 会走 renderListBar 重建工具条，所以这里把 open 状态清掉再还回去。 */
function refreshListKeepOpen() {
  LIST_F.siteOpen = true;
  renderList(LAST_ROWS.slice());
}
/* isMaster=true 表示 rows 是 /api/metrics 刚送来的【权威全量】。
 * 其余调用（排序切换、分位切换、补分后重排）都不要传，避免把数据集改小。 */
function renderList(rows, isMaster) {
  // ★ 记录"列表当前展示的是哪个维度"，供导出图片校验。
  //   切维度时 /api/metrics 是异步的，列表渲染完成前 DOM 里还是上一维度的内容；
  //   导出图片若不校验，就会把【整商的 1 行】当成【骑手明细】导出去（用户 2026-10-06 反馈）。
  window.__listLevel = S.level;
  window.__listCount = rows.length;
  // ★ 四个颗粒度严格分开、行为一致：整商=代理商本身(1行)、商圈片、站点、骑手。
  //   原来 agency 被降级成 district，又额外开了「不出列表」特例，
  //   导致点整商看到的是商圈片数据、或干脆什么都不显示。
  var mlv = S.level;

  $('listPanel').hidden = false;
  $('listTitle').firstChild.nodeValue = ({
    district: '商圈片明细', site: '站点明细', rider: '骑手明细'
  })[S.level] || '明细';
  if (!rows.length) { $('list').innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }

  // ★★ 只有 /api/metrics 送来的【新数据】才能改写"权威全量行集"。
  //   排序 / 分位 / 站点筛选 / 补分后的重绘都会传【子集或副本】，
  //   若它们也覆盖 LAST_ROWS，勾一次站点就会把数据集永久缩小 ——
  //   再也回不到全量，分位分母也跟着错。
  if (isMaster) LAST_ROWS = rows;
  // ★ 先看缓存：同一批数据（同数据版本/维度/日期）里切走再切回，
  //   分数是现成的，直接填上就正常渲染 —— 不必再等一次全量计算。
  //   数据一变 DATA_VER 就变、签名随之变化，缓存不会命中，仍会重算。
  applyCachedScores();
  // ★★★ 按【得分】排序时，必须先拿到全量得分再渲染（用户 2026-10-07 要求）：
  //   没分之前排出来的顺序是错的（score.cur 全是 undefined），
  //   先渲染一版错的、补分后再换成对的，会看到一次"顺序跳变"。
  //   所以这里先显示"正在计算"，等分数回来由 loadListScores 重排后渲染。
  if (LIST_F.sortKey === 'score.cur' && scoresStale() && !SCORE_BUSY) {
    if (!LAST_ROWS || !LAST_ROWS.length) LAST_ROWS = rows;
    renderListBar(LAST_ROWS);
    var nAll = applyKw(applySites((LAST_ROWS || []).slice())).length;
    $('list').innerHTML = '<div class="loading">正在计算全部 ' + nAll +
      ' 人的考核得分…<br><span class="hint">得分是当天四项指标加权的结果，' +
      '必须先算出每个人才能按得分排序并取前 ' +
      Math.round((LIST_F.quant || 0) * 100) + '%</span></div>';
    loadListScores();
    return;
  }

  // ★ 排序 + 骑手分位筛选（在渲染前应用，作用于全量行）
  renderListBar(rows);
  rows = applyKw(applySites(rows));
  rows = applySort(rows);
  rows = applyQuantile(rows);
  // ★ 行数据存全局：objScore 拿到分数后要写回对应行，卡片内的分数才能显示。
  LIST_ROWS = {};
  // ★ 「显示明细」时放开 200 行上限：否则会出现"点了展开却只有 200 行"，
  //   让人误以为这个区间就这么多骑手。收起时仍限 200 行，避免手机卡顿。
  var cap = LIST_F.showAll ? 100000 : 200;
  $('list').innerHTML = rows.slice(0, cap).map(function (r) {
    LIST_ROWS[r.id] = r;
    // ★ 紧凑行：默认只一行摘要；点开的那个才展开完整指标（master-detail）。
    //   原来每行都铺开 4 个指标 + 大字号单量，4 个站点就占满一屏。
    return itemHtml(r);
  }).join('');
  loadListScores();           // ★ 各层级得分异步补齐（只改得分格，不重绘整表）
  var items = $('list').querySelectorAll('.item');
  // ★ 「显示明细」：渲染完直接把全部行标记为展开。
  //   mark() 只在【点某一行】时才跑，首次渲染不会经过它 ——
  //   所以这里必须单独兜一遍，否则点了"显示明细"一行都没展开。
  if (LIST_F.showAll) {
    Array.prototype.forEach.call(items, function (x) { x.classList.add('open'); });
  }
  // 选中态：只高亮，【不自动展开】。
// ★ 之前恢复选中/自动选中首行时都顺手 add('open')，用户没点就被迫看一屏数据，
//   手机端一个站点就占满整屏（用户反馈「我都没点击怎么默认展开了」）。
//   现在：点哪行展开哪行；其余（含自动选中的首行）一律收起。
function mark(el, expand) {
  Array.prototype.forEach.call(items, function (x) {
    x.classList.remove('on');
    x.classList.remove('open');
    // ★ 「显示明细」打开时，每行都带 open —— 否则 mark() 会把它们全收起来，
    //   点一下任意行就把全部展开状态清空。
    if (LIST_F.showAll) x.classList.add('open');
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

/* ★ 最适配的整数档位（1-2-2.5-5 × 10^k），用户 2026-10-07。
   例：需要步长 3.7 → 返回 5；需要 0.023 → 返回 0.025。
   这样所有刻度都是"整数"，读数一眼能对上。 */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var norm = raw / mag;
  var mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}
/* 档位需要几位小数：步长 5 → 0 位；0.05 → 2 位 */
function stepDecimals(step) {
  if (step >= 1) return 0;
  return Math.min(6, Math.ceil(-Math.log(step) / Math.LN10));
}

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
  var to = r[1];
  var last = (r[0] > to ? r[0] : to);
  // ★★ 趋势图的取数区间（用户 2026-10-07）：
  //   · 区间模式：跟随【你选的区间】起止 —— 否则选「9/1~10/7」这种跨月区间时，
  //     ym 取的是起始月(9月)、只画到今天，图里只有 7 个点，
  //     既看不到整段数据、也不会触发左右滑动（7 天不滑）。
  //   · 其他模式（今天/昨天/前天/选日期）：仍是【所在月月初 ~ 今天】，"整月趋势"。
  var trendFrom = (S.quick === 'range') ? r[0] : (ym + '-01');
  // ★ 缓存标识要带上取数范围：否则先看「今天」(7点)、再切「区间」(30点)，
  //   lv|key 没变会直接用旧缓存，图里还是那 7 个点、也不会触发滑动。
  var tkey = lv + '|' + key + '|' + trendFrom + '~' + to;
  box.hidden = false;
  TREND.metric = m; TREND.label = label;
  if (!TREND.points || TREND.key !== tkey) {
    box.innerHTML = '<div class="loading">正在加载 ' + esc(label) + ' 的趋势…</div>';
    var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
    api('/api/trend?' + aq + 'level=' + q(lv) + '&key=' + q(key) +
        '&from=' + q(trendFrom) + '&to=' + q(to))
      .then(function (j) {
        TREND.points = j.points || [];
        TREND.key = tkey;
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

/* ★ 全屏查看趋势图（用户 2026-10-07）。
   用 fixed 铺满视口，而不是 Fullscreen API：后者在 iOS Safari 要用户手势、
   退出后页面布局常出错。滚动时锁住 body，退出还原。 */
function toggleTrendFull(box) {
  if (box.classList.contains('full')) {
    box.classList.remove('full');
    document.body.classList.remove('noScroll');
    window.scrollTo(0, window.__trendScrollY || 0);
    return;
  }
  window.__trendScrollY = window.scrollY || 0;
  box.classList.add('full');
  document.body.classList.add('noScroll');
}

/* ★ 导出趋势图为 PNG，表头带【表格结算】（用户 2026-10-07：
     指标名 + 数据区间 + 天数 + 当前对象 + 均值/最新值，单看图不知是什么）。
   做法：SVG 序列化成图片 → 画到 canvas → 拼上表头 → 导出。
   ★ SVG 里样式全是【属性】形式（fill/stroke/font-size…），脱离页面也能正确渲染。 */
function exportTrendImage(box, label, W, H, pad, pts, m) {
  var tip = $('progText');
  var svg = box.querySelector('.tr-scroll svg') || box.querySelector('svg');
  if (!svg) { if (tip) tip.textContent = '图表尚未渲染'; return; }
  try {
    var HEADH = 58;
    var TOTW = W, TOTH = H + HEADH;
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', '0 0 ' + TOTW + ' ' + TOTH);
    clone.setAttribute('width', TOTW);
    clone.setAttribute('height', TOTH);
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    while (clone.firstChild) g.appendChild(clone.firstChild);
    g.setAttribute('transform', 'translate(0,' + HEADH + ')');   // 图表整体下移
    clone.appendChild(g);
    var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', TOTW); bg.setAttribute('height', TOTH);
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    var NS = 'http://www.w3.org/2000/svg';
    function T(x, y, t, size, fill, weight) {
      var n = document.createElementNS(NS, 'text');
      n.setAttribute('x', x); n.setAttribute('y', y);
      n.setAttribute('font-size', size); n.setAttribute('fill', fill);
      if (weight) n.setAttribute('font-weight', weight);
      n.textContent = t; clone.appendChild(n);
    }
    // ── 表头：表格结算信息 ──
    var vals = (pts || []).map(function (p) { return p[m.f]; })
      .filter(function (v) { return v != null; });
    var lvName = ({ agency: '整商', district: '商圈片', site: '站点', rider: '骑手' })[S.level] || S.level;
    var scope = S.key ? (S.keyName || S.key) : '（全部）';
    var r0 = pts && pts.length ? pts[0].date : (S.from || '');
    var r1 = pts && pts.length ? pts[pts.length - 1].date : (S.to || '');
    var fmt = function (v) {
      if (v == null) return '—';
      if (m.rate) return (v * 100).toFixed(m.dp || 2) + '%';
      if (m.f === 'score') return Number(v).toFixed(2);
      return Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : Number(v.toFixed(2));
    };
    var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
    var lastV = vals.length ? vals[vals.length - 1] : null;
    T(0, 20, label + '　·　' + lvName, 15, '#111827', 700);
    T(0, 36, '数据区间 ' + r0 + ' ~ ' + r1 + '　·　' + (pts ? pts.length : 0) + ' 天' +
        '　·　当前对象：' + scope, 11, '#6b7280');
    T(0, 51, '均值 ' + fmt(avg) + '　·　最新 ' + fmt(lastV) +
        '　·　单位：' + (m.unit || (m.rate ? '%' : '')), 11, '#b45309');
    var ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', 0); ln.setAttribute('y1', HEADH - 0.5);
    ln.setAttribute('x2', TOTW); ln.setAttribute('y2', HEADH - 0.5);
    ln.setAttribute('stroke', '#e5e7eb'); ln.setAttribute('stroke-width', 1);
    clone.appendChild(ln);

    var url = 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(new XMLSerializer().serializeToString(clone));
    var img = new Image();
    img.onload = function () {
      var dpr = 2;
      var cv = document.createElement('canvas');
      cv.width = TOTW * dpr; cv.height = TOTH * dpr;
      var gg = cv.getContext('2d');
      gg.scale(dpr, dpr);
      gg.fillStyle = '#fff'; gg.fillRect(0, 0, TOTW, TOTH);
      gg.drawImage(img, 0, 0);
      if (cv.height < 50) { if (tip) tip.textContent = '内容过高，生成失败'; return; }
      var a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = '趋势_' + label + '_' + r0 + '.png';
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); }, 1000);
      if (tip) tip.textContent = '已导出趋势图（含表格结算表头）';
    };
    img.onerror = function () { if (tip) tip.textContent = '图片生成失败'; };
    img.src = url;
  } catch (e) {
    if (tip) tip.textContent = '图片生成失败：' + ((e && e.message) || e);
  }
}

function closeTrend() {
  var b = trendBox();
  if (!b) return;
  // ★ 2026-10-22：全屏状态下直接点 ✕ 关闭时，原来只做了 b.hidden = true ——
  //   body 上的 .noScroll（overflow:hidden）没清掉、full 类也没摘，
  //   于是【整页再也滑不动】（用户实测：全屏再退出来，页面无法滑动）。
  if (b.classList.contains('full')) {
    b.classList.remove('full');
    window.scrollTo(0, window.__trendScrollY || 0);
  }
  document.body.classList.remove('noScroll');     // 幂等，非全屏时也无害
  b.hidden = true;
}

function drawTrend(label) {
  var m = T_METRICS[label];
  var pts = TREND.points || [];
  var box = trendBox();
  if (!pts.length) { box.innerHTML = '<div class="empty">该区间暂无数据</div>'; return; }
  var vals = pts.map(function (p) { return p[m.f]; }).filter(function (v) { return v != null; });
  if (!vals.length) { box.innerHTML = '<div class="empty">该指标暂无数据</div>'; return; }

  // ★ 宽度取【容器宽】与【点数所需宽】的较大者（用户 2026-10-07：电脑端图表好丑）。
  //   原来固定 max(320, 点数*40+96)，在宽屏上图表只占左侧一小块、右侧大片空白；
  //   窄屏上点数多时才需要横向滑动。
  var availW = Math.max(320, (box.clientWidth || 360) - 2);
  var needW = pts.length * 40 + 96;
  var W = Math.max(availW, needW), H = 200;
  // ★ 顶部留白要够：数值标签画在数据点【上方 8px】，最高点恰好落在 pad.t 时
  //   标签会被 SVG 上边界裁掉（用户 2026-10-07："顶部的留白要够"）。
  //   标签字高约 11px + 8px 偏移 ⇒ pad.t 至少 24 才留得住。
  var pad = { l: 44, r: 12, t: 24, b: 26 };
  var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  // ★★ 比率类指标的留白必须【按数据幅度自适应】，不能写死 2 个百分点。
  //   写死 ±0.02 时，不满意率这种【本身就只有 0.1% 量级】的指标会被压平：
  //     数据 0.000%~0.116% → 轴范围 0.000%~2.116%
  //     留白是数据幅度的 17 倍，6 天的起伏看起来是一条直线（用户 2026-10-07 反馈）。
  //   现在按幅度的 30% 留白；幅度为 0（全天都是 0）时给一个小兜底值。
  // ★★ 刻度取【整数档位】，不再按范围任意等分（用户 2026-10-07）。
  //   原来 lo+(hi-lo)*g/4 得到的是 0.529% / 1.058% 这种"随机小数"，
  //   人看着别扭、也不好读数。现在按 1-2-2.5-5-10 × 10^k 选档位，
  //   使所有刻度都落在整数（或比率的整数百分点）上。
  if (m.rate) {
    var rlo = Math.max(0, lo), rhi = Math.min(1, hi);
    if (rhi - rlo < 1e-9) { rhi = rlo + 0.001; }   // 全为0 → 给个兜底跨度
  } else {
    var s0 = (hi - lo) || Math.max(1, Math.abs(hi) * 0.1 || 1);
    lo = lo - s0 * 0.15; hi = hi + s0 * 0.15;
    if (hi - lo < 1e-9) hi = lo + 1;
  }
  var TICKS = 4;
  var step = niceStep((hi - lo) / TICKS);
  // ★★ 刻度必须用【整数格】推算，不能各算各的：
  //   原来 nlo=floor(lo/step)*step、nhi=ceil(hi/step)*step 各自取整，
  //   nhi-nlo 未必是 step 的【整数倍】；再配合 kMax=round((hi-lo)/step)
  //   就可能多画/少画一条，或最后一格间距变短
  //   （用户 2026-10-07：最下面那条网格线与刻度文字对不上）。
  //   现在：先取下界 nlo，再按【向上取整的整数格】算 nhi，保证整除。
  var nlo = Math.floor(lo / step) * step;
  var nGaps = Math.max(1, Math.ceil((hi - nlo) / step - 1e-9));
  var nhi = nlo + nGaps * step;
  if (m.rate) { nlo = Math.max(0, nlo); }
  lo = nlo; hi = nhi;
  var X = function (i) { return pad.l + (pts.length === 1 ? iw / 2 : iw * i / (pts.length - 1)); };
  var Y = function (v) { return pad.t + ih * (1 - (v - lo) / ((hi - lo) || 1)); };
  function fv(v) {
    if (v == null) return '—';
    if (m.rate) return (v * 100).toFixed(m.dp || 2) + '%';
    if (m.f === 'score') return Number(v).toFixed(2);
    return Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : Number(v).toFixed(2);
  }

  var out = ['<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" class="trendsvg">'];
  //   用户明确要求"没加滑动/全屏/导出之前对齐就很好"，

  // 网格线：按整数档位等距，不再是任意分数
  var gdec = stepDecimals(step);
  var kMax = nGaps;          // 整数格数（由上面的 nGaps 直接给出，不再用浮点 round）
  for (var g = 0; g <= kMax; g++) {
    var v = lo + step * g, y = Y(v);
    out.push('<line x1="' + pad.l + '" y1="' + y + '" x2="' + (W - pad.r) + '" y2="' + y +
      '" stroke="#eef1f6" stroke-width="1"/>');
    var lab = m.rate
      ? (v * 100).toFixed(Math.max(0, gdec - 2)) + '%'
      : Number(v.toFixed(gdec)).toString();
    // ★ 用 dominant-baseline="middle" 让文字【精确垂直居中】于网格线，
    //   而不是靠 y+3 这个经验值（字号/字体/浏览器不同就会偏几像素）。
    out.push('<text x="' + (pad.l - 5) + '" y="' + y + '" font-size="9" ' +
      'dominant-baseline="middle" fill="#9aa3af" text-anchor="end">' + lab + '</text>');
  }
  // ★ 宽屏下点数少，X 轴别全挤在左边：按可用宽度决定标签间隔，
  //   至少保证每隔 ~46px 有一个日期（否则 7 个点只占图表左侧三分之一）。
  var labelStep = 1;
  if (pts.length > 1) {
    var perPx = (W - pad.l - pad.r) / (pts.length - 1);
    labelStep = Math.max(1, Math.ceil(46 / Math.max(1, perPx)));
  }
  pts.forEach(function (p, i) {
    if (i % labelStep !== 0 && i !== pts.length - 1) return;
    //   X(0) 就在 x=0 处，anchor=middle 会有一半落在画布外被裁掉（用户 2026-10-07）。
    var da = (i === 0) ? 'start' : (i === pts.length - 1) ? 'end' : 'middle';
    out.push('<text x="' + X(i) + '" y="' + (H - 8) + '" font-size="9" fill="#9aa3af" text-anchor="' + da + '">' +
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
  // ★ 把折线拆成线段，供标签避让用（用户 2026-10-07：标签被折线压住看不清）
  var SEG = [];
  seg.forEach(function (s) {
    for (var i = 1; i < s.length; i++) {
      var a = s[i - 1].split(','), b = s[i].split(',');
      SEG.push([+a[0], +a[1], +b[0], +b[1]]);
    }
  });
  // 已占位区域（均值标签先占，数据标签后占并互相避让）
  var PLACED = [];
  function txtW(s) {                       // 估算文字宽度：中文按字号、数字约 0.6
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 9.6 : 5.9;
    return w;
  }
  // 线段与矩形是否相交（沿线采样 12 个点，够用且快）
  function hitsLine(x1, y1, x2, y2, r) {
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      if (px >= r.x - 2 && px <= r.x + r.w + 2 && py >= r.y - 2 && py <= r.y + r.h + 2) return true;
    }
    return false;
  }
  function clash(r) {
    for (var i = 0; i < SEG.length; i++) {
      var g = SEG[i];
      if (hitsLine(g[0], g[1], g[2], g[3], r)) return true;
    }
    for (var j = 0; j < PLACED.length; j++) {
      var q = PLACED[j];
      if (r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x &&
          r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y) return true;
    }
    return false;
  }
  // ★★ 平均值虚线（用户 2026-10-07）：一条橙红虚线标出算术平均，
  //   右边带一个标签。只画在【有≥2 个有效值】且落在轴范围内时。
  //   放在折线之后、点之前，保证虚线压在折线上方可见但标签不被点盖住。
  var vlist = vals.filter(function (v) { return v != null; });
  if (vlist.length >= 2) {
    var avg = vlist.reduce(function (a, b) { return a + b; }, 0) / vlist.length;
    if (avg >= lo && avg <= hi) {
      var ay = Y(avg);
      out.push('<line x1="' + pad.l + '" y1="' + ay + '" x2="' + (W - pad.r) + '" y2="' + ay +
        '" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 4"/>');
      var alab = m.rate
        ? '均 ' + (avg * 100).toFixed(Math.max(1, stepDecimals(step))) + '%'
        : '均 ' + (Math.abs(avg - Math.round(avg)) < 0.01 ? Math.round(avg) : Number(avg.toFixed(2)));
      // ★ 标签尽量【靠中间】摆（用户 2026-10-07），且不与折线重叠。
      //   原来固定贴最右端，正好压在上升段折线和末点数值上（截图里 95.46% 被糊住）。
      //   做法：沿虚线在中间区域取若干候选位，逐个测冲突，取第一个干净的位置；
      //   全都冲突时退到最右，并【上下位移】让开。
      var aw = txtW(alab), ah = 10;
      var midX = pad.l + iw * 0.5;
      // 候选位：先【正中间本身】，再 0.15/0.30/0.45 左右展开，最后最右兜底。
      //   原来写成 frac 从 0.5 起、push(midX ± iw*frac)，
      //   第一个候选就是 midX+0.5*iw（贴着右边缘），真正的中轴 0.5 反被跳过 ——
      //   于是均值标签总被挤到最右，压在折线上（用户 2026-10-07 反馈）。
      var candX = [midX], frac;
      for (frac = 0.15; frac <= 0.46; frac += 0.15) {
        candX.push(midX + iw * frac);
        candX.push(midX - iw * frac);
      }
      candX.push(W - pad.r - 2);
      var axy = ay - 5, chosen = null;
      for (var ci = 0; ci < candX.length && !chosen; ci++) {
        var cx = Math.max(pad.l + 2, Math.min(W - pad.r - 2, candX[ci]));
        // 上下各试三个位置
        var offs = [-5, -16, 9, -27, 20];
        for (var oi = 0; oi < offs.length && !chosen; oi++) {
          var r = { x: cx - aw / 2, y: ay + offs[oi] - ah, w: aw, h: ah };
          if (!clash(r)) chosen = { x: cx, y: ay + offs[oi], r: r };
        }
      }
      if (!chosen) {
        var r2 = { x: W - pad.r - 2 - aw, y: ay - 5 - ah, w: aw, h: ah };
        chosen = { x: W - pad.r - 2, y: ay - 5, r: r2 };
      }
      PLACED.push(chosen.r);
      out.push('<text x="' + chosen.x + '" y="' + chosen.y + '" font-size="9" fill="#b45309"' +
        ' text-anchor="middle" font-weight="600" stroke="#fff" stroke-width="2.4"' +
        ' paint-order="stroke">' + alab + '</text>');
    }
  }
  // ★ 点 + tooltip + 【每点数值标签】
  //   点少时全标；点多时隔点标，避免挤成一团互相遮挡。
  //   标签画在点的【正上方】，折线不会压住文字；且用白描边保证叠在网格线上也清晰。
  var stepLbl = pts.length <= 12 ? 1 : Math.ceil(pts.length / 10);
  pts.forEach(function (p, i) {
    var v = p[m.f]; if (v == null) return;
    out.push('<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="2.6" fill="#1f6feb">' +
      '<title>' + p.date + '  ' + esc(m.label) + ' ' + fv(v) + m.unit + '</title></circle>');
    if (i % stepLbl !== 0 && i !== pts.length - 1) return;
    // ★ 标签避让：默认在点上方；与折线/均值标签/其他标签冲突就上下挪。
    //   用户 2026-10-07：数值压在折线上、彼此叠在一起都看不清。
    var txt = fv(v), tw = txtW(txt), th = 11, lx = X(i);
    var anchor = 'middle';
    if (i === pts.length - 1) { anchor = 'end'; lx = Math.min(lx, W - pad.r - 1); }
    else if (i === 0) { anchor = 'start'; lx = Math.max(lx, pad.l - 20); }
    var bx = anchor === 'end' ? lx - tw : anchor === 'start' ? lx : lx - tw / 2;
    var offs = [-8, 15, -19, 26, -30, 37];
    // ★ 别压到 X 轴日期行（用户 2026-10-07：数值叠在 10-02/10-06 上）。
    //   绘图区底部 = H - pad.b，标签底边不能越过它。
    var bottomLimit = H - pad.b - 2;
    var topLimit = 3;          // 标签顶边距画布顶至少 3px（不被裁即可）
    var put = null;
    for (var oi = 0; oi < offs.length && !put; oi++) {
      var ty = Y(v) + offs[oi];
      if (ty - th < topLimit || ty + 2 > bottomLimit) continue;   // 越界，换一档
      var r = { x: bx, y: ty - th, w: tw, h: th };
      if (!clash(r)) put = { y: ty, r: r };
    }
    if (!put) { put = { y: Y(v) - 8, r: { x: bx, y: Y(v) - 8 - th, w: tw, h: th } }; }
    PLACED.push(put.r);
    out.push('<text x="' + lx + '" y="' + put.y + '" font-size="10" font-weight="600"' +
      ' fill="#1f6feb" text-anchor="' + anchor + '" stroke="#fff" stroke-width="2.6"' +
      ' paint-order="stroke">' + txt + '</text>');
  });
  out.push('</svg>');

  // ★★★ 滑动【仅在数据太挤时启用】（用户 2026-10-07 明确要求）
  //   判定：按点数算出的"不挤"宽度 > 容器宽度 ⇒ 点太多、横向放不下 ⇒ 才开滚动。
  //   实现只用 overflow-x:auto，【不动 SVG 坐标系、不拆 SVG、不改任何样式】——
  //   所以没触发滑动的场景，显示与现在【完全一致】。
  //   判定要【两个条件同时满足】（用户 2026-10-07："超过7天没触左右滑动"）：
  //     ① 天数 > 7      —— 7 天及以内怎么都放得下，不该出现滚动条
  //     ② 需要的宽度 > 容器宽 —— 宽屏上 30 天也可能装得下，那就不必滑
  //   只用 needW > availW 的话，手机上 7 天（376 vs 360px）就会误触发。
  var needW = pts.length * 40 + 96;
  // ★ 可用宽度取【父容器】而不是 trendBox 自己：trendBox 在未展开/未布局时
  //   clientWidth 会是 0（本地实测整条祖先链都是 0），回退到硬编码 360
  //   在真实手机上必然不准 —— 平板 800px 时就会误判成"很挤"。
  var host = box.parentElement || box;
  var availW = host.clientWidth || box.clientWidth || 0;
  // ★★★ 布局未就绪（clientWidth=0）时，必须回退到【一个"不挤"的默认宽】，
  //   而不能回退到 needW —— 那会让 crowded = needW > needW = false，
  //   37 天的长图永远不加 .on、不滑动（用户 2026-10-07 实测：37天无滚动条）。
  //   回退 360：此时判定为"可能挤"，再交给下方 rAF 复核用真实宽度收尾。
  if (!availW) availW = 360;
  var crowded = pts.length > 7 && needW > availW;
  var head = '<div class="tr-head"><b>' + esc(label) + '</b>' +
    '<span class="hint">' + pts.length + ' 天 · ' + pts[0].date + ' ~ ' + pts[pts.length - 1].date +
    (crowded ? '　·　可左右滑动' : '') + '</span>' +
    '<button class="mini tr-act" data-trfull title="全屏">⛶</button>' +
    '<button class="mini tr-act" data-trimg title="导出图片">⬇</button>' +
    '<button class="mini tr-close">✕</button></div>';
  box.innerHTML = head +
    '<div class="tr-scroll' + (crowded ? ' on' : '') + '">' + out.join('') + '</div>';
  // ★ 布局完成后【复核】滑动：drawTrend 可能在布局未就绪时跑（clientWidth=0），
  //   首屏判断可能漏开滑动。这里用 requestAnimationFrame 等真实布局算完再复查一次，
  //   —— 否则 37 点的长图也会因为初始 clientWidth=0 而不触发滚动（用户 2026-10-07）。
  (function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var wrap = box.querySelector('.tr-scroll');
        var svgEl = box.querySelector('.tr-scroll svg');
        if (!wrap || !svgEl) return;
        var need = +svgEl.getAttribute('width') || needW;
        // ★ real 必须取【盒子可见宽度】，不能取 wrap.clientWidth：
        //   .tr-scroll 里只有那个 SVG，子元素比它宽时 clientWidth 会跟着
        //   撑到 1576（inline 子元素撑开父级），need>real 就永远为假，
        //   滑动条永远加不上。真正决定"要不要滑"的是【可见区域宽】。
        var real = box.clientWidth || host.clientWidth || 0;
        var on = pts.length > 7 && need > real;
        wrap.classList.toggle('on', on);
        var hintEl = box.querySelector('.tr-head .hint');
        if (hintEl) hintEl.textContent = pts.length + ' 天 · ' +
          (pts.length ? pts[0].date + ' ~ ' + pts[pts.length - 1].date : '') +
          (on ? '　·　可左右滑动' : '');
      });
    });
  })();
  box.querySelector('.tr-close').onclick = function (e) { e.stopPropagation(); closeTrend(); };
  var fb = box.querySelector('[data-trfull]');
  if (fb) fb.onclick = function (e) { e.stopPropagation(); toggleTrendFull(box); };
  var ib = box.querySelector('[data-trimg]');
  if (ib) ib.onclick = function (e) {
    e.stopPropagation();
    exportTrendImage(box, label, W, H, pad, pts, m);
  };
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

/* ★ 骨架屏：等 /api/metrics（~0.3s，弱网更久）时先把卡片位占住，
   避免"加载中…"一行字 → 6 张卡片 的跳版。 */
function skCards(n) {
  var one = '<div class="sk-card"><div class="sk sk-k"></div>' +
            '<div class="sk sk-v"></div><div class="sk sk-d"></div></div>';
  var h = '';
  for (var i = 0; i < (n || 6); i++) h += one;
  return h;
}

/* withList=false 时不重渲列表 —— 点对象时列表内容没变，重复渲会把选中态闪掉。 */
function loadCards(dfrom, dto, withList) {
  var r = computeRange();
  dfrom = dfrom || r[0]; dto = dto || r[1];
  var aq = ACCT ? 'acct=' + q(ACCT) + '&' : '';
  $('cards').innerHTML = skCards(6);
  var keyq = S.key ? '&key=' + q(S.key) : '';
  // ★ 记住发起请求时的层级：切维度是异步的，快速连点时旧响应可能后到。
  //   原来不校验，于是「整商」的响应在用户已切到「骑手」后渲染列表：
  //       listTitle 按【当前 S.level】写成"骑手明细"，
  //       内容却是【整商那 1 行】，工具条显示"显示 1 / 1 人"。
  //   导出图片时就把它当骑手明细导了出去（用户 2026-10-06 实测）。
  var reqLevel = S.level, reqKey = S.key;
  return api('/api/metrics?' + aq + 'level=' + reqLevel + '&from=' + dfrom + '&to=' + dto + keyq)
    .then(function (j) {
      // 响应回来时用户已经切走/点了别的对象 → 直接丢弃，别污染当前视图
      if (reqLevel !== S.level || reqKey !== S.key) return null;
      LAST_TOTAL = j.total || {};
      renderCards(j.total);
      // ★ 本地指标到达后同步给罗盘，让「平台 / 我算」两列都能显示 ——
      //   罗盘接口要 2.4 秒，比 metrics 慢，两者到达时间不同。
      if (S.level === 'agency' && Object.keys(RT_PLAT).length) {
        renderRt();
      }
      if (withList) {
        // ★★ 只有这里的数据是【权威全量】，所以只有这里能改写 LAST_ROWS。
        // ★★ 数据指纹变了才把版本号 +1（并让得分作废重算）。
        //   /api/metrics 每次切维度、切日期、每 10 分钟的自动同步都会调用，
        //   若无条件 +1，就会在数据没变时也重算一遍全量得分（白等 1 秒多）。
        //   变了才作废，正好对应"分数又更新了 → 刷新排序"（用户 2026-10-07）。
        var fp = rowsFingerprint(j.rows || []);
        if (fp !== _lastRowsFp) {
          _lastRowsFp = fp;
          DATA_VER++;
          SCORE_SIG = '';        // 显式作废，下面 renderList 会触发全量重算
        }
        renderList(j.rows || [], true);
      }
      return j;
    })
    .catch(function (e) {
      // ★ 出错要能自救：原来只有一行错误文字，用户只能整页刷新
      $('cards').innerHTML = '<div class="empty">' + esc(e.message) +
        '<br><button class="mini" style="margin-top:8px" onclick="loadAll()">重试</button></div>';
    });
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
  // ★★ 只有【口径相同】的平台指标才配本地值。配错 = 显示一个根本不该存在的差值。
  //   实测（2026-10-10 18:xx 同刻）：
  //     平台 预测T8准时率   = 97.20%   ← 考核口径，README/考核评分口径.md 的公式与 t8 逐字一致
  //     平台 骑手准时送达率 = 96.92%   ← 平台【实时】口径，跟考核 t8 不是一回事
  //     我们 t8 考核口径    = 3214 / 3281 = 97.96%
  //   ⇒ t8 只跟「预测T8准时率」对；「骑手准时送达率」本地无对应，不给值
  //     （原来两个都挂 t8，等于拿一个值去对两个不同指标，必然有一个假差）。
  //   妥投率同理：平台另给了【物流妥投率】99.91%（对应我们的 likt 99.97%），
  //     而「妥投率」97.77% 是另一种口径 → 只留给物流妥投率。
  var MINE = {
    complete_order_count: function (t) { return t.orders; },
    wl_complete_order_rate: function (t) { return t.likt; },
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
    complete_order_rate: '妥投率',
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
  // ★ 0~1 的比率字段全登记 —— 漏登记的会走「绝对值差 ≥1 才算不一致」的分支，
  //   于是永远显示「一致」（predict_t8 曾经漏登记，0.972 vs 0.979 的 0.76pp 被吞掉）。
  var isRate = { complete_order_rate: 1, wl_complete_order_rate: 1,
                 driver_t_ontime_rate: 1, predict_t8_ontime_rate: 1,
                 complain_order_rate: 1, bad_rating_order_rate: 1,
                 illegal_operation_order_rate: 1, bad_weather_final_order_rate: 1 };

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
/* ★ 骑手管理（见文件末尾模块）：整屏覆盖，打开时按需拉 /api/hr */
$('btnHr').onclick = function () { hrOpen(); };
$('btnFin').onclick = function () { finOpen(); };
$('finClose').onclick = function () { finClose(); };
$('finSync').onclick = function () { finSync(); };
$('finRule').onclick = function () { finRuleOpen(); };
$('finRuleClose').onclick = function () { finRuleClose(); };
$('finRuleSave').onclick = function () { finRuleSave(); };
$('hrClose').onclick = function () { hrClose(); };
$('hrSync').onclick = function () { hrSync(); };
$('abnClose').onclick = function () { $('abnModal').hidden = true; };
$('abnModal').onclick = function (e) { if (e.target === this) this.hidden = true; };
/* ★ 2026-10-18：手机上「点了添加没反应」的兜底。
   真机反馈：号码明明填了，点按钮却提示"请填手机号和密码" —— 典型的
   「值还在输入法缓冲区 / 浏览器自动填充只画了字没写进 value」。
   这里 ① 用 input/change 事件把值实时同步到 ADD，按钮读不到 value 时回退用它；
        ② 点击前先 blur()，强制把输入法的候选内容上屏。 */
var ADD = {a: '', p: ''};
(function () {
  function bind(id, k) {
    var el = $(id);
    if (!el) return;
    ['input', 'change', 'blur'].forEach(function (ev) {
      el.addEventListener(ev, function () { ADD[k] = el.value; });
    });
  }
  bind('newAcc', 'a'); bind('newPwd', 'p');
})();
$('btnAdd').onclick = function () {
  var elA = $('newAcc'), elP = $('newPwd');
  if (elA) elA.blur();
  if (elP) elP.blur();
  var a = String((elA && elA.value) || ADD.a || '').trim();
  var p = String((elP && elP.value) || ADD.p || '');
  if (!a || !p) {
    $('cfgStatus').textContent = (!a ? '请填风神登录手机号' : '请填密码') +
      '（如果框里已经有字，点一下输入框再点按钮）';
    if (!a && elA) elA.focus(); else if (elP) elP.focus();
    return;
  }
  $('cfgStatus').textContent = '创建账号…';
  api('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: a, password: p }) })
    .then(function () { ADD.p = ''; $('newPwd').value = ''; return loadAccounts(); })
    .then(function () {
      $('cfgStatus').textContent = '账号已保存，正在启动后端登录…';
      doLogin(a, p);
    })
    // ★ 2026-10-18：原来这里【没有 catch】—— 请求一失败（网关 502 / 会话过期 / 后端 500）
    //   整条 Promise 链静默断掉，界面上什么都不会变，看起来就是「点了按钮没反应」。
    .catch(function (e) {
      $('cfgStatus').textContent = '✗ 账号保存失败：' + ((e && e.message) || e);
    });
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
    $('lgMsg').textContent = '接口暂时连不上（已自动重试 2 次）：' +
      (e.message || e) + ' —— 请再点一次登录，或换个网络';
  });
})();

/* ── 账号 ─────────────────────────────────────────────────────────── */
/* 自动重登需要验证码 → 弹窗（同一张图只弹一次，避免每次轮询都弹） */
function maybeCaptcha(a) {
  if (!a || a.status !== 'need_captcha' || !a.captchaB64) return;
  var sig = a.id + ':' + (a.captchaSid || '') + ':' + a.captchaB64.length;
  if (window.__capSig === sig) return;
  window.__capSig = sig;
  LOGIN.sid = a.captchaSid || null;
  LOGIN.account = a.account || '';
  $('capImg').src = 'data:' + (a.captchaMime || 'image/png') + ';base64,' + a.captchaB64;
  $('capMsg').textContent = '自动重登需要验证码（' + (a.accountMask || a.account || '') +
    '），请输入图中字符';
  $('capCode').value = '';
  $('capModal').hidden = false;
}

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
    // ★ 2026-10-18：自动重登撞到验证码时，后端把图和 sid 存在账号记录里。
    //   这里发现 need_captcha 就自动弹窗 —— 不弹的话用户只知道「自动重登失败」，
    //   却没有任何地方能输验证码。
    (j.list || []).forEach(maybeCaptcha);
    return j;
  });
}

function doLogin(account, password, id) {
  if (!TOKEN || $('appView').hidden) { showLogin(false); return; }
  $('cfgStatus').textContent = '正在启动无头浏览器登录 ' +
    (account || id || '') + ' …（约 20-40 秒）';
  // ★ id 优先：账号卡片上的 account 是脱敏的（18*******56），拿它当账号会算出一个新 id
  api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: account, password: password, id: id || '' }) })
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
      (a.status === 'ok' ? '<span class="g">登录态✓</span>' : '<span class="r">未登录</span>') +
      // ★ 2026-10-18：没有存密码 = 自动重登这条链彻底断了（relogin 第一行就 return None）。
      //   必须让人一眼看到，否则只会看到「自动重登失败」却不知道为什么。
      (!a.hasPassword ? ' · <span class="r">没存密码，无法自动重登</span>' : '') + '</div></div>' +
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
        // ★ 2026-10-18：从旧配置恢复出来的账号可能【没有密码】(hasPassword=false)，
        //   这时点「登录」后端必然回「缺少账号或密码」，白等 30 秒。
        //   直接引导去下面的新增表单重填一次，upsert 会命中同一个 id，cookie 不会丢。
        if (a && !a.hasPassword) {
          // ★ 2026-10-18：记录里没密码（账号文件被清空后恢复出来的），
          //   这里直接问一次密码 → 存进同一条记录 → 立刻登录。
          //   不用再去填下面那个表单（手机号是脱敏的，填错反而会新建一个账号）。
          var pw = prompt('请输入 ' + (a.accountMask || '该账号') + ' 的风神登录密码\n' +
                          '（保存后，以后 Cookie 掉了后台就能自动重登）');
          if (!pw) return;
          $('cfgStatus').textContent = '正在保存密码…';
          api('/api/accounts/password', { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id, password: pw }) })
            .then(function () { return loadAccounts(); })
            .then(function () { doLogin(a.account, pw, a.id); })
            .catch(function (e) {
              $('cfgStatus').textContent = '✗ 保存密码失败：' + ((e && e.message) || e);
            });
          return;
        }
        doLogin(a.account, null, a.id);
      } else if (act === 'del') {
        if (!confirm('删除该风神账号？')) return;
        api('/api/accounts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
          .then(function () { return loadAccounts(); }).then(function () { loadAll(); });
      }
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   骑手管理模块（2026-10-14）
   ───────────────────────────────────────────────────────────────────────────
   两个数据源都在风神体系内，由后端 backend/hr.py 同步入库：
     ① 骑手名册 = 风神-成员管理（targetId 61068）
        → xtop.ryze.fs.knight.entry.listByPage（626 人；平台单批会返重复行，已去重）
     ② 三方人资招聘明细 = 人资综合服务-招聘数据看板（targetId 66628 → fearow #/fbi
        → Quark 报表 resourceId=1986382，近 12 个月）
        → 报表在 quark.alibaba.com，令牌一次性 + 取数 body 是 guid 编码，
          只能开浏览器渲染再点组件自带的「复制数据」（见 backend/hr_quark.py）

   接口：GET /api/hr?part=all|summary|staff|leads
        POST /api/hr/sync（后台线程跑，约 3~4 分钟）
   ═══════════════════════════════════════════════════════════════════════════ */
var HR = {tab: 'staff', busy: false, data: null,
          // ★ 名册默认看【在职】（用户指定）；下拉一改就立刻生效，不必再点「筛选」
          filt: {status: '1', dept: '', kw: ''},
          // 线索明细自己的筛选：entry='已入职'/'未入职'，onjob=只看目前在职
          lfilt: {entry: '', onjob: false, kw: ''}};

var HR_STATUS = {'1': '在职', '2': '已离职', '3': '待入职', '4': '已拒绝'};

function hrOpen() {
  $('hrView').hidden = false;
  if (!HR.data) hrLoad(); else hrRender();
}
function hrClose() { $('hrView').hidden = true; }

function hrNum(v, d) {
  if (v == null || v === '' || isNaN(v)) return '—';
  var n = Number(v);
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(d == null ? 2 : d);
}
function hrPct(v) { return (v == null || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(2) + '%'; }
function hrAgo(sec) {
  if (sec == null) return '未同步';
  if (sec < 90) return '刚刚';
  if (sec < 3600) return Math.round(sec / 60) + ' 分钟前';
  if (sec < 86400) return Math.round(sec / 3600) + ' 小时前';
  return Math.round(sec / 86400) + ' 天前';
}

function hrLoad() {
  if (HR.busy) return;
  HR.busy = true;
  HR.leadsAll = null;
  $('hrState').textContent = '加载中…';
  // ★ 首次就带上名册的默认筛选（默认「在职」），否则拿回来的 626 行和下拉显示的
  //   「在职」对不上 —— 看起来又像筛选没生效。
  api('/api/hr?part=all' +
      '&status=' + encodeURIComponent(HR.filt.status) +
      '&dept=' + encodeURIComponent(HR.filt.dept) +
      '&kw=' + encodeURIComponent(HR.filt.kw) +
      '&acct=' + encodeURIComponent(ACCT || ''))
    .then(function (j) {
      HR.busy = false;
      if (!j || j.ok === false) { $('hrState').textContent = '加载失败'; return; }
      HR.data = j;
      HR.leadsAll = j.leads || [];      // ★ 线索本地过滤的全量底表
      $('hrState').textContent = '';
      hrRender();
    })
    .catch(function (e) {
      HR.busy = false;
      $('hrState').textContent = '加载失败：' + e;
    });
}

function hrSync() {
  if (HR.busy) return;
  HR.busy = true;
  $('hrState').textContent = '已触发同步（名册 + 招聘明细，约 3~4 分钟）…';
  api('/api/hr/sync', {method: 'POST', headers: {'Content-Type': 'application/json'},
                       body: JSON.stringify({acct: ACCT || ''})})
    .then(function () {
      setTimeout(function () { HR.busy = false; $('hrState').textContent = ''; hrLoad(); }, 200000);
    })
    .catch(function (e) { HR.busy = false; $('hrState').textContent = '同步触发失败：' + e; });
}

function hrRender() {
  var d = HR.data || {};
  var s = d.summary || {}, m = d.month || {};
  // ★ 顶部卡片统一按【本月】口径（用户 2026-10-15 指定）。
  //   「N天有效留存数」= 有效留存天数 >= N 的累计人数（已用线索明细逐条验证：
  //    >=7 → 19、>=15 → 16，与报表的 7天/15天有效留存数完全一致）；
  //   「入职满N天数」是【在职天数】口径（不要求达标），两者不能并列，
  //   并列会看成"7天留存 < 15天留存"。
  var cards = [
    ['在职骑手', hrNum(s.onJob), '人', '名册总数 ' + hrNum(s.total) + ' 人（含已离职）'],
    ['本月入职', hrNum(s.joinedThisMonth), '人',
     '本月离职 ' + hrNum(s.leftThisMonth) + ' 人 · 三方入职 ' + hrNum(m.hires) +
     ' 人 · 离职骑手 ' + hrNum(s.leftTotal) + ' 人'],
    ['本月线索', hrNum(m.leads), '条',
     '三方人资 · 面试 ' + hrNum(m.interviews) + ' · 入职 ' + hrNum(m.hires)],
    // ★ 口径提示（2026-10-17）：这个「全渠道入职」来自【招聘报表】（Quark），
    //   统计的是走招聘系统归档到该月的入职；上面「本月入职」来自【HR 名册】
    //   （entry_time 落在本月的人，含直接到站报名/复职/站间调动）。
    //   两个数天然对不上（实测 17 vs 21），不写清楚会被当成数据错了。
    ['三方入职占比', hrPct(m.hireRatio), '',
     '全渠道入职 ' + hrNum(m.hiresAll) + ' 人（招聘系统口径）'],
    ['7天有效留存', hrNum(m.r7), '人',
     '7天留存率 ' + hrPct(m.r7Rate) + ' · 15天有效留存 ' + hrNum(m.r15) +
     '（' + hrPct(m.r15Rate) + '）']
    // ★ 「线索明细 N 条」这张卡删掉了（用户 2026-10-15）：上面的「本月线索」
    //   已经是同一个月的条数，两张卡说的是同一件事。
  ];
  $('hrCards').innerHTML = cards.map(function (c) {
    return '<div class="hr-card"><div class="hr-k">' + esc(c[0]) + '</div>' +
           '<div class="hr-v">' + esc(c[1]) + '<span class="hr-u">' + esc(c[2]) + '</span></div>' +
           '<div class="hr-s">' + esc(c[3]) + '</div></div>';
  }).join('');

  var sy = d.sync || {}, rec = d.recruit || {};
  var rng = (rec.months && rec.months.length) ? rec.months[0] : {};
  $('hrMeta').innerHTML = '名册同步：' + hrAgo(sy.staff && sy.staff.ageSec) +
    (sy.staff && sy.staff.msg ? ' <span class="r">' + esc(sy.staff.msg) + '</span>' : '') +
    ' · 招聘明细同步：' + hrAgo(sy.recruit && sy.recruit.ageSec) +
    (rng.rangeFrom ? ' · 明细区间 ' + esc(rng.rangeFrom) + '~' + esc(rng.rangeTo) +
      '（卡片=本月）' : '') +
    (sy.recruit && sy.recruit.msg ? ' <span class="r">' + esc(sy.recruit.msg) + '</span>' : '');

  hrRenderTab();
}

function hrSwitch(tab) {
  HR.tab = tab;
  Array.prototype.forEach.call($('hrTabs').querySelectorAll('button'), function (b) {
    b.className = b.getAttribute('data-t') === tab ? 'on' : '';
  });
  hrRenderTab();
}

function hrRenderTab() {
  var d = HR.data || {};
  if (HR.tab === 'staff') return hrRenderStaff(d);
  if (HR.tab === 'recruit') return hrRenderRecruit(d);
  return hrRenderLeads(d);
}

/* ── 名册 ─────────────────────────────────────────────────────────────── */
function hrRenderStaff(d) {
  var sites = d.sites || [];
  var opts = ['<option value="">全部站点（' + hrNum((d.summary || {}).total) + ' 人）</option>']
    .concat(sites.map(function (x) {
      return '<option value="' + esc(x.deptId) + '"' +
        (String(HR.filt.dept) === String(x.deptId) ? ' selected' : '') + '>' +
        esc(x.deptName) + '（在职 ' + x.onJob + ' / 共 ' + x.n + '）</option>';
    }));
  var st = HR.filt.status;
  var stSel = ['all', '1', '2'].map(function (v) {
    var lbl = v === 'all' ? '全部状态' : (HR_STATUS[v] || v);
    return '<option value="' + v + '"' + (st === v ? ' selected' : '') + '>' + lbl + '</option>';
  }).join('');

  $('hrBody').innerHTML =
    '<div class="hr-filter">' +
      '<select id="hrSt">' + stSel + '</select>' +
      '<select id="hrDep">' + opts.join('') + '</select>' +
      '<input id="hrKw" placeholder="姓名 / 手机 / 站点" value="' + esc(HR.filt.kw) + '">' +
      '<button id="hrGo" class="hr-btn">筛选</button>' +
      '<span class="hint" id="hrSMsg">显示 <b>' + hrNum((d.staff || []).length) + '</b> 人</span>' +
    '</div>' +
    '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>姓名</th><th>手机</th><th>属性</th><th>状态</th><th>站点</th><th>入职时间</th><th>离职时间</th><th>身份证</th>' +
    '</tr></thead><tbody>' +
    (d.staff || []).map(function (x) {
      var cls = x.workStatus === 1 ? '' : ' class="hr-off"';
      return '<tr' + cls + '><td>' + esc(x.name) + '</td><td>' + esc(x.mobile) + '</td>' +
        '<td>' + (x.workType === 0 ? '全职' : x.workType === 1 ? '兼职' : '—') + '</td>' +
        '<td>' + esc(HR_STATUS[String(x.workStatus)] || x.workStatus) + '</td>' +
        '<td>' + esc(x.deptName) + '</td>' +
        '<td>' + esc((x.entryTime || '').slice(0, 16)) + '</td>' +
        '<td>' + esc((x.leaveTime || '').slice(0, 16) || '—') + '</td>' +
        '<td class="hr-dim">' + esc(x.idNumber) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';

  // ★ 改成【改一下就生效】：原来必须先点「筛选」，下拉选了没反应，看起来就像筛选坏了。
  var stEl = $('hrSt'), dpEl = $('hrDep'), kwEl = $('hrKw');
  function hrApplyStaff() {
    HR.filt.status = stEl.value;
    HR.filt.dept = dpEl.value;
    HR.filt.kw = (kwEl.value || '').trim();
    hrFilterStaff();
  }
  stEl.onchange = hrApplyStaff;
  dpEl.onchange = hrApplyStaff;
  var kwT = null;
  kwEl.oninput = function () { clearTimeout(kwT); kwT = setTimeout(hrApplyStaff, 400); };
  $('hrGo').onclick = hrApplyStaff;
}

function hrFilterStaff() {
  var q = '/api/hr?part=staff&status=' + encodeURIComponent(HR.filt.status) +
          '&dept=' + encodeURIComponent(HR.filt.dept) +
          '&kw=' + encodeURIComponent(HR.filt.kw) + '&limit=2000' +
          '&acct=' + encodeURIComponent(ACCT || '');
  // ★ 反馈写在筛选条里（#hrSMsg）—— 原来写在页面最顶部的 #hrState，
  //   用户滚到表格下面点「筛选」，出错/加载中都看不见，就像按钮没反应。
  var msg = $('hrSMsg');
  if (msg) msg.textContent = '筛选中…';
  $('hrState').textContent = '筛选中…';
  api(q).then(function (j) {
    HR.data.staff = (j && j.staff) || [];
    $('hrState').textContent = '';
    hrRenderStaff(HR.data);
  }).catch(function (e) {
    $('hrState').textContent = '';
    if ($('hrSMsg')) $('hrSMsg').textContent = '筛选失败：' + e;
  });
}

/* ── 三方人资月维度 ───────────────────────────────────────────────────── */
function hrRenderRecruit(d) {
  var ms = ((d.recruit || {}).months) || [];
  var agg = ms.filter(function (m) { return m.ym === ''; });
  var rows = ms.filter(function (m) { return m.ym !== ''; });
  $('hrBody').innerHTML =
    '<div class="hint">每行 = 站点 × 招聘年月；「人资渠道」= 三方人资服务商推来的线索/面试/入职。' +
    '数据由风神「招聘数据看板」按月汇总（近 12 个月）。</div>' +
    (agg.length ? '<div class="hr-agg">区间合计（' + esc(agg[0].rangeFrom) + '~' + esc(agg[0].rangeTo) + '）：' +
      '线索 ' + hrNum(agg[0].leads) + ' · 面试 ' + hrNum(agg[0].interviews) +
      ' · 入职 ' + hrNum(agg[0].hires) + ' · 全渠道入职 ' + hrNum(agg[0].hiresAll) +
      ' · 入职占比 ' + hrPct(agg[0].hireRatio) + ' · 结算率 ' + hrPct(agg[0].settleRate) +
      ' · 7天留存 ' + hrNum(agg[0].r7) + '（' + hrPct(agg[0].r7Rate) + '）' +
      ' · 15天留存 ' + hrNum(agg[0].r15) + '（' + hrPct(agg[0].r15Rate) + '）</div>' : '') +
    '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>年月</th><th>站点</th><th>缺口</th><th>线索</th><th>面试</th><th>入职</th>' +
      '<th>全渠道入职</th><th>入职占比</th><th>结算率</th><th>满10天</th>' +
      '<th>7天留存</th><th>7天留存率</th><th>满15天</th><th>15天留存</th><th>15天留存率</th>' +
    '</tr></thead><tbody>' +
    rows.map(function (m) {
      return '<tr><td>' + esc(m.ym) + '</td><td>' + esc(m.siteName || m.siteId) + '</td>' +
        '<td>' + hrNum(m.gap) + '</td><td>' + hrNum(m.leads) + '</td>' +
        '<td>' + hrNum(m.interviews) + '</td><td>' + hrNum(m.hires) + '</td>' +
        '<td>' + hrNum(m.hiresAll) + '</td><td>' + hrPct(m.hireRatio) + '</td>' +
        '<td>' + hrPct(m.settleRate) + '</td><td>' + hrNum(m.d10) + '</td>' +
        '<td>' + hrNum(m.r7) + '</td><td>' + hrPct(m.r7Rate) + '</td>' +
        '<td>' + hrNum(m.d15) + '</td><td>' + hrNum(m.r15) + '</td>' +
        '<td>' + hrPct(m.r15Rate) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    (rows.length ? '' : '<div class="hint">还没有招聘明细。点右上角「同步」拉取（约 3~4 分钟）。</div>');
}

/* ── 线索明细 ─────────────────────────────────────────────────────────── */
function hrRenderLeads(d) {
  // ★ 线索明细是「全量小表」（近12个月 46 条），直接【本地过滤】——
  //   原先前端每次都发一次 /api/hr?part=leads 再重渲染，只要那次请求慢/失败
  //   （错误又只写在页面最顶部的 #hrState，滚到表格时根本看不见），
  //   用户看到的就是「筛选按钮不能用」。本地过滤是同步的，不可能失败。
  if (!HR.leadsAll) HR.leadsAll = d.leads || [];
  var all = HR.leadsAll;
  var s = d.leadSummary || {};
  var f = HR.lfilt;
  var ls = all.filter(function (x) {
    if (f.onjob && !x.onJob) return false;
    if (!f.onjob && f.entry && x.entryStatus !== f.entry) return false;
    if (f.kw) {
      var blob = (x.riderName || '') + '|' + (x.humanName || '') + '|' + (x.leadId || '');
      if (blob.indexOf(f.kw) < 0) return false;
    }
    return true;
  });
  var cur = f.onjob ? 'onjob' : (f.entry || '');
  var opts = [
    ['', '全部（' + hrNum(s.total) + '）'],
    ['已入职', '已入职（' + hrNum(s.hired) + '）'],
    ['未入职', '未入职（' + hrNum(s.notHired) + '）'],
    ['onjob', '目前在职（' + hrNum(s.onJob) + '）']
  ].map(function (o) {
    return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' +
      esc(o[1]) + '</option>';
  }).join('');

  $('hrBody').innerHTML =
    '<div class="hr-filter">' +
      '<select id="hrLE">' + opts + '</select>' +
      '<input id="hrLK" placeholder="骑手 / 人资商 / 线索id" value="' + esc(f.kw) + '">' +
      '<button id="hrLG" class="hr-btn">筛选</button>' +
      '<span class="hint" id="hrLMsg">显示 <b>' + hrNum(ls.length) + '</b> 条 · ' +
      '按<b>有效留存天数正序</b>（— 等无数据排最后）</span>' +
    '</div>' +
    '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>线索日期</th><th>骑手</th><th>是否在职</th><th>人资商</th><th>面试状态</th>' +
      '<th>入职状态</th><th>入职时间</th><th>有效留存天数</th><th>总完单数</th><th>推送站点</th>' +
    '</tr></thead><tbody>' +
    ls.map(function (x) {
      var onJob = x.onJob ? '<span class="g">在职</span>' : (x.entryStatus === '已入职'
        ? '<span class="r">已离职</span>' : '—');
      return '<tr><td>' + esc(x.leadDate) + '</td><td>' + esc(x.riderName) + '</td>' +
        '<td>' + onJob + '</td><td>' + esc(x.humanName) + '</td>' +
        '<td>' + esc(x.interviewStatus) + '</td>' +
        '<td>' + esc(x.entryStatus) + '</td>' +
        '<td>' + esc((x.entryAt || '').slice(0, 16) || '—') + '</td>' +
        '<td>' + esc(x.remainDays || '—') + '</td><td>' + esc(x.ordersTotal || '—') + '</td>' +
        '<td>' + esc(x.pushSiteName || '') + '</td></tr>';
    }).join('') +
    '</tbody></table></div>' +
    (ls.length ? '' : '<div class="hint">没有符合条件的线索。</div>');

  var el = $('hrLE'), kwEl = $('hrLK'), btn = $('hrLG');
  // ★ 改一下就生效：下拉直接触发；关键词按 500ms 防抖；回车也立刻查。
  //   「筛选」按钮保留，且一定要能点（.hr-btn 放大了触控区域）。
  function hrApplyLeads() {
    var v = el.value;
    HR.lfilt.onjob = (v === 'onjob');
    HR.lfilt.entry = (v === 'onjob' ? '' : v);
    HR.lfilt.kw = (kwEl.value || '').replace(/^\s+|\s+$/g, '');
    hrRenderLeads(HR.data || {});      // 纯本地，同步完成
  }
  if (el) el.onchange = hrApplyLeads;
  if (kwEl) {
    kwEl.onkeydown = function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) { hrApplyLeads(); return false; }
    };
    var t = null;
    kwEl.oninput = function () { clearTimeout(t); t = setTimeout(hrApplyLeads, 500); };
  }
  if (btn) btn.onclick = hrApplyLeads;
}


/* ═══════════════════════════════════════════════════════════════════════════
   财务模块（2026-10-22）
   ───────────────────────────────────────────────────────────────────────────
   数据源：风神「财务管理 → 骑手账单管家」的 xTop 接口
     xtop.lpd.price.mng.zsSalaryBillQueryFs.pageQuerySalaryBill
   后端 backend/finance.py 每天 09:00 由 cron 导出最新月份入库，
   前端点「导出」= POST /api/fin/sync 手动再抓一次。
   三个维度：整商 / 商圈片 / 骑手。
═══════════════════════════════════════════════════════════════════════════ */
var FIN = {tab: 'agency', data: null, busy: false, kw: ''};

function finOpen() {
  $('finView').hidden = false;
  if (!FIN.data) finLoad(); else finRender();
}
function finClose() { $('finView').hidden = true; }

function finMoney(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function finLoad() {
  if (FIN.busy) return;
  FIN.busy = true;
  $('finState').textContent = '加载中…';
  api('/api/fin?acct=' + encodeURIComponent(ACCT || ''))
    .then(function (j) {
      FIN.busy = false;
      if (!j || j.ok === false) {
        $('finState').textContent = j && j.error ? j.error : '加载失败';
        return;
      }
      FIN.data = j;
      $('finState').textContent = '';
      finRender();
    })
    .catch(function (e) {
      FIN.busy = false;
      $('finState').textContent = '加载失败：' + ((e && e.message) || e);
    });
}

/* ══ 扣款方案 ══════════════════════════════════════════════════════════
   ★ 2026-10-24（用户要求）：违规单的单价由用户自己配，可以绑定
   【骑手属性（全职/兼职）】或【骑手商圈片】。
   同一类违规在多档都配了单价时，生效优先级：商圈片 > 属性 > 全部骑手。
   ★ 没配单价 = 不扣款（0），不会用任何默认值。 */
var FRULE = {rules: [], vios: [], dim: 'all', key: '', loaded: false, busy: false};

function finRuleOpen() {
  $('finRuleView').hidden = false;
  document.body.classList.add('noScroll');
  if (!FRULE.loaded) finRuleLoad(); else finRuleRender();
}

function finRuleClose() {
  $('finRuleView').hidden = true;
  document.body.classList.remove('noScroll');
}

function finRuleLoad() {
  $('finRuleMeta').textContent = '加载中…';
  api('/api/fin/rules?acct=' + encodeURIComponent(ACCT || ''))
    .then(function (j) {
      if (!j || j.ok === false) {
        $('finRuleMeta').textContent = (j && j.error) || '加载失败';
        return;
      }
      FRULE.rules = (j.rules || []).map(function (r) {
        return {dim: r.dim, key: r.key || '', vio: r.vio, price: r.price};
      });
      FRULE.vios = j.vios || [];
      FRULE.loaded = true;
      $('finRuleMeta').textContent = '单价留空或 0 = 该类不扣款。改完点右上角「保存」。';
      finRuleRender();
    })
    .catch(function (e) {
      $('finRuleMeta').textContent = '加载失败：' + ((e && e.message) || e);
    });
}

function finRuleKeyOpts() {
  if (FRULE.dim === 'district') {
    var ds = (FIN.data && FIN.data.districts) || [];
    var out = ds.map(function (d) {
      return [String(d.id || ''), (d.name || '未匹配商圈片') + '（' + hrNum(d.riders) + ' 人）'];
    });
    return out.length ? out : [['', '（还没有商圈片数据）']];
  }
  if (FRULE.dim === 'nature') {
    return [['全职', '全职骑手'], ['兼职', '兼职骑手']];
  }
  return [['', '全部骑手']];
}

function finRuleRender() {
  var dims = [['all', '全部骑手'], ['nature', '按骑手属性'], ['district', '按骑手商圈片']];
  var dimSel = $('finRuleDim');
  dimSel.innerHTML = dims.map(function (d) {
    return '<option value="' + d[0] + '"' + (FRULE.dim === d[0] ? ' selected' : '') + '>' +
      d[1] + '</option>';
  }).join('');

  var keys = finRuleKeyOpts();
  var cur = FRULE.key;
  var has = false;
  keys.forEach(function (k) { if (k[0] === cur) has = true; });
  if (!has) cur = keys[0][0];
  FRULE.key = cur;

  var keySel = $('finRuleKey');
  keySel.innerHTML = keys.map(function (k) {
    return '<option value="' + esc(k[0]) + '"' + (k[0] === cur ? ' selected' : '') + '>' +
      esc(k[1]) + '</option>';
  }).join('');

  function priceOf(vio) {
    for (var i = 0; i < FRULE.rules.length; i++) {
      var r = FRULE.rules[i];
      if (r.dim === FRULE.dim && r.key === FRULE.key && r.vio === vio) return r.price;
    }
    return '';
  }

  $('finRuleForm').innerHTML =
    '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>违规类型</th><th>单价（元 / 单）</th></tr></thead><tbody>' +
      FRULE.vios.map(function (v) {
        var p = priceOf(v.key);
        return '<tr><td>' + esc(v.label) + '</td><td>' +
          '<input class="lb-in fr-price" data-vio="' + v.key + '" inputmode="decimal" ' +
          'value="' + (p === '' || p == null ? '' : p) + '" placeholder="0" ' +
          'style="width:96px;box-sizing:border-box"></td></tr>';
      }).join('') + '</tbody></table></div>';

  finRuleListRender();

  dimSel.onchange = function () {
    FRULE.dim = dimSel.value;
    FRULE.key = '';
    finRuleRender();
  };
  keySel.onchange = function () {
    FRULE.key = keySel.value;
    finRuleRender();
  };
}

function finRuleListRender() {
  if (!FRULE.rules.length) {
    $('finRuleList').innerHTML = '<div class="empty">还没有配置任何规则</div>';
    return;
  }
  var nameOf = {};
  FRULE.vios.forEach(function (v) { nameOf[v.key] = v.label; });
  var dname = {all: '全部骑手', nature: '属性', district: '商圈片'};
  var dlabel = {};
  ((FIN.data && FIN.data.districts) || []).forEach(function (d) { dlabel[String(d.id || '')] = d.name; });
  var rows = FRULE.rules.slice().sort(function (a, b) {
    if (a.dim !== b.dim) return a.dim < b.dim ? -1 : 1;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return a.vio < b.vio ? -1 : 1;
  });
  $('finRuleList').innerHTML =
    '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>维度</th><th>维度值</th><th>违规类型</th><th>单价（元）</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var kv = r.dim === 'district' ? (dlabel[r.key] || r.key || '未匹配') : (r.key || '全部');
        return '<tr><td>' + dname[r.dim] + '</td><td>' + esc(kv) + '</td>' +
          '<td>' + esc(nameOf[r.vio] || r.vio) + '</td>' +
          '<td>' + finMoney(r.price) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
}

function finRuleSave() {
  if (FRULE.busy) return;
  var ins = document.querySelectorAll('#finRuleForm .fr-price');
  var vals = {};
  for (var i = 0; i < ins.length; i++) {
    var v = parseFloat(ins[i].value);
    vals[ins[i].getAttribute('data-vio')] = (isNaN(v) || v < 0) ? 0 : v;
  }
  // 当前这一档的新值替换掉旧值，其它档保持不变（整批提交）
  FRULE.rules = FRULE.rules.filter(function (r) {
    return !(r.dim === FRULE.dim && r.key === FRULE.key);
  });
  Object.keys(vals).forEach(function (vio) {
    if (vals[vio] > 0) FRULE.rules.push({dim: FRULE.dim, key: FRULE.key, vio: vio, price: vals[vio]});
  });

  FRULE.busy = true;
  $('finRuleMeta').textContent = '保存中…';
  api('/api/fin/rules', {method: 'POST', headers: {'Content-Type': 'application/json'},
                         body: JSON.stringify({acct: ACCT || '', rules: FRULE.rules})})
    .then(function (j) {
      FRULE.busy = false;
      if (!j || j.ok === false) {
        $('finRuleMeta').textContent = (j && j.error) || '保存失败';
        return;
      }
      $('finRuleMeta').textContent = '已保存 ' + (j.saved || 0) + ' 条规则，重算扣款…';
      FIN.data = null;
      api('/api/fin?acct=' + encodeURIComponent(ACCT || ''))
        .then(function (d) {
          if (d && d.ok !== false) { FIN.data = d; finRender(); }
          $('finRuleMeta').textContent = '已保存 ' + (j.saved || 0) + ' 条规则。';
        });
      finRuleRender();
    })
    .catch(function (e) {
      FRULE.busy = false;
      $('finRuleMeta').textContent = '保存失败：' + ((e && e.message) || e);
    });
}

function finSync() {
  if (FIN.busy) return;
  FIN.busy = true;
  $('finState').textContent = '已触发导出，正在从风神拉取账单（约 10~30 秒）…';
  api('/api/fin/sync', {method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({acct: ACCT || ''})})
    .then(function () {
      setTimeout(function () {
        FIN.busy = false;
        $('finState').textContent = '';
        FIN.data = null;
        finLoad();
      }, 20000);
    })
    .catch(function (e) {
      FIN.busy = false;
      $('finState').textContent = '导出失败：' + ((e && e.message) || e);
    });
}

function finSwitch(tab) {
  FIN.tab = tab;
  Array.prototype.forEach.call($('finTabs').querySelectorAll('button'), function (b) {
    b.className = b.getAttribute('data-t') === tab ? 'on' : '';
  });
  finRender();
}

// 三个维度共用的明细列（用户 2026-10-22：商圈片与整商必须和骑手口径一致）
var FIN_COLS = [
  // ★ 2026-10-24（用户要求）：骑手属性（全职/兼职），来自 HR 名册 work_type
  //   骑手行是单值；站点/商圈片/整商行显示「全职 X / 兼职 Y」
  ['属性', 'nature', 's', 'HR 名册工作性质（风神 workType：0=全职 1=兼职）'],
  ['本月出勤天数', 'workDays', 'n', '按【接单时间】统计的自然日数（汇总层为人天合计）'],
  ['排班内单量', 'inOrders', 'n', 'scheduleOrderCount'],
  ['排班外单量', 'outOrders', 'n', 'noScheduleOrderCount'],
  ['取分离单', 'pickOrders', 'n', 'specialOrderCountDetailList 里的「取分离」单量'],
  ['送分离单', 'sendOrders', 'n', 'specialOrderCountDetailList 里的「送分离」单量'],
  ['基础薪资', 'base', 'm', '排班内阶梯薪资 + 排班外基础薪资'],
  ['一口价', 'fixed', 'm', 'fixedReward（取分离 / 送分离一口价合计）'],
  ['长期激励', 'longTerm', 'm', 'longPeriodBonus'],
  ['跑单奖励', 'runReward', 'm', '全勤 + 质保 + 段位(星级) + 时段 + 天气'],
  ['难度奖励', 'hardReward', 'm', '重量 / 距离 / 跑单 / 1v1 / 接单等'],
  ['推荐奖励', 'recommend', 'm', 'recommendationReward'],
  ['活动收入', 'activity', 'm', 'activityBonus'],
  // ★ 2026-10-24：列名带上「骑手」，方便以后区分其他口径的收入（平台/公司成本等）
  ['骑手总收入', 'totalIncome', 'm', '以上各项收入求和'],
  ['索赔', 'claim', 'm', '扣款项里的索赔金额（用户 2026-10-24 要求单列）'],
  ['骑手收入单均', 'perOrder', 'm', '骑手总收入 ÷ 总单量'],
  // ★★ 2026-10-24（用户要求）：违规单量 —— 每类在【扣款方案】里配单价，单量 × 单价 = 扣款。
  //   口径：物流商(代理商)责任；统计全部运单（物流责取消单本来就没送达）。
  ['物流责取消单', 'vioCancel', 'n', '取消责任=物流商/配送商 的取消单'],
  ['投诉单', 'vioComplaint', 'n', '用户投诉 / 商户投诉，且判责为物流商'],
  ['差评单', 'vioBad', 'n', '评价等级「吐槽」且判责为物流商'],
  ['索赔单', 'vioClaim', 'n', '索赔成立（不含「配送超时」原因的索赔）'],
  ['提前点送达不满意单', 'vioEarly', 'n', '违规送达成立（isIllegalComplete）'],
  ['轻度超时单', 'vioOtLight', 'n', '超时类型=轻度超时'],
  ['普通超时单', 'vioOtNormal', 'n', '超时类型=普通超时'],
  ['严重超时单', 'vioOtHeavy', 'n', '超时类型=严重超时'],
  ['配送节点伪造单', 'vioForge', 'n', '配送节点伪造（风神该字段当前全为 0）'],
  // ★ 2026-10-24（用户要求）：违规扣款 = Σ(违规单量 × 扣款方案里的单价)
  ['违规扣款', 'penalty', 'm', '按「扣款方案」计算：各种违规单量 × 对应单价']
];

/* rows 每一行：{name, sub?, riders, orders, ...明细} */
function finTable(rows, nameHead, subHead) {
  return '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
    '<th>' + nameHead + '</th>' +
    (subHead ? '<th>' + subHead + '</th>' : '') +
    '<th>骑手</th><th>总单量</th>' +
    FIN_COLS.map(function (c) { return '<th title="' + esc(c[3]) + '">' + c[0] + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    rows.map(function (x) {
      return '<tr><td>' + esc(x.name) + '</td>' +
        (subHead ? '<td class="hr-dim">' + esc(x.sub || '') + '</td>' : '') +
        '<td>' + hrNum(x.riders) + '</td><td>' + num(x.orders) + '</td>' +
        FIN_COLS.map(function (c) {
          var v = x[c[1]];
          var txt = c[2] === 'n' ? num(v)
                  : (c[2] === 's' ? esc(v || '—') : finMoney(v));
          return '<td>' + txt + '</td>';
        }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function finRender() {
  var d = FIN.data || {};
  var t = d.total || {};
  if (!d.ym) {
    $('finMeta').textContent = '';
    $('finCards').innerHTML = '';
    $('finBody').innerHTML = '<div class="empty">还没有账单数据，点右上角「导出」从风神拉一次</div>';
    return;
  }
  $('finMeta').innerHTML = '账单月份 <b>' + esc(d.ym) + '</b> · ' +
    esc(String(t.riders || 0)) + ' 名骑手 · 口径：实发=骑手到手，应发=税前，扣款含预支/索赔/个税';

  // ★ 2026-10-24（用户要求）：卡片必须和下面的表格【同口径】——
  //   全部取 agency 汇总行，也就是整商表格第一行的那几个数，不再各算各的。
  var ag = d.agency || {};
  // ★ 2026-10-24（用户要求）：卡片只看【骑手总收入】—— 去掉实发总额和扣款合计
  //   （预支不提现，实发不必体现），保留骑手数 / 总单量 / 总收入 / 收入单均 四张。
  var cards = [
    ['骑手数', hrNum(ag.riders), '人', '有账单记录的骑手'],
    ['总单量', num(ag.orders), '单', '与下表「总单量」一致'],
    ['骑手总收入', finMoney(ag.totalIncome), '元', '各项收入求和，与下表「骑手总收入」一致'],
    ['骑手收入单均', finMoney(ag.perOrder), '元', '骑手总收入 ÷ 总单量']
  ];
  $('finCards').innerHTML = cards.map(function (c) {
    return '<div class="hr-card"><div class="hr-k">' + c[0] + '</div>' +
      '<div class="hr-v">' + c[1] + '<span class="hr-u">' + c[2] + '</span></div>' +
      '<div class="hr-s">' + c[3] + '</div></div>';
  }).join('');

  var body = '';
  if (FIN.tab === 'agency') {
    // 整商 = 一行「全公司（整商）」+ 各站点明细，列与骑手维度完全一致
    var ag = d.agency || {};
    var list = [{name: ag.name || '全公司（整商）', riders: ag.riders, orders: ag.orders}];
    FIN_COLS.forEach(function (c) { list[0][c[1]] = ag[c[1]]; });
    (d.sites || []).forEach(function (x) {
      var o = {name: x.team_name, riders: x.riders, orders: x.orders};
      FIN_COLS.forEach(function (c) { o[c[1]] = x[c[1]]; });
      list.push(o);
    });
    body = finTable(list, '站点');
  } else if (FIN.tab === 'district') {
    var ds = (d.districts || []).map(function (x) {
      var o = {name: x.name, sub: (x.sites || []).join('、'),
               riders: x.riders, orders: x.orders};
      FIN_COLS.forEach(function (c) { o[c[1]] = x[c[1]]; });
      return o;
    });
    body = finTable(ds, '商圈片', '下辖站点');
  } else {
    var rs = d.riders || [];
    var kw = (FIN.kw || '').trim();
    if (kw) {
      rs = rs.filter(function (r) {
        return (r.knight_name || '').indexOf(kw) >= 0 ||
               (r.team_name || '').indexOf(kw) >= 0 ||
               String(r.knight_id || '').indexOf(kw) >= 0;
      });
    }
    // ★ 2026-10-22：骑手维度按用户要求展开成明细宽表（横滑查看，首列姓名固定）
    var COLS = FIN_COLS;
    var _unused = [
      ['排班内单量', 'inOrders', 'n', 'scheduleOrderCount'],
      ['排班外单量', 'outOrders', 'n', 'noScheduleOrderCount'],
      ['取分离单', 'pickOrders', 'n', 'specialOrderCountDetailList 里的「取分离」单量'],
      ['送分离单', 'sendOrders', 'n', 'specialOrderCountDetailList 里的「送分离」单量'],
      ['基础薪资', 'base', 'm', '排班内阶梯薪资 + 排班外基础薪资'],
      ['一口价', 'fixed', 'm', 'fixedReward（取分离 / 送分离一口价合计）'],
      ['长期激励', 'longTerm', 'm', 'longPeriodBonus'],
      ['跑单奖励', 'runReward', 'm', '全勤 + 质保 + 段位(星级) + 时段 + 天气'],
      ['难度奖励', 'hardReward', 'm', '重量 / 距离 / 跑单 / 1v1 / 接单等'],
      ['推荐奖励', 'recommend', 'm', 'recommendationReward'],
      ['活动收入', 'activity', 'm', 'activityBonus'],
      ['总收入', 'totalIncome', 'm', '以上各项收入求和'],
      ['收入单均', 'perOrder', 'm', '总收入 ÷ 总单量']
    ];
    body = '<div class="hr-filter">' +
      '<input id="finKw" placeholder="姓名 / 站点 / 骑手ID" value="' + esc(FIN.kw) + '">' +
      '<span class="hint" id="finSMsg">显示 <b>' + rs.length + '</b> 人 · 左右滑动看全部字段</span></div>' +
      '<div class="daily-wrap"><table class="hr-tbl"><thead><tr>' +
      '<th>骑手</th><th>站点</th><th>总单量</th>' +
      COLS.map(function (c) { return '<th title="' + esc(c[3]) + '">' + c[0] + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rs.map(function (x) {
        return '<tr><td>' + esc(x.knight_name) + '</td><td>' + esc(x.team_name) + '</td>' +
          '<td>' + num(x.orders || x.order_count) + '</td>' +
          COLS.map(function (c) {
            var v = x[c[1]];
            // ★ 's' = 字符串列（如「属性」全职/兼职），不能走 finMoney 否则显示 —
            var txt = c[2] === 'n' ? num(v)
                    : (c[2] === 's' ? esc(v || '—') : finMoney(v));
            return '<td>' + txt + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  $('finBody').innerHTML = body;

  var kwEl = $('finKw');
  if (kwEl) {
    kwEl.addEventListener('input', function () {
      FIN.kw = kwEl.value;
      var pos = kwEl.selectionStart;
      finRender();
      var el2 = $('finKw');
      if (el2) { el2.focus(); try { el2.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }
}
