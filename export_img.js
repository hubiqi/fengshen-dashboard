/* ══ 导出图片（PNG）· 用户 2026-10-06 ══════════════════════════════════
 * 为什么不引 html2canvas 这类外部库：
 *   ① 本项目双部署（CF Pages / GH Pages），外链 CDN 挂了就整功能没了；
 *   ② 那类库对 flex/grid 布局支持不全，截出来经常错位；
 *   ③ 看板要的是【数据表】，不是像素级还原页面 —— 手绘表格反而更整齐。
 * 方案：canvas 直接画表格，行高/字号可控，手机上也能导出大图。
 *
 * 分页：手机 Safari 的 canvas 高度上限远低于桌面（可能只有 4096~8192），
 *   一张图画 143 行会直接得到空白图。所以【按页切】，每页 40 行，
 *   一次导出多个文件，文件名带 _1/_2/_3。
 */
'use strict';

var IMG_PAGE_ROWS = 40;          // 每页行数（保守值，任何设备都不会超限）
var IMG_COLS = [
  { k: 'rank',  n: '#',              w: 34,  align: 'r' },
  { k: 'name',  n: '骑手',            w: 110, align: 'l' },
  { k: 'site',  n: '站点',            w: 150, align: 'l' },
  { k: 'orders',n: '完单',            w: 54,  align: 'r' },
  { k: 'score', n: '今日得分',        w: 66,  align: 'r' },
  { k: 'att',   n: '出勤',            w: 46,  align: 'r' },
  { k: 'eff',   n: '人效',            w: 54,  align: 'r' },
  { k: 'likt',  n: '完全妥投率',      w: 78,  align: 'r' },
  { k: 't8',    n: 'T8准时率',        w: 76,  align: 'r' },
  { k: 'dur',   n: '单均复合(s)',     w: 84,  align: 'r' },
  { k: 'dis',   n: '不满意率',        w: 78,  align: 'r' }
];

function imgCellText(r, k, idx) {
  var sc = r.score || {};
  switch (k) {
    case 'rank':  return idx + 1;
    case 'name':  return r.name || r.id || '';
    case 'site':  return r.siteName || '';
    case 'orders':return num(r.orders);
    case 'score': return sc.cur == null ? '—' : Number(sc.cur).toFixed(2);
    case 'att':   return r.attendRiders == null ? '—' : String(r.attendRiders);
    case 'eff':   return r.efficiency == null ? '—' : String(r.efficiency);
    case 'likt':  return r.likt == null ? '—' : (r.likt * 100).toFixed(2) + '%';
    case 't8':    return r.t8 == null ? '—' : (r.t8 * 100).toFixed(2) + '%';
    case 'dur':   return r.duration == null ? '—' : Number(r.duration).toFixed(2);
    case 'dis':   return r.dissat == null ? '—' : (r.dissat * 100).toFixed(3) + '%';
    default: return '';
  }
}

/* 中文按 1 个字宽、数字按 0.56 字宽估算，先量一遍再定列宽 */
function imgTextW(s, fs) {
  var w = 0;
  for (var i = 0; i < s.length; i++) {
    w += s.charCodeAt(i) > 255 ? fs : fs * 0.56;
  }
  return w;
}

function exportImage(rows) {
  var tip = document.getElementById('progText');
  if (!rows || !rows.length) { if (tip) tip.textContent = '没有可导出的数据'; return; }

  var PAD = 14, HEADH = 74, ROWH = 26, COLH = 30, FOOT = 26;
  var width = PAD * 2 + IMG_COLS.reduce(function (a, c) { return a + c.w; }, 0);
  var pages = Math.ceil(rows.length / IMG_PAGE_ROWS);
  var title = '风神考核看板 · ' +
              ({ agency: '整商', district: '商圈片', site: '站点', rider: '骑手' }[S.level] || S.level) +
              '明细';
  var range = (S.from || '') === (S.to || S.from) ? (S.from || '')
             : (S.from || '') + ' ~ ' + (S.to || '');
  var fname = '看板_' + S.level + '_' + (S.from || today()) +
              (S.to && S.to !== S.from ? '_' + S.to : '');

  for (var p = 0; p < pages; p++) {
    var slice = rows.slice(p * IMG_PAGE_ROWS, (p + 1) * IMG_PAGE_ROWS);
    var height = PAD + HEADH + COLH + slice.length * ROWH + FOOT + PAD;
    var cv = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);   // 高清但别把内存撑爆
    cv.width = width * dpr;
    cv.height = height * dpr;
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.textBaseline = 'middle';

    // 背景
    g.fillStyle = '#fff';
    g.fillRect(0, 0, width, height);

    // 标题区
    g.fillStyle = '#111827';
    g.font = '600 17px -apple-system,system-ui,sans-serif';
    g.textAlign = 'left';
    g.fillText(title, PAD, PAD + 14);
    g.fillStyle = '#6b7280';
    g.font = '12px -apple-system,system-ui,sans-serif';
    g.fillText('数据区间 ' + range + '　·　共 ' + rows.length + ' 人' +
               (pages > 1 ? ('　·　第 ' + (p + 1) + '/' + pages + ' 页') : ''),
               PAD, PAD + 36);
    g.strokeStyle = '#e5e7eb';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(PAD, PAD + HEADH - 12.5);
    g.lineTo(width - PAD, PAD + HEADH - 12.5); g.stroke();

    // 表头
    var y = PAD + HEADH;
    g.fillStyle = '#f3f4f6';
    g.fillRect(PAD, y, width - PAD * 2, COLH);
    g.fillStyle = '#374151';
    g.font = '600 12px -apple-system,system-ui,sans-serif';
    var x = PAD;
    IMG_COLS.forEach(function (c) {
      g.textAlign = c.align === 'r' ? 'right' : 'left';
      var tx = c.align === 'r' ? x + c.w - 8 : x + 8;
      g.fillText(c.n, tx, y + COLH / 2);
      x += c.w;
    });
    y += COLH;

    // 数据行（隔行浅底，导出后仍清晰可读）
    g.font = '12.5px -apple-system,system-ui,sans-serif';
    slice.forEach(function (r, i) {
      var ry = y + i * ROWH;
      if (i % 2) { g.fillStyle = '#fafafa'; g.fillRect(PAD, ry, width - PAD * 2, ROWH); }
      var cx = PAD;
      IMG_COLS.forEach(function (c) {
        var txt = String(imgCellText(r, c.k, p * IMG_PAGE_ROWS + i));
        g.textAlign = c.align === 'r' ? 'right' : 'left';
        // 超宽就截断并加省略号，避免文字压到相邻列
        var maxw = c.w - 14;
        if (imgTextW(txt, 12.5) > maxw) {
          while (txt.length && imgTextW(txt + '…', 12.5) > maxw) txt = txt.slice(0, -1);
          txt += '…';
        }
        g.fillStyle = '#111827';
        g.fillText(txt, c.align === 'r' ? cx + c.w - 8 : cx + 8, ry + ROWH / 2);
        cx += c.w;
      });
    });

    // 页脚
    g.fillStyle = '#9ca3af';
    g.font = '11px -apple-system,system-ui,sans-serif';
    g.textAlign = 'right';
    g.fillText('导出 ' + new Date().toLocaleString('zh-CN'), width - PAD, y + slice.length * ROWH + 14);

    // 下载
    try {
      var a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = fname + (pages > 1 ? '_' + (p + 1) + 'of' + pages : '') + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); }, 1000);
    } catch (e) {
      if (tip) tip.textContent = '图片生成失败：' + (e && e.message || e);
      return;
    }
  }
  if (tip) tip.textContent = '已导出 ' + rows.length + ' 行，' + pages + ' 张 PNG 图片';
}