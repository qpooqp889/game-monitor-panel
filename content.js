// content.js - Game Monitor Panel
(function() {
  'use strict';
  
  console.log('[Game Monitor] Content script starting...');
  
  var panelUpdateInterval = null;
  var currentWS = null;
  
  // Hook WebSocket for sending
  function initWebSocketHook() {
    var origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
      currentWS = this;
      console.log('[GM] WS SEND:', data.substring(0, 80));
      return origSend.call(this, data);
    };
    
    // Hook existing WebSocket instances
    setInterval(function() {
      if (window.__ws && !window.__ws.__hooked) {
        window.__ws.__hooked = true;
        window.__ws.addEventListener('message', function(e) {
          console.log('[GM] WS MSG:', e.data.substring(0, 80));
        });
      }
    }, 500);
  }
  
  initWebSocketHook();
  
  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[GM] Message:', request.action);
    
    if (request.action === 'togglePanel' || request.action === 'startPanel') {
      var existing = document.getElementById('__gmp');
      if (existing) {
        existing.remove();
        if (panelUpdateInterval) clearInterval(panelUpdateInterval);
        sendResponse(false);
      } else {
        createPanel();
        sendResponse(true);
      }
    } else if (request.action === 'sendWS') {
      if (currentWS) {
        currentWS.send(request.data);
        console.log('[GM] Sent via WS:', request.data);
      }
    }
    return true;
  });
  
  // Create panel
  function createPanel() {
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
    
    // Buttons
    document.getElementById('__gmp_btn_hp').onclick = function() { 
      if (currentWS) currentWS.send('42["useItem","potion_heal"]'); 
      else console.log('[GM] No WS to send');
    };
    document.getElementById('__gmp_btn_atk').onclick = function() { 
      if (currentWS) currentWS.send('42["attack"]'); 
      else console.log('[GM] No WS to send');
    };
    document.getElementById('__gmp_btn_stop').onclick = function() { 
      if (currentWS) currentWS.send('42["stop"]'); 
      else console.log('[GM] No WS to send');
    };
    document.getElementById('__gmp_btn_home').onclick = function() { 
      if (currentWS) currentWS.send('42["returnLobby"]'); 
    };
    document.getElementById('__gmp_close').onclick = function() { 
      var panel = document.getElementById('__gmp'); 
      if (panel) panel.remove(); 
      if (panelUpdateInterval) clearInterval(panelUpdateInterval); 
    };
    
    // Expand/Collapse
    document.getElementById('__gmp_expand').onclick = function() {
      isExpanded = !isExpanded;
      document.getElementById('__gmp_content').style.display = isExpanded ? 'block' : 'none';
      this.textContent = isExpanded ? 'V' : '^';
    };
    
    // Zoom
    document.getElementById('__gmp_zoom_in').onclick = function() { zoom = Math.min(zoom + 0.1, 2); p.style.transform = 'scale(' + zoom + ')'; };
    document.getElementById('__gmp_zoom_out').onclick = function() { zoom = Math.max(zoom - 0.1, 0.5); p.style.transform = 'scale(' + zoom + ')'; };
    
    // Drag
    var drag = false, ox, oy;
    p.addEventListener('mousedown', function(e) { if (e.target.tagName !== 'BUTTON') { drag = true; ox = e.clientX - p.offsetLeft; oy = e.clientY - p.offsetTop; } });
    document.addEventListener('mousemove', function(e) { if (drag) { p.style.left = (e.clientX - ox) + 'px'; p.style.top = (e.clientY - oy) + 'px'; p.style.right = 'auto'; } });
    document.addEventListener('mouseup', function() { drag = false; });
    
    // Update function
    function upd() {
      document.getElementById('__gmp_mobs').innerHTML = 
        '<span style="color:#888;font-size:10px;">WS: ' + (currentWS ? 'Connected' : 'Not found') + '</span>';
    }
    
    panelUpdateInterval = setInterval(upd, 1000);
    upd();
    
    console.log('[GM] Panel created!');
  }
  
  console.log('[GM] Content script initialized');
})();
