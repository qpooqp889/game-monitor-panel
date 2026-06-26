// content.js - 遊戲監控面板
(function() {
  'use strict';
  
  // 封包監控
  if (!window.__battleStatus) {
    window.__battleStatus = { packets: [] };
    var origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
      window.__battleStatus.packets.push({ type: 'send', data: data });
      window.__ws = this;
      return origSend.call(this, data);
    };
  }
  
  // 監聽來自 popup 的訊息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'togglePanel') {
      var existing = document.getElementById('__gmp');
      if (existing) {
        existing.remove();
        sendResponse(false);
      } else {
        createPanel();
        sendResponse(true);
      }
    } else if (request.action === 'checkStatus') {
      sendResponse({ panelExists: !!document.getElementById('__gmp') });
    }
    return true;
  });
  
  // 監聽 WebSocket message
  function hookWebSocket() {
    if (window.__ws && !window.__ws.__hooked) {
      window.__ws.__hooked = true;
      window.__ws.addEventListener('message', function(e) {
        window.__battleStatus.packets.push({ type: 'receive', data: e.data });
      });
    }
  }
  
  // 創建面板
  function createPanel() {
    hookWebSocket();
    
    var old = document.getElementById('__gmp');
    if (old) old.remove();
    
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
        // 位置
        '<div style="background:#0f3460;padding:8px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
          '<div><span style="color:#888;font-size:10px;">LOCATION</span><div id="__gmp_location" style="color:#00d9ff;font-weight:bold;">---</div></div>' +
          '<button id="__gmp_btn_home" style="padding:6px 10px;background:#9b59b6;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">HOME</button>' +
        '</div>' +
        // 角色
        '<div style="margin-bottom:8px;"><span style="color:#ffd700;">NAME:</span> <span id="__gmp_name" style="color:#ffd700;">---</span> <span id="__gmp_info" style="color:#aaa;font-size:11px;">Lv.?</span></div>' +
        // HP
        '<div style="margin-bottom:6px;"><span style="color:#e94560;">HP:</span> <span id="__gmp_hp" style="color:#e94560;font-weight:bold;">--/--</span></div>' +
        '<div style="background:#3a1a1a;border-radius:4px;height:16px;margin-bottom:8px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;"></div></div>' +
        // MP
        '<div style="margin-bottom:6px;"><span style="color:#00d9ff;">MP:</span> <span id="__gmp_mp" style="color:#00d9ff;font-weight:bold;">--/--</span></div>' +
        '<div style="background:#1a2a3a;border-radius:4px;height:12px;margin-bottom:8px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:4px;"></div></div>' +
        // EXP
        '<div style="margin-bottom:6px;"><span style="color:#ffd700;">EXP:</span> <span id="__gmp_exp" style="color:#ffd700;font-weight:bold;">--%</span></div>' +
        '<div style="background:#3a3a1a;border-radius:4px;height:10px;margin-bottom:8px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:4px;"></div></div>' +
        // 金幣
        '<div style="margin-bottom:8px;"><span>GOLD:</span> <span id="__gmp_gold" style="color:#ffd700;font-weight:bold;">---</span></div>' +
        // 怪物
        '<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:10px;">' +
          '<div style="font-weight:bold;margin-bottom:5px;color:#ff6b6b;">MONSTERS</div>' +
          '<div id="__gmp_mobs" style="font-size:12px;">---</div>' +
        '</div>' +
        // 按鈕
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' +
          '<button id="__gmp_btn_hp" style="padding:10px;background:#e94560;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">HP</button>' +
          '<button id="__gmp_btn_atk" style="padding:10px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">ATK</button>' +
          '<button id="__gmp_btn_stop" style="padding:10px;background:#333;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:bold;">STOP</button>' +
        '</div>' +
      '</div>';
    
    document.body.appendChild(p);
    
    // 按鈕功能
    document.getElementById('__gmp_btn_hp').onclick = function() {
      window.__ws && window.__ws.send('42["useItem","potion_heal"]');
    };
    document.getElementById('__gmp_btn_atk').onclick = function() {
      window.__ws && window.__ws.send('42["attack"]');
    };
    document.getElementById('__gmp_btn_stop').onclick = function() {
      window.__ws && window.__ws.send('42["stop"]');
    };
    document.getElementById('__gmp_btn_home').onclick = function() {
      window.__ws && window.__ws.send('42["returnLobby"]');
    };
    document.getElementById('__gmp_close').onclick = function() {
      var panel = document.getElementById('__gmp');
      if (panel) panel.remove();
    };
    
    // 展開/收縮
    document.getElementById('__gmp_expand').onclick = function() {
      isExpanded = !isExpanded;
      document.getElementById('__gmp_content').style.display = isExpanded ? 'block' : 'none';
      this.textContent = isExpanded ? 'V' : '^';
    };
    
    // 縮放
    document.getElementById('__gmp_zoom_in').onclick = function() {
      zoom = Math.min(zoom + 0.1, 2);
      p.style.transform = 'scale(' + zoom + ')';
    };
    document.getElementById('__gmp_zoom_out').onclick = function() {
      zoom = Math.max(zoom - 0.1, 0.5);
      p.style.transform = 'scale(' + zoom + ')';
    };
    
    // 拖動
    var drag = false, ox, oy;
    p.addEventListener('mousedown', function(e) {
      if (e.target.tagName !== 'BUTTON') {
        drag = true;
        ox = e.clientX - p.offsetLeft;
        oy = e.clientY - p.offsetTop;
      }
    });
    document.addEventListener('mousemove', function(e) {
      if (drag) {
        p.style.left = (e.clientX - ox) + 'px';
        p.style.top = (e.clientY - oy) + 'px';
        p.style.right = 'auto';
      }
    });
    document.addEventListener('mouseup', function() { drag = false; });
    
    // 更新函數
    function upd() {
      hookWebSocket();
      var pkts = (window.__battleStatus || {}).packets || [];
      var sp = pkts.filter(function(x) {
        return x.type === 'receive' && x.data && x.data.indexOf('"state"') > -1;
      });
      if (!sp.length) return;
      
      try {
        var d = JSON.parse(sp[sp.length - 1].data.substring(2))[1];
        var c = d.char;
        
        document.getElementById('__gmp_name').textContent = c.name;
        document.getElementById('__gmp_info').textContent = 'Lv.' + c.level;
        document.getElementById('__gmp_hp').textContent = c.hp + '/' + c.maxHp;
        document.getElementById('__gmp_hp_bar').style.width = Math.round(c.hp / c.maxHp * 100) + '%';
        document.getElementById('__gmp_mp').textContent = c.mp + '/' + c.maxMp;
        document.getElementById('__gmp_mp_bar').style.width = Math.round(c.mp / c.maxMp * 100) + '%';
        document.getElementById('__gmp_exp').textContent = Math.round(c.exp / c.expToNext * 100) + '%';
        document.getElementById('__gmp_exp_bar').style.width = Math.round(c.exp / c.expToNext * 100) + '%';
        document.getElementById('__gmp_gold').textContent = c.gold || '--';
        
        // 位置
        var loc = d.zone || d.map || d.location || d.area || '---';
        if (typeof loc === 'object') loc = loc.name || loc.id || '---';
        document.getElementById('__gmp_location').textContent = loc;
        
        // 怪物
        var h = '';
        if (d.monsters) {
          d.monsters.forEach(function(m, i) {
            if (m) {
              var pct = Math.round(m.hp / m.maxHp * 100);
              var col = pct > 50 ? '#4ade80' : pct > 25 ? '#fbbf24' : '#e94560';
              h += '<div>[' + i + ']' + m.n + ' <span style="color:' + col + ';">' + m.hp + '/' + m.maxHp + '</span></div>';
            }
          });
        }
        document.getElementById('__gmp_mobs').innerHTML = h || '<span style="color:#888;">none</span>';
      } catch(e) {}
    }
    
    // 定時更新
    setInterval(upd, 200);
    upd();
    
    console.log('[Game Monitor] Panel started!');
  }
  
  // 頁面載入後嘗試創建面板（可選）
  // setTimeout(createPanel, 1000);
  
})();
