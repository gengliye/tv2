/**
 * 飞刀影视集合规则
 * 作者：飞刀
 * 版本：20240706 beta17
 * 更新日志：
 * 20240706:
 * 1. 优化json分类数据解析，新增cate_excludes排除特定分类
 * 2. 增强搜索匹配逻辑，提升搜索结果准确性
 * 20240705:
 * 1. 修复json解析中$1参数传递问题
 * 2. 优化分类过滤逻辑，支持多级分类排除
 * 20240703:
 * 1. 在json中新增"searchable":0属性控制分类是否可搜索
 * 20240604:
 * 1. 优化首页推荐算法，提高内容质量
 * 2. 增强分类过滤功能
 */

// 全局函数：从数组中随机获取一个元素
globalThis.getRandomItem = function(items) {
  return items[Math.floor(Math.random() * items.length)];
}

// 影视解析规则配置
var rule = {
  title: '影视集合[飞刀]',         // 规则标题
  author: '飞刀',                 // 作者
  version: '20240706 beta17',     // 版本号
  update_info: `...更新日志...`,  // 更新信息
  
  // 基础API配置
  host: '',                       // 主域名
  homeTid: '',                    // 首页分类ID
  homeUrl: '/api.php/provide/vod/?ac=detail&t={{rule.homeTid}}', // 首页API
  detailUrl: '/api.php/provide/vod/?ac=detail&ids=fyid',         // 详情页API
  searchUrl: '/api.php/provide/vod/?wd=**&pg=#TruePage#',        // 搜索API
  classUrl: '/api.php/provide/vod/',                             // 分类API
  url: '/api.php/provide/vod/?ac=detail&pg=fypage&t=fyfilter',   // 通用API
  
  // 请求配置
  headers: {'User-Agent': 'MOBILE_UA'},  // 请求头
  timeout: 5000,                         // 超时时间(毫秒)
  limit: 20,                             // 每页数量
  search_limit: 5,                       // 搜索分页限制
  searchable: 1,                         // 是否可搜索
  quickSearch: 0,                        // 是否启用快速搜索
  filterable: 1,                         // 是否启用分类过滤
  play_parse: true,                      // 是否解析播放地址
  parse_url: '',                         // 播放地址解析URL
  search_match: false,                   // 搜索关键词严格匹配
  search_pic: true,                      // 搜索是否带图片
  
  // === 核心功能方法 ===
  
  // 分类解析
  class_parse: function() {
    // 如果支持批量获取功能
    if (typeof (batchFetch) === 'function') {
      rule.search_limit = 16;
      log('启用批量获取模式[批量获取]，搜索限制改为16');
    }
    
    let _url = rule.params;
    log('分类解析URL:' + _url);
    
    // 处理URL参数
    if (_url.includes('$')) {
      let _url_params = _url.split('$$');
      _url = _url_params[0];
      rule.search_match = !!(_url_params[1]);
      if (_url_params.length > 2) {
        rule.search_pic = !!(_url_params[2]);
      }
    }
    
    // 请求分类数据
    if (_url && typeof (_url) === 'string' && /^(http|file)/.test(_url)) {
      let html = request(_url);
      let json = JSON.parse(html);
      let _classes = [];
      rule.filter = {};
      rule.filter_def = {};
      
      // 处理每个分类
      json.forEach(item => {
        let _obj = {
          type_name: item.name,        // 分类名称
          type_id: item.url,           // 分类ID
          parse_url: item.parse_url || '', // 解析URL
          searchable: item.searchable !== 0, // 是否可搜索
          api: item.api || '',         // 自定义API
          cate_exclude: item.cate_exclude || '', // 排除分类
          cate_excludes: item.cate_excludes || [], // 排除分类列表
        };
        _classes.push(_obj);
        
        try {
          let json1 = [];
          // 获取分类下的子分类
          if (item.class_name && item.class_url) {
            // 处理分类名称编码
            if (!/&\d+[一-龥]+/.test(item.class_name)) {
              try {
                item.class_name = unGzip(item.class_name)
              } catch (e) {
                log(`分类名称解压失败:${e}`);
                return;
              }
            }
            
            // 处理多分类
            let names = item.class_name.split('&&');
            let urls = item.class_url.split('&&');
            let cnt = Math.min(names.length, urls.length);
            for (let i = 0; i < cnt; i++) {
              json1.push({
                'type_id': urls[i],
                'type_name': names[i]
              });
            }
          } else {
            json1 = JSON.parse(request(urljoin(_obj.type_id, rule.classUrl))).class;
          }
          
          // 应用分类排除规则
          if (_obj.cate_excludes && Array.isArray(_obj.cate_excludes) && _obj.cate_excludes.length > 0) {
            json1 = json1.filter(cl => !_obj.cate_excludes.includes(cl.type_name));
          } else if (_obj.cate_exclude) {
            json1 = json1.filter(cl => !new RegExp(_obj.cate_exclude, 'i').test(cl.type_name));
          }
          
          // 构建分类过滤器
          rule.filter[_obj.type_id] = [{
            "key": "分类",
            "name": "分类",
            "value": json1.map(i => ({"n": i.type_name, 'v': i.type_id}))
          }];
          
          if (json1.length > 0) {
            rule.filter_def[item.url] = {"分类": json1[0].type_id};
          }
        } catch (e) {
          // 分类获取失败时使用默认值
          rule.filter[item.url] = [{"key": "分类", "name": "分类", "value": [{"n": "全部", "v": ""}]}];
        }
      });
      
      rule.classes = _classes;
    }
  },
  
  // 首页解析
  home_parse: function() {
    let update_info = [{
      vod_name: '最新更新',      // 影视名称
      vod_id: 'update_info',    // 影视ID
      vod_remarks: `版本:${rule.version}`, // 备注
      vod_pic: 'https://ghproxy.net/https://raw.githubusercontent.com/hjdhjnx/hipy-server/master/app/static/img/logo.png' // 封面
    }];
    
    VODS = []; // 清空影视列表
    
    // 随机选择一个分类获取影视
    if (rule.classes) {
      let randomClass = getRandomItem(rule.classes);
      let _url = urljoin(randomClass.type_id, input);
      
      // 使用自定义API
      if (randomClass.api) {
        _url = _url.replace('/api.php/provide/vod/', randomClass.api);
      }
      
      try {
        let html = request(_url, {timeout: rule.timeout});
        let json = JSON.parse(html);
        VODS = json.list;
        
        // 处理影视ID和备注
        VODS.forEach(item => {
          item.vod_id = `${randomClass.type_id}$${item.vod_id}`;
          item.vod_remarks = (item.vod_remarks || '') + `|${randomClass.type_name}`;
        });
      } catch (e) {
        // 错误处理
      }
    }
    
    // 合并更新信息和影视列表
    VODS = update_info.concat(VODS);
  },
  
  // 分类页解析
  category_parse: function() {
    VODS = [];
    if (rule.classes) {
      let _url = urljoin(MY_CATE, input);
      let current_vod = rule.classes.find(item => item.type_id === MY_CATE);
      
      // 使用自定义API
      if (current_vod && current_vod.api) {
        _url = _url.replace('/api.php/provide/vod/', current_vod.api);
      }
      
      let html = request(_url);
      let json = JSON.parse(html);
      VODS = json.list;
      
      // 处理影视ID
      VODS.forEach(item => {
        item.vod_id = `${MY_CATE}$${item.vod_id}`;
      });
    }
  },
  
  // 详情页解析
  detail_parse: function() {
    VOD = {};
    if (oriId === 'update_info') {
      // 更新信息详情
      VOD = {
        vod_content: rule.update_info.trim(),
        vod_name: '最新更新',
        type_name: '更新日志',
        vod_pic: 'https://resource-cdn.tuxiaobei.com/video/FtWhs2mewX_7nEuE51_k6zvg6awl.png',
        vod_remarks: `版本:${rule.version}`,
        vod_play_from: '飞刀',
        vod_play_url: '更新日志$https://github.com/hjdhjnx/hipy-server'
      };
    } else {
      if (rule.classes) {
        let _url = urljoin(fyclass, input);
        let current_vod = rule.classes.find(item => item.type_id === fyclass);
        
        // 使用自定义API
        if (current_vod && current_vod.api) {
          _url = _url.replace('/api.php/provide/vod/', current_vod.api);
        }
        
        let html = request(_url);
        let json = JSON.parse(html);
        let data = json.list[0];
        
        // 添加来源信息
        if (current_vod && current_vod.type_name) {
          data.vod_play_from = data.vod_play_from.split('$$$').map(item => 
            current_vod.type_name + '|' + item
          ).join('$$$');
        }
        
        VOD = data;
      }
    }
  },
  
  // 搜索解析
  search_parse: function() {
    VODS = [];
    if (rule.classes) {
      // 获取可搜索的分类
      let canSearch = rule.classes.filter(item => item.searchable);
      let page = Number(MY_PAGE);
      
      // 计算真实页码
      let truePage = Math.ceil(MY_PAGE / Math.ceil(canSearch.length / rule.search_limit));
      
      if (rule.search_limit) {
        let start = (page - 1) * rule.search_limit;
        let end = page * rule.search_limit;
        let t1 = new Date().getTime();
        let searchMode = typeof (batchFetch) === 'function' ? '批量' : '单线程';
        
        log(`开始搜索:${KEY}, 模式:${searchMode}`);
        log(`搜索匹配:${rule.search_match}`);
        
        if (start < canSearch.length) {
          let search_classes = canSearch.slice(start, end);
          let urls = [];
          
          // 准备请求URL
          search_classes.forEach(item => {
            let _url = urljoin(item.type_id, input);
            if (item.api) {
              _url = _url.replace('/api.php/provide/vod/', item.api);
            }
            _url = _url.replace("#TruePage#", "" + truePage);
            urls.push(_url);
          });
          
          let results_list = [];
          let results = [];
          
          // 批量获取模式
          if (typeof (batchFetch) === 'function') {
            let reqUrls = urls.map(url => ({url: url, options: {timeout: rule.timeout}}));
            let res = batchFetch(reqUrls);
            let detailUrls = [];
            let detailUrlCount = 0;
            
            res.forEach((ret, idx) => {
              let item = search_classes[idx];
              if (ret) {
                try {
                  let json = JSON.parse(ret);
                  let data = json.list;
                  
                  // 添加来源信息
                  data.forEach(i => {
                    i.site_name = item.type_name;
                    i.vod_id = `${item.type_id}$${i.vod_id}`;
                    i.vod_remarks = (i.vod_remarks || '') + `|${item.type_name}`;
                  });
                  
                  // 关键词匹配过滤
                  if (rule.search_match) {
                    data = data.filter(item => 
                      item.vod_name && new RegExp(KEY, 'i').test(item.vod_name)
                  }
                  
                  if (data.length > 0) {
                    // 处理无封面情况
                    if (rule.search_pic && !data[0].vod_pic) {
                      log(`分类[${item.type_name}]搜索结果无封面图，尝试获取详情`);
                      
                      // 构造详情请求URL
                      let detailUrl = urls[idx].split('wd=')[0] + 
                        'ac=detail&ids=' + 
                        data.map(k => k.vod_id.split('$')[1]).join(',');
                      
                      detailUrls.push(detailUrl);
                      results_list.push({
                        data: data,
                        has_pic: false,
                        detailUrlCount: detailUrlCount
                      });
                      detailUrlCount++;
                    } else {
                      results_list.push({data: data, has_pic: true});
                    }
                  }
                  results = results.concat(data);
                } catch (e) {
                  log(`分类[${item.type_id}]搜索失败:${e.message}`);
                }
              }
            });
            
            // 批量获取详情
            if (detailUrls.length > 0) {
              let reqUrls2 = detailUrls.map(url => ({url: url, options: {timeout: rule.timeout}}));
              let res2 = batchFetch(reqUrls2);
              
              for (let k = 0; k < results_list.length; k++) {
                let result_data = results_list[k].data;
                if (!results_list[k].has_pic) {
                  try {
                    let detailJson = JSON.parse(res2[results_list[k].detailUrlCount]);
                    log(`详情获取结果数:${detailJson.list.length}`);
                    
                    // 匹配封面图
                    result_data.forEach((d, seq) => {
                      let detailVodPic = detailJson.list.find(vod => 
                        vod.vod_id.toString() === d.vod_id.split('$')[1]
                      );
                      if (detailVodPic) {
                        Object.assign(d, {vod_pic: detailVodPic.vod_pic});
                      }
                    });
                  } catch (e) {
                    log(`详情获取失败:${e.message}`);
                  }
                }
                results = results.concat(result_data);
              }
            }
          } else {
            // 单线程模式
            urls.forEach((_url, idx) => {
              let item = search_classes[idx];
              try {
                let html = request(_url);
                let json = JSON.parse(html);
                let data = json.list;
                
                // 添加来源信息
                data.forEach(i => {
                  i.site_name = item.type_name;
                  i.vod_id = `${item.type_id}$${i.vod_id}`;
                  i.vod_remarks = (i.vod_remarks || '') + `|${item.type_name}`;
                });
                
                // 关键词匹配过滤
                if (rule.search_match) {
                  data = data.filter(item => 
                    item.vod_name && new RegExp(KEY, 'i').test(item.vod_name)
                  }
                
                if (data.length > 0 && rule.search_pic && !data[0].vod_pic) {
                  log(`分类[${item.type_name}]搜索结果无封面图，尝试获取详情`);
                  try {
                    let detailUrl = _url.split('wd=')[0] + 'ac=detail&ids=' + 
                      data.map(k => k.vod_id.split('$')[1]).join(',');
                    
                    let detailHtml = request(detailUrl);
                    let detailJson = JSON.parse(detailHtml);
                    
                    // 匹配封面图
                    data.forEach((d, seq) => {
                      let detailVodPic = detailJson.list[seq];
                      if (detailVodPic) {
                        Object.assign(d, {vod_pic: detailVodPic.vod_pic});
                      }
                    });
                  } catch (e) {
                    log(`详情获取失败:${e.message}`);
                  }
                }
                
                results = results.concat(data);
              } catch (e) {
                log(`分类[${item.type_id}]搜索失败:${e.message}`);
              }
            });
          }
          
          VODS = results;
          let t2 = new Date().getTime();
          log(`${searchMode}搜索完成:${urls.length}个分类, 耗时${t2 - t1}ms`);
        }
      }
    }
  },
  
  // 播放地址懒解析
  lazy: function() {
    let parse_url = '';
    
    // 从flag中解析分类信息
    if (flag && flag.includes('|')) {
      let type_name = flag.split('|')[0];
      let current_vod = rule.classes.find(item => item.type_name === type_name);
      if (current_vod && current_vod.parse_url) {
        parse_url = current_vod.parse_url;
      }
    }
    
    // 直接播放地址（m3u8/mp4）
    if (/\.(m3u8|mp4)/.test(input)) {
      input = {parse: 0, url: input};
    } 
    // JSON格式解析
    else if (parse_url.startsWith('json:')) {
      let purl = parse_url.replace('json:', '') + input;
      let html = request(purl);
      input = {parse: 0, url: JSON.parse(html).url};
    } 
    // 普通解析
    else {
      input = parse_url + input;
    }
  }
};
