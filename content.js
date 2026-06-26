// content.js - Game Monitor Panel
(function() {
  'use strict';
  
  console.log('[Game Monitor] Content script starting...');
  
  // Storage key
  var STORAGE_KEY = 'gm_packets';
  var MONITOR_KEY = 'gm_ws';
  
  // Monitoring state
  var monitoringActive = false;
  var panelUpdateInterval = null;
  var currentWS = null;
  
  // 初始化封包監控
  function initMonitoring() {
    console.log('[Game Monitor] initMonitoring called');
    
    // Hook WebSocket.prototype.send
    if (!WebSocket.prototype.__hooked) {
      console.log('[Game Monitor] Hooking WebSocket.prototype.send');
      WebSocket.prototype.__hooked = true;
      var origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function(data) {
        console.log('[GM] WS SEND:', data.substring(0, 80));
        currentWS = this;
        savePacket({ type: 'send', data: data, time: Date.now() });
        return origSend.call(this, data);
      };
    }
    
    // Hook existing WebSocket instances
    try {
      if (window.WebSocket && window.WebSocket.CONNECTING !== undefined) {
        // WebSocket exists, hook it
        console.log('[GM] WebSocket available');
      }
    } catch(e) {
      console.log('[GM] WebSocket hook error:', e);
    }
  }
  
  // Save packet to sessionStorage
  function savePacket(packet) {
    try {
      var packets = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      packets.push(packet);
      // Keep last 100 packets
      if (packets.length > 100) packets = packets.slice(-100);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(packets));
      sessionStorage.setItem(MONITOR_KEY, 'true');
    } catch(e) {}
  }
  
  // Hook WebSocket message
  function hookWebSocket() {
    try {
      // Find existing WebSocket
      var sockets = [];
      // Try to hook via original WebSocket pattern
      var OrigWS = window.WebSocket;
      
      // Hook all existing WebSocket instances
      document.querySelectorAll('iframe').forEach(function(iframe) {
        try {
          if (iframe.contentWindow && iframe.contentWindow.WebSocket) {
            // Don't hook cross-origin
          }
        } catch(e) {}
      });
      
      // For Socket.IO games, the WebSocket is usually created after page load
      // We'll poll for it
    } catch(e) {
      console.log('[GM] hookWebSocket error:', e);
    }
  }
  
  // Check for WebSocket periodically
  function checkForWebSocket() {
    try {
      // Socket.IO games create WebSocket connections
      // We need to find the actual WebSocket used by Socket.IO
      if (window.io && window.io.Manager) {
        console.log('[GM] Socket.IO detected!');
      }
      
      // Try to find WebSocket in global scope
      if (window.__ws && !window.__ws.__hooked_msg) {
        window.__ws.__hooked_msg = true;
        window.__ws.addEventListener('message', function(e) {
          console.log('[GM] WS MSG:', e.data.substring(0, 80));
          savePacket({ type: 'receive', data: e.data, time: Date.now() });
        });
        console.log('[GM] Hooked window.__ws message');
      }
    } catch(e) {}
  }
  
  // 初始化
  initMonitoring();
  
  // 持續檢查 WebSocket
  setInterval(checkForWebSocket, 1000);
  
  // 監聽來自 popup 的訊息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[Game Monitor] Message received:', request.action);
    
    if (request.action === 'startMonitoring') {
      monitoringActive = true;
      sendResponse(true);
    } else if (request.action === 'togglePanel') {
      var existing = document.getElementById('__gmp');
      if (existing) {
        existing.remove();
        if (panelUpdateInterval) clearInterval(panelUpdateInterval);
        sendResponse(false);
      } else {
        createPanel();
        sendResponse(true);
      }
    } else if (request.action === 'checkStatus') {
      var packets = [];
      try {
        packets = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      } catch(e) {}
      sendResponse({ 
        panelExists: !!document.getElementById('__gmp'),
        monitoring: monitoringActive,
        packetCount: packets.length
      });
    }
    return true;
  });
  
  // 創建面板
  function createPanel() {
    monitoringActive = true;
    sessionStorage.setItem(MONITOR_KEY, 'true');
    
    var old = document.getElementById('__gmp');
    if (old) old.remove();
    if (panelUpdateInterval) clearInterval(panelUpdateInterval);
    
    var isExpanded = true;
    var zoom = 1;
    
    var p = document.createElement('div');
    p.id = '__gmp';
    Object.assign(p.style, {
      position: 'fixed', top: '10px', right: '10px', width: '300px',
      background: '#1a1a2e', border: '2px solid #0f3460',
      borderRadius: '12px', padding: '15px', fontFamily: 'Segoe UI',
      color: '#fff', zIndex: '999999', cursor: 'move'
    });
    
    p.innerHTML =
      '<div style="display:flex;justify-content:space-between;margin-bottom:10px;">' +
        '<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;">V</button>' +
        '<span style="font-weight:bold;color:#00d9ff;">GAME MONITOR</span>' +
        '<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>' +
        '<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">-</button>' +
        '<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;">X</button>' +
      '</div>' +
      '<div id="__gmp_content">' +
        '<div style="background:#0f3460;padding:8px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
          '<div><span style="color:#888;font-size:10px;">LOCATION</span><div id="__gmp_location" style="color:#00d9ff;font-weight:bold;">---</div></div>' +
          '<button id="__gmp_btn_home" style="padding:6px 10px;background:#9b59b6;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">HOME</button>' +
        '</div>' +
        '<div style="margin-bottom:8px;"><span style="color:#ffd700;">NAME:</span> <span id="__gmp_name" style="color:#ffd700;">---</span> <span id="__gmp_info" style="color:#aaa;font-size:11px;">Lv.?</span></div>' +
        '<div style="margin-bottom:6px;"><span style="color:#e94560;">HP:</span> <span id="__gmp_hp" style="color:#e94560;font-weight:bold;">--/--</span></div>' +
        '<div style="background:#3a1a1a;border-radius:4px;height:16px;margin-bottom:8px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;"></div></div>' +
        '<div style="margin-bottom:6px;"><span style="color:#00d9ff;">MP:</span> <span id="__gmp_mp" style="color:#00d9ff;font-weight:bold;">--/--</span></div>' +
        '<div style="background:#1a2a3a;border-radius:4px;height:12px;margin-bottom:8px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:4px;"></div></div>' +
        '<div style="margin-bottom:6px;"><span style="color:#ffd700;">EXP:</span> <span id="__gmp_exp" style="color:#ffd700;font-weight:bold;">--%</span></div>' +
        '<div style="background:#3a3a1a;border-radius:4px;height:10px;margin-bottom:8px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:4px;"></div></div>' +
        '<div style="margin-bottom:8px;"><span>GOLD:</span> <span id="__gmp_gold" style="color:#ffd700;font-weight:bold;">---</span></div>' +
        '<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:10px;">' +
          '<div style="font-weight:bold;margin-bottom:5px;color:#ff6b6b;">MONSTERS</div>' +
          '<div id="__gmp_mobs" style="font-size:12px;">---</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' +
          '<button id="__gmp_btn_hp" style="padding:10px;background:#e94560;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">HP</button>' +
          '<button id="__gmp_btn_atk" style="padding:10px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">ATK</button>' +
          '<button id="__gmp_btn_stop" style="padding:10px;background:#333;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">STOP</button>' +
        '</div>' +
      '</div>';
    
    document.body.appendChild(p);
    
    // 按鈕功能
    document.getElementById('__gmp_btn_hp').onclick = function() { 
      if (currentWS) currentWS.send('42["useItem","potion_heal"]'); 
    };
    document.getElementById('__gmp_btn_atk').onclick = function() { 
      if (currentWS) currentWS.send('42["attack"]'); 
    };
    document.getElementById('__gmp_btn_stop').onclick = function() { 
      if (currentWS) currentWS.send('42["stop"]'); 
    };
    document.getElementById('__gmp_btn_home').onclick = function() { 
      if (currentWS) currentWS.send('42["returnLobby"]'); 
    };
    document.getElementById('__gmp_close').onclick = function() { 
      var panel = document.getElementById('__gmp'); 
      if (panel) panel.remove(); 
      if (panelUpdateInterval) clearInterval(panelUpdateInterval); 
    };
    
    // 展開/收縮
    document.getElementById('__gmp_expand').onclick = function() {
      isExpanded = !isExpanded;
      document.getElementById('__gmp_content').style.display = isExpanded ? 'block' : 'none';
      this.textContent = isExpanded ? 'V' : '^';
    };
    
    // 縮放
    document.getElementById('__gmp_zoom_in').onclick = function() { zoom = Math.min(zoom + 0.1, 2); p.style.transform = 'scale(' + zoom + ')'; };
    document.getElementById('__gmp_zoom_out').onclick = function() { zoom = Math.max(zoom - 0.1, 0.5); p.style.transform = 'scale(' + zoom + ')'; };
    
    // 拖動
    var drag = false, ox, oy;
    p.addEventListener('mousedown', function(e) { if (e.target.tagName !== 'BUTTON') { drag = true; ox = e.clientX - p.offsetLeft; oy = e.clientY - p.offsetTop; } });
    document.addEventListener('mousemove', function(e) { if (drag) { p.style.left = (e.clientX - ox) + 'px'; p.style.top = (e.clientY - oy) + 'px'; p.style.right = 'auto'; } });
    document.addEventListener('mouseup', function() { drag = false; });
    
    // 更新函數
    function upd() {
      var packets = [];
      try {
        packets = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      } catch(e) {}
      
      var recvPackets = packets.filter(function(x) { return x.type === 'receive'; });
      var sendPackets = packets.filter(function(x) { return x.type === 'send'; });
      
      document.getElementById('__gmp_mobs').innerHTML = 
        '<span style="color:#888;font-size:10px;">RX:' + recvPackets.length + ' TX:' + sendPackets.length + '</span>';
      
      // 找 state 封包
      var sp = packets.filter(function(x) { return x.type === 'receive' && x.data && x.data.indexOf('"state"') > -1; });
      if (!sp.length) return;
      
      try {
        var raw = sp[sp.length - 1].data;
        var data = JSON.parse(raw.substring(2))[1];
        var c = data.char;
        
        document.getElementById('__gmp_name').textContent = c.name || '---';
        document.getElementById('__gmp_info').textContent = 'Lv.' + (c.level || '?');
        document.getElementById('__gmp_hp').textContent = (c.hp || 0) + '/' + (c.maxHp || 0);
        document.getElementById('__gmp_hp_bar').style.width = c.maxHp > 0 ? Math.round(c.hp / c.maxHp * 100) + '%' : '0%';
        document.getElementById('__gmp_mp').textContent = (c.mp || 0) + '/' + (c.maxMp || 0);
        document.getElementById('__gmp_mp_bar').style.width = c.maxMp > 0 ? Math.round(c.mp / c.maxMp * 100) + '%' : '0%';
        document.getElementById('__gmp_exp').textContent = c.expToNext > 0 ? Math.round(c.exp / c.expToNext * 100) + '%' : '0%';
        document.getElementById('__gmp_exp_bar').style.width = c.expToNext > 0 ? Math.round(c.exp / c.expToNext * 100) + '%' : '0%';
        document.getElementById('__gmp_gold').textContent = (c.gold || 0).toLocaleString();
        
        // 位置
        var loc = data.zone || data.map || data.location || data.area || data.currentZone || '---';
        if (typeof loc === 'object') loc = loc.name || loc.id || '---';
        document.getElementById('__gmp_location').textContent = loc;
        
        // 怪物
        var h = '';
        if (data.monsters && data.monsters.length) {
          data.monsters.forEach(function(m, i) {
            if (m) {
              var pct = Math.round((m.hp / m.maxHp) * 100);
              var col = pct > 50 ? '#4ade80' : pct > 25 ? '#fbbf24' : '#e94560';
              h += '<div>[' + i + ']' + (m.n || '?') + ' <span style="color:' + col + ';">' + m.hp + '/' + m.maxHp + '</span></div>';
            }
          });
        }
        document.getElementById('__gmp_mobs').innerHTML = h || '<span style="color:#888;">No monsters</span>';
      } catch(e) { console.error('[Game Monitor] Parse error:', e); }
    }
    
    panelUpdateInterval = setInterval(upd, 500);
    upd();
    
    console.log('[Game Monitor] Panel created!');
  }
  
  console.log('[Game Monitor] Content script initialized');
})();
