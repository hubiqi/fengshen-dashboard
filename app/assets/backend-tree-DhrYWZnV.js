const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-DpvE-AlK.js","assets/index-SgcNJQPd.css","assets/browser-automation-DVjbVDE_.js"])))=>i.map(i=>d[i]);
import{l as h,_ as z}from"./index-DpvE-AlK.js";const p="backend-tree",L="fengshen_ai_backend_tree";function de(){try{const t=localStorage.getItem("fengshen_browser_target_url");if(t&&/aeolus\.ele\.me/.test(t))return t;const i=localStorage.getItem("fengshen_agencyId");if(i)return`https://aeolus.ele.me/?targetId=${encodeURIComponent(String(i))}`}catch(t){h.warn(p,"getBackendTargetUrl 读取localStorage失败",{error:t==null?void 0:t.message})}return"https://aeolus.ele.me"}const $=`
(function() {
  function patchWin(win) {
    if (!win || win.__fs_intercepted) return;
    try {
      if (!win._capturedRequests) win._capturedRequests = [];
      win.__fs_intercepted = true;

      var XHR = win.XMLHttpRequest;
      if (XHR && !XHR.prototype.__fs_patched) {
        var origOpen = XHR.prototype.open;
        var origSend = XHR.prototype.send;
        XHR.prototype.__fs_patched = true;
        XHR.prototype.open = function(method, url) {
          this.__fsMethod = method;
          this.__fsUrl = url;
          return origOpen.apply(this, arguments);
        };
        XHR.prototype.send = function(body) {
          var self = this;
          var cap = {
            url: self.__fsUrl,
            method: self.__fsMethod || 'GET',
            requestBody: typeof body === 'string' ? body.substring(0, 800) : '',
            timestamp: Date.now()
          };
          self.addEventListener('load', function() {
            cap.status = self.status;
            try {
              var resp = self.responseText || '';
              cap.responseBody = resp.length > 2000 ? resp.substring(0, 2000) + '...(截断)' : resp;
            } catch(e) { cap.responseBody = '(无法读取)'; }
            win._capturedRequests.push(cap);
          });
          self.addEventListener('error', function() {
            cap.status = 0; cap.responseBody = '(请求失败)';
            win._capturedRequests.push(cap);
          });
          return origSend.apply(this, arguments);
        };
      }

      var origFetch = win.fetch;
      if (origFetch && !win.__fs_fetchPatched) {
        win.__fs_fetchPatched = true;
        win.fetch = function(input, init) {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          var method = (init && init.method) || 'GET';
          var body = init && init.body;
          if (typeof body === 'string') body = body.substring(0, 800);
          return origFetch.apply(this, arguments).then(function(response) {
            var cap = {
              url: url, method: method,
              requestBody: typeof body === 'string' ? body : '',
              status: response.status, timestamp: Date.now()
            };
            try {
              response.clone().text().then(function(text) {
                cap.responseBody = text && text.length > 2000 ? text.substring(0, 2000) + '...(截断)' : (text || '');
                win._capturedRequests.push(cap);
              }).catch(function() {
                cap.responseBody = '(无法读取)';
                win._capturedRequests.push(cap);
              });
            } catch(e) {
              win._capturedRequests.push(cap);
            }
            return response;
          });
        };
      }
    } catch(e) {}
  }

  // 递归注入: 当前文档窗口 + 所有同源 iframe
  function injectFrames(doc, depth) {
    if (!doc || depth > 5) return;
    var win = doc.defaultView || doc.parentWindow;
    if (win) patchWin(win);
    var iframes = doc.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        var iDoc = iframes[i].contentDocument;
        if (iDoc) injectFrames(iDoc, depth + 1);
      } catch(e) { /* 跨域 iframe 无法注入, 跳过后由定时器重试 */ }
    }
  }

  injectFrames(document, 0);

  // 自动再注入: 监听动态新增 iframe (微前端子应用挂载) + 定时兜底 (iframe 导航后窗口重建)
  if (!window.__fs_mo) {
    window.__fs_mo = new MutationObserver(function() { injectFrames(document, 0); });
    window.__fs_mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (!window.__fs_timer) {
    window.__fs_timer = setInterval(function() { injectFrames(document, 0); }, 1500);
  }
})();
`,me=`
(function() {
  function clearAll(doc, depth) {
    if (!doc || depth > 5) return;
    var win = doc.defaultView || doc.parentWindow;
    if (win) win._capturedRequests = [];
    var iframes = doc.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { var id = iframes[i].contentDocument; if (id) clearAll(id, depth + 1); } catch(e) {}
    }
  }
  clearAll(document, 0);
  return true;
})()
`,he=`
(function() {
  function count(doc, depth) {
    if (!doc || depth > 5) return 0;
    var n = 0;
    var win = doc.defaultView || doc.parentWindow;
    if (win && win._capturedRequests) n += win._capturedRequests.length;
    var iframes = doc.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try { var id = iframes[i].contentDocument; if (id) n += count(id, depth + 1); } catch(e) {}
    }
    return n;
  }
  return count(document, 0);
})()
`,C=`
(function() {
  var count = 0;
  var seen = [];
  var sels = [
    '.el-submenu__title',
    '.ant-menu-submenu-title',
    '[class*="submenu"] [class*="title"]',
    '[class*="sub-menu"] [class*="title"]',
    '[class*="submenu-title"]',
    '[class*="has-children"]',
    '[class*="menu-item"][class*="expand"]',
    '[class*="menu"] [class*="arrow"]',
    '[class*="menu"] [class*="caret"]',
    '[class*="menu"] [class*="chevron"]',
    '[class*="menu"] .anticon',
    '[class*="menu"] [class*="icon-"]'
  ];
  function clsOf(el) {
    try { return typeof el.className === 'string' ? el.className : (el.getAttribute('class') || ''); } catch(e) { return ''; }
  }
  for (var s = 0; s < sels.length; s++) {
    var list;
    try { list = document.querySelectorAll(sels[s]); } catch(e) { continue; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (seen.indexOf(el) >= 0) continue;
      seen.push(el);
      var cls = clsOf(el);
      // 仅点未展开的 (避免关闭已展开项)
      if (/(is-opened|is-active|open|active|expanded|ant-menu-submenu-open|ant-menu-submenu-selected)/i.test(cls)) continue;
      try { el.click(); count++; } catch(e) {}
    }
  }
  return count;
})()
`,Q=`
(function() {
  var bodyLen = (document.body && document.body.innerHTML || '').length;
  var hasElMenu = document.querySelectorAll('.el-menu').length > 0;
  var hasNav = document.querySelectorAll('nav, aside, [class*="sidebar"], [class*="menu"], [class*="nav"]').length > 0;
  var hasLoginForm = document.querySelectorAll('input[type="password"], [class*="login"], [class*="login-form"]').length > 0;
  var hasLinks = document.querySelectorAll('a[href]').length > 0;
  var cookieStr = document.cookie || '';
  // 提取关键 cookie 名 (不含值, 避免日志泄露敏感信息)
  var cookieNames = cookieStr.split(';').map(function(c){ return c.trim().split('=')[0]; }).filter(Boolean);
  // v52.0.0-patch29: 检测 iframe (部分后台菜单在 iframe 内渲染)
  var iframes = document.querySelectorAll('iframe');
  var iframeSrcs = [];
  for (var f = 0; f < iframes.length && f < 5; f++) {
    var src = iframes[f].getAttribute('src') || '';
    if (src) iframeSrcs.push(src.substring(0, 120));
  }
  return JSON.stringify({
    url: location.href,
    title: document.title || '',
    bodyLen: bodyLen,
    hasElMenu: hasElMenu,
    hasNav: hasNav,
    hasLoginForm: hasLoginForm,
    hasLinks: hasLinks,
    menuCount: document.querySelectorAll('.el-menu').length,
    navCount: document.querySelectorAll('nav, aside, [class*="sidebar"], [class*="menu"], [class*="nav"]').length,
    linkCount: document.querySelectorAll('a[href]').length,
    cookieCount: cookieNames.length,
    cookieNames: cookieNames.slice(0, 10),
    iframeCount: iframes.length,
    iframeSrcs: iframeSrcs
  });
})()
`,Z=`
(function() {
  function clean(s) { return (s || '').replace(/\\s+/g, ' ').trim(); }

  // Element UI 菜单提取 (递归)
  function extractElMenu(ul) {
    var result = [];
    if (!ul) return result;
    var children = ul.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      var cls = (el.className || '').toString();
      if (cls.indexOf('el-submenu') >= 0) {
        var titleEl = null;
        for (var j = 0; j < el.children.length; j++) {
          if ((el.children[j].className || '').toString().indexOf('el-submenu__title') >= 0) { titleEl = el.children[j]; break; }
        }
        var title = titleEl ? clean(titleEl.innerText) : '';
        var subUl = null;
        for (var k = 0; k < el.children.length; k++) {
          if ((el.children[k].className || '').toString().indexOf('el-menu') >= 0) { subUl = el.children[k]; break; }
        }
        result.push({ type: 'submenu', name: title, children: extractElMenu(subUl) });
      } else if (cls.indexOf('el-menu-item') >= 0) {
        var text = clean(el.innerText);
        if (text) {
          // v52.0.0-patch31: 提取路由线索 — Element UI router 模式下 index 即路由路径, 另有 href/to
          var idx = el.getAttribute('index') || el.getAttribute('data-index') || el.getAttribute('to') || '';
          var a = el.querySelector('a[href]');
          var href = (a && a.getAttribute('href')) || el.getAttribute('href') || '';
          result.push({ type: 'item', name: text, index: (idx || '').substring(0, 120), href: (href || '').substring(0, 120) });
        }
      }
    }
    return result;
  }

  var tree = [];
  var menus = document.querySelectorAll('.el-menu');
  for (var m = 0; m < menus.length; m++) {
    tree = tree.concat(extractElMenu(menus[m]));
  }

  // v52.0.0-patch34: Ant Design 菜单提取 (子应用如 fearow/必有回响 为 React + AntD 4.x)
  // 结构: li.ant-menu-submenu > .ant-menu-submenu-title + ul.ant-menu(嵌套); li.ant-menu-item 为叶子
  if (tree.length === 0) {
    function extractAntMenu(menuEl, depth) {
      var result = [];
      if (!menuEl || (depth || 0) > 8) return result;
      var items = menuEl.querySelectorAll(':scope > li');
      if (items.length === 0) items = menuEl.querySelectorAll(':scope > li.ant-menu-submenu, :scope > li.ant-menu-item');
      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        var cl = (li.className || '').toString();
        if (cl.indexOf('ant-menu-submenu') >= 0) {
          var titleEl = li.querySelector(':scope > .ant-menu-submenu-title');
          if (!titleEl) titleEl = li.querySelector('.ant-menu-submenu-title');
          var title = titleEl ? clean(titleEl.innerText || titleEl.textContent) : '';
          var subMenu = li.querySelector(':scope > .ant-menu');
          if (!subMenu) subMenu = li.querySelector('.ant-menu');
          if (title) result.push({ type: 'submenu', name: title, children: extractAntMenu(subMenu, (depth || 0) + 1) });
        } else if (cl.indexOf('ant-menu-item') >= 0) {
          var text = clean(li.innerText || li.textContent);
          if (text) {
            var a = li.querySelector('a[href]');
            var href = (a && a.getAttribute('href')) || li.getAttribute('href') || '';
            var idx = li.getAttribute('data-route') || li.getAttribute('data-path') || li.getAttribute('data-url') || li.getAttribute('data-key') || '';
            result.push({ type: 'item', name: text, href: (href || '').substring(0, 120), index: (idx || '').substring(0, 120) });
          }
        }
      }
      return result;
    }
    var antRoots = document.querySelectorAll('.ant-menu');
    for (var am = 0; am < antRoots.length; am++) {
      var at = extractAntMenu(antRoots[am], 0);
      if (at.length > 0) { tree = tree.concat(at); break; }
    }
  }

  // 通用回退: 未找到 el-menu 时, 从导航容器递归提取 (支持嵌套 li/div + a)
  // v52.0.0-patch32: 修复层级丢失 — 避免 :scope 失效时退化为"把所有 li 当平铺兄弟", 改为直接子级递归
  if (tree.length === 0) {
    var containers = document.querySelectorAll('nav, aside, [class*="sidebar"], [class*="menu"], [class*="nav"]');
    var seen = {};

    // 取元素"直接"的子菜单容器 (ul), 不依赖 :scope
    function directUl(el) {
      for (var i = 0; i < el.children.length; i++) {
        if (el.children[i].tagName === 'UL' || el.children[i].tagName === 'OL') return el.children[i];
      }
      for (var j = 0; j < el.children.length; j++) {
        var d = el.children[j];
        if (d.tagName === 'DIV' && d.children.length > 0) {
          for (var k = 0; k < d.children.length; k++) {
            if (d.children[k].tagName === 'UL' || d.children[k].tagName === 'OL') return d.children[k];
          }
        }
      }
      return null;
    }

    // 取节点自身文本 (排除嵌套子菜单文本, 避免父节点 text = "父名+所有子名")
    function ownText(el) {
      var clone = el.cloneNode(true);
      var nested = clone.querySelectorAll('ul, ol, [class*="submenu"], [class*="sub-menu"], [class*="child"]');
      for (var n = 0; n < nested.length; n++) {
        if (nested[n].parentNode) nested[n].parentNode.removeChild(nested[n]);
      }
      return clean(clone.innerText || clone.textContent);
    }

    // 提取菜单项路由线索
    function routeOf(el) {
      var href = el.getAttribute('href') || '';
      if (!href) { var a = el.querySelector('a[href]'); if (a) href = a.getAttribute('href') || ''; }
      var index = el.getAttribute('index') || el.getAttribute('data-path') || el.getAttribute('data-index') || el.getAttribute('data-url') || el.getAttribute('to') || '';
      return { href: href.substring(0, 120), index: index.substring(0, 120) };
    }

    function extractGeneric(container, depth) {
      if (!container || depth > 8) return [];
      var result = [];
      var children = container.children;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        var tag = el.tagName;
        if (tag !== 'LI' && tag !== 'A' && tag !== 'DIV') continue;

        var text = (tag === 'LI' || tag === 'DIV') ? ownText(el) : clean(el.innerText || el.textContent);
        if (!text || text.length > 40) continue;

        // 去重: 保留首次 (顶层优先), 避免嵌套子项与父项重名互吞
        var key = tag + '|' + text;
        if (seen[key]) continue;
        seen[key] = true;

        var route = routeOf(el);
        var childUl = directUl(el);
        var children2 = childUl ? extractGeneric(childUl, depth + 1) : [];

        if (children2.length > 0) {
          result.push({ type: 'submenu', name: text, children: children2 });
        } else {
          result.push({ type: 'item', name: text, href: route.href, index: route.index });
        }
      }
      return result;
    }

    for (var c = 0; c < containers.length; c++) {
      var sub = extractGeneric(containers[c], 0);
      if (sub.length > 0) { tree = tree.concat(sub); break; }
    }
  }

  // v52.0.0-patch29: 若主文档仍无菜单, 尝试同源 iframe 内提取 (部分后台菜单在 iframe 中)
  if (tree.length === 0) {
    function extractGenericIn(container, seenIn) {
      var result = [];
      var items = container.querySelectorAll(':scope > ul > li, :scope > li, :scope > div[class*="item"], :scope > a');
      if (items.length === 0) items = container.querySelectorAll('li, a[href]');
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var text = clean(el.innerText || el.textContent);
        if (!text || text.length > 40 || seenIn[text]) continue;
        seenIn[text] = true;
        var href = el.getAttribute('href') || '';
        var childUl = el.querySelector(':scope > ul, :scope > div > ul');
        var children = [];
        if (childUl) children = extractGenericIn(childUl, seenIn);
        if (children.length > 0) {
          result.push({ type: 'submenu', name: text, children: children });
        } else {
          result.push({ type: 'item', name: text, href: href.substring(0, 120) });
        }
      }
      return result;
    }

    var iframes = document.querySelectorAll('iframe');
    for (var fi = 0; fi < iframes.length; fi++) {
      try {
        var iDoc = iframes[fi].contentDocument || iframes[fi].contentWindow.document;
        if (!iDoc || !iDoc.body) continue;
        var iMenus = iDoc.querySelectorAll('.el-menu');
        var iTree = [];
        for (var im = 0; im < iMenus.length; im++) {
          iTree = iTree.concat(extractElMenu(iMenus[im]));
        }
        if (iTree.length === 0) {
          var iContainers = iDoc.querySelectorAll('nav, aside, [class*="sidebar"], [class*="menu"], [class*="nav"]');
          var iSeen = {};
          for (var ic = 0; ic < iContainers.length; ic++) {
            var iSub = extractGenericIn(iContainers[ic], iSeen);
            if (iSub.length > 0) { iTree = iTree.concat(iSub); break; }
          }
        }
        if (iTree.length > 0) { tree = iTree; break; }
      } catch (e) { /* 跨域 iframe 无法访问, 跳过 */ }
    }
  }

  return JSON.stringify(tree);
})()
`,pe=`
(function() {
  function ownText(el) {
    var clone = el.cloneNode(true);
    var nested = clone.querySelectorAll('ul, ol, [class*="submenu"], [class*="sub-menu"]');
    for (var n = 0; n < nested.length; n++) {
      if (nested[n].parentNode) nested[n].parentNode.removeChild(nested[n]);
    }
    return (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim().substring(0, 24);
  }
  function dump(el, depth, out) {
    if (!el || depth > 5 || out.length > 3000) return;
    var tag = (el.tagName || '?').toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    var cls = '';
    try { cls = typeof el.className === 'string' ? el.className.substring(0, 60) : ''; } catch(e) {}
    var txt = ownText(el);
    out.push('  '.repeat(depth) + '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>' + (txt ? ' ' + txt : ''));
    for (var i = 0; i < el.children.length; i++) dump(el.children[i], depth + 1, out);
  }
  var container = document.querySelector('.el-menu');
  if (!container) {
    var cands = document.querySelectorAll('nav, aside, [class*="sidebar"], [class*="sider"], [class*="menu"]');
    for (var c = 0; c < cands.length; c++) {
      if (cands[c].children.length > 0) { container = cands[c]; break; }
    }
  }
  if (!container) return JSON.stringify({ found: false });
  var out = [];
  dump(container, 0, out);
  return JSON.stringify({
    found: true,
    tag: container.tagName.toLowerCase(),
    cls: (container.className || '').substring(0, 80),
    li: container.querySelectorAll('li').length,
    ul: container.querySelectorAll('ul, ol').length,
    submenu: container.querySelectorAll('.el-submenu, [class*="submenu"], [class*="sub-menu"]').length,
    item: container.querySelectorAll('.el-menu-item, [class*="menu-item"], [class*="nav-item"]').length,
    html: out.join('\\n')
  });
})()
`;function ge(t){return`(function(){
    var target = ${JSON.stringify(t)};
    var MAX_DEPTH = 5;

    function findByText(doc, depth) {
      if (!doc || depth > MAX_DEPTH) return null;
      var els = doc.querySelectorAll('.el-menu-item, [class*="menu-item"], [class*="nav-item"], aside a, nav a, [class*="menu"] a, [class*="menu"] li, [class*="menu"] div[class*="item"]');
      // 精确匹配
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].innerText || els[i].textContent || '').trim();
        if (t === target) return els[i];
      }
      // 模糊匹配
      for (var j = 0; j < els.length; j++) {
        var t2 = (els[j].innerText || els[j].textContent || '').trim();
        if (t2 && (t2.indexOf(target) >= 0 || target.indexOf(t2) >= 0)) return els[j];
      }
      // 递归同源 iframe (菜单可能渲染在 iframe 内)
      var iframes = doc.querySelectorAll('iframe');
      for (var k = 0; k < iframes.length; k++) {
        try {
          var iDoc = iframes[k].contentDocument;
          if (iDoc && iDoc.body) {
            var found = findByText(iDoc, depth + 1);
            if (found) return found;
          }
        } catch(e) {}
      }
      return null;
    }

    // 提取该菜单项对应的真实路由: 自身/祖先的 href、data-*、router-link to
    function getRoute(el) {
      var route = el.getAttribute('href') || el.getAttribute('data-url') || el.getAttribute('data-path') || el.getAttribute('to') || el.getAttribute('data-route') || el.getAttribute('data-id') || '';
      if (!route) {
        var a = el.querySelector('a[href]');
        if (a) route = a.getAttribute('href') || '';
      }
      if (!route && el.closest) {
        var anc = el.closest('a[href]');
        if (anc) route = anc.getAttribute('href') || '';
      }
      return (route || '').substring(0, 200);
    }

    var found = findByText(document, 0);
    if (!found) return JSON.stringify({ ok: false, error: '菜单项未找到: ' + target });

    var route = getRoute(found);
    var before = location.href;
    try { found.click(); } catch(e) {}
    return JSON.stringify({ ok: true, name: target, route: route, before: before, tag: found.tagName, cls: (found.className || '').toString().substring(0, 80) });
  })()`}const ve=`
(function() {
  var MAX_DEPTH = 5;
  var frameUrls = [];

  // 采集单个文档: 表头 / 输入框 / 抓包API
  function collectDoc(doc) {
    var out = { tableHeaders: [], inputs: [], apis: [] };

    // 表格表头
    var thEls = doc.querySelectorAll('th, .el-table__header th, [class*="table"] [class*="header"]');
    for (var i = 0; i < Math.min(thEls.length, 40); i++) {
      var t = (thEls[i].innerText || thEls[i].textContent || '').trim();
      if (t && t.length < 30 && out.tableHeaders.indexOf(t) < 0) out.tableHeaders.push(t);
    }

    // 筛选输入框/选择器
    var inputEls = doc.querySelectorAll('input[type="text"], input[type="date"], input[type="number"], input[type="search"], select, textarea, .el-input__inner, .el-select, .el-date-editor');
    for (var j = 0; j < Math.min(inputEls.length, 20); j++) {
      var el = inputEls[j];
      var ph = el.getAttribute('placeholder') || '';
      var label = '';
      var p = el.parentElement;
      if (p) {
        var lbl = p.querySelector('label');
        if (lbl) label = (lbl.innerText || '').trim();
        if (!label && p.closest) {
          var fi = p.closest('.el-form-item, [class*="form-item"], [class*="field"], [class*="search"]');
          if (fi) {
            var fl = fi.querySelector('label, .el-form-item__label, [class*="label"]');
            if (fl) label = (fl.innerText || '').trim();
          }
        }
      }
      if (ph || label) out.inputs.push({ placeholder: ph, label: label, type: el.getAttribute('type') || '' });
    }

    // 抓包 API (过滤静态资源)
    var win = doc.defaultView || doc.parentWindow;
    var caps = (win && win._capturedRequests) ? win._capturedRequests : [];
    for (var k = 0; k < caps.length; k++) {
      var c = caps[k];
      if (!c || !c.url) continue;
      if (/\\.(js|css|png|jpg|jpeg|svg|woff|woff2|ttf|ico|gif|map)(\\?|$)/i.test(c.url)) continue;
      if (c.url.indexOf('data:') === 0 || c.url.indexOf('blob:') === 0) continue;
      out.apis.push({
        url: c.url.substring(0, 300),
        method: c.method,
        requestBody: (c.requestBody || '').substring(0, 300),
        responseSample: (c.responseBody || '').substring(0, 800)
      });
    }
    return out;
  }

  // 顶层文档
  var data = collectDoc(document);
  data.url = location.href;
  data.title = document.title || '';
  frameUrls.push(location.href);

  // 递归同源 iframe (子应用内容通常在此)
  function walkFrames(doc, depth) {
    if (!doc || depth > MAX_DEPTH) return;
    var iframes = doc.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      try {
        var iDoc = iframes[i].contentDocument;
        if (!iDoc || !iDoc.body) continue;
        var sub = collectDoc(iDoc);
        data.tableHeaders = data.tableHeaders.concat(sub.tableHeaders);
        data.inputs = data.inputs.concat(sub.inputs);
        data.apis = data.apis.concat(sub.apis);
        // 记录 iframe 真实地址 (子应用路由)
        var iframeUrl = '';
        try { iframeUrl = iframes[i].contentWindow.location.href; } catch(e) {}
        if (!iframeUrl) iframeUrl = iframes[i].getAttribute('src') || '';
        if (iframeUrl) frameUrls.push(iframeUrl);
        walkFrames(iDoc, depth + 1);
      } catch(e) { /* 跨域 iframe 跳过 */ }
    }
  }
  walkFrames(document, 0);

  // 去重
  var seenH = {}, seenI = {}, seenA = {};
  data.tableHeaders = data.tableHeaders.filter(function(x){ if(!x || seenH[x]) return false; seenH[x]=true; return true; });
  data.inputs = data.inputs.filter(function(x){ var k=(x.placeholder||'')+'|'+(x.label||'')+'|'+(x.type||''); if(seenI[k]) return false; seenI[k]=true; return true; });
  data.apis = data.apis.filter(function(w){ var k=(w.url||'')+'|'+(w.method||''); if(seenA[k]) return false; seenA[k]=true; return true; });

  var seenU = {};
  data.frameUrls = frameUrls.filter(function(x){ if(!x) return false; if(seenU[x]) return false; seenU[x]=true; return true; });

  // v52.0.0-patch34: 采集所有 iframe 的 src (含跨域子应用, src 属性始终可读,
  // 用于穿透跨域微前端子应用如 https://a.ele.me/app/fnjp-gfe/fearow/index.html)
  var iframeSrcsAll = [];
  function collectSrcs(doc, depth) {
    if (!doc || depth > MAX_DEPTH) return;
    var ifs = doc.querySelectorAll('iframe');
    for (var i = 0; i < ifs.length; i++) {
      var s = ifs[i].getAttribute('src') || '';
      if (s && iframeSrcsAll.indexOf(s) < 0) iframeSrcsAll.push(s.substring(0, 300));
      try { var cd = ifs[i].contentDocument; if (cd) collectSrcs(cd, depth + 1); } catch(e) {}
    }
  }
  collectSrcs(document, 0);
  data.iframeSrcs = iframeSrcsAll;

  return JSON.stringify(data);
})()
`;function be(){try{const t=localStorage.getItem(L);if(!t)return null;const i=JSON.parse(t);return!i||!i.root?null:!i.version||i.version<6?(h.warn(p,"检测到旧版本树形图, 需重新深度探索",{version:i.version}),null):i}catch(t){return h.error(p,"读取树形图失败",{error:t==null?void 0:t.message}),null}}function ee(t){try{return localStorage.setItem(L,JSON.stringify(t)),h.info(p,"树形图已保存",{nodes:te(t==null?void 0:t.root)}),!0}catch(i){return h.error(p,"保存树形图失败",{error:i==null?void 0:i.message}),!1}}function Se(){try{return localStorage.removeItem(L),h.info(p,"树形图已清除"),!0}catch(t){return h.error(p,"清除树形图失败",{error:t==null?void 0:t.message}),!1}}function xe(){const t=be();return t?JSON.stringify(t,null,2):null}function Ae(t){if(!t||typeof t!="string")throw new Error("内容为空");const i=JSON.parse(t);if(!i||!i.root)throw new Error("格式不正确: 缺少 root 节点");return Array.isArray(i.root.children)||(i.root.children=[]),ee(i),i}function te(t){if(!t)return 0;let i=1;if(t.children)for(const y of t.children)i+=te(y);return i}function _e(t){if(!t||!t.root)return"";const i=[];i.push("## 风神后台已探索结构树 (深度探索结果, 供你直接参考)"),i.push("> 菜单路径 → 网址 | 功能 | API(方法+参数+响应样例) | 表格表头"),i.push("");function y(u,R){const m="  ".repeat(R),l=u.url?` [${u.url}]`:"",g=u.function?` — ${u.function}`:"";if(i.push(`${m}${u.name}${l}${g}`),u.tableHeaders&&u.tableHeaders.length&&i.push(`${m}  表头: ${u.tableHeaders.join(" / ")}`),u.inputs&&u.inputs.length){const a=u.inputs.map(N=>N.label||N.placeholder).filter(Boolean).join(", ");a&&i.push(`${m}  筛选: ${a}`)}if(u.apis&&u.apis.length)for(const a of u.apis)i.push(`${m}  API: ${a.method} ${a.url}`),a.requestBody&&i.push(`${m}    参数: ${a.requestBody.substring(0,200)}`),a.responseSample&&i.push(`${m}    响应: ${a.responseSample.substring(0,250)}`);if(u.children)for(const a of u.children)y(a,R+1)}return y(t.root,0),i.join(`
`)}async function ke(t,i,y){var N;const{Capacitor:u}=await z(async()=>{const{Capacitor:o}=await import("./index-DpvE-AlK.js").then(e=>e.aE);return{Capacitor:o}},__vite__mapDeps([0,1])),m=(await z(()=>import("./browser-automation-DVjbVDE_.js"),__vite__mapDeps([2,0,1]))).default;if(!u.isNativePlatform())return{tree:null,count:0,error:"深度探索仅在App内可用 (非原生环境)"};t||(t=de());const l=o=>{h.info(p,o),i&&i(o)},g=o=>new Promise(e=>setTimeout(e,o));async function a(o){try{const{result:e}=await m.evaluateJavascript({code:o});if(e==null)return null;try{return JSON.parse(e)}catch{return e}}catch(e){return h.warn(p,"evalJs失败",{error:e==null?void 0:e.message,codeLen:o==null?void 0:o.length}),null}}try{let U=function(r){let n=0;for(const c of r)c.type==="item"||c.children&&c.children.length===0?n++:c.children&&c.children.length&&(n+=U(c.children));return n},P=function(r){const n=[];function c(w){for(const f of w||[])f.type==="submenu"&&f.children&&f.children.length?c(f.children):f.name&&n.push(f.name)}return c(r),n.sort().join("|")},ie=function(r){if(r==null)return null;if(typeof r=="object")return r;try{return JSON.parse(r)}catch{return null}},ae=function(r,n){if(!n)return"";if(n=String(n).trim(),/^https?:\/\//i.test(n))return n;const c=String(r||"").split("#")[0];return n.startsWith("#")?c+n:n.startsWith("/")?c+"#"+n:c+"#/"+n},le=function(r,n){const c=ae(r.url,n);if(c&&c!==(r.url||""))return c;const w=[r.url||""],f=r.iframeSrcs||[];for(const s of f)if(!(!s||/^https?:\/\//i.test(s)===!1)&&w.indexOf(s)<0)return s;return""};l("打开风神后台: "+t.substring(0,80));const o=await m.open({url:t});o.loaded?l("后台页面已加载: "+(o.url||"").substring(0,80)):l("页面加载超时, 继续尝试..."),l("注入网络拦截器..."),await a($),l("等待后台菜单渲染...");let e=null;for(let r=0;r<15&&(e=await a(Q),!(e&&(e.hasElMenu||e.hasNav||e.hasLinks)));r++)await g(1e3);if(e&&(l(`页面状态: ${e.title||""} | el-menu×${e.menuCount} nav×${e.navCount} 链接×${e.linkCount} iframe×${e.iframeCount||0} cookie×${e.cookieCount} bodyLen=${e.bodyLen}`),e.cookieNames&&e.cookieNames.length&&l("页面cookie: "+e.cookieNames.join(", ")),e.iframeSrcs&&e.iframeSrcs.length&&l("页面iframe: "+e.iframeSrcs.join(" | ")),e.hasLoginForm)){l("检测到登录表单, 后台可能未登录");try{await m.close()}catch{}return{tree:null,count:0,error:"检测到登录页, 请先在App内完成风神后台登录"}}if(!(e&&(e.hasElMenu||e.hasNav||e.hasLinks))&&(l("未检测到菜单, 尝试导航到 dashboard..."),await a("location.href = 'https://aeolus.ele.me/#/dashboard'"),await g(4e3),e=await a(Q),e&&(l(`dashboard页面: ${e.title||""} | el-menu×${e.menuCount} nav×${e.navCount} 链接×${e.linkCount} iframe×${e.iframeCount||0} cookie×${e.cookieCount} bodyLen=${e.bodyLen}`),e.iframeSrcs&&e.iframeSrcs.length&&l("dashboard iframe: "+e.iframeSrcs.join(" | ")),e.hasLoginForm))){l("dashboard仍检测到登录表单, 后台可能未登录");try{await m.close()}catch{}return{tree:null,count:0,error:"检测到登录页, 请先在App内完成风神后台登录"}}l("展开侧边栏子菜单..."),await a(C),await g(1500);const T=await a(Z);let _=[];try{_=typeof T=="string"?JSON.parse(T):Array.isArray(T)?T:[]}catch(r){h.error(p,"解析菜单树失败",{error:r==null?void 0:r.message})}if(!_||_.length===0){const r=e?` (页面: ${e.title||"无标题"}, el-menu×${e.menuCount}, nav×${e.navCount}, 链接×${e.linkCount}, bodyLen=${e.bodyLen})`:"";l("未提取到菜单, 可能未登录或页面结构不同"+r);try{await m.close()}catch{}return{tree:null,count:0,error:"未提取到菜单, 请确认已登录风神后台"+r}}let D=0;D=U(_),l(`菜单提取完成: 共 ${D} 个叶子页面`);try{const r=await a(pe),n=typeof r=="string"?JSON.parse(r):r;n&&n.found&&(l(`侧边栏诊断: <${n.tag}${n.cls?" class="+n.cls:""}> li×${n.li} ul×${n.ul} submenu×${n.submenu} menuItem×${n.item}`),n.submenu===0&&n.html&&l(`侧边栏结构(不含子菜单, 截断):
`+n.html.substring(0,1600)))}catch(r){h.warn(p,"侧边栏诊断失败",{error:r==null?void 0:r.message})}const M={name:"风神后台",url:t,function:"后台根",children:[],apis:[]};let k=0;const j=new Set,re=4,H=300;async function ne(){await a(C),await g(800);const r=await a(Z);try{const n=typeof r=="string"?JSON.parse(r):Array.isArray(r)?r:[];return Array.isArray(n)?n:[]}catch{return[]}}async function B(r,n){const c=Date.now();let w=-1,f=0;for(;Date.now()-c<r;){if(y&&y())return;const s=await a(he),x=typeof s=="number"?s:parseInt(s,10)||0;if(x===w){if(f||(f=Date.now()),Date.now()-f>=n)return}else w=x,f=0;await g(600)}}async function O(r,n,c,w,f){for(const s of r){let fe=function(d,E){const S=d.url||"",V=(S.split("#")[1]||"").toLowerCase(),K=d.frameUrls||[];for(const b of K){if(!b||b===S)continue;const Y=(b.split("#")[1]||"").toLowerCase();if(Y&&Y!==V)return b}for(const b of K)if(b&&b!==S)return b;for(const b of E)if(b&&b!==S)return b;return S};if(y&&y()){l("深度探索已取消");return}if(k>=H){l("达到最大节点数上限, 停止探索");return}if(s.type==="submenu"&&s.children&&s.children.length>0){const d={name:s.name,url:"",function:"",children:[],apis:[]};await O(s.children,d,c,w,f?`${f} / ${s.name}`:s.name),d.children.length>0&&n.children.push(d);continue}if(!s.name)continue;const x=f?`${f} / ${s.name}`:s.name;if(j.has(x))continue;j.add(x),l(`[${k+1}/${D}] 探索: ${x}`),await a(me),await a($),await a(C),await g(600);const oe=await a(ge(s.name)),q=ie(oe),ce=!!(q&&q.ok),F=q&&q.route||"",ue=[F,s.index,s.href].filter(Boolean);await g(1500),await B(9e3,1500);const I=await a(ve);let v={url:"",title:"",tableHeaders:[],inputs:[],apis:[],frameUrls:[]};try{v=typeof I=="string"?JSON.parse(I):I||v}catch(d){h.warn(p,"解析页面数据失败",{error:d==null?void 0:d.message})}const X=fe(v,ue),G=s.index||s.href||F||"",A={name:s.name,url:X,route:G||X,function:v.title||"",children:[],apis:v.apis||[],tableHeaders:v.tableHeaders||[],inputs:v.inputs||[],frameUrls:v.frameUrls||[],visited:ce};let W=!1;if(c<re&&k<H){const d=le(v,G);d&&d!==v.url?(l(`  直跳子应用: ${d.substring(0,80)}`),await a(`location.href = ${JSON.stringify(d)}`),await g(2500),await B(9e3,1500),await a($),await a(C),await g(600)):(v.iframeSrcs||[]).length>0&&l(`  无可直跳路由; iframe 列表: ${v.iframeSrcs.join(" | ").substring(0,180)}`);const E=await ne(),S=P(E);E.length>0&&S&&S!==w&&(l(`  发现子菜单 ${E.length} 项, 下钻探索 (层级 ${c+1})`),await O(E,A,c+1,S,x),W=!0),await a("try { history.back(); } catch(e) {}"),await g(2500),await a($),await g(400)}n.children.push(A),k++,l(`  完成: ${A.name} ${A.url?"("+A.url.substring(0,60)+")":""} API×${A.apis.length} 子×${A.children.length}${W?" [已下钻]":""}`)}}const se=P(_);await O(_,M,0,se,""),l(`深度探索完成: 访问 ${k} 个页面`);try{await m.close()}catch(r){h.warn(p,"关闭浏览器失败",{error:r==null?void 0:r.message})}const J={version:6,exploredAt:new Date().toISOString(),targetUrl:t,root:M};return ee(J),{tree:J,count:k,error:""}}catch(o){h.error(p,"深度探索失败",{error:o==null?void 0:o.message,stack:(N=o==null?void 0:o.stack)==null?void 0:N.substring(0,300)});try{await m.close()}catch{}return{tree:null,count:0,error:(o==null?void 0:o.message)||"未知错误"}}}export{$ as B,te as a,Se as c,ke as d,xe as e,_e as f,de as g,Ae as i,be as l};
