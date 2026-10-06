/* ══ 导出图片（PNG）· 用户 2026-10-06 ══════════════════════════════════
 * 用户要求：导出图片【保留网页原来的排版】，包括涂色高亮 ——
 *   纯 canvas 手绘只能还原"数据"，还原不了卡片样式、颜色、圆角、
 *   隔行底色、选中高亮。所以改成对【真实 DOM】截图。
 *
 * 为什么用本地化的 html2canvas 而不是 CDN：
 *   ① 本项目双部署（CF Pages / GH Pages），外链 CDN 挂了就整功能失效；
 *   ② 已下载到 web/html2canvas.min.js（194KB），随项目一起部署，无网络依赖。
 *
 * 兼容性前置检查（已确认）：
 *   style.css 里【没有】 oklch / oklab / lab() / color-mix 等现代颜色函数
 *   —— 那些 html2canvas 1.4 会解析失败并丢色。布局只用 flex/grid + box-shadow，
 *   都在支持范围内。
 *
 * 涂色是怎么来的：列表行有 .on（选中高亮）、.open（展开详情）、
 *   深色底等 class，截图直接把它们一起拍下来，无需额外处理。
 */
'use strict';

/* 克隆一份节点来截图：直接截原节点会破坏当前页面（滚动条、定位都会乱）。
   克隆后挂到一个屏幕外的容器里，并给 html/body 定死尺寸。 */
function buildSnapshot(el) {
  // ★ 尺寸兜底：元素若在 display:none 的容器里，offsetWidth/scrollHeight 都是 0，
  //   html2canvas 会静默返回一张空图（toDataURL 出来只有几个字节）。
  //   所以尺寸优先取【渲染出来的 rect】，全为 0 时退回子元素累加。
  var rc = el.getBoundingClientRect();
  var W = rc.width || el.offsetWidth || el.scrollWidth || window.innerWidth;
  var H = rc.height || el.offsetHeight || el.scrollHeight || 0;
  if (!H) {
    Array.prototype.forEach.call(el.children, function (c) {
      var r = c.getBoundingClientRect();
      if (r.height > H) H = r.height;
    });
  }
  var wrap = document.createElement('div');
  wrap.setAttribute('data-export-snap', '1');
  wrap.style.cssText =
    'position:absolute;left:-100000px;top:0;width:' + W + 'px;' +
    'background:#fff;z-index:-1;';
  var clone = el.cloneNode(true);
  clone.style.width = W + 'px';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  return { node: clone, wrap: wrap, w: W, h: H };
}

/* 导出当前列表为图片（保留原排版）。
 * rows 仅用于决定【要截图哪些行】：默认截屏幕上已渲染的部分，
 * showAll 打开时截全部。 */
function exportImage(rows) {
  var tip = document.getElementById('progText');
  if (typeof html2canvas !== 'function') {
    if (tip) tip.textContent = '图片组件未加载，稍后重试';
    return;
  }
  var list = document.getElementById('list');
  if (!list || !list.children.length) {
    if (tip) tip.textContent = '没有可导出的数据';
    return;
  }
  // ★★ 导出前必须校验【列表已经渲染成当前维度】。
  //   切维度时 /api/metrics 是异步的，列表渲染完成前 DOM 里还是上一维度的内容；
  //   而且 renderListBar 只在骑手维度显示（整商不显示排序条），
  //   于是会出现「标题写着骑手明细、内容却是整商那 1 行」的错乱导出
  //   （用户 2026-10-06 实测：选了骑手维度，导出的却是整商）。
  if (window.__listLevel && window.__listLevel !== S.level) {
    if (tip) tip.textContent = '列表还在切换中，等加载完再导出（当前' +
      ({ agency: '整商', district: '商圈片', site: '站点', rider: '骑手' }[window.__listLevel] || window.__listLevel) +
      '，要' + ({ agency: '整商', district: '商圈片', site: '站点', rider: '骑手' }[S.level] || S.level) + '）';
    return;
  }
  // 行数为 0 时也拦一下（"该区间暂无数据"那一屏不该被导成图）
  if (!list.querySelector('.item')) {
    if (tip) tip.textContent = '当前列表没有数据，无法导出';
    return;
  }
  // ★ 兜底：商圈片/站点/骑手 维度只渲染出【1 行】基本可以断定是竞态或加载未完成
  //   （这些维度天然有多行；只有整商恰好是 1 行）。导出去必然是错的。
  if (S.level !== 'agency' && list.querySelectorAll('.item').length <= 1) {
    if (tip) tip.textContent = '列表只加载出 ' +
      list.querySelectorAll('.item').length + ' 行（' + S.level +
      '维度应有更多），请等加载完成后重试';
    return;
  }
  if (tip) tip.textContent = '正在生成图片…';

  // 带上工具条（标题+筛选条件），这样导出图里能看出这是哪天的、按什么筛的
  var panel = document.getElementById('listPanel');
  var snap = buildSnapshot(panel || list);

  var scale = 2;                       // 高清
  html2canvas(snap.node, {
    backgroundColor: '#ffffff',
    scale: scale,
    useCORS: true,
    logging: false,
    windowWidth: snap.w,
    height: snap.h,
    onclone: function (doc) {
      // 截图副本里去掉可能造成截断的 sticky 元素（滚动时会重复/错位）
      var st = doc.querySelectorAll('[data-export-snap] *');
      Array.prototype.forEach.call(st, function (n) {
        if (getComputedStyle(n).position === 'sticky') n.style.position = 'static';
      });
    }
  }).then(function (cv) {
    var lv = ({ agency: '整商', district: '商圈片', site: '站点', rider: '骑手' }[S.level]) || S.level;
    var a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = '看板_' + lv + '_' + (S.from || today()) +
                 (S.to && S.to !== S.from ? '_' + S.to : '') + '.png';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 1000);
    if (tip) tip.textContent = '已导出图片（含当前筛选与涂色）';
  }).catch(function (e) {
    if (tip) tip.textContent = '图片生成失败：' + ((e && e.message) || e);
  }).then(function () {
    if (snap.wrap && snap.wrap.parentNode) snap.wrap.parentNode.removeChild(snap.wrap);
  });
}