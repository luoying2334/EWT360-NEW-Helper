// ==UserScript==
// @name         升学E网通助手 v4.2.0
// @version      4.2.0
// @description  适配2026.7.23平台更新：FiberGuard绕过 + CAPTCHA滑块适配 + API拦截
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        https://web.ewt360.com/site-study/*
// @match        http://web.ewt360.com/site-study/*
// @namespace    https://github.com/luoying2334/EWT360-NEW-Helper
// @author       luoying2334
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
      CHECKPASS_CHECK:  800,
      AUTOPLAY_CHECK:  2000,
      SPEED_REAPPLY:   3000,
      CONTEXT_PATCH:   1000
    },

    // —— API 端点 (2026.7.23 更新) ——
    // _doReportVideoPoint → reportVideoPoint(旧) | 其他组件 → addVideocss(新)
    API: {
      REPORT_VIDEO: '/api/homeworkprod/homework/student/reportVideoPoint', // 旧API (_doReportVideoPoint用)
      VIDEO_CHECK:  '/api/homeworkprod/homework/student/addVideocss',      // 新API (备用fallback)
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
      brushMode:      false,
      hasShownGuide:  false
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
  // 4. EWTH.apiIntercept — 黑名单 API 拦截 (NEW v4.2.0)
  // ============================================================
  EWTH.apiIntercept = (function () {
    var _intercepted = false;

    var BLOCK_LIST = [
      EWTH.config.API.ADD_BLACK    // addStudp - 阻止黑名单上报
    ];

    var FAKE_MAP = {};
    FAKE_MAP[EWTH.config.API.GET_BLACK]   = '{"data":false}';    // 始终返回"非黑名单"
    FAKE_MAP[EWTH.config.API.DOWNGRADE]   = '{"data":{"seriousCheckDownGrade":true}}'; // 降级配置

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
  // 5. EWTH.core — Fiber 工具 + 原型方法绕过 (v4.2.0 重写)
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

    // ========= 认真度检测 bypass (v4.2.0 重写) =========
    // 平台 guard 模式 (homework-play-video pos~29678):
    //   constructor 中: this.reportVideoPoint = async e => { if(!em){em=!0;...} return !1 }
    //   → reportVideoPoint 从构造时就已是 guard，永远返回 false
    //   → 但 _doReportVideoPoint 是未被保护的原始 API 方法
    //   → 正常流程 _nativeClickHandler (isTrusted检查通过后) 调的是 _doReportVideoPoint
    // 绕过方案: 直接调 _doReportVideoPoint，跳过 isTrusted/instanceof 检查
    function doCheckPass(el) {
      if (!el) return false;
      var inst = _findInst(el, '_nativeClickHandler');
      if (!inst) {
        inst = _findInstByState(el, 'earnestCurrentSecond');
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
          seriousCheckResult: 2
        };

        // 步骤1: 停止倒计时
        try { clearInterval(inst.timerId); } catch (e2) { /* ignore */ }

        // 步骤2: 调用 _doReportVideoPoint (未被 guard 保护!)
        // 平台正常代码流: _nativeClickHandler → _doReportVideoPoint(interfaceData)
        // 注意: alertVideoPoint 在 constructor 中已被替换为 guard (永远返回 false)
        var doReport = inst._doReportVideoPoint;
        if (typeof doReport === 'function') {
          EWTH.logger.debug('CORE', 'using _doReportVideoPoint');
          doReport.call(inst, ifData).then(function (result) {
            if (result === 1) {
              // 与平台原生逻辑一致: 1===result → callback(true) + play
              try { p.callback(true); } catch (e3) { /* ignore */ }
              try { p.oEplayer && p.oEplayer.resumeHotKeys && p.oEplayer.resumeHotKeys(); } catch (e3) { /* ignore */ }
              try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) { /* ignore */ }
            }
          }).catch(function () { /* ignore */ });
        } else {
          // 兜底: 直接调 API
          EWTH.logger.debug('CORE', 'fallback: direct API');
          fetch(EWTH.config.API.VIDEO_CHECK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ifData)
          }).then(function (r) { return r.json(); })
            .then(function (result) {
              if (result && result.success) {
                try { p.callback(true); } catch (e3) { /* ignore */ }
                try { p.oEplayer && p.oEplayer.play && p.oEplayer.play(); } catch (e3) { /* ignore */ }
              }
            }).catch(function () { /* ignore */ });
        }

        // 步骤3: 操作组件状态，隐藏检测 UI
        try {
          inst.setState({
            earnestCurrentSecond: 30,
            timeVisible: false,
            unCheckVisible: false
          });
        } catch (e2) { /* ignore */ }

        EWTH.logger.info('CORE', 'checkPass done');
        return true;
      } catch (err) {
        EWTH.logger.error('CORE', 'checkPass: ' + err.message);
        return false;
      }
    }

    // ========= 上下文黑名单状态修补 =========
    // 平台 Context Provider O 是函数组件 (useState)，state 存储在 fiber.memoizedState
    // 不能用 patchBlacklistState(prev) 的 stateNode.state 方式访问
    // 方案: 调用 inst.context.getVideodp() → 触发 API 重查 → 我们拦截返回 false → isBlacklisted 被置为 false
    function patchBlacklistState(el) {
      // 找 earnest check 组件实例 (它有 context 引用)
      var inst = _findInstByState(el, 'earnestCurrentSecond');
      if (!inst) {
        inst = _findInst(el, '_nativeClickHandler');
      }
      if (!inst || !inst.context) return false;

      try {
        // 方式1: 触发 getVideodp() 重查 (API 已被我们拦截, 永远返回 {data:false})
        if (typeof inst.context.getVideodp === 'function') {
          inst.context.getVideodp();
          EWTH.logger.info('CORE', 'triggered getVideodp re-query');
          return true;
        }
        // 方式2: 直接篡改 context 值 (备选)
        if (inst.context.isBlacklisted) {
          inst.context.isBlacklisted = false;
          try { inst.forceUpdate && inst.forceUpdate(); } catch (e) {}
          EWTH.logger.info('CORE', 'direct patched context.isBlacklisted');
          return true;
        }
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
  // 6. EWTH.autoskip — 自动跳题 (v4.2.0 更新)
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
  // 7. EWTH.checkpass — 自动过检 (v4.2.0 重写，双模式适配)
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

    function _handleCaptcha() {
      try {
        // 策略: 找到 CAPTCHA 容器并尝试触发其内部 success 回调
        var captchaEl = null;
        for (var i = 0; i < CAPTCHA_SELECTORS.length; i++) {
          captchaEl = document.querySelector(CAPTCHA_SELECTORS[i]);
          if (captchaEl && captchaEl.offsetParent) break;
          captchaEl = null;
        }
        if (!captchaEl) return false;

        // 尝试通过 Fiber 找到 CAPTCHA 实例
        var fk = EWTH.core.findFiberKey(captchaEl);
        if (!fk) return false;
        var f = captchaEl[fk];

        // 在 fiber 树中找到拥有 success 回调的 earnest check 组件
        var depth = 0;
        while (f && depth < 30) {
          var inst = f.stateNode;
          if (inst && inst.state && inst.state.hasOwnProperty('earnestCurrentSecond')) {
            // 找到了认真度检测组件。CAPTCHA 的成功回调已经绑定。
            // 策略: 不模拟 CAPTCHA 滑块, 而是直接走 bypass 路径
            EWTH.core.doCheckPass(captchaEl);
            EWTH.logger.info('CHECKPASS', 'captcha mode bypass');
            return true;
          }
          f = f.return;
          depth++;
        }
      } catch (e) {
        EWTH.logger.warn('CHECKPASS', 'captcha err: ' + e.message);
      }
      return false;
    }

    function _tryClick() {
      try {
        // 持续修补 isBlacklisted 状态 —— 防止 CAPTCHA 模式激活
        if (document.body) {
          EWTH.core.patchBlacklistState(document.body);
        }

        // 查找认真度检测按钮
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
        if (!btn || !btn.offsetParent) return;
        if (btn === _lastTarget) return;
        _lastTarget = btn;

        // 先执行 bypass（绕过 isTrusted / instanceof 检查）
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
  // 11. EWTH.progresslock — 锁定进度条
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
  // 12. EWTH.antidetection — 反检测对抗 (v4.2.0 更新)
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
        EWTH.logger.info('ANTIDETECT', 'init (v4.2.0)');
      }
    };
  })();

  // ============================================================
  // 13. EWTH.brushmode — 一键刷课
  // ============================================================
  EWTH.brushmode = (function () {
    var KEYS = ['autoSkip', 'autoPlay', 'autoCheckPass', 'speedControl', 'lockProgress'];
    var MODS = {
      autoSkip:      EWTH.autoskip,
      autoPlay:      EWTH.autoplay,
      autoCheckPass: EWTH.checkpass,
      speedControl:  EWTH.speed,
      lockProgress:  EWTH.progresslock
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
  // 14. EWTH.gui — 浮动控制面板
  // ============================================================
  EWTH.gui = (function () {
    var _open = false;
    var _panel = null;
    var _overlay = null;
    var VERSION = '4.2.0';

    var CSS = [
      '.ewt4-ct{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:Arial,sans-serif}',
      '.ewt4-btn{width:50px;height:50px;border-radius:50%;background:#2196F3;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.25);transition:all .3s}',
      '.ewt4-btn:hover{background:#1976D2;transform:scale(1.08)}',
      '.ewt4-pnl{position:absolute;bottom:60px;right:0;width:280px;background:#fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.18);padding:16px;display:none;flex-direction:column;gap:10px;max-height:80vh;overflow-y:auto}',
      '.ewt4-pnl.open{display:flex}',
      '.ewt4-ttl{font-size:18px;font-weight:bold;color:#333;text-align:center}',
      '.ewt4-ver{font-size:11px;color:#999;text-align:center;margin-bottom:4px}',
      '.ewt4-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0}',
      '.ewt4-lbl{font-size:14px;color:#555}',
      '.ewt4-lbl.br{color:#2196F3;font-weight:bold}',
      '.ewt4-sw{position:relative;display:inline-block;width:40px;height:24px;flex-shrink:0}',
      '.ewt4-sw input{opacity:0;width:0;height:0}',
      '.ewt4-sl{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:.4s;border-radius:24px}',
      '.ewt4-sl:before{position:absolute;content:"";height:16px;width:16px;left:4px;bottom:4px;background:#fff;transition:.4s;border-radius:50%}',
      '.ewt4-sw input:checked+.ewt4-sl{background:#2196F3}',
      '.ewt4-sw input:checked+.ewt4-sl:before{transform:translateX(16px)}',
      '.ewt4-ov{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);z-index:99998;display:flex;flex-direction:column;justify-content:center;align-items:center}',
      '.ewt4-ovt{color:#fff;font-size:22px;font-weight:bold;margin-bottom:20px;text-align:center;line-height:1.6}',
      '.ewt4-arr{position:fixed;bottom:80px;right:80px;color:#fff;font-size:56px;animation:ewt4-b 1.5s infinite;transform:rotate(45deg)}',
      '@keyframes ewt4-b{0%,100%{transform:translate(0,0) rotate(45deg)}50%{transform:translate(15px,15px) rotate(45deg)}}',
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
        lockProgress: EWTH.progresslock
      };

      inp.onchange = function () {
        var checked = inp.checked;
        EWTH.store.set(id, checked);
        if (id === 'brushMode') { EWTH.brushmode.toggle(checked); _syncAll(); }
        else if (modMap[id]) { modMap[id].toggle(checked); _syncBrushMode(); }
      };
      return row;
    }

    function _syncAll() {
      var ids = ['autoSkip', 'autoPlay', 'autoCheckPass', 'speedControl', 'lockProgress', 'brushMode'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById('ewt4-' + ids[i]);
        if (el) el.checked = !!EWTH.store.get(ids[i]);
      }
    }

    function _syncBrushMode() {
      var allOn = EWTH.store.get('autoSkip') && EWTH.store.get('autoPlay') &&
                  EWTH.store.get('autoCheckPass') && EWTH.store.get('speedControl') &&
                  EWTH.store.get('lockProgress');
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
        _injectCSS();
        var ct = document.createElement('div'); ct.className = 'ewt4-ct';
        var btn = document.createElement('button');
        btn.className = 'ewt4-btn';
        btn.textContent = '\u{1F4DA}';
        btn.title = '升学E网通助手 v' + VERSION;
        btn.onclick = function () { EWTH.gui.toggle(); };
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
        _panel.appendChild(_makeToggle('brushMode', '刷课模式（一键全开）', true));
        ct.appendChild(_panel);
        document.body.appendChild(ct);

        _showGuide();
        EWTH.logger.info('GUI', 'ready v' + VERSION);
      },

      toggle: function () {
        _open = !_open;
        _panel.classList.toggle('open', _open);
        if (_open && _overlay) { _overlay.remove(); _overlay = null; EWTH.store.set('hasShownGuide', true); }
      },

      syncCheckbox: function (id, value) {
        var el = document.getElementById('ewt4-' + id);
        if (el) el.checked = value;
        _syncBrushMode();
      }
    };
  })();

  // ============================================================
  // 15. BOOTSTRAP — 初始化 & SPA 导航 (v4.2.0)
  // ============================================================
  var _bootRetry = 0;
  var MAX_RETRY = 10;
  var _booted = false;

  function _boot() {
    if (_booted) return;
    if (!document.body) {
      if (_bootRetry++ < MAX_RETRY) setTimeout(_boot, 300);
      return;
    }

    // 步骤0: 初始化存储
    EWTH.store.init();

    // 步骤1: API 拦截（必须最先，阻止 addStudp / getVideodp 请求到达服务器）
    EWTH.apiIntercept.init();

    // 步骤2: 反检测对抗
    EWTH.antidetection.init();

    // 步骤3: GUI 面板
    EWTH.gui.init();

    // 步骤4: 任务页自动跳下一天
    EWTH.nextday.run();

    // 步骤5: 设置日志级别
    EWTH.logger.setLevel(EWTH.config.DEBUG ? 4 : 0);

    // 步骤6: 恢复上次保存的功能状态
    if (EWTH.store.get('brushMode')) {
      EWTH.brushmode.toggle(true);
    } else {
      if (EWTH.store.get('autoSkip'))      EWTH.autoskip.toggle(true);
      if (EWTH.store.get('autoPlay'))      EWTH.autoplay.toggle(true);
      if (EWTH.store.get('autoCheckPass')) EWTH.checkpass.toggle(true);
      if (EWTH.store.get('speedControl'))  EWTH.speed.toggle(true);
      if (EWTH.store.get('lockProgress'))  EWTH.progresslock.toggle(true);
    }

    _booted = true;
    _bootRetry = 0;
    EWTH.logger.info('BOOT', 'v4.2.0 ready');
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

  // ========= SPA 导航重连 + video 热加固 =========
  if (typeof MutationObserver !== 'undefined') {
    function _initMutedObserver() {
      if (!document.documentElement) { setTimeout(_initMutedObserver, 100); return; }
      new MutationObserver(function () {
        if (document.body && !document.querySelector('.ewt4-ct')) {
          _booted = false;
          _boot();
        }
        var videos = document.querySelectorAll('video');
        for (var i = 0; i < videos.length; i++) {
          if (!videos[i]._ewt_hardened && EWTH.store.get('speedControl')) {
            EWTH.speed._hardenVideo(videos[i]);
            EWTH.speed._apply(videos[i]);
          }
        }
        // SPA 页面切换时修补黑名单状态
        if (document.body && EWTH.store.get('autoCheckPass')) {
          EWTH.core.patchBlacklistState(document.body);
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
    setTimeout(_initMutedObserver, 50);
  }

})();
