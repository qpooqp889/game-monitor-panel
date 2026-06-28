/**
 * packet-monitor.js v1.0
 * 獨立的手動封包監控工具
 *
 * 用法：
 * 1. 載入此檔案到遊戲頁面（用 CDP 注入或瀏覽器 console）
 * 2. 點「▶ 開始監控」開始記錄所有 SIO + WebSocket 封包
 * 3. 在遊戲中手動操作（點地圖、攻擊、用技能等）
 * 4. 點「⏹ 停止監控」停止記錄
 * 5. 點「💾 匯出 .txt」下載所有封包供分析
 *
 * 全域變數：
 *   window.__pmRunning - 是否監控中
 *   window.__pmPackets - 封包陣列 [{t, dir, src, evt, data}]
 *   window.__pmExport() - 直接呼叫匯出
 *   window.__pmStart() / window.__pmStop() - 控制
 */

(function() {
  'use strict';

  // ============================================
  // 防止重複注入
  // ============================================
  if (window.__pmInjected) {
    console.log('[PM] Already injected, removing old panel...');
    var oldPanel = document.getElementById('__pm_main');
    if (oldPanel) oldPanel.remove();
  }
  window.__pmInjected = true;
  window.__pmVer = 'v1.0';

  // ============================================
  // 全域狀態
  // ============================================
  window.__pmRunning = false;
  window.__pmPackets = [];
  window.__pmStats = { send: 0, recv: 0, errors: 0 };
  window.__pmHooksInstalled = false;
  window.__pmOriginalHooks = {};

  // ============================================
  // Hook 安裝（記錄所有 SIO + WS 封包）
  // ============================================
  function installHooks() {
    if (window.__pmHooksInstalled) return;
    window.__pmHooksInstalled = true;

    // ---- 1. Socket.IO Hook ----
    function tryInstallSio() {
      var SP = window.io && window.io.Socket && window.io.Socket.prototype;
      if (!SP) {
        setTimeout(tryInstallSio, 200);
        return;
      }

      // packet hook (SEND)
      if (!SP.__pmPkt) {
        SP.__pmPkt = true;
        var _origPkt = SP.packet;
        SP.packet = function(packet) {
          if (window.__pmRunning && packet && (packet.type === 2 || packet.type === 3)) {
            try {
              var ev = packet.data && packet.data[0] || null;
              var args = packet.data && packet.data.slice(1) || [];
              recordPacket({
                t: Date.now(),
                dir: 'SEND',
                src: 'SIO',
                evt: ev,
                args: args,
                raw: packet
              });
            } catch (e) {
              recordPacket({ t: Date.now(), dir: 'ERR', src: 'SIO-SEND', evt: 'parse_error', args: [e.message] });
            }
          }
          return _origPkt && _origPkt.call(this, packet);
        };
        console.log('[PM] SIO packet hook installed');
      }

      // onevent hook (RECV)
      if (!SP.__pmOE) {
        SP.__pmOE = true;
        var _oe = SP.onevent;
        SP.onevent = function(p) {
          if (window.__pmRunning && p && p.data && p.data[0]) {
            try {
              var evtName = p.data[0];
              var args = p.data.slice(1);
              recordPacket({
                t: Date.now(),
                dir: 'RECV',
                src: 'SIO',
                evt: evtName,
                args: args,
                raw: p
              });
            } catch (e) {
              recordPacket({ t: Date.now(), dir: 'ERR', src: 'SIO-RECV', evt: 'parse_error', args: [e.message] });
            }
          }
          if (_oe) _oe.call(this, p);
        };
        console.log('[PM] SIO onevent hook installed');
      }
    }
    tryInstallSio();

    // ---- 2. WebSocket Hook ----
    if (!WebSocket.prototype.__pmSend) {
      WebSocket.prototype.__pmSend = true;
      var _origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        if (window.__pmRunning) {
          try {
            var parsed = parseWsData(data);
            recordPacket({
              t: Date.now(),
              dir: 'SEND',
              src: 'WS',
              evt: parsed.evt,
              args: parsed.args,
              raw: data
            });
          } catch (e) {
            recordPacket({ t: Date.now(), dir: 'ERR', src: 'WS-SEND', evt: 'parse_error', args: [e.message] });
          }
        }
        return _origSend.call(this, data);
      };
      console.log('[PM] WebSocket send hook installed');
    }

    // 監聽現有 ws 的 message 事件
    setInterval(function() {
      if (window.__ws && !window.__ws.__pmHooked) {
        window.__ws.__pmHooked = true;
        window.__ws.addEventListener('message', function(e) {
          if (window.__pmRunning) {
            try {
              var parsed = parseWsData(e.data);
              recordPacket({
                t: Date.now(),
                dir: 'RECV',
                src: 'WS',
                evt: parsed.evt,
                args: parsed.args,
                raw: e.data
              });
            } catch (err) {
              recordPacket({ t: Date.now(), dir: 'ERR', src: 'WS-RECV', evt: 'parse_error', args: [err.message] });
            }
          }
        });
        console.log('[PM] WebSocket message hook installed');
      }
    }, 200);
  }

  // ============================================
  // 解析 WebSocket 資料（Socket.IO 格式：42[...]）
  // ============================================
  function parseWsData(data) {
    var str = typeof data === 'string' ? data : '';
    // 去掉 Socket.IO Engine.IO 前綴（通常是 "42" 或 "42/ws,"）
    var clean = str.replace(/^[\d]+\/?[\w,]*(\[)/, '$1');
    if (clean[0] !== '[') clean = str.substring(2);
    try {
      var arr = JSON.parse(clean);
      if (Array.isArray(arr) && arr.length > 0) {
        return { evt: arr[0], args: arr.slice(1) };
      }
    } catch (e) {}
    return { evt: '(raw)', args: [str.substring(0, 200)] };
  }

  // ============================================
  // 記錄封包
  // ============================================
  function recordPacket(pkt) {
    window.__pmPackets.push(pkt);
    if (pkt.dir === 'SEND') window.__pmStats.send++;
    else if (pkt.dir === 'RECV') window.__pmStats.recv++;
    else window.__pmStats.errors++;

    // 更新 UI（節流）
    if (window.__pmUpdateTimer) return;
    window.__pmUpdateTimer = setTimeout(function() {
      window.__pmUpdateTimer = null;
      updateUI();
    }, 100);
  }

  // ============================================
  // UI 建立
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
    style.textContent = `
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
      .__pm_btn:hover { transform: translateY(-1px); }
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
    document.head.appendChild(style);

    // 主面板
    var panel = document.createElement('div');
    panel.id = '__pm_main';
    panel.innerHTML = `
      <div id="__pm_header">
        <div>
          <span id="__pm_title">📡 Packet Monitor</span>
          <span id="__pm_ver">v1.0</span>
        </div>
        <div>
          <span id="__pm_status">⏸ 停止</span>
          <button class="__pm_btn" style="background:#533483;color:#fff;padding:2px 6px;font-size:9px;" onclick="document.getElementById('__pm_main').style.display='none'">×</button>
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
    document.getElementById('__pm_btn_start').onclick = window.__pmStart;
    document.getElementById('__pm_btn_stop').onclick = window.__pmStop;
    document.getElementById('__pm_btn_export').onclick = window.__pmExport;
    document.getElementById('__pm_btn_clear').onclick = window.__pmClear;

    // 過濾按鈕
    var filterBtns = document.querySelectorAll('.__pm_btn_filter');
    filterBtns.forEach(function(btn) {
      btn.onclick = function() {
        filterBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        window.__pmFilterDir = btn.getAttribute('data-dir');
        updateUI();
      };
    });

    // 過濾輸入
    document.getElementById('__pm_filter_input').oninput = function() {
      window.__pmFilterText = this.value.toLowerCase();
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
  }

  // ============================================
  // 更新 UI
  // ============================================
  window.__pmFilterDir = 'ALL';
  window.__pmFilterText = '';

  function updateUI() {
    var log = document.getElementById('__pm_log');
    if (!log) return;

    // 過濾
    var pkts = window.__pmPackets.filter(function(p) {
      if (window.__pmFilterDir !== 'ALL' && p.dir !== window.__pmFilterDir) return false;
      if (window.__pmFilterText) {
        var txt = (p.evt || '') + ' ' + JSON.stringify(p.args || []);
        return txt.toLowerCase().indexOf(window.__pmFilterText) > -1;
      }
      return true;
    });

    // 更新統計
    document.getElementById('__pm_stat_send').textContent = window.__pmStats.send;
    document.getElementById('__pm_stat_recv').textContent = window.__pmStats.recv;
    document.getElementById('__pm_stat_err').textContent = window.__pmStats.errors;
    document.getElementById('__pm_stat_total').textContent = window.__pmPackets.length;

    // 更新列表（最多顯示 500 條最新的）
    if (pkts.length === 0) {
      log.innerHTML = '<div class="__pm_empty">' +
        (window.__pmRunning ? '監控中，等待封包...' : '點「▶ 開始監控」開始記錄封包') +
        '</div>';
      return;
    }

    var html = '';
    var start = Math.max(0, pkts.length - 500);
    for (var i = start; i < pkts.length; i++) {
      var p = pkts[i];
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================
  // 控制函數
  // ============================================
  window.__pmStart = function() {
    window.__pmRunning = true;
    var btnStart = document.getElementById('__pm_btn_start');
    var btnStop = document.getElementById('__pm_btn_stop');
    var status = document.getElementById('__pm_status');
    if (btnStart) btnStart.disabled = true;
    if (btnStop) btnStop.disabled = false;
    if (status) { status.textContent = '▶ 監控中'; status.classList.add('running'); }
    console.log('[PM] Started monitoring');
    updateUI();
  };

  window.__pmStop = function() {
    window.__pmRunning = false;
    var btnStart = document.getElementById('__pm_btn_start');
    var btnStop = document.getElementById('__pm_btn_stop');
    var status = document.getElementById('__pm_status');
    if (btnStart) btnStart.disabled = false;
    if (btnStop) btnStop.disabled = true;
    if (status) { status.textContent = '⏸ 停止'; status.classList.remove('running'); }
    console.log('[PM] Stopped monitoring. Total packets:', window.__pmPackets.length);
    updateUI();
  };

  window.__pmClear = function() {
    window.__pmPackets = [];
    window.__pmStats = { send: 0, recv: 0, errors: 0 };
    console.log('[PM] Cleared all packets');
    updateUI();
  };

  // ============================================
  // 匯出 .txt
  // ============================================
  window.__pmExport = function() {
    if (window.__pmPackets.length === 0) {
      alert('沒有封包可以匯出！');
      return;
    }

    var lines = [];
    lines.push('========================================');
    lines.push('Packet Monitor Export');
    lines.push('Version: ' + window.__pmVer);
    lines.push('Export Time: ' + new Date().toISOString());
    lines.push('Total Packets: ' + window.__pmPackets.length);
    lines.push('  SEND: ' + window.__pmStats.send);
    lines.push('  RECV: ' + window.__pmStats.recv);
    lines.push('  ERR:  ' + window.__pmStats.errors);
    lines.push('========================================');
    lines.push('');

    for (var i = 0; i < window.__pmPackets.length; i++) {
      var p = window.__pmPackets[i];
      var time = new Date(p.t).toISOString();
      var evt = p.evt || '(none)';
      var argsStr;
      try {
        argsStr = JSON.stringify(p.args || [], null, 2);
      } catch (e) {
        argsStr = '(circular or unserializable)';
      }
      lines.push('[' + (i + 1) + '] ' + time + ' | ' + p.dir + ' | ' + p.src + ' | ' + evt);
      lines.push('  Args: ' + argsStr);
      lines.push('');
    }

    // 統計分析
    lines.push('========================================');
    lines.push('Statistics by Event Type');
    lines.push('========================================');
    var evtCount = {};
    var sendEvtCount = {};
    var recvEvtCount = {};
    for (var j = 0; j < window.__pmPackets.length; j++) {
      var pp = window.__pmPackets[j];
      var e = pp.evt || '(none)';
      evtCount[e] = (evtCount[e] || 0) + 1;
      if (pp.dir === 'SEND') sendEvtCount[e] = (sendEvtCount[e] || 0) + 1;
      if (pp.dir === 'RECV') recvEvtCount[e] = (recvEvtCount[e] || 0) + 1;
    }
    lines.push('All Events:');
    Object.keys(evtCount).sort(function(a, b) { return evtCount[b] - evtCount[a]; }).forEach(function(k) {
      lines.push('  ' + k + ': ' + evtCount[k]);
    });
    lines.push('');
    lines.push('SEND Only:');
    Object.keys(sendEvtCount).sort(function(a, b) { return sendEvtCount[b] - sendEvtCount[a]; }).forEach(function(k) {
      lines.push('  ' + k + ': ' + sendEvtCount[k]);
    });
    lines.push('');
    lines.push('RECV Only:');
    Object.keys(recvEvtCount).sort(function(a, b) { return recvEvtCount[b] - recvEvtCount[a]; }).forEach(function(k) {
      lines.push('  ' + k + ': ' + recvEvtCount[k]);
    });

    var content = lines.join('\n');
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'packet_monitor_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[PM] Exported ' + window.__pmPackets.length + ' packets');
  };

  // ============================================
  // 初始化
  // ============================================
  installHooks();
  buildUI();

  console.log('[PM] Packet Monitor v1.0 loaded');
  console.log('[PM] Usage:');
  console.log('  - Click ▶ 開始監控 in the panel');
  console.log('  - Or call window.__pmStart() / __pmStop() / __pmExport()');
  console.log('  - Packets stored in window.__pmPackets');
})();
