(function(){
var ver='v1.01';
if(window.__gmInjected){
  console.log('[GM] Already injected ('+ver+')');
  // Update panel version
  var el=document.getElementById('__gmp_ver');
  if(el)el.textContent=ver;
  return;
}
window.__gmInjected=true;
window.__gmVer=ver;
window.__battleStatus={packets:[]};

// Hook WebSocket send
var origSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){
  window.__battleStatus.packets.push({type:'send',data:data});
  window.__ws=this;
  return origSend.call(this,data);
};

// Hook existing WebSocket
if(window.__ws){
  window.__ws.addEventListener('message',function(e){
    window.__battleStatus.packets.push({type:'receive',data:e.data});
  });
}

// Poll to hook WebSocket messages
var hookInt=setInterval(function(){
  if(window.__ws&&!window.__ws.__hooked){
    window.__ws.__hooked=true;
    window.__ws.addEventListener('message',function(e){
      window.__battleStatus.packets.push({type:'receive',data:e.data});
    });
    console.log('[GM] WebSocket hooked!');
  }
},100);

// Zone definitions
var ZONES=[
  {id:'zone_01',name:'🌲 迷霧森林'},
  {id:'zone_02',name:'🏔️ 寒風高地'},
  {id:'zone_03',name:'🌊 海風港灣'},
  {id:'zone_04',name:'🏚️ 幽靈廢墟'},
  {id:'zone_05',name:'🌋 火山地帶'},
  {id:'zone_06',name:'❄️ 冰霜洞窟'},
  {id:'zone_07',name:'⚔️ 銀騎士村'},
  {id:'zone_08',name:'🌙 月影森林'},
  {id:'zone_09',name:'🔥 熔岩深淵'},
  {id:'zone_10',name:'🌿 精靈花園'},
  {id:'zone_11',name:'⚡ 雷鳴山脈'},
  {id:'zone_12',name:'🌑 永夜城'},
  {id:'dungeon_01',name:'📦 地監1層'},
  {id:'dungeon_02',name:'📦 地監2層'},
  {id:'dungeon_03',name:'📦 地監3層'},
  {id:'trial_01',name:'⚔️ 試煉場'},
  {id:'trial_02',name:'🏆 競技場'},
  {id:'guild',name:'🏰 公會'},
  {id:'town',name:'🏠 大廳'},
];

function sendZone(zoneId){
  if(window.__ws){
    window.__ws.send('42["setZone","'+zoneId+'"]');
    console.log('[GM] Teleport to:',zoneId);
  }
}

function sendCmd(cmd){
  if(window.__ws){
    window.__ws.send('42["'+cmd+'"]');
    console.log('[GM] Cmd:',cmd);
  }
}

// Create panel
(function(){
  var old=document.getElementById('__gmp');if(old)old.remove();
  var isExpanded=true;var zoom=1;
  var activeTab='game';
  var p=document.createElement('div');p.id='__gmp';
  Object.assign(p.style,{position:'fixed',top:'10px',right:'10px',width:'320px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'2px solid #0f3460',borderRadius:'12px',padding:'15px',fontFamily:'Segoe UI',color:'#fff',zIndex:'999999',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',cursor:'move'});
  
  p.innerHTML=
  '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #0f3460;">'+
  '<div style="display:flex;align-items:center;gap:8px;">'+
    '<div style="display:flex;gap:4px;">'+
      '<button id="__gmp_tab_game" style="padding:6px 12px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">狀態</button>'+
      '<button id="__gmp_tab_zone" style="padding:6px 12px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:12px;">地圖</button>'+
    '</div>'+
    '<span id="__gmp_ver" style="font-size:10px;color:#4ade80;font-weight:bold;">'+ver+'</span>'+
  '</div>'+
  '<div style="display:flex;gap:4px;">'+
    '<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;">▼</button>'+
    '<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:14px;">+</button>'+
    '<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:14px;">-</button>'+
    '<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;">X</button>'+
  '</div>'+
  '</div>'+
  '<div id="__gmp_content">'+
    '<div id="__gmp_tab_content_game" style="display:block;">'+
    '<div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;margin-bottom:10px;"><div id="__gmp_name" style="font-weight:bold;color:#ffd700;font-size:16px;">Loading...</div><div id="__gmp_info" style="font-size:12px;color:#aaa;">Lv.?</div></div>'+
    '<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;"><span style="color:#e94560;">HP</span><span id="__gmp_hp_text" style="color:#e94560;">--/--</span></div><div style="background:#3a1a1a;border-radius:6px;height:16px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:6px;"></div></div></div>'+
    '<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;"><span style="color:#00d9ff;">MP</span><span id="__gmp_mp_text" style="color:#00d9ff;">--/--</span></div><div style="background:#1a2a3a;border-radius:6px;height:12px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:6px;"></div></div></div>'+
    '<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;"><span style="color:#ffd700;">EXP</span><span id="__gmp_exp_text" style="color:#ffd700;">--%</span></div><div style="background:#3a3a1a;border-radius:6px;height:10px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:6px;"></div></div></div>'+
    '<div style="background:rgba(255,255,255,0.05);padding:6px 8px;border-radius:6px;margin-bottom:8px;"><span style="color:#888;">GOLD: </span><span id="__gmp_gold" style="color:#ffd700;font-weight:bold;">--</span></div>'+
    '<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:8px;"><div style="font-weight:bold;margin-bottom:4px;font-size:12px;">👾 MONSTERS</div><div id="__gmp_mobs" style="font-size:12px;color:#aaa;">...</div></div>'+
    '</div>'+
    '<div id="__gmp_tab_content_zone" style="display:none;">'+
    '<div style="display:flex;gap:6px;margin-bottom:8px;">'+
      '<button id="__gmp_cmd_lobby" style="flex:1;padding:8px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">🏠 大廳</button>'+
      '<button id="__gmp_cmd_town" style="flex:1;padding:8px;background:#333;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;">⚔️ 野外</button>'+
    '</div>'+
    '<div style="font-weight:bold;font-size:12px;color:#888;margin-bottom:6px;">-- 戶外地圖 --</div>'+
    '<div id="__gmp_zone_list" style="max-height:200px;overflow-y:auto;"></div>'+
    '<div style="font-weight:bold;font-size:12px;color:#888;margin:8px 0 6px;">-- 地監 --</div>'+
    '<div id="__gmp_dungeon_list" style="max-height:120px;overflow-y:auto;"></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(p);
  
  // Build zone buttons
  var zoneList=document.getElementById('__gmp_zone_list');
  var dungeonList=document.getElementById('__gmp_dungeon_list');
  ZONES.forEach(function(z){
    var btn=document.createElement('button');
    btn.style.cssText='width:100%;padding:7px 10px;background:rgba(255,255,255,0.05);border:1px solid #0f3460;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:4px;text-align:left;';
    btn.textContent=z.name;
    btn.onclick=function(){sendZone(z.id)};
    if(z.id.startsWith('dungeon')){
      dungeonList.appendChild(btn);
    } else {
      zoneList.appendChild(btn);
    }
  });
  
  // Command buttons
  document.getElementById('__gmp_cmd_lobby').onclick=function(){sendCmd('toLobby')};
  document.getElementById('__gmp_cmd_town').onclick=function(){sendZone('zone_07')};
  
  // Tab switching
  function switchTab(tab){
    activeTab=tab;
    document.getElementById('__gmp_tab_content_game').style.display=tab==='game'?'block':'none';
    document.getElementById('__gmp_tab_content_zone').style.display=tab==='zone'?'block':'none';
    document.getElementById('__gmp_tab_game').style.background=tab==='game'?'#0f3460':'#333';
    document.getElementById('__gmp_tab_game').style.color=tab==='game'?'#fff':'#aaa';
    document.getElementById('__gmp_tab_zone').style.background=tab==='zone'?'#0f3460':'#333';
    document.getElementById('__gmp_tab_zone').style.color=tab==='zone'?'#fff':'#aaa';
  }
  document.getElementById('__gmp_tab_game').onclick=function(){switchTab('game')};
  document.getElementById('__gmp_tab_zone').onclick=function(){switchTab('zone')};
  
  // Control buttons
  document.getElementById('__gmp_close').onclick=function(){document.getElementById('__gmp').remove()};
  document.getElementById('__gmp_expand').onclick=function(){
    isExpanded=!isExpanded;
    document.getElementById('__gmp_content').style.display=isExpanded?'block':'none';
    this.textContent=isExpanded?'▼':'▶';
  };
  document.getElementById('__gmp_zoom_in').onclick=function(){zoom=Math.min(zoom+0.1,2);p.style.transform='scale('+zoom+')'};
  document.getElementById('__gmp_zoom_out').onclick=function(){zoom=Math.max(zoom-0.1,0.5);p.style.transform='scale('+zoom+')'};
  
  // Drag
  var drag=false,ox,oy;
  p.addEventListener('mousedown',function(e){
    if(e.target.tagName!=='BUTTON'&&e.target.tagName!=='DIV')return;
    drag=true;ox=e.clientX-p.offsetLeft;oy=e.clientY-p.offsetTop;
  });
  document.addEventListener('mousemove',function(e){
    if(drag){p.style.left=(e.clientX-ox)+'px';p.style.top=(e.clientY-oy)+'px';p.style.right='auto'}
  });
  document.addEventListener('mouseup',function(){drag=false});
  
  // Update function
  function upd(){
    var pkts=(window.__battleStatus||{packets:[]}).packets;
    var sp=pkts.filter(function(x){return x.type==='receive'&&x.data&&x.data.indexOf('"state"')>-1});
    if(!sp.length)return;
    try{
      var d=JSON.parse(sp[sp.length-1].data.substring(2))[1];
      var c=d.char;
      if(!c)return;
      if(document.getElementById('__gmp_name')){
        document.getElementById('__gmp_name').textContent=c.name||'?';
        document.getElementById('__gmp_info').textContent='Lv.'+(c.level||'?')+' | '+(d.zoneName||d.zone||'');
        document.getElementById('__gmp_hp_text').textContent=(c.hp||0)+'/'+(c.maxHp||0);
        document.getElementById('__gmp_hp_bar').style.width=Math.round((c.hp||0)/(c.maxHp||1)*100)+'%';
        document.getElementById('__gmp_mp_text').textContent=(c.mp||0)+'/'+(c.maxMp||0);
        document.getElementById('__gmp_mp_bar').style.width=Math.round((c.mp||0)/(c.maxMp||1)*100)+'%';
        document.getElementById('__gmp_exp_text').textContent=Math.round((c.exp||0)/(c.expToNext||1)*100)+'%';
        document.getElementById('__gmp_exp_bar').style.width=Math.round((c.exp||0)/(c.expToNext||1)*100)+'%';
        document.getElementById('__gmp_gold').textContent=(c.gold||0).toLocaleString();
        var h='';
        if(d.monsters)d.monsters.forEach(function(m,i){if(m){var pct=Math.round(m.hp/m.maxHp*100);var col=pct>50?'#4ade80':pct>25?'#fbbf24':'#e94560';h+='<div>['+i+'] '+(m.n||'?')+' <span style="color:'+col+';">'+(m.hp||0)+'/'+(m.maxHp||0)+'</span></div>'}});
        document.getElementById('__gmp_mobs').innerHTML=h||'<span style="color:#888;">none</span>';
      }
    }catch(e){}
  }
  setInterval(upd,500);
  upd();
})();
console.log('[GM] Monitor injected '+ver);
})();
