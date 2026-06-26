(function(){
var ver='v1.26';
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

// ========== Storage Functions ==========
function saveFarmSettings(){
  var data={
    farmZone: document.getElementById('__gmp_farm_zone').value||'',
    hpThresh: parseInt(document.getElementById('__gmp_farm_hp').value)||20,
    mpThresh: parseInt(document.getElementById('__gmp_farm_mp').value)||10,
    hpEnabled: document.getElementById('__gmp_farm_hp_chk').checked,
    mpEnabled: document.getElementById('__gmp_farm_mp_chk').checked,
    hpGtThresh: parseInt(document.getElementById('__gmp_farm_hp_gt').value)||80,
    mpGtThresh: parseInt(document.getElementById('__gmp_farm_mp_gt').value)||50,
    hpGtEnabled: document.getElementById('__gmp_farm_hp_gt_chk').checked,
    mpGtEnabled: document.getElementById('__gmp_farm_mp_gt_chk').checked,
    logicOp: document.getElementById('__gmp_farm_logic').value||'AND',
    logicEnabled: document.getElementById('__gmp_farm_logic_chk').checked,
    autoAtk: document.getElementById('__gmp_farm_atk').checked,
    // 新增：斷線重連設定
    charName: document.getElementById('__gmp_farm_char_name').value||'',
    reconnectEnabled: document.getElementById('__gmp_farm_reconnect').checked,
    reconnectInterval: parseInt(document.getElementById('__gmp_farm_reconnect_interval').value)||60
  };
  // Send to content script to save via chrome.storage
  window.postMessage({type:'GM_SAVE_SETTINGS',data:data},'*');
}

function loadFarmSettings(callback){
  window.postMessage({type:'GM_LOAD_SETTINGS'},'*');
  window.__gmLoadCallback=callback;
}

// Listen for load response from content script
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='GM_LOAD_RESPONSE'&&window.__gmLoadCallback){
    window.__gmLoadCallback(e.data.data);
    window.__gmLoadCallback=null;
  }
});

// ========== End Storage Functions ==========

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

// Build zone ID lookup (Chinese name -> zone ID)
function buildZoneNameLookup(){
  var m={};
  [ZONES.town,ZONES.wild,ZONES.dungeon,ZONES.special].forEach(function(arr){
    (arr||[]).forEach(function(z){if(z.id&&z.name)m[z.name]=z.id});
  });
  return m;
}
var ZONE_NAME_LOOKUP=buildZoneNameLookup();

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
  var hpGtInput=document.getElementById('__gmp_farm_hp_gt');
  var mpGtInput=document.getElementById('__gmp_farm_mp_gt');
  var hpGtCheck=document.getElementById('__gmp_farm_hp_gt_chk');
  var mpGtCheck=document.getElementById('__gmp_farm_mp_gt_chk');
  var logicSelect=document.getElementById('__gmp_farm_logic');
  var logicCheck=document.getElementById('__gmp_farm_logic_chk');
  var atkCheck=document.getElementById('__gmp_farm_atk');
  var reconnectCheck=document.getElementById('__gmp_farm_reconnect');
  var charNameInput=document.getElementById('__gmp_farm_char_name');
  var reconnectIntervalInput=document.getElementById('__gmp_farm_reconnect_interval');
  var btn=document.getElementById('__gmp_farm_btn');
  var status=document.getElementById('__gmp_farm_status');

  var farmZone=zoneSelect.value||'';
  var hpThresh=parseInt(hpInput.value)||0;
  var mpThresh=parseInt(mpInput.value)||0;
  var hpGtThresh=parseInt(hpGtInput.value)||0;
  var mpGtThresh=parseInt(mpGtInput.value)||0;
  var hpEnabled=hpCheck.checked;
  var mpEnabled=mpCheck.checked;
  var hpGtEnabled=hpGtCheck.checked;
  var mpGtEnabled=mpGtCheck.checked;
  var logicOp=logicSelect.value;
  var logicEnabled=logicCheck.checked;
  var autoAtk=atkCheck.checked;
  var reconnectEnabled=reconnectCheck.checked;
  var charName=charNameInput.value.trim()||'';
  var reconnectInterval=parseInt(reconnectIntervalInput.value)||60;

  if(!farmZone){alert('請先選擇掛機地圖！');return;}

  window.__gmFarming={running:true,timer:null,returning:false,inTown:false,reconnectTimer:null};
  window.__gmFarming.reconnectEnabled=reconnectEnabled;
  window.__gmFarming.charName=charName;
  window.__gmFarming.reconnectInterval=reconnectInterval*1000;
  window.__gmFarming.lastReconnectCheck=Date.now();
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
    console.log('[GM] loop running, packets:',pkts.length,'state packets:',sp.length);
    if(!sp.length){window.__gmFarming.timer=setTimeout(loop,1000);return;}
    try{
      var d=JSON.parse(sp[sp.length-1].data.substring(2))[1];
      var c=d.char||{};
      var hp=c.hp||0,maxHp=c.maxHp||1;
      var mp=c.mp||0,maxMp=c.maxMp||1;
      var zoneName=d.zoneName||d.zone||'';
      var mode=d.mode||'';
      // Resolve zone ID: try d.zoneId first, then lookup by Chinese name
      var zoneId=d.zoneId||ZONE_NAME_LOOKUP[zoneName]||zoneName||'';
      // Check if in town: by mode='lobby' or zone name contains town keywords
      var isInTown=mode==='lobby'||
                   zoneName.indexOf('大廳')>-1||zoneName.indexOf('大厅')>-1||
                   zoneName.indexOf('村')>-1||zoneName.indexOf('安全')>-1;
      
      console.log('[GM] mode:',mode,'zoneName:',zoneName,'isInTown:',isInTown,'HP:',Math.round(hp/maxHp*100)+'%','MP:',Math.round(mp/maxMp*100)+'%');
      
      // Update inTown state
      window.__gmFarming.inTown=isInTown;

      // Auto attack only when in the selected farming zone
      if(autoAtk&&!window.__gmFarming.returning&&!isInTown&&zoneId===farmZone){
        if(window.__ws){
          window.__ws.send('42["attack"]');
          status.textContent='攻擊中...';
        }
      }

      // Check HP/MP thresholds (return to lobby)
      var hpPct=hp/maxHp;
      var mpPct=mp/maxMp;
      var needReturn=false;
      var hpLow=hpEnabled&&hpPct<(hpThresh/100);
      var mpLow=mpEnabled&&mpPct<(mpThresh/100);

      if(logicEnabled&&logicOp==='AND'){
        needReturn=hpLow&&mpLow;
      } else if(logicEnabled&&logicOp==='OR'){
        needReturn=hpLow||mpLow;
      } else {
        // No logic checkbox: any enabled condition triggers return
        if(hpLow)needReturn=true;
        if(mpLow)needReturn=true;
      }

      // Feature 1: Return to lobby when HP/MP low
      if(needReturn&&!window.__gmFarming.returning){
        window.__gmFarming.returning=true;
        if(window.__ws)window.__ws.send('42["toLobby"]');
        status.textContent='HP/MP不足，返回大廳...';
        status.style.color='#fbbf24';
      }

      // Feature 2: Auto teleport to farm when HP/MP > threshold (in town)
      // Triggered when in town AND HP/MP above thresholds
      if(isInTown){
        var hpGtOk=hpGtEnabled&&hpPct>(hpGtThresh/100);
        var mpGtOk=mpGtEnabled&&mpPct>(mpGtThresh/100);
        console.log('[GM] In town, HP:',Math.round(hpPct*100)+'%, MP:',Math.round(mpPct*100)+'%, hpGtOk:',hpGtOk,'mpGtOk:',mpGtOk);
        if(hpGtOk||mpGtOk){
          console.log('[GM] Teleporting to farm zone:',farmZone);
          if(window.__ws)window.__ws.send('42["setZone","'+farmZone+'"]');
          status.textContent='HP/MP充足，傳送掛機...';
          status.style.color='#4ade80';
          window.__gmFarming.returning=false;
        }
      }
      
      // Reset returning state when left town (entered farm zone)
      if(!isInTown&&window.__gmFarming.returning){
        window.__gmFarming.returning=false;
      }
    }catch(e){}
    window.__gmFarming.timer=setTimeout(loop,1000);
  }
  loop();

  // === 斷線重連檢測 ===
  function checkReconnect(){
    if(!window.__gmFarming.running)return;
    if(!window.__gmFarming.reconnectEnabled||!window.__gmFarming.charName){
      window.__gmFarming.reconnectTimer=setTimeout(checkReconnect,window.__gmFarming.reconnectInterval);
      return;
    }
    
    var charName=window.__gmFarming.charName;
    
    // 檢測是否在角色選擇畫面（檢測 #slots 或 .char-slot 是否存在）
    var slotsDiv=document.getElementById('slots');
    var charSlots=document.querySelectorAll('.char-slot');
    var isOnCharSelect=slotsDiv!==null||charSlots.length>0;
    
    if(isOnCharSelect){
      console.log('[GM] 斷線檢測：在角色選擇畫面，嘗試點擊角色槽...');
      status.textContent='⚠️ 斷線檢測中，嘗試重連...';
      status.style.color='#fbbf24';
      
      // 嘗試找到包含角色名稱的 .char-slot 並點擊
      var clicked=false;
      charSlots.forEach(function(slot){
        if(slot.innerHTML.indexOf(charName)>-1){
          var emptyDiv=slot.querySelector('.empty');
          if(!emptyDiv){
            console.log('[GM] 找到角色槽，點擊進入...');
            slot.click();
            clicked=true;
            status.textContent='🔄 點擊角色進入遊戲...';
            status.style.color='#4ade80';
          }
        }
      });
      
      if(!clicked){
        console.log('[GM] 未找到角色槽，嘗試點擊任何有效角色...');
        // 備用：點擊第一個有角色名的槽
        var firstChar=document.querySelector('.char-slot:not(.empty)');
        if(firstChar){
          firstChar.click();
          clicked=true;
          console.log('[GM] 點擊第一個角色槽...');
        }
      }
    }
    
    window.__gmFarming.reconnectTimer=setTimeout(checkReconnect,window.__gmFarming.reconnectInterval);
  }
  // 延遲啟動檢測
  window.__gmFarming.reconnectTimer=setTimeout(checkReconnect,window.__gmFarming.reconnectInterval);
}

function stopFarming(){
  window.__gmFarming.running=false;
  if(window.__gmFarming.timer){clearTimeout(window.__gmFarming.timer);window.__gmFarming.timer=null;}
  if(window.__gmFarming.reconnectTimer){clearTimeout(window.__gmFarming.reconnectTimer);window.__gmFarming.reconnectTimer=null;}
  window.__gmFarming.returning=false;
  var btn=document.getElementById('__gmp_farm_btn');
  var status=document.getElementById('__gmp_farm_status');
  if(btn){btn.textContent='▶ 開啟腳本';btn.style.background='#0f3460'}
  if(status){status.textContent='已停止';status.style.color='#888'}
}

// Main panel build
function __gmBuildPanel(){
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
    '<div style="margin-bottom:8px;">'+
      '<div style="font-size:10px;color:#888;margin-bottom:3px;">掛機地圖</div>'+
      '<input id="__gmp_farm_search" placeholder="搜尋野外/地監名稱..." '+
        'style="width:100%;padding:5px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:6px;'+
        'color:#aaa;font-size:11px;outline:none;box-sizing:border-box;margin-bottom:4px;display:block;">'+
      '<select id="__gmp_farm_zone" size="6" '+
        'style="width:100%;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;'+
        'color:#fff;font-size:11px;outline:none;box-sizing:border-box;cursor:pointer;padding:2px 4px;">'+
      '</select>'+
    '</div>'+
    // HP row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_hp_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#e94560;width:50px;">HP低於</span>'+
      '<input id="__gmp_farm_hp" type="number" value="20" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 返回大廳</span>'+
    '</div>'+
    // MP row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_mp_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#00d9ff;width:50px;">MP低於</span>'+
      '<input id="__gmp_farm_mp" type="number" value="10" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 返回大廳</span>'+
    '</div>'+
    // Logic operator AND/OR
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_logic_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#ffd700;width:50px;">條件</span>'+
      '<select id="__gmp_farm_logic" style="padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        '<option value="AND">AND (且)</option>'+
        '<option value="OR" selected>OR (或)</option>'+
      '</select>'+
      '<span style="font-size:10px;color:#888;">組合判斷</span>'+
    '</div>'+
    // HP > condition
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_hp_gt_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#4ade80;width:50px;">HP大於</span>'+
      '<input id="__gmp_farm_hp_gt" type="number" value="90" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 傳送掛機</span>'+
    '</div>'+
    // MP > condition
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_mp_gt_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#7bd14a;width:50px;">MP大於</span>'+
      '<input id="__gmp_farm_mp_gt" type="number" value="90" min="1" max="100" style="width:55px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;">% 傳送掛機</span>'+
    '</div>'+
    // Auto reconnect (斷線重連)
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_reconnect" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#ffd700;">🔄 斷線重連</span>'+
      '<input id="__gmp_farm_char_name" type="text" placeholder="角色名稱" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:10px;color:#888;">'+
      '檢測間隔 <input id="__gmp_farm_reconnect_interval" type="number" value="60" min="10" max="300" style="width:50px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;text-align:center;"> 秒'+
    '</div>'+
    // Auto attack
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">'+
      '<input type="checkbox" id="__gmp_farm_atk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:11px;color:#7bd14a;font-weight:bold;">⚔️ 自動攻擊</span>'+
    '</div>'+
    // Status
    '<div id="__gmp_farm_status" style="font-size:10px;color:#888;margin-bottom:6px;text-align:center;">已停止</div>'+
    // Test Reconnect button
    '<button id="__gmp_farm_test_reconnect" style="width:100%;padding:6px;background:#2a2a4a;border:1px solid #ffd700;color:#ffd700;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;margin-bottom:8px;">🧪 測試斷線重連</button>'+
    // Start/Stop button
    '<button id="__gmp_farm_btn" style="width:100%;padding:9px;background:#0f3460;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;">▶ 開啟腳本</button>'+
    '</div>'+
  '</div>';
  document.body.appendChild(p);

  // === Populate farm zone select ===
  var farmSel=document.getElementById('__gmp_farm_zone');
  var farmSearch=document.getElementById('__gmp_farm_search');
  function populateFarmZones(filter){
    var f=(filter||'').toLowerCase();
    farmSel.innerHTML='';
    var allZones=[
      {list:ZONES.wild,label:'-- 野外 --'},
      {list:ZONES.dungeon,label:'-- 地監 --'}
    ];
    allZones.forEach(function(g){
      var opts=g.list.filter(function(z){
        return !f||z.name.toLowerCase().indexOf(f)>-1||(z.sub||'').toLowerCase().indexOf(f)>-1;
      });
      if(!opts.length)return;
      var og=document.createElement('optgroup');
      og.label=g.label;
      opts.forEach(function(z){
        var o=document.createElement('option');
        o.value=z.id;
        o.textContent=z.name+' ('+z.sub+')';
        og.appendChild(o);
      });
      farmSel.appendChild(og);
    });
  }
  populateFarmZones('');
  farmSearch.addEventListener('input',function(){populateFarmZones(this.value)});

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
      ZONES.WORLDBOSS.forEach(function(b){if(!search||b.name.toLowerCase().indexOf(search)>-1)bossList.appendChild(buildBossItem(b))});
      (ZONES.special||[]).forEach(function(z){if(!search||z.name.toLowerCase().indexOf(search)>-1)list.appendChild(buildZoneItem(z))});
    } else {
      (ZONES[tab]||[]).forEach(function(z){if(!search||z.name.toLowerCase().indexOf(search)>-1)list.appendChild(buildZoneItem(z))});
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

  // === Test Reconnect button ===
  document.getElementById('__gmp_farm_test_reconnect').onclick=function(){
    var status=document.getElementById('__gmp_farm_status');
    var charNameInput=document.getElementById('__gmp_farm_char_name');
    var charName=charNameInput.value.trim()||'';
    
    if(!charName){
      status.textContent='❌ 請先輸入角色名稱';
      status.style.color='#e94560';
      return;
    }
    
    status.textContent='🔍 測試中...';
    status.style.color='#ffd700';
    
    // 檢測是否在角色選擇畫面（檢測 #slots 或 .char-slot 是否存在）
    var slotsDiv=document.getElementById('slots');
    var charSlots=document.querySelectorAll('.char-slot');
    var isOnCharSelect=slotsDiv!==null||charSlots.length>0;
    
    console.log('[GM] 測試斷線重連：角色名稱 "'+charName+'"');
    console.log('[GM] 是否在角色選擇畫面：', isOnCharSelect);
    console.log('[GM] 找到', charSlots.length, '個角色槽');
    
    if(isOnCharSelect){
      status.textContent='⚠️ 檢測到角色選擇畫面，嘗試點擊...';
      status.style.color='#fbbf24';
      
      // 嘗試找到包含角色名稱的 .char-slot 並點擊
      var clicked=false;
      charSlots.forEach(function(slot, index){
        console.log('[GM] 角色槽', index, 'HTML:', slot.innerHTML.substring(0, 200));
        if(slot.innerHTML.indexOf(charName)>-1){
          var emptyDiv=slot.querySelector('.empty');
          if(!emptyDiv){
            console.log('[GM] 找到角色槽', index, '，點擊進入...');
            slot.click();
            clicked=true;
            status.textContent='✅ 已點擊角色槽 '+index+'！';
            status.style.color='#4ade80';
          }
        }
      });
      
      if(!clicked){
        status.textContent='❌ 未找到角色 "'+charName+'" 的槽位';
        status.style.color='#e94560';
        console.log('[GM] 未找到角色槽');
      }
    } else {
      status.textContent='✅ 不在角色選擇畫面，游戲正常中';
      status.style.color='#4ade80';
      console.log('[GM] 不在角色選擇畫面，游戲正常');
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

  // === Load saved settings ===
  loadFarmSettings(function(data){
    if(!data)return;
    if(data.farmZone){
      var opt=document.querySelector('#__gmp_farm_zone option[value="'+data.farmZone+'"]');
      if(opt)document.getElementById('__gmp_farm_zone').value=data.farmZone;
    }
    if(data.hpThresh)document.getElementById('__gmp_farm_hp').value=data.hpThresh;
    if(data.mpThresh)document.getElementById('__gmp_farm_mp').value=data.mpThresh;
    document.getElementById('__gmp_farm_hp_chk').checked=data.hpEnabled!==false;
    document.getElementById('__gmp_farm_mp_chk').checked=data.mpEnabled!==false;
    if(data.hpGtThresh)document.getElementById('__gmp_farm_hp_gt').value=data.hpGtThresh;
    if(data.mpGtThresh)document.getElementById('__gmp_farm_mp_gt').value=data.mpGtThresh;
    document.getElementById('__gmp_farm_hp_gt_chk').checked=data.hpGtEnabled||false;
    document.getElementById('__gmp_farm_mp_gt_chk').checked=data.mpGtEnabled||false;
    if(data.logicOp)document.getElementById('__gmp_farm_logic').value=data.logicOp;
    document.getElementById('__gmp_farm_logic_chk').checked=data.logicEnabled!==false;
    document.getElementById('__gmp_farm_atk').checked=data.autoAtk!==false;
    // 新增：載入斷線重連設定
    if(data.charName)document.getElementById('__gmp_farm_char_name').value=data.charName;
    document.getElementById('__gmp_farm_reconnect').checked=data.reconnectEnabled!==false;
    if(data.reconnectInterval)document.getElementById('__gmp_farm_reconnect_interval').value=data.reconnectInterval;
  });

  // === Auto-save on change ===
  var farmInputs=['__gmp_farm_zone','__gmp_farm_hp','__gmp_farm_mp','__gmp_farm_hp_chk','__gmp_farm_mp_chk',
    '__gmp_farm_hp_gt','__gmp_farm_mp_gt','__gmp_farm_hp_gt_chk','__gmp_farm_mp_gt_chk',
    '__gmp_farm_logic','__gmp_farm_logic_chk','__gmp_farm_atk',
    '__gmp_farm_char_name','__gmp_farm_reconnect','__gmp_farm_reconnect_interval'];
  farmInputs.forEach(function(id){
    var el=document.getElementById(id);
    if(el){
      el.addEventListener('change',saveFarmSettings);
      el.addEventListener('input',saveFarmSettings);
    }
  });
}
__gmBuildPanel();
document.addEventListener('__gm_show_panel',function(){__gmBuildPanel()});
console.log('[GM] Monitor injected '+ver);
})();
