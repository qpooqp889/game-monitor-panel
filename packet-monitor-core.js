/**
 * packet-monitor-core.js v1.0
 * 封包監控核心模組 - 純邏輯，無 UI
 *
 * 用法：
 *   1. <script src="packet-monitor-core.js"></script>
 *   2. window.__pmCore.install()    // 安裝 hook
 *   3. window.__pmCore.start()      // 開始監控
 *   4. window.__pmCore.stop()       // 停止監控
 *   5. window.__pmCore.getPackets() // 取得所有封包
 *   6. window.__pmCore.export()     // 匯出 .txt
 *   7. window.__pmCore.clear()      // 清空
 *
 * 事件訂閱（給 UI 模組用）：
 *   window.__pmCore.on('start', callback)
 *   window.__pmCore.on('stop', callback)
 *   window.__pmCore.on('packet', callback)  // 每筆封包
 *   window.__pmCore.on('clear', callback)
 *   window.__pmCore.on('export', callback)
 *
 * 統計：
 *   window.__pmCore.getStats() -> { send, recv, errors, total }
 *
 * 不依賴 UI，可單獨使用。
 */

(function() {
  'use strict';

  // 防止重複
  if (window.__pmCore) {
    console.warn('[PMC] Already loaded, version:', window.__pmCore.version);
    return;
  }

  var VERSION = 'v1.0';

  // ============================================
  // 私有狀態
  // ============================================
  var _running = false;
  var _packets = [];
  var _stats = { send: 0, recv: 0, errors: 0 };
  var _hooksInstalled = false;
  var _updateTimer = null;
  var _listeners = {
    start: [],
    stop: [],
    packet: [],
    clear: [],
    export: []
  };

  // ============================================
  // 事件系統
  // ============================================
  function emit(event, data) {
    var cbs = _listeners[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try {
        cbs[i](data);
      } catch (e) {
        console.error('[PMC] Listener error for', event, ':', e);
      }
    }
  }

  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    // 回傳取消訂閱函數
    return function() {
      var arr = _listeners[event];
      var idx = arr.indexOf(callback);
      if (idx > -1) arr.splice(idx, 1);
    };
  }

  // ============================================
  // Hook 安裝
  // ============================================
  function installHooks() {
    if (_hooksInstalled) {
      console.log('[PMC] Hooks already installed');
      return;
    }
    _hooksInstalled = true;

    // ---- Socket.IO Hook ----
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
          if (_running && packet && (packet.type === 2 || packet.type === 3)) {
            try {
              var ev = packet.data && packet.data[0] || null;
              var args = packet.data && packet.data.slice(1) || [];
              _record({
                t: Date.now(),
                dir: 'SEND',
                src: 'SIO',
                evt: ev,
                args: args
              });
            } catch (e) {
              _record({ t: Date.now(), dir: 'ERR', src: 'SIO-SEND', evt: 'parse_error', args: [String(e)] });
            }
          }
          return _origPkt && _origPkt.call(this, packet);
        };
      }

      // onevent hook (RECV)
      if (!SP.__pmOE) {
        SP.__pmOE = true;
        var _oe = SP.onevent;
        SP.onevent = function(p) {
          if (_running && p && p.data && p.data[0]) {
            try {
              var evtName = p.data[0];
              var args = p.data.slice(1);
              _record({
                t: Date.now(),
                dir: 'RECV',
                src: 'SIO',
                evt: evtName,
                args: args
              });
            } catch (e) {
              _record({ t: Date.now(), dir: 'ERR', src: 'SIO-RECV', evt: 'parse_error', args: [String(e)] });
            }
          }
          if (_oe) _oe.call(this, p);
        };
      }

      console.log('[PMC] SIO hooks installed');
    }
    tryInstallSio();

    // ---- WebSocket Hook ----
    if (!WebSocket.prototype.__pmSend) {
      WebSocket.prototype.__pmSend = true;
      var _origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        if (_running) {
          try {
            var parsed = _parseWsData(data);
            _record({
              t: Date.now(),
              dir: 'SEND',
              src: 'WS',
              evt: parsed.evt,
              args: parsed.args
            });
          } catch (e) {
            _record({ t: Date.now(), dir: 'ERR', src: 'WS-SEND', evt: 'parse_error', args: [String(e)] });
          }
        }
        return _origSend.call(this, data);
      };
      console.log('[PMC] WS send hook installed');
    }

    // 監聽現有 ws 的 message 事件
    var _wsCheckInterval = setInterval(function() {
      if (window.__ws && !window.__ws.__pmHooked) {
        window.__ws.__pmHooked = true;
        window.__ws.addEventListener('message', function(e) {
          if (_running) {
            try {
              var parsed = _parseWsData(e.data);
              _record({
                t: Date.now(),
                dir: 'RECV',
                src: 'WS',
                evt: parsed.evt,
                args: parsed.args
              });
            } catch (err) {
              _record({ t: Date.now(), dir: 'ERR', src: 'WS-RECV', evt: 'parse_error', args: [String(err)] });
            }
          }
        });
        console.log('[PMC] WS message hook installed');
      }
    }, 200);
    // 暴露 interval id 供卸載用
    _wsCheckInterval._pmc = true;
  }

  // ============================================
  // 解析 WebSocket 資料（Socket.IO 格式：42[...]）
  // ============================================
  function _parseWsData(data) {
    var str = typeof data === 'string' ? data : '';
    // 去掉 Socket.IO Engine.IO 前綴
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
  // 內部：記錄封包
  // ============================================
  function _record(pkt) {
    _packets.push(pkt);
    if (pkt.dir === 'SEND') _stats.send++;
    else if (pkt.dir === 'RECV') _stats.recv++;
    else _stats.errors++;

    // 觸發 packet 事件
    emit('packet', pkt);
  }

  // ============================================
  // 公開 API
  // ============================================
  var core = {
    version: VERSION,

    /** 安裝 hook（必須先呼叫） */
    install: function() {
      installHooks();
    },

    /** 開始監控 */
    start: function() {
      _running = true;
      console.log('[PMC] Started');
      emit('start', { time: Date.now() });
    },

    /** 停止監控 */
    stop: function() {
      _running = false;
      console.log('[PMC] Stopped. Total packets:', _packets.length);
      emit('stop', { time: Date.now(), total: _packets.length });
    },

    /** 是否監控中 */
    isRunning: function() {
      return _running;
    },

    /** 清空所有記錄 */
    clear: function() {
      var oldTotal = _packets.length;
      _packets = [];
      _stats = { send: 0, recv: 0, errors: 0 };
      console.log('[PMC] Cleared', oldTotal, 'packets');
      emit('clear', { time: Date.now(), cleared: oldTotal });
    },

    /** 取得所有封包（回傳陣列複本） */
    getPackets: function() {
      return _packets.slice();
    },

    /** 取得封包數量 */
    count: function() {
      return _packets.length;
    },

    /** 取得統計 */
    getStats: function() {
      return {
        send: _stats.send,
        recv: _stats.recv,
        errors: _stats.errors,
        total: _packets.length
      };
    },

    /** 訂閱事件 */
    on: on,

    /**
     * 匯出 .txt
     * @param {Object} [opts]
     * @param {string} [opts.filename] - 自訂檔名
     * @param {boolean} [opts.pretty] - 是否美化 JSON（預設 true）
     * @param {boolean} [opts.includeStats] - 是否包含事件統計（預設 true）
     * @returns {string} 完整文字內容（同時觸發下載）
     */
    export: function(opts) {
      opts = opts || {};
      var pretty = opts.pretty !== false;
      var includeStats = opts.includeStats !== false;

      if (_packets.length === 0) {
        console.warn('[PMC] No packets to export');
        return '';
      }

      var lines = [];
      lines.push('========================================');
      lines.push('Packet Monitor Export');
      lines.push('Version: ' + VERSION);
      lines.push('Export Time: ' + new Date().toISOString());
      lines.push('Total Packets: ' + _packets.length);
      lines.push('  SEND: ' + _stats.send);
      lines.push('  RECV: ' + _stats.recv);
      lines.push('  ERR:  ' + _stats.errors);
      lines.push('========================================');
      lines.push('');

      for (var i = 0; i < _packets.length; i++) {
        var p = _packets[i];
        var time = new Date(p.t).toISOString();
        var evt = p.evt || '(none)';
        var argsStr;
        try {
          argsStr = pretty
            ? JSON.stringify(p.args || [], null, 2)
            : JSON.stringify(p.args || []);
        } catch (e) {
          argsStr = '(circular or unserializable)';
        }
        lines.push('[' + (i + 1) + '] ' + time + ' | ' + p.dir + ' | ' + p.src + ' | ' + evt);
        lines.push('  Args: ' + argsStr);
        lines.push('');
      }

      if (includeStats) {
        lines.push('========================================');
        lines.push('Statistics by Event Type');
        lines.push('========================================');
        var evtCount = {};
        var sendEvtCount = {};
        var recvEvtCount = {};
        for (var j = 0; j < _packets.length; j++) {
          var pp = _packets[j];
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
      }

      var content = lines.join('\n');

      // 觸發下載
      try {
        var filename = opts.filename || ('packet_monitor_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt');
        var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[PMC] Exported ' + _packets.length + ' packets');
      } catch (e) {
        console.error('[PMC] Download failed:', e);
      }

      emit('export', { time: Date.now(), count: _packets.length, content: content });
      return content;
    },

    /**
     * 匯出 JSON 格式（給程式處理用）
     */
    exportJson: function() {
      return JSON.stringify({
        version: VERSION,
        exportTime: new Date().toISOString(),
        stats: _stats,
        packets: _packets
      }, null, 2);
    }
  };

  // 暴露到全域
  window.__pmCore = core;

  console.log('[PMC] Core loaded, version:', VERSION);
  console.log('[PMC] Call __pmCore.install() first, then .start()/.stop()/.export()');
})();
