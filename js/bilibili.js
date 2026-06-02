/**
 * TVBox / FongMi / 影视仓 / EasyBox — Bilibili Spider
 * =====================================================
 * 文件结构:
 *   tvbox/
 *   ├─ bilibili.js          ← 本文件（Spider 逻辑）
 *   ├─ categories.json      ← 分类配置（可热更新，不改 JS）
 *   └─ login.html           ← 扫码登录辅助页
 *
 * TVBox config.json 配置示例:
 *   {
 *     "key":  "bilibili",
 *     "name": "哔哩哔哩",
 *     "type": 3,
 *     "api":  "http://你的服务器/tvbox/bilibili.js",
 *     "style": {"type":"rect","ratio":1.597},
 *     "searchable": 1,
 *     "quickSearch": 0,
 *     "filterable": 1,
 *     "ext": "http://你的服务器/tvbox/categories.json"
 *   }
 *   ext 也可传 Cookie:
 *     "ext": "{\"cookie\":\"SESSDATA=xxx\",\"catUrl\":\"http://你的服务器/tvbox/categories.json\"}"
 *
 * 版本: 2024-06
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// 全局状态
// ═══════════════════════════════════════════════════════════
var BASE_UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var REFERER  = 'https://www.bilibili.com';
var _cookie  = '';
var _wbiImg  = '';
var _wbiSub  = '';
var _wbiExpire = 0;   // wbi key 过期时间（每小时刷新一次）

// 分类配置（由 init 从外部 JSON 加载，也可内嵌回退）
var _cats    = null;  // { classes:[], filter:{} }

// ★ 默认分类 JSON 地址 — 与本 JS 同仓库，ext 不填或填相对路径时自动使用
var _DEFAULT_CAT_URL = 'https://raw.giteeusercontent.com/glytv/tv2/raw/main/json/categories.json';

// 静态备用 WBI key（B 站长期不更换，动态获取失败时降级）
var _IMG_FALLBACK = '7cd084941338484aae1ad9425b84077c';
var _SUB_FALLBACK = '4932caff0ff746eab6f01bf08b70ac45';

var _WBI_TAB = [
  46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
  27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
  37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,
  22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52
];

function log(s) { if (typeof console !== 'undefined') console.log('[Bili] ' + s); }

// ═══════════════════════════════════════════════════════════
// HTTP 请求（兼容 TVBox req / $request / fetch）
// ═══════════════════════════════════════════════════════════
function _get(url, extraHeaders) {
  var headers = {
    'User-Agent':      BASE_UA,
    'Referer':         REFERER,
    'Origin':          REFERER,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  };
  if (_cookie) headers['Cookie'] = _cookie;
  if (extraHeaders) {
    for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  try {
    var body = '';
    if (typeof req !== 'undefined') {
      var r1 = req(url, { headers: headers, method: 'GET' });
      body = r1.body || r1.content || String(r1);
    } else if (typeof $request !== 'undefined') {
      var r2 = $request(url, { headers: headers, method: 'GET' });
      body = r2.body || r2.content || String(r2);
    } else if (typeof fetch !== 'undefined') {
      var r3 = fetch(url, { headers: headers, method: 'GET' });
      body = typeof r3.text === 'function' ? r3.text() : String(r3.body);
    }
    return JSON.parse(body);
  } catch(e) {
    log('_get error: ' + e.message + '  url=' + url.substring(0, 80));
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// MD5 — blueimp-md5 移植版（通过标准向量验证）
// ═══════════════════════════════════════════════════════════
function _md5(string) {
  function sa(x,y){var l=(x&0xffff)+(y&0xffff),m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&0xffff);}
  function rl(x,c){return(x<<c)|(x>>>(32-c));}
  function cm(q,a,b,x,s,t){return sa(rl(sa(sa(a,q),sa(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cm((b&c)|(~b&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cm((b&d)|(c&~d),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cm(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cm(c^(b|~d),a,b,x,s,t);}
  function s2b(s){var b=[];for(var i=0;i<s.length*8;i+=8)b[i>>5]|=(s.charCodeAt(i/8)&0xff)<<(i%32);return b;}
  function b2h(b){var h='0123456789abcdef',r='';for(var i=0;i<b.length*4;i++)r+=h.charAt((b[i>>2]>>((i%4)*8+4))&0xf)+h.charAt((b[i>>2]>>((i%4)*8))&0xf);return r;}
  function core(x,l){
    x[l>>5]|=0x80<<(l%32);x[(((l+64)>>>9)<<4)+14]=l;
    var i,oa,ob,oc,od,a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(i=0;i<x.length;i+=16){
      oa=a;ob=b;oc=c;od=d;
      a=ff(a,b,c,d,x[i+0],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
      a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
      a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
      a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
      a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i+0],20,-373897302);
      a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
      a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
      a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
      a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
      a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
      a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i+0],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
      a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
      a=ii(a,b,c,d,x[i+0],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
      a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
      a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
      a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
      a=sa(a,oa);b=sa(b,ob);c=sa(c,oc);d=sa(d,od);
    }
    return [a,b,c,d];
  }
  var bs = unescape(encodeURIComponent(string));
  return b2h(core(s2b(bs), bs.length * 8));
}

// ═══════════════════════════════════════════════════════════
// WBI 签名（严格按照官方 API 文档）
// ═══════════════════════════════════════════════════════════
function _fetchWbi() {
  var now = Math.round(Date.now() / 1000);
  if (_wbiImg && _wbiSub && now < _wbiExpire) return;   // 未过期直接返回
  try {
    var d = _get('https://api.bilibili.com/x/web-interface/nav');
    // 未登录 code=-101 但 wbi_img 依然存在
    var wi = d && d.data && d.data.wbi_img;
    if (wi && wi.img_url && wi.sub_url) {
      var img = wi.img_url.split('/').pop().replace(/\.\w+$/,'');
      var sub = wi.sub_url.split('/').pop().replace(/\.\w+$/,'');
      if (/^[0-9a-f]{32}$/.test(img)) {
        _wbiImg = img; _wbiSub = sub;
        _wbiExpire = now + 3600;   // 1 小时后重新拉取
        log('WBI keys 动态获取: ' + img.substring(0,8) + '...');
        return;
      }
    }
  } catch(e) { log('fetchWbi err: ' + e.message); }
  // 降级静态 key
  if (!_wbiImg) {
    _wbiImg = _IMG_FALLBACK;
    _wbiSub = _SUB_FALLBACK;
    _wbiExpire = now + 600;
    log('WBI keys 使用静态备用');
  }
}

function _mixinKey() {
  var raw = _wbiImg + _wbiSub;
  return _WBI_TAB.map(function(n){ return raw[n]; }).join('').slice(0, 32);
}

// encodeURIComponent + 百分号字母强制大写（B 站规范要求）
function _enc(s) {
  return encodeURIComponent(String(s)).replace(/%[0-9a-f]{2}/gi, function(m){
    return m.toUpperCase();
  });
}

function _sign(params) {
  _fetchWbi();
  var mk  = _mixinKey();
  var wts = Math.round(Date.now() / 1000);
  var p = {}; for (var k in params) p[k] = params[k];
  p.wts = wts;
  var qs = Object.keys(p).sort().map(function(k){
    return _enc(k) + '=' + _enc(String(p[k]).replace(/[!'()*]/g,''));
  }).join('&');
  return qs + '&w_rid=' + _md5(qs + mk);
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════
function _dur(v) {
  if (typeof v === 'string' && v.indexOf(':') > -1) return v;
  v = parseInt(v) || 0;
  var m = Math.floor(v/60), s = v%60;
  return (m<10?'0'+m:m)+':'+(s<10?'0'+s:s);
}
function _pic(u) {
  if (!u) return '';
  u = String(u);
  return u.indexOf('http') === 0 ? u : 'https:' + u;
}
function _plain(s) { return (s||'').replace(/<[^>]+>/g,''); }
function _isNum(s) { return /^\d+$/.test(String(s)); }

function _toVod(item) {
  return {
    vod_id:      item.bvid || String(item.aid||''),
    vod_name:    _plain(item.title || item.arcname || ''),
    vod_pic:     _pic(item.pic || (item.cover && item.cover.unclipped) || item.cover || ''),
    vod_remarks: _dur(item.duration || 0),
  };
}

// ═══════════════════════════════════════════════════════════
// 分类配置加载（支持外部 JSON URL 或内嵌回退）
// ═══════════════════════════════════════════════════════════
var _BUILTIN_CATS = {
  classes: [
    { type_name:'🧭自学娱乐', type_id:'小学'     },
    { type_name:'✍️小学语文', type_id:'小学语文'  },
    { type_name:'✍️小学数学', type_id:'小学数学'  },
    { type_name:'✍️小学英语', type_id:'小学英语'  },
    { type_name:'⛪小灯塔',   type_id:'小灯塔'    },
    { type_name:'⛪奥数思维', type_id:'少儿思维'  },
    { type_name:'⛪英语自学', type_id:'自然拼读'  },
    { type_name:'🔑登录配置', type_id:'peizhi'   },
  ],
  filter: {}
};

function _loadCats(url) {
  if (!url) { _cats = _BUILTIN_CATS; return; }
  try {
    var d = _get(url);
    if (d && d.classes && d.classes.length > 0) {
      _cats = d;
      log('分类配置加载成功: ' + d.classes.length + ' 个分类');
    } else {
      _cats = _BUILTIN_CATS;
      log('分类 JSON 格式异常，使用内嵌默认');
    }
  } catch(e) {
    _cats = _BUILTIN_CATS;
    log('分类 JSON 加载失败: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// B 站 API 调用
// ═══════════════════════════════════════════════════════════
function _search(keyword, page, order, tids, duration) {
  var p = { keyword: keyword, search_type: 'video', page: page||1, page_size: 20 };
  if (order    && order    !== '0') p.order    = order;
  if (tids     && tids     !== '0') p.tids     = tids;
  if (duration && duration !== '0') p.duration = duration;

  var qs = _sign(p);
  // 优先新版 wbi 路径，降级旧路径
  var d = _get('https://api.bilibili.com/x/web-interface/wbi/search/type?' + qs);
  if (!d || !d.data || d.code === -403 || (d.data && d.data.v_voucher)) {
    log('search: 新接口受限，降级');
    d = _get('https://api.bilibili.com/x/web-interface/search/type?' + qs);
  }
  return ((d && d.data && d.data.result) || []).map(_toVod);
}

function _newlist(tid, page, order) {
  var qs = _sign({ rid: tid, ps: 20, pn: page||1, order: order||'pubdate' });
  var d  = _get('https://api.bilibili.com/x/web-interface/newlist?' + qs);
  return ((d && d.data && d.data.archives) || []).map(_toVod);
}

// ═══════════════════════════════════════════════════════════
// Spider 接口
// ═══════════════════════════════════════════════════════════

/**
 * init
 * ext 三种写法均支持:
 *   1. URL 字符串: "http://host/tvbox/categories.json"
 *   2. JSON 字符串: '{"cookie":"SESSDATA=xxx","catUrl":"http://..."}'
 *   3. 空字符串: 使用内嵌默认分类
 */
function init(cfg) {
  try {
    var s = (typeof cfg === 'string') ? cfg.trim() : '';

    // ── 情况1: 空 / 相对路径 / 无效路径 → 用默认 URL ──────────
    if (!s || s.indexOf('./') === 0 || s.indexOf('../') === 0) {
      log('ext 为空或相对路径，使用默认 catUrl');
      _loadCats(_DEFAULT_CAT_URL);
      return JSON.stringify({});
    }

    // ── 情况2: JSON 字符串 ────────────────────────────────────
    if (s.charAt(0) === '{') {
      var obj = JSON.parse(s);
      if (obj.cookie)   _cookie = obj.cookie;
      if (obj.sessdata) _cookie = 'SESSDATA=' + obj.sessdata;
      // catUrl 未填则用默认
      _loadCats(obj.catUrl || _DEFAULT_CAT_URL);
      return JSON.stringify({});
    }

    // ── 情况3: 完整 HTTP URL ──────────────────────────────────
    if (s.indexOf('http') === 0) {
      var d = _get(s);
      if (d && d.cookie) {
        // 是登录配置 JSON
        _cookie = d.cookie;
        _loadCats(d.catUrl || _DEFAULT_CAT_URL);
      } else if (d && d.classes) {
        // 直接是分类 JSON
        _cats = d;
        log('ext URL 直接作为分类配置，共 ' + d.classes.length + ' 个分类');
      } else {
        // 尝试把 URL 当分类 JSON 加载
        _loadCats(s);
      }
      return JSON.stringify({});
    }

    // ── 其他情况降级 ──────────────────────────────────────────
    _loadCats(_DEFAULT_CAT_URL);
  } catch(e) {
    log('init error: ' + e.message);
    _loadCats(_DEFAULT_CAT_URL);
  }
  return JSON.stringify({});
}

/**
 * home — 分类列表
 * 同时返回 class（TVBox）和 list（FongMi/影视仓）两个字段做兼容
 */
function home(filter) {
  if (!_cats) _cats = _BUILTIN_CATS;
  var classes = _cats.classes || [];
  // 登录配置项固定放最后，若配置里没有则自动追加
  var hasPeizhi = classes.some(function(c){ return c.type_id === 'peizhi'; });
  var displayList = hasPeizhi ? classes : classes.concat([{ type_name:'🔑登录配置', type_id:'peizhi' }]);

  return JSON.stringify({
    class:   displayList,   // TVBox
    list:    displayList,   // FongMi / 影视仓 / EasyBox
    filters: _cats.filter || {},
  });
}

/**
 * homeVod — 首页默认内容
 */
function homeVod() {
  try {
    var list = _search('小学', 1, '', '', '');
    return JSON.stringify({ list: list });
  } catch(e) {
    return JSON.stringify({ list: [] });
  }
}

/**
 * category — 分类视频列表（核心路由）
 *
 * type_id 路由规则:
 *   "peizhi"  → 登录配置说明页（含扫码登录入口）
 *   纯数字    → B 站分区 newlist 接口
 *   中文词    → B 站搜索接口（extend.tid 子关键词优先）
 */
function category(tid, page, filter, extend) {
  page   = parseInt(page) || 1;
  extend = extend || {};
  try {
    // ── 登录配置页 ─────────────────────────────────────
    if (tid === 'peizhi') {
      return JSON.stringify({
        list: [{
          vod_id:      '_login_',
          vod_name:    _cookie ? '✅ 已登录（点击查看状态）' : '🔑 未登录 — 点击查看登录说明',
          vod_pic:     'https://i0.hdslb.com/bfs/archive/be27fd62c99036dce67efface486fb0a88ffed06.jpg',
          vod_remarks: _cookie ? '已登录' : '游客模式',
          vod_content: _cookie
            ? '当前已登录，可获取最高 1080P（大会员可到 4K）。\n\nCookie 有效期约 180 天，到期后需重新登录。'
            : [
                '【游客模式】最高 360P，大部分内容可正常播放。',
                '',
                '【登录后最高 1080P / 4K】扫码登录步骤：',
                '1. 在同一局域网内的电脑/手机浏览器打开 login.html',
                '2. 用 B 站 App 扫描页面上的二维码',
                '3. 页面会自动显示你的 SESSDATA 值',
                '4. 复制到 TVBox 配置 ext 字段：',
                '   {"cookie":"SESSDATA=你的值","catUrl":"http://你的服务器/categories.json"}',
                '5. 重新加载站点即可生效',
              ].join('\n'),
        }],
        page: 1, pagecount: 1,
      });
    }

    // ── 数字 tid → 分区接口 ────────────────────────────
    if (_isNum(tid)) {
      var ord1 = (extend.order && extend.order !== '0') ? extend.order : 'pubdate';
      var lst1 = _newlist(tid, page, ord1);
      return JSON.stringify({ list: lst1, page: page, pagecount: 50 });
    }

    // ── 中文词 → 搜索接口 ─────────────────────────────
    var keyword  = (extend.tid && extend.tid !== '') ? extend.tid : tid;
    var order    = (extend.order    && extend.order    !== '0') ? extend.order    : '';
    var tids     = (extend.tids     && extend.tids     !== '0') ? extend.tids     : '';
    var duration = (extend.duration && extend.duration !== '0') ? extend.duration : '';
    var lst2 = _search(keyword, page, order, tids, duration);
    return JSON.stringify({ list: lst2, page: page, pagecount: 50 });

  } catch(e) {
    log('category error: ' + e.message);
    return JSON.stringify({ list: [], page:1, pagecount:1 });
  }
}

/**
 * detail — 视频详情 + 多 P 分集
 */
function detail(id) {
  try {
    if (id === '_login_') {
      return JSON.stringify({ list:[{ vod_id:'_login_', vod_name:'登录说明',
        vod_play_from:'说明', vod_play_url:'登录说明$_login_' }] });
    }
    var url = /^BV/i.test(id)
      ? 'https://api.bilibili.com/x/web-interface/view?bvid=' + id
      : 'https://api.bilibili.com/x/web-interface/view?aid='  + id;
    var d = _get(url);
    if (!d || !d.data) return JSON.stringify({ list:[] });
    var v = d.data, bvid = v.bvid;
    var pages = (v.pages && v.pages.length) ? v.pages : [{ page:1, part:v.title, cid:v.cid }];
    return JSON.stringify({ list:[{
      vod_id:        bvid,
      vod_name:      v.title,
      vod_pic:       _pic(v.pic),
      vod_area:      (v.owner && v.owner.name) || '',
      vod_remarks:   _dur(v.duration),
      vod_content:   v.desc || '',
      vod_play_from: 'B站',
      vod_play_url:  pages.map(function(p){
        return 'P'+p.page+' '+(p.part||('第'+p.page+'集'))+'$'+bvid+'?cid='+p.cid+'&p='+p.page;
      }).join('#'),
    }]});
  } catch(e) {
    log('detail error: ' + e.message);
    return JSON.stringify({ list:[] });
  }
}

/**
 * search — 关键词搜索
 */
function search(keyword, quick, pg) {
  try {
    return JSON.stringify({ list: _search(keyword, parseInt(pg)||1, '','','') });
  } catch(e) {
    return JSON.stringify({ list:[] });
  }
}

/**
 * play — 获取播放流
 * id 格式: BVxxxxxx?cid=123456&p=1
 */
function play(flag, id, flags) {
  try {
    if (id === '_login_') return JSON.stringify({ parse:0, url:'', header:{} });

    var bvid = id.split('?')[0];
    var qp   = {};
    (id.split('?')[1]||'').split('&').forEach(function(seg){
      var kv=seg.split('='); if(kv[0]) qp[kv[0]]=kv[1]||'';
    });
    var cid = qp.cid || '';
    var p   = qp.p   || '1';

    // cid 缺失时先查 view 接口
    if (!cid) {
      var info = _get('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid);
      if (info && info.data && info.data.pages) {
        var pg = null;
        for (var i=0;i<info.data.pages.length;i++) {
          if (String(info.data.pages[i].page) === String(p)) { pg=info.data.pages[i]; break; }
        }
        if (!pg) pg = info.data.pages[0];
        if (pg) cid = String(pg.cid);
      }
      if (!cid) return JSON.stringify({ parse:0, url:'', header:{} });
    }

    var pd = _get(
      'https://api.bilibili.com/x/player/wbi/playurl?bvid='+bvid+'&cid='+cid+'&fnval=16&fnver=0&fourk=1&qn=80'
    );
    if (!pd || !pd.data) throw new Error('no playdata');
    var data = pd.data;

    var h = { 'User-Agent': BASE_UA, 'Referer': REFERER };
    var danmaku = 'https://comment.bilibili.com/' + cid + '.xml';

    // DASH 双轨
    if (data.dash) {
      var vs = (data.dash.video||[]).sort(function(a,b){return b.id-a.id;});
      var as = (data.dash.audio||[]).sort(function(a,b){return b.id-a.id;});
      var vu = vs[0] && (vs[0].base_url || vs[0].baseUrl);
      var au = as[0] && (as[0].base_url || as[0].baseUrl);
      if (vu) return JSON.stringify({
        parse:0, url:[{url:vu,type:'video/mp4'},{url:au,type:'audio/mp4'}],
        header:h, danmaku:danmaku
      });
    }

    // 降级 durl
    if (data.durl && data.durl.length) {
      var best = data.durl.reduce(function(a,b){ return a.size>b.size?a:b; });
      return JSON.stringify({ parse:0, url:best.url, header:h, danmaku:danmaku });
    }
    throw new Error('no stream');
  } catch(e) {
    log('play error: ' + e.message);
    return JSON.stringify({ parse:0, url:'', header:{} });
  }
}

// ═══════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════
var spider = { init:init, home:home, homeVod:homeVod, category:category, detail:detail, search:search, play:play };
if (typeof module     !== 'undefined') module.exports = spider;
if (typeof globalThis !== 'undefined') globalThis.spider = spider;
