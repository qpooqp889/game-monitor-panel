(function(){
var ver='v1.04';
if(window.__gmInjected){
  console.log('[GM] Already injected ('+ver+')');
  var el=document.getElementById('__gmp_ver');
  if(el)el.textContent=ver;
  return;
}
window.__gmInjected=true;
window.__gmVer=ver;
window.__battleStatus={packets:[]};window.__gmOnlineCount=null;

// Hook WebSocket send
var origSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){
  window.__battleStatus.packets.push({type:'send',data:data});
  window.__ws=this;
  return origSend.call(this,data);
};

if(window.__ws){
  window.__ws.addEventListener('message',function(e){
    window.__battleStatus.packets.push({type:'receive',data:e.data});
  });
}

setInterval(function(){
  if(window.__ws&&!window.__ws.__hooked){
    window.__ws.__hooked=true;
    window.__ws.addEventListener('message',function(e){
      window.__battleStatus.packets.push({type:'receive',data:e.data});
      try{
        var d=JSON.parse(e.data.substring(2));
        if(d[0]==='onlineCount'){window.__gmOnlineCount=d[1];}
      }catch(err){}
    });
  }
},100);

// Zone data from game UI
var ZONES={
  town:[
    {id:'town_silver_knight',name:'銀騎士村',sub:'安全區'},
    {id:'town_elf',name:'妖精森林',sub:'安全區'},
    {id:'town_talking',name:'說話之島',sub:'安全區'},
    {id:'town_gludio',name:'燃柳村',sub:'安全區'},
    {id:'town_giran',name:'奇岩',sub:'安全區'},
    {id:'town_heine',name:'海音',sub:'安全區'},
    {id:'town_oren',name:'歐瑞村莊',sub:'安全區'},
    {id:'town_ivory_tower',name:'象牙塔',sub:'安全區'},
    {id:'town_sherine',name:'席琳神殿',sub:'安全區'},
    {id:'town_witon',name:'威頓村',sub:'安全區'},
  ],
  wild:[
    {id:'training',name:'新兵修練場',sub:'建議 Lv.3'},
    {id:'silver_knight',name:'銀騎士地區',sub:'建議 Lv.10'},
    {id:'talking_island',name:'說話之島周邊',sub:'建議 Lv.6'},
    {id:'zone_01',name:'妖精森林周邊',sub:'建議 Lv.9'},
    {id:'talking_island_port',name:'說話之島港口',sub:'建議 Lv.14'},
    {id:'elf_forest',name:'妖魔森林',sub:'建議 Lv.15'},
    {id:'gludio',name:'古魯丁',sub:'建議 Lv.11'},
    {id:'windwood',name:'風木',sub:'建議 Lv.10'},
    {id:'desert',name:'沙漠',sub:'建議 Lv.20'},
    {id:'kent',name:'肯特',sub:'建議 Lv.11'},
    {id:'dragon_valley',name:'龍之谷',sub:'建議 Lv.20'},
    {id:'fire_dragon',name:'火龍窟',sub:'建議 Lv.33'},
    {id:'giran',name:'奇岩',sub:'建議 Lv.20'},
    {id:'heine',name:'海音',sub:'建議 Lv.19'},
    {id:'mirror_forest',name:'鏡子森林',sub:'建議 Lv.22'},
    {id:'zone_02',name:'歐瑞',sub:'建議 Lv.18'},
    {id:'zone_03',name:'歐瑞雪原',sub:'建議 Lv.32'},
    {id:'zone_04',name:'艾爾摩激戰地',sub:'建議 Lv.24'},
    {id:'zone_05',name:'國境要塞',sub:'建議 Lv.29'},
    {id:'dream_island',name:'夢幻之島',sub:'建議 Lv.39'},
  ],
  dungeon:[
    {id:'zone_06',name:'古魯丁地監1樓',sub:'建議 Lv.9'},
    {id:'zone_07',name:'古魯丁地監2樓',sub:'建議 Lv.14'},
    {id:'zone_08',name:'古魯丁地監3樓',sub:'建議 Lv.14'},
    {id:'zone_09',name:'古魯丁地監4樓',sub:'建議 Lv.15'},
    {id:'zone_10',name:'古魯丁地監5樓',sub:'建議 Lv.16'},
    {id:'zone_11',name:'古魯丁地監6樓',sub:'建議 Lv.20'},
    {id:'zone_12',name:'古魯丁地監7樓',sub:'建議 Lv.18'},
    {id:'zone_13',name:'說話之島地監1樓',sub:'建議 Lv.10'},
    {id:'zone_14',name:'說話之島地監2樓',sub:'建議 Lv.11'},
    {id:'zone_15',name:'眠龍洞穴1樓',sub:'建議 Lv.6'},
    {id:'zone_16',name:'眠龍洞穴2樓',sub:'建議 Lv.9'},
    {id:'zone_17',name:'眠龍洞穴3樓',sub:'建議 Lv.13'},
    {id:'crystal_cave1',name:'水晶洞穴1樓',sub:'建議 Lv.28'},
    {id:'crystal_cave2',name:'水晶洞穴2樓',sub:'建議 Lv.28'},
    {id:'crystal_cave3',name:'水晶洞穴3樓',sub:'建議 Lv.28'},
    {id:'zone_18',name:'奇岩地監1樓',sub:'建議 Lv.14'},
    {id:'zone_19',name:'奇岩地監2樓',sub:'建議 Lv.15'},
    {id:'zone_20',name:'奇岩地監3樓',sub:'建議 Lv.15'},
    {id:'zone_21',name:'奇岩地監4樓',sub:'建議 Lv.22'},
    {id:'zone_22',name:'沙漠地監1樓',sub:'建議 Lv.9'},
    {id:'zone_23',name:'沙漠地監2樓',sub:'建議 Lv.15'},
    {id:'zone_24',name:'沙漠地監3樓',sub:'建議 Lv.15'},
    {id:'zone_25',name:'沙漠地監4樓',sub:'建議 Lv.25'},
    {id:'zone_26',name:'龍之谷地監1樓',sub:'建議 Lv.24'},
    {id:'zone_27',name:'龍之谷地監2樓',sub:'建議 Lv.28'},
    {id:'zone_28',name:'龍之谷地監3樓',sub:'建議 Lv.29'},
    {id:'zone_29',name:'龍之谷地監4樓',sub:'建議 Lv.30'},
    {id:'zone_30',name:'龍之谷地監5樓',sub:'建議 Lv.36'},
    {id:'zone_31',name:'龍之谷地監6樓',sub:'建議 Lv.38'},
    {id:'zone_32',name:'螞蟻洞窟1樓',sub:'建議 Lv.16'},
    {id:'zone_33',name:'螞蟻洞窟2樓',sub:'建議 Lv.16'},
    {id:'zone_34',name:'地下通道1樓',sub:'建議 Lv.16'},
    {id:'zone_35',name:'地下通道2樓',sub:'建議 Lv.19'},
    {id:'zone_36',name:'地下通道3樓',sub:'建議 Lv.21'},
    {id:'eva_kingdom',name:'伊娃王國',sub:'建議 Lv.22'},
    {id:'zone_37',name:'象牙塔4樓',sub:'建議 Lv.32'},
    {id:'zone_38',name:'象牙塔5樓',sub:'建議 Lv.32'},
    {id:'zone_39',name:'象牙塔6樓',sub:'建議 Lv.43'},
    {id:'zone_40',name:'象牙塔7樓',sub:'建議 Lv.43'},
    {id:'zone_41',name:'象牙塔8樓',sub:'建議 Lv.43'},
  ],
};

function sendZone(zoneId){
  if(window.__ws){
    window.__ws.send('42["setZone","'+zoneId+'"]');
    console.log('[GM] Teleport:',zoneId);
  }
}

function sendCmd(cmd){
  if(window.__ws){
    window.__ws.send('42["'+cmd+'"]');
    console.log('[GM] Cmd:',cmd);
  }
}

(function(){
  var old=document.getElementById('__gmp');if(old)old.remove();
  var isExpanded=true;var zoom=1;
  var activeTab='game';
  var activeZoneTab='town';
  var p=document.createElement('div');p.id='__gmp';
  Object.assign(p.style,{position:'fixed',top:'10px',right:'10px',width:'300px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'2px solid #0f3460',borderRadius:'12px',padding:'12px',fontFamily:'Segoe UI',color:'#fff',zIndex:'999999',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',cursor:'move'});
  
  p.innerHTML=
  '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #0f3460;">'+
  '<div style="display:flex;align-items:center;gap:8px;">'+
    '<button id="__gmp_tab_game" style="padding:5px 10px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">狀態</button>'+
    '<button id="__gmp_tab_zone" style="padding:5px 10px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">地圖</button>'+
    '<span id="__gmp_ver" style="font-size:10px;color:#4ade80;font-weight:bold;">'+ver+'</span>'+
  '</div>'+
  '<div style="display:flex;gap:4px;">'+
    '<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:12px;">▼</button>'+
    '<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">+</button>'+
    '<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">-</button>'+
    '<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:12px;">X</button>'+
  '</div>'+
  '</div>'+
  '<div id="__gmp_content">'+
    // GAME TAB
    '<div id="__gmp_tab_content_game" style="display:block;">'+
    '<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:8px;"><div id="__gmp_name" style="font-weight:bold;color:#ffd700;font-size:14px;">Loading...</div><div id="__gmp_info" style="font-size:11px;color:#aaa;">Lv.?</div></div>'+
    '<div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;"><span style="color:#e94560;">HP</span><span id="__gmp_hp_text" style="color:#e94560;">--/--</span></div><div style="background:#3a1a1a;border-radius:4px;height:14px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;"></div></div></div>'+
    '<div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;"><span style="color:#00d9ff;">MP</span><span id="__gmp_mp_text" style="color:#00d9ff;">--/--</span></div><div style="background:#1a2a3a;border-radius:4px;height:10px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:4px;"></div></div></div>'+
    '<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;"><span style="color:#ffd700;">EXP</span><span id="__gmp_exp_text" style="color:#ffd700;">--%</span></div><div style="background:#3a3a1a;border-radius:4px;height:8px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:4px;"></div></div></div>'+
    '<div style="display:flex;gap:6px;margin-bottom:6px;"><div style="flex:1;background:rgba(255,255,255,0.05);padding:5px 8px;border-radius:4px;"><span style="color:#888;font-size:11px;">GOLD </span><span id="__gmp_gold" style="color:#ffd700;font-weight:bold;">--</span></div><div style="flex:1;background:rgba(255,255,255,0.05);padding:5px 8px;border-radius:4px;text-align:center;"><span style="color:#888;font-size:11px;">👥 </span><span id="__gmp_online" style="color:#7bd14a;font-weight:bold;">--</span></div></div>'+
    '<div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:4px;margin-bottom:6px;"><div style="font-weight:bold;margin-bottom:3px;font-size:11px;">👾 MONSTERS</div><div id="__gmp_mobs" style="font-size:11px;color:#aaa;">...</div></div>'+
    '</div>'+
    // ZONE TAB
    '<div id="__gmp_tab_content_zone" style="display:none;">'+
    // Search
    '<input id="__gmp_search" placeholder="🔍 搜尋地圖名稱..." style="width:100%;padding:7px 10px;background:rgba(255,255,255,0.08);border:1px solid #0f3460;border-radius:6px;color:#fff;font-size:12px;margin-bottom:8px;outline:none;box-sizing:border-box;">'+
    // Sub tabs
    '<div class="subtabs" style="display:flex;gap:4px;margin-bottom:8px;">'+
      '<button class="__gmp_st active" data-t="town" style="flex:1;padding:6px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">村莊</button>'+
      '<button class="__gmp_st" data-t="wild" style="flex:1;padding:6px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">野外</button>'+
      '<button class="__gmp_st" data-t="dungeon" style="flex:1;padding:6px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">地監</button>'+
    '</div>'+
    // Zone list
    '<div id="__gmp_zone_list" style="max-height:220px;overflow-y:auto;"></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(p);
  
  // Build zone item
  function buildZoneItem(z){
    var div=document.createElement('div');
    div.className='__gmp_zi';
    div.dataset.name=z.name;
    div.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all 0.2s;';
    div.innerHTML='<span style="font-size:12px;">'+z.name+'</span><span style="font-size:10px;color:#888;">'+(z.sub||'')+'</span>';
    div.onmouseover=function(){this.style.background='rgba(255,255,255,0.1)';this.style.borderColor='#0f3460'};
    div.onmouseout=function(){this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='transparent'};
    div.onclick=function(){
      sendZone(z.id);
      // Flash effect
      this.style.background='#0f3460';
      setTimeout(function(){div.style.background='rgba(255,255,255,0.04)'},300);
    };
    return div;
  }
  
  // Render zone list
  function renderZones(tab){
    activeZoneTab=tab;
    var list=document.getElementById('__gmp_zone_list');
    list.innerHTML='';
    var search=document.getElementById('__gmp_search').value.trim().toLowerCase();
    var data=ZONES[tab]||[];
    data.forEach(function(z){
      if(search&&!z.name.toLowerCase().includes(search))return;
      list.appendChild(buildZoneItem(z));
    });
    // Update subtab styles
    document.querySelectorAll('.__gmp_st').forEach(function(b){
      b.style.background=b.dataset.t===tab?'#0f3460':'#333';
      b.style.color=b.dataset.t===tab?'#fff':'#aaa';
      b.style.fontWeight=b.dataset.t===tab?'bold':'normal';
    });
  }
  
  // Search input
  document.getElementById('__gmp_search').oninput=function(){renderZones(activeZoneTab)};
  
  // Sub tab clicks
  document.querySelectorAll('.__gmp_st').forEach(function(b){
    b.onclick=function(){renderZones(this.dataset.t)};
  });
  
  // Tab switching
  function switchTab(tab){
    activeTab=tab;
    document.getElementById('__gmp_tab_content_game').style.display=tab==='game'?'block':'none';
    document.getElementById('__gmp_tab_content_zone').style.display=tab==='zone'?'block':'none';
    document.getElementById('__gmp_tab_game').style.background=tab==='game'?'#0f3460':'#333';
    document.getElementById('__gmp_tab_game').style.color=tab==='game'?'#fff':'#aaa';
    document.getElementById('__gmp_tab_game').style.fontWeight=tab==='game'?'bold':'normal';
    document.getElementById('__gmp_tab_zone').style.background=tab==='zone'?'#0f3460':'#333';
    document.getElementById('__gmp_tab_zone').style.color=tab==='zone'?'#fff':'#aaa';
    document.getElementById('__gmp_tab_zone').style.fontWeight=tab==='zone'?'bold':'normal';
    if(tab==='zone')renderZones(activeZoneTab);
  }
  document.getElementById('__gmp_tab_game').onclick=function(){switchTab('game')};
  document.getElementById('__gmp_tab_zone').onclick=function(){switchTab('zone')};
  
  // Controls
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
    if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;
    drag=true;ox=e.clientX-p.offsetLeft;oy=e.clientY-p.offsetTop;
  });
  document.addEventListener('mousemove',function(e){
    if(drag){p.style.left=(e.clientX-ox)+'px';p.style.top=(e.clientY-oy)+'px';p.style.right='auto'}
  });
  document.addEventListener('mouseup',function(){drag=false});
  
  // Update
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
        document.getElementById('__gmp_info').textContent='Lv.'+(c.level||'?')+' | '+(d.zoneName||'');
        document.getElementById('__gmp_hp_text').textContent=(c.hp||0)+'/'+(c.maxHp||0);
        document.getElementById('__gmp_hp_bar').style.width=Math.round((c.hp||0)/(c.maxHp||1)*100)+'%';
        document.getElementById('__gmp_mp_text').textContent=(c.mp||0)+'/'+(c.maxMp||0);
        document.getElementById('__gmp_mp_bar').style.width=Math.round((c.mp||0)/(c.maxMp||1)*100)+'%';
        document.getElementById('__gmp_exp_text').textContent=Math.round((c.exp||0)/(c.expToNext||1)*100)+'%';
        document.getElementById('__gmp_exp_bar').style.width=Math.round((c.exp||0)/(c.expToNext||1)*100)+'%';
        document.getElementById('__gmp_gold').textContent=(c.gold||0).toLocaleString();
        document.getElementById('__gmp_online').textContent=window.__gmOnlineCount?(window.__gmOnlineCount+'人'):'--';
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
