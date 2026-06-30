/**
 * packet-monitor-ui.js v1.0
 * 封包監控 UI 模組 - 純介面，依賴 packet-monitor-core.js
 *
 * 用法：
 *   <script src="packet-monitor-core.js"></script>
 *   <script src="packet-monitor-ui.js"></script>
 *   window.__pmUI.mount()      // 顯示面板
 *   window.__pmUI.unmount()    // 移除面板
 *   window.__pmUI.toggle()     // 切換顯示
 *
 * 設定：
 *   window.__pmUI.setOption('maxDisplay', 1000)  // UI 最多顯示幾筆
 */

(function() {
  'use strict';

  // 防止重複
  if (window.__pmUI) {
    console.warn('[PMUI] Already loaded');
    return;
  }

  // 檢查 core 是否已載入
  if (!window.__pmCore) {
    console.error('[PMUI] __pmCore not found! Load packet-monitor-core.js first');
    return;
  }

  var VERSION = 'v1.0';
  var _mounted = false;
  var _options = {
    maxDisplay: 500,           // UI 最多顯示幾筆（完整資料在 core 裡）
    updateInterval: 100,       // UI 更新節流（ms）
    position: { top: '80px', right: '20px' }
  };
  var _filterDir = 'ALL';
  var _filterText = '';
  var _updateTimer = null;
  var _unsubscribers = [];

  // ============================================
  // CSS
  // ============================================
  var CSS = `
    #__pm_main {
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      width: 480px; max-height: 70vh;
      background: #0f0f23; color: #e0e0e0;
      border: 1px solid #0f3460; border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 11px;
      display: flex; flex-direction: column;
    }
    #__pm_header {
      padding: 8px 12px; background: #1a1a2e;
      border-bottom: 1px solid #0f3460;
      display: flex; justify-content: space-between; align-items: center;
      cursor: move; user-select: none;
    }
    #__pm_title { font-weight: bold; color: #00d9ff; }
    #__pm_ver { color: #888; font-size: 10px; margin-left: 6px; }
    #__pm_status {
      padding: 3px 8px; border-radius: 4px; font-size: 10px;
      background: #4a4a4a; color: #fff;
    }
    #__pm_status.running { background: #4ade80; color: #000; }
    #__pm_controls {
      padding: 8px 12px; background: #16213e;
      display: flex; gap: 6px; flex-wrap: wrap;
    }
    .__pm_btn {
      padding: 5px 10px; border: none; border-radius: 4px;
      font-size: 11px; cursor: pointer; font-weight: bold;
      transition: all 0.2s;
    }
    .__pm_btn:hover:not(:disabled) { transform: translateY(-1px); }
    .__pm_btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .__pm_btn_start { background: #4ade80; color: #000; }
    .__pm_btn_stop { background: #e94560; color: #fff; }
    .__pm_btn_export { background: #0f3460; color: #fff; }
    .__pm_btn_clear { background: #533483; color: #fff; }
    .__pm_btn_filter { background: #2a2a4a; color: #fff; font-weight: normal; }
    .__pm_btn_filter.active { background: #fbbf24; color: #000; }
    #__pm_stats {
      padding: 6px 12px; background: #1a1a2e;
      display: flex; gap: 12px; font-size: 10px;
      border-bottom: 1px solid #0f3460;
    }
    .__pm_stat { color: #888; }
    .__pm_stat b { color: #fff; }
    #__pm_filter {
      padding: 6px 12px; background: #0a0a1a;
      display: flex; gap: 6px; align-items: center;
      border-bottom: 1px solid #0f3460; font-size: 10px;
    }
    #__pm_filter input {
      flex: 1; padding: 4px 6px;
      background: #1a1a2e; color: #fff;
      border: 1px solid #0f3460; border-radius: 3px;
      font-family: inherit; font-size: 10px;
    }
    #__pm_log {
      flex: 1; overflow-y: auto;
      padding: 4px 8px;
      font-size: 10px;
      line-height: 1.4;
      max-height: 50vh;
      background: #050510;
    }
    .__pm_entry {
      padding: 3px 6px; margin: 1px 0;
      border-radius: 3px; cursor: pointer;
      word-break: break-all;
      display: flex; gap: 6px; align-items: baseline;
    }
    .__pm_entry:hover { background: #1a1a2e; }
    .__pm_entry.SEND { border-left: 3px solid #4ade80; }
    .__pm_entry.RECV { border-left: 3px solid #00d9ff; }
    .__pm_entry.ERR { border-left: 3px solid #e94560; }
    .__pm_time { color: #666; font-size: 9px; min-width: 60px; }
    .__pm_dir { font-weight: bold; min-width: 35px; font-size: 9px; }
    .__pm_dir.SEND { color: #4ade80; }
    .__pm_dir.RECV { color: #00d9ff; }
    .__pm_dir.ERR { color: #e94560; }
    .__pm_src { color: #888; font-size: 9px; min-width: 28px; }
    .__pm_evt { color: #fbbf24; }
    .__pm_args { color: #aaa; font-size: 9px; }
    .__pm_empty { text-align: center; color: #555; padding: 30px; }
  `;

  // ============================================
  // 工具
  // ============================================
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================
  // 建構 UI
  // ============================================
  function buildUI() {
    // 移除舊的
    var old = document.getElementById('__pm_main');
    if (old) old.remove();
    var oldStyle = document.getElementById('__pm_style');
    if (oldStyle) oldStyle.remove();

    // CSS
    var style = document.createElement('style');
    style.id = '__pm_style';
    style.textContent = CSS;
    document.head.appendChild(style);

    // 主面板
    var panel = document.createElement('div');
    panel.id = '__pm_main';
    panel.style.top = _options.position.top;
    panel.style.right = _options.position.right;
    panel.innerHTML = `
      <div id="__pm_header">
        <div>
          <span id="__pm_title">📡 Packet Monitor</span>
          <span id="__pm_ver">` + VERSION + ` (core: ` + window.__pmCore.version + `)</span>
        </div>
        <div>
          <span id="__pm_status">⏸ 停止</span>
          <button class="__pm_btn" style="background:#533483;color:#fff;padding:2px 6px;font-size:9px;" id="__pm_close">×</button>
        </div>
      </div>
      <div id="__pm_controls">
        <button class="__pm_btn __pm_btn_start" id="__pm_btn_start">▶ 開始監控</button>
        <button class="__pm_btn __pm_btn_stop" id="__pm_btn_stop" disabled>⏹ 停止監控</button>
        <button class="__pm_btn __pm_btn_export" id="__pm_btn_export">💾 匯出 .txt</button>
        <button class="__pm_btn __pm_btn_clear" id="__pm_btn_clear">🗑 清空</button>
        <button class="__pm_btn __pm_btn_filter active" data-dir="ALL" id="__pm_btn_all">ALL</button>
        <button class="__pm_btn __pm_btn_filter" data-dir="SEND" id="__pm_btn_send">SEND</button>
        <button class="__pm_btn __pm_btn_filter" data-dir="RECV" id="__pm_btn_recv">RECV</button>
      </div>
      <div id="__pm_stats">
        <span class="__pm_stat">SEND: <b id="__pm_stat_send" style="color:#4ade80">0</b></span>
        <span class="__pm_stat">RECV: <b id="__pm_stat_recv" style="color:#00d9ff">0</b></span>
        <span class="__pm_stat">ERR: <b id="__pm_stat_err" style="color:#e94560">0</b></span>
        <span class="__pm_stat">Total: <b id="__pm_stat_total" style="color:#fff">0</b></span>
      </div>
      <div id="__pm_filter">
        <span style="color:#888">過濾:</span>
        <input type="text" id="__pm_filter_input" placeholder="輸入關鍵字 (如 state, attack, setZone)...">
      </div>
      <div id="__pm_log">
        <div class="__pm_empty">點「▶ 開始監控」開始記錄封包</div>
      </div>
    `;
    document.body.appendChild(panel);

    // 綁定事件
    document.getElementById('__pm_btn_start').onclick = function() { window.__pmCore.start(); };
    document.getElementById('__pm_btn_stop').onclick = function() { window.__pmCore.stop(); };
    document.getElementById('__pm_btn_export').onclick = function() { window.__pmCore.export(); };
    document.getElementById('__pm_btn_clear').onclick = function() { window.__pmCore.clear(); };
    document.getElementById('__pm_close').onclick = function() { unmount(); };

    // 過濾按鈕
    var filterBtns = document.querySelectorAll('.__pm_btn_filter');
    filterBtns.forEach(function(btn) {
      btn.onclick = function() {
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _filterDir = btn.getAttribute('data-dir');
        updateUI();
      };
    });

    // 過濾輸入
    document.getElementById('__pm_filter_input').oninput = function() {
      _filterText = this.value.toLowerCase();
      updateUI();
    };

    // 拖曳
    var header = document.getElementById('__pm_header');
    var drag = false, ox, oy;
    header.addEventListener('mousedown', function(e) {
      drag = true; ox = e.clientX - panel.offsetLeft; oy = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', function(e) {
      if (drag) { panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px'; panel.style.right = 'auto'; }
    });
    document.addEventListener('mouseup', function() { drag = false; });

    // 訂閱 core 事件
    _unsubscribers.push(window.__pmCore.on('start', function() {
      var status = document.getElementById('__pm_status');
      var btnStart = document.getElementById('__pm_btn_start');
      var btnStop = document.getElementById('__pm_btn_stop');
      if (status) { status.textContent = '▶ 監控中'; status.classList.add('running'); }
      if (btnStart) btnStart.disabled = true;
      if (btnStop) btnStop.disabled = false;
      updateUI();
    }));

    _unsubscribers.push(window.__pmCore.on('stop', function() {
      var status = document.getElementById('__pm_status');
      var btnStart = document.getElementById('__pm_btn_start');
      var btnStop = document.getElementById('__pm_btn_stop');
      if (status) { status.textContent = '⏸ 停止'; status.classList.remove('running'); }
      if (btnStart) btnStart.disabled = false;
      if (btnStop) btnStop.disabled = true;
      updateUI();
    }));

    _unsubscribers.push(window.__pmCore.on('clear', function() {
      updateUI();
    }));

    _unsubscribers.push(window.__pmCore.on('packet', function() {
      // 節流
      if (_updateTimer) return;
      _updateTimer = setTimeout(function() {
        _updateTimer = null;
        updateUI();
      }, _options.updateInterval);
    }));
  }

  // ============================================
  // 更新 UI
  // ============================================
  function updateUI() {
    var log = document.getElementById('__pm_log');
    if (!log) return;

    var stats = window.__pmCore.getStats();
    var pkts = window.__pmCore.getPackets();

    // 過濾
    var filtered = pkts.filter(function(p) {
      if (_filterDir !== 'ALL' && p.dir !== _filterDir) return false;
      if (_filterText) {
        var txt = (p.evt || '') + ' ' + JSON.stringify(p.args || []);
        return txt.toLowerCase().indexOf(_filterText) > -1;
      }
      return true;
    });

    // 更新統計
    document.getElementById('__pm_stat_send').textContent = stats.send;
    document.getElementById('__pm_stat_recv').textContent = stats.recv;
    document.getElementById('__pm_stat_err').textContent = stats.errors;
    document.getElementById('__pm_stat_total').textContent = stats.total;

    // 更新列表
    if (filtered.length === 0) {
      log.innerHTML = '<div class="__pm_empty">' +
        (window.__pmCore.isRunning() ? '監控中，等待封包...' : '點「▶ 開始監控」開始記錄封包') +
        '</div>';
      return;
    }

    var html = '';
    var start = Math.max(0, filtered.length - _options.maxDisplay);
    for (var i = start; i < filtered.length; i++) {
      var p = filtered[i];
      var time = new Date(p.t).toLocaleTimeString();
      var evtStr = String(p.evt || '');
      var argsStr = '';
      try {
        argsStr = JSON.stringify(p.args || []);
        if (argsStr.length > 200) argsStr = argsStr.substring(0, 200) + '...';
      } catch (e) {
        argsStr = '(circular)';
      }
      html += '<div class="__pm_entry ' + p.dir + '">' +
        '<span class="__pm_time">' + time + '</span>' +
        '<span class="__pm_dir ' + p.dir + '">' + p.dir + '</span>' +
        '<span class="__pm_src">' + p.src + '</span>' +
        '<span class="__pm_evt">' + escapeHtml(evtStr) + '</span>' +
        '<span class="__pm_args">' + escapeHtml(argsStr) + '</span>' +
        '</div>';
    }
    log.innerHTML = html;
    log.scrollTop = log.scrollHeight;
  }

  // ============================================
  // Mount / Unmount
  // ============================================
  function mount() {
    if (_mounted) {
      console.log('[PMUI] Already mounted, rebuilding...');
      unmount();
    }
    _mounted = true;

    // 確保 core 已安裝 hook
    if (!window.__pmCore.isRunning() && window.__pmCore.getPackets().length === 0) {
      // 自動安裝（如果還沒）
    }
    window.__pmCore.install();

    buildUI();
    updateUI();
    console.log('[PMUI] Mounted');
  }

  function unmount() {
    if (!_mounted) return;
    _mounted = false;

    // 取消訂閱
    _unsubscribers.forEach(function(un) { un(); });
    _unsubscribers = [];

    // 移除 DOM
    var panel = document.getElementById('__pm_main');
    if (panel) panel.remove();
    var style = document.getElementById('__pm_style');
    if (style) style.remove();

    console.log('[PMUI] Unmounted (core still running)');
  }

  function toggle() {
    if (_mounted) unmount();
    else mount();
  }

  // ============================================
  // 公開 API
  // ============================================
  window.__pmUI = {
    version: VERSION,
    mount: mount,
    unmount: unmount,
    toggle: toggle,
    isMounted: function() { return _mounted; },
    setOption: function(key, value) {
      _options[key] = value;
    },
    getOption: function(key) { return _options[key]; }
  };

  console.log('[PMUI] UI module loaded, version:', VERSION);
  console.log('[PMUI] Call __pmUI.mount() to show panel');
})();
