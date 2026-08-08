// ==UserScript==
// @name         升学E网通助手 v4.4.0
// @version      4.4.0
// @description  新增：液态玻璃UI + 自动静音 + UI色调自定义 | 适配2026.7.30平台更新
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        https://web.ewt360.com/site-study/*
// @match        http://web.ewt360.com/site-study/*
// @namespace    https://github.com/luoying2334/EWT360-NEW-Helper
// @author       luoying2334
// @author       Le1-Chu
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/luoying2334/EWT360-NEW-Helper/master/main.user.js
// @downloadURL  https://raw.githubusercontent.com/luoying2334/EWT360-NEW-Helper/master/main.user.js
// @supportURL   https://github.com/luoying2334/EWT360-NEW-Helper/issues
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 1. EWTH.config — 常量 & 选择器
  // ============================================================
  var EWTH = {};

  EWTH.config = {
    DEBUG: false,

    // —— 定时器间隔 (ms) ——
    INTERVAL: {
      SKIP_CHECK:      1500,
      CHECKPASS_CHECK:  500,
      AUTOPLAY_CHECK:  2000,
      SPEED_REAPPLY:   3000,
      CONTEXT_PATCH:    300
    },

    // —— API 端点 (2026.7.30 更新) ——
    // ev组件: _submitEarnestCheck→ep()→addVideoss(双s) | ek组件: reportVideoPoint→addVideocss(双c)
    API: {
      ADD_VIDEOSS:  '/api/homeworkprod/homework/student/addVideoss',       // ev简单检测提交: {success,data:1|0|2}
      ADD_VIDEOCSS: '/api/homeworkprod/homework/student/addVideocss',      // ek CAPTCHA检测提交: {success}
      ADD_BLACK:    '/api/homeworkprod/homework/student/addStudp',
      GET_BLACK:    '/api/homeworkprod/homework/student/getVideodp',
      DOWNGRADE:    '/api/eteacherproduct/downgrade/getSeriousCheckDownGradeConfig',
      TASK_PROGRESS:'/api/homeworkprod/homework/student/taskProgressV1',
      RECORD_SUBMIT:'/api/studyprod/course/lesson/record/submit',
      CAPTCHA_GET:  '/api/captcha/captcha/get',
      CAPTCHA_VERIFY:'/api/captcha/captcha/verify'
    },

    // —— 进度条锁定选择器 ——
    PROGRESS_SELECTORS: [
      '.vjs-progress-control',
      '.vjs-progress-holder',
      '.vjs-play-progress',
      '.vjs-load-progress',
      '.vjs-seek-bar',
      '.vjs-slider-horizontal',
      '.PlayProgressBar',
      '.LoadProgressBar'
    ],

    // —— 倍速提示屏蔽选择器 ——
    SPEED_TIP_SELECTORS: [
      '.video_speed_tips',
      '[class*="video_speed_tips" i]',
      '[class*="speedTips" i]',
      '[class*="speed_tips" i]'
    ],

    // —— 认真度检测弹窗选择器 (2026.7.23) ——
    EARNEST_SELECTORS: [
      '[class*="earnest" i]',
      '[class*="EarnestCheck" i]',
      '[class*="check_box" i]',
      '[class*="CheckBox" i]'
    ],

    // —— 完成图片 ID ——
    FINISHED_IMG_IDS: ['1820894120067424424', '1820894120067448877'],

    // —— 已完成文字 ——
    FINISHED_TEXT: ['已完成', '已学完']
  };

  // ============================================================
  // 2. EWTH.logger — 分级日志
  // ============================================================
  EWTH.logger = (function () {
    var LEVEL = { NONE: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
    var _level = 0;
    var PREFIX = { 1: 'ERR', 2: 'WRN', 3: 'INF', 4: 'DBG' };

    function ts() {
      var d = new Date();
      return '[' + ('0' + d.getHours()).slice(-2) + ':' +
             ('0' + d.getMinutes()).slice(-2) + ':' +
             ('0' + d.getSeconds()).slice(-2) + ']';
    }

    function canLog(lv) { return _level >= lv; }

    return {
      LEVEL: LEVEL,
      getLevel: function () { return _level; },
      setLevel: function (lv) { _level = lv; },
      error: function (ns, msg) { if (canLog(1)) console.error(ts() + ' [' + ns + ':ERR] ' + msg); },
      warn:  function (ns, msg) { if (canLog(2)) console.warn (ts() + ' [' + ns + ':WRN] ' + msg); },
      info:  function (ns, msg) { if (canLog(3)) console.info (ts() + ' [' + ns + ':INF] ' + msg); },
      debug: function (ns, msg) { if (canLog(4)) console.log  (ts() + ' [' + ns + ':DBG] ' + msg); }
    };
  })();

  // ============================================================
  // 3. EWTH.store — 中心化状态
  // ============================================================
  EWTH.store = (function () {
    var KEY = 'ewt_helper_v4_cfg';
    var SAVE_DELAY = 100;
    var _timer = null;

    var _state = {
      autoSkip:       false,
      autoPlay:       false,
      autoCheckPass:  false,
      speedControl:   false,
      lockProgress:   false,
      muteAudio:      false,
      brushMode:      false,
      hasShownGuide:  false,
      glassColor:     'white'
    };

    function _save() {
      try { localStorage.setItem(KEY, JSON.stringify(_state)); } catch (e) { /* ignore */ }
    }

    function _saveDebounced() {
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(_save, SAVE_DELAY);
    }

    return {
      init: function () {
        try {
          var raw = localStorage.getItem(KEY);
          if (raw) {
            var saved = JSON.parse(raw);
            for (var k in saved) {
              if (saved.hasOwnProperty(k) && _state.hasOwnProperty(k)) {
                _state[k] = saved[k];
              }
            }
          }
        } catch (e) { /* ignore */ }
      },

      get: function (key) { return _state[key]; },

      set: function (key, value) {
        if (!_state.hasOwnProperty(key)) return;
        _state[key] = value;
        _saveDebounced();
      },

      save: function () { _save(); }
    };
  })();

  // ============================================================
  // 4. EWTH.apiIntercept — API 拦截 (v4.4.0 更新)
  // ============================================================
  EWTH.apiIntercept = (function () {
    var _intercepted = false;

    var BLOCK_LIST = [
      EWTH.config.API.ADD_BLACK    // addStudp - 阻止黑名单上报
    ];

    var FAKE_MAP = {};
    FAKE_MAP[EWTH.config.API.ADD_VIDEOSS]  = '{"success":true,"data":1}';  // 简单检测: _submitEarnestCheck读data, reportVideoPoint读success
    FAKE_MAP[EWTH.config.API.ADD_VIDEOCSS] = '{"success":true}';           // CAPTCHA检测: ek.reportVideoPoint读success
    FAKE_MAP[EWTH.config.API.GET_BLACK]    = '{"data":false}';             // 始终返回"非黑名单"
    FAKE_MAP[EWTH.config.API.DOWNGRADE]    = '{"data":{"seriousCheckDownGrade":true}}'; // 降级配置

    function _matchAny(url, patterns) {
      for (var i = 0; i < patterns.length; i++) {
        if (url.indexOf(patterns[i]) !== -1) return true;
      }
      return false;
    }

    function _getFake(url) {
      var keys = Object.keys(FAKE_MAP);
      for (var i = 0; i < keys.length; i++) {
        if (url.indexOf(keys[i]) !== -1) return FAKE_MAP[keys[i]];
      }
      return null;
    }

    function _isBlocked(url) {
      return _matchAny(url, BLOCK_LIST);
    }

    function _isFaked(url) {
      return _getFake(url) !== null;
    }

    // --- XHR 拦截 ---
    var _origXHROpen = XMLHttpRequest.prototype.open;
    var _origXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url /*, async, user, password */) {
      this.__ewt_url = (url || '').toString();
      this.__ewt_method = (method || '').toString();
      var args = Array.prototype.slice.call(arguments);
      return _origXHROpen.apply(this, args);
    };

    XMLHttpRequest.prototype.send = function (body) {
      var url = this.__ewt_url || '';

      // 静默屏蔽黑名单上报 — 永远不发送到服务器
      if (_isBlocked(url)) {
        EWTH.logger.info('API', 'blocked addStudp');
        var xhr = this;
        setTimeout(function () { _fakeXHRSuccess(xhr, '{"success":true}'); }, 5);
        return;
      }

      // 伪造响应 — 让组件以为用户不在黑名单
      if (_isFaked(url)) {
        var fakeBody = _getFake(url);
        EWTH.logger.info('API', 'faked ' + url.split('/').pop());
        var xhr2 = this;
        setTimeout(function () { _fakeXHRSuccess(xhr2, fakeBody); }, 5);
        return;
      }

      return _origXHRSend.apply(this, arguments);
    };

    function _fakeXHRSuccess(xhr, responseText) {
      try {
        // 重新定义实例属性（覆盖原型 getter）
        Object.defineProperty(xhr, 'readyState',  { get: function () { return 4; }, configurable: true });
        Object.defineProperty(xhr, 'status',      { get: function () { return 200; }, configurable: true });
        Object.defineProperty(xhr, 'statusText',  { get: function () { return 'OK'; }, configurable: true });
        Object.defineProperty(xhr, 'responseText',{ get: function () { return responseText; }, configurable: true });
        Object.defineProperty(xhr, 'response',    { get: function () { return responseText; }, configurable: true });
        Object.defineProperty(xhr, 'responseXML', { get: function () { return null; }, configurable: true });
        Object.defineProperty(xhr, 'responseType',{ get: function () { return ''; }, configurable: true });

        // 触发 axios 的回调链
        if (typeof xhr.onreadystatechange === 'function') {
          xhr.onreadystatechange.call(xhr);
        }
        var loadEvt = document.createEvent('Event');
        loadEvt.initEvent('load', false, false);
        xhr.dispatchEvent(loadEvt);
        var doneEvt = document.createEvent('Event');
        doneEvt.initEvent('loadend', false, false);
        xhr.dispatchEvent(doneEvt);
      } catch (e) {
        EWTH.logger.warn('API', 'fakeXHR error: ' + e.message);
      }
    }

    // --- fetch 拦截（兜底） ---
    var _origFetch = window.fetch;
    window.fetch = function (input /*, init */) {
      var url = '';
      if (typeof input === 'string') {
        url = input;
      } else if (input && input.url) {
        url = input.url;
      } else if (input && input.href) {
        url = input.href;
      }

      if (_isBlocked(url)) {
        EWTH.logger.info('API', 'blocked addStudp (fetch)');
        return Promise.resolve(new Response('{"success":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      if (_isFaked(url)) {
        var fakeBody = _getFake(url);
        EWTH.logger.info('API', 'faked ' + url.split('/').pop() + ' (fetch)');
        return Promise.resolve(new Response(fakeBody, {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }

      var args = Array.prototype.slice.call(arguments);
      return _origFetch.apply(this, args);
    };

    return {
      init: function () {
        if (_intercepted) return;
        _intercepted = true;
        EWTH.logger.info('API', 'XHR + fetch intercept active');
      },
      isIntercepted: function () { return _intercepted; }
    };
  })();

  // ============================================================
  // 5. EWTH.core — Fiber 工具 + 认真度检测绕过 (v4.4.0 重写)
  // ============================================================
  EWTH.core = (function () {

    function _findFiberKey(el) {
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0) return k;
      }
      return null;
    }

    // 沿 fiber 向上找拥有 methodName 方法的组件实例
    function _findInst(el, methodName) {
      var fk = _findFiberKey(el);
      if (!fk) return null;
      var f = el[fk];
      var depth = 0;
      while (f && depth < 30) {
        var inst = f.stateNode;
        if (inst && typeof inst[methodName] === 'function') return inst;
        f = f.return;
        depth++;
      }
      return null;
    }

    // 沿 fiber 向上找有指定 state 属性的组件
    function _findInstByState(el, stateKey) {
      var fk = _findFiberKey(el);
      if (!fk) return null;
      var f = el[fk];
      var depth = 0;
      while (f && depth < 30) {
        var inst = f.stateNode;
        if (inst && inst.state && inst.state.hasOwnProperty(stateKey)) return inst;
        f = f.return;
        depth++;
      }
      return null;
    }

    // ========= 认真度检测 bypass (v4.4.0 重写) =========
    // 平台 2026.7.30 ev 组件 (homework-play-video):
    //   reportVideoPoint → GUARD (constructor: if(!em){em=!0;updateIsBlacklisted(...)} return !1)
    //   _doReportVideoPoint → TRAP (Modal.warning + updateIsBlacklisted)
    //   _submitEarnestCheck → REAL (调 ep()→POST addVideoss→返回{data:1|0|2})
    //   toCheck → GUARD (constructor)
    //   _nativeClickHandler → REAL (isTrusted+instanceof校验通过后调_submitEarnestCheck)
    // 绕过方案: 直接调 _submitEarnestCheck, API拦截确保返回1(通过)
    function doCheckPass(el) {
      if (!el) return false;
      var inst = _findInstByState(el, 'earnestCurrentSecond');
      if (!inst) {
        inst = _findInst(el, '_nativeClickHandler');
      }
      if (!inst) {
        EWTH.logger.warn('CORE', 'checkPass comp not found');
        return false;
      }

      try {
        var p = inst.props;
        var d = p.contentType;
        var lessonId = 11 === d ? Number(p.lessonId) + 2000000 : p.lessonId;
        var ifData = {
          homeworkId: p.homeworkId,
          lessonId: lessonId,
          type: p.interactiveVideo ? 3 : 1 === d ? 1 : 2,
          interactivePointId: p.interactiveVideo ? 100 : null,
          platform: 1,
          seriousCheckResult: 2   // 2 = successLog
        };

        // 步骤1: 停止倒计时 (防止30秒超时提交 errorLog)
        try { clearInterval(inst.timerId); } catch (e2) {}

        // 步骤2: 调用 _submitEarnestCheck (真正的检测提交方法)
        // 平台代码: this._submitEarnestCheck = async e => {
        //   try { let{data:t}=await ep(e); return t } // ep()→POST addVideoss
        //   catch(e) { return console.error(...), !1 }
        // }
        // API拦截已将addVideoss伪造为 {"success":true,"data":1}, 所以t===1
        var submitCheck = inst._submitEarnestCheck;
        if (typeof submitCheck === 'function') {
          EWTH.logger.debug('CORE', 'using _submitEarnestCheck');
          submitCheck.call(inst, ifData).then(function (result) {
            if (result === 1) {
              // 平台原生成功流程:
              //   1===e?(d(!0),c.message.success("你真棒，通过检测～"),p&&p.play&&p.play())
              try { p.callback(true); } catch (e3) {}
              try { p.oEplayer && p.oEplayer.resumeHotKeys && p.oEplayer.resumeHotKeys(); } catch (e3) {}
              try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) {}
              EWTH.logger.info('CORE', 'checkPass success');
            } else if (result === 0) {
              EWTH.logger.warn('CORE', 'check returned 0 (failed), re-triggering');
              // 重新调一次 (有时API需要预热)
              submitCheck.call(inst, ifData).then(function (r2) {
                if (r2 === 1) {
                  try { p.callback(true); } catch (e3) {}
                  try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) {}
                }
              });
            } else if (result === 2) {
              EWTH.logger.warn('CORE', 'check returned 2 (abnormal), using direct API');
              // 直接调API
              fetch(EWTH.config.API.ADD_VIDEOSS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ifData)
              }).then(function (r) { return r.json(); })
                .then(function (resp) {
                  if (resp && (resp.data === 1 || resp.success)) {
                    try { p.callback(true); } catch (e3) {}
                    try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) {}
                  }
                }).catch(function () {});
            }
          }).catch(function () {});  // 忽略异常, 不影响 setState 清理
        } else {
          // ek组件没有_submitEarnestCheck, 走直接API
          EWTH.logger.debug('CORE', 'no _submitEarnestCheck, direct API (ek mode)');
          fetch(EWTH.config.API.ADD_VIDEOCSS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ifData)
          }).then(function (r) { return r.json(); })
            .then(function (resp) {
              if (resp && resp.success) {
                try { p.callback(true); } catch (e3) {}
                try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) {}
              }
            }).catch(function () {});
        }

        // 步骤3: 操作 state 隐藏检测 UI
        // 平台 ev state: { earnestCurrentSecond, timeVisible, unCheckVisible }
        // 主播放器 eT state: { earnestCheckVisible }
        try {
          inst.setState({
            earnestCurrentSecond: 30,
            timeVisible: false,
            unCheckVisible: false
          });
          // 同时隐藏主播放器的 earnestCheckVisible
          var playerInst = _findInstByState(el, 'earnestCheckVisible');
          if (playerInst) {
            playerInst.setState({ earnestCheckVisible: false });
          }
        } catch (e2) {}

        return true;
      } catch (err) {
        EWTH.logger.error('CORE', 'checkPass: ' + err.message);
        return false;
      }
    }

    // ========= 上下文黑名单状态修补 (v4.4.0 增强) =========
    // 平台 Context Provider O (homework-play-video):
    //   let [isBlacklisted, setIsBlacklisted] = useState(false)
    //   let getVideodp = async() => {
    //     let{data}=await GET("/api/.../getVideodp"); setIsBlacklisted(!!data)
    //   }
    //   let updateIsBlacklisted = async(eventData) => {
    //     await GET("/api/.../addStudp");
    //     A.ZP.warn(eventData, "student_watch_class_anticheat")
    //   }
    //
    // 平台 renderEarnestCheck: isBlacklisted ? <ek(CAPTCHA) .../> : <ev(简单) .../>
    //
    // 策略: 1) 覆盖updateIsBlacklisted为空操作 2) 强制isBlacklisted=false
    // API拦截已确保getVideodp始终返回false, addStudp被静默屏蔽
    function patchBlacklistState(el) {
      var inst = _findInstByState(el, 'earnestCurrentSecond');
      if (!inst) {
        inst = _findInst(el, '_nativeClickHandler');
      }
      if (!inst || !inst.context) return false;

      try {
        // 方式1: 将 updateIsBlacklisted 替换为 no-op
        // 平台: updateIsBlacklisted接收{type:"UNTRUSTED_EVENT",desc,message,lessonId,homeworkId,url,cheatParams}
        // 即使API已拦截addStudp, 替换updateIsBlacklisted可以防止A.ZP.warn被调用
        if (typeof inst.context.updateIsBlacklisted === 'function') {
          if (!inst.context._ewt_original_update) {
            inst.context._ewt_original_update = inst.context.updateIsBlacklisted;
          }
          inst.context.updateIsBlacklisted = function () {
            EWTH.logger.info('CORE', 'blocked updateIsBlacklisted');
          };
        }

        // 方式2: 强制 isBlacklisted = false
        // 防止 ek (CAPTCHA) 组件被渲染
        if (inst.context.isBlacklisted) {
          inst.context.isBlacklisted = false;
          try { inst.forceUpdate && inst.forceUpdate(); } catch (e) {}
          EWTH.logger.info('CORE', 'cleared isBlacklisted');
        }

        // 方式3: 触发 getVideodp() 让Context刷新 (API拦截确保返回false)
        if (typeof inst.context.getVideodp === 'function') {
          inst.context.getVideodp();
        }

        return true;
      } catch (e) {
        EWTH.logger.warn('CORE', 'patchBlacklist error: ' + e.message);
      }
      return false;
    }

    // ========= 连播 / 跳题（firePropsClick） =========
    var _fakeEvent = {
      stopPropagation: function(){}, preventDefault: function(){},
      stopImmediatePropagation: function(){}, nativeEvent: {stopImmediatePropagation: function(){}},
      isTrusted: true, isPropagationStopped: function(){return false},
      persist: function(){}, target: null, currentTarget: null
    };

    function firePropsClick(el, handlerPropName) {
      if (!el) return false;
      var fk = _findFiberKey(el);
      if (!fk) return false;
      var f = el[fk];

      var skipTexts = ['导学案', '课后习题', '练习单', '素养作业', '同类真题'];
      var queue = [f];
      while (queue.length) {
        var cur = queue.shift();
        if (cur.memoizedProps && typeof cur.memoizedProps[handlerPropName] === 'function') {
          var dom = cur.stateNode;
          if (dom && dom.nodeType === 1) {
            var txt = dom.textContent || '';
            var isSubBtn = false;
            for (var si = 0; si < skipTexts.length; si++) {
              if (txt === skipTexts[si] || txt === (skipTexts[si] + ' >')) {
                isSubBtn = true; break;
              }
            }
            if (isSubBtn) continue;
          }
          try {
            cur.memoizedProps[handlerPropName](_fakeEvent);
            return true;
          } catch (e) { /* ignore */ }
        }
        if (cur.child) queue.push(cur.child);
        if (cur.sibling) queue.push(cur.sibling);
      }
      return false;
    }

    // ========= 播放器组件定位 =========
    function findPlayer() {
      var v = document.querySelector('video');
      if (!v) return null;
      var el = v;
      var fk = null;
      while (el && !fk) {
        fk = _findFiberKey(el);
        if (!fk) el = el.parentElement;
      }
      if (!el || !fk) return null;
      var f = el[fk];
      var d = 0;
      while (f && d < 20) {
        var inst = f.stateNode;
        if (inst && typeof inst.changeVideo === 'function') return inst;
        f = f.return;
        d++;
      }
      return null;
    }

    return {
      doCheckPass: doCheckPass,
      patchBlacklistState: patchBlacklistState,
      firePropsClick: firePropsClick,
      findPlayer: findPlayer,
      findInst: _findInst,
      findInstByState: _findInstByState,
      findFiberKey: _findFiberKey
    };
  })();

  // ============================================================
  // 6. EWTH.autoskip — 自动跳题 (v4.4.0)
  // ============================================================
  EWTH.autoskip = (function () {
    var _interval = null;
    var _lastClicked = null;
    var COOLDOWN = 5000;

    function _scan() {
      try {
        // mstplayer 的跳过按钮不在 React fiber 里，直接用原生 click
        // 同时也扫描 React 控制的跳过按钮
        var all = document.querySelectorAll('button, a, span, div');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (!el.offsetParent) continue;
          var txt = el.textContent.trim();
          if (txt !== '跳过' && txt !== 'Skip') continue;
          if (el === _lastClicked) return;
          _lastClicked = el;

          try { el.click(); } catch (e) {}
          EWTH.core.firePropsClick(el, 'onClick');

          EWTH.logger.info('SKIP', 'done');
          setTimeout(function () { _lastClicked = null; }, COOLDOWN);
          return;
        }
      } catch (e) { /* ignore */ }
    }

    return {
      toggle: function (on) {
        if (on) this.start(); else this.stop();
      },
      start: function () {
        if (_interval) return;
        _scan();
        _interval = setInterval(_scan, EWTH.config.INTERVAL.SKIP_CHECK);
        EWTH.logger.info('SKIP', 'started');
      },
      stop: function () {
        if (_interval) { clearInterval(_interval); _interval = null; }
        _lastClicked = null;
        EWTH.logger.info('SKIP', 'stopped');
      }
    };
  })();

  // ============================================================
  // 7. EWTH.checkpass — 自动过检 (v4.4.0 重写，CAPTCHA 直接绕过)
  // ============================================================
  EWTH.checkpass = (function () {
    var _interval = null;
    var _lastTarget = null;
    var COOLDOWN = 3000;
    var _contextPatchTimer = null;

    // CAPTCHA 相关选择器
    var CAPTCHA_SELECTORS = [
      '#captcha',
      '[class*="captcha" i]',
      '[class*="ecaptcha" i]',
      '[id*="captcha" i]'
    ];

    // 处理 CAPTCHA 模式 (isBlacklisted=true 时渲染 ek 组件)
    function _handleCaptcha() {
      try {
        var captchaEl = null;
        for (var i = 0; i < CAPTCHA_SELECTORS.length; i++) {
          captchaEl = document.querySelector(CAPTCHA_SELECTORS[i]);
          if (captchaEl && captchaEl.offsetParent) break;
          captchaEl = null;
        }
        if (!captchaEl) return false;

        // 找 ek 组件实例 (CAPTCHA 检测组件)
        var ekInst = EWTH.core.findInstByState(captchaEl, 'earnestCurrentSecond');
        if (!ekInst) {
          // 尝试从 DOM 向上找
          var fk = EWTH.core.findFiberKey(captchaEl);
          if (fk) {
            var f = captchaEl[fk];
            var depth = 0;
            while (f && depth < 30) {
              var inst = f.stateNode;
              if (inst && inst.state && inst.state.hasOwnProperty('earnestCurrentSecond')) {
                ekInst = inst; break;
              }
              f = f.return;
              depth++;
            }
          }
        }
        if (!ekInst) return false;

        var ekP = ekInst.props;
        var d = ekP.contentType;
        var ifData = {
          homeworkId: ekP.homeworkId,
          lessonId: 11 === d ? Number(ekP.lessonId) + 2000000 : ekP.lessonId,
          type: ekP.interactiveVideo ? 3 : 1 === d ? 1 : 2,
          interactivePointId: ekP.interactiveVideo ? 100 : null,
          platform: 1,
          seriousCheckResult: 2
        };

        // 直接调 addVideocss API (已被拦截返回 {success:true})
        fetch(EWTH.config.API.ADD_VIDEOCSS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ifData)
        }).then(function (r) { return r.json(); })
          .then(function (result) {
            if (result && result.success) {
              try { clearInterval(ekInst.timerId); } catch (e2) {}
              try { ekInst.setState({ earnestCurrentSecond: 30, timeVisible: false, unCheckVisible: false }); } catch (e2) {}
              try { ekP.callback(true); } catch (e2) {}
              try { ekP.oEplayer && ekP.oEplayer.play && ekP.oEplayer.play(); } catch (e2) {}
              EWTH.logger.info('CHECKPASS', 'CAPTCHA bypassed via direct API');
            }
          }).catch(function () {});

        return true;
      } catch (e) {
        EWTH.logger.warn('CHECKPASS', 'captcha err: ' + e.message);
      }
      return false;
    }

    function _tryClick() {
      try {
        // 持续修补 isBlacklisted + updateIsBlacklisted (防 CAPTCHA 模式)
        if (document.body) {
          EWTH.core.patchBlacklistState(document.body);
        }

        // 先检查 CAPTCHA 模式 (ek 组件已渲染, isBlacklisted=true)
        var captchaEl = document.querySelector('#captcha');
        if (captchaEl && captchaEl.offsetParent) {
          EWTH.logger.warn('CHECKPASS', 'CAPTCHA mode detected, attempting bypass');
          _handleCaptcha();
          // 继续执行 ev 查找, 以防两者同时存在
        }

        // 查找简单检测按钮 (ev 组件, isBlacklisted=false)
        var btn = document.querySelector('[data-ac="check-pass"]');
        if (!btn || !btn.offsetParent) {
          // 备选: 找包含"通过检测"文字的按钮
          var allBtns = document.querySelectorAll('button, span, div[role="button"]');
          for (var i = 0; i < allBtns.length; i++) {
            var txt = (allBtns[i].textContent || '').trim();
            if (txt.indexOf('通过检测') !== -1 && allBtns[i].offsetParent) {
              btn = allBtns[i];
              break;
            }
          }
        }
        if (!btn || !btn.offsetParent) return; // 弹窗未出现
        if (btn === _lastTarget) return;
        _lastTarget = btn;

        // 核心 bypass: 调 _submitEarnestCheck (不是 _doReportVideoPoint 陷阱!)
        EWTH.core.doCheckPass(btn);
        EWTH.logger.info('CHECKPASS', 'done');
        setTimeout(function () { _lastTarget = null; }, COOLDOWN);
      } catch (e) { /* ignore */ }
    }

    function _contextPatchLoop() {
      if (!document.body) return;
      EWTH.core.patchBlacklistState(document.body);
    }

    return {
      toggle: function (on) {
        if (on) this.start(); else this.stop();
      },
      start: function () {
        if (_interval) return;
        _tryClick();
        _interval = setInterval(_tryClick, EWTH.config.INTERVAL.CHECKPASS_CHECK);
        // 额外定时修补 isBlacklisted 状态
        _contextPatchTimer = setInterval(_contextPatchLoop, EWTH.config.INTERVAL.CONTEXT_PATCH);
        EWTH.logger.info('CHECKPASS', 'started (dual-mode)');
      },
      stop: function () {
        if (_interval) { clearInterval(_interval); _interval = null; }
        if (_contextPatchTimer) { clearInterval(_contextPatchTimer); _contextPatchTimer = null; }
        _lastTarget = null;
        EWTH.logger.info('CHECKPASS', 'stopped');
      }
    };
  })();

  // ============================================================
  // 8. EWTH.autoplay — 自动连播
  // ============================================================
  EWTH.autoplay = (function () {
    var _interval = null;
    var _lastLessonId = null;
    var _lastSwitchTime = 0;
    var COOLDOWN = 8000;

    function _isFinished() {
      if (document.getElementById('lesson-finished-container')) return true;
      var ids = EWTH.config.FINISHED_IMG_IDS;
      for (var i = 0; i < ids.length; i++) {
        if (document.querySelector('img[src*="' + ids[i] + '"]')) return true;
      }
      return false;
    }

    function _findNextLesson(inst) {
      if (!inst || !inst.state) return null;
      var list = inst.state.videoCatalogueList;
      if (!list || !list.length) return null;
      var cur = inst.state.currentLesson;
      if (!cur) return list[0];
      var curIdx = -1;
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].lessonId) === String(cur.lessonId)) { curIdx = i; break; }
      }
      if (curIdx === -1) return list[0];
      for (var j = curIdx + 1; j < list.length; j++) {
        if (list[j].status !== 2) return list[j];
      }
      for (var k = 0; k < curIdx; k++) {
        if (list[k].status !== 2) return list[k];
      }
      return null;
    }

    function _check() {
      try {
        if (!_isFinished()) return;
        var now = Date.now();
        if (now - _lastSwitchTime < COOLDOWN) return;

        EWTH.logger.debug('AUTOPLAY', 'video finished, looking for next...');
        var inst = EWTH.core.findPlayer();
        if (!inst) { EWTH.logger.debug('AUTOPLAY', 'player not found'); return; }

        var next = _findNextLesson(inst);
        if (!next) {
          EWTH.logger.info('AUTOPLAY', 'all lessons done, redirecting');
          var hwId = inst.state.homeworkId || '';
          try { sessionStorage.setItem('ewt_nextday_auto', '1'); } catch (e) {}
          location.href = location.pathname + location.search + '#/holiday/student-task-overview?homeworkId=' + hwId;
          return;
        }
        if (next.lessonId === _lastLessonId && now - _lastSwitchTime < COOLDOWN * 2) return;

        _lastLessonId = next.lessonId;
        _lastSwitchTime = now;

        var hashPath = window.location.hash.split('?')[0].replace(/^#+/, '');
        var sp = new URLSearchParams(window.location.hash.split('?')[1] || '');
        sp.set('lessonId', String(next.lessonId));
        sp.set('videoPoint', '0');
        var newHash = '#' + hashPath + '?' + sp.toString();
        location.hash = newHash;
        setTimeout(function () { location.reload(); }, 300);

        EWTH.logger.info('AUTOPLAY', 'switched to ' + next.title);
      } catch (e) {
        EWTH.logger.error('AUTOPLAY', 'check error: ' + e.message);
      }
    }

    return {
      toggle: function (on) {
        if (on) this.start(); else this.stop();
      },
      start: function () {
        if (_interval) return;
        _check();
        _interval = setInterval(_check, EWTH.config.INTERVAL.AUTOPLAY_CHECK);
        EWTH.logger.info('AUTOPLAY', 'started');
      },
      stop: function () {
        if (_interval) { clearInterval(_interval); _interval = null; }
        _lastLessonId = null;
        EWTH.logger.info('AUTOPLAY', 'stopped');
      }
    };
  })();

  // ============================================================
  // 9. EWTH.nextday — 任务页自动跳下一天
  // ============================================================
  EWTH.nextday = (function () {

    function _simClick(el) {
      var r = el.getBoundingClientRect();
      var opts = { bubbles: true, cancelable: true, view: window,
        clientX: r.left + r.width/2, clientY: r.top + r.height/2,
        screenX: r.left + r.width/2, screenY: r.top + r.height/2, button: 0 };
      try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch (e) {}
      try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch (e) {}
      try { el.dispatchEvent(new MouseEvent('click', opts)); } catch (e) {}
    }

    function run() {
      if (location.hash.indexOf('/holiday/student-task-overview') === -1) return;
      var autoFlag = '';
      try { autoFlag = sessionStorage.getItem('ewt_nextday_auto') || ''; } catch (e) {}
      if (autoFlag !== '1') return;
      try { sessionStorage.removeItem('ewt_nextday_auto'); } catch (e) {}

      function _try(count) {
        var lis = document.querySelectorAll('.tabs-wldGh li');
        if (!lis.length) { setTimeout(function () { _try(count + 1); }, 400); return; }

        var activeIdx = -1;
        for (var i = 0; i < lis.length; i++) {
          if (lis[i].getAttribute('data-active') === 'true') { activeIdx = i; break; }
        }
        if (activeIdx === -1) { setTimeout(function () { _try(count + 1); }, 400); return; }

        var ct = (lis[activeIdx].textContent || '').trim();
        var cm = ct.match(/完成(\d+)\/(\d+)/);
        var done = cm && cm[1] === cm[2];

        if (!done) { _findAndClickBtn(); return; }

        var nextLI = null;
        for (var j = activeIdx + 1; j < lis.length; j++) {
          if (lis[j].getAttribute('data-active') === 'text') continue;
          var tt = (lis[j].textContent || '').trim();
          var mm = tt.match(/完成(\d+)\/(\d+)/);
          if (mm && mm[1] === mm[2]) continue;
          nextLI = lis[j]; break;
        }
        if (!nextLI) { EWTH.logger.info('NEXTDAY', 'all days done'); return; }

        _simClick(nextLI);
        EWTH.logger.info('NEXTDAY', 'switched day');
        setTimeout(function () { _findAndClickBtn(); }, 1500);
      }

      function _findAndClickBtn(attempt) {
        attempt = attempt || 0;
        var btns = document.querySelectorAll('.btn-AoqsA');
        for (var i = 0; i < btns.length; i++) {
          var txt = (btns[i].textContent || '').trim();
          var df = btns[i].getAttribute('data-finish');
          if (txt.indexOf('学') === 0 && df !== 'true') {
            _simClick(btns[i]);
            var p = btns[i].parentElement;
            while (p && p.tagName !== 'LI') p = p.parentElement;
            if (p) _simClick(p);
            EWTH.logger.info('NEXTDAY', 'lesson clicked');
            return;
          }
        }
        if (attempt < 15) setTimeout(function () { _findAndClickBtn(attempt + 1); }, 400);
        else { var l = document.querySelector('a[href*="play-videos"]'); if (l) location.href = l.href; }
      }

      setTimeout(function () { _try(0); }, 1000);
    }

    window.addEventListener('hashchange', function () { run(); });
    return { run: run };
  })();

  // ============================================================
  // 10. EWTH.speed — 2倍速 + checkRate 防御
  // ============================================================
  EWTH.speed = (function () {
    var _active = false;
    var _target = 2.0;
    var _interval = null;

    function _getVideo() {
      return document.querySelector('video');
    }

    function _apply(v) {
      if (!v) v = _getVideo();
      if (!v) return;
      try {
        if (v.playbackRate !== _target) v.playbackRate = _target;
      } catch (e) { /* ignore */ }
    }

    function _hardenVideo(v) {
      if (!v || v._ewt_hardened) return;
      v._ewt_hardened = true;
      try {
        var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
        if (desc && desc.get && desc.set) {
          Object.defineProperty(v, 'playbackRate', {
            get: function () { return desc.get.call(this); },
            set: function (val) { desc.set.call(this, val); },
            configurable: false,
            enumerable: true
          });
          EWTH.logger.debug('SPEED', 'hardened video');
        }
      } catch (e) {
        EWTH.logger.debug('SPEED', 'harden failed: ' + e.message);
      }
    }

    function _onRateChange(e) {
      if (!_active) return;
      var v = e.target;
      if (v && v.tagName === 'VIDEO' && v.playbackRate !== _target) {
        setTimeout(function () {
          try { if (v.playbackRate !== _target) v.playbackRate = _target; } catch (err) { /* ignore */ }
        }, 0);
      }
    }

    return {
      toggle: function (on) {
        _active = on;
        _target = on ? 2.0 : 1.0;
        var v = _getVideo();
        _apply(v);
        if (v) _hardenVideo(v);
        if (on) this.start(); else this.stop();
      },

      start: function () {
        document.addEventListener('ratechange', _onRateChange, true);
        if (!_interval) {
          _interval = setInterval(function () {
            var v = _getVideo();
            if (v && !v._ewt_hardened) _hardenVideo(v);
            _apply(v);
          }, EWTH.config.INTERVAL.SPEED_REAPPLY);
        }
        EWTH.logger.info('SPEED', 'started x' + _target);
      },

      stop: function () {
        document.removeEventListener('ratechange', _onRateChange, true);
        if (_interval) { clearInterval(_interval); _interval = null; }
        EWTH.logger.info('SPEED', 'stopped');
      },

      _apply: _apply,
      _hardenVideo: _hardenVideo
    };
  })();

  // ============================================================
  // 12. EWTH.mute — 自动静音 (v4.4.0)
  // ============================================================
  EWTH.mute = (function () {
    var _active = false;
    var _interval = null;

    function _getVideo() {
      return document.querySelector('video');
    }

    function _apply(v) {
      if (!v) v = _getVideo();
      if (!v) return;
      try {
        if (!v.muted) v.muted = true;
        if (v.volume !== 0) v.volume = 0;
      } catch (e) { /* ignore */ }
    }

    function _hardenVideo(v) {
      if (!v || v._ewt_mute_hardened) return;
      v._ewt_mute_hardened = true;
      try {
        var mutedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
        var volDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
        if (mutedDesc && mutedDesc.get && mutedDesc.set) {
          Object.defineProperty(v, 'muted', {
            get: function () { return mutedDesc.get.call(this); },
            set: function (val) { mutedDesc.set.call(this, val); },
            configurable: false,
            enumerable: true
          });
        }
        if (volDesc && volDesc.get && volDesc.set) {
          Object.defineProperty(v, 'volume', {
            get: function () { return volDesc.get.call(this); },
            set: function (val) { volDesc.set.call(this, val); },
            configurable: false,
            enumerable: true
          });
        }
        EWTH.logger.debug('MUTE', 'hardened video');
      } catch (e) {
        EWTH.logger.debug('MUTE', 'harden failed: ' + e.message);
      }
    }

    function _onVolumeChange(e) {
      if (!_active) return;
      var v = e.target;
      if (v && v.tagName === 'VIDEO' && (!v.muted || v.volume !== 0)) {
        setTimeout(function () {
          try {
            if (!v.muted) v.muted = true;
            if (v.volume !== 0) v.volume = 0;
          } catch (err) { /* ignore */ }
        }, 0);
      }
    }

    return {
      toggle: function (on) {
        _active = on;
        var v = _getVideo();
        if (on) {
          _apply(v);
          if (v) _hardenVideo(v);
          this.start();
        } else {
          this.stop();
        }
      },

      start: function () {
        document.addEventListener('volumechange', _onVolumeChange, true);
        if (!_interval) {
          _interval = setInterval(function () {
            var v = _getVideo();
            if (v && !v._ewt_mute_hardened) _hardenVideo(v);
            if (_active) _apply(v);
          }, EWTH.config.INTERVAL.SPEED_REAPPLY);
        }
        EWTH.logger.info('MUTE', 'started');
      },

      stop: function () {
        document.removeEventListener('volumechange', _onVolumeChange, true);
        if (_interval) { clearInterval(_interval); _interval = null; }
        // 恢复视频声音
        var v = _getVideo();
        if (v) {
          try {
            v.muted = false;
            if (v.volume === 0) v.volume = 0.5;
          } catch (e) { /* ignore */ }
        }
        EWTH.logger.info('MUTE', 'stopped, audio restored');
      },

      _apply: _apply,
      _hardenVideo: _hardenVideo
    };
  })();

  // ============================================================
  // 13. EWTH.progresslock — 锁定进度条
  // ============================================================
  EWTH.progresslock = (function () {
    var _styleEl = null;
    var BODY_CLASS = 'ewt-progress-locked';

    function _buildCSS() {
      var sels = EWTH.config.PROGRESS_SELECTORS.join(',\n');
      return 'body.' + BODY_CLASS + ' ' + sels.replace(/,/g, ',body.' + BODY_CLASS + ' ') +
             ' { pointer-events: none !important; cursor: not-allowed !important; }';
    }

    return {
      toggle: function (on) {
        if (on) this.start(); else this.stop();
      },
      start: function () {
        if (!_styleEl) {
          _styleEl = document.createElement('style');
          _styleEl.id = 'ewt-progress-lock-style';
          _styleEl.textContent = _buildCSS();
          document.head.appendChild(_styleEl);
        }
        document.body.classList.add(BODY_CLASS);
        EWTH.logger.info('PROGLOCK', 'locked');
      },
      stop: function () {
        if (_styleEl) { _styleEl.remove(); _styleEl = null; }
        document.body.classList.remove(BODY_CLASS);
        EWTH.logger.info('PROGLOCK', 'unlocked');
      }
    };
  })();

  // ============================================================
  // 14. EWTH.antidetection — 反检测对抗 (v4.4.0)
  // ============================================================
  EWTH.antidetection = (function () {
    var _observer = null;

    // 屏蔽课程列表的鼠标悬停检测（倍速提示触发源）
    function _onMouseOver(e) {
      if (e.target.tagName === 'LI' && e.target.parentNode &&
          String(e.target.parentNode.className).indexOf('ccH5spul') !== -1) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }

    // 清理倍速提示 DOM
    function _cleanSpeedTips() {
      var joined = EWTH.config.SPEED_TIP_SELECTORS.join(',');
      var nodes = document.querySelectorAll(joined);
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].remove(); } catch (e) { /* ignore */ }
      }
    }

    // 拦截 console 中的反作弊日志
    // 平台: LoggerLib.warn(eventData, { source: "student-watch-class-anticheat" })
    //       LoggerLib.warn(eventData, "student_watch_class_anticheat") (tag 变量)
    // 标签有 underscores (变量名) 和 hyphens (source 值) 两种格式
    function _interceptLogger() {
      var _origWarn = console.warn;
      console.warn = function () {
        var args = Array.prototype.slice.call(arguments);
        for (var i = 0; i < args.length; i++) {
          // 匹配两种格式: student_watch_class_anticheat / student-watch-class-anticheat
          if (typeof args[i] === 'string' && args[i].indexOf('anticheat') !== -1) {
            EWTH.logger.info('ANTIDETECT', 'suppressed anticheat log');
            return;
          }
          if (args[i] && typeof args[i] === 'object') {
            // 直接匹配 UNTRUSTED_EVENT 类型
            if (args[i].type === 'UNTRUSTED_EVENT') {
              EWTH.logger.info('ANTIDETECT', 'suppressed UNTRUSTED_EVENT log');
              return;
            }
            // 匹配 source 字段 (对象形式的 anticheat tag)
            if (args[i].source && typeof args[i].source === 'string' && args[i].source.indexOf('anticheat') !== -1) {
              EWTH.logger.info('ANTIDETECT', 'suppressed anticheat source log');
              return;
            }
          }
        }
        return _origWarn.apply(this, args);
      };
    }

    return {
      init: function () {
        document.addEventListener('mouseover', _onMouseOver, true);
        _interceptLogger();

        // 定期清理倍速提示 + 修补黑名单状态
        if (typeof MutationObserver !== 'undefined') {
          _observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
              var added = mutations[i].addedNodes;
              for (var j = 0; j < added.length; j++) {
                if (added[j].nodeType !== 1) continue;
                var el = added[j];
                var sels = EWTH.config.SPEED_TIP_SELECTORS;
                for (var k = 0; k < sels.length; k++) {
                  if (el.matches && el.matches(sels[k])) { el.remove(); break; }
                }
                if (el.querySelectorAll) {
                  var children = el.querySelectorAll(sels.join(','));
                  for (var m = 0; m < children.length; m++) {
                    try { children[m].remove(); } catch (e) { /* ignore */ }
                  }
                }
              }
            }
          });
          _observer.observe(document.body, { childList: true, subtree: true });
        }

        _cleanSpeedTips();
        EWTH.logger.info('ANTIDETECT', 'init (v4.4.0)');
      }
    };
  })();

  // ============================================================
  // 15. EWTH.brushmode — 一键刷课
  // ============================================================
  EWTH.brushmode = (function () {
    var KEYS = ['autoSkip', 'autoPlay', 'autoCheckPass', 'speedControl', 'lockProgress', 'muteAudio'];
    var MODS = {
      autoSkip:      EWTH.autoskip,
      autoPlay:      EWTH.autoplay,
      autoCheckPass: EWTH.checkpass,
      speedControl:  EWTH.speed,
      lockProgress:  EWTH.progresslock,
      muteAudio:     EWTH.mute
    };

    return {
      toggle: function (on) {
        for (var i = 0; i < KEYS.length; i++) {
          var k = KEYS[i];
          EWTH.store.set(k, on);
          MODS[k].toggle(on);
          if (EWTH.gui && EWTH.gui.syncCheckbox) EWTH.gui.syncCheckbox(k, on);
        }
        EWTH.logger.info('BRUSH', on ? 'all ON' : 'all OFF');
      }
    };
  })();

  // ============================================================
  // 16. EWTH.liquidglass — 液态玻璃效果系统
  // ============================================================
  EWTH.liquidglass = (function () {
    // —— 默认参数 ——
    var DEFAULTS = {
      blur: { radius: 16, saturation: 180 },
      highlight: { angle: 155, intensity: 0.5 },
      border: { width: 1, opacity: 0.45 },
      shadow: { blur: 40, opacity: 0.05 },
      transition: { duration: 350, easing: 'cubic-bezier(.32,.72,0,1)' }
    };

    // —— 颜色预设 ——
    var PRESETS = {
      white:  { r: 255, g: 255, b: 255, label: '经典白', emoji: '⚪' },
      blue:   { r: 140, g: 200, b: 255, label: '冰蓝',   emoji: '🔵' },
      purple: { r: 230, g: 200, b: 255, label: '梦幻紫', emoji: '🟣' },
      green:  { r: 200, g: 255, b: 230, label: '薄荷绿', emoji: '🟢' },
      rose:   { r: 255, g: 220, b: 220, label: '玫瑰金', emoji: '🩷' }
    };

    function applyColorPreset(name) {
      var preset = PRESETS[name] || PRESETS.white;
      var root = document.documentElement;
      root.style.setProperty('--lg-r', preset.r);
      root.style.setProperty('--lg-g', preset.g);
      root.style.setProperty('--lg-b', preset.b);
      EWTH.store.set('glassColor', name);
      EWTH.logger.info('LIQUIDGLASS', 'color: ' + name);
    }

    // —— 性能检测 ——
    var _supportsBackdrop = null;
    function supportsBackdropFilter() {
      if (_supportsBackdrop !== null) return _supportsBackdrop;
      _supportsBackdrop = CSS.supports('backdrop-filter', 'blur(1px)') ||
                          CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
      return _supportsBackdrop;
    }

    // —— 低性能设备检测 ——
    var _isLowPerf = null;
    function isLowPerformance() {
      if (_isLowPerf !== null) return _isLowPerf;
      var dm = window.matchMedia('(prefers-reduced-motion: reduce)');
      _isLowPerf = dm.matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
      return _isLowPerf;
    }

    // —— 生成 CSS 字符串 ——
    function generateCSS(params) {
      var p = params || {};
      var blur = p.blur || DEFAULTS.blur;
      var highlight = p.highlight || DEFAULTS.highlight;
      var border = p.border || DEFAULTS.border;
      var shadow = p.shadow || DEFAULTS.shadow;
      var transition = p.transition || DEFAULTS.transition;

      var radius = isLowPerformance() ? Math.min(blur.radius, 8) : blur.radius;
      var sat = isLowPerformance() ? 100 : blur.saturation;

      var css = {};

      // 核心模糊
      if (supportsBackdropFilter()) {
        css.backdropFilter = 'blur(' + radius + 'px) saturate(' + sat + '%)';
        css.webkitBackdropFilter = 'blur(' + radius + 'px) saturate(' + sat + '%)';
      } else {
        // 降级: 纯色背景
        css.background = 'rgba(255,255,255,.88)';
      }

      return css;
    }

    // —— 动态光影追踪 ——
    function attachHighlightTracking(el) {
      if (!el) return;
      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        var y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        el.style.setProperty('--lg-x', x + '%');
        el.style.setProperty('--lg-y', y + '%');
      });
      el.addEventListener('mouseleave', function () {
        el.style.setProperty('--lg-x', '50%');
        el.style.setProperty('--lg-y', '50%');
      });
    }

    // —— 点击波纹效果 ——
    function attachRipple(el) {
      if (!el) return;
      el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.addEventListener('click', function (e) {
        var rect = el.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var ripple = document.createElement('span');
        ripple.style.cssText = 'position:absolute;border-radius:50%;background:rgba(255,255,255,.4);' +
          'transform:scale(0);animation:lg-ripple .6s ease-out;pointer-events:none;' +
          'left:' + (x - 20) + 'px;top:' + (y - 20) + 'px;width:40px;height:40px;';
        el.appendChild(ripple);
        setTimeout(function () { ripple.remove(); }, 600);
      });
    }

    // —— 初始化动画 ——
    function _injectAnimCSS() {
      if (document.getElementById('lg-anim-css')) return;
      var s = document.createElement('style');
      s.id = 'lg-anim-css';
      s.textContent = '@keyframes lg-ripple{to{transform:scale(4);opacity:0}}';
      document.head.appendChild(s);
    }

    return {
      DEFAULTS: DEFAULTS,
      PRESETS: PRESETS,
      applyColorPreset: applyColorPreset,
      supportsBackdropFilter: supportsBackdropFilter,
      isLowPerformance: isLowPerformance,
      generateCSS: generateCSS,
      attachHighlightTracking: attachHighlightTracking,
      attachRipple: attachRipple,
      init: function () {
        _injectAnimCSS();
        var savedColor = EWTH.store.get('glassColor') || 'white';
        applyColorPreset(savedColor);
        EWTH.logger.info('LIQUIDGLASS', 'init (backdrop=' + supportsBackdropFilter() + ', lowPerf=' + isLowPerformance() + ', color=' + savedColor + ')');
      }
    };
  })();

  // ============================================================
  // 17. EWTH.gui — 浮动控制面板 (液态玻璃版)
  // ============================================================
  EWTH.gui = (function () {
    var _open = false;
    var _panel = null;
    var _overlay = null;
    var VERSION = '4.4.0';

    var CSS = [
      /* === CSS 变量 — 液态玻璃颜色 === */
      ':root{--lg-r:255;--lg-g:255;--lg-b:255}',

      /* === 容器 === */
      '.ewt4-ct{position:fixed;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;touch-action:none;pointer-events:auto}',

      /* === 按钮 — 默认样式 (所有设备) === */
      '.ewt4-btn{',
        'width:54px;height:54px;border-radius:50%;',
        '-webkit-backdrop-filter:blur(20px) saturate(200%);',
        'backdrop-filter:blur(20px) saturate(200%);',
        'background:linear-gradient(170deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.25) 0%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.08) 40%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.15) 100%);',
        'border:1.5px solid rgba(var(--lg-r),var(--lg-g),var(--lg-b),.45);',
        'box-shadow:',
          '0 2px 12px rgba(0,0,0,.04),',
          '0 0 0 1px rgba(var(--lg-r),var(--lg-g),var(--lg-b),.15),',
          'inset 0 1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.6),',
          'inset 0 -1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.1);',
        'color:#1a1a1a;cursor:grab;',
        'display:flex;align-items:center;justify-content:center;',
        'font-size:24px;',
        'transition:all .3s cubic-bezier(.32,.72,0,1);',
        'position:relative;overflow:hidden;',
        'visibility:visible !important;',
        'opacity:1 !important;',
        'z-index:2147483647 !important;',
      '}',
      '.ewt4-btn::before{',
        'content:"";position:absolute;inset:0;border-radius:50%;',
        'background:linear-gradient(155deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.3) 0%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.03) 40%,transparent 65%);pointer-events:none;',
      '}',
      '.ewt4-btn::after{',
        'content:"";position:absolute;top:5px;left:10px;width:16px;height:9px;',
        'background:radial-gradient(ellipse,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4) 0%,transparent 70%);',
        'border-radius:50%;transform:rotate(-25deg);pointer-events:none;',
      '}',
      '.ewt4-btn::before{',
        'content:"";position:absolute;inset:0;border-radius:50%;',
        'background:linear-gradient(155deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.3) 0%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.03) 40%,transparent 65%);pointer-events:none;',
      '}',
      '.ewt4-btn::after{',
        'content:"";position:absolute;top:5px;left:10px;width:16px;height:9px;',
        'background:radial-gradient(ellipse,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4) 0%,transparent 70%);',
        'border-radius:50%;transform:rotate(-25deg);pointer-events:none;',
      '}',
      '.ewt4-btn:hover{',
        'background:linear-gradient(170deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.35) 0%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.12) 40%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.2) 100%);',
        'border-color:rgba(var(--lg-r),var(--lg-g),var(--lg-b),.6);',
        'box-shadow:',
          '0 4px 20px rgba(0,0,0,.06),',
          '0 0 0 1px rgba(var(--lg-r),var(--lg-g),var(--lg-b),.25),',
          '0 0 15px rgba(var(--lg-r),var(--lg-g),var(--lg-b),.1),',
          'inset 0 1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.7),',
          'inset 0 -1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.15);',
      '}',
      '.ewt4-btn:active{cursor:grabbing;transform:scale(.95);transition-duration:.1s}',
      '.ewt4-btn.ewt4-dragging{cursor:grabbing;transform:scale(1.05);transition:none}',

      /* === 面板 — 液态玻璃质感 (所有设备) === */
      '.ewt4-pnl{',
        'position:absolute;bottom:64px;right:0;width:320px;',
        '-webkit-backdrop-filter:blur(24px) saturate(200%);',
        'backdrop-filter:blur(24px) saturate(200%);',
        'background:linear-gradient(170deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.22) 0%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.06) 35%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.12) 65%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.18) 100%);',
        'border:1.5px solid rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4);',
        'border-radius:22px;',
        'box-shadow:',
          '0 12px 40px rgba(0,0,0,.04),',
          '0 0 0 1px rgba(var(--lg-r),var(--lg-g),var(--lg-b),.12),',
          'inset 0 1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.5),',
          'inset 0 -1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.08);',
        'padding:22px 20px;',
        'display:none;flex-direction:column;gap:6px;',
        'max-height:80vh;overflow-y:auto;',
        'transform-origin:bottom right;',
        'visibility:visible !important;',
        'z-index:2147483647 !important;',
      '}',
      '.ewt4-pnl::before{',
        'content:"";position:absolute;inset:0;border-radius:22px;',
        'background:linear-gradient(160deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.18) 0%,transparent 45%);pointer-events:none;',
      '}',
      '.ewt4-pnl::after{',
        'content:"";position:absolute;top:1px;left:20px;right:20px;height:1px;',
        'background:linear-gradient(90deg,transparent,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4) 25%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.6) 50%,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4) 75%,transparent);',
        'pointer-events:none;',
      '}',
      '.ewt4-pnl.open{',
        'display:flex;',
        'animation:ewt4-glass-in .35s cubic-bezier(.32,.72,0,1) forwards;',
      '}',
      '@keyframes ewt4-glass-in{',
        '0%{opacity:0;transform:scale(.92) translateY(12px)}',
        '100%{opacity:1;transform:scale(1) translateY(0)}',
      '}',

      /* === 文字 — 固定黑色 === */
      '.ewt4-ttl{font-size:18px;font-weight:600;color:#1a1a1a;text-align:center;letter-spacing:.3px;position:relative;z-index:1}',
      '.ewt4-ver{font-size:12px;color:rgba(0,0,0,.35);text-align:center;margin-bottom:8px;letter-spacing:.5px;position:relative;z-index:1}',

      /* === 行项目 === */
      '.ewt4-row{display:flex;align-items:center;justify-content:space-between;padding:12px 10px;border-bottom:1px solid rgba(0,0,0,.06);transition:background .2s;border-radius:10px;position:relative;z-index:1}',
      '.ewt4-row:last-child{border-bottom:none}',
      '.ewt4-row:hover{background:rgba(0,0,0,.03)}',

      /* === 标签 === */
      '.ewt4-lbl{font-size:15px;font-weight:500;color:#1a1a1a}',
      '.ewt4-lbl.br{background:linear-gradient(135deg,#1565C0,#1976D2,#2196F3);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:600}',

      /* === Toggle === */
      '.ewt4-sw{position:relative;display:inline-block;width:44px;height:26px;flex-shrink:0}',
      '.ewt4-sw input{opacity:0;width:0;height:0}',
      '.ewt4-sl{',
        'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;',
        'background:rgba(0,0,0,.08);',
        'border:1px solid rgba(0,0,0,.06);',
        'transition:all .35s cubic-bezier(.32,.72,0,1);',
        'border-radius:26px;',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,.06);',
      '}',
      '.ewt4-sl:before{',
        'position:absolute;content:"";height:20px;width:20px;left:2px;bottom:2px;',
        'background:#fff;',
        'transition:all .35s cubic-bezier(.32,.72,0,1);border-radius:50%;',
        'box-shadow:0 1px 3px rgba(0,0,0,.12);',
      '}',
      '.ewt4-sw input:checked+.ewt4-sl{',
        'background:linear-gradient(135deg,#1976D2,#2196F3);',
        'border-color:rgba(33,150,243,.4);',
        'box-shadow:inset 0 1px 2px rgba(0,0,0,.1),0 0 8px rgba(33,150,243,.12);',
      '}',
      '.ewt4-sw input:checked+.ewt4-sl:before{',
        'transform:translateX(18px);',
        'box-shadow:0 1px 4px rgba(33,150,243,.2);',
      '}',

      /* === 引导遮罩 (高透明度) === */
      '.ewt4-ov{',
        'position:fixed;top:0;left:0;width:100%;height:100%;',
        'background:rgba(0,0,0,.08);',
        '-webkit-backdrop-filter:blur(8px);',
        'backdrop-filter:blur(8px);',
        'z-index:99998;',
        'display:flex;flex-direction:column;justify-content:center;align-items:center;',
        'animation:ewt4-ov-in .5s ease forwards;',
      '}',
      '@keyframes ewt4-ov-in{0%{opacity:0}100%{opacity:1}}',
      '.ewt4-ovt{',
        'color:#1a1a1a;font-size:22px;font-weight:600;',
        'margin-bottom:20px;text-align:center;line-height:1.7;',
        '-webkit-backdrop-filter:blur(24px) saturate(200%);',
        'backdrop-filter:blur(24px) saturate(200%);',
        'background:linear-gradient(170deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.25),rgba(var(--lg-r),var(--lg-g),var(--lg-b),.08),rgba(var(--lg-r),var(--lg-g),var(--lg-b),.15));',
        'border:1.5px solid rgba(var(--lg-r),var(--lg-g),var(--lg-b),.4);',
        'border-radius:20px;padding:24px 32px;',
        'box-shadow:',
          '0 6px 20px rgba(0,0,0,.03),',
          '0 0 0 1px rgba(var(--lg-r),var(--lg-g),var(--lg-b),.12),',
          'inset 0 1px 0 rgba(var(--lg-r),var(--lg-g),var(--lg-b),.5);',
        'position:relative;overflow:hidden;',
      '}',
      '.ewt4-ovt::before{',
        'content:"";position:absolute;inset:0;border-radius:20px;',
        'background:linear-gradient(160deg,rgba(var(--lg-r),var(--lg-g),var(--lg-b),.2) 0%,transparent 45%);pointer-events:none;',
      '}',
      '.ewt4-arr{',
        'position:fixed;bottom:80px;right:80px;',
        'color:rgba(0,0,0,.4);font-size:56px;',
        'animation:ewt4-b 1.5s cubic-bezier(.32,.72,0,1) infinite;transform:rotate(45deg);',
      '}',
      '@keyframes ewt4-b{0%,100%{transform:translate(0,0) rotate(45deg)}50%{transform:translate(15px,15px) rotate(45deg)}}',

      /* === 滚动条 === */
      '.ewt4-pnl::-webkit-scrollbar{width:4px}',
      '.ewt4-pnl::-webkit-scrollbar-track{background:transparent}',
      '.ewt4-pnl::-webkit-scrollbar-thumb{background:rgba(0,0,0,.06);border-radius:4px}',

      /* === 颜色选择器 === */
      '.ewt4-color-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}',
      '.ewt4-color-btn{',
        'display:flex;flex-direction:column;align-items:center;gap:5px;',
        'padding:8px 10px;border-radius:12px;border:1.5px solid transparent;',
        'background:rgba(0,0,0,.03);cursor:pointer;',
        'transition:all .2s;',
      '}',
      '.ewt4-color-btn:hover{background:rgba(0,0,0,.06)}',
      '.ewt4-color-btn.active{border-color:rgba(33,150,243,.5);background:rgba(33,150,243,.08)}',
      '.ewt4-color-dot{',
        'width:24px;height:24px;border-radius:50%;',
        'border:1.5px solid rgba(0,0,0,.1);',
        'box-shadow:inset 0 1px 2px rgba(255,255,255,.5);',
      '}',
      '.ewt4-color-name{font-size:11px;color:rgba(0,0,0,.5);white-space:nowrap}',

      /* === 性能优化: 低性能设备降级 === */
      '@media(prefers-reduced-motion:reduce){',
        '.ewt4-btn,.ewt4-pnl,.ewt4-ovt{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}',
      '}',

      /* === 动态光影追踪 (液态玻璃) === */
      '.ewt4-btn::before,.ewt4-pnl::before{',
        'background:radial-gradient(circle at var(--lg-x,50%) var(--lg-y,50%),rgba(var(--lg-r),var(--lg-g),var(--lg-b),.35) 0%,transparent 50%);',
        'opacity:0;transition:opacity .3s;',
      '}',
      '.ewt4-btn:hover::before,.ewt4-pnl:hover::before{opacity:1}',

      /* === 浏览器兼容降级 === */
      '@supports not (backdrop-filter:blur(1px)){',
        '.ewt4-btn{background:rgba(255,255,255,.85)}',
        '.ewt4-pnl{background:rgba(255,255,255,.9)}',
        '.ewt4-ovt{background:rgba(255,255,255,.92)}',
      '}',
    ].join('\n');

    function _injectCSS() {
      var s = document.createElement('style');
      s.id = 'ewt4-gui-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    function _makeToggle(id, label, isBrush) {
      var row = document.createElement('div');
      row.className = 'ewt4-row';
      var lab = document.createElement('label');
      lab.className = 'ewt4-lbl' + (isBrush ? ' br' : '');
      lab.textContent = label;
      var sw = document.createElement('label');
      sw.className = 'ewt4-sw';
      var inp = document.createElement('input');
      inp.type = 'checkbox'; inp.id = 'ewt4-' + id;
      inp.checked = !!EWTH.store.get(id);
      var sl = document.createElement('span');
      sl.className = 'ewt4-sl';
      sw.appendChild(inp); sw.appendChild(sl);
      row.appendChild(lab); row.appendChild(sw);

      var modMap = {
        autoSkip: EWTH.autoskip, autoPlay: EWTH.autoplay,
        autoCheckPass: EWTH.checkpass, speedControl: EWTH.speed,
        lockProgress: EWTH.progresslock, muteAudio: EWTH.mute
      };

      inp.onchange = function () {
        var checked = inp.checked;
        EWTH.store.set(id, checked);
        if (id === 'brushMode') { EWTH.brushmode.toggle(checked); _syncAll(); }
        else if (modMap[id]) { modMap[id].toggle(checked); _syncBrushMode(); }
      };
      return row;
    }

    function _makeColorPicker() {
      var container = document.createElement('div');
      container.className = 'ewt4-row';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'stretch';
      container.style.gap = '8px';

      var label = document.createElement('div');
      label.className = 'ewt4-lbl';
      label.textContent = '玻璃色调';
      container.appendChild(label);

      var btnRow = document.createElement('div');
      btnRow.className = 'ewt4-color-row';

      var presets = EWTH.liquidglass.PRESETS;
      var currentColor = EWTH.store.get('glassColor') || 'white';

      var keys = Object.keys(presets);
      for (var i = 0; i < keys.length; i++) {
        (function (key) {
          var p = presets[key];
          var btn = document.createElement('button');
          btn.className = 'ewt4-color-btn' + (key === currentColor ? ' active' : '');
          btn.title = p.label;
          btn.setAttribute('data-color', key);
          var dot = document.createElement('span');
          dot.className = 'ewt4-color-dot';
          dot.style.background = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
          var name = document.createElement('span');
          name.className = 'ewt4-color-name';
          name.textContent = p.label;
          btn.appendChild(dot);
          btn.appendChild(name);
          btn.onclick = function () {
            EWTH.liquidglass.applyColorPreset(key);
            var allBtns = btnRow.querySelectorAll('.ewt4-color-btn');
            for (var j = 0; j < allBtns.length; j++) allBtns[j].classList.remove('active');
            btn.classList.add('active');
          };
          btnRow.appendChild(btn);
        })(keys[i]);
      }

      container.appendChild(btnRow);
      return container;
    }

    function _syncAll() {
      var ids = ['autoSkip', 'autoPlay', 'autoCheckPass', 'speedControl', 'lockProgress', 'muteAudio', 'brushMode'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById('ewt4-' + ids[i]);
        if (el) el.checked = !!EWTH.store.get(ids[i]);
      }
    }

    function _syncBrushMode() {
      var allOn = EWTH.store.get('autoSkip') && EWTH.store.get('autoPlay') &&
                  EWTH.store.get('autoCheckPass') && EWTH.store.get('speedControl') &&
                  EWTH.store.get('lockProgress') && EWTH.store.get('muteAudio');
      var el = document.getElementById('ewt4-brushMode');
      if (el) el.checked = allOn;
      EWTH.store.set('brushMode', allOn);
    }

    function _showGuide() {
      if (EWTH.store.get('hasShownGuide')) return;
      _overlay = document.createElement('div');
      _overlay.className = 'ewt4-ov';
      var t = document.createElement('div');
      t.className = 'ewt4-ovt';
      t.innerHTML = '欢迎使用升学E网通助手 v' + VERSION + '<br>点击右下角蓝色图标打开控制面板';
      var a = document.createElement('div');
      a.className = 'ewt4-arr';
      a.textContent = '\u{1F449}';
      _overlay.appendChild(t); _overlay.appendChild(a);
      document.body.appendChild(_overlay);
    }

    return {
      init: function () {
        EWTH.logger.info('GUI', 'init called');
        _injectCSS();

        // 检测 backdrop-filter 是否真正可用 (Edge 仿真模式可能声明支持但不渲染)
        var _testEl = document.createElement('div');
        _testEl.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;-webkit-backdrop-filter:blur(1px);backdrop-filter:blur(1px)';
        document.documentElement.appendChild(_testEl);
        var _computedBdf = getComputedStyle(_testEl).backdropFilter || getComputedStyle(_testEl).webkitBackdropFilter || '';
        document.documentElement.removeChild(_testEl);
        var _glassSupported = _computedBdf.indexOf('blur') !== -1;
        EWTH.logger.info('GUI', 'backdrop-filter: ' + (_glassSupported ? 'supported' : 'NOT supported, using fallback'));

        if (!_glassSupported) {
          // 注入降级样式
          var fallbackCSS = document.createElement('style');
          fallbackCSS.textContent = '.ewt4-btn{background:rgba(255,255,255,.92)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:0 4px 20px rgba(0,0,0,.12)!important;border:1px solid rgba(0,0,0,.1)!important}' +
            '.ewt4-pnl{background:rgba(255,255,255,.98)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:0 8px 32px rgba(0,0,0,.12)!important;border:1px solid rgba(0,0,0,.08)!important}';
          document.documentElement.appendChild(fallbackCSS);
        }

        var ct = document.createElement('div'); ct.className = 'ewt4-ct';

        // —— 恢复上次保存的位置 ——
        var POS_KEY = 'ewt_helper_v4_pos';
        var savedPos = null;
        try { savedPos = JSON.parse(localStorage.getItem(POS_KEY)); } catch (e) {}
        if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
          ct.style.right = 'auto';
          ct.style.left = savedPos.x + 'px';
          ct.style.top = savedPos.y + 'px';
        } else {
          ct.style.bottom = '20px';
          ct.style.right = '20px';
        }

        var btn = document.createElement('button');
        btn.className = 'ewt4-btn';
        btn.textContent = '\u{1F4DA}';
        btn.title = '升学E网通助手 v' + VERSION;
        ct.appendChild(btn);

        _panel = document.createElement('div'); _panel.className = 'ewt4-pnl';
        var ttl = document.createElement('div'); ttl.className = 'ewt4-ttl'; ttl.textContent = '升学E网通助手';
        var ver = document.createElement('div'); ver.className = 'ewt4-ver'; ver.textContent = 'v' + VERSION;
        _panel.appendChild(ttl); _panel.appendChild(ver);
        _panel.appendChild(_makeToggle('autoSkip', '自动跳题', false));
        _panel.appendChild(_makeToggle('autoPlay', '自动连播', false));
        _panel.appendChild(_makeToggle('autoCheckPass', '自动过检', false));
        _panel.appendChild(_makeToggle('speedControl', '2倍速播放', false));
        _panel.appendChild(_makeToggle('lockProgress', '锁定进度条', false));
        _panel.appendChild(_makeToggle('muteAudio', '静音播放', false));
        _panel.appendChild(_makeColorPicker());
        _panel.appendChild(_makeToggle('brushMode', '刷课模式（一键全开）', true));
        ct.appendChild(_panel);

        // 等待 body 可用再添加
        function _appendToBody() {
          if (document.body) {
            document.body.appendChild(ct);
            EWTH.logger.info('GUI', 'button appended to body');
          } else {
            EWTH.logger.debug('GUI', 'body not ready, waiting...');
            setTimeout(_appendToBody, 100);
          }
        }
        _appendToBody();

        // —— 拖拽逻辑 ——
        var _dragging = false;
        var _dragMoved = false;
        var _startX = 0, _startY = 0;
        var _origX = 0, _origY = 0;
        var DRAG_THRESHOLD = 6; // 移动超过6px才算拖拽

        function _onPointerDown(e) {
          if (e.button && e.button !== 0) return; // 只响应左键
          _dragging = true;
          _dragMoved = false;
          var rect = ct.getBoundingClientRect();
          _origX = rect.left;
          _origY = rect.top;
          _startX = e.clientX;
          _startY = e.clientY;
          ct.style.right = 'auto';
          ct.style.bottom = 'auto';
          ct.style.left = _origX + 'px';
          ct.style.top = _origY + 'px';
          btn.classList.add('ewt4-dragging');
          e.preventDefault();
        }

        function _onPointerMove(e) {
          if (!_dragging) return;
          var dx = e.clientX - _startX;
          var dy = e.clientY - _startY;
          if (!_dragMoved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
          _dragMoved = true;
          var nx = _origX + dx;
          var ny = _origY + dy;
          // 边界限制
          var W = window.innerWidth, H = window.innerHeight;
          nx = Math.max(0, Math.min(nx, W - 60));
          ny = Math.max(0, Math.min(ny, H - 60));
          ct.style.left = nx + 'px';
          ct.style.top = ny + 'px';
        }

        function _onPointerUp(e) {
          if (!_dragging) return;
          _dragging = false;
          btn.classList.remove('ewt4-dragging');
          if (_dragMoved) {
            var rect = ct.getBoundingClientRect();
            try { localStorage.setItem(POS_KEY, JSON.stringify({ x: rect.left, y: rect.top })); } catch (ex) {}
            // 拖拽结束 → 重新采样颜色
            if (_open) {} // panel already open after drag
          } else {
            EWTH.gui.toggle();
          }
        }

        // 鼠标事件
        btn.addEventListener('mousedown', _onPointerDown);
        document.addEventListener('mousemove', _onPointerMove);
        document.addEventListener('mouseup', _onPointerUp);
        // 触摸事件
        btn.addEventListener('touchstart', function (e) {
          var t = e.touches[0];
          _onPointerDown({ clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: function(){ e.preventDefault(); } });
        }, { passive: false });
        document.addEventListener('touchmove', function (e) {
          if (!_dragging) return;
          var t = e.touches[0];
          _onPointerMove({ clientX: t.clientX, clientY: t.clientY });
        }, { passive: false });
        document.addEventListener('touchend', function (e) { _onPointerUp({}); });

        // 液态玻璃效果: 光影追踪 + 点击波纹
        EWTH.liquidglass.attachHighlightTracking(btn);
        EWTH.liquidglass.attachRipple(btn);
        EWTH.liquidglass.attachHighlightTracking(_panel);

        _showGuide();
        EWTH.logger.info('GUI', 'ready v' + VERSION + ' (draggable + liquidglass)');
      },

      toggle: function () {
        _open = !_open;
        _panel.classList.toggle('open', _open);
        if (_open) {
          // 根据按钮位置决定面板弹出方向
          var btnRect = _panel.parentElement.getBoundingClientRect();
          var btnCenter = btnRect.left + btnRect.width / 2;
          if (btnCenter < window.innerWidth / 2) {
            _panel.style.right = 'auto';
            _panel.style.left = '0';
            _panel.style.transformOrigin = 'bottom left';
          } else {
            _panel.style.right = '0';
            _panel.style.left = 'auto';
            _panel.style.transformOrigin = 'bottom right';
          }
          if (_overlay) { _overlay.remove(); _overlay = null; EWTH.store.set('hasShownGuide', true); }
        }
      },

      syncCheckbox: function (id, value) {
        var el = document.getElementById('ewt4-' + id);
        if (el) el.checked = value;
        _syncBrushMode();
      }
    };
  })();

  // ============================================================
  // 18. BOOTSTRAP — 初始化 & SPA 导航 (v4.4.0)
  // ============================================================
  var _bootRetry = 0;
  var MAX_RETRY = 10;
  var _booted = false;

  function _boot() {
    if (_booted) return;
    EWTH.logger.info('BOOT', 'attempt ' + (_bootRetry + 1));
    if (!document.body) {
      EWTH.logger.debug('BOOT', 'body not ready, retry ' + (_bootRetry + 1));
      if (_bootRetry++ < MAX_RETRY) setTimeout(_boot, 300);
      return;
    }

    try {
      // 步骤0: 初始化存储
      EWTH.logger.debug('BOOT', 'step 0: store.init');
      EWTH.store.init();

      // 步骤1: API 拦截
      EWTH.logger.debug('BOOT', 'step 1: apiIntercept.init');
      EWTH.apiIntercept.init();

      // 步骤2: 反检测对抗
      EWTH.logger.debug('BOOT', 'step 2: antidetection.init');
      EWTH.antidetection.init();

      // 步骤3: 液态玻璃系统初始化
      EWTH.logger.debug('BOOT', 'step 3: liquidglass.init');
      EWTH.liquidglass.init();

      // 步骤4: GUI 面板
      EWTH.logger.debug('BOOT', 'step 4: gui.init');
      EWTH.gui.init();

      // 步骤5: 任务页自动跳下一天
      EWTH.logger.debug('BOOT', 'step 5: nextday.run');
      EWTH.nextday.run();

      // 步骤6: 设置日志级别
      EWTH.logger.setLevel(EWTH.config.DEBUG ? 4 : 0);

      // 步骤7: 恢复上次保存的功能状态
      EWTH.logger.debug('BOOT', 'step 7: restore state');
      if (EWTH.store.get('brushMode')) {
        EWTH.brushmode.toggle(true);
      } else {
        if (EWTH.store.get('autoSkip'))      EWTH.autoskip.toggle(true);
        if (EWTH.store.get('autoPlay'))      EWTH.autoplay.toggle(true);
        if (EWTH.store.get('autoCheckPass')) EWTH.checkpass.toggle(true);
        if (EWTH.store.get('speedControl'))  EWTH.speed.toggle(true);
        if (EWTH.store.get('lockProgress'))  EWTH.progresslock.toggle(true);
        if (EWTH.store.get('muteAudio'))     EWTH.mute.toggle(true);
      }

      _booted = true;
      _bootRetry = 0;
      EWTH.logger.info('BOOT', 'v4.4.0 ready');
    } catch (e) {
      EWTH.logger.error('BOOT', 'failed at step: ' + e.message);
      console.error('[EWT Helper] BOOT error:', e);
    }
  }

  // ========= 早期拦截: 在 DOM 就绪前就设置 API 拦截 =========
  // @run-at document-start 确保我们在页面脚本执行前就位
  EWTH.apiIntercept.init();

  // ========= 等待 DOM 就绪 =========
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(_boot, 1);
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(_boot, 1); });
  }
  window.addEventListener('load', _boot);

  // ========= SPA 导航重连 + video 热加固 + earnest check 紧急修补 =========
  if (typeof MutationObserver !== 'undefined') {
    function _initMutedObserver() {
      if (!document.documentElement) { setTimeout(_initMutedObserver, 100); return; }
      new MutationObserver(function (mutations) {
        // SPA 重连: GUI 面板丢失时重建
        if (document.body && !document.querySelector('.ewt4-ct')) {
          _booted = false;
          _boot();
        }
        // video 热加固
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
          if (!videos[i]._ewt_hardened && EWTH.store.get('speedControl')) {
            EWTH.speed._hardenVideo(videos[i]);
            EWTH.speed._apply(videos[i]);
          }
          // mute 加固
          if (!videos[i]._ewt_mute_hardened && EWTH.store.get('muteAudio')) {
            EWTH.mute._hardenVideo(videos[i]);
            EWTH.mute._apply(videos[i]);
          }
        }
        // SPA 页面切换时修补黑名单状态
        if (document.body && EWTH.store.get('autoCheckPass')) {
          EWTH.core.patchBlacklistState(document.body);
        }

        // earnest check 弹窗紧急修补 (v4.4.0 新增)
        // 检测 ev/ek 组件 DOM 出现, 立即修补 Context 并执行 bypass
        if (EWTH.store.get('autoCheckPass')) {
          for (var mi = 0; mi < mutations.length; mi++) {
            var added = mutations[mi].addedNodes;
            for (var mj = 0; mj < added.length; mj++) {
              if (added[mj].nodeType !== 1) continue;
              var el = added[mj];
              var found = false;
              // 检查 earnest check DOM
              if (el.className && typeof el.className === 'string') {
                if (el.className.indexOf('video_earnest_check_box') !== -1 ||
                    el.className.indexOf('spc_video_earnest_check_box') !== -1) {
                  found = true;
                }
              }
              if (!found && el.querySelector) {
                if (el.querySelector('[data-ac="check-pass"]') ||
                    el.querySelector('#captcha')) {
                  found = true;
                }
              }
              if (found) {
                EWTH.logger.info('BOOT', 'earnest check popup detected, patching');
                EWTH.core.patchBlacklistState(document.body);
                // 延迟让组件完全挂载后再 bypass
                setTimeout(function () {
                  // 优先尝试简单检测按钮 (ev组件)
                  var btn = document.querySelector('[data-ac="check-pass"]');
                  if (btn && btn.offsetParent) {
                    EWTH.core.doCheckPass(btn);
                  } else {
                    // 可能是CAPTCHA模式 (ek组件) — doCheckPass内部有#captcha fallback
                    var cap = document.querySelector('#captcha');
                    if (cap && cap.offsetParent) {
                      EWTH.core.doCheckPass(cap);
                    }
                  }
                }, 50);
                break; // 一次突变只处理一次
              }
            }
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
    setTimeout(_initMutedObserver, 50);
  }

})();
