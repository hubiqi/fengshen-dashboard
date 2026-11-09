const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-DpvE-AlK.js","assets/index-SgcNJQPd.css","assets/browser-automation-DVjbVDE_.js"])))=>i.map(i=>d[i]);
import{al as P,l as d,_ as O}from"./index-DpvE-AlK.js";import{B as J}from"./backend-tree-DhrYWZnV.js";import{s as j}from"./common-D_4j3F24.js";function B(){try{const t=localStorage.getItem("fengshen_site_managers");if(t)return JSON.parse(t)}catch{}return{}}function ct(t){localStorage.setItem("fengshen_site_managers",JSON.stringify(t))}function K(t){return t?Array.isArray(t)?t.map(e=>typeof e=="object"?e.phone:String(e)).filter(e=>e&&e.length>0):typeof t=="string"?t.split(/[,，;；\s\n\r]+/).map(e=>e.trim()).filter(e=>e.length>0):[]:[]}function S(t){const e=B(),n=new Set;for(const r of t){const i=e[String(r)];for(const o of K(i))n.add(o)}return[...n]}const m="district",_="fengshen_site_districts",x="fengshen_at_mode",w=3e4,U="https://a.ele.me/app/fnjp-gfe/pikipek-apps/kpi/index.html?platform=fs#/kpi/detail",Y="https://aeolus.ele.me/?targetId=56740#/kpi/detail";function y(){try{const t=localStorage.getItem(_);if(!t)return{};const e=JSON.parse(t);return e&&typeof e=="object"?e:{}}catch(t){return d.warn(m,"读取商圈片映射失败",{error:t==null?void 0:t.message}),{}}}function b(t,{merge:e=!0}={}){try{const r={...e?y():{},...t};return localStorage.setItem(_,JSON.stringify(r)),d.info(m,"商圈片映射已保存",{total:Object.keys(r).length,added:Object.keys(t||{}).length}),r}catch(n){return d.error(m,"保存商圈片映射失败",{error:n==null?void 0:n.message}),null}}function D(t){return y()[String(t)]||null}function $(t){var e;return((e=D(t))==null?void 0:e.areaName)||""}function I(t){const e=y();return(t||[]).filter(n=>{var r;return!((r=e[String(n.id)])!=null&&r.areaName)})}function z(t){return!t||t.length===0?!1:I(t).length===0}function G(t){return!t||t.length===0?!1:I(t).length<t.length}const k="fengshen_site_districts_attempted",L=24*60*60*1e3;function C(){try{return JSON.parse(localStorage.getItem(k)||"{}")||{}}catch{return{}}}function V(t){try{const e=C(),n=Date.now();for(const r of t)e[String(r)]=n;localStorage.setItem(k,JSON.stringify(e))}catch(e){d.warn(m,"记录商圈片采集尝试失败",{error:e==null?void 0:e.message})}}function M(t,e=L){const n=C(),r=Date.now();return I(t).filter(i=>r-(n[String(i.id)]||0)>e)}function R(t,e){var o;const n=y(),r=e?new Set(e.map(String)):null,i=[];for(const s of Object.keys(n))((o=n[s])==null?void 0:o.areaName)===t&&(r&&!r.has(String(s))||i.push(s));return i}function W(t,e){var o;const n=y(),r={},i=[];for(const s of t){const l=(o=n[String(s)])==null?void 0:o.areaName;if(l){const a="A:"+l;r[a]||(r[a]={key:a,name:l,area:l,teamIds:[]},i.push(a)),r[a].teamIds.push(s)}else{const a="T:"+s;r[a]={key:a,name:e&&e[s]||"站点"+s,area:"",teamIds:[s]},i.push(a)}}return i.map(s=>r[s])}function X(t){if(!Array.isArray(t)||t.length===0)return t;const e=t.filter(r=>r.area);if(e.length<2)return t;const n=j(e.map(r=>r.name));return e.forEach((r,i)=>{n[i]&&(r.name=n[i])}),t}function N(){return localStorage.getItem(x)==="area"?"area":"site"}function F(t){localStorage.setItem(x,t==="area"?"area":"site"),d.info(m,"钉钉@模式已切换",{mode:N()})}function Q(t,e){var s;if(N()!=="area")return S(t);const n=y(),r=new Set;for(const l of t){const a=(s=n[String(l)])==null?void 0:s.areaName;a&&r.add(a)}if(r.size===0)return S(t);const i=e||Object.keys(n),o=new Set;for(const l of r)for(const a of R(l,i))o.add(a);return S([...o])}const H=`(function () {
  var rows = document.querySelectorAll('.ant-table-body tbody tr.ant-table-row, .ant-table-tbody tr.ant-table-row, table tbody tr').length;
  return JSON.stringify({
    rows: rows,
    title: document.title || '',
    url: location.href,
    hasLogin: !!document.querySelector('input[type=password]')
  });
})()`,Z=`(function () {
  function clean(s) { return (s == null ? '' : String(s)).replace(/\\s+/g, ' ').trim(); }
  var wrapper = document.querySelector('.ant-table-wrapper') || document;
  var ths = wrapper.querySelectorAll('.ant-table-header th.ant-table-cell');
  if (!ths.length) ths = wrapper.querySelectorAll('thead th');
  if (!ths.length) ths = document.querySelectorAll('th.ant-table-cell');
  var headers = [];
  for (var i = 0; i < ths.length; i++) headers.push(clean(ths[i].innerText || ths[i].textContent));
  function idxExact(name) { for (var i = 0; i < headers.length; i++) if (headers[i] === name) return i; return -1; }
  function idxContain(kw) { for (var i = 0; i < headers.length; i++) if (headers[i].indexOf(kw) >= 0) return i; return -1; }
  var siteIdIdx = idxExact('站点ID'); if (siteIdIdx < 0) siteIdIdx = idxContain('站点ID');
  var siteNameIdx = idxExact('站点名称'); if (siteNameIdx < 0) siteNameIdx = idxContain('站点名称');
  var areaNameIdx = idxExact('商圈片名称'); if (areaNameIdx < 0) areaNameIdx = idxContain('商圈片名称');
  var areaIdIdx = idxExact('商圈片ID'); if (areaIdIdx < 0) areaIdIdx = idxContain('商圈片ID');
  var trs = wrapper.querySelectorAll('.ant-table-body tbody tr.ant-table-row');
  if (!trs.length) trs = wrapper.querySelectorAll('tbody tr');
  var out = [];
  for (var r = 0; r < trs.length; r++) {
    if (trs[r].className && trs[r].className.indexOf('measure-row') >= 0) continue;
    var tds = trs[r].querySelectorAll('td');
    if (!tds.length) continue;
    function g(k) { return (k >= 0 && tds[k]) ? clean(tds[k].innerText || tds[k].textContent) : ''; }
    var sid = g(siteIdIdx);
    if (!sid) continue;
    out.push({ siteId: sid, siteName: g(siteNameIdx), areaName: g(areaNameIdx), areaId: g(areaIdIdx) });
  }
  var totalEl = document.querySelector('.ant-pagination-total-text');
  return JSON.stringify({
    ok: out.length > 0, headers: headers,
    idx: { siteIdIdx: siteIdIdx, siteNameIdx: siteNameIdx, areaNameIdx: areaNameIdx, areaIdIdx: areaIdIdx },
    rows: out, total: totalEl ? clean(totalEl.innerText) : ''
  });
})()`,tt=`(function () {
  var li = document.querySelector('.ant-pagination-next');
  if (!li) return JSON.stringify({ ok: false, reason: 'no-pagination' });
  if (li.getAttribute('aria-disabled') === 'true' || /disabled/.test(li.className || '')) {
    return JSON.stringify({ ok: false, reason: 'last-page' });
  }
  var btn = li.querySelector('button') || li;
  try { btn.click(); } catch (e) { return JSON.stringify({ ok: false, reason: 'click-fail' }); }
  return JSON.stringify({ ok: true });
})()`,et=`(function () {
  var btns = document.querySelectorAll('.ant-btn');
  for (var i = 0; i < btns.length; i++) {
    var t = (btns[i].innerText || btns[i].textContent || '').replace(/\\s/g, '');
    if (t === '查询') { try { btns[i].click(); return JSON.stringify({ ok: true }); } catch (e) {} }
  }
  var p = document.querySelector('.ant-btn-primary');
  if (p) { try { p.click(); return JSON.stringify({ ok: true, primary: true }); } catch (e) {} }
  return JSON.stringify({ ok: false });
})()`,v=`(function () {
  var out = [];
  function walk(doc, depth) {
    if (!doc || depth > 5) return;
    var win = doc.defaultView || doc.parentWindow;
    var caps = (win && win._capturedRequests) ? win._capturedRequests : [];
    for (var i = 0; i < caps.length; i++) {
      var c = caps[i];
      if (!c || !c.url) continue;
      if (c.url.indexOf('perfDetail') < 0 && c.url.indexOf('perfResultFs') < 0) continue;
      out.push({ url: c.url, method: c.method, requestBody: c.requestBody || '' });
    }
    var ifr = doc.querySelectorAll('iframe');
    for (var j = 0; j < ifr.length; j++) {
      try { var d = ifr[j].contentDocument; if (d) walk(d, depth + 1); } catch (e) {}
    }
  }
  walk(document, 0);
  return JSON.stringify(out);
})()`;function E(t){var e;if(!Array.isArray(t))return null;for(const n of t)if(!(!n||!n.url||n.url.indexOf("queryDetailList")<0)&&n.requestBody)try{const r=JSON.parse(n.requestBody),i=((e=r==null?void 0:r.params)==null?void 0:e.request)||(r==null?void 0:r.request)||r;if(i&&i.tabCode)return{tabCode:i.tabCode,planType:i.planType,agencyId:i.agencyId}}catch{}return null}async function q(t,e,n){const r=a=>{d.info(m,a),e&&e(a)},i=(t||[]).length,o=(t||[]).map(a=>String(a.id));if(o.length===0)return{ok:!1,map:{},matched:0,total:0,error:"无站点"};V(o);const s=Date.now()+w,l=()=>Date.now()>=s||(n?!!n():!1);r("正在通过考核运单接口采集商圈片...");try{const a=await P({siteIds:o,maxPages:10,timeoutMs:w,onProgress:p=>r(p)}),c=o.filter(p=>a[p]).length;if(c>0){const p=Date.now(),g={};for(const f of Object.keys(a))g[f]={...a[f],updatedAt:p};b(g,{merge:!0});const h=i-c;return d.info(m,"商圈片采集完成",{method:"api",matched:c,total:i,unmatched:h}),{ok:!0,map:a,matched:c,total:i,unmatched:h,method:"api"}}d.warn(m,"接口未匹配到任何站点, 回退页面采集")}catch(a){d.warn(m,"接口采集失败, 回退页面采集",{error:a==null?void 0:a.message})}return l()?(d.warn(m,"采集超时(30s), 停止采集"),{ok:!1,map:{},matched:0,total:i,error:"采集超时(30秒)，未匹配到站点"}):await rt(o,i,r,l)}async function rt(t,e,n,r){const{Capacitor:i}=await O(async()=>{const{Capacitor:a}=await import("./index-DpvE-AlK.js").then(c=>c.aE);return{Capacitor:a}},__vite__mapDeps([0,1])),o=(await O(async()=>{const{default:a}=await import("./browser-automation-DVjbVDE_.js");return{default:a}},__vite__mapDeps([2,0,1]))).default;if(!i.isNativePlatform())return{ok:!1,map:{},matched:0,total:e,error:"仅在App内可用(非原生环境)"};const s=a=>new Promise(c=>setTimeout(c,a)),l=async a=>{try{const{result:c}=await o.evaluateJavascript({code:a});if(c==null)return null;try{return JSON.parse(c)}catch{return c}}catch(c){return d.warn(m,"evalJs失败",{error:c==null?void 0:c.message}),null}};try{n("打开KPI考核明细页...");try{await o.open({url:Y})}catch(u){d.warn(m,"门户预热失败",{e:u==null?void 0:u.message})}await s(1500);try{await o.open({url:U})}catch(u){d.warn(m,"打开KPI应用失败",{e:u==null?void 0:u.message})}await l(J);let a=null;for(let u=0;u<15;u++){if(r&&r())return await o.close().catch(()=>{}),{ok:!1,map:{},matched:0,total:e,error:"已取消"};if(a=await l(H),a&&a.rows>0)break;await s(1e3)}if(a&&a.hasLogin)return await o.close().catch(()=>{}),{ok:!1,map:{},matched:0,total:e,error:"KPI页面未登录, 请先在App内登录"};let c=await l(v),p=E(c);p||(n("触发KPI查询以抓取接口参数..."),await l(et),await s(3e3),c=await l(v),p=E(c));let g={},h="";if(p&&p.tabCode){n("接口参数已获取, 开始分页采集...");try{g=await P({tabCode:p.tabCode,planType:p.planType,agencyId:p.agencyId,siteIds:t,maxPages:10,onProgress:u=>n(u)}),h="api"}catch(u){d.warn(m,"接口采集失败, 回退DOM翻页",{error:u==null?void 0:u.message}),g={}}}Object.keys(g).length===0&&(n("使用页面翻页采集..."),g=await at(l,s,t,n,r),h="dom"),await o.close().catch(()=>{});const f=t.filter(u=>g[u]).length;if(f>0){const u=Date.now(),A={};for(const T of Object.keys(g))A[T]={...g[T],updatedAt:u};b(A,{merge:!0})}return d.info(m,"商圈片采集完成",{method:h,matched:f,total:e}),{ok:f>0,map:g,matched:f,total:e,method:h,error:f>0?"":"未采集到商圈片数据"}}catch(a){d.error(m,"商圈片采集异常",{error:a==null?void 0:a.message});try{await o.close()}catch{}return{ok:!1,map:{},matched:0,total:e,error:(a==null?void 0:a.message)||"采集异常"}}}async function at(t,e,n,r,i){const o={},s=new Set(n),l=10;let a=1;for(;a<=l&&!(i&&i());){const c=await t(Z),p=c&&c.rows||[];for(const f of p)!f||!f.siteId||o[f.siteId]||(o[f.siteId]={siteId:f.siteId,siteName:f.siteName,areaName:f.areaName,areaId:f.areaId});const g=[...s].filter(f=>o[f]).length;if(r(`第${a}页: 已匹配 ${g}/${s.size} 个站点`),g>=s.size)break;const h=await t(tt);if(!h||!h.ok)break;a++,await e(1800)}return o}async function nt(t,e,n){const r=(t||[]).length;if(r===0)return{ok:!1,matched:0,total:0,error:"无可检查的站点"};const i=M(t);if(i.length===0){const s=r-I(t).length;return d.info(m,"商圈片无待采集站点(已标记或近期已尝试), 跳过",{total:r,matched:s}),{ok:!0,skipped:!0,matched:s,total:r}}return d.info(m,"启动检查: 有待采集站点",{pending:i.length,total:r}),e&&e(`检测到 ${i.length}/${r} 个站点待采集商圈片, 开始采集...`),{...await q(i,e,n),total:r}}const lt=Object.freeze(Object.defineProperty({__proto__:null,AT_MODE_KEY:x,COLLECT_TIMEOUT_MS:w,DISTRICT_ATTEMPTED_KEY:k,DISTRICT_KEY:_,collectSiteDistrictMapping:q,ensureSiteDistrictMapping:nt,getAreaByTeamId:D,getAreaNameByTeamId:$,getAtMobilesByMode:Q,getAtMode:N,getDistrictPendingSites:M,getMissingDistrictSites:I,getSiteDistrictMap:y,getTeamIdsByArea:R,groupTeamsByArea:W,hasAnyDistrictMapping:G,hasCompleteDistrictMapping:z,saveSiteDistrictMap:b,setAtMode:F,simplifyGroupNames:X},Symbol.toStringTag,{value:"Module"}));export{B as a,ct as b,q as c,y as d,W as e,X as f,N as g,G as h,$ as i,lt as j,F as s};
