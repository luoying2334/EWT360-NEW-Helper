// ==UserScript==
// @name         升学E网通助手 v3.0.1
// @version      3.0.1
// @description  ewt助手，适配EWT平台2026年7月封控升级
// @match        https://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        http://teacher.ewt360.com/ewtbend/bend/index/index.html*
// @match        https://web.ewt360.com/site-study/*
// @match        http://web.ewt360.com/site-study/*
// @namespace    https://github.com/luoying2334/EWT360-NEW-Helper
// @author       luoying2334
// @icon         https://www.ewt360.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/luoying2334/EWT360-NEW-Helper/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/luoying2334/EWT360-NEW-Helper/main/main.user.js
// @supportURL   https://github.com/luoying2334/EWT360-NEW-Helper/issues
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 核心：绕过 isTrusted 检测 ====================
  // isTrusted 是浏览器内部属性，无法通过 JS 覆写。
  // 方式1：从 DOM 元素的 React 内部属性取出 onClick handler，
  //        传入 { isTrusted: true } 调用，绕过 handler 内的 isTrusted 检查。
  // 方式2：沿 Fiber 树向上查找 handler（处理事件委托的情况）。
  // 方式3：降级到原生 .click()（适用于无 isTrusted 检查的按钮）。
  var REACT_KEYS = ['__reactEventHandlers$', '__reactProps$', '__reactFiber$'];

  function getHandler(el) {
    for (var i = 0; i < REACT_KEYS.length; i++) {
      var key = Object.keys(el).find(function (k) { return k.indexOf(REACT_KEYS[i]) === 0; });
      if (!key) continue;
      if (REACT_KEYS[i] === '__reactFiber$') {
        var fiber = el[key];
        // 先查自身的 memoizedProps，再沿 fiber.return 向上查（处理事件委托）
        for (var f = fiber; f; f = f.return) {
          var h = f.memoizedProps && f.memoizedProps.onClick;
          if (typeof h === 'function') return h;
        }
      } else {
        var h = el[key] && el[key].onClick;
        if (typeof h === 'function') return h;
      }
    }
    return null;
  }

  function reactClick(el) {
    if (!el) return false;
    var handler = getHandler(el);
    if (handler) {
      handler({ isTrusted: true });
      return true;
    }
    // 降级：无 React handler 的按钮直接用原生 click
    // （适用于没有 isTrusted 检查的场景，如跳题按钮）
    try { el.click(); return true; } catch (e) { return false; }
  }

  // ==================== 调试日志 ====================
  var Debug = {
    on: false,
    ts: function () {
      var d = new Date();
      return '[' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ']';
    },
    log: function (m, s) { if (this.on) console.log(this.ts() + ' [' + m + '] ' + s); }
  };

  // ==================== 自动跳题 ====================
  var AutoSkip = {
    t: null,
    toggle: function (on) { on ? this.start() : this.stop(); },
    start: function () { if (!this.t) this.t = setInterval(this.check, 1000); },
    stop: function () { clearInterval(this.t); this.t = null; },
    check: function () {
      try {
        var all = document.querySelectorAll('button, a, span, div');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.textContent.trim() === '跳过' && el.offsetParent && !el.dataset._s) {
            el.dataset._s = '1';
            reactClick(el);
            Debug.log('Skip', 'done');
            setTimeout(function () { delete el.dataset._s; }, 5000);
            return;
          }
        }
      } catch (e) { }
    }
  };

  // ==================== 自动过检 ====================
  var AutoCheckPass = {
    t: null,
    toggle: function (on) { on ? this.start() : this.stop(); },
    start: function () { if (!this.t) this.t = setInterval(this.check, 800); },
    stop: function () { clearInterval(this.t); this.t = null; },
    check: function () {
      try {
        var btn = document.querySelector('[data-ac="check-pass"]');
        if (!btn) {
          var all = document.querySelectorAll('span, div, button');
          for (var i = 0; i < all.length; i++) {
            if (all[i].textContent.trim() === '通过检查' && all[i].offsetParent) { btn = all[i]; break; }
          }
        }
        if (!btn || btn.dataset._c) return;
        btn.dataset._c = '1';
        reactClick(btn);
        Debug.log('CheckPass', 'done');
        setTimeout(function () { delete btn.dataset._c; }, 3000);
      } catch (e) { }
    }
  };

  // ==================== 自动连播 ====================
  var AutoPlay = {
    t: null, threshold: 0.85, mode: 'progress85',
    toggle: function (on) { on ? this.start() : this.stop(); },
    start: function () { if (!this.t) this.t = setInterval(this.check, 2000); },
    stop: function () { clearInterval(this.t); this.t = null; },
    updateMode: function (m) { this.mode = m; if (m === 'progress85') this.threshold = 0.85; },

    check: function () {
      try {
        // 直接找活跃项，不依赖容器（.listCon-zRsbh 已随平台更新失效）
        var active = document.querySelector('.item-blpma.active-EI2Hl');
        if (!active) return;

        var canNext = false;
        if (this.mode === 'progress85') {
          var v = document.querySelector('video');
          if (!v) return;
          var cur = v.currentTime, dur = v.duration;
          if (isNaN(dur) || dur <= 0) return;
          canNext = cur / dur >= this.threshold;
        } else {
          canNext = !!document.getElementById('lesson-finished-container') ||
                    !!document.querySelector('img[src*="1820894120067424424"]') ||
                    !!document.querySelector('img[src*="1820894120067448877"]');
        }
        if (!canNext) return;

        var next = active.nextElementSibling;
        while (next) {
          if (next.classList.contains('item-blpma') &&
              next.textContent.indexOf('已完成') === -1 &&
              next.textContent.indexOf('已学完') === -1) {
            reactClick(next);
            Debug.log('AutoPlay', 'next');
            break;
          }
          next = next.nextElementSibling;
        }
      } catch (e) { }
    }
  };

  // ==================== 倍速控制 ====================
  var SpeedControl = {
    t: null, target: 2.0,
    toggle: function (on) { this.target = on ? 2.0 : 1.0; this.apply(); on ? this.start() : this.stop(); },
    start: function () { if (!this.t) this.t = setInterval(this.apply, 3000); },
    stop: function () { clearInterval(this.t); this.t = null; },
    apply: function () {
      try {
        // 直接操控 video 元素
        var v = document.querySelector('video');
        if (v && v.playbackRate !== this.target) { v.playbackRate = this.target; return; }
        // 降级：点击 MSTPlayer 倍速菜单
        var items = document.querySelectorAll('.vjs-playback-rate .vjs-menu-item, .mst-menu-item, .PlaybackRateMenuItem');
        var targets = ['2x', '2X', '2.0x', '2.0X', '2'];
        for (var i = 0; i < items.length; i++) {
          var txt = items[i].textContent.trim();
          if (targets.indexOf(txt) !== -1 && !items[i].classList.contains('vjs-selected')) {
            reactClick(items[i]); break;
          }
        }
      } catch (e) { }
    }
  };

  // ==================== 倍速警告屏蔽 ====================
  (function () {
    document.addEventListener('mouseover', function (e) {
      if (e.target.tagName === 'LI' && e.target.parentNode &&
          String(e.target.parentNode.className).indexOf('ccH5spul') !== -1) {
        e.stopPropagation(); e.stopImmediatePropagation();
      }
    }, true);
    new MutationObserver(function () {
      var tips = document.querySelectorAll('.video_speed_tips, [class*="video_speed_tips" i], [class*="speedTips" i]');
      for (var i = 0; i < tips.length; i++) tips[i].remove();
    }).observe(document.body, { childList: true, subtree: true });
  })();

  // ==================== 进度条锁定 ====================
  var ProgressLock = {
    on: false, t: null,
    toggle: function (on) { this.on = on; on ? this.start() : this.stop(); },
    SEL: '.vjs-progress-holder,.vjs-progress-control,.progressControl,.seekBar,.vjs-slider-horizontal,.vjs-play-progress,.vjs-load-progress,.vjs-seek-bar,.PlayProgressBar,.LoadProgressBar',
    start: function () {
      var self = this;
      var lock = function () {
        if (!self.on) return;
        var els = document.querySelectorAll(self.SEL);
        for (var i = 0; i < els.length; i++) { els[i].style.pointerEvents = 'none'; els[i].style.cursor = 'not-allowed'; }
      };
      lock(); this.t = setInterval(lock, 300);
    },
    stop: function () {
      clearInterval(this.t); this.t = null;
      var els = document.querySelectorAll(this.SEL);
      for (var i = 0; i < els.length; i++) { els[i].style.pointerEvents = ''; els[i].style.cursor = ''; }
    }
  };

  // ==================== 刷课模式 ====================
  var BrushMode = {
    toggle: function (on) {
      GUI.setToggle('autoSkip', on); AutoSkip.toggle(on);
      GUI.setToggle('autoPlay', on); AutoPlay.toggle(on);
      GUI.setToggle('autoCheckPass', on); AutoCheckPass.toggle(on);
      GUI.setToggle('speedControl', on); SpeedControl.toggle(on);
      GUI.setToggle('lockProgress', on); ProgressLock.toggle(on);
    }
  };

  // ==================== GUI ====================
  var GUI = {
    open: false,
    st: { autoSkip: false, autoPlay: false, autoCheckPass: false, speedControl: false, lockProgress: false, courseBrushMode: false, hasShownGuide: false, playMode: 'progress85' },

    init: function () { this.load(); this.injectCSS(); this.makeBtn(); this.makePanel(); this.restore(); this.guide(); },
    load: function () { try { var c = localStorage.getItem('ewt_helper_cfg'); if (c) this.st = Object.assign(this.st, JSON.parse(c)); } catch (e) { } },
    save: function () { try { localStorage.setItem('ewt_helper_cfg', JSON.stringify(this.st)); } catch (e) { } },

    restore: function () {
      if (this.st.courseBrushMode) { BrushMode.toggle(true); return; }
      if (this.st.autoSkip) AutoSkip.toggle(true);
      if (this.st.autoPlay) AutoPlay.toggle(true);
      if (this.st.autoCheckPass) AutoCheckPass.toggle(true);
      if (this.st.speedControl) SpeedControl.toggle(true);
      if (this.st.lockProgress) ProgressLock.toggle(true);
    },

    injectCSS: function () {
      var s = document.createElement('style');
      s.textContent = '.ewt-ct{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:Arial,sans-serif}.ewt-btn{width:50px;height:50px;border-radius:50%;background:#4CAF50;color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 8px rgba(0,0,0,.2);transition:all .3s}.ewt-btn:hover{background:#45a049;transform:scale(1.05)}.ewt-pnl{position:absolute;bottom:60px;right:0;width:280px;background:#fff;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.15);padding:15px;display:none;flex-direction:column;gap:10px}.ewt-pnl.open{display:flex}.ewt-ttl{font-size:18px;font-weight:bold;color:#333;margin-bottom:5px;text-align:center}.ewt-ver{font-size:11px;color:#999;text-align:center;margin-bottom:5px}.ewt-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5}.ewt-lbl{font-size:14px;color:#555}.ewt-lbl.br{color:#2196F3;font-weight:bold}.ewt-pg{padding:8px 0;border-bottom:1px solid #f5f5f5}.ewt-pgt{font-size:14px;color:#555;margin-bottom:8px}.ewt-pgb{display:flex;gap:8px}.ewt-pgb button{flex:1;padding:6px 0;border-radius:4px;border:1px solid #ddd;background:#fff;color:#555;cursor:pointer;font-size:13px;transition:all .2s}.ewt-pgb button.ac{background:#4CAF50;color:#fff;border-color:#4CAF50}.ewt-sw{position:relative;display:inline-block;width:40px;height:24px}.ewt-sw input{opacity:0;width:0;height:0}.ewt-sl{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#ccc;transition:.4s;border-radius:24px}.ewt-sl:before{position:absolute;content:"";height:16px;width:16px;left:4px;bottom:4px;background:#fff;transition:.4s;border-radius:50%}input:checked+.ewt-sl{background:#4CAF50}input:checked+.ewt-sl:before{transform:translateX(16px)}.ewt-ov{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:99998;display:flex;flex-direction:column;justify-content:center;align-items:center}.ewt-ovt{color:#fff;font-size:24px;font-weight:bold;margin-bottom:20px;text-align:center;line-height:1.5}.ewt-arr{position:fixed;bottom:80px;right:80px;color:#fff;font-size:60px;font-weight:bold;animation:ewt-b 1.5s infinite;transform:rotate(45deg)}@keyframes ewt-b{0%,100%{transform:translate(0,0) rotate(45deg)}50%{transform:translate(15px,15px) rotate(45deg)}}';
      document.head.appendChild(s);
    },

    makeBtn: function () {
      var old = document.querySelector('.ewt-ct'); if (old) old.remove();
      var ct = document.createElement('div'); ct.className = 'ewt-ct';
      var b = document.createElement('button'); b.className = 'ewt-btn';
      b.innerHTML = '\u{1F4DA}'; b.onclick = function () { GUI.toggle(); };
      ct.appendChild(b); document.body.appendChild(ct);
    },

    guide: function () {
      if (this.st.hasShownGuide) return;
      var ov = document.createElement('div'); ov.className = 'ewt-ov';
      var t = document.createElement('div'); t.className = 'ewt-ovt';
      t.innerHTML = '欢迎使用升学E网通助手 v3.0.1 版本<br>点击右下角绿色图标打开控制面板';
      var a = document.createElement('div'); a.className = 'ewt-arr'; a.textContent = '\u{1F449}';
      ov.appendChild(t); ov.appendChild(a); document.body.appendChild(ov);
      this._ov = ov;
    },

    makePanel: function () {
      var self = this;
      var p = document.createElement('div'); p.className = 'ewt-pnl';
      p.innerHTML = '<div class="ewt-ttl">升学E网通助手</div><div class="ewt-ver">v3.0.1</div>';
      p.appendChild(this.pg());
      p.appendChild(this.tg('autoSkip', '自动跳题', AutoSkip));
      p.appendChild(this.tg('autoPlay', '自动连播', AutoPlay));
      p.appendChild(this.tg('autoCheckPass', '自动过检', AutoCheckPass));
      p.appendChild(this.tg('speedControl', '2倍速播放', SpeedControl));
      p.appendChild(this.tg('lockProgress', '锁定进度条', ProgressLock));
      p.appendChild(this.tg('courseBrushMode', '刷课模式', BrushMode, true));
      document.querySelector('.ewt-ct').appendChild(p);
    },

    pg: function () {
      var self = this;
      var g = document.createElement('div'); g.className = 'ewt-pg';
      var t = document.createElement('div'); t.className = 'ewt-pgt'; t.textContent = '连播模式';
      g.appendChild(t);
      var bd = document.createElement('div'); bd.className = 'ewt-pgb';
      var b1 = document.createElement('button');
      b1.textContent = '85%进度'; if (this.st.playMode === 'progress85') b1.className = 'ac';
      b1.onclick = function () { self.st.playMode = 'progress85'; AutoPlay.updateMode('progress85'); self.rfPg(); self.save(); };
      var b2 = document.createElement('button');
      b2.textContent = '看完后'; if (this.st.playMode === 'fullPlay') b2.className = 'ac';
      b2.onclick = function () { self.st.playMode = 'fullPlay'; AutoPlay.updateMode('fullPlay'); self.rfPg(); self.save(); };
      bd.appendChild(b1); bd.appendChild(b2); g.appendChild(bd);
      return g;
    },

    rfPg: function () {
      var bs = document.querySelectorAll('.ewt-pgb button');
      bs[0].classList.toggle('ac', this.st.playMode === 'progress85');
      bs[1].classList.toggle('ac', this.st.playMode === 'fullPlay');
    },

    tg: function (id, label, mod, isBrush) {
      var self = this;
      var row = document.createElement('div'); row.className = 'ewt-row';
      var lab = document.createElement('label'); lab.className = 'ewt-lbl' + (isBrush ? ' br' : ''); lab.textContent = label;
      var sw = document.createElement('label'); sw.className = 'ewt-sw';
      var inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = 'ewt-' + id; inp.checked = !!this.st[id];
      var sl = document.createElement('span'); sl.className = 'ewt-sl';
      sw.appendChild(inp); sw.appendChild(sl);
      row.appendChild(lab); row.appendChild(sw);
      inp.onchange = function (e) { self.st[id] = e.target.checked; self.save(); mod.toggle(e.target.checked); };
      return row;
    },

    setToggle: function (id, v) { this.st[id] = v; this.save(); var el = document.getElementById('ewt-' + id); if (el) el.checked = v; },

    toggle: function () {
      this.open = !this.open;
      document.querySelector('.ewt-pnl').classList.toggle('open', this.open);
      if (this.open && this._ov) { this._ov.remove(); this._ov = null; this.st.hasShownGuide = true; this.save(); }
    }
  };

  // ==================== 启动 ====================
  var retry = 0;
  function init() {
    if (!document.body) return setTimeout(init, 500);
    try { GUI.init(); } catch (e) { if (retry++ < 5) setTimeout(init, 1000); }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') init();
  else document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
  new MutationObserver(function (_, ob) {
    if (document.body && !document.querySelector('.ewt-ct')) { init(); ob.disconnect(); }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
