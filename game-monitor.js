(function(){
var ver='v1.09';
if(window.__gmInjected){
  console.log('[GM] Already injected ('+ver+')');
  var el=document.getElementById('__gmp_ver');
  if(el)el.textContent=ver;
  return;
}
window.__gmInjected=true;
window.__gmVer=ver;
window.__battleStatus={packets:[]};window.__gmOnlineCount=null;
window.__gmFarming={running:false,timer:null,returning:false,waitTimer:null};

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
        if(d[0]==='onlineCount')window.__gmOnlineCount=d[1];
      }catch(err){}
    });
  }
},100);

// Zone data
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
    {id:'zone_06',name:'古魯丁地監1樓',sub:'Lv.9'},
    {id:'zone_07',name:'古魯丁地監2樓',sub:'Lv.14'},
    {id:'zone_08',name:'古魯丁地監3樓',sub:'Lv.14'},
    {id:'zone_09',name:'古魯丁地監4樓',sub:'Lv.15'},
    {id:'zone_10',name:'古魯丁地監5樓',sub:'Lv.16'},
    {id:'zone_11',name:'古魯丁地監6樓',sub:'Lv.20'},
    {id:'zone_12',name:'古魯丁地監7樓',sub:'Lv.18'},
    {id:'zone_13',name:'說話之島地監1樓',sub:'Lv.10'},
    {id:'zone_14',name:'說話之島地監2樓',sub:'Lv.11'},
    {id:'zone_15',name:'眠龍洞穴1樓',sub:'Lv.6'},
    {id:'zone_16',name:'眠龍洞穴2樓',sub:'Lv.9'},
    {id:'zone_17',name:'眠龍洞穴3樓',sub:'Lv.13'},
    {id:'crystal_cave1',name:'水晶洞穴1樓',sub:'Lv.28'},
    {id:'crystal_cave2',name:'水晶洞穴2樓',sub:'Lv.28'},
    {id:'crystal_cave3',name:'水晶洞穴3樓',sub:'Lv.28'},
    {id:'zone_18',name:'奇岩地監1樓',sub:'Lv.14'},
    {id:'zone_19',name:'奇岩地監2樓',sub:'Lv.15'},
    {id:'zone_20',name:'奇岩地監3樓',sub:'Lv.15'},
    {id:'zone_21',name:'奇岩地監4樓',sub:'Lv.22'},
    {id:'zone_22',name:'沙漠地監1樓',sub:'Lv.9'},
    {id:'zone_23',name:'沙漠地監2樓',sub:'Lv.15'},
    {id:'zone_24',name:'沙漠地監3樓',sub:'Lv.15'},
    {id:'zone_25',name:'沙漠地監4樓',sub:'Lv.25'},
    {id:'zone_26',name:'龍之谷地監1樓',sub:'Lv.24'},
    {id:'zone_27',name:'龍之谷地監2樓',sub:'Lv.28'},
    {id:'zone_28',name:'龍之谷地監3樓',sub:'Lv.29'},
    {id:'zone_29',name:'龍之谷地監4樓',sub:'Lv.30'},
    {id:'zone_30',name:'龍之谷地監5樓',sub:'Lv.36'},
    {id:'zone_31',name:'龍之谷地監6樓',sub:'Lv.38'},
    {id:'zone_32',name:'螞蟻洞窟1樓',sub:'Lv.16'},
    {id:'zone_33',name:'螞蟻洞窟2樓',sub:'Lv.16'},
    {id:'zone_34',name:'地下通道1樓',sub:'Lv.16'},
    {id:'zone_35',name:'地下通道2樓',sub:'Lv.19'},
    {id:'zone_36',name:'地下通道3樓',sub:'Lv.21'},
    {id:'eva_kingdom',name:'伊娃王國',sub:'Lv.22'},
    {id:'zone_37',name:'象牙塔4樓',sub:'Lv.32'},
    {id:'zone_38',name:'象牙塔5樓',sub:'Lv.32'},
    {id:'zone_39',name:'象牙塔6樓',sub:'Lv.43'},
    {id:'zone_40',name:'象牙塔7樓',sub:'Lv.43'},
    {id:'zone_41',name:'象牙塔8樓',sub:'Lv.43'},
  ],
  special:[
    {id:'antaras_lair',name:'安塔瑞斯棲息地',sub:'Lv.93'},
    {id:'fafurion_lair',name:'法利昂洞穴',sub:'Lv.93'},
    {id:'valakas_lair',name:'巴拉卡斯巢穴',sub:'Lv.95'},
  ],
  WORLDBOSS:[
    {id:'wb_sema',name:'西瑪',lv:42},{id:'wb_batus',name:'巴土瑟',lv:43},
    {id:'wb_casper',name:'卡士柏',lv:44},{id:'wb_marcus',name:'馬庫爾',lv:45},
    {id:'wb_ifrit',name:'伊弗利特',lv:45},{id:'wb_wyvern',name:'飛龍',lv:48},
    {id:'wb_blackelder',name:'黑長者',lv:50},{id:'wb_doppel',name:'變形怪首領',lv:50},
    {id:'wb_baphomet',name:'巴風特',lv:50},{id:'wb_kurt',name:'克特',lv:51},
    {id:'wb_dk',name:'死亡騎士',lv:52},{id:'wb_ice',name:'冰之女王',lv:56},
    {id:'wb_antqueen',name:'巨蟻女皇',lv:57},{id:'wb_phoenix',name:'不死鳥',lv:59},
    {id:'wb_demon',name:'惡魔',lv:61},
  ],
};

// All farming zones combined


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

// Farming script
function startFarming(){
  var zoneSelect=document.getElementById('__gmp_farm_zone');
  var hpInput=document.getElementById('__gmp_farm_hp');
  var mpInput=document.getElementById('__gmp_farm_mp');
  var hpCheck=document.getElementById('__gmp_farm_hp_chk');
  var mpCheck=document.getElementById('__gmp_farm_mp_chk');
  var delaySelect=document.getElementById('__gmp_farm_delay');
  var atkCheck=document.getElementById('__gmp_farm_atk');
  var btn=document.getElementById('__gmp_farm_btn');
  var status=document.getElementById('__gmp_farm_status');

  var farmZone=zoneSelect.dataset.value||'';
  var hpThresh=parseInt(hpInput.value)||0;
  var mpThresh=parseInt(mpInput.value)||0;
  var hpEnabled=hpCheck.checked;
  var mpEnabled=mpCheck.checked;
  var delaySec=parseInt(delaySelect.value)||3;
  var autoAtk=atkCheck.checked;

  if(!farmZone){alert('請先選擇掛機地圖！');return;}

  window.__gmFarming={running:true,timer:null,returning:false,waitTimer:null};
  btn.textContent='■ 停止腳本';
  btn.style.background='#e94560';
  status.textContent='傳送至掛機地圖...';
  status.style.color='#fbbf24';

  // Immediately teleport to farm zone
  if(window.__ws)window.__ws.send('42["setZone","'+farmZone+'"]');

  function loop(){
    if(!window.__gmFarming.running)return;
    var pkts=(window.__battleStatus||{packets:[]}).packets;
    var sp=pkts.filter(function(x){return x.type==='receive'&&x.data&&x.data.indexOf('"state"')>-1});
    if(!sp.length){window.__gmFarming.timer=setTimeout(loop,1000);return;}
    try{
      var d=JSON.parse(sp[sp.length-1].data.substring(2))[1];
      var c=d.char||{};
      var hp=c.hp||0,maxHp=c.maxHp||1;
      var mp=c.mp||0,maxMp=c.maxMp||1;
      var zoneName=d.zone||'';
      var isInTown=zoneName.indexOf('大廳')>-1||zoneName.indexOf('村')>-1||zoneName.indexOf('安全')>-1;

      // Auto attack only when in the selected farming zone
      if(autoAtk&&!window.__gmFarming.returning&&!isInTown&&zoneName===farmZone){
        if(window.__ws)window.__ws.send('42["attack"]');
      }

      // Check HP/MP
      var hpPct=hp/maxHp;
      var mpPct=mp/maxMp;
      var needReturn=false;
      if(hpEnabled&&hpPct<(hpThresh/100))needReturn=true;
      if(mpEnabled&&mpPct<(mpThresh/100))needReturn=true;

      if(needReturn&&!window.__gmFarming.returning){
        window.__gmFarming.returning=true;
        if(window.__ws)window.__ws.send('42["toLobby"]');
        status.textContent='HP/MP不足，返回大廳...';
        status.style.color='#fbbf24';
        window.__gmFarming.waitTimer=setTimeout(function(){
          window.__gmFarming.returning=false;
          if(window.__ws)window.__ws.send('42["setZone","'+farmZone+'"]');
          status.textContent='掛機中...';
          status.style.color='#4ade80';
        },delaySec*1000);
      }
    }catch(e){}
    window.__gmFarming.timer=setTimeout(loop,1000);
  }
  loop();
}

function stopFarming(){
  window.__gmFarming.running=false;
  if(window.__gmFarming.timer){clearTimeout(window.__gmFarming.timer);window.__gmFarming.timer=null;}
  if(window.__gmFarming.waitTimer){clearTimeout(window.__gmFarming.waitTimer);window.__gmFarming.waitTimer=null;}
  window.__gmFarming.returning=false;
  var btn=document.getElementById('__gmp_farm_btn');
  var status=document.getElementById('__gmp_farm_status');
  if(btn){btn.textContent='▶ 開啟腳本';btn.style.background='#0f3460'}
  if(status){status.textContent='已停止';status.style.color='#888'}
}

// Searchable zone dropdown
function buildSearchableZone(value,onChange){
  var allZones=[];
  ZONES.wild.forEach(function(z){allZones.push({zone:z,type:'野外'})});
  ZONES.dungeon.forEach(function(z){allZones.push({zone:z,type:'地監'})});
  var sel=value||'';
  var dd,input,list;
  function render(filter){
    if(!list)return;
    list.innerHTML='';
    var cur=filter.toLowerCase();
    var shown=0;
    var filtered=cur?allZones.filter(function(x){return x.zone.name.toLowerCase().includes(cur)}):allZones;
    ['野外','地監'].forEach(function(type){
      var group=filtered.filter(function(x){return x.type===type});
      if(!group.length)return;
      if(!cur){
        var hdr=document.createElement('div');
        hdr.style.cssText='padding:3px 8px;font-size:10px;color:#888;font-weight:bold;';
        hdr.textContent='-- '+type+' --';
        list.appendChild(hdr);
      }
      group.forEach(function(x){
        shown++;
        var item=document.createElement('div');
        item.style.cssText='padding:5px 8px;cursor:pointer;font-size:11px;color:'+(sel===x.zone.id?'#ffd700':'#ccc')+';background:'+(sel===x.zone.id?'#c8a800':'transparent')+';';
        item.textContent=(cur?'  ':'')+x.zone.name+' ('+x.zone.sub+')';
        item.onmouseover=function(){item.style.background='rgba(255,255,255,0.1)'};
        item.onmouseout=function(){item.style.background=sel===x.zone.id?'#c8a800':'transparent'};
        item.onclick=function(){
          sel=x.zone.id;input.value=x.zone.name+' ('+x.zone.sub+')';
          input.style.color='#fff';
          if(dd)dd.style.display='none';
          if(onChange)onChange(x.zone.id);
        };
        list.appendChild(item);
      });
    });
    if(!shown){var e=document.createElement('div');e.style.cssText='padding:8px;font-size:11px;color:#666;text-align:center;';e.textContent='無結果';list.appendChild(e)}
  }
  function close(e){if(dd&&!dd.contains(e.target)&&e.target!==input)dd.style.display='none'}
  return {
    getValue:function(){return sel},
    setValue:function(v){
      sel=v||'';
      var found=allZones.find(function(x){return x.zone.id===v});
      input.value=found?(found.zone.name+' ('+found.zone.sub+')'):'-- 選擇掛機地圖 --';
    },
    mount:function(container){
      dd=document.createElement('div');
      dd.style.cssText='position:relative;';
      input=document.createElement('input');
      input.type='text';
      input.readOnly=true;
      input.value='-- 選擇掛機地圖 --';
      input.style.cssText='width:100%;padding:6px 28px 6px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:6px;color:#888;font-size:11px;outline:none;box-sizing:border-box;cursor:pointer;';
      var arrow=document.createElement('span');
      arrow.style.cssText='position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#888;font-size:10px;pointer-events:none;';
      arrow.textContent='▼';
      list=document.createElement('div');
      list.style.cssText='position:absolute;top:100%;left:0;right:0;z-index:99999;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;margin-top:2px;max-height:200px;overflow-y:auto;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      input.onclick=function(){
        var sh=document.querySelectorAll('.__gmp_dd');
        sh.forEach(function(d){if(d!==dd)d.style.display='none'});
        list.style.display=list.style.display==='none'?'block':'none';
        render('');
      };
      input.oninput=function(){render(input.value)};
      dd.appendChild(input);dd.appendChild(arrow);dd.appendChild(list);
      container.innerHTML='';container.appendChild(dd);
      document.addEventListener('click',close);
      if(sel){
        var f=allZones.find(function(x){return x.zone.id===sel});
        if(f)input.value=f.zone.name+' ('+f.zone.sub+')';
      }
    }
  };
}

// Main panel build
(function(){
  var old=document.getElementById('__gmp');if(old)old.remove();
  var isExpanded=true;var zoom=1;
  var activeTab='game';
  var activeZoneTab='town';
  var p=document.createElement('div');p.id='__gmp';
  Object.assign(p.style,{position:'fixed',top:'10px',right:'10px',width:'300px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'2px solid #0f3460',borderRadius:'12px',padding:'12px',fontFamily:'Segoe UI',color:'#fff',zIndex:'999999',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',cursor:'move'});
  
  p.innerHTML=
  '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #0f3460;">'+
  '<div style="display:flex;align-items:center;gap:6px;">'+
    '<button id="__gmp_tab_game" style="padding:5px 9px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">狀態</button>'+
    '<button id="__gmp_tab_zone" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">地圖</button>'+
    '<button id="__gmp_tab_farm" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">掛機</button>'+
    '<span id="__gmp_ver" style="font-size:10px;color:#4ade80;font-weight:bold;">'+ver+'</span>'+
  '</div>'+
  '<div style="display:flex;gap:3px;">'+
    '<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:12px;">▼</button>'+
    '<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">+</button>'+
    '<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">-</button>'+
    '<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:12px;">X</button>'+
  '</div>'+
  '</div>'+
  '<div id="__gmp_content">'+
    // === GAME TAB ===
    '<div id="__gmp_tab_content_game" style="display:block;">'+
    '<div style="display:flex;gap:5px;margin-bottom:8px;">'+
      '<button id="__gmp_lobby" style="flex:1;padding:6px 0;background:#e94560;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">🏠 返回大廳</button>'+
      '<button id="__gmp_zone_town" style="flex:1;padding:6px 0;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;">⚔️ 銀騎士村</button>'+
    '</div>'+
    '<div style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px;margin-bottom:8px;">'+
      '<div id="__gmp_name" style="font-weight:bold;color:#ffd700;font-size:14px;">Loading...</div>'+
      '<div id="__gmp_info" style="font-size:11px;color:#aaa;">Lv.?</div>'+
    '</div>'+
    '<div style="margin-bottom:5px;">'+
      '<div style="display:flex;justify-content:space-between;"><span style="color:#e94560;">HP</span><span id="__gmp_hp_text" style="color:#e94560;">--/--</span></div>'+
      '<div style="background:#3a1a1a;border-radius:4px;height:14px;"><div id="__gmp_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;"></div></div>'+
    '</div>'+
    '<div style="margin-bottom:5px;">'+
      '<div style="display:flex;justify-content:space-between;"><span style="color:#00d9ff;">MP</span><span id="__gmp_mp_text" style="color:#00d9ff;">--/--</span></div>'+
      '<div style="background:#1a2a3a;border-radius:4px;height:10px;"><div id="__gmp_mp_bar" style="width:0%;background:#00d9ff;height:100%;border-radius:4px;"></div></div>'+
    '</div>'+
    '<div style="margin-bottom:6px;">'+
      '<div style="display:flex;justify-content:space-between;"><span style="color:#ffd700;">EXP</span><span id="__gmp_exp_text" style="color:#ffd700;">--%</span></div>'+
      '<div style="background:#3a3a1a;border-radius:4px;height:8px;"><div id="__gmp_exp_bar" style="width:0%;background:#ffd700;height:100%;border-radius:4px;"></div></div>'+
    '</div>'+
    '<div style="display:flex;gap:5px;margin-bottom:6px;">'+
      '<div style="flex:1;background:rgba(255,255,255,0.05);padding:5px 8px;border-radius:4px;">'+
        '<span style="color:#888;font-size:10px;">GOLD </span><span id="__gmp_gold" style="color:#ffd700;font-weight:bold;">--</span>'+
      '</div>'+
      '<div style="flex:1;background:rgba(255,255,255,0.05);padding:5px 8px;border-radius:4px;text-align:center;">'+
        '<span style="color:#888;font-size:10px;">👥 </span><span id="__gmp_online" style="color:#7bd14a;font-weight:bold;">--</span>'+
      '</div>'+
    '</div>'+
    '<div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:4px;">'+
      '<div style="font-weight:bold;margin-bottom:3px;font-size:11px;">👾 MONSTERS</div>'+
      '<div id="__gmp_mobs" style="font-size:11px;color:#aaa;">...</div>'+
    '</div>'+
    '</div>'+
    // === ZONE TAB ===
    '<div id="__gmp_tab_content_zone" style="display:none;">'+
    '<input id="__gmp_search" placeholder="🔍 搜尋..." style="width:100%;padding:6px 8px;background:rgba(255,255,255,0.08);border:1px solid #0f3460;border-radius:6px;color:#fff;font-size:11px;margin-bottom:6px;outline:none;box-sizing:border-box;">'+
    '<div style="display:flex;gap:3px;margin-bottom:6px;flex-wrap:wrap;">'+
      '<button class="__gmp_st active" data-t="town" style="padding:4px 7px;background:#0f3460;border:none;color:#fff;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">村</button>'+
      '<button class="__gmp_st" data-t="wild" style="padding:4px 7px;background:#333;border:none;color:#aaa;border-radius:5px;cursor:pointer;font-size:10px;">野外</button>'+
      '<button class="__gmp_st" data-t="dungeon" style="padding:4px 7px;background:#333;border:none;color:#aaa;border-radius:5px;cursor:pointer;font-size:10px;">地監</button>'+
      '<button class="__gmp_st" data-t="special" style="padding:4px 7px;background:#333;border:none;color:#aaa;border-radius:5px;cursor:pointer;font-size:10px;">王/特</button>'+
    '</div>'+
    '<div id="__gmp_boss_list" style="max-height:180px;overflow-y:auto;margin-bottom:4px;display:none;"></div>'+
    '<div id="__gmp_zone_list" style="max-height:180px;overflow-y:auto;"></div>'+
    '</div>'+
    // === FARM TAB ===
    '<div id="__gmp_tab_content_farm" style="display:none;">'+
    // Zone select - searchable
    '<div style="margin-bottom:8px;">'+
      '<div style="font-size:10px;color:#888;margin-bottom:3px;">掛機地圖</div>'+
      '<div id="__gmp_farm_zone"></div>'+
    '</div>'+
    // HP row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_hp_chk" style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#e94560;width:50px;">HP低於</span>'+
      '<input id="__gmp_farm_hp" type="number" value="20" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 返回大廳</span>'+
    '</div>'+
    // MP row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_mp_chk" style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#00d9ff;width:50px;">MP低於</span>'+
      '<input id="__gmp_farm_mp" type="number" value="10" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 返回大廳</span>'+
    '</div>'+
    // Delay row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
      '<span style="font-size:10px;color:#888;width:80px;">返回大廳後</span>'+
      '<select id="__gmp_farm_delay" style="padding:4px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        [1,2,3,4,5].map(function(n){return '<option value="'+n+'"'+(n===3?' selected':'')+'>'+n+'</option>'}).join('')+
      '</select>'+
      '<span style="font-size:10px;color:#888;">秒返回掛機地圖</span>'+
    '</div>'+
    // Auto attack
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">'+
      '<input type="checkbox" id="__gmp_farm_atk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:11px;color:#7bd14a;font-weight:bold;">⚔️ 自動攻擊</span>'+
    '</div>'+
    // Status
    '<div id="__gmp_farm_status" style="font-size:10px;color:#888;margin-bottom:6px;text-align:center;">已停止</div>'+
    // Start/Stop button
    '<button id="__gmp_farm_btn" style="width:100%;padding:9px;background:#0f3460;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;">▶ 開啟腳本</button>'+
    '</div>'+
  '</div>';
  document.body.appendChild(p);

  // === Mount searchable zone dropdown ===
  var farmZoneDropdown=buildSearchableZone('',function(val){
    document.getElementById('__gmp_farm_zone').dataset.value=val||'';
  });
  farmZoneDropdown.mount(document.getElementById('__gmp_farm_zone'));

  // === Zone tab functions ===
  function buildZoneItem(z){
    var div=document.createElement('div');
    div.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:rgba(255,255,255,0.04);border-radius:5px;margin-bottom:2px;cursor:pointer;border:1px solid transparent;transition:all 0.15s;';
    div.innerHTML='<span style="font-size:11px;">'+z.name+'</span><span style="font-size:10px;color:#888;">'+(z.sub||'')+'</span>';
    div.onmouseover=function(){this.style.background='rgba(255,255,255,0.1)';this.style.borderColor='#0f3460'};
    div.onmouseout=function(){this.style.background='rgba(255,255,255,0.04)';this.style.borderColor='transparent'};
    div.onclick=function(){
      sendZone(z.id);
      this.style.background='#0f3460';
      setTimeout(function(){div.style.background='rgba(255,255,255,0.04)'},300);
    };
    return div;
  }

  function buildBossItem(b){
    var div=document.createElement('div');
    div.style.cssText='display:flex;align-items:center;padding:5px 8px;background:rgba(233,69,96,0.08);border-radius:5px;margin-bottom:2px;cursor:pointer;border:1px solid rgba(233,69,96,0.3);transition:all 0.15s;';
    div.innerHTML='<span style="font-size:11px;color:#e94560;">👑 '+b.name+'</span><span style="font-size:10px;color:#888;margin-left:auto;">Lv.'+b.lv+'</span>';
    div.onmouseover=function(){this.style.background='rgba(233,69,96,0.2)'};
    div.onmouseout=function(){this.style.background='rgba(233,69,96,0.08)'};
    div.onclick=function(){
      if(window.__ws)window.__ws.send('42["gotoWorldBoss","'+b.id+'"]');
      this.style.background='rgba(233,69,96,0.4)';
      setTimeout(function(){div.style.background='rgba(233,69,96,0.08)'},300);
    };
    return div;
  }

  function renderZones(tab){
    activeZoneTab=tab;
    var list=document.getElementById('__gmp_zone_list');
    var bossList=document.getElementById('__gmp_boss_list');
    list.innerHTML='';
    bossList.style.display='none';
    list.style.display='block';
    var search=(document.getElementById('__gmp_search')||{value:''}).value.trim().toLowerCase();
    if(tab==='special'){
      bossList.style.display='block';
      bossList.innerHTML='';
      ZONES.WORLDBOSS.forEach(function(b){if(!search||b.name.toLowerCase().includes(search))bossList.appendChild(buildBossItem(b))});
      (ZONES.special||[]).forEach(function(z){if(!search||z.name.toLowerCase().includes(search))list.appendChild(buildZoneItem(z))});
    } else {
      (ZONES[tab]||[]).forEach(function(z){if(!search||z.name.toLowerCase().includes(search))list.appendChild(buildZoneItem(z))});
    }
    document.querySelectorAll('.__gmp_st').forEach(function(b){
      b.style.background=b.dataset.t===tab?'#0f3460':'#333';
      b.style.color=b.dataset.t===tab?'#fff':'#aaa';
      b.style.fontWeight=b.dataset.t===tab?'bold':'normal';
    });
  }

  if(document.getElementById('__gmp_search'))document.getElementById('__gmp_search').oninput=function(){renderZones(activeZoneTab)};
  document.querySelectorAll('.__gmp_st').forEach(function(b){b.onclick=function(){renderZones(this.dataset.t)}});

  // === Tab switching ===
  function switchTab(tab){
    activeTab=tab;
    ['game','zone','farm'].forEach(function(t){
      var el=document.getElementById('__gmp_tab_content_'+t);
      if(el)el.style.display=t===tab?'block':'none';
      var btn=document.getElementById('__gmp_tab_'+t);
      if(btn){
        btn.style.background=t===tab?'#0f3460':'#333';
        btn.style.color=t===tab?'#fff':'#aaa';
        btn.style.fontWeight=t===tab?'bold':'normal';
      }
    });
    if(tab==='zone')renderZones(activeZoneTab);
  }
  document.getElementById('__gmp_tab_game').onclick=function(){switchTab('game')};
  document.getElementById('__gmp_tab_zone').onclick=function(){switchTab('zone')};
  document.getElementById('__gmp_tab_farm').onclick=function(){switchTab('farm')};

  // === Control buttons ===
  document.getElementById('__gmp_lobby').onclick=function(){sendCmd('toLobby')};
  document.getElementById('__gmp_zone_town').onclick=function(){sendZone('town_silver_knight')};
  document.getElementById('__gmp_close').onclick=function(){stopFarming();document.getElementById('__gmp').remove()};
  document.getElementById('__gmp_expand').onclick=function(){
    isExpanded=!isExpanded;
    document.getElementById('__gmp_content').style.display=isExpanded?'block':'none';
    this.textContent=isExpanded?'▼':'▶';
  };
  document.getElementById('__gmp_zoom_in').onclick=function(){zoom=Math.min(zoom+0.1,2);p.style.transform='scale('+zoom+')'};
  document.getElementById('__gmp_zoom_out').onclick=function(){zoom=Math.max(zoom-0.1,0.5);p.style.transform='scale('+zoom+')'};

  // === Farm button ===
  document.getElementById('__gmp_farm_btn').onclick=function(){
    if(window.__gmFarming.running){
      stopFarming();
    } else {
      startFarming();
    }
  };

  // === Drag ===
  var drag=false,ox,oy;
  p.addEventListener('mousedown',function(e){
    var tn=e.target.tagName;
    if(tn==='INPUT'||tn==='SELECT'||tn==='BUTTON'||tn==='OPTION'||tn==='OPTGROUP')return;
    drag=true;ox=e.clientX-p.offsetLeft;oy=e.clientY-p.offsetTop;
  });
  document.addEventListener('mousemove',function(e){if(drag){p.style.left=(e.clientX-ox)+'px';p.style.top=(e.clientY-oy)+'px';p.style.right='auto'}});
  document.addEventListener('mouseup',function(){drag=false});

  // === Status update ===
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
