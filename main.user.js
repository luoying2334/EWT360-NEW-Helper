// ==UserScript==
// @name         升学E网通助手 v4.0.2
// @version      4.0.2
// @description  模块化重构版
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        https://web.ewt360.com/site-study/*
// @match        http://web.ewt360.com/site-study/*
// @namespace    https://github.com/luoying2334/EWT360-NEW-Helper
// @author       luoying2334
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
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
    // —— 定时器间隔 (ms) ——
    INTERVAL: {
      SKIP_CHECK:     1500,
      CHECKPASS_CHECK: 800,
      AUTOPLAY_CHECK: 2000,
      SPEED_REAPPLY:  3000
    },

    // —— 进度条锁定选择器（vjs- 前缀是 Video.js 标准）——
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
      debugEnabled:   false,
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
  // 4. EWTH.core — isTrusted 无法 patch，通过 fiber 直调内部逻辑
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
      while (f) {
        var inst = f.stateNode;
        if (inst && typeof inst[methodName] === 'function') return inst;
        f = f.return;
      }
      return null;
    }

    // ========= 认真度检测 =========
    // 平台 isTrusted 无法 monkey-patch → 不能 dispatchEvent → 不能调 _nativeClickHandler
    // 直接复现 handler 内部的成功路径：stop timer → reportVideoPoint(API) → callback → play
    function doCheckPass(el) {
      if (!el) return false;
      var inst = _findInst(el, '_nativeClickHandler');
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
        // 停止倒计时
        clearInterval(inst.timerId);
        // 调用上报 API
        inst.reportVideoPoint(ifData).then(function (ok) {
          if (ok) {
            try { p.callback(true); } catch (e) { /* ignore */ }
            try { p.oEplayer && p.oEplayer.play(); } catch (e) { /* ignore */ }
          }
        });
        EWTH.logger.info('CORE', 'checkPass done');
        return true;
      } catch (err) {
        EWTH.logger.error('CORE', 'checkPass: ' + err.message);
        return false;
      }
    }

    // ========= 连播 / 跳题 =========
    // React onClick 是闭包，直接从 fiber 调。传入 fakeEvent 防止 e.stopPropagation() 等调用 crash
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

      // BFS，但跳过含按钮文字的元素（导学案/课后习题等）
      var skipTexts = ['导学案', '课后习题', '练习单', '素养作业', '同类真题'];
      var queue = [f];
      while (queue.length) {
        var cur = queue.shift();
        if (cur.memoizedProps && typeof cur.memoizedProps[handlerPropName] === 'function') {
          // 检查关联 DOM 元素是否为子按钮
          var dom = cur.stateNode;
          if (dom && dom.nodeType === 1) {
            var txt = dom.textContent || '';
            var isSubBtn = false;
            for (var si = 0; si < skipTexts.length; si++) {
              if (txt === skipTexts[si] || txt === (skipTexts[si] + ' >')) {
                isSubBtn = true; break;
              }
            }
            if (isSubBtn) { /* skip, don't enqueue children */ continue; }
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

    // ========= 播放器组件定位（从 video 出发） =========
    function findPlayer() {
      var v = document.querySelector('video');
      if (!v) return null;
      // video 在 mst-player-skin div 里，往上可能有 fiber
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
      firePropsClick: firePropsClick,
      findPlayer: findPlayer
    };
  })();

  // ============================================================
  // 5. EWTH.autoskip — 自动跳题
  // ============================================================
  EWTH.autoskip = (function () {
    var _interval = null;
    var _lastClicked = null;
    var COOLDOWN = 5000;

    function _scan() {
      try {
        var all = document.querySelectorAll('button, a, span, div');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (!el.offsetParent) continue;
          var txt = el.textContent.trim();
          if (txt !== '跳过' && txt !== 'Skip') continue;
          if (el === _lastClicked) return;
          _lastClicked = el;

          // fiber 直调 React onClick
          var ok = EWTH.core.firePropsClick(el, 'onClick');
          if (!ok) {
            var p = el.parentElement;
            while (p && !ok) {
              ok = EWTH.core.firePropsClick(p, 'onClick');
              p = ok ? null : p.parentElement;
            }
          }
          if (!ok) EWTH.logger.warn('SKIP', 'no fiber onClick found');

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
  // 6. EWTH.checkpass — 自动过检
  // ============================================================
  EWTH.checkpass = (function () {
    var _interval = null;
    var _lastClicked = null;
    var COOLDOWN = 3000;

    function _tryClick() {
      try {
        var btn = document.querySelector('[data-ac="check-pass"]');
        if (!btn || !btn.offsetParent) return;
        if (btn === _lastClicked) return;
        _lastClicked = btn;
        EWTH.core.doCheckPass(btn);
        EWTH.logger.info('CHECKPASS', 'done');
        setTimeout(function () { _lastClicked = null; }, COOLDOWN);
      } catch (e) { /* ignore */ }
    }

    return {
      toggle: function (on) {
        if (on) this.start(); else this.stop();
      },
      start: function () {
        if (_interval) return;
        _tryClick();
        _interval = setInterval(_tryClick, EWTH.config.INTERVAL.CHECKPASS_CHECK);
        EWTH.logger.info('CHECKPASS', 'started');
      },
      stop: function () {
        if (_interval) { clearInterval(_interval); _interval = null; }
        _lastClicked = null;
        EWTH.logger.info('CHECKPASS', 'stopped');
      }
    };
  })();

  // ============================================================
  // 7. EWTH.autoplay — 自动连播（通过播放器组件 changeVideo 直调）
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
      // videoCatalogueList: [{lessonId, title, status, contentType, homeworkId, ...}]
      // status: 2=已完成, 1=进行中, 0=未开始
      var list = inst.state.videoCatalogueList;
      if (!list || !list.length) return null;
      var cur = inst.state.currentLesson;
      for (var i = 0; i < list.length; i++) {
        if (list[i].status === 2) continue; // 已完成
        if (cur && list[i].lessonId === cur.lessonId) continue; // 跳过当前
        return list[i];
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
        if (!next) { EWTH.logger.debug('AUTOPLAY', 'no next lesson'); return; }
        if (next.lessonId === _lastLessonId && now - _lastSwitchTime < COOLDOWN * 2) return;

        _lastLessonId = next.lessonId;
        _lastSwitchTime = now;

        inst.changeVideo({
          courseId: String(inst.state.courseId),
          lessonId: String(next.lessonId),
          contentType: next.contentType,
          lessonName: next.title
        });
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
  // 8. EWTH.speed — 2倍速 + checkRate 四层防御
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
  // 9. EWTH.progresslock — 锁定进度条（CSS 注入）
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
  // 10. EWTH.antidetection — 反检测对抗
  // ============================================================
  EWTH.antidetection = (function () {
    var _observer = null;

    function _onMouseOver(e) {
      if (e.target.tagName === 'LI' && e.target.parentNode &&
          String(e.target.parentNode.className).indexOf('ccH5spul') !== -1) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }

    function _clean() {
      var joined = EWTH.config.SPEED_TIP_SELECTORS.join(',');
      var nodes = document.querySelectorAll(joined);
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].remove(); } catch (e) { /* ignore */ }
      }
    }

    return {
      init: function () {
        document.addEventListener('mouseover', _onMouseOver, true);

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

        _clean();
        EWTH.logger.info('ANTIDETECT', 'init');
      }
    };
  })();

  // ============================================================
  // 11. EWTH.brushmode — 一键刷课
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
  // 12. EWTH.gui — 浮动控制面板
  // ============================================================
  EWTH.gui = (function () {
    var _open = false;
    var _panel = null;
    var _overlay = null;
    var VERSION = '4.0.2';

    var CSS = [
      '.ewt4-ct{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:Arial,sans-serif}',
      '.ewt4-btn{width:50px;height:50px;border-radius:50%;background:#4CAF50;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 4px 12px rgba(0,0,0,.25);transition:all .3s}',
      '.ewt4-btn:hover{background:#45a049;transform:scale(1.08)}',
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
      '.ewt4-sw input:checked+.ewt4-sl{background:#4CAF50}',
      '.ewt4-sw input:checked+.ewt4-sl:before{transform:translateX(16px)}',
      '.ewt4-ov{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.75);z-index:99998;display:flex;flex-direction:column;justify-content:center;align-items:center}',
      '.ewt4-ovt{color:#fff;font-size:22px;font-weight:bold;margin-bottom:20px;text-align:center;line-height:1.6}',
      '.ewt4-arr{position:fixed;bottom:80px;right:80px;color:#fff;font-size:56px;animation:ewt4-b 1.5s infinite;transform:rotate(45deg)}',
      '@keyframes ewt4-b{0%,100%{transform:translate(0,0) rotate(45deg)}50%{transform:translate(15px,15px) rotate(45deg)}}',
      '.ewt4-dbg{padding:6px 0;border-bottom:1px solid #f0f0f0}',
      '.ewt4-dbg select{width:100%;padding:4px;font-size:12px;border:1px solid #ddd;border-radius:4px}'
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

    function _makeDebug() {
      var row = document.createElement('div');
      row.className = 'ewt4-dbg';
      var sel = document.createElement('select');
      sel.innerHTML = [
        '<option value="0">调试: 关闭</option>',
        '<option value="1">调试: 仅错误</option>',
        '<option value="2">调试: 警告</option>',
        '<option value="3">调试: 信息</option>',
        '<option value="4">调试: 详细</option>'
      ].join('');
      sel.value = String(EWTH.logger.getLevel());
      sel.onchange = function () {
        var lv = parseInt(sel.value, 10);
        EWTH.logger.setLevel(lv);
        EWTH.store.set('debugEnabled', lv > 0);
      };
      row.appendChild(sel);
      return row;
    }

    function _showGuide() {
      if (EWTH.store.get('hasShownGuide')) return;
      _overlay = document.createElement('div');
      _overlay.className = 'ewt4-ov';
      var t = document.createElement('div');
      t.className = 'ewt4-ovt';
      t.innerHTML = '欢迎使用升学E网通助手 v' + VERSION + ' 版本<br>点击右下角绿色图标打开控制面板';
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
        _panel.appendChild(_makeDebug());
        _panel.appendChild(_makeToggle('autoSkip', '自动跳题', false));
        _panel.appendChild(_makeToggle('autoPlay', '自动连播', false));
        _panel.appendChild(_makeToggle('autoCheckPass', '自动过检', false));
        _panel.appendChild(_makeToggle('speedControl', '2倍速播放', false));
        _panel.appendChild(_makeToggle('lockProgress', '锁定进度条', false));
        _panel.appendChild(_makeToggle('brushMode', '刷课模式（一键全开）', true));
        ct.appendChild(_panel);
        document.body.appendChild(ct);

        _showGuide();
        EWTH.logger.info('GUI', 'ready');
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
  // 13. BOOTSTRAP — 初始化 & SPA 导航
  // ============================================================
  var _bootRetry = 0;
  var MAX_RETRY = 5;
  var _booted = false;

  function _boot() {
    if (_booted) return;
    if (!document.body) {
      if (_bootRetry++ < MAX_RETRY) setTimeout(_boot, 500);
      return;
    }

    EWTH.store.init();
    EWTH.antidetection.init();
    EWTH.gui.init();

    var debugLv = EWTH.store.get('debugEnabled') ? 4 : 0;
    EWTH.logger.setLevel(debugLv);

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
    EWTH.logger.info('BOOT', 'v4.0.2 ready');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _boot();
  } else {
    document.addEventListener('DOMContentLoaded', _boot);
  }
  window.addEventListener('load', _boot);

  if (typeof MutationObserver !== 'undefined') {
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
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

})();
