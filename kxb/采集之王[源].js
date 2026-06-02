/**
 * 采集之王规则引擎。祝您使用愉快！！！
 * 不解释：
 * 调用 ?type=url&params=../json/采集.json
 * 说明：
 * 调用 ?type=url&params=../json/采集列表.json$1
 * 调用 ?type=url&params=../json/采集[zy]列表.json$1
 * 调用 ?type=url&params=../json/采集[飞]列表.json$1
 * hipy-server作者B站UID:316077170
 * 调用 ?type=url&params=../json/采集列表.json$1@采集分类[爹]
 * 调用 ?type=url&params=../json/采集[zy]列表.json$1@采集分类[飞]
 * 调用 ?type=url&params=../json/采集[飞]列表.json@采集分类[飞]
 * [{"name":"麻花影视","url":"https://bfzyapi.com","parse_url":""},{"name":"飞达影视","url":"http://www.feidaozy.com","parse_url":""},{"name":"黑木耳影视","url":"https://www.heimuer.tv","parse_url":""}]
 */

globalThis.getRandomItem = function(items) { // 从数组中随机获取一个元素
    return items[Math.random() * items.length | 0];
}

var rule = {
    title: '采集分类[爹]',
    author: '作者哥',
    version: '20240706 beta17',
    update_info: `
20240706:
1.列表json支持cate_excludes字段过滤掉指定分类
2.增加采集分类字段支持过滤条件正则匹配
20240705:
1.支持调用json参数$1 这样的随机参数，用于防止缓存导致数据不更新
2.支持调用参数$1$1 这样的随机参数，用于防止缓存导致获取数据。$1$不参与拼接缓存。注意是分类有拼接[去空格保留]的情况需要手动关闭
3.优化两个字段过滤分类拼接的类目
4.优化某个分类拼接和分类翻页随机参数问题#改一下
20240703:
1.采集json支持"searchable": 0,用于禁止搜索
20240604:
1.增加采集分页随机参数随机化。调用参数随机获取字符串。
2.增加采集随机随机生成随机数
【紧急修复】修复调用json获取分类的xpath解析，由于部分网站返回xml和json混杂，但是具有采集xml的混淆，具体有采集xml的/老式接口等
有部分分类的json解析不是标准的/api.php/provide/vod/,需要在采集列表.json中标注正确的api路径：/api.php/provide/vod/at/json/
有些分类的采集字段是乱码的字符串，需要提供列表.json的parse_url标注解析规则，需要解析json里的parse_url路径
分类列表主页大部分字段下面过滤数据均已添加过滤条件（或者正则过滤分类字段）
`.trim(),
    host: '',
    homeTid: '', // 增加采集分类。一般一个分类的必须的采集id。可以设置
    homeUrl: '/api.php/provide/vod/?ac=detail&t={{rule.homeTid}}',
    detailUrl: '/api.php/provide/vod/?ac=detail&ids=fyid',
    searchUrl: '/api.php/provide/vod/?wd=**&pg=#TruePage##page=fypage',
    classUrl: '/api.php/provide/vod/',
    url: '/api.php/provide/vod/?ac=detail&pg=fypage&t=fyfilter',
    filter_url: '{{fl.类别}}',
    headers: { 'User-Agent': 'MOBILE_UA' },
    timeout: 5000,
    limit: 20,
    search_limit: 5, // 搜索每页显示数量，可以修改，但是不要超过搜索
    searchable: 1, // 是否启用搜索
    quickSearch: 0, // 是否启用快速搜索
    filterable: 1, // 是否启用分类筛选
    play_parse: true,
    parse_url: '', // 这个变量是用于调用采集规则的分类如果有特定的解析规则的话。尽量避免在采集.json里的parse_url有效
    search_match: false, // 搜索模糊匹配精确匹配
    search_pic: true, // 搜索模糊匹配精确匹配需要获取分类
    // params: 'http://127.0.0.1:5707/files/json/采集.json',
    // params: 'http://127.0.0.1:5707/files/json/采集列表.json$1',
    // params: 'http://127.0.0.1:5707/files/json/采集[zy]列表.json$1',
    // hostJs:$js.toString()=>{
    //
    // }),
    初始化: $js.toString(() => {
        function getClasses(item) {
            let classes = [];
            if (item.class_name && item.class_url) {
                if (!/&[\u4E00-\u9FA5]+/.test(item.class_name)) {
                    try {
                        item.class_name = unzip(item.class_name)
                    } catch (e) {
                        log(`不正确的class_name解压gzip导致错误:${e}`)
                        return classes
                    }
                }
                let names = item.class_name.split('&&');
                let urls = item.class_url.split('&&');
                let cnt = Math.min(names.length, urls.length);
                for (let i = 0; i < cnt; i++) {
                    classes.push({
                        'type_id': urls[i],
                        'type_name': names[i]
                    });
                }
            }
            return classes
        }

        if (typeof (batchFetch) === 'function') {
            // 支持并发请求抓取数据。搜索最多页数16
            rule.search_limit = 16;
            log('检测到并发请求[batchFetch],搜索页数已调整至16');
        }
        let _url = rule.params;
        log(`调用参数:${_url}`);
        if (_url && typeof (_url) === 'string' && /^(http|file)/.test(_url)) {
            if (_url.includes('$')) {
                let _url_params = _url.split('$');
                _url = _url_params[0];
                rule.search_match = !!(_url_params[1]);
                if (_url_params.length > 2) { // 获取分类
                    rule.search_pic = !!(_url_params[2]);
                }
            }
            let html = request(_url);
            let json = JSON.parse(html);
            let _classes = [];
            rule.filter = {};
            rule.filter_def = {};
            json.forEach(it => {
                let _obj = {
                    type_name: it.name,
                    type_id: it.url,
                    parse_url: it.parse_url || '',
                    searchable: it.searchable !== 0,
                    api: it.api || '',
                    cate_exclude: it.cate_exclude || '',
                    cate_excludes: it.cate_excludes || [],
                    // class_name: it.class_name || '',
                    // class_url: it.class_url || '',
                };
                _classes.push(_obj);
                try {
                    let json1 = [];
                    if (it.class_name && it.class_url) {
                        json1 = getClasses(it);
                    } else {
                        json1 = JSON.parse(request(urljoin(_obj.type_id, _obj.api || rule.classUrl))).class;
                    }
                    if (_obj.cate_excludes && Array.isArray(_obj.cate_excludes) && _obj.cate_excludes.length > 0) {
                        json1 = json1.filter(cl => !_obj.cate_excludes.includes(cl.type_name));
                    } else if (_obj.cate_exclude) {
                        json1 = json1.filter(cl => !new RegExp(_obj.cate_exclude, 'i').test(cl.type_name));
                    }
                    rule.filter[_obj.type_id] = [{
                        "key": "类别", "name": "类别", "value": json1.map(i => {
                            return { "n": i.type_name, 'v': i.type_id }
                        })
                    }];
                    if (json1.length > 0) {
                        rule.filter_def[it.url] = { "类别": json1[0].type_id };
                    }
                } catch (e) {
                    rule.filter[it.url] = [{ "key": "类别", "name": "类别", "value": [{ "n": "全部", "v": "" }] }];
                }
            });
            rule.classes = _classes;
        }
    }),
    class_parse: $js.toString(() => {
        input = rule.classes;
    }),
    采集: $js.toString(() => {
        let update_info = [{
            vod_name: '采集更新',
            vod_id: 'update_info',
            vod_remarks: `版本:${rule.version}`,
            vod_pic: 'https://ghproxy.net/https://raw.githubusercontent.com/hjdh nx/hippy-server/master/app/static/img/logo.png'
        }];
        VODS = [];
        if (rule.classes) {
            let randomClass = getRandomItem(rule.classes);
            let _url = urljoin(randomClass.type_id, input);
            if (randomClass.api) {
                _url = _url.replace('/api.php/provide/vod/', randomClass.api)
            }
            try {
                let html = request(_url, { timeout: rule.timeout });
                let json = JSON.parse(html);
                VODS = json.list;
                VODS.forEach(it => {
                    it.vod_id = randomClass.type_id + '$' + it.vod_id;
                    it.vod_remarks = it.vod_remarks + '|' + randomClass.type_name;
                });
            } catch (e) {
            }
        }
        VODS = update_info.concat(VODS);
    }),
    一页: $js.toString(() => {
        VODS = [];
        if (rule.classes) {
            // log(input);
            let _url = urljoin(MY_CATE, input);
            let current_vod = rule.classes.find(item => item.type_id === MY_CATE);
            if (current_vod && current_vod.api) {
                _url = _url.replace('/api.php/provide/vod/', current_vod.api)
            }
            let html = request(_url);
            let json = JSON.parse(html);
            VODS = json.list;
            VODS.forEach(it => {
                it.vod_id = MY_CATE + '$' + it.vod_id
            });
        }
    }),
    // 一页: 'json:list;vod_name;vod_pic;vod_remarks;vod_id;vod_play_from',
    二页: $js.toString(() => {
        VOD = {};
        if (orId === 'update_info') {
            VOD = {
                vod_content: rule.update_info.trim(),
                vod_name: '采集更新',
                type_name: '采集更新',
                vod_pic: 'https://resource-tuxiaobei.com/video/FtWhs2mewXW_7nEuE51_k6zvg6awl.png',
                vod_remarks: `版本:${rule.version}`,
                vod_play_from: '作者在隔壁',
                // vod_play_url: '菊花资源$https://resource-cdn.tuxiaobei.com/video/10/8f/108fc9d1ac3f69d29a738cdc097c9018.mp4',
                vod_play_url: '随机测试$http://api.yujn.cn/api/zzxjj.php',
            };
        } else {
            if (rule.classes) {
                let _url = urljoin(fyclass, input);
                let current_vod = rule.classes.find(item => item.type_id === fyclass);
                if (current_vod && current_vod.api) {
                    _url = _url.replace('/api.php/provide/vod/', current_vod.api)
                }
                let html = request(_url);
                let json = JSON.parse(html);
                let data = json.list;
                VOD = data[0];
                if (current_vod && current_vod.type_name) {
                    VOD.vod_play_from = VOD.vod_play_from.split('$$$$').map(it => current_vod.type_name + '|' + it).join('$$$$')
                }
            }
        }
    }),
    搜索: $js.toString(() => {
        VODS = [];
        if (rule.classes) {
            let canSearch = rule.classes.filter(it => it.searchable);
            let page = Number(MY_PAGE);
            page = (MY_PAGE - 1) % Math.ceil(canSearch.length / rule.search_limit) + 1;
            let truePage = Math.ceil(MY_PAGE / Math.ceil(canSearch.length / rule.search_limit));
            if (rule.search_limit) {
                let start = (page - 1) * rule.search_limit;
                let end = page * rule.search_limit;
                let t1 = new Date().getTime();
                let searchMode = typeof (batchFetch) === 'function' ? '并发' : '顺序';
                log('start:' + start);
                log('end:' + end);
                log('搜索模式:' + searchMode);
                log('模糊匹配:' + rule.search_match);
                // log('t1:' + t1);
                if (start < canSearch.length) {
                    let search_classes = canSearch.slice(start, end);
                    let urls = [];
                    search_classes.forEach(it => {
                        let _url = urljoin(it.type_id, input);
                        if (it.api) {
                            _url = _url.replace('/api.php/provide/vod/', it.api)
                        }
                        _url = _url.replace("#TruePage#", "" + truePage);
                        urls.push(_url);
                    });
                    let results_list = [];
                    let results = [];
                    if (typeof (batchFetch) === 'function') {
                        let reqUrls = urls.map(it => {
                            return {
                                url: it,
                                options: { timeout: rule.timeout }
                            }
                        });
                        let rets = batchFetch(reqUrls);
                        let detailUrls = [];
                        let detailUrlCount = 0;
                        rets.forEach((ret, idx) => {
                            let it = search_classes[idx];
                            if (ret) {
                                try {
                                    let json = JSON.parse(ret);
                                    let data = json.list;
                                    data.forEach(i => {
                                        i.site_name = it.type_name;
                                        i.vod_id = it.type_id + '$' + i.vod_id;
                                        i.vod_remarks = i.vod_remarks + '|' + it.type_name;
                                    });
                                    if (rule.search_match) {
                                        data = data.filter(item => item.vod_name && (new RegExp(KEY, 'i')).test(item.vod_name))
                                    }
                                    if (data.length > 0) {
                                        if (rule.search_pic && !data[0].vod_pic) {
                                            log(`当前搜索网站【${it.type_name}】没有分类，需要二次获取详细数据`);
                                            let detailUrl = urls[idx].split('wd=')[0] + 'ac=detail&ids=' + data.map(k => k.vod_id.split('$')[1]).join(',');
                                            detailUrls.push(detailUrl);
                                            results_list.push({
                                                data: data,
                                                has_pic: false,
                                                detailUrlCount: detailUrlCount
                                            });
                                            detailUrlCount++;
                                        } else {
                                            results_list.push({ data: data, has_pic: true });
                                        }
                                    }
                                } catch (e) {
                                    log(`错误:${it.type_id}请求失败:${e.message}`)
                                }
                            }
                        });
                        // 处理二次请求的batchFetch
                        let reqUrls2 = detailUrls.map(it => {
                            return {
                                url: it,
                                options: { timeout: rule.timeout }
                            }
                        });
                        let rets2 = batchFetch(reqUrls2);
                        for (let k = 0; k < results_list.length; k++) {
                            let result_data = results_list[k].data;
                            if (!results_list[k].has_pic) {
                                try {
                                    let detailJson = JSON.parse(rets2[results_list[k].detailUrlCount]);
                                    log('二页分类数据数量:' + detailJson.list.length);
                                    result_data.forEach((d, _seq) => {
                                        let detailVodPic = detailJson.list.find(vod => vod.vod_id.toString() === d.vod_id.split('$')[1]);
                                        if (detailVodPic) {
                                            Object.assign(d, { vod_pic: detailVodPic.vod_pic });
                                        }
                                    });
                                } catch (e) {
                                    log(`获取${result_data[0].site_name}的分类图片失败:${e.message}`);
                                }
                            }
                            results = results.concat(result_data);
                        }

                    } else {
                        urls.forEach((_url, idx) => {
                            let it = search_classes[idx];
                            try {
                                let html = request(_url);
                                let json = JSON.parse(html);
                                let data = json.list;
                                data.forEach(i => {
                                    i.vod_id = it.type_id + '$' + i.vod_id;
                                    i.vod_remarks = i.vod_remarks + '|' + it.type_name;
                                });
                                if (rule.search_match) {
                                    data = data.filter(item => item.vod_name && (new RegExp(KEY, 'i')).test(item.vod_name))
                                }
                                if (data.length > 0) {
                                    if (rule.search_pic && !data[0].vod_pic) {
                                        log(`当前搜索网站【${it.type_name}】没有分类，需要二次获取详细数据`);
                                        let detailUrl = urls[idx].split('wd=')[0] + 'ac=detail&ids=' + data.map(k => k.vod_id.split('$')[1]).join(',');
                                        try {
                                            let detailJson = JSON.parse(request(detailUrl));
                                            log('二页分类数据数量:' + detailJson.list.length);
                                            data.forEach((d, _seq) => {
                                                let detailVodPic = detailJson.list.find(vod => vod.vod_id.toString() === d.vod_id.split('$')[1]);
                                                if (detailVodPic) {
                                                    Object.assign(d, { vod_pic: detailVodPic.vod_pic });
                                                }
                                            });
                                        } catch (e) {
                                            log(`获取${it.type_id}的分类图片失败:${e.message}`);
                                        }
                                    }
                                    results = results.concat(data);
                                }
                                results = results.concat(data);
                            } catch (e) {
                                log(`错误:${it.type_id}请求失败:${e.message}`)
                            }
                        });
                    }

                    VODS = results;
                    let t2 = new Date().getTime();
                    log(`${searchMode}搜索:${urls.length}个网站耗时:${(Number(t2) - Number(t1))}ms`)

                }
            }
        }
    }),
    lazy: $js.toString(() => {
        // lazy用于处理页面上的parse_url，也就是是否直接播放
        let parse_url = '';
        if (flag && flag.includes('|')) {
            let type_name = flag.split('|')[0];
            let current_vod = rule.classes.find(item => item.type_name === type_name);
            if (current_vod && current_vod.parse_url) {
                parse_url = current_vod.parse_url
            }
        }
        if (/\.(m3u8|mp4)/.test(input)) {
            input = { parse: 0, url: input }
        } else {
            if (parse_url.startsWith('json:')) {
                let purl = parse_url.replace('json:', '') + input;
                let html = request(purl);
                input = { parse: 0, url: JSON.parse(html).url }
            } else {
                input = parse_url + input;
            }
        }
    }),
}
