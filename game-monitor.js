(function(){
var ver='v4.22';
if(window.__gmInjected){
  console.log('[GM] Already injected ('+ver+')');
  var el=document.getElementById('__gmp_ver');
  if(el)el.textContent=ver;
  return;
}
window.__gmInjected=true;
window.__gmVer=ver;

// 載入進階模組（若尚未載入，透過 content script relay）
// 現在 popup.js 會一次注入兩個腳本，這行僅作為兼容備援
if(!window.__gmAdvanced){
  window.postMessage({type:'GM_LOAD_ADVANCED',src:'advanced-farming.js'},'*');
  console.log('[GM] Requested advanced-farming.js via content script');
}
window.__battleStatus={packets:[]};window.__gmOnlineCount=null;
window.__gmFarming={running:false,timer:null,returning:false,waitTimer:null};
window.__gmLogoutModalVisible=false;
window.__gmLogoutDayOffset=0; // 0=今天, 1=昨天, 2=前天...


// ====== WB Boss Hook ======
window.__wbBossEmitLog=[];
window.__wbSocket=null;
window.lastState=null;  // 初始化全域 lastState
(function(){
  function installSioHook(){
    if(window.__wbSioHooked)return;
    var SP=window.io&&window.io.Socket&&window.io.Socket.prototype;
    if(!SP){setTimeout(installSioHook,300);return;}
    window.__wbSioHooked=true;
    if(!SP.__wbPkt){
      SP.__wbPkt=true;
      var _origPkt=SP.packet;
      SP.packet=function(packet){
        var type=packet&&packet.type;
        if(type===2||type===3){
          var ev=packet.data&&packet.data[0]||null;
          var args=packet.data&&packet.data.slice(1)||[];
          window.__wbBossEmitLog.push({t:Date.now(),dir:'SEND',evt:ev,args:JSON.stringify(args).slice(0,300)});
          console.log('[WB-SEND]',ev,JSON.stringify(args).slice(0,150));
          // Socket 封包即時 log
          window.__gmPacketLog=window.__gmPacketLog||[];
          window.__gmPacketLog.push({t:Date.now(),dir:'SEND',evt:ev,args:JSON.stringify(args).slice(0,300)});
          if(window.__gmPacketLog.length>500)window.__gmPacketLog.shift();
        }
        return _origPkt&&_origPkt.call(this,packet);
      };
    }
    if(!SP.__wbOE){
      SP.__wbOE=true;
      var _oe=SP.onevent;
      SP.onevent=function(p){
        if(!window.__wbSocket)window.__wbSocket=this;
        if(p&&p.data&&p.data[0]){
          var evtName=p.data[0];
          var payload=JSON.stringify(p.data).slice(0,2000);
          window.__sioPackets=window.__sioPackets||[];
          window.__sioPackets.push({t:Date.now(),dir:'EVENT',evt:evtName,args:payload});
          // Socket 封包即時 log
          window.__gmPacketLog=window.__gmPacketLog||[];
          window.__gmPacketLog.push({t:Date.now(),dir:'RECV',evt:evtName,args:payload});
          if(window.__gmPacketLog.length>500)window.__gmPacketLog.shift();
          // 解析 state 事件並更新 window.lastState
          if(evtName==='state'&&p.data[1]){
            window.lastState=p.data[1];
          }
          // 捕捉所有事件 → 世界王快取 + 事件列表
          window.__wbAllEvents=window.__wbAllEvents||[];
          var rec={t:Date.now(),evt:evtName,payload:payload};
          window.__wbAllEvents.push(rec);
          if(window.__wbAllEvents.length>500)window.__wbAllEvents.shift();
          // 被動偵測：事件名含世界王關鍵字，或 state 含 mode:boss，或有 boss:{...}
          var _payloadStr=p.data.length>1?JSON.stringify(p.data[1]):'';
          var _isWbEvtName=/\b(respawn|worldBoss|bossList|world_boss|getBoss|RefreshBoss|bossInfo)\b/i.test(evtName);
          var _isStateBoss=_payloadStr.indexOf('"mode":"boss"')>-1||_payloadStr.indexOf('"mode": "boss"')>-1;
          var _hasBossObj=/"boss"\s*:\s*\{/.test(_payloadStr);
          if(_isWbEvtName||_isStateBoss||_hasBossObj){
            window.__wbWorldBossCache=window.__wbWorldBossCache||{data:null,ts:0};
            window.__wbWorldBossCache.data=p.data;
            window.__wbWorldBossCache.ts=Date.now();
            window.__wbLastEvtName=evtName;
            console.log('[WB] WorldBoss event captured:',evtName,JSON.stringify(p.data[1]).slice(0,200));
            // 更新 UI 元素（被動偵測到就立刻刷新）
            var evtEl=document.getElementById('__gmp_wb_evt_name');
            if(evtEl){evtEl.textContent=evtName;evtEl.style.color='#4ade80';}
            var cntEl=document.getElementById('__gmp_wb_count');
            if(cntEl)cntEl.textContent='1+';
            __wbUpdateWorldBossUI();
            // 通知所有訂閱者
            (window.__wbBossEvtSubscribers||[]).forEach(function(fn){try{fn(evtName,p.data);}catch(e){}});
          }
        }
        if(_oe)_oe.call(this,p);
      };
    }
    console.log('[WB] SIO4 hook ready');
  }
  setTimeout(installSioHook,500);
})();

function __wbSend(action){if(!window.__wbSocket||!window.__wbSocket.emit){setTimeout(function(){if(window.__wbSocket)window.__wbSocket.emit('bossAction',action);},200);return;}try{window.__wbSocket.emit('bossAction',action);console.log('[WB] bossAction:',action);}catch(e){}}
function __wbSendPotion(type){if(!window.__wbSocket)return;try{window.__wbSocket.emit('usePotion',{type:type||'potion_heal'});}catch(e){}}
function __wbCastSkill(id,target){if(!window.__wbSocket)return;try{var p={id:id};if(target)p.target=target;window.__wbSocket.emit('castSkill',p);}catch(e){}}
function __wbSetBossSet(s){if(!window.__wbSocket)return;try{window.__wbSocket.emit('setBossSet',s);}catch(e){}}
function __wbEmit(evt,data){if(!window.__wbSocket||!window.__wbSocket.emit)return;try{window.__wbSocket.emit(evt,data);console.log('[WB-Emit]',evt,JSON.stringify(data).slice(0,200));}catch(e){console.warn('[WB-Emit] failed',e);}}

// ====== World Boss 監控 ======
// 快取：最近一次含世界王資訊的 socket 事件
window.__wbWorldBossCache={data:null,ts:0};
window.__wbBossEvtSubscribers=[];
// 已確認的世界王事件名（由使用者或自動偵測確認後寫入）
window.__wbWorldBossEvtName=null;
// 自動查詢計時器 handle
window.__wbWorldBossTimer=null;
// 訂閱特定世界王事件（用於 UI 即時更新）
function __wbSubscribeWorldBoss(fn){if(window.__wbBossEvtSubscribers.indexOf(fn)<0)window.__wbBossEvtSubscribers.push(fn);}
// 手動查詢世界王（嘗試常見事件名）
function __wbQueryWorldBoss(){
  __wbUpdateWorldBossUI();
  return true;
}
// 自動查詢：每 60 秒執行一次
function __wbStartWorldBossTimer(){
  if(window.__wbWorldBossTimer)clearInterval(window.__wbWorldBossTimer);
  window.__wbWorldBossCountdown=60;
  __wbUpdateWorldBossUI(true);
  window.__wbWorldBossTimer=setInterval(function(){
    window.__wbWorldBossCountdown--;
    var timerEl=document.getElementById('__gmp_wb_timer');
    if(timerEl)timerEl.textContent=window.__wbWorldBossCountdown+'s/60s';
    if(window.__wbWorldBossCountdown<=0){
      window.__wbWorldBossCountdown=60;
      __wbUpdateWorldBossUI(true);
    }
  },1000);
  console.log('[WB-WorldBoss] DOM timer started, countdown=60s');
}
function __wbStopWorldBossTimer(){
  if(window.__wbWorldBossTimer){clearInterval(window.__wbWorldBossTimer);window.__wbWorldBossTimer=null;}
}
function __wbParseWorldBossData(raw){
  if(!raw)return[];
  var arr=[];
  // 嘗試常見包裝格式
  if(Array.isArray(raw))arr=raw;
  else if(raw&&raw.list)arr=raw.list;
  else if(raw&&raw.bosses)arr=raw.bosses;
  else if(raw&&raw.data)arr=Array.isArray(raw.data)?raw.data:[raw.data];
  else if(typeof raw==='object')arr=[raw];
  // 過濾：每項須有 name
  arr=arr.filter(function(it){return it&&(it.name||it.n||it.bossName);});
  // 標準化欄位
  return arr.map(function(it){
    return{
      name:it.name||it.n||it.bossName||it.boss_name||'?',
      lv:it.lv||it.level||it.bossLv||it.boss_level||0,
      hp:it.hp||it.HP||0,
      maxHp:it.maxHp||it.maxHP||it['max-hp']||it.max_hp||0,
      respawn:it.respawn||it.respawnTime||it.respawn_time||it.nextSpawn||it.cd||it.cooldown||null,
      status:it.status||it.state||'unknown',
      index:it.index||it.id||null
    };
  });
}
// 更新世界王 UI（顯示在 BOSS Tab 頂端）
function __wbUpdateWorldBossUI(autoNav){
  var el=document.getElementById('__gmp_wb_list');
  var timerEl=document.getElementById('__gmp_wb_timer');
  var countEl=document.getElementById('__gmp_wb_count');
  if(!el)return;

  if(timerEl){
        if(timerEl&&window.__wbWorldBossCountdown!==undefined){
      timerEl.textContent=window.__wbWorldBossCountdown+'s/60s';
    }  }

  // === 讀取遊戲 DOM ===
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var bossList=[];
  cards.forEach(function(card){
    var bossId=card.getAttribute('data-boss');
    var subEl=document.querySelector('.wb-sub[data-boss="'+bossId+'"]');
    var nameSpan=card.querySelector('.wb-r1>span:first-child');
    var name='?';
    if(nameSpan){
      if(nameSpan.firstChild && nameSpan.firstChild.nodeType===3){
        name=nameSpan.firstChild.textContent.trim().replace(/\s*Lv\..*$/,'');
      }else{
        name=nameSpan.textContent.trim().replace(/\s*Lv\..*$/,'');
      }
    }
    var lvSpan=nameSpan?nameSpan.querySelector('.dim'):null;
    var lv=lvSpan?parseInt((lvSpan.textContent.match(/\d+/)||[0])[0],10)||0:0;
    var subText=subEl?subEl.textContent.trim():'';

    var status='unknown',respawn=null,respawnMin=null;
    if(subText.indexOf('已被擊敗')!==-1||subText.indexOf('已被征服')!==-1){
      status='dead';
      var m=subText.match(/(\d{1,2}):(\d{2})/);
      if(m){
        var h=parseInt(m[1],10),min=parseInt(m[2],10);
        var now=new Date();
        var target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,min,0);
        if(target<=now)target.setDate(target.getDate()+1);
        respawn=Math.round((target-now)/1000);
        respawnMin=Math.ceil(respawn/60);
      }
    } else if(subText.indexOf('存活')!==-1||subText.indexOf('戰鬥中')!==-1||subText.indexOf('HP')!==-1){
      status='alive';
    } else if(subText.indexOf('等待')!==-1){
      status='waiting';
    }

    bossList.push({id:bossId,name:name,lv:lv,hp:status==='alive'?1:0,maxHp:1,respawn:respawn,respawnMin:respawnMin,status:status});
  });

  // === 讀取優先討伐清單 ===
  window.__wbLoadHuntList(function(huntIds){
    if(bossList.length){
      if(countEl)countEl.textContent=bossList.length+' 隻';
      var html=bossList.map(function(b){
        var rsStr=b.respawn!==null?'\u91cd\u751f:'+Math.floor(b.respawn/60)+'m '+String((b.respawn%60)+'s').padStart(3,'0'):(b.status==='alive'?'\u5b58\u6d3b\u4e2d':'--');
        var sc={alive:'#4ade80',dead:'#888',waiting:'#fbbf24',unknown:'#555'};
        var inHunt=huntIds.indexOf(b.id)!==-1;
        var addBtn=inHunt?'<span style="color:#4caf50;font-size:11px;min-width:18px;">\u2713</span>':'<span data-wb-add-hunt="'+b.id+'|'+b.name.replace(/'/g,'')+'|'+b.lv+'" style="color:#4caf50;font-size:14px;cursor:pointer;min-width:18px;text-align:center;">[+]</span>';
        return '<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(233,69,96,0.06);border-radius:5px;margin-bottom:2px;border-left:3px solid '+sc[b.status]+';">'+
          addBtn+
          '<span style="font-size:10px;color:#e94560;min-width:70px;">'+b.name+'</span>'+
          '<span style="font-size:9px;color:#aaa;">Lv.'+b.lv+'</span>'+
          '<div style="flex:1;"></div>'+
          '<span style="font-size:9px;color:'+sc[b.status]+';min-width:70px;">'+rsStr+'</span>'+
        '</div>';
      }).join('');
      el.innerHTML=html;
    } else {
      if(countEl)countEl.textContent='--';
      el.innerHTML='<div style="font-size:10px;color:#888;padding:8px;text-align:center;">\u4e16\u754c\u738b\u5217\u8868\u4e3a\u7a7a<br><span style="font-size:9px;color:#555;">\u8bf7\u5148\u5207\u6362\u5230\u300c\u72e9\u7315\u573a \u2192 \u4e16\u754c\u738b\u300d\u5206\u9875'+ (autoNav?'<br><span style="font-size:9px;color:#ffd700;">\u81ea\u52a8\u5bfc\u822a\u4e2d...</span>':'') +'</span></div>';
    }
    // 同步更新優先討伐清單 UI
    window.__wbUpdateHuntListUI();
  });
  // === 自動導航 ===
  if(autoNav && bossList.length===0){
    try{
      var zoneTab=document.querySelector('div.tab[data-tab="zone"]');
      var wbSub=document.querySelector('div.subtab[data-c="special"]');
      if(zoneTab){zoneTab.click();console.log('[WB] clicked \u72e9\u7315\u5834 tab');}
      if(wbSub){wbSub.click();console.log('[WB] clicked world boss subtab');}
    }catch(e){console.warn('[WB] autoNav error:',e);}
  }
}
// 嘗試自動偵測世界王事件（每 5 秒檢查最近捕獲的事件）
function __wbDetectWorldBossEvt(){
  var evts=window.__wbAllEvents||[];
  var candidates={};
  evts.slice(-100).forEach(function(e){
    if(/respawn|worldBoss|bossList|world_boss|RefreshBoss|getBoss/i.test(e.evt)){
      candidates[e.evt]=(candidates[e.evt]||0)+1;
    }
  });
  var sorted=Object.keys(candidates).sort(function(a,b){return candidates[b]-candidates[a]});
  if(sorted.length){
    console.log('[WB-WorldBoss] detected candidates:',sorted.slice(0,5).map(function(k){return k+' x'+candidates[k];}).join(', '));
    return sorted[0];
  }
  return null;
}
// 初次啟動偵測
setTimeout(function(){
  var detected=__wbDetectWorldBossEvt();
  if(detected){
    window.__wbWorldBossEvtName=detected;
    console.log('[WB-WorldBoss] confirmed event:',detected);
  }
  __wbStartWorldBossTimer();
  // 每 5 秒偵測新事件
  window.__wbWorldBossDetectTimer=setInterval(function(){
    if(!window.__wbWorldBossEvtName){
      var d=__wbDetectWorldBossEvt();
      if(d){window.__wbWorldBossEvtName=d;console.log('[WB-WorldBoss] auto-detected:',d);}
    }
    __wbUpdateWorldBossUI();
  },5000);
},5000);

// ====== Boss Auto ======
window.__wbBossAuto={
    atk:true,atkHpPct:100,atkLogic:'AND',atkOnline:0,
    stop:false,stopHp:30,stopHpEnable:false,stopMp:10,stopMpEnable:false,
    pot:true,potHp:80,
    atkSkill:true,
    heal:true,healHp:70,
    barrier:true,
    bypass:false,
    startHpPct:80,startMpPct:50,
    potStop:false,potStopHp:30
  };
function __wbBossLoop(){if(!window.__wbBossAuto.running)return;var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};var cfg=window.__wbBossAuto;var hpPct=ch.maxHp>0?ch.hp/ch.maxHp:1;try{if(cfg.stop&&hpPct<(cfg.stopHp/100)&&cd.atk<0.05)__wbSend('stop');if(cfg.potStop&&hpPct<(cfg.potStopHp/100)&&cd.atk<0.05)__wbSend('stop');if(cfg.pot&&hpPct<(cfg.potHp/100)&&cd.pot<0.05)__wbSend('pot');if(cfg.atkSkill&&cd.atk<0.05)__wbSend('atk');if(cfg.heal&&hpPct<(cfg.healHp/100)&&cd.heal<0.05)__wbSend('heal');if(cfg.barrier&&cd.barrier<0.05&&boss.barrierHas)__wbSend('barrier');if(cfg.atk&&ls.mode==='bosscombat'){var _bh=boss.hp/boss.maxHp;var _hpC=_bh<(cfg.atkHpPct/100);var _olC=(window.__gmOnlineCount||0)>=cfg.atkOnline;var _atkOk=_hpC;if(cfg.atkLogic==='AND')_atkOk=_hpC&&_olC;else if(cfg.atkLogic==='OR')_atkOk=_hpC||_olC;else if(cfg.atkLogic==='NOT')_atkOk=!_hpC;if(cfg.startHpPct>0&&hpPct<(cfg.startHpPct/100))_atkOk=false;if(cfg.startMpPct>0&&(ch.maxMp>0?ch.mp/ch.maxMp:1)<(cfg.startMpPct/100))_atkOk=false;}if(_atkOk)__wbSend('atk');}catch(e){}window.__wbBossAuto.timer=setTimeout(__wbBossLoop,500);}
function __wbBossAutoStart(){window.__wbBossAuto.running=true;__wbBossLoop();}
function __wbBossAutoStop(){window.__wbBossAuto.running=false;if(window.__wbBossAuto.timer)clearTimeout(window.__wbBossAuto.timer);}

// ====== Cooldown Bypass ======
window.__wbBypassCD=false;
function __wbToggleBypass(on){window.__wbBypassCD=on;if(on&&!window.__wbBypassPatched){window.__wbBypassPatched=true;var _orig=window.updateBossCd;if(_orig){window.updateBossCd=function(){try{_orig.apply(this,arguments);}catch(e){}var keys=['pot','atk','heal','convert','barrier','holybarrier'];keys.forEach(function(k){var b=document.getElementById('bact-'+k);if(b)b.disabled=false;});};}var _origRBP=window.renderBossPanel;if(_origRBP){window.renderBossPanel=function(p){try{_origRBP.apply(this,arguments);}catch(e){_origRBP(p);}setTimeout(function(){document.querySelectorAll('.bact-btn[id]').forEach(function(b){var k=b.dataset&&b.dataset.k;if(k&&!b.__wbBypass){b.__wbBypass=true;b.addEventListener('click',function(){__wbSend(k);b.disabled=false;});}});},50);};}}console.log('[WB] Bypass:',on?'ON':'OFF');}



// ====== Logout History Modal ======
function __gmOpenLogoutHistory(){
  if(window.__gmLogoutModalVisible)return;
  window.__gmLogoutModalVisible=true;
  window.__gmLogoutDayOffset=0;
  var modal=document.createElement('div');
  modal.id='__gmp_logout_modal';
  modal.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Consolas,monospace;';
  modal.innerHTML=
    '<div style="background:#0f0f23;border:2px solid #4ade80;border-radius:10px;width:520px;max-height:80vh;display:flex;flex-direction:column;color:#fff;">'+
      '<div id="__gmp_logout_header" style="padding:12px 16px;border-bottom:1px solid #0f3460;display:flex;justify-content:space-between;align-items:center;">'+
        '<div>'+
          '<div style="font-size:14px;font-weight:bold;color:#4ade80;">📜 被登出歷史記錄</div>'+
          '<div id="__gmp_logout_subtitle" style="font-size:10px;color:#888;margin-top:2px;">--</div>'+
        '</div>'+
        '<button id="__gmp_logout_close" style="background:#e94560;border:none;color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;">×</button>'+
      '</div>'+
      '<div style="padding:8px 12px;background:#1a1a2e;display:flex;gap:6px;align-items:center;border-bottom:1px solid #0f3460;">'+
        '<button id="__gmp_logout_prev_day" style="padding:4px 8px;background:#0f3460;border:1px solid #00d9ff;border-radius:4px;color:#00d9ff;font-size:10px;cursor:pointer;">◀ 前一天</button>'+
        '<span id="__gmp_logout_current_day" style="flex:1;text-align:center;font-size:11px;color:#aaa;font-weight:bold;">--</span>'+
        '<button id="__gmp_logout_next_day" style="padding:4px 8px;background:#0f3460;border:1px solid #00d9ff;border-radius:4px;color:#00d9ff;font-size:10px;cursor:pointer;">後一天 ▶</button>'+
      '</div>'+
      '<div id="__gmp_logout_list" style="padding:12px 16px;overflow-y:auto;flex:1;font-size:11px;"></div>'+
      '<div style="padding:10px 12px;border-top:1px solid #0f3460;display:flex;gap:6px;align-items:center;">'+
        '<input type="date" id="__gmp_logout_date" style="padding:4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        '<button id="__gmp_logout_clear_before" style="padding:5px 10px;background:#fbbf24;border:none;color:#0f0f23;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">🗑️ 清除選定及之前</button>'+
        '<button id="__gmp_logout_clear_all" style="padding:5px 10px;background:#e94560;border:none;color:#fff;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">⚠️ 全部清除</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  
  document.getElementById('__gmp_logout_close').onclick=__gmCloseLogoutHistory;
  document.getElementById('__gmp_logout_prev_day').onclick=function(){
    window.__gmLogoutDayOffset++;
    __gmRenderLogoutList();
  };
  document.getElementById('__gmp_logout_next_day').onclick=function(){
    if(window.__gmLogoutDayOffset>0){
      window.__gmLogoutDayOffset--;
      __gmRenderLogoutList();
    }
  };
  document.getElementById('__gmp_logout_clear_before').onclick=function(){
    var dateStr=document.getElementById('__gmp_logout_date').value;
    if(!dateStr){alert('請選擇日期');return;}
    var d=new Date(dateStr+'T00:00:00');
    var nextDay=new Date(d.getTime()+86400000);
    if(!confirm('確定要清除 '+d.toLocaleDateString()+' (含) 之前的所有記錄？'))return;
    LogoutDB.clearBefore(nextDay).then(function(n){
      alert('已清除 '+n+' 筆記錄');
      __gmRenderLogoutList();
    }).catch(function(e){alert('清除失敗：'+e.message)});
  };
  document.getElementById('__gmp_logout_clear_all').onclick=function(){
    if(!confirm('⚠️ 確定要清除所有歷史記錄？此動作無法復原。'))return;
    LogoutDB.clearAll().then(function(){
      alert('已清除所有記錄');
      __gmRenderLogoutList();
    }).catch(function(e){alert('清除失敗：'+e.message)});
  };
  modal.onclick=function(e){if(e.target===modal)__gmCloseLogoutHistory()};
  
  __gmRenderLogoutList();
}

function __gmCloseLogoutHistory(){
  var m=document.getElementById('__gmp_logout_modal');
  if(m)m.remove();
  window.__gmLogoutModalVisible=false;
}

function __gmRenderLogoutList(){
  var offset=window.__gmLogoutDayOffset||0;
  var dayLabel;
  var now=new Date();
  var base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  base.setDate(base.getDate()-offset);
  if(offset===0)dayLabel='今天';
  else if(offset===1)dayLabel='昨天';
  else if(offset===2)dayLabel='前天';
  else dayLabel='前 '+offset+' 天';
  dayLabel+=' ('+base.toLocaleDateString()+')';
  
  var subtitle='顯示 '+dayLabel+' 的記錄';
  var subEl=document.getElementById('__gmp_logout_subtitle');
  if(subEl)subEl.textContent=subtitle;
  var dayEl=document.getElementById('__gmp_logout_current_day');
  if(dayEl)dayEl.textContent=dayLabel;
  var prevBtn=document.getElementById('__gmp_logout_prev_day');
  if(prevBtn)prevBtn.disabled=false;
  var nextBtn=document.getElementById('__gmp_logout_next_day');
  if(nextBtn)nextBtn.disabled=(offset===0);
  
  var listEl=document.getElementById('__gmp_logout_list');
  if(!listEl)return;
  listEl.innerHTML='<div style="text-align:center;color:#888;padding:20px;">載入中...</div>';
  
  LogoutDB.getByDayOffset(offset).then(function(records){
    LogoutDB.count().then(function(total){
      var subtitle2='共 '+records.length+' 筆（總 '+total+' 筆）';
      if(subEl)subEl.textContent=subtitle2;
      if(records.length===0){
        listEl.innerHTML='<div style="text-align:center;color:#666;padding:30px;">'+dayLabel+' 沒有記錄</div>';
        return;
      }
      var html='';
      records.forEach(function(r,i){
        var d=new Date(r.ts);
        var timeStr=d.toLocaleTimeString();
        var dateStr=d.toLocaleDateString();
        var color=i===0?'#4ade80':'#aaa';
        html+='<div style="padding:6px 8px;margin-bottom:4px;background:#1a1a2e;border-left:3px solid '+color+';border-radius:4px;">';
        html+='<div style="display:flex;justify-content:space-between;align-items:center;">';
        html+='<span style="color:'+color+';font-weight:bold;">#'+(total-i)+' '+dateStr+' '+timeStr+'</span>';
        html+='<span style="color:#666;font-size:10px;">id='+r.id+'</span>';
        html+='</div>';
        if(r.mode)html+='<div style="color:#888;font-size:10px;margin-top:2px;">角色: '+r.mode+'</div>';
        html+='</div>';
      });
      listEl.innerHTML=html;
    });
  }).catch(function(e){
    listEl.innerHTML='<div style="text-align:center;color:#e94560;padding:20px;">載入失敗: '+e.message+'</div>';
  });
}


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
    charName: document.getElementById('__gmp_farm_char_name').value||'',
    reconnectEnabled: document.getElementById('__gmp_farm_reconnect').checked,
    reconnectInterval: parseInt(document.getElementById('__gmp_farm_reconnect_interval').value)||60,
    charSlot: parseInt(document.getElementById('__gmp_farm_char_slot').value)||0,
    hpAction: document.getElementById('__gmp_farm_hp_action')?document.getElementById('__gmp_farm_hp_action').value:'selectChar',
    mpAction: document.getElementById('__gmp_farm_mp_action')?document.getElementById('__gmp_farm_mp_action').value:'selectChar',
    specifyTarget: document.getElementById('__gmp_farm_specify_target')?document.getElementById('__gmp_farm_specify_target').checked:false,
    targetIndex: document.getElementById('__gmp_farm_target_index')?parseInt(document.getElementById('__gmp_farm_target_index').value)||1:1,
    attackAll: document.getElementById('__gmp_farm_attack_all')?document.getElementById('__gmp_farm_attack_all').checked:false,
    teleportDelayMin: parseFloat(document.getElementById('__gmp_farm_teleport_delay_min')?document.getElementById('__gmp_farm_teleport_delay_min').value:'0')||0,
    teleportDelayMax: parseFloat(document.getElementById('__gmp_farm_teleport_delay_max')?document.getElementById('__gmp_farm_teleport_delay_max').value:'0')||0
  };
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

// Hook WebSocket send (with close-state protection)
var origSend=WebSocket.prototype.send;
WebSocket.prototype.send=function(data){
  try {
    // Only intercept if WS is open
    if(this.readyState===WebSocket.OPEN){
      window.__battleStatus.packets.push({type:'send',data:data});
      window.__ws=this;
      return origSend.call(this,data);
    } else {
      // WS not open, just pass through without logging
      return origSend.call(this,data);
    }
  } catch(e) {
    console.log('[GM] WS send error (readyState='+this.readyState+'):',e.message);
    return;
  }
};

// Auto-clear window.__ws when WS closes
(function(){
  var origWSClose = WebSocket.prototype.close;
  WebSocket.prototype.close = function(){
    if(window.__ws === this) {
      console.log('[GM] WS closed, clearing socket ref');
      window.__ws = null;
    }
    return origWSClose.apply(this, arguments);
  };
})();

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
    {id:'twilight_mt',name:'黃昏山脈',sub:'建議 Lv.55'},
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
  try {
    if(window.__wbSocket && window.__wbSocket.connected){
      window.__wbSocket.emit('setZone', zoneId);
      console.log('[GM] Teleport (SIO):', zoneId);
      return;
    }
    // Fallback: use raw WebSocket if SIO not available
    if(window.__ws && window.__ws.readyState===WebSocket.OPEN){
      window.__ws.send('42["setZone", "'+zoneId+'"]');
      console.log('[GM] Teleport (WS):', zoneId);
      return;
    }
    console.log('[GM] Cannot teleport: socket not open (readyState='+(window.__ws?window.__ws.readyState:'null')+')');
  } catch(e) {
    console.log('[GM] Teleport error:', e.message);
  }
}

function sendCmd(cmd){
  try {
    if(window.__wbSocket && window.__wbSocket.connected){
      window.__wbSocket.emit(cmd);
      console.log('[GM] Cmd (SIO):', cmd);
      return;
    }
    if(window.__ws && window.__ws.readyState===WebSocket.OPEN){
      window.__ws.send('42["'+cmd+'"]');
      console.log('[GM] Cmd (WS):', cmd);
      return;
    }
    console.log('[GM] Cannot send cmd: socket not open');
  } catch(e) {
    console.log('[GM] Cmd error:', e.message);
  }
}

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
  // 若角色名稱為空，自動從遊戲 DOM 讀取 id="t-name" 填入
  if(!charNameInput.value.trim()){
    var tname=document.getElementById('t-name');
    if(tname){charNameInput.value=tname.textContent.trim();}
  }
  var reconnectIntervalInput=document.getElementById('__gmp_farm_reconnect_interval');
  var charSlotSelect=document.getElementById('__gmp_farm_char_slot');
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
  var hpAction=document.getElementById('__gmp_farm_hp_action')?document.getElementById('__gmp_farm_hp_action').value:'selectChar';
  var mpAction=document.getElementById('__gmp_farm_mp_action')?document.getElementById('__gmp_farm_mp_action').value:'selectChar';
  var logicOp=logicSelect.value;
  var logicEnabled=logicCheck.checked;
  var autoAtk=atkCheck.checked;
  var reconnectEnabled=reconnectCheck.checked;
  var charName=charNameInput.value.trim()||'';
  var reconnectInterval=parseInt(reconnectIntervalInput.value)||60;
  var charSlot=parseInt(charSlotSelect.value)||0;

  if(!farmZone){alert('請先選擇掛機地圖！');return;}

  window.__gmFarming={running:true,timer:null,returning:false,inTown:false,reconnectTimer:null,logoutCount:0,lastLogoutTime:null,__firstAttackSent:false,__lastAttackTime:null};
  window.__gmFarming.reconnectEnabled=reconnectEnabled;
  window.__gmFarming.charName=charName;
  window.__gmFarming.reconnectInterval=reconnectInterval*1000;
  window.__gmFarming.charSlot=charSlot;
  window.__gmFarming.__lastLogoutFlag=false;
  window.__gmFarming.hpAction=hpAction;
  window.__gmFarming.mpAction=mpAction;
  btn.textContent='■ 停止腳本';
  btn.style.background='#e94560';
  status.textContent='傳送至掛機地圖...';
  status.style.color='#fbbf24';

  // Immediately teleport to farm zone
  sendZone(farmZone);

  function loop(){
    if(!window.__gmFarming.running)return;
    var d=window.lastState;
    if(!d||!d.char){
      gmLog("[GM] loop: no lastState yet");
      window.__gmFarming.timer=setTimeout(loop,1000);
      return;
    }
    // 進階規則評估（每次 loop 都會執行，需有完整 state）
    if(window.__gmAdvanced&&window.__gmAdvanced.tick){
      try{window.__gmAdvanced.tick(d)}catch(e){}
    }
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

      try{

      // Smart attack: send once on zone enter, then every 10s check monsters
      if(autoAtk&&!window.__gmFarming.returning&&!isInTown&&zoneId===farmZone){
        // First attack: send immediately when entering combat zone
        if(!window.__gmFarming.__firstAttackSent){
          sendCmd('attack');
          window.__gmFarming.__firstAttackSent=true;
          window.__gmFarming.__lastAttackTime=Date.now();
          status.textContent='⚔️ 首次攻擊...';
          console.log('[GM] First attack sent');
        }
        // Periodic check: every 10s, check if monsters exist
        else if(window.__gmFarming.__lastAttackTime){
          var elapsed=(Date.now()-window.__gmFarming.__lastAttackTime)/1000;
          if(elapsed>=10){
            var monsters=d.monsters||[];
            var hasActiveMonster=monsters.some(function(m){return m&&m.hp>0;});
            if(!hasActiveMonster){
              sendCmd('attack');
              window.__gmFarming.__lastAttackTime=Date.now();
              status.textContent='⚔️ 無怪物，重新攻擊...';
              console.log('[GM] Re-attack: no active monsters after 10s');
            } else {
              console.log('[GM] Monsters active, skip attack');
            }
          }
        }
      }

      // 指定目標 + 攻擊全部
      var elSpecify=document.getElementById('__gmp_farm_specify_target');
      var elTargetIdx=document.getElementById('__gmp_farm_target_index');
      var elAttackAll=document.getElementById('__gmp_farm_attack_all');
      var specify=elSpecify?elSpecify.checked:false;
      var tgtIdx=elTargetIdx?parseInt(elTargetIdx.value)||1:1;
      var atkAll=elAttackAll?elAttackAll.checked:false;
      // 指定目標：每5秒 send setTarget
      if(specify&&window.__wbSocket&&window.__wbSocket.connected){
        if(!window.__gmFarming.__lastSetTarget||(Date.now()-window.__gmFarming.__lastSetTarget)>=5000){
          try{window.__wbSocket.emit('setTarget',tgtIdx);console.log('[GM] [WB-SEND] setTarget ['+tgtIdx+']')}catch(e){}
          window.__gmFarming.__lastSetTarget=Date.now();
        }
      }
      // 攻擊全部：對所有 HP>0 的怪物 send setTarget（每5秒）
      if(atkAll&&d.monsters&&d.monsters.length>0&&
         (!window.__gmFarming.__lastAttackAll||(Date.now()-window.__gmFarming.__lastAttackAll)>=5000)){
        for(var ai=0;ai<d.monsters.length;ai++){
          if(d.monsters[ai]&&d.monsters[ai].hp>0){
            try{window.__wbSocket.emit('setTarget',ai)}catch(e){}
          }
        }
        console.log('[GM] [WB-SEND] setTarget (攻擊全部) → '+d.monsters.length+' targets');
        window.__gmFarming.__lastAttackAll=Date.now();
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

      // Feature 1: HP low → trigger action (selectChar or toLobby)
      if(hpLow&&mode!=='boss'&&mode!=='bosscombat'){
        try{
          if(hpAction==='toLobby'){
            sendCmd('toLobby');
            console.log('[GM] HP low, sent toLobby');
            status.textContent='HP不足，回大廳...';
          } else {
            if(window.__wbSocket && window.__wbSocket.connected){
              window.__wbSocket.emit('selectChar', window.__gmFarming.charSlot||0);
            } else if(window.__ws && window.__ws.readyState===WebSocket.OPEN){
              window.__ws.send('42["selectChar",'+(window.__gmFarming.charSlot||0)+']');
            }
            console.log('[GM] HP low, sent selectChar');
            status.textContent='HP不足，重新載入角色...';
          }
        }catch(e){console.log('[GM] HP trigger error:', e.message);}
        status.style.color='#fbbf24';
      }

      // Feature 1b: MP low → trigger action (selectChar or toLobby)
      if(mpLow&&mode!=='boss'&&mode!=='bosscombat'){
        try{
          if(mpAction==='toLobby'){
            sendCmd('toLobby');
            console.log('[GM] MP low, sent toLobby');
            status.textContent='MP不足，回大廳...';
          } else {
            if(window.__wbSocket && window.__wbSocket.connected){
              window.__wbSocket.emit('selectChar', window.__gmFarming.charSlot||0);
            } else if(window.__ws && window.__ws.readyState===WebSocket.OPEN){
              window.__ws.send('42["selectChar",'+(window.__gmFarming.charSlot||0)+']');
            }
            console.log('[GM] MP low, sent selectChar');
            status.textContent='MP不足，重新載入角色...';
          }
        }catch(e){console.log('[GM] MP trigger error:', e.message);}
        status.style.color='#fbbf24';
      }

      // Feature 2: Auto teleport to farm when HP/MP > threshold (in town)
      // Triggered when in town AND HP/MP above thresholds
      if(isInTown&&!window.__gmFarming._teleportScheduled){
        var hpGtOk=hpGtEnabled&&hpPct>(hpGtThresh/100);
        var mpGtOk=mpGtEnabled&&mpPct>(mpGtThresh/100);
        console.log('[GM] In town, HP:',Math.round(hpPct*100)+'%, MP:',Math.round(mpPct*100)+'%, hpGtOk:',hpGtOk,'mpGtOk:',mpGtOk);
        if(hpGtOk||mpGtOk){
          var tpdMinEl=document.getElementById('__gmp_farm_teleport_delay_min');
          var tpdMaxEl=document.getElementById('__gmp_farm_teleport_delay_max');
          var delayMin=parseFloat(tpdMinEl?tpdMinEl.value:'0')||0;
          var delayMax=parseFloat(tpdMaxEl?tpdMaxEl.value:'0')||0;
          if(delayMax<delayMin)delayMax=delayMin;
          var delayS=delayMin+(delayMax>delayMin?Math.random()*(delayMax-delayMin):0);
          var delayMs=Math.floor(delayS*1000);
          if(delayMs>0){
            console.log('[GM] Teleport scheduled in '+(delayMs/1000).toFixed(1)+'s (random '+delayMin.toFixed(1)+'~'+delayMax.toFixed(1)+'s)');
            status.textContent='HP/MP充足，'+delayMs/1000+'s後傳送掛機...';
            status.style.color='#ffd700';
            window.__gmFarming._teleportScheduled=true;
            window.__gmFarming._teleportTimer=setTimeout(function(){
              console.log('[GM] Teleporting to farm zone:',farmZone);
              sendZone(farmZone);
              window.__gmFarming._teleportScheduled=false;
              window.__gmFarming._teleportTimer=null;
              status.textContent='HP/MP充足，傳送掛機...';
              status.style.color='#4ade80';
            },delayMs);
          }else{
            console.log('[GM] Teleporting to farm zone:',farmZone);
            sendZone(farmZone);
            status.textContent='HP/MP充足，傳送掛機...';
            status.style.color='#4ade80';
          }
          window.__gmFarming.returning=false;
        }
      }
      
      // Reset returning state when left town (entered farm zone)
      if(!isInTown&&window.__gmFarming.returning){
        window.__gmFarming.returning=false;
      }
      // Reset first attack flag when entering town (so next zone enter triggers attack)
      if(isInTown){
        window.__gmFarming.__firstAttackSent=false;
        window.__gmFarming.__lastAttackTime=null;
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
      if(!window.__gmFarming.__lastLogoutFlag){
        window.__gmFarming.logoutCount++;
        window.__gmFarming.lastLogoutTime=Date.now();
        window.__gmFarming.__lastLogoutFlag=true;
        updateLogoutUI();
        // 寫入登出記錄 (chrome.storage.local)
        if(window.LogoutDB){
          LogoutDB.add(Date.now(),window.__gmFarming.charName||'').then(function(){
            console.log('[GM] 登出事件已記錄');
          }).catch(function(e){
            console.warn('[GM] 登出記錄寫入失敗:',e);
          });
        }
        var lastTime=new Date().toLocaleTimeString();
        console.log('[GM] 被登出 #'+window.__gmFarming.logoutCount+' @ '+lastTime);
      }
      status.textContent='⚠️ 斷線檢測 #'+window.__gmFarming.logoutCount+'，嘗試重連...';
      status.style.color='#fbbf24';
      console.log('[GM] 斷線檢測：在角色選擇畫面，嘗試點擊角色槽...');
      
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
    } else {
      if(window.__gmFarming.__lastLogoutFlag){
        window.__gmFarming.__lastLogoutFlag=false;
        console.log('[GM] 已離開角色選擇畫面');
      }
    }
    
    window.__gmFarming.reconnectTimer=setTimeout(checkReconnect,window.__gmFarming.reconnectInterval);
  }
  // 延遲啟動檢測
  window.__gmFarming.reconnectTimer=setTimeout(checkReconnect,window.__gmFarming.reconnectInterval);
}

// 更新被登出計數器 UI
function updateLogoutUI(){
  var el=document.getElementById('__gmp_farm_logout_count');
  if(!el)return;
  var cnt=(window.__gmFarming&&window.__gmFarming.logoutCount)||0;
  el.textContent=cnt;
  if(cnt===0){el.style.color='#4ade80';}
  else if(cnt<3){el.style.color='#fbbf24';}
  else{el.style.color='#e94560';}
  var elTime=document.getElementById('__gmp_farm_logout_time');
  if(elTime){
    if(window.__gmFarming&&window.__gmFarming.lastLogoutTime){
      elTime.textContent='最後: '+new Date(window.__gmFarming.lastLogoutTime).toLocaleTimeString();
    } else {
      elTime.textContent='尚未被登出';
    }
  }
}
// 初始化顯示
setTimeout(updateLogoutUI,500);
  setTimeout(function(){
    if(window.LogoutDB){
      LogoutDB.getToday().then(function(records){
        if(records.length>0){
          var el=document.getElementById('__gmp_farm_logout_count');
          if(el){
            el.textContent=records.length;
            el.style.color=records.length<3?'#fbbf24':'#e94560';
          }
        }
      }).catch(function(){});
    }
  },800);

function stopFarming(){
  window.__gmFarming.running=false;
  if(window.__gmFarming.timer){clearTimeout(window.__gmFarming.timer);window.__gmFarming.timer=null;}
  if(window.__gmFarming.reconnectTimer){clearTimeout(window.__gmFarming.reconnectTimer);window.__gmFarming.reconnectTimer=null;}
  if(window.__gmFarming._teleportTimer){clearTimeout(window.__gmFarming._teleportTimer);window.__gmFarming._teleportTimer=null;}
  window.__gmFarming._teleportScheduled=false;
  window.__gmFarming.returning=false;
  var btn=document.getElementById('__gmp_farm_btn');
  var status=document.getElementById('__gmp_farm_status');
  if(btn){btn.textContent='▶ 開啟腳本';btn.style.background='#0f3460'}
  if(status){status.textContent='已停止';status.style.color='#888'}
}
// Export to window for cross-IIFE access (cron mode in wb-boss.js)
window.startFarming=startFarming;
window.stopFarming=stopFarming;

// Main panel build
function __gmBuildPanel(){
  var old=document.getElementById('__gmp');if(old)old.remove();
  var isExpanded=true;var zoom=1;
  var activeTab='game';
  var activeZoneTab='town';
  var p=document.createElement('div');p.id='__gmp';
  Object.assign(p.style,{position:'fixed',top:'10px',right:'10px',width:'450px',height:'650px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',border:'2px solid #0f3460',borderRadius:'12px',padding:'12px',fontFamily:'Segoe UI',color:'#fff',zIndex:'999999',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',cursor:'move',overflowY:'auto'});

  p.innerHTML=
  '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #0f3460;">'+
  '<div style="display:flex;align-items:center;gap:6px;">'+
    '<button id="__gmp_tab_game" style="padding:5px 9px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">狀態</button>'+
    '<button id="__gmp_tab_farm" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">掛機</button>'+
    '<button id="__gmp_tab_boss" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">👑BOSS</button>'+
    '<button id="__gmp_tab_friend" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">🔍 好友</button>'+
    '<div style="position:relative;display:inline-block;">'+
      '<button id="__gmp_tab_more_btn" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:14px;line-height:1;" title="更多">⋮</button>'+
      '<div id="__gmp_tab_more_menu" style="display:none;position:absolute;top:100%;right:0;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;padding:4px 0;z-index:100;min-width:100px;box-shadow:0 4px 12px rgba(0,0,0,0.5);">'+
        '<button id="__gmp_tab_zone" style="display:block;width:100%;padding:6px 12px;background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;text-align:left;">🗺️ 地圖</button>'+
        '<button id="__gmp_tab_monitor" style="display:block;width:100%;padding:6px 12px;background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;text-align:left;">📡 監控</button>'+
        '<button id="__gmp_tab_skill" style="display:block;width:100%;padding:6px 12px;background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;text-align:left;">⚡ 技能</button>'+
        '<button id="__gmp_tab_status" style="display:block;width:100%;padding:6px 12px;background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;text-align:left;">📊 狀態</button>'+
        '<button id="__gmp_tab_other" style="display:block;width:100%;padding:6px 12px;background:transparent;border:none;color:#aaa;cursor:pointer;font-size:11px;text-align:left;">🔧 其他</button>'+
      '</div>'+
    '</div>'+
    '<span id="__gmp_ver" style="font-size:10px;color:#4ade80;font-weight:bold;">'+ver+'</span>'+
  '</div>'+
  '<div style="display:flex;gap:3px;">'+
    '<button id="__gmp_expand" style="background:#0f3460;border:none;color:#fff;width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:12px;">▼</button>'+
    '<button id="__gmp_zoom_in" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">+</button>'+
    '<button id="__gmp_zoom_out" style="background:#333;border:none;color:#fff;width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:12px;">-</button>'+
    '<button id="__gmp_close" style="background:#e94560;border:none;color:#fff;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:12px;">X</button>'+
'</div>'+
'</div>'+

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
    // === BOSS TAB ===
    '<div id="__gmp_tab_content_boss" style="display:none;">'+
    // ★ 記錄按鈕列（置頂）
    '<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">'+
    '<input type="checkbox" id="__gmp_boss_auto_loot" style="width:13px;height:13px;cursor:pointer;">'+
    '<label for="__gmp_boss_auto_loot" style="font-size:10px;color:#fbbf24;cursor:pointer;margin-right:4px;">\uD83D\uDCB0</label>'+
    '<button id="__gmp_boss_history_btn" style="flex:1;padding:5px;background:#1a1a3e;border:1px solid #0f3460;color:#86c5ff;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;">\uD83D\uDCCB BOSS \u5386\u53f2\u8bb0\u5f55</button>'+
    '<button id="__gmp_boss_loot_btn" style="flex:1;padding:5px;background:#1a1a1a;border:1px solid #6b4226;color:#fbbf24;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;">\uD83D\uDCB0 \u6389\u843d\u8A18\u9304</button>'+
    '</div>'+
    // === 當前 BOSS 戰鬥 ===
    // === BOSS 自動開關 ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;">'+
'<input type="checkbox" id="__gmp_boss_auto_enable" style="width:16px;height:16px;cursor:pointer;">'+
'<label for="__gmp_boss_auto_enable" style="font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;">\u2694\uFE0F 自動戰鬥</label>'+
'<span id="__gmp_boss_auto_status_short" style="font-size:10px;color:#888;">停止中</span>'+
'<div style="flex:1;"></div>'+
'<button id="__gmp_boss_auto_config_btn" style="padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;">\u2699 進階設定</button>'+
'</div>'+
'<div style="background:rgba(255,255,255,0.06);padding:8px;border-radius:6px;margin-bottom:8px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">'+
        '<span id="__gmp_boss_name" style="font-weight:bold;color:#e94560;font-size:12px;">--</span>'+
        '<span id="__gmp_boss_lv" style="font-size:11px;color:#aaa;"></span>'+
      '</div>'+
      '<div style="margin-bottom:4px;">'+
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:#888;margin-bottom:2px;">'+
          '<span>BOSS HP</span><span id="__gmp_boss_hp_text" style="color:#e94560;">--/--</span>'+
        '</div>'+
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);border-radius:6px;">'+
'<input type="checkbox" id="__gmp_boss_auto_script_enable" style="width:16px;height:16px;cursor:pointer;">'+
'<label for="__gmp_boss_auto_script_enable" style="font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;">\uD83C\uDFAF 自動進入世界王</label>'+
'<span id="__gmp_boss_script_status" style="font-size:9px;color:#888;margin-left:4px;">\u00B7 閒置中</span>'+
'<select id="__gmp_boss_script_mode" style="background:#1a3a1a;color:#fbbf24;border:1px solid #4ade80;border-radius:4px;padding:1px 3px;font-size:9px;margin-left:4px;cursor:pointer;"><option value="cron">定時模式</option><option value="scheduled">智能模式</option><option value="realtime">即時模式</option></select><button id="__gmp_debug_export_btn" style="margin-left:auto;padding:2px 8px;background:#1a1a3a;border:1px solid #ffd700;color:#ffd700;border-radius:3px;cursor:pointer;font-size:9px;" title="匯出 Debug Log 到 Console (F12)" data-wb-action="exportDebug">📋 匯出Log</button>'+
'</div>'+
'<div id="__gmp_cron_config" style="display:none;padding:4px 8px;background:rgba(255,215,0,0.06);border-radius:4px;margin-bottom:4px;font-size:10px;color:#ffd700;">'+
  '<span>每整點 </span><input id="__gmp_cron_start_min" type="number" value="0" min="0" max="59" style="width:36px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:3px;color:#fff;font-size:10px;outline:none;text-align:center;">'+
  '<span> 分開始偵測BOSS & 戰鬥， </span><input id="__gmp_cron_stop_min" type="number" value="2" min="0" max="59" style="width:36px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:3px;color:#fff;font-size:10px;outline:none;text-align:center;">'+
  '<span> 分停止並恢復掛機</span>'+
  '<label style="margin-left:8px;cursor:pointer;font-size:10px;color:#ffd700;"><input type="checkbox" id="__gmp_cron_quick_enter" checked style="width:12px;height:12px;vertical-align:middle;margin-right:2px;">快速進入</label>'+
  '<select id="__gmp_cron_script_ver" style="margin-left:6px;padding:1px 3px;background:#1a1a3a;color:#4ade80;border:1px solid #0f3460;border-radius:3px;font-size:9px;cursor:pointer;"><option value="1">腳本1</option><option value="2">腳本2</option><option value="3">腳本3</option><option value="4">腳本4</option><option value="5">腳本5</option><option value="6">腳本6</option><option value="7">腳本7</option><option value="8">腳本8</option><option value="9">腳本9</option><option value="10">腳本10</option></select>'+
'</div>'+
'<div style="display:flex;align-items:center;gap:2px;margin-top:4px;margin-bottom:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_reenter" style="width:13px;height:13px;cursor:pointer;">'+
'<label for="__gmp_boss_auto_reenter" style="font-size:11px;color:#86c5ff;cursor:pointer;">\u2620 \u6b7b\u4ea1\u81ea\u52a8\u56de\u5927\u5385\u91cd\u8fdb\u672c\u6b21\u4e16\u754c\u738b</label>'+
'</div>'+    // === Socket 封包即時 Log（摺疊區塊） ===
    '<div id="__gmp_packet_log_section" style="margin-bottom:4px;">'+
      '<div id="__gmp_packet_log_toggle" style="display:flex;justify-content:space-between;align-items:center;padding:3px 8px;background:rgba(0,150,255,0.08);border-radius:4px;cursor:pointer;user-select:none;font-size:10px;color:#64b5f6;">'+
        '<span>&#x1F4E1; Socket&#x5c01;&#x5305; <span id="__gmp_packet_log_count" style="color:#888;">(0)</span></span>'+
        '<div style="display:flex;gap:8px;align-items:center;">'+
          '<label style="cursor:pointer;font-size:9px;color:#888;"><input type="checkbox" id="__gmp_pkt_send_chk" checked style="width:11px;height:11px;vertical-align:middle;margin-right:2px;">&#x50B3;&#x9001;</label>'+
          '<label style="cursor:pointer;font-size:9px;color:#888;"><input type="checkbox" id="__gmp_pkt_recv_chk" checked style="width:11px;height:11px;vertical-align:middle;margin-right:2px;">&#x63A5;&#x6536;</label>'+
          '<span id="__gmp_packet_log_arrow" style="font-size:10px;">&#x25B6;</span>'+
        '</div>'+
      '</div>'+
      '<div id="__gmp_packet_log_body" style="display:none;max-height:250px;overflow-y:auto;padding:4px 6px;background:rgba(0,0,0,0.3);border-radius:0 0 4px 4px;font-family:Consolas,monospace;">'+
        '<div id="__gmp_packet_log_list" style="font-size:9px;color:#aaa;line-height:1.45;word-break:break-all;"></div>'+
        '<div style="display:flex;gap:4px;margin-top:4px;">'+
          '<button id="__gmp_packet_log_clear" style="padding:1px 8px;background:#3a1a1a;border:1px solid #e94560;color:#e94560;border-radius:3px;cursor:pointer;font-size:9px;">&#x6E05;&#x7A7A;</button>'+
          '<button id="__gmp_packet_log_pause" style="padding:1px 8px;background:#2a2a4a;border:1px solid #64b5f6;color:#64b5f6;border-radius:3px;cursor:pointer;font-size:9px;">&#x66AB;&#x505C;</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    // === 定時模式 BOSS 紀錄（摺疊區塊） ===
    '<div id="__gmp_cron_log_section" style="display:none;margin-bottom:4px;">'+
      '<div id="__gmp_cron_log_toggle" style="display:flex;justify-content:space-between;align-items:center;padding:3px 8px;background:rgba(255,215,0,0.08);border-radius:4px;cursor:pointer;user-select:none;font-size:10px;color:#ffd700;">'+
        '<span>&#x1F4CB; 定時紀錄 <span id="__gmp_cron_log_count" style="color:#888;">(0)</span></span>'+
        '<span id="__gmp_cron_log_arrow" style="font-size:10px;">&#x25B6;</span>'+
      '</div>'+
      '<div id="__gmp_cron_log_body" style="display:none;max-height:200px;overflow-y:auto;padding:4px 6px;background:rgba(0,0,0,0.3);border-radius:0 0 4px 4px;">'+
        '<div id="__gmp_cron_log_list" style="font-size:9px;color:#aaa;line-height:1.6;"></div>'+
        '<div style="display:flex;gap:4px;margin-top:4px;">'+
          '<button id="__gmp_cron_log_clear" style="padding:1px 8px;background:#3a1a1a;border:1px solid #e94560;color:#e94560;border-radius:3px;cursor:pointer;font-size:9px;">清空</button>'+
          '<button id="__gmp_cron_log_export" style="padding:1px 8px;background:#1a1a3a;border:1px solid #ffd700;color:#ffd700;border-radius:3px;cursor:pointer;font-size:9px;">匯出</button>'+
        '</div>'+
      '</div>'+
    '</div>'+


        '<div style="background:#3a1a1a;border-radius:4px;height:14px;">'+
          '<div id="__gmp_boss_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;transition:width 0.3s;"></div>'+
        '</div>'+
      '</div>'+
      '<div id="__gmp_boss_buffs" style="font-size:10px;color:#86c5ff;margin-top:4px;"></div>'+
    '</div>'+
    // === 世界王列表（可縮放 300px）===
    '<div style="background:rgba(233,69,96,0.06);padding:0;border-radius:6px;margin-bottom:8px;border:1px solid rgba(233,69,96,0.3);">'+
      '<div id="__gmp_wb_toggle" style="display:flex;justify-content:space-between;align-items:center;padding:8px;cursor:pointer;user-select:none;border-bottom:1px solid rgba(233,69,96,0.2);">'+
        '<span style="font-size:11px;color:#e94560;font-weight:bold;">&#x1F3C5; 世界王列表 <span id="__gmp_wb_count" style="font-size:9px;color:#888;">--</span></span>'+
        '<div style="display:flex;gap:4px;align-items:center;">'+
          '<span id="__gmp_wb_timer" style="font-size:9px;color:#888;">每 60s</span>'+
          '<button id="__gmp_wb_refresh" style="padding:2px 6px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:9px;font-weight:bold;">&#x2699; 刷新</button>'+
          '<button id="__gmp_wb_show_detected" style="padding:2px 6px;background:#2a2a4a;border:1px solid #555;color:#aaa;border-radius:4px;cursor:pointer;font-size:9px;">? 事件</button>'+
        '</div>'+
      '</div>'+
      '<div id="__gmp_wb_body" style="max-height:300px;overflow-y:auto;padding:6px;">'+
        '<div id="__gmp_wb_list" style="font-size:10px;color:#555;padding:6px;text-align:center;">DOM 讀取中...</div>'+
      '</div>'+
    '</div>'+
    // === 優先討伐清單（可縮放 300px）===
    '<div style="background:rgba(76,175,80,0.06);padding:0;border-radius:6px;margin-bottom:8px;border:1px solid rgba(76,175,80,0.3);">'+
      '<div id="__gmp_hunt_toggle" style="display:flex;justify-content:space-between;align-items:center;padding:8px;cursor:pointer;user-select:none;border-bottom:1px solid rgba(76,175,80,0.2);">'+
        '<span style="font-size:11px;color:#4caf50;font-weight:bold;">&#x1F3AF; 優先討伐清單 <span id="__gmp_hunt_count" style="font-size:9px;color:#888;"></span></span>'+
        '<div style="display:flex;gap:4px;align-items:center;">'+
          '<span id="__gmp_hunt_timer" style="font-size:9px;color:#888;"></span>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:rgba(0,0,0,0.1);border-bottom:1px solid rgba(76,175,80,0.15);"><span style="font-size:10px;color:#888;">&#x1F465; 最小在場人數才進入:</span><span style="font-size:10px;color:#888;">各BOSS可自設最低人數</span></div>'+
          '<div id="__gmp_hunt_body" style="max-height:300px;overflow-y:auto;padding:6px;">'+
        '<div id="__gmp_hunt_list" style="font-size:10px;color:#555;padding:6px;text-align:center;">點選上方世界王 [+] 加入</div>'+
      '</div>'+
    '</div>'+
    // === 冷卻計時 ===
    '<div style="margin-bottom:8px;">'+
      '<div style="font-size:10px;color:#888;margin-bottom:4px;">冷卻計時</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'+
        '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">&#x1F48A;</span> 藥水 <span id="__gmp_cd_pot" style="color:#4ade80;float:right;">就緒</span></div>'+
        '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">&#x2694;&#xFE0F;</span> 攻擊 <span id="__gmp_cd_atk" style="color:#4ade80;float:right;">就緒</span></div>'+
        '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">&#x1F49A;</span> 治療 <span id="__gmp_cd_heal" style="color:#4ade80;float:right;">就緒</span></div>'+
        '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">&#x1F504;</span> 轉換 <span id="__gmp_cd_convert" style="color:#4ade80;float:right;">就緒</span></div>'+
        '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">&#x1F6E1;&#xFE0F;</span> 屏障 <span id="__gmp_cd_barrier" style="color:#4ade80;float:right;">就緒</span></div>'+
      '</div>'+
    '</div>'+
    // === 手動指令 ===
    '<div style="margin-bottom:8px;">'+
      '<div style="font-size:10px;color:#888;margin-bottom:4px;">手動指令（直接發送）</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'+
        '<button id="__gmp_boss_pot" style="padding:8px;background:#1a4a1a;border:1px solid #2a6a2a;color:#4ade80;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x1F48A; 藥水</button>'+
        '<button id="__gmp_boss_atk" style="padding:8px;background:#2a1a1a;border:1px solid #6a2a2a;color:#f87171;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x2694;&#xFE0F; 攻擊</button>'+
        '<button id="__gmp_boss_heal" style="padding:8px;background:#1a2a1a;border:1px solid #2a5a2a;color:#86efac;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x1F49A; 治療</button>'+
        '<button id="__gmp_boss_convert" style="padding:8px;background:#1a1a4a;border:1px solid #2a2a7a;color:#a5b4fc;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x1F504; 轉換</button>'+
        '<button id="__gmp_boss_barrier" style="padding:8px;background:#1a1a3a;border:1px solid #3a3a8a;color:#818cf8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x1F6E1;&#xFE0F; 屏障</button>'+
        '<button id="__gmp_boss_holy" style="padding:8px;background:#2a1a2a;border:1px solid #6a2a6a;color:#d8b4fe;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">&#x2728; 神聖</button>'+
      '</div>'+
    '</div>'+
    // === 解除冷卻限制 ===
    '<div style="margin-bottom:8px;">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'+
        '<input type="checkbox" id="__gmp_boss_bypass" style="width:14px;height:14px;cursor:pointer;">'+
        '<label for="__gmp_boss_bypass" style="font-size:11px;color:#ffd700;cursor:pointer;">&#x1F513; 解除冷卻限制</label>'+
      '</div>'+
      '<div style="font-size:10px;color:#555;padding-left:22px;">&#x26A0;&#xFE0F; 伺服器仍會驗證冷卻</div>'+
    '</div>'+
    // === 自動掛機 BOSS ===
// === BOSS 自動設定 Modal ===
'<div id="__gmp_boss_auto_modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;justify-content:center;align-items:center;">'+
'<div style="background:#1a1a2e;border:2px solid #0f3460;border-radius:10px;padding:16px;width:350px;max-height:80vh;overflow-y:auto;">'+
'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
'<span style="font-size:14px;color:#e94560;font-weight:bold;">\u2694\uFE0F BOSS \u81ea\u52d5\u639b\u6a5f\u8a2d\u5b9a</span>'+
'<button id="__gmp_boss_auto_modal_close" style="background:transparent;border:none;color:#888;font-size:18px;cursor:pointer;">\u2716</button>'+
'</div>'+
// === Attack ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_atk" style="width:13px;height:13px;cursor:pointer;" checked>'+
'<label for="__gmp_boss_auto_atk" style="font-size:11px;color:#f87171;cursor:pointer;">\u2694\uFE0F \u958b\u59cb\u653b\u64caBOSS</label>'+
'\n<div style="display:flex;align-items:center;gap:5px;margin-bottom:5px;"><input type="checkbox" id="__gmp_boss_auto_pot_stop" style="width:13px;height:13px;cursor:pointer;"><label for="__gmp_boss_auto_pot_stop" style="font-size:10px;color:#f87171;">P少於停止攻\u5f31</label><input id="__gmp_boss_auto_pot_stop_hp" type="number" value="30" min="1" max="100" style="width:50px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;text-align:center;"><span style="font-size:9px;color:#888;">%</span></div>\n</div>'+
'<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;padding:6px 8px;background:rgba(248,113,113,0.08);border-radius:4px;">'+
'<span style="font-size:10px;color:#f87171;">\u8a2d\u5b9aBOSS\u8840\u91cf\u5c11\u65bc</span>'+
'<input id="__gmp_boss_auto_atk_hp_pct" type="number" value="100" min="0" max="100" style="width:45px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+
'<span style="font-size:10px;color:#555;">%</span>'+
'<select id="__gmp_boss_auto_atk_logic" style="padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;">'+
'<option value="AND" selected>AND</option><option value="OR">OR</option><option value="NOT">NOT</option>'+
'</select>'+
'<span style="font-size:10px;color:#888;">\u4eba\u6578</span>'+
'<select id="__gmp_boss_auto_atk_online" style="padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;">'+
'<option value="0" selected>0</option>'+
'<option value="1">1</option>'+
'<option value="2">2</option>'+
'<option value="3">3</option>'+
'<option value="4">4</option>'+
'<option value="5">5</option>'+
'<option value="6">6</option>'+
'<option value="7">7</option>'+
'<option value="8">8</option>'+
'<option value="9">9</option>'+
'<option value="10">10</option>'+
'</select>'+
'<span style="font-size:10px;color:#888;">\u89f8\u767c &gt;0</span>'+
'</div>'+
// === Stop ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_stop" style="width:13px;height:13px;cursor:pointer;">'+
'<label for="__gmp_boss_auto_stop" style="font-size:11px;color:#ffa500;cursor:pointer;">\uD83D\uDED1 \u505c\u6b62\u653b\u64ca</label>'+
'</div>'+
'<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;padding:6px 8px;background:rgba(255,165,0,0.08);border-radius:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_stop_hp_enable" style="width:13px;height:13px;cursor:pointer;">'+
'<span style="font-size:10px;color:#ffa500;">\u73a9\u5bb6HP\u5c11\u65bc</span>'+
'<input id="__gmp_boss_auto_stop_hp" type="number" value="30" min="1" max="100" style="width:45px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+
'<span style="font-size:10px;color:#555;">% \u89f8\u767c</span>'+
'</div>'+
'<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;padding:6px 8px;background:rgba(147,197,253,0.08);border-radius:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_stop_mp_enable" style="width:13px;height:13px;cursor:pointer;">'+
'<span style="font-size:10px;color:#93c5fd;">\u73a9\u5bb6MP\u5c11\u65bc</span>'+
'<input id="__gmp_boss_auto_stop_mp" type="number" value="10" min="1" max="100" style="width:45px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+
'<span style="font-size:10px;color:#555;">% \u505c\u653b</span>'+
'</div>'+
// === Pot ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_pot" style="width:13px;height:13px;cursor:pointer;" checked>'+
'<label for="__gmp_boss_auto_pot" style="font-size:11px;color:#4ade80;cursor:pointer;">\uD83D\uDC8A \u559d\u6c34</label>'+
'</div>'+
'<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;padding:6px 8px;background:rgba(74,222,128,0.08);border-radius:4px;">'+
'<span style="font-size:10px;color:#4ade80;">\u73a9\u5bb6HP\u5c11\u65bc</span>'+
'<input id="__gmp_boss_auto_pot_hp" type="number" value="80" min="1" max="100" style="width:45px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+
'<span style="font-size:10px;color:#555;">% \u4f7f\u7528</span>'+
'</div>'+
// === AtkSkill ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
'<input type="checkbox" id="__gmp_boss_auto_atk_skill" style="width:13px;height:13px;cursor:pointer;" checked>'+
'<label for="__gmp_boss_auto_atk_skill" style="font-size:11px;color:#fbbf24;cursor:pointer;">\u26A1 \u653b\u64ca\u6280\u80fd</label>'+
'</div>'+
// === Heal ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
'<input type="checkbox" id="__gmp_boss_auto_heal" style="width:13px;height:13px;cursor:pointer;" checked>'+
'<label for="__gmp_boss_auto_heal" style="font-size:11px;color:#86efac;cursor:pointer;">\uD83D\uDC9A \u6cbb\u7642\u9b54\u6cd5</label>'+
'</div>'+
'<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;padding:6px 8px;background:rgba(134,239,172,0.08);border-radius:4px;">'+
'<span style="font-size:10px;color:#86efac;">\u73a9\u5bb6HP\u5c11\u65bc</span>'+
'<input id="__gmp_boss_auto_heal_hp" type="number" value="70" min="1" max="100" style="width:45px;padding:2px 4px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+
'<span style="font-size:10px;color:#555;">% \u4f7f\u7528</span>'+
'</div>'+
// === Barrier ===
'<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
'<input type="checkbox" id="__gmp_boss_auto_barrier" style="width:13px;height:13px;cursor:pointer;" checked>'+
'<label for="__gmp_boss_auto_barrier" style="font-size:11px;color:#818cf8;cursor:pointer;">\uD83D\uDEE1\uFE0F \u4f7f\u7528\u9b54\u6cd5\u5c4f\u969c</label>'+
'</div>'+
// === Bypass ===
'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px;background:rgba(255,215,0,0.05);border-radius:4px;">'+
'<input type="checkbox" id="__gmp_boss_bypass" style="width:14px;height:14px;cursor:pointer;">'+
'<label for="__gmp_boss_bypass" style="font-size:11px;color:#ffd700;cursor:pointer;">\uD83D\uDD13 \u89e3\u9664\u51b7\u5374\u9650\u5236</label>'+
'</div>'+
// === Status + Action Button ===
'<div style="text-align:center;margin-top:4px;">'+
'<span id="__gmp_boss_auto_status" style="font-size:11px;color:#888;display:block;margin-bottom:8px;">\u505c\u6b62\u4e2d</span>'+
'<button id="__gmp_boss_auto_btn" style="width:100%;padding:10px;background:#e94560;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">\u25B6 \u5553\u52d5\u81ea\u52d5\u6230\u9b25</button>'+
'</div>'+
'</div>'+


    // === Socket 狀態 + 匯入匯出 ===
    '<div style="margin-bottom:6px;">'+
      '<div style="font-size:10px;color:#888;margin-bottom:4px;">&#x1F4E1; Socket.IO 狀態</div>'+
      '<div style="display:flex;gap:6px;margin-bottom:4px;">'+
        '<span style="font-size:10px;color:#888;">連接: </span><span id="__gmp_sock_status" style="font-size:10px;color:#ffd700;">檢測中...</span>'+
      '</div>'+
      '<div style="font-size:10px;color:#888;">已捕獲: <span id="__gmp_sock_sent" style="color:#4ade80;">0</span> 發送 / <span id="__gmp_sock_evts" style="color:#00d9ff;">0</span> 事件</div>'+
      '<div style="margin:8px 0 4px;display:flex;gap:4px;">'+
        '<button id="__gmp_export_all" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #7bd14a;color:#7bd14a;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">&#x1F4E5; 匯出設定</button>'+
        '<button id="__gmp_import_all" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #fbbf24;color:#fbbf24;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">&#x1F4E4; 匯入設定</button>'+
        '<input type="file" id="__gmp_import_file" accept=".json" style="display:none;">'+
      '</div>'+
      '<div id="__gmp_idb_status" style="font-size:10px;color:#555;margin-top:3px;text-align:center;"></div>'+
    '</div>'+
    // === 事件列含自動刷新開關 ===
    '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;padding:4px 6px;background:rgba(0,0,0,0.15);border-radius:4px;">'+
      '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;margin-right:6px;">'+
        '<input type="checkbox" id="__gmp_wb_auto" checked style="width:11px;height:11px;cursor:pointer;">'+
        '<span style="font-size:9px;color:#888;">每 60s</span>'+
      '</label>'+
      '<span style="font-size:9px;color:#555;">事件:</span>'+
      '<span id="__gmp_wb_evt_name" style="font-size:9px;color:#ffd700;">DOM 即時讀取</span>'+
    '</div>'+
  '</div>'+  // closes __gmp_tab_content_boss
  '</div>'+// === MONITOR TAB ===
    '<div id="__gmp_tab_content_monitor" style="display:none;">'+
      '<div style="background:rgba(74,222,128,0.08);padding:8px;border-radius:6px;margin-bottom:8px;">'+
        '<div style="font-size:11px;color:#4ade80;font-weight:bold;margin-bottom:6px;">📡 封包監控 (Packet Monitor)</div>'+
        '<div style="font-size:10px;color:#aaa;margin-bottom:6px;">記錄所有 WebSocket 與 Socket.IO 封包，匯出為 TXT 供分析</div>'+
        '<div style="display:flex;gap:4px;margin-bottom:6px;">'+
          '<button id="__gmp_monitor_start" style="flex:1;padding:8px;background:#1a4a1a;border:1px solid #4ade80;color:#4ade80;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">▶ 開始監控</button>'+
          '<button id="__gmp_monitor_stop" style="flex:1;padding:8px;background:#4a1a1a;border:1px solid #e94560;color:#e94560;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;" disabled>■ 停止監控</button>'+
        '</div>'+
        '<button id="__gmp_monitor_export" style="width:100%;padding:8px;background:#0f3460;border:1px solid #00d9ff;color:#00d9ff;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;margin-bottom:4px;">💾 匯出 TXT</button>'+
        '<button id="__gmp_monitor_clear" style="width:100%;padding:6px;background:#333;border:1px solid #666;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">🗑️ 清空記錄</button>'+
      '</div>'+
      '<div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:6px;margin-bottom:8px;">'+
        '<div style="font-size:10px;color:#888;margin-bottom:4px;">監控狀態</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;">'+
          '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;"><span style="color:#888;">狀態:</span> <span id="__gmp_monitor_status" style="color:#e94560;font-weight:bold;">未啟動</span></div>'+
          '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;"><span style="color:#888;">已記錄:</span> <span id="__gmp_monitor_count" style="color:#4ade80;font-weight:bold;">0</span></div>'+
          '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;"><span style="color:#888;">SEND:</span> <span id="__gmp_monitor_send" style="color:#fbbf24;">0</span></div>'+
          '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;"><span style="color:#888;">RECV:</span> <span id="__gmp_monitor_recv" style="color:#86c5ff;">0</span></div>'+
        '</div>'+
      '</div>'+
      '<div style="background:rgba(0,0,0,0.3);padding:6px;border-radius:6px;max-height:280px;overflow-y:auto;font-family:monospace;font-size:10px;">'+
        '<div style="color:#888;margin-bottom:4px;border-bottom:1px solid #333;padding-bottom:4px;">最新封包 (最近 50 筆):</div>'+
        '<div id="__gmp_monitor_log" style="color:#ccc;line-height:1.4;"></div>'+
      '</div>'+
    '</div>'+
    // === SKILL TAB ===
    '<div id="__gmp_tab_content_skill" style="display:none;">'+
      '<div style="background:rgba(245,158,11,0.08);padding:8px;border-radius:6px;margin-bottom:8px;">'+
        '<div style="font-size:11px;color:#f59e0b;font-weight:bold;margin-bottom:6px;">⚡ 自動施法設定</div>'+
        '<div style="font-size:10px;color:#aaa;margin-bottom:6px;">讀取遊戲設定面板內所有控制項，即時同步修改</div>'+
        '<div style="display:flex;gap:4px;margin-bottom:4px;">'+
          '<button id="__gmp_skill_read" style="flex:1;padding:8px;background:#1a3a1a;border:1px solid #4ade80;color:#4ade80;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">📥 讀取設定</button>'+
          '<button id="__gmp_skill_open_panel" style="flex:1;padding:8px;background:#0f3460;border:1px solid #00d9ff;color:#00d9ff;border-radius:6px;cursor:pointer;font-size:12px;">🔓 開啟面板</button>'+
        '</div>'+
        '<button id="__gmp_skill_clear" style="width:100%;padding:5px;background:#333;border:1px solid #666;color:#aaa;border-radius:6px;cursor:pointer;font-size:10px;">🗑️ 清空</button>'+
      '</div>'+
      '<div style="background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:6px;margin-bottom:6px;font-size:10px;">'+
        '<span style="color:#888;">狀態:</span> <span id="__gmp_skill_status" style="color:#fbbf24;">未讀取</span>'+
        ' | <span style="color:#888;">項目:</span> <span id="__gmp_skill_count" style="color:#4ade80;">0</span>'+
        ' | <span style="color:#888;">角色:</span> <span id="__gmp_skill_char" style="color:#f59e0b;">--</span>'+
      '</div>'+
      '<div id="__gmp_skill_list" style="background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:6px;max-height:360px;overflow-y:auto;font-size:11px;">'+
        '<div id="__gmp_skill_empty" style="color:#555;text-align:center;padding:24px 0;">尚無資料<br><span style="font-size:9px;color:#444;">點「讀取設定」從遊戲面板抓取</span></div>'+
      '</div>'+
    '</div>'+

    // === STATUS TAB ===
    '<div id="__gmp_tab_content_status" style="display:none;">'+
      '<div style="background:rgba(100,149,237,0.08);padding:8px;border-radius:6px;margin-bottom:8px;">'+
        '<div style="font-size:11px;color:cornflowerblue;font-weight:bold;margin-bottom:6px;">📊 全部設定狀態 (chrome.storage.local)</div>'+
        '<div style="margin:8px 0 4px;display:flex;gap:4px;">'+
          '<button id="__gmp_status_export" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #7bd14a;color:#7bd14a;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">📤 匯出全部設定</button>'+
          '<button id="__gmp_status_import" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #fbbf24;color:#fbbf24;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">📥 匯入全部設定</button>'+
          '<input type="file" id="__gmp_status_import_file" accept=".json" style="display:none;">'+
        '</div>'+
        '<div id="__gmp_status_summary" style="font-size:10px;color:#aaa;margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;max-height:200px;overflow-y:auto;"></div>'+
      '</div>'+
    '</div>'+

    // === FRIEND TAB ===
    '<div id="__gmp_tab_content_friend" style="display:none;">'+
      '<div style="background:rgba(34,211,238,0.06);padding:8px;border-radius:6px;margin-bottom:8px;">'+
        '<div style="font-size:11px;color:#22d3ee;font-weight:bold;margin-bottom:6px;">🔍 好友查詢</div>'+
        '<div style="display:flex;gap:4px;margin-bottom:4px;">'+
          '<input id="__gmp_player_name" placeholder="輸入角色名稱..." style="flex:1;padding:5px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:6px;color:#fff;font-size:11px;outline:none;">'+
          '<button id="__gmp_player_lookup" style="padding:5px 10px;background:#0f3460;border:1px solid #22d3ee;color:#22d3ee;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">送出</button>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'+
          '<input type="checkbox" id="__gmp_player_auto_refresh" style="width:12px;height:12px;cursor:pointer;">'+
          '<span style="font-size:9px;color:#888;">每60秒自動更新</span>'+
          '<span style="flex:1;"></span>'+
          '<input id="__gmp_player_filter" placeholder="🔍 檢索..." style="padding:5px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
          '<button id="__gmp_player_sel_all" style="padding:3px 6px;background:#1a3a1a;border:1px solid #22d3ee;color:#22d3ee;border-radius:4px;cursor:pointer;font-size:9px;">☑ 全選</button>'+
          '<button id="__gmp_player_sel_none" style="padding:3px 6px;background:#1a3a1a;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:9px;">☐ 取消</button>'+
          '<button id="__gmp_player_export_sel" style="padding:3px 6px;background:#1a3a1a;border:1px solid #7bd14a;color:#7bd14a;border-radius:4px;cursor:pointer;font-size:9px;">📤 匯出勾選</button>'+
          '<button id="__gmp_player_import" style="padding:3px 6px;background:#1a3a1a;border:1px solid #fbbf24;color:#fbbf24;border-radius:4px;cursor:pointer;font-size:9px;">📥 匯入</button>'+
          '<input type="file" id="__gmp_player_import_file" accept=".json" style="display:none;">'+
        '</div>'+
        '<div id="__gmp_player_history" style="font-size:10px;color:#aaa;max-height:500px;overflow-y:auto;"></div>'+
      '</div>'+
    '</div>'+

// === FARM TAB ===
    '<div id="__gmp_tab_content_farm" style="display:none;">'+
    // Start/Stop button — moved to TOP
    '<button id="__gmp_farm_btn" style="width:100%;padding:9px;background:#0f3460;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;margin-bottom:8px;">▶ 開啟腳本</button>'+
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
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
      '<input type="checkbox" id="__gmp_farm_hp_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#e94560;width:50px;">HP低於</span>'+
      '<input id="__gmp_farm_hp" type="number" value="20" min="1" max="100" style="width:50px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;width:20px;">%</span>'+
      '<select id="__gmp_farm_hp_action" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#e94560;font-size:10px;outline:none;">'+
        '<option value="selectChar">選擇角色</option>'+
        '<option value="toLobby">回大廳</option>'+
      '</select>'+
    '</div>'+
    // HP trigger note
    '<div style="font-size:9px;color:#666;margin-bottom:6px;padding-left:62px;">HP 觸發時執行動作</div>'+
    // MP row
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
      '<input type="checkbox" id="__gmp_farm_mp_chk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#00d9ff;width:50px;">MP低於</span>'+
      '<input id="__gmp_farm_mp" type="number" value="10" min="1" max="100" style="width:50px;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;text-align:center;">'+
      '<span style="font-size:10px;color:#888;width:20px;">%</span>'+
      '<select id="__gmp_farm_mp_action" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#00d9ff;font-size:10px;outline:none;">'+
        '<option value="selectChar">選擇角色</option>'+
        '<option value="toLobby">回大廳</option>'+
      '</select>'+
    '</div>'+
    // MP trigger note
    '<div style="font-size:9px;color:#666;margin-bottom:6px;padding-left:62px;">MP 觸發時執行動作</div>'+
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
    '</div>'+    // Delay slider for HP/MP teleport
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-left:70px;">'+
      '<span style="font-size:9px;color:#888;">隨機延遲</span>'+
      '<input id="__gmp_farm_teleport_delay_min" type="range" value="0" min="0" max="10" step="0.5" style="width:70px;accent-color:#4ade80;">'+
      '<span id="__gmp_farm_teleport_delay_min_label" style="font-size:9px;color:#4ade80;min-width:24px;">0s</span>'+
      '<span style="font-size:9px;color:#666;">~</span>'+
      '<input id="__gmp_farm_teleport_delay_max" type="range" value="0" min="0" max="10" step="0.5" style="width:70px;accent-color:#4ade80;">'+
      '<span id="__gmp_farm_teleport_delay_max_label" style="font-size:9px;color:#4ade80;min-width:24px;">0s</span>'+
    '</div>'+

    // 被登出次數計數器
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px 8px;background:#1a1a2e;border-radius:6px;">'+
      '<span style="font-size:11px;color:#e94560;font-weight:bold;">🚪 被登出次數</span>'+
      '<b id="__gmp_farm_logout_count" style="font-size:18px;color:#4ade80;min-width:24px;text-align:center;">0</b>'+
      '<span id="__gmp_farm_logout_time" style="font-size:9px;color:#888;flex:1;">尚未被登出</span>'+
    '</div>'+
    // Auto reconnect (斷線重連)
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_reconnect" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#ffd700;">🔄 斷線重連</span>'+
      '<input id="__gmp_farm_char_name" type="text" placeholder="角色名稱" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:10px;color:#888;">'+
      '檢測間隔 <input id="__gmp_farm_reconnect_interval" type="number" value="600" min="10" max="900" style="width:50px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;text-align:center;"> 秒'+
    '</div>'+
    // Character slot — right below reconnect settings
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;">'+
      '<span style="font-size:10px;color:#ffd700;width:70px;">角色槽位</span>'+
      '<select id="__gmp_farm_char_slot" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        '<option value="0">槽 0</option>'+
        '<option value="1">槽 1</option>'+
        '<option value="2">槽 2</option>'+
      '</select>'+
    '</div>'+
    // Auto attack
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+
      '<input type="checkbox" id="__gmp_farm_atk" checked style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:11px;color:#7bd14a;font-weight:bold;">⚔️ 自動攻擊</span>'+
    '</div>'+
    // 指定目標
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+
      '<input type="checkbox" id="__gmp_farm_specify_target" style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#ffa500;">🎯 指定目標</span>'+
      '<select id="__gmp_farm_target_index" style="padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        '<option value="0">目標 0</option><option value="1" selected>目標 1</option><option value="2">目標 2</option>'+
        '<option value="3">目標 3</option><option value="4">目標 4</option><option value="5">目標 5</option>'+
        '<option value="6">目標 6</option><option value="7">目標 7</option><option value="8">目標 8</option>'+
        '<option value="9">目標 9</option><option value="10">目標 10</option>'+
      '</select>'+
    '</div>'+
    // 攻擊全部
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
      '<input type="checkbox" id="__gmp_farm_attack_all" style="width:14px;height:14px;cursor:pointer;">'+
      '<span style="font-size:10px;color:#ff6347;">🔥 攻擊全部 (一次送出 0,1,2)</span>'+
    '</div>'+
    // Status
    '<div id="__gmp_farm_status" style="font-size:10px;color:#888;margin-bottom:6px;text-align:center;">已停止</div>'+
    // Advanced settings button
    '<div style="display:flex;gap:4px;margin-bottom:4px;">'+
      '<button id="__gmp_farm_advanced_settings" style="flex:1;padding:5px;background:#0f3460;border:1px solid #ffd700;border-radius:6px;color:#ffd700;font-size:11px;font-weight:bold;cursor:pointer;">⚙️ 進階設定 (Advanced Rules)</button>'+
    '</div>'+
    // Logout history shortcut box
    '<div id="__gmp_farm_logout_box" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px 8px;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;">'+
      '<span style="font-size:10px;color:#aaa;">⚠️ 被登出</span>'+
      '<span id="__gmp_farm_logout_count" style="font-size:14px;font-weight:bold;color:#4ade80;">0</span>'+
      '<span style="font-size:10px;color:#888;">次</span>'+
      '<span id="__gmp_farm_logout_time" style="font-size:10px;color:#666;flex:1;text-align:right;">--</span>'+
      '<button id="__gmp_farm_logout_history" style="padding:3px 8px;background:#0f3460;border:1px solid #4ade80;border-radius:4px;color:#4ade80;font-size:10px;font-weight:bold;cursor:pointer;">📜 歷史</button>'+
    '</div>'+

    // Test Reconnect button

    '<button id="__gmp_farm_test_reconnect" style="width:100%;padding:6px;background:#2a2a4a;border:1px solid #ffd700;color:#ffd700;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;margin-bottom:4px;">🧪 測試斷線重連</button>'+ 
    '</div>'+  // closes inner farm content div
    '</div>'+ // closes farm tab content div
    '<div id="__gmp_tab_content_other" style="display:none;">'+
    '  <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:6px;margin-bottom:8px;">'+
    '    <div style="font-size:11px;color:#ffd700;font-weight:bold;margin-bottom:6px;">🎰 世界王抽獎</div>'+
    '    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'+
    '      <span style="font-size:10px;color:#aaa;">次數:</span>'+
    '      <input id="__gmp_gacha_count" type="number" value="30" min="1" max="999" style="width:55px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;text-align:center;">'+
    '      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:10px;color:#aaa;">'+
    '        <input type="checkbox" id="__gmp_gacha_enable" style="width:14px;height:14px;cursor:pointer;">'+
    '        <span>每 2 秒自動抽</span>'+
    '      </label>'+
    '      <span id="__gmp_gacha_status" style="font-size:10px;color:#888;">--</span>'+
    '      <button id="__gmp_gacha_hist_btn" style="margin-left:auto;padding:2px 8px;background:#2a2a4a;border:1px solid #22d3ee;color:#22d3ee;border-radius:4px;cursor:pointer;font-size:10px;">📋 歷史</button>'+
    '    </div>'+
    '    <div id="__gmp_gacha_hist_summary" style="font-size:9px;color:#666;margin-top:2px;"></div>'+
    '  </div>'+
    '  <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:6px;margin-bottom:8px;">'+
    '    <div style="font-size:11px;color:#ffd700;font-weight:bold;margin-bottom:6px;">🪟 自動置頂測試</div>'+
    '    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'+
    '      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:10px;color:#aaa;">'+
    '        <input type="checkbox" id="__gmp_focus_test" style="width:14px;height:14px;cursor:pointer;">'+
    '        <span>每 10 秒置頂，5 秒後縮小</span>'+
    '      </label>'+
    '      <span id="__gmp_focus_test_status" style="font-size:10px;color:#888;">已停止</span>'+
    '    </div>'+
    '    <div id="__gmp_focus_test_log" style="margin-top:6px;max-height:120px;overflow-y:auto;font-size:9px;color:#aaa;font-family:Consolas,monospace;line-height:1.4;"></div>'+
    '  </div>'+
    '  <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:6px;margin-bottom:8px;">'+
    '    <div style="font-size:11px;color:#ffd700;font-weight:bold;margin-bottom:6px;">📨 Socket 封包測試</div>'+
    '    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">'+
    '      <span style="font-size:10px;color:#aaa;">joinBoss</span>'+
    '      <input id="__gmp_socket_boss_id" type="text" value="wb_casper" style="width:100px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;">'+
    '      <button id="__gmp_socket_send" style="padding:3px 10px;background:#e94560;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;">發送</button>'+
    '      <span id="__gmp_socket_result" style="font-size:10px;color:#888;"></span>'+
    '    </div>'+
    '  </div>'+
    '</div>'+
    '</div>'; // closes __gmp_content wrapper
  document.body.appendChild(p);

  // === Populate farm zone select ===
  var farmSel=document.getElementById('__gmp_farm_zone');
  var farmSearch=document.getElementById('__gmp_farm_search');
  if(!farmSel||!farmSearch){
    console.error('[GM] Farm elements missing from DOM. farmSel='+(!!farmSel)+' farmSearch='+(!!farmSearch));
    // Debug: log the innerHTML of the panel
    var panel=document.getElementById('__gmp');
    if(panel)console.log('[GM] Panel innerHTML snippet:',panel.innerHTML.substring(0,500));
  }
  function populateFarmZones(filter){
    if(!farmSel)return;
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
  if(farmSearch) farmSearch.addEventListener('input',function(){populateFarmZones(this.value)});

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
      sendCmd('gotoWorldBoss,"'+b.id+'"');
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
  // 切換遊戲內 Tab（包含自動進入世界王的頁籤導航）
  // @param {string} tab - Tab 名稱 ('zone','game','skill','status','farm','boss','monitor')
  function switchTab(tab){
    activeTab=tab;
    var mainBtns=['game','farm','boss','friend'];
    var dropdownBtns=['zone','monitor','skill','status','other'];
    var allTabs=mainBtns.concat(dropdownBtns);
    allTabs.forEach(function(t){
      var el=document.getElementById('__gmp_tab_content_'+t);
      if(el)el.style.display=t===tab?'block':'none';
      var btn=document.getElementById('__gmp_tab_'+t);
      if(!btn)return;
      if(mainBtns.indexOf(t)>=0){
        // main bar buttons: background switch
        btn.style.background=t===tab?'#0f3460':'#333';
        btn.style.color=t===tab?'#fff':'#aaa';
        btn.style.fontWeight=t===tab?'bold':'normal';
      } else {
        // dropdown buttons: highlight text only
        btn.style.background=t===tab?'rgba(34,211,238,0.15)':'transparent';
        btn.style.color=t===tab?'#22d3ee':'#aaa';
        btn.style.fontWeight=t===tab?'bold':'normal';
      }
    });
    // Close more menu
    var menu=document.getElementById('__gmp_tab_more_menu');
    if(menu)menu.style.display='none';
    if(tab==='zone')renderZones(activeZoneTab);
    if(tab==='boss'){if(window.__wbEnsureWBTab)window.__wbEnsureWBTab();setTimeout(function(){__wbUpdateWorldBossUI();},1500);window.__wbInitHuntToggle();__wbUpdateBossStatus();}
    if(tab==='friend'){if(typeof __gmPlayerHistoryLoad==='function')__gmPlayerHistoryLoad();}
  }
  // More menu toggle
  document.getElementById('__gmp_tab_more_btn').onclick=function(e){
    e.stopPropagation();
    var m=document.getElementById('__gmp_tab_more_menu');
    m.style.display=m.style.display==='block'?'none':'block';
  };
  document.addEventListener('click',function(e){
    var m=document.getElementById('__gmp_tab_more_menu');
    var btn=document.getElementById('__gmp_tab_more_btn');
    if(m&&btn&&!m.contains(e.target)&&e.target!==btn)m.style.display='none';
  });
  document.getElementById('__gmp_tab_game').onclick=function(){switchTab('game')};
  document.getElementById('__gmp_tab_zone').onclick=function(){switchTab('zone')};
  document.getElementById('__gmp_tab_farm').onclick=function(){switchTab('farm')};
  document.getElementById('__gmp_tab_boss').onclick=function(){if(window.__wbEnsureWBTab)window.__wbEnsureWBTab();switchTab('boss');};
  document.getElementById('__gmp_tab_monitor').onclick=function(){switchTab('monitor')};
  document.addEventListener('click',function(e){
    var t=e.target;while(t&&t.nodeType===3)t=t.parentElement;
    if(!t||!t.getAttribute)return;
    var act=t.getAttribute('data-wb-action');
    if(act==='selectAll'){if(window.__wbToggleSelectAll)window.__wbToggleSelectAll(true);return;}
    if(act==='deselectAll'){if(window.__wbToggleSelectAll)window.__wbToggleSelectAll(false);return;}
    if(act==='addSelected'){if(window.__wbAddSelectedToHunt)window.__wbAddSelectedToHunt();return;}
    if(act==='huntUp'){if(window.__wbHuntMoveSelected)window.__wbHuntMoveSelected(-1);return;}
    if(act==='huntDown'){if(window.__wbHuntMoveSelected)window.__wbHuntMoveSelected(1);return;}
    if(act==='huntDelete'){if(window.__wbHuntDeleteSelected)window.__wbHuntDeleteSelected();return;}
    if(act==='huntSelectAll'){var chks=document.querySelectorAll('.__gmp_hunt_chk');chks.forEach(function(c){c.checked=true;});return;}
    if(act==='huntDeselectAll'){var chks=document.querySelectorAll('.__gmp_hunt_chk');chks.forEach(function(c){c.checked=false;});return;}
    if(act==='exportDebug'){if(window.__wbDebugExport)window.__wbDebugExport();return;}
  if(act==='huntBatchMinp'){
      var val=parseInt(document.getElementById('__gmp_hunt_batch_minp').value)||0;
      var boxes=document.querySelectorAll('.__gmp_hunt_chk:checked');
      if(boxes.length&&typeof window.__wbGetHuntList==='function'){
        var ids=new Set();
        boxes.forEach(function(b){ids.add(b.value);});
        window.__wbGetHuntList(function(list){
          list.forEach(function(item,i){
            if(ids.has(item.id)){list[i].minPlayers=val;}
          });
          if(typeof window.__wbSaveHuntList==='function')window.__wbSaveHuntList(list);
        });
      }
      return;
    }
    if(t.getAttribute('data-wb-add-hunt')){
      var parts=t.getAttribute('data-wb-add-hunt').split('|');
      if(parts.length>=3&&typeof window.__wbAddToHuntList==='function'){
        window.__wbAddToHuntList(parts[0],parts[1],parseInt(parts[2],10));
        if(typeof __wbUpdateWorldBossUI==='function')__wbUpdateWorldBossUI();
      }
    }
  });

  // ========== Monitor Tab Logic ==========
  window.__pmLog=[];
  window.__pmMaxLog=1000;  // 最多保存 1000 筆
  window.__pmMonitoring=false;

  // 包裝 __battleStatus.packets.push 來即時記錄
  // ===== Socket.IO / Engine.IO binary decoder =====
  function __pmDecodeSocketIO(buf){
    try{
      if(!buf||buf.byteLength<1)return null;
      var view=new DataView(buf);
      var type=view.getUint8(0);
      var typeNames={0:'open',1:'close',2:'ping',3:'pong',4:'message',5:'upgrade',6:'noop'};
      var typeName=typeNames[type]||('type'+type);
      if(type!==4)return '[EI] '+typeName;
      var bytes=new Uint8Array(buf,1);
      var str='';
      try{str=new TextDecoder('utf-8').decode(bytes);}catch(e){str=String.fromCharCode.apply(null,bytes);}
      return '[SIO] '+str;
    }catch(e){return '[decode-err] '+e.message;}
  }

  function __pmLogPacket(dir, rawData){
    try{
      var decoded;
      if(typeof rawData==='string'){
        var first=rawData.charAt(0);
        if(first==='4'){decoded='[SIO] '+rawData.substring(1);}
        else if(first==='3'){decoded='[SIO-PONG]';}
        else if(first==='2'){decoded='[SIO-PING]';}
        else{decoded='[WS] '+rawData;}
      } else if(rawData instanceof ArrayBuffer){
        decoded=__pmDecodeSocketIO(rawData);
      } else if(rawData&&rawData.buffer){
        decoded=__pmDecodeSocketIO(rawData.buffer);
      } else {
        decoded='[?] '+String(rawData).substring(0,200);
      }
      var entry={t:Date.now(),dir:dir,data:decoded};
      window.__pmLog.push(entry);
      if(window.__pmLog.length>window.__pmMaxLog)window.__pmLog.shift();
    }catch(e){console.warn('[PM] log error:',e);}
  }

  function __pmInitHook(){
    if(window.__pmHooked)return;
    window.__pmHooked=true;
    if(!window.__battleStatus)window.__battleStatus={packets:[]};

    var origPush=window.__battleStatus.packets.push.bind(window.__battleStatus.packets);
    window.__battleStatus.packets.push=function(pkt){
      origPush(pkt);
      if(window.__pmMonitoring){
        __pmLogPacket(pkt.type==='send'?'SEND':'RECV', pkt.data);
      }
    };

    if(!WebSocket.prototype.__pmSendHooked){
      WebSocket.prototype.__pmSendHooked=true;
      var origSend=WebSocket.prototype.send;
      WebSocket.prototype.send=function(data){
        if(window.__pmMonitoring)__pmLogPacket('SEND',data);
        return origSend.call(this,data);
      };
    }

    window.__pmPollTimer=setInterval(function(){
      if(!window.__pmMonitoring)return;
      if(window.__ws&&!window.__ws.__pmMsgWrapped){
        window.__ws.__pmMsgWrapped=true;
        window.__ws.addEventListener('message',function(e){
          __pmLogPacket('RECV',e.data);
        });
      }
    },200);
  }

  function __pmUpdateUI(){
    var status=document.getElementById('__gmp_monitor_status');
    var count=document.getElementById('__gmp_monitor_count');
    var send=document.getElementById('__gmp_monitor_send');
    var recv=document.getElementById('__gmp_monitor_recv');
    var logEl=document.getElementById('__gmp_monitor_log');
    var startBtn=document.getElementById('__gmp_monitor_start');
    var stopBtn=document.getElementById('__gmp_monitor_stop');

    if(status)status.textContent=window.__pmMonitoring?'監控中':'未啟動';
    if(status)status.style.color=window.__pmMonitoring?'#4ade80':'#e94560';
    if(count)count.textContent=window.__pmLog.length;
    if(send)send.textContent=window.__pmLog.filter(function(p){return p.dir==='SEND'}).length;
    if(recv)recv.textContent=window.__pmLog.filter(function(p){return p.dir==='RECV'}).length;
    if(startBtn)startBtn.disabled=window.__pmMonitoring;
    if(stopBtn)stopBtn.disabled=!window.__pmMonitoring;

    if(logEl&&window.__pmLog.length){
      var recent=window.__pmLog.slice(-50).reverse();
      logEl.innerHTML=recent.map(function(p){
        var time=new Date(p.t).toLocaleTimeString('zh-TW',{hour12:false});
        var color=p.dir==='SEND'?'#fbbf24':'#86c5ff';
        return '<div style="margin-bottom:2px;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:2px;">'+
          '<span style="color:#888;">['+time+']</span> '+
          '<span style="color:'+color+';font-weight:bold;">'+p.dir+'</span> '+
          '<span style="color:#ccc;word-break:break-all;">'+p.data.replace(/</g,'&lt;').substring(0,200)+'</span>'+
        '</div>';
      }).join('');
    } else if(logEl){
      logEl.innerHTML='<div style="color:#666;text-align:center;padding:20px;">尚無封包記錄<br><span style="font-size:9px;">點擊「開始監控」後執行操作</span></div>';
    }
  }

  // 每 500ms 更新 UI
  setInterval(__pmUpdateUI,500);

  // 開始監控
  document.getElementById('__gmp_monitor_start').onclick=function(){
    __pmInitHook();
    window.__pmMonitoring=true;
    console.log('[Monitor] Started, current packets:',(window.__battleStatus.packets||[]).length);
    // 也記錄現有的歷史封包
    if(window.__battleStatus&&window.__battleStatus.packets){
      window.__battleStatus.packets.forEach(function(pkt){
        try{
          var entry={
            t:Date.now(),
            dir:pkt.type==='send'?'SEND':'RECV',
            data:typeof pkt.data==='string'?pkt.data.substring(0,500):JSON.stringify(pkt.data).substring(0,500)
          };
          window.__pmLog.push(entry);
        }catch(e){}
      });
    }
    __pmUpdateUI();
  };

  // 停止監控
  document.getElementById('__gmp_monitor_stop').onclick=function(){
    window.__pmMonitoring=false;
    console.log('[Monitor] Stopped, captured:',window.__pmLog.length);
    __pmUpdateUI();
  };

  // 匯出 TXT
  document.getElementById('__gmp_monitor_export').onclick=function(){
    if(!window.__pmLog.length){alert('無記錄可匯出');return;}
    var lines=[];
    lines.push('# ============================================');
    lines.push('# 封包監控記錄 (Packet Monitor Log)');
    lines.push('# 角色: '+(window.lastState&&window.lastState.char?window.lastState.char.name:'?'));
    lines.push('# 匯出時間: '+new Date().toLocaleString('zh-TW'));
    lines.push('# 總筆數: '+window.__pmLog.length);
    lines.push('# SEND: '+window.__pmLog.filter(function(p){return p.dir==='SEND'}).length);
    lines.push('# RECV: '+window.__pmLog.filter(function(p){return p.dir==='RECV'}).length);
    lines.push('# ============================================');
    lines.push('');

    window.__pmLog.forEach(function(p,i){
      var time=new Date(p.t).toLocaleString('zh-TW',{hour12:false});
      lines.push('--- ['+(i+1)+'] '+p.dir+' @ '+time+' ---');
      lines.push(p.data);
      lines.push('');
    });

    var content=lines.join('\n');
    var blob=new Blob([content],{type:'text/plain;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    var ts=new Date().toISOString().replace(/[:.]/g,'-').substring(0,19);
    a.download='packet_monitor_'+ts+'.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[Monitor] Exported:',window.__pmLog.length,'packets');
  };

  // 清空記錄
  document.getElementById('__gmp_monitor_clear').onclick=function(){
    if(!confirm('確定要清空所有 '+window.__pmLog.length+' 筆記錄？'))return;
    window.__pmLog=[];
    __pmUpdateUI();
    console.log('[Monitor] Cleared');
  };

  // 初始化 UI
  __pmUpdateUI();

  // ========== Skill Tab Logic ==========
  // 從 #panel-scroll .auto-box 讀取所有 data-k / data-skill 設定，中文名稱 + 即時同步
  window.__pmAuto = {boxes: [], all: {}, gameEls: {}};

  // 嘗試取得某元素的中文標籤
  function __pmGetLabel(el) {
    // 1. 找同一父容器內的前一個有文字的兄弟元素
    var prev = el.previousElementSibling;
    if (prev && prev.textContent.trim()) return prev.textContent.trim();
    // 2. 找父層的上一個兄弟
    var parent = el.parentElement;
    if (parent) {
      var pp = parent.previousElementSibling;
      if (pp && pp.textContent.trim()) return pp.textContent.trim();
    }
    // 3. data-label 屬性
    var dl = el.getAttribute('data-label');
    if (dl) return dl;
    // 4. 找父容器內第一個 .lb 或 label 文字
    var container = el.closest('.auto-box') || parent;
    if (container) {
      var lb = container.querySelector('.lb');
      if (lb && lb.textContent.trim()) return lb.textContent.trim();
      var label = container.querySelector('label');
      if (label && label.textContent.trim()) return label.textContent.trim();
    }
    return null; // 找不到時回傳 null，由 caller 處理
  }

  // 讀取遊戲面板
  function __pmReadFromGame() {
    // 先點擊遊戲的「設定」Tab，確保面板就緒
    var gameSetTab = document.querySelector('.tab[data-tab="set"]');
    if (gameSetTab) {
      gameSetTab.click();
    }
    var panel = document.getElementById('panel-scroll');
    if (!panel) {
      setTimeout(function(){
        var retryPanel = document.getElementById('panel-scroll');
        if (retryPanel) {
          __pmReadFromGameContinue(retryPanel);
        } else {
          alert('找不到遊戲設定面板 (#panel-scroll)。\n請先在遊戲內打開自動施法設定介面。');
        }
      }, 200);
      return;
    }
    __pmReadFromGameContinue(panel);
  }
  function __pmReadFromGameContinue(panel) {
    var status = document.getElementById('__gmp_skill_status');
    if (status) { status.textContent = '讀取中...'; status.style.color = '#fbbf24'; }

    // 讀取角色名稱
    var charNameEl = document.getElementById('__gmp_name');
    var charName = charNameEl ? charNameEl.textContent.replace('Loading...','').trim() : '?';
    var charEl = document.getElementById('__gmp_skill_char');
    if (charEl) charEl.textContent = charName;

    var boxes = panel.querySelectorAll('.auto-box');
    window.__pmAuto = {boxes: [], all: {}, gameEls: {}};
    var total = 0;

    boxes.forEach(function(box, bi) {
      var hdEl = box.querySelector('.hd');
      var sectionName = hdEl ? hdEl.textContent.trim() : ('區塊 ' + (bi + 1));
      var sectionData = {name: sectionName, items: []};

      // data-k 元素（select / input）
      box.querySelectorAll('[data-k]').forEach(function(el) {
        var k = el.getAttribute('data-k');
        var label = __pmGetLabel(el) || k;
        var item = {key: k, label: label, el: el};

        if (el.tagName === 'SELECT') {
          item.type = 'select';
          item.value = el.value;
          var opts = [];
          [].forEach.call(el.options, function(o) {
            opts.push({value: o.value, text: o.textContent.trim() || o.value});
          });
          item.options = opts;
          window.__pmAuto.all[k] = el.value;
        } else if (el.tagName === 'INPUT') {
          if (el.type === 'checkbox') {
            item.type = 'checkbox';
            item.value = el.checked;
            window.__pmAuto.all[k] = el.checked;
          } else if (el.type === 'number') {
            item.type = 'number';
            item.value = el.value;
            item.min = el.min || 0;
            item.max = el.max || 9999;
            item.step = el.step || 1;
            window.__pmAuto.all[k] = el.value;
          } else {
            item.type = 'text';
            item.value = el.value;
            window.__pmAuto.all[k] = el.value;
          }
        } else {
          item.type = 'text';
          item.value = el.textContent.trim();
          window.__pmAuto.all[k] = el.textContent.trim();
        }

        window.__pmAuto.gameEls[k] = el;
        sectionData.items.push(item);
        total++;
      });

      // data-skill 元素（技能 checkbox）
      box.querySelectorAll('[data-skill]').forEach(function(el) {
        var k = el.getAttribute('data-skill');
        var label = __pmGetLabel(el) || k;
        var item = {key: k, label: label, el: el, type: 'checkbox', value: el.checked};
        window.__pmAuto.all[k] = el.checked;
        window.__pmAuto.gameEls[k] = el;
        sectionData.items.push(item);
        total++;
      });

      if (sectionData.items.length > 0) window.__pmAuto.boxes.push(sectionData);
    });

    // 建立技能 ID → 中文名稱映射（雙管齊下）
    window.__pmSkillNames={};
    // 第一波：遍歷 __pmAuto.boxes 所有 items
    //   - checkbox（data-skill）：key=技能ID，label=中文名 → 直接建立 skillNames[key]=label
    //   - select（data-k）：value=當前技能ID，label=設定名 → 建立 skillNames[value]=label
    window.__pmAuto.boxes.forEach(function(sec){
      sec.items.forEach(function(item){
        if(!item.key)return;
        // checkbox 技能：key 是技能 ID（如 sk_fireball），label 是中文名
        if(item.type==='checkbox'&&item.label){
          if(!/^(true|false|on|off|\d+)$/i.test(item.key)){
            window.__pmSkillNames[item.key]=item.label;
          }
          return;
        }
        // select 技能：value=當前技能ID，label=設定名（錯！改用當前選中 option text）
        if(item.type==='select'&&item.value&&item.label){
          if(!/^(true|false|on|off|\d+)$/i.test(item.value)){
            // 從 item.options 找當前選中項的 text（技能中文名）
            var selOpt=(item.options||[]).find(function(o){return o.value===item.value});
            var skillName=selOpt?selOpt.text:item.label;
            // 去除 MP 註記：「燃燒的火球（MP14）」→ 「燃燒的火球」
            skillName=skillName.replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim();
            window.__pmSkillNames[item.value]=skillName;
          }
        }
      });
    });
    // 第二波：select option text，補充下拉內其他候選技能的中文名（並去除 MP 註記）
    boxes.forEach(function(box){
      [].forEach.call(box.querySelectorAll('[data-k]'),function(el){
        if(el.tagName==='SELECT'){
          [].forEach.call(el.options,function(o){
            var v=o.value;
            if(!v||/^(true|false|on|off|\d+)$/i.test(v))return;
            if(!/^(sk_|_)/.test(v))return;
            if(!window.__pmSkillNames[v]){
              var txt=o.textContent.trim().replace(/（[^）]+）$/,'').replace(/\([^)]+\)$/,'').trim();
              window.__pmSkillNames[v]=txt||v;
            }
          });
        }
      });
    });

    var cnt = document.getElementById('__gmp_skill_count');
    if (cnt) cnt.textContent = total;
    if (status) { status.textContent = '已讀取 ' + total + ' 項'; status.style.color = '#4ade80'; }
    // 同時寫入 chrome.storage.local（供進階模組下拉使用）
    var skillData=JSON.parse(JSON.stringify(window.__pmAuto.all||{}));
    var skillNames=JSON.parse(JSON.stringify(window.__pmSkillNames||{}));
    if(charName&&Object.keys(skillData).length){
      __gmStorageGet(['gmSkillSettings']).then(function(result){
        var arr=result&&result.gmSkillSettings||[];
        var found=false;
        for(var i=0;i<arr.length;i++){
          if(arr[i].charName===charName){
            arr[i]={charName:charName,updatedAt:Date.now(),skills:skillData,skillNames:skillNames};
            found=true;break;
          }
        }
        if(!found)arr.push({charName:charName,updatedAt:Date.now(),skills:skillData,skillNames:skillNames});
        return __gmStorageSet('gmSkillSettings',arr);
      }).catch(function(e){
        console.warn('[Skill Sync] storage save error:',e);
      });
    }
    // 若 advanced-farming.js 已載入，同步更新其快取
    if(typeof window.__gmAdvanced!=='undefined'&&window.__gmAdvanced.SkillDB){
      window.__gmAdvanced.SkillDB.save(charName,skillData,skillNames);
    }
    __pmRenderSkillList();
    console.log('[Skill Sync] Read', total, 'items — char:', charName, window.__pmAuto);
  }

  // 即時寫回遊戲 DOM（單一項目）
  function __pmSyncToGame(key, newValue) {
    var el = window.__pmAuto.gameEls[key];
    if (!el) return;
    window.__pmAuto.all[key] = newValue;

    if (el.tagName === 'SELECT') {
      if (el.value !== newValue) {
        el.value = newValue;
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
    } else if (el.tagName === 'INPUT') {
      if (el.type === 'checkbox') {
        if (el.checked !== newValue) {
          el.checked = newValue;
          el.dispatchEvent(new Event('change', {bubbles: true}));
        }
      } else {
        if (el.value !== String(newValue)) {
          el.value = newValue;
          el.dispatchEvent(new Event('input', {bubbles: true}));
        }
      }
    }
    // 更新狀態
    var status = document.getElementById('__gmp_skill_status');
    if (status) { status.textContent = '已同步 ✓'; status.style.color = '#4ade80'; }
    clearTimeout(window.__pmSyncTimer);
    window.__pmSyncTimer = setTimeout(function(){
      var s2 = document.getElementById('__gmp_skill_status');
      if (s2) { s2.textContent = '已讀取 ' + Object.keys(window.__pmAuto.all).length + ' 項'; s2.style.color = '#4ade80'; }
    }, 1500);
  }

  // 渲染技能清單（中文名稱 + 下拉/數值/核取方塊）
  function __pmRenderSkillList() {
    var list = document.getElementById('__gmp_skill_list');
    var empty = document.getElementById('__gmp_skill_empty');
    if (!list) return;

    if (!window.__pmAuto.boxes || !window.__pmAuto.boxes.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    var html = '';
    window.__pmAuto.boxes.forEach(function(sec) {
      html += '<div style="margin-bottom:10px;">';
      html += '<div style="color:#f59e0b;font-size:10px;font-weight:bold;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid rgba(245,158,11,0.25);">📦 ' + escHtml(sec.name) + '</div>';

      sec.items.forEach(function(item) {
        var k = item.key;
        var v = item.value;

        if (item.type === 'select') {
          // 下拉選單
          var selOpts = item.options.map(function(o) {
            var sel = (o.value === v) ? 'selected' : '';
            return '<option value="' + escAttr(o.value) + '" ' + sel + '>' + escHtml(o.text) + '</option>';
          }).join('');
          html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px;border-radius:4px;transition:background 0.1s;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'\'" data-key="' + escAttr(k) + '">' +
            '<span style="color:#ccc;font-size:11px;flex-shrink:0;margin-right:6px;">' + escHtml(item.label) + '</span>' +
            '<select class="__gmp_sk_sel" data-key="' + escAttr(k) + '" style="max-width:55%;padding:3px 6px;background:#1a2a3a;border:1px solid #0f3460;border-radius:5px;color:#fff;font-size:11px;cursor:pointer;outline:none;">' +
            selOpts + '</select>' +
            '</div>';

        } else if (item.type === 'number') {
          // 數值輸入
          html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px;border-radius:4px;transition:background 0.1s;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'\'" data-key="' + escAttr(k) + '">' +
            '<span style="color:#ccc;font-size:11px;flex-shrink:0;margin-right:6px;">' + escHtml(item.label) + '</span>' +
            '<input type="number" class="__gmp_sk_num" data-key="' + escAttr(k) + '" ' +
            'value="' + escAttr(v) + '" min="' + escAttr(item.min) + '" max="' + escAttr(item.max) + '" step="' + escAttr(item.step) + '" ' +
            'style="max-width:55%;padding:3px 6px;background:#1a2a3a;border:1px solid #0f3460;border-radius:5px;color:#00d9ff;font-size:11px;text-align:center;outline:none;">' +
            '</div>';

        } else if (item.type === 'checkbox') {
          // 核取方塊（技能開關）
          var chk = v ? 'checked' : '';
          var chkClr = v ? '#4ade80' : '#555';
          html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px;border-radius:4px;transition:background 0.1s;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'\'" data-key="' + escAttr(k) + '">' +
            '<span style="color:' + chkClr + ';font-size:11px;flex:1;">' + escHtml(item.label) + '</span>' +
            '<input type="checkbox" class="__gmp_sk_chk" data-key="' + escAttr(k) + '" ' + chk + ' ' +
            'style="width:16px;height:16px;cursor:pointer;accent-color:#4ade80;">' +
            '</div>';

        } else {
          // 文字輸入
          html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 2px;" data-key="' + escAttr(k) + '">' +
            '<span style="color:#aaa;font-size:11px;flex-shrink:0;margin-right:6px;">' + escHtml(item.label) + '</span>' +
            '<input type="text" class="__gmp_sk_txt" data-key="' + escAttr(k) + '" ' +
            'value="' + escAttr(v) + '" ' +
            'style="max-width:55%;padding:3px 6px;background:#1a2a3a;border:1px solid #0f3460;border-radius:5px;color:#86c5ff;font-size:11px;outline:none;">' +
            '</div>';
        }
      });
      html += '</div>';
    });

    list.innerHTML = html;

    // 绑定即时同步事件
    list.querySelectorAll('.__gmp_sk_sel').forEach(function(sel) {
      sel.addEventListener('change', function() { __pmSyncToGame(this.getAttribute('data-key'), this.value); });
    });
    list.querySelectorAll('.__gmp_sk_num').forEach(function(inp) {
      inp.addEventListener('input', function() { __pmSyncToGame(this.getAttribute('data-key'), this.value); });
      inp.addEventListener('change', function() { __pmSyncToGame(this.getAttribute('data-key'), this.value); });
    });
    list.querySelectorAll('.__gmp_sk_chk').forEach(function(chk) {
      chk.addEventListener('change', function() { __pmSyncToGame(this.getAttribute('data-key'), this.checked); });
    });
    list.querySelectorAll('.__gmp_sk_txt').forEach(function(inp) {
      inp.addEventListener('input', function() { __pmSyncToGame(this.getAttribute('data-key'), this.value); });
    });
  }

  // HTML 跳脫
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // 按鈕事件
  document.getElementById('__gmp_tab_skill').onclick = function() { switchTab('skill'); };
  document.getElementById('__gmp_tab_status').onclick=function(){ switchTab('status'); };
  document.getElementById('__gmp_tab_friend').onclick=function(){ switchTab('friend'); };
  document.getElementById('__gmp_tab_other').onclick=function(){ switchTab('other'); };

  // === Status tab handlers ===
  function __gmExportAllSettings(){
    __gmShowIdbStatus('\u{1F4E4} 導出所有設定中...','#fbbf24');
    chrome.storage.local.get(null,function(all){
      var exportData={export_version:'3.18',export_date:new Date().toISOString(),settings:{}};
      ['gmSkillSettings','wb_boss_config','wb_priority_list','wb_boss_entry_settings','wb_boss_history','wb_boss_loot','wb_auto_script_state','wb_boss_auto_loot','wb_min_players'].forEach(function(k){if(all[k]!==undefined)exportData.settings[k]=all[k];});
      doExportDownload(exportData);
    });
  }
  function doExportDownload(data){
    var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='gm-panel-settings-'+(new Date().toISOString().slice(0,10))+'.json';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    var cnt=Object.keys(data.settings||{}).length;
    __gmShowIdbStatus('✅ 導出成功: '+cnt+' 項設定','#4ade80');
  }
  function __gmImportAllSettings(jsonStr){
    try{
      var data=JSON.parse(jsonStr);
      if(!data.settings||typeof data.settings!=='object'){__gmShowIdbStatus('❌ JSON 格式錯誤: 缺少 settings 區塊','#e94560');return;}
      __gmShowIdbStatus('\u{1F4E5} 導入設定中...','#fbbf24');
      chrome.storage.local.set(data.settings,function(){
        __gmShowIdbStatus('✅ 導入成功: '+(Object.keys(data.settings).length)+' 項設定已寫入','#4ade80');
        if(window.__wbLoadBossConfig)window.__wbLoadBossConfig();
        if(window.__wbLoadPriorityList)window.__wbLoadPriorityList();
        if(window.__wbLoadEntrySkills)window.__wbLoadEntrySkills();
      });
    }catch(ex){__gmShowIdbStatus('❌ JSON 解析錯誤','#e94560');}
  }
  function __gmRefreshStatusView(){
    var el=document.getElementById('__gmp_status_summary');if(!el)return;
    chrome.storage.local.get(null,function(all){
      var html='<div style="margin-bottom:4px;color:#888;font-size:10px;">已儲存的設定項(共'+Object.keys(all).length+' 項):</div>';
      ['gmSkillSettings','wb_boss_config','wb_priority_list','wb_boss_entry_settings','wb_boss_history','wb_boss_loot','wb_auto_script_state','wb_boss_auto_loot','wb_min_players'].forEach(function(k){
        var v=all[k];
        var labels={gmSkillSettings:'⚡技能設定',wb_boss_config:'\u{1F451}BOSS',wb_priority_list:'\u{1F3AF}優先詂伐',wb_boss_entry_settings:'\u{1F3E0}BOSS進入',wb_boss_history:'\u{1F4DC}歷史',wb_boss_loot:'\u{1F4B0}掉落',wb_auto_script_state:'▶自動進入',wb_boss_auto_loot:'\u{1F4E6}掉落記錄',wb_min_players:'\u{1F465}最少人'};
        var label=labels[k]||k;
        if(v!==undefined){
          var size=JSON.stringify(v).length+'B';
          html+='<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;"><span style="color:#4ade80;">'+label+'</span><span style="color:#888;font-size:9px;">'+size+'</span></div>';
        }else{
          html+='<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;"><span style="color:#888;">'+label+'</span><span style="color:#555;">未設定</span></div>';
        }
      });
      el.innerHTML=html;
    });
  }
  document.getElementById('__gmp_status_export').onclick=function(){ __gmExportAllSettings(); };
  document.getElementById('__gmp_status_import').onclick=function(){document.getElementById('__gmp_status_import_file').value='';document.getElementById('__gmp_status_import_file').click();};
  document.getElementById('__gmp_status_import_file').onchange=function(e){var f=e.target.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(ev){__gmImportAllSettings(ev.target.result);};rd.readAsText(f);};
  var __gmOrigSwitchTab2=window.switchTab;
  if(typeof __gmOrigSwitchTab2==='function'){window.switchTab=function(t){__gmOrigSwitchTab2(t);if(t==='status')setTimeout(__gmRefreshStatusView,50);};}
  ﻿  // === Player Viewer v2 (friend list + modal) ===
  window.__gmPlayerHistory=[];
  window.__gmPlayerRefreshTimer=null;
  window.__gmPlayerRefreshing=false;

  function __gmPlayerHistoryLoad(){
    if(typeof window.__gmStorageGet==='function'){
      window.__gmStorageGet(['__gmp_player_history']).then(function(r){
        window.__gmPlayerHistory=r.__gmp_player_history||[];
        __gmPlayerLookupRenderHistory();
      }).catch(function(e){
        console.warn('[GM] Player load failed:',e);
        window.__gmPlayerHistory=[];
        __gmPlayerLookupRenderHistory();
      });
    } else {
      window.__gmPlayerHistory=[];
      __gmPlayerLookupRenderHistory();
    }
  }
  function __gmPlayerHistorySave(){
    if(!window.__gmPlayerHistory||!window.__gmPlayerHistory.length){return;}
    if(typeof window.__gmStorageSet!=='function'){console.warn("[GM] No storage relay for player save");return;}
    try{
      var copy=JSON.parse(JSON.stringify(window.__gmPlayerHistory));
      window.__gmStorageSet('__gmp_player_history',copy).then(function(){
        console.log("[GM] Player list saved:",copy.length,"entries");
      }).catch(function(e){
        console.warn("[GM] Player save failed:",e);
      });
    }catch(e){console.warn("[GM] Player save error:",e.message);}
  }

  function __gmPlayerParseInfo(){
    var ppName=document.querySelector('.pp-name');
    var ppPop=document.getElementById('pp-popup');
    try{if(ppPop)ppPop.classList.add('hidden');}catch(e){}
    var info={cls:'',lv:'',status:'offline',location:'\u96E2\u7DDA'};
    if(ppName){var n=ppName.textContent||'';if(n&&n.indexOf('\u67E5\u7121')<0)info.name=n;}
    var subs=document.querySelectorAll('.pp-box .pp-sub');
    for(var i=0;i<subs.length;i++){
      var t=subs[i].textContent||'';
      var m=t.match(/(\S+?)\u30FBLv\s*(\d+)/);
      if(m){info.cls=m[1];info.lv=m[2];}
      if(subs[i].innerHTML.indexOf('color:#86efac')>-1)info.status='online';
      else if(subs[i].innerHTML.indexOf('color:#ff8a6b')>-1)info.status='fighting';
      else if(subs[i].innerHTML.indexOf('color:#888')>-1&&t.indexOf('\u96E2\u7DDA')>-1)info.status='offline';
    }
    for(var j=0;j<subs.length;j++){
      var txt=subs[j].textContent||'';
      if(txt.indexOf('\u76EE\u524D\u4F4D\u7F6E')>-1||txt.indexOf('\u7576\u524D\u6240\u5728')>-1){
        var lm=txt.match(/(?:\u7576\u524D\u6240\u5728|\u76EE\u524D\u4F4D\u7F6E)[\uFF1A:]\s*(.+)/);
        if(lm)info.location=lm[1].trim();
      }
    }
    if(info.status==='fighting'&&info.location==='\u96E2\u7DDA')info.location='\u6230\u9B25\u4E2D';
    // Parse equipment from pp-box
    var ppBox=document.querySelector('.pp-box');
    if(ppBox){
      var equipRows=ppBox.querySelectorAll('[class*="equip"], [class*="item"], .pp-row');
      var equip={},stats={};
      for(var k=0;k<equipRows.length;k++){
        var row=equipRows[k];
        var txt2=(row.textContent||'').trim();
        if(!txt2)continue;
        var em=txt2.match(/^(.+?)\s*[+：:]\s*(.+)$|^(.+?)\s+(\d+)\s*$/);
        if(em){
          var key=(em[1]||em[3]||'').trim();
          var val=(em[2]||em[4]||'').trim();
          if(key&&val)equip[key]=val;
        } else {
          // catch all other rows
          equip['row'+(k+1)]=txt2;
        }
      }
      if(Object.keys(equip).length>0)info.equip=equip;
      // Try to parse stats from pp-body
      var body=document.getElementById('pp-body');
      if(body){
        var statText=body.textContent||'';
        var hpM=statText.match(/HP[：:]\s*(\d+)\s*\/\s*(\d+)/);
        var mpM=statText.match(/MP[：:]\s*(\d+)\s*\/\s*(\d+)/);
        var atkM=statText.match(/(?:攻擊|ATK)[：:]\s*(\d+)/);
        var defM=statText.match(/(?:防禦|DEF)[：:]\s*(\d+)/);
        if(hpM)stats.hp=hpM[1]+'/'+hpM[2];
        if(mpM)stats.mp=mpM[1]+'/'+mpM[2];
        if(atkM)stats.atk=atkM[1];
        if(defM)stats.def=defM[1];
        if(Object.keys(stats).length>0)info.stats=stats;
      }
    }
    return info;
  }
  function __gmPlayerStatusDot(status){
    if(status==='online')return '<span style=\"color:#86efac\">\u25CF</span>';
    if(status==='fighting')return '<span style=\"color:#ff8a6b\">\u25CF</span>';
    return '<span style=\"color:#e94560\">\u25CF</span>';
  }

  function __gmPlayerStatusText(status){
    if(status==='online')return '';
    if(status==='fighting')return '';
    return '';
  }

  window.__gmPlayerDelete=function(idx){
    window.__gmPlayerHistory.splice(idx,1);
    __gmPlayerHistorySave();
    __gmPlayerLookupRenderHistory();
  };

  function __gmPlayerLookupRenderHistory(filter){
    var el=document.getElementById('__gmp_player_history');if(!el)return;
    if(!window.__gmPlayerHistory.length){el.innerHTML='<span style="color:#555;">\u5C1A\u7121\u67E5\u8A62\u8A18\u9304</span>';return;}
    var sorted=window.__gmPlayerHistory.slice().map(function(h,i){h._idx=i;return h;});
    if(filter){
      var kw=filter.toLowerCase();
      sorted=sorted.filter(function(h){return h.name.toLowerCase().indexOf(kw)>=0;});
    }
    sorted.sort(function(a,b){if(a.fav&&!b.fav)return -1;if(!a.fav&&b.fav)return 1;return b._idx-a._idx;});
    if(!sorted.length){el.innerHTML='<span style="color:#555;">\u7121\u7B26\u5408\u689D\u4EF6\u7684\u8A18\u9304</span>';return;}
    el.innerHTML='<div style="max-height:500px;overflow-y:auto;">'+sorted.map(function(h){
      var star=h.fav?'\u2605':'\u2606';
      var starColor=h.fav?'#fbbf24':'#888';
      var sc=h.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
      var six=h._idx;
      var clsLv=(h.cls?' '+h.cls+' Lv'+h.lv:'');
      var dot=__gmPlayerStatusDot(h.status||'offline');
      var loc=h.location||'\u96E2\u7DDA';
      return '<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">'+
        '<div style="display:flex;align-items:center;gap:4px;">'+
          '<input type="checkbox" class="__gmp_player_cb" data-idx="'+six+'" style="width:10px;height:10px;cursor:pointer;margin:0;">'+
          '<span style="cursor:pointer;font-size:16px;color:'+starColor+';" onclick="event.stopPropagation();'+
            'window.__gmPlayerToggleFav('+six+');">'+star+'</span>'+
          '<span style="font-size:20px;">'+dot+'</span>'+
          '<span style="font-size:20px;color:#fff;font-weight:bold;">'+clsLv+'</span>'+
          '<span style="flex:1;cursor:pointer;color:#fbbf24;font-size:20pt;font-weight:bold;" onclick="window.__gmPlayerShowModal(\x27'+sc+'\x27)">'+h.name+'</span>'+
          '<span style="cursor:pointer;font-size:9px;color:#e94560;padding:0 2px;" onclick="event.stopPropagation();window.__gmPlayerDelete('+six+');" title="\u522A\u9664">\u2715</span>'+
        '</div>'+
        '<div style="font-size:14px;color:#86efac;padding-left:49px;">'+loc+'</div>'+
      '</div>';
    }).join('')+'</div>';
  }
  window.__gmPlayerToggleFav=function(idx){
    var h=window.__gmPlayerHistory[idx]; if(!h)return;
    h.fav=!h.fav;
    __gmPlayerHistorySave();
    __gmPlayerLookupRenderHistory();
  };

  function __gmPlayerAddHistory(name, info){
    var found=null;
    for(var i=0;i<window.__gmPlayerHistory.length;i++){
      if(window.__gmPlayerHistory[i].name===name){found=window.__gmPlayerHistory[i];break;}
    }
    var now=new Date();var ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    if(found){
      found.ts=ts;
      if(info){found.cls=info.cls;found.lv=info.lv;found.status=info.status;found.location=info.location;if(info.equip)found.equip=info.equip;if(info.stats)found.stats=info.stats;}
    } else {
      var entry={name:name,ts:ts,fav:false};
      if(info){entry.cls=info.cls;entry.lv=info.lv;entry.status=info.status;entry.location=info.location;if(info.equip)entry.equip=info.equip;if(info.stats)entry.stats=info.stats;}
      window.__gmPlayerHistory.push(entry);
    }
    if(window.__gmPlayerHistory.length>100)window.__gmPlayerHistory.splice(0,window.__gmPlayerHistory.length-100);
    __gmPlayerHistorySave();
  }

  window.__gmPlayerShowModal=function(name,autoClose){
    var old=document.getElementById('__gmp_player_modal');if(old)old.remove();
    var m=document.createElement('div');m.id='__gmp_player_modal';
    m.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;pointer-events:none;';
    m.innerHTML='<div style=\"pointer-events:auto;background:#0f0f23;border:2px solid #22d3ee;border-radius:10px;width:380px;max-height:85vh;display:flex;flex-direction:column;color:#fff;font-family:sans-serif;\">'+
      '<div style=\"display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #22d3ee;background:rgba(34,211,238,0.1);border-radius:8px 8px 0 0;\">'+
        '<span style=\"flex:1;font-size:14px;font-weight:bold;color:#22d3ee;\">\u73A9\u5BB6\u8CC7\u8A0A</span>'+
        '<span id=\"__gmp_player_modal_close\" style=\"cursor:pointer;font-size:20px;color:#e94560;font-weight:bold;line-height:1;\" title=\"\u95DC\u9589\">\u2715</span>'+
      '</div>'+
      '<div id=\"__gmp_player_body\" style=\"padding:12px;overflow-y:auto;flex:1;text-align:center;color:#888;\">\u67E5\u8A62\u4E2D...</div>'+
    '</div>';
    document.body.appendChild(m);
    var closeFn=function(){
      m.remove();
      var ppPop=document.getElementById('pp-popup');
      try{ppPop.classList.add('hidden');}catch(e){}
      var ppBox=document.querySelector('.pp-box');
      if(ppBox)ppBox.style.display='none';
      var msgOk=document.querySelector('#msg-ok');
      if(msgOk&&msgOk.offsetParent)msgOk.click();
    };
    document.getElementById('__gmp_player_modal_close').onclick=closeFn;
    m.onclick=function(e){if(e.target===m)closeFn();};

    if(window.__wbSocket){window.__wbSocket.emit('viewPlayer',[name]);}
    var mn=name;
    var deadline=Date.now()+6000;
    var polling=setInterval(function(){
      var msgOk=document.querySelector('#msg-ok');
      if(msgOk){
        var msgText=document.querySelector('#msg-text');
        if(msgText&&msgText.textContent.indexOf('\u67E5\u7121\u6B64\u73A9\u5BB6')>-1){
          clearInterval(polling);
          var b=document.getElementById('__gmp_player_body');
          if(b)b.innerHTML='<span style=\"color:#e94560;\">\u67E5\u7121\u6B64\u73A9\u5BB6\uFF08\u53EF\u80FD\u5DF2\u6539\u540D\u6216\u522A\u9664\u89D2\u8272\uFF09</span>';
          window.__gmPlayerHistory=window.__gmPlayerHistory.filter(function(h){return h.name!==mn;});
          __gmPlayerHistorySave();
          __gmPlayerLookupRenderHistory();
          msgOk.click();
          return;
        }
      }
      var pp=document.querySelector('.pp-box');if(!pp){
        if(Date.now()>deadline){clearInterval(polling);document.getElementById('__gmp_player_body').innerHTML='<span style=\"color:#e94560;\">\u67E5\u8A62\u8D85\u6642</span>';}
        return;
      }
      var body=document.getElementById('pp-body');
      var el=document.getElementById('__gmp_player_body');
      if(el&&body)el.innerHTML=body.outerHTML;
      var ppPop=document.getElementById('pp-popup');
      try{ppPop.classList.add('hidden');}catch(e){}
      var info=__gmPlayerParseInfo();
      __gmPlayerAddHistory(mn, info);
      __gmPlayerLookupRenderHistory();
      if(pp){pp.style.display='none';}
      clearInterval(polling);
      if(autoClose)closeFn();
    },300);
  };

  function __gmPlayerSilentRefreshByName(name, callback){
    if(window.__wbSocket){window.__wbSocket.emit('viewPlayer',[name]);}
    var deadline=Date.now()+5000;
    var polling=setInterval(function(){
      var msgOk=document.querySelector('#msg-ok');
      if(msgOk){
        var msgText=document.querySelector('#msg-text');
        if(msgText&&msgText.textContent.indexOf('\u67E5\u7121\u6B64\u73A9\u5BB6')>-1){
          clearInterval(polling);
          msgOk.click();
          window.__gmPlayerHistory=window.__gmPlayerHistory.filter(function(h){return h.name!==name;});
          __gmPlayerHistorySave();
          __gmPlayerLookupRenderHistory();
          if(callback)callback();return;
        }
      }
      var pp=document.querySelector('.pp-box');if(!pp){if(Date.now()>deadline){clearInterval(polling);try{var ppPop3=document.getElementById('pp-popup');if(ppPop3)ppPop3.classList.add('hidden');}catch(e){}if(callback)callback();}return;}
      var info=__gmPlayerParseInfo();
      var ppPop2=document.getElementById('pp-popup');
      try{ppPop2.classList.add('hidden');}catch(e){}
      if(pp){pp.style.display='none';}
      clearInterval(polling);
      for(var j=0;j<window.__gmPlayerHistory.length;j++){
        if(window.__gmPlayerHistory[j].name===name&&info){
          window.__gmPlayerHistory[j].cls=info.cls;
          window.__gmPlayerHistory[j].lv=info.lv;
          window.__gmPlayerHistory[j].status=info.status;
          window.__gmPlayerHistory[j].location=info.location;
          if(info.equip)window.__gmPlayerHistory[j].equip=info.equip;
          if(info.stats)window.__gmPlayerHistory[j].stats=info.stats;
          break;
        }
      }
      __gmPlayerHistorySave();
      __gmPlayerLookupRenderHistory();
      if(callback)callback();
    },300);
  }

  function __gmPlayerRefreshAllSilent(){
    if(window.__gmPlayerRefreshing)return;
    if(!window.__gmPlayerHistory.length)return;
    window.__gmPlayerRefreshing=true;
    var queue=window.__gmPlayerHistory.map(function(h){return h.name;});
    function next(i){
      if(i>=queue.length){window.__gmPlayerRefreshing=false;return;}
      __gmPlayerSilentRefreshByName(queue[i], function(){
        setTimeout(function(){next(i+1);}, 600);
      });
    }
    next(0);
  }

  function __gmPlayerToggleAutoRefresh(){
    var chk=document.getElementById('__gmp_player_auto_refresh');
    if(!chk)return;
    if(chk.checked){
      console.log('[GM] Player auto-refresh ON (every 60s)');
      __gmPlayerRefreshAllSilent();
      window.__gmPlayerRefreshTimer=setInterval(__gmPlayerRefreshAllSilent, 60000);
    } else {
      console.log('[GM] Player auto-refresh OFF');
      if(window.__gmPlayerRefreshTimer){clearInterval(window.__gmPlayerRefreshTimer);window.__gmPlayerRefreshTimer=null;}
    }
  }

  function __gmPlayerExportSelected(){
    var cbs=document.querySelectorAll('.__gmp_player_cb:checked');
    if(!cbs.length){alert('\u8ACB\u5148\u52FE\u9078\u8981\u532F\u51FA\u7684\u597D\u53CB');return;}
    var selected=[];
    for(var i=0;i<cbs.length;i++){
      var idx=parseInt(cbs[i].getAttribute('data-idx'));
      if(!isNaN(idx)&&window.__gmPlayerHistory[idx]){
        var h=window.__gmPlayerHistory[idx];
        var o={name:h.name,cls:h.cls,lv:h.lv,status:h.status,location:h.location,ts:h.ts,fav:!!h.fav};
        if(h.equip)o.equip=h.equip;
        if(h.stats)o.stats=h.stats;
        selected.push(o);
      }
    }
    var json=JSON.stringify(selected,null,2);
    var blob=new Blob([json],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='friends-export.json';a.click();
    URL.revokeObjectURL(a.href);
    console.log('[GM] Exported '+selected.length+' players');
  }
  function __gmPlayerImportFile(file){
    var reader=new FileReader();
    reader.onload=function(e){
      try{
        var data=JSON.parse(e.target.result);
        if(!Array.isArray(data)){alert('\u683C\u5F0F\u932F\u8AA4\uFF1A\u9700\u70BA\u9663\u5217');return;}
        var added=0;
        for(var i=0;i<data.length;i++){
          if(!data[i].name)continue;
          var exists=false;
          for(var j=0;j<window.__gmPlayerHistory.length;j++){if(window.__gmPlayerHistory[j].name===data[i].name){exists=true;break;}}
          if(!exists){
            window.__gmPlayerHistory.push({
              name:data[i].name,
              cls:data[i].cls||'',
              lv:data[i].lv||'',
              status:data[i].status||'offline',
              location:data[i].location||'\u96E2\u7DDA',
              ts:'--:--',
              fav:!!data[i].fav
            });
            added++;
          }
        }
        __gmPlayerHistorySave();
        __gmPlayerLookupRenderHistory();
        alert('\u5DF2\u532F\u5165 '+added+' \u4F4D\u597D\u53CB');
      }catch(ex){alert('JSON \u89E3\u6790\u5931\u6557\uFF1A'+ex.message);}
    };
    reader.readAsText(file);
  }

  document.getElementById('__gmp_player_lookup').onclick=function(){
    var inp=document.getElementById('__gmp_player_name');var n=(inp.value||'').trim();if(!n)return;
    window.__gmPlayerShowModal(n,true);
    inp.value='';
  };
  document.getElementById('__gmp_player_name').onkeydown=function(e){if(e.key==='Enter')document.getElementById('__gmp_player_lookup').click();};
  document.getElementById('__gmp_player_sel_all').onclick=function(){
    var cbs=document.querySelectorAll('.__gmp_player_cb');
    for(var i=0;i<cbs.length;i++)cbs[i].checked=true;
  };
  document.getElementById('__gmp_player_sel_none').onclick=function(){
    var cbs=document.querySelectorAll('.__gmp_player_cb');
    for(var i=0;i<cbs.length;i++)cbs[i].checked=false;
  };
  document.getElementById('__gmp_player_export_sel').onclick=__gmPlayerExportSelected;
  document.getElementById('__gmp_player_import').onclick=function(){document.getElementById('__gmp_player_import_file').click();};
  document.getElementById('__gmp_player_import_file').onchange=function(e){if(e.target.files[0])__gmPlayerImportFile(e.target.files[0]);};
  __gmPlayerHistoryLoad();
  var _arChk=document.getElementById('__gmp_player_auto_refresh');
  if(_arChk)_arChk.onchange=__gmPlayerToggleAutoRefresh;

  document.getElementById('__gmp_skill_read').onclick = __pmReadFromGame;
  document.getElementById('__gmp_skill_clear').onclick = function() {
    window.__pmAuto = {boxes: [], all: {}, gameEls: {}};
    __pmRenderSkillList();
    var cnt = document.getElementById('__gmp_skill_count');
    if (cnt) cnt.textContent = '0';
    var status = document.getElementById('__gmp_skill_status');
    if (status) { status.textContent = '已清空'; status.style.color = '#888'; }
    var charEl = document.getElementById('__gmp_skill_char');
    if (charEl) charEl.textContent = '--';
  };
  document.getElementById('__gmp_skill_open_panel').onclick = function() {
    var btns = document.querySelectorAll('button, .btn, [class*="setting"], [class*="auto"]');
    var found = false;
    btns.forEach(function(b) {
      if (b.textContent && /設定|setting|auto|自動|施法/i.test(b.textContent)) {
        console.log('[Skill] Opening panel:', b.textContent.trim().substring(0, 30));
        b.click(); found = true;
      }
    });
    if (!found) alert('請手動打開遊戲內的自動施法設定面板');
  };


  // === Control buttons ===
  document.getElementById('__gmp_lobby').onclick=function(){sendCmd('toLobby')};
  document.getElementById('__gmp_zone_town').onclick=function(){sendZone('town_silver_knight')};
  document.getElementById('__gmp_close').onclick=function(){stopFarming();document.getElementById('__gmp').remove()};
  document.getElementById('__gmp_expand').onclick=function(){
    isExpanded=!isExpanded;
    var content=document.getElementById('__gmp_content');
    var panel=document.getElementById('__gmp');
    var headerRow=this.parentElement.parentElement;
    var controlsDiv=this.parentElement;
    var tabsDiv=controlsDiv.previousElementSibling;
    var zoomIn=document.getElementById('__gmp_zoom_in');
    var zoomOut=document.getElementById('__gmp_zoom_out');
    var closeBtn=document.getElementById('__gmp_close');
    if(isExpanded){
      content.style.display='block';
      panel.style.width='450px';
      panel.style.height='650px';
      panel.style.borderRadius='12px';
      panel.style.top='10px';
      panel.style.right='10px';
      panel.style.bottom='auto';
      panel.style.overflowY='auto';
      panel.style.padding='12px';
      panel.style.border='2px solid #0f3460';
      panel.style.background='linear-gradient(135deg,#1a1a2e,#16213e)';
      panel.style.cursor='move';
      headerRow.style.marginBottom='10px';
      headerRow.style.paddingBottom='8px';
      headerRow.style.borderBottom='1px solid #0f3460';
      tabsDiv.style.display='flex';
      // show all controls
      zoomIn.style.display='';
      zoomOut.style.display='';
      closeBtn.style.display='';
      controlsDiv.style.display='';
      this.style.position='';
      this.style.width='';
      this.style.height='';
      this.style.borderRadius='4px';
      this.style.background='#0f3460';
      this.style.color='#fff';
      this.style.fontSize='12px';
      this.style.display='';
      this.style.alignItems='';
      this.style.justifyContent='';
      this.textContent='\u25BC';
    } else {
      content.style.display='none';
      panel.style.width='24px';
      panel.style.height='24px';
      panel.style.borderRadius='50%';
      panel.style.top='auto';
      panel.style.bottom='10px';
      panel.style.right='10px';
      panel.style.overflowY='hidden';
      panel.style.padding='0';
      panel.style.border='none';
      panel.style.background='#0f3460';
      panel.style.cursor='pointer';
      headerRow.style.marginBottom='0';
      headerRow.style.paddingBottom='0';
      headerRow.style.borderBottom='none';
      tabsDiv.style.display='none';
      // hide zoom+close, keep expand visible
      zoomIn.style.display='none';
      zoomOut.style.display='none';
      closeBtn.style.display='none';
      controlsDiv.style.display=''; // DON'T hide parent or expand btn disappears
      this.style.position='absolute';
      this.style.top='0';
      this.style.left='0';
      this.style.width='24px';
      this.style.height='24px';
      this.style.borderRadius='50%';
      this.style.background='transparent';
      this.style.color='#fff';
      this.style.fontSize='10px';
      this.style.display='flex';
      this.style.alignItems='center';
      this.style.justifyContent='center';
      this.textContent='\u25B6';
    }
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

  // === BOSS Tab Handlers ===
  function __wbUpdateBossStatus(){
    var ls=window.lastState||{};
    var ch=ls.char||{};
    var boss=ls.boss||{};
    var cd=boss.cd||{};
    var mode=ls.mode||'';
    // Boss name
    var nameEl=document.getElementById('__gmp_boss_name');
    var lvEl=document.getElementById('__gmp_boss_lv');
    if(nameEl)nameEl.textContent=boss.name?(boss.name+' (Lv.'+boss.lv+')'):'-- 無世界王 --';
    if(lvEl)lvEl.textContent='mode: '+mode;
    // Boss HP bar
    var hpEl=document.getElementById('__gmp_boss_hp_text');
    var hpBar=document.getElementById('__gmp_boss_hp_bar');
    if(hpEl)hpEl.textContent=boss.hp?(boss.hp+'/'+boss.maxHp):'--/--';
    if(hpBar){
      var pct=boss.maxHp>0?Math.round(boss.hp/boss.maxHp*100):0;
      hpBar.style.width=pct+'%';
      hpBar.style.background=pct>50?'#e94560':pct>25?'#fbbf24':'#dc2626';
    }
    // Buffs
    var bufEl=document.getElementById('__gmp_boss_buffs');
    if(bufEl){
      var parts=[];
      if(boss.barrierOn)parts.push('🛡️ 屏障 ON');
      if(boss.barrierHas)parts.push('📦 有屏障');
      bufEl.textContent=parts.length?parts.join(' | '):'';
    }
    // Cooldown timers
    var keys=['pot','atk','heal','convert','barrier'];
    keys.forEach(function(k){
      var el=document.getElementById('__gmp_cd_'+k);
      if(!el)return;
      var v=cd[k]||0;
      if(v>0.05){
        el.textContent=v.toFixed(1)+'s';
        el.style.color='#e94560';
      } else {
        el.textContent='就緒';
        el.style.color='#4ade80';
      }
    });
    // Socket status
    var sockEl=document.getElementById('__gmp_sock_status');
    if(sockEl)sockEl.textContent=window.__wbSocket?'✅ 已連接':'❌ 未連接';
    if(sockEl)sockEl.style.color=window.__wbSocket?'#4ade80':'#e94560';
    var sentEl=document.getElementById('__gmp_sock_sent');
    if(sentEl)sentEl.textContent=(window.__wbBossEmitLog||[]).length;
    var evtEl=document.getElementById('__gmp_sock_evts');
    if(evtEl)evtEl.textContent=(window.__sioPackets||[]).length;
  }

  // BOSS manual buttons
  document.getElementById('__gmp_boss_pot').onclick=function(){__wbSend('pot');};
  document.getElementById('__gmp_boss_atk').onclick=function(){__wbSend('atk');};
  document.getElementById('__gmp_boss_heal').onclick=function(){__wbSend('heal');};
  document.getElementById('__gmp_boss_convert').onclick=function(){__wbSend('convert');};
  document.getElementById('__gmp_boss_barrier').onclick=function(){__wbSend('barrier');};
  document.getElementById('__gmp_boss_holy').onclick=function(){__wbSend('holybarrier');};

  // Cooldown bypass toggle
  document.getElementById('__gmp_boss_bypass').onchange=function(){
    __wbToggleBypass(this.checked);
    if(this.checked){
      this.parentElement.parentElement.style.border='1px solid #ffd700';
    } else {
      this.parentElement.parentElement.style.border='none';
    }
  };

  // === 世界王列表 - 按鈕監聽 ===
  document.getElementById('__gmp_wb_refresh').onclick=function(){
    __wbUpdateWorldBossUI();
    var evtEl=document.getElementById('__gmp_wb_evt_name');
    if(evtEl){evtEl.textContent='DOM 即時讀取';evtEl.style.color='#4ade80';}
    this.textContent='已刷新!';
    var _t=this;
    setTimeout(function(){var b=document.getElementById('__gmp_wb_refresh');if(b)b.textContent='\u2699 刷新';},1500);
  };
  document.getElementById('__gmp_wb_auto').onchange=function(){
    if(this.checked){
      __wbStartWorldBossTimer();
    } else {
      __wbStopWorldBossTimer();
    }
  };
  document.getElementById('__gmp_wb_show_detected').onclick=function(){
    var evts=window.__wbAllEvents||[];
    var allNames={};
    var bossCandidates={};
    evts.slice(-200).forEach(function(e){
      allNames[e.evt]=(allNames[e.evt]||0)+1;
      if(/respawn|worldBoss|bossList|world_boss|RefreshBoss|getBoss|bossInfo|boss/i.test(e.evt)){
        bossCandidates[e.evt]=(bossCandidates[e.evt]||0)+1;
      }
    });
    var allSorted=Object.keys(allNames).sort(function(a,b){return allNames[b]-allNames[a]});
    var bossSorted=Object.keys(bossCandidates).sort(function(a,b){return bossCandidates[b]-bossCandidates[a]});
    console.log('[WB] All event names:',allSorted.slice(0,20));
    var lines=[];
    if(bossSorted.length){
      lines.push('=== 世界王候選事件 ===');
      bossSorted.slice(0,10).forEach(function(k,i){lines.push((i+1)+'. '+k+' (x'+bossCandidates[k]+')');});
      lines.push('');
    }
    lines.push('=== 所有事件 (前20) ===');
    allSorted.slice(0,20).forEach(function(k,i){lines.push((i+1)+'. '+k+' (x'+allNames[k]+')');});
    var msg=lines.join('\n');
    console.log('[WB] Events:\n'+msg);
    alert(msg.length>600?msg.substring(0,600)+'\n...(console 有完整列表)':msg);
  };
  // 世界王 UI 更新訂閱（cache 更新時即時刷新）
  __wbSubscribeWorldBoss(function(evtName,data){
    __wbUpdateWorldBossUI();
    var evtEl=document.getElementById('__gmp_wb_evt_name');
    if(evtEl)evtEl.textContent=evtName||'unknown';
  });

  // Auto boss
  function __wbSyncAutoConfig(){
    var cfg=window.__wbBossAuto;
    cfg.atk=document.getElementById('__gmp_boss_auto_atk').checked;
    cfg.atkHpPct=parseInt(document.getElementById('__gmp_boss_auto_atk_hp_pct').value)||100;
    cfg.atkLogic=document.getElementById('__gmp_boss_auto_atk_logic').value;
    cfg.atkOnline=parseInt(document.getElementById('__gmp_boss_auto_atk_online').value)||0;
    cfg.stop=document.getElementById('__gmp_boss_auto_stop').checked;
    cfg.stopHpEnable=document.getElementById('__gmp_boss_auto_stop_hp_enable').checked;
    cfg.stopHp=parseInt(document.getElementById('__gmp_boss_auto_stop_hp').value)||30;
    cfg.stopMpEnable=document.getElementById('__gmp_boss_auto_stop_mp_enable')?document.getElementById('__gmp_boss_auto_stop_mp_enable').checked:false;
    cfg.stopMp=parseInt(document.getElementById('__gmp_boss_auto_stop_mp').value)||10;
    cfg.pot=document.getElementById('__gmp_boss_auto_pot').checked;
    cfg.potHp=parseInt(document.getElementById('__gmp_boss_auto_pot_hp').value)||80;
    cfg.atkSkill=document.getElementById('__gmp_boss_auto_atk_skill').checked;
    cfg.heal=document.getElementById('__gmp_boss_auto_heal').checked;
    cfg.healHp=parseInt(document.getElementById('__gmp_boss_auto_heal_hp').value)||70;
    cfg.barrier=document.getElementById('__gmp_boss_auto_barrier').checked;
    cfg.bypass=document.getElementById('__gmp_boss_bypass')?document.getElementById('__gmp_boss_bypass').checked:false;
  }
  document.getElementById('__gmp_boss_auto_pot').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_heal').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_barrier').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_atk').addEventListener('change',__wbSyncAutoConfig);
  // === BOSS auto enable/config handlers ===
  document.getElementById('__gmp_boss_auto_enable').onchange=function(){
    if(this.checked){
      __wbSyncAutoConfig();
      __wbBossAutoStart();
      var btn=document.getElementById('__gmp_boss_auto_btn');
      if(btn){btn.textContent='\u25A0 停止自動戰鬥';btn.style.background='#e94560';}
      var s=document.getElementById('__gmp_boss_auto_status');
      if(s){s.textContent='\u26A1 自動戰鬥運行中...';s.style.color='#4ade80';}
      var ss=document.getElementById('__gmp_boss_auto_status_short');
      if(ss){ss.textContent='\u26A1 自動戰鬥運行中...';ss.style.color='#4ade80';}
    } else {
      __wbBossAutoStop();
      var btn=document.getElementById('__gmp_boss_auto_btn');
      if(btn){btn.textContent='\u25B6 啟動自動戰鬥';btn.style.background='#0f3460';}
      var s=document.getElementById('__gmp_boss_auto_status');
      if(s){s.textContent='停止中';s.style.color='#888';}
      var ss=document.getElementById('__gmp_boss_auto_status_short');
      if(ss){ss.textContent='停止中';ss.style.color='#888';}
    }
  };
  document.getElementById('__gmp_boss_auto_config_btn').onclick=function(){
    var modal=document.getElementById('__gmp_boss_auto_modal');
    if(modal){modal.style.display='flex';}
    setTimeout(function(){try{if(typeof __wbLoadEntrySkills==='function')__wbLoadEntrySkills();}catch(e){}},100);
  };
    var _hbtn=document.getElementById('__gmp_boss_history_btn');if(_hbtn)_hbtn.onclick=function(){
    if(typeof __wbOpenBossHistoryModal==='function')__wbOpenBossHistoryModal();
  };
  var _lbtn=document.getElementById('__gmp_boss_loot_btn');if(_lbtn)_lbtn.onclick=function(){
    if(typeof __wbOpenLootModal==='function')__wbOpenLootModal();
  };

  window.__wbOpenBossHistoryModal=function(){
    var modal=document.getElementById('__gmp_boss_history_modal');
    if(!modal)return;
    modal.style.display='flex';
    // Clear search
    var searchEl=document.getElementById('__gmp_boss_history_search');
    if(searchEl)searchEl.value='';
    // Load & render
    if(typeof __wbLoadBossHistory==='function'){
      __wbLoadBossHistory(function(){
        if(typeof __wbRenderBossHistoryList==='function')__wbRenderBossHistoryList();
      });
    } else if(typeof __wbRenderBossHistoryList==='function'){
      __wbRenderBossHistoryList();
    }
  };

  window.__wbCloseBossHistoryModal=function(){
    var modal=document.getElementById('__gmp_boss_history_modal');
    if(modal)modal.style.display='none';
  };

  window.__wbRenderBossHistoryList=function(){
    var listEl=document.getElementById('__gmp_boss_history_list');
    var countEl=document.getElementById('__gmp_boss_history_count');
    var searchEl=document.getElementById('__gmp_boss_history_search');
    if(!listEl)return;

    var history=window.__wbBossHistory||[];
    var search=searchEl?searchEl.value.trim().toLowerCase():'';

    var filtered=history;
    if(search){
      filtered=history.filter(function(e){
        return e.bossName.toLowerCase().indexOf(search)!==-1||
               e.event.toLowerCase().indexOf(search)!==-1||
               e.details.toLowerCase().indexOf(search)!==-1;
      });
    }

    // Sort by time descending
    filtered=filtered.slice().sort(function(a,b){return b.t-a.t;});

    if(countEl){
      var totalStr='\u5171 '+filtered.length+' \u6761';
      if(search) totalStr+=', \u641c\u7d22: &quot;'+search+'&quot;';
      countEl.textContent=totalStr;
    }

    if(!filtered.length){
      listEl.innerHTML='<div style="text-align:center;padding:20px;color:#555;">'+ (search?'\u65e0\u7b26\u5408\u6761\u4ef6\u7684\u8bb0\u5f55':'\u6682\u65e0 BOSS \u5386\u53f2\u8bb0\u5f55') +'</div>';
      return;
    }

    var eventLabels={
      'enter':'\u2705 \u8fdb\u5165',
      'reenter':'\uD83D\uDD04 \u91cd\u9032',
      'leave':'\u274C \u79bb\u5f00',
      'defeat':'\u2708 BOSS\u6483\u6557',
      'death':'\u2620 \u89d2\u8272\u6b7b\u4ea1',
      'fail_entry':'\u26A0 \u9032\u5165\u5931\u8d25',
      'skip':'\u23E9 \u8df3\u904e',
      'attack':'\u2694 \u653b\u51fb'
    };

  // === BOSS 掉落記錄 Modal ===
  var __gmp_boss_loot_modal = null;

  function __wbOpenLootModal(){
    if(__gmp_boss_loot_modal) { __gmp_boss_loot_modal.style.display='block'; return; }

    var modal = document.createElement('div');
    modal.id = '__gmp_boss_loot_modal';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:460px;max-height:500px;background:#1a1a2e;border:2px solid #6b4226;border-radius:8px;z-index:10002;padding:12px;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.6);color:#ddd;font-size:12px;';

    var title = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'+
      '<span style="color:#fbbf24;font-size:15px;font-weight:bold;">\uD83D\uDCB0 BOSS \u6389\u843d\u8A18\u9304</span>'+
      '<div>'+
        '<button id="__gmp_loot_clear_btn" style="padding:3px 8px;background:#4a1a1a;border:1px solid #e94560;color:#e94560;border-radius:3px;cursor:pointer;font-size:10px;margin-right:4px;">\u2726 \u5168\u90E8\u6E05\u7A7A</button>'+
        '<button id="__gmp_loot_close_btn" style="padding:3px 8px;background:#333;border:1px solid #555;color:#999;border-radius:3px;cursor:pointer;font-size:10px;">\u2716</button>'+
      '</div></div>';

    var searchHtml = '<div style="margin-bottom:6px;display:flex;gap:4px;">'+
      '<input id="__gmp_loot_search" type="text" placeholder="\u641C\u5C0B BOSS / \u7269\u54C1 / \u73A9\u5BB6..." style="flex:1;padding:4px 6px;background:#16213e;border:1px solid #0f3460;color:#ddd;border-radius:3px;font-size:11px;">'+
      '<button id="__gmp_loot_search_btn" style="padding:4px 10px;background:#0f3460;border:1px solid #1a5276;color:#86c5ff;border-radius:3px;cursor:pointer;font-size:10px;">\uD83D\uDD0D</button>'+
    '</div>';

    var listHtml = '<div id="__gmp_loot_list" style="max-height:380px;overflow-y:auto;"></div>';

    modal.innerHTML = title + searchHtml + listHtml;
    document.body.appendChild(modal);
    __gmp_boss_loot_modal = modal;

    // Close button
    document.getElementById('__gmp_loot_close_btn').onclick = function(){ modal.style.display='none'; };

    // Clear button
    document.getElementById('__gmp_loot_clear_btn').onclick = function(){
      if(confirm('\u786E\u8A8D\u6E05\u9664\u6240\u6709 BOSS \u6389\u843d\u8A18\u9304\uFF1F')){
        if(window.__wbClearBossLoot) window.__wbClearBossLoot();
        document.getElementById('__gmp_loot_list').innerHTML = '<div style="text-align:center;color:#666;padding:20px;">\u5DF2\u6E05\u9664</div>';
      }
    };

    // Search
    function renderLootList(filter){
      var data = (window.__wbGetBossLoot && window.__wbGetBossLoot()) || [];
      var container = document.getElementById('__gmp_loot_list');
      if(!container) return;

      if(data.length === 0){
        container.innerHTML = '<div style="text-align:center;color:#666;padding:30px;font-size:13px;">\u6682\u7121 BOSS \u6389\u843d\u8A18\u9304</div>';
        return;
      }

      var html = '';
      var reversed = data.slice().reverse();
      reversed.forEach(function(entry){
        // Filter
        if(filter){
          var f = filter.toLowerCase();
          var match = entry.bossName.toLowerCase().indexOf(f) >= 0;
          if(!match && entry.drops){
            entry.drops.forEach(function(d){
              if(d.item.toLowerCase().indexOf(f) >= 0 || d.winner.toLowerCase().indexOf(f) >= 0) match = true;
            });
          }
          if(!match && entry.rank){
            entry.rank.forEach(function(r){
              if(r.player.toLowerCase().indexOf(f) >= 0) match = true;
            });
          }
          if(!entry.drops || !entry.rank) match = true;
          if(!match) return;
        }

        var d = new Date(entry.t);
        var timeStr = d.getFullYear() + '/' + (d.getMonth()+1).toString().padStart(2,'0') + '/' + d.getDate().toString().padStart(2,'0') + ' ' +
          d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');

        html += '<div style="background:rgba(107,66,38,0.12);border:1px solid rgba(107,66,38,0.3);border-radius:5px;padding:8px;margin-bottom:6px;">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
            '<span style="color:#fbbf24;font-weight:bold;font-size:12px;">\u2694 ' + entry.bossName + '</span>'+
            '<span style="color:#888;font-size:10px;">' + timeStr + '</span>'+
          '</div>';

        if(entry.mvp){
          html += '<div style="font-size:10px;color:#7be87b;margin-bottom:4px;">\uD83C\uDFC6 MVP: ' + entry.mvp + '</div>';
        }

        if(entry.drops && entry.drops.length > 0){
          html += '<div style="font-size:10px;color:#aaa;margin-bottom:2px;">\u2728 \u6389\u843d:</div>';
          html += '<div style="font-size:10px;padding-left:8px;">';
          entry.drops.forEach(function(drop){
            var icon = drop.icon ? (drop.icon.startsWith('assets/') ? '\uD83C\uDF92' : '') : '\uD83D\uDC8E';
            html += '<div style="display:flex;justify-content:space-between;padding:1px 0;">'+
              '<span>' + icon + ' ' + drop.item + '</span>'+
              (drop.winner ? '<span style="color:#86c5ff;">' + drop.winner + '</span>' : '') +
            '</div>';
          });
          html += '</div>';
        }

        if(entry.rank && entry.rank.length > 0){
          html += '<div style="font-size:10px;color:#aaa;margin-top:4px;margin-bottom:2px;">\uD83D\uDCCA \u50B7\u5BB3\u6392\u540D:</div>';
          html += '<div style="font-size:10px;padding-left:8px;max-height:120px;overflow-y:auto;">';
          entry.rank.forEach(function(r){
            html += '<div style="display:flex;justify-content:space-between;padding:1px 0;">'+
              '<span style="color:' + (r.rank <= 3 ? '#fbbf24' : '#aaa') + ';">#' + r.rank + '</span>'+
              '<span>' + r.player + '</span>'+
              '<span style="color:#86c5ff;">' + r.damage + '</span>'+
            '</div>';
          });
          html += '</div>';
        }

        // Participants count
        if(entry.participants && entry.participants.length > 0){
          html += '<div style="font-size:9px;color:#666;margin-top:3px;">\uD83D\uDC65 \u53C3\u8207 ' + entry.participants.length + ' \u4EBA</div>';
        }

        html += '</div>';
      });

      container.innerHTML = html || '<div style="text-align:center;color:#666;padding:20px;">\u6C92\u6709\u7B26\u5408\u7684\u8A18\u9304</div>';
    }

    // Initial render
    renderLootList('');

    // Search handler
    var searchInput = document.getElementById('__gmp_loot_search');
    var searchBtn = document.getElementById('__gmp_loot_search_btn');
    function doSearch(){
      renderLootList(searchInput.value);
    }
    searchBtn.onclick = doSearch;
    searchInput.onkeypress = function(e){ if(e.keyCode===13) doSearch(); };

    // Click outside to close
    modal.onclick = function(e){
      if(e.target === modal) modal.style.display='none';
    };
  }

  function __wbCloseLootModal(){
    if(__gmp_boss_loot_modal) __gmp_boss_loot_modal.style.display='none';
  }

  // === BOSS 掉落記錄開關 ===
  function __wbSaveLootSetting(){
    var chk=document.getElementById('__gmp_boss_auto_loot');
    if(chk) chrome.storage.local.set({ wb_boss_auto_loot: chk.checked });
  }
  function __wbLoadLootSetting(){
    chrome.storage.local.get('wb_boss_auto_loot',function(r){
      var chk=document.getElementById('__gmp_boss_auto_loot');
      if(chk && r.wb_boss_auto_loot===false) chk.checked=false;
      else if(chk) chk.checked=true;
    });
  }
  // Wire change handler
  document.addEventListener('change',function(e){
    if(e.target && e.target.id==='__gmp_boss_auto_loot') __wbSaveLootSetting();
  });

    var eventColors={
      'enter':'#4ade80',
      'reenter':'#86efac',
      'leave':'#f87171',
      'defeat':'#fbbf24',
      'death':'#ef4444',
      'fail_entry':'#fb923c',
      'skip':'#888',
      'attack':'#60a5fa'
    };

    var html=filtered.map(function(e){
      var ts=new Date(e.t);
      var dateStr=
        ts.getFullYear()+'-'+
        String(ts.getMonth()+1).padStart(2,'0')+'-'+
        String(ts.getDate()).padStart(2,'0')+' '+
        String(ts.getHours()).padStart(2,'0')+':'+
        String(ts.getMinutes()).padStart(2,'0')+':'+
        String(ts.getSeconds()).padStart(2,'0');
      var label=eventLabels[e.event]||e.event;
      var color=eventColors[e.event]||'#aaa';
      return '<div style="display:flex;align-items:flex-start;gap:4px;padding:5px 6px;border-bottom:1px solid #222;font-size:10px;">'+
        '<span style="color:#888;min-width:100px;white-space:nowrap;">'+dateStr+'</span>'+
        '<span style="color:'+color+';min-width:64px;font-weight:bold;">'+label+'</span>'+
        '<span style="color:#ffd700;min-width:60px;">'+e.bossName+'</span>'+
        '<span style="color:#ccc;flex:1;">'+e.details+'</span>'+
        (e.nextRespawn?'<span style="color:#888;min-width:50px;">\u751f:'+e.nextRespawn+'</span>':'')+
      '</div>';
    }).join('');
    listEl.innerHTML=html;
  };

  // Also bind modal close on backdrop click
  window.__wbBossHistoryModalBackdrop=function(e){
    if(e.target===this){
      if(typeof __wbCloseBossHistoryModal==='function')__wbCloseBossHistoryModal();
    }
  };
  
  // === BOSS 歷史記錄 Modal ===
  var historyModal=document.createElement('div');
  historyModal.id='__gmp_boss_history_modal';
  historyModal.style.cssText='display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:9999;justify-content:center;align-items:center;';
  historyModal.innerHTML=
    '<div style="background:#1a1a2e;border:2px solid #0f3460;border-radius:10px;padding:16px;width:450px;max-height:80vh;display:flex;flex-direction:column;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'+
        '<span style="font-size:14px;color:#86c5ff;font-weight:bold;">\uD83D\uDCCB BOSS \u5386\u53f2\u8bb0\u5f55</span>'+
        '<button id="__gmp_boss_history_close" style="background:transparent;border:none;color:#888;font-size:18px;cursor:pointer;">\u2716</button>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">'+
        '<input id="__gmp_boss_history_search" type="text" placeholder="\u641c\u7d22 BOSS \u540d\u79f0 / \u4e8b\u4ef6..." style="flex:1;padding:5px 8px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;">'+
        '<button id="__gmp_boss_history_search_btn" style="padding:5px 10px;background:#1a3a6e;border:1px solid #0f3460;color:#86c5ff;border-radius:4px;cursor:pointer;font-size:10px;">\uD83D\uDD0D</button>'+
        '<button id="__gmp_boss_history_clear" style="padding:5px 10px;background:#4a1a1a;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;">🗑 \u5168\u90e8\u6e05\u7a7a</button>'+
      '</div>'+
      '<div id="__gmp_boss_history_count" style="font-size:9px;color:#888;margin-bottom:6px;"></div>'+
      '<div id="__gmp_boss_history_list" style="flex:1;overflow-y:auto;font-size:10px;"></div>'+
    '</div>';
  document.body.appendChild(historyModal);

  document.getElementById('__gmp_boss_history_close').onclick=function(){
    document.getElementById('__gmp_boss_history_modal').style.display='none';
  };
  document.getElementById('__gmp_boss_history_search_btn').onclick=function(){
    if(typeof __wbRenderBossHistoryList==='function')__wbRenderBossHistoryList();
  };
  document.getElementById('__gmp_boss_history_search').onkeydown=function(e){
    if(e.key==='Enter'&&typeof __wbRenderBossHistoryList==='function')__wbRenderBossHistoryList();
  };
  document.getElementById('__gmp_boss_history_clear').onclick=function(){
    if(confirm('\u786e\u5b9a\u6e05\u7a7a\u5168\u90e8 BOSS \u5386\u53f2\u8bb0\u5f55\uff1f')){
      var p=typeof __wbClearBossHistory==='function'?__wbClearBossHistory():Promise.resolve();
      p.then(function(){if(typeof __wbRenderBossHistoryList==='function')__wbRenderBossHistoryList();});
    }
  };

  document.getElementById('__gmp_boss_auto_modal_close').onclick=function(){
    var modal=document.getElementById('__gmp_boss_auto_modal');
    if(modal){modal.style.display='none';}
  };
  var _ph=document.getElementById('__gmp_boss_auto_pot_hp');if(_ph)_ph.addEventListener('input',__wbSyncAutoConfig);
  var _bpct=document.getElementById('__gmp_boss_auto_barrier_pct');if(_bpct)_bpct.addEventListener('input',__wbSyncAutoConfig);

  // === BOSS config save/load ===


  // === BOSS 進入設定 handler ===
  function checkEntryField(field){
    var el=document.getElementById('__gmp_boss_entry_'+field);
    var chk=document.getElementById('__gmp_boss_entry_'+field+'_chk');
    if(!el||!chk)return;
    if(el.value&&el.value!==''){
      chk.textContent='\u2714\uFE0F';
      chk.style.color='#4ade80';
    }else{
      chk.textContent='\u25CB';
      chk.style.color='#555';
    }
  }

  function saveEntrySettings(){
    if(typeof window.__gmStorageGet==='undefined')return;
    var atkSkill=document.getElementById('__gmp_boss_entry_atkSkill');
    var potType=document.getElementById('__gmp_boss_entry_potType');
    var healSkill=document.getElementById('__gmp_boss_entry_healSkill');
    window.__gmStorageGet(['wb_boss_entry_settings']).then(function(existing){
      var data=existing&&existing.wb_boss_entry_settings?existing.wb_boss_entry_settings:{};
      data.atkSkill=atkSkill?atkSkill.value:'';
      data.potType=potType?potType.value:'';
      data.healSkill=healSkill?healSkill.value:'';
      data.updatedAt=Date.now();
      return window.__gmStorageSet('wb_boss_entry_settings',data);
    }).then(function(){
      checkEntryField('atkSkill');
      checkEntryField('potType');
      checkEntryField('healSkill');
      var btn=document.getElementById('__gmp_boss_entry_save');
      if(btn){btn.textContent='\u2714\uFE0F 已儲存!';btn.style.border='none';btn.style.background='#0a3a0a';setTimeout(function(){btn.textContent='儲存設定';btn.style.border='1px solid #4ade80';btn.style.background='#1a4a1a';},2000);}
    }).catch(function(){});
  }

  function resetEntrySettings(){
    if(typeof window.__gmStorageGet==='undefined')return;
    window.__gmStorageGet(['wb_boss_entry_settings']).then(function(existing){
      var data=existing&&existing.wb_boss_entry_settings?existing.wb_boss_entry_settings:{};
      delete data.atkSkill;
      delete data.potType;
      delete data.healSkill;
      data.updatedAt=Date.now();
      return window.__gmStorageSet('wb_boss_entry_settings',data);
    }).then(function(){
      var el1=document.getElementById('__gmp_boss_entry_atkSkill');if(el1)el1.value='';
      var el2=document.getElementById('__gmp_boss_entry_potType');if(el2)el2.value='';
      var el3=document.getElementById('__gmp_boss_entry_healSkill');if(el3)el3.value='';
      checkEntryField('atkSkill');checkEntryField('potType');checkEntryField('healSkill');
    }).catch(function(){});
  }

  function __wbLoadEntrySkills(){
    try{
      var atkSel=document.getElementById('__gmp_boss_entry_atkSkill');
      var healSel=document.getElementById('__gmp_boss_entry_healSkill');
      if(!atkSel&&!healSel)return;

      // 優先使用 runtime 的 __gmSkillMap（由 refreshSkillDatalist 從 DOM 掃描）
      var skillMap=window.__gmSkillMap||{};
      var skillKeys=Object.keys(skillMap);

      if(skillKeys.length>0){
        // 直接使用 __gmSkillMap（最即時，有中文名）
        buildDropdowns(skillKeys, function(id){ return skillMap[id] || id; });
        return;
      }

      // Fallback 1: 從 __pmSkillNames runtime 物件
      if(window.__pmSkillNames && typeof window.__pmSkillNames === 'object'){
        var names=window.__pmSkillNames;
        var keys=Object.keys(names);
        if(keys.length>0){
          buildDropdowns(keys, function(id){ return names[id] || id; });
          return;
        }
      }

      // Fallback 2: 從 gmSkillSettings (chrome.storage)
      var charName=window.__gmCharName||(window.lastState&&window.lastState.charName)||'';
      __gmStorageGet(['gmSkillSettings']).then(function(result){
        var arr=result&&result.gmSkillSettings||[];
        var entry=null;
        for(var i=0;i<arr.length;i++){
          if(arr[i].charName===charName){entry=arr[i];break;}
        }
        if(!entry||!entry.skills)return;
        var skillIds=Object.keys(entry.skills);
        var names=entry.skillNames||{};
        buildDropdowns(skillIds, function(id){ return names[id] || id; });
      }).catch(function(){});
    }catch(e){console.warn('[GM] load entry skills error:',e);}

    function buildDropdowns(ids, labelFn){
      try{
        var atkSel=document.getElementById('__gmp_boss_entry_atkSkill');
        var healSel=document.getElementById('__gmp_boss_entry_healSkill');
        if(!atkSel||!healSel)return;

        // 過濾掉數值類 key，只留技能
        var valid=ids.filter(function(id){
          return id.indexOf('sk_')===0;
        });
        if(valid.length<3)valid=ids; // 過濾太少就用全部

        // 排除非技能 key (如 hpThreshold, mpThreshold 等)
        var skip=/^(hpThreshold|mpThreshold|hp_|mp_|target_|monster_|delay_|auto_|farm_|timeout_|scroll_)/;
        valid=valid.filter(function(id){ return !skip.test(id); });

        if(valid.length<3)valid=ids;

        var atkOpts='<option value="">-- 請選擇 --</option>';
        var healOpts='<option value="">-- 請選擇 --</option>';
        for(var i=0;i<valid.length;i++){
          var id=valid[i];
          var label=labelFn(id);
          var opt='<option value="'+id+'">'+label+'</option>';
          atkOpts+=opt;
          healOpts+=opt;
        }
        atkSel.innerHTML=atkOpts;
        healSel.innerHTML=healOpts;

        // 載入已儲存的設定
        __gmStorageGet(['wb_boss_entry_settings']).then(function(r2){
          if(r2&&r2.wb_boss_entry_settings){
            var s=r2.wb_boss_entry_settings;
            if(s.atkSkill){atkSel.value=s.atkSkill;checkEntryField('atkSkill');}
            if(s.potType){var el=document.getElementById('__gmp_boss_entry_potType');if(el){el.value=s.potType;checkEntryField('potType');}}
            if(s.healSkill){healSel.value=s.healSkill;checkEntryField('healSkill');}
          }
        }).catch(function(){});
      }catch(e){
        console.warn('[GM] buildDropdowns error:',e);
      }
    }
  }

  // 監聽按鈕與下拉變更
  setTimeout(function(){
    var atkS=document.getElementById('__gmp_boss_entry_atkSkill');
    var potS=document.getElementById('__gmp_boss_entry_potType');
    var healS=document.getElementById('__gmp_boss_entry_healSkill');
    if(atkS)atkS.addEventListener('change',function(){checkEntryField('atkSkill');saveEntrySettings();});
    if(potS)potS.addEventListener('change',function(){checkEntryField('potType');saveEntrySettings();});
    if(healS)healS.addEventListener('change',function(){checkEntryField('healSkill');saveEntrySettings();});
    var sv=document.getElementById('__gmp_boss_entry_save');
    if(sv)sv.onclick=saveEntrySettings;
    var rs=document.getElementById('__gmp_boss_entry_reset');
    if(rs)rs.onclick=resetEntrySettings;
  },200);


  function __wbSaveBossConfig(){
    if(typeof window.__gmStorageSet==='undefined')return;
    __wbSyncAutoConfig(); // 先把 UI 同步到 runtime 再儲存
    var cfg=window.__wbBossAuto;
    window.__gmStorageSet('wb_boss_config',JSON.parse(JSON.stringify(cfg))).catch(function(){});
  }
  function __wbLoadBossConfig(){
    if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();
    return window.__gmStorageGet(['wb_boss_config']).then(function(r){
      var saved=r&&r.wb_boss_config||null;
      if(saved){
        Object.assign(window.__wbBossAuto,saved);
        __wbApplyBossConfigUI();
      }
    }).catch(function(){});
  }
  function __wbApplyBossConfigUI(){
    var cfg=window.__wbBossAuto;
    var el=document.getElementById('__gmp_boss_auto_pot');if(el)el.checked=cfg.pot;
    el=document.getElementById('__gmp_boss_auto_heal');if(el)el.checked=cfg.heal;
    el=document.getElementById('__gmp_boss_auto_atk');if(el)el.checked=cfg.atk;
    el=document.getElementById('__gmp_boss_auto_atk_hp_pct');if(el)el.value=cfg.atkHpPct||100;
    el=document.getElementById('__gmp_boss_auto_atk_logic');if(el)el.value=cfg.atkLogic||'AND';
    el=document.getElementById('__gmp_boss_auto_atk_online');if(el)el.value=cfg.atkOnline||0;
    el=document.getElementById('__gmp_boss_auto_stop');if(el)el.checked=cfg.stop;
    el=document.getElementById('__gmp_boss_auto_stop_hp_enable');if(el)el.checked=cfg.stopHpEnable!==false;
    el=document.getElementById('__gmp_boss_auto_stop_hp');if(el)el.value=cfg.stopHp||30;
    el=document.getElementById('__gmp_boss_auto_stop_mp_enable');if(el)el.checked=cfg.stopMpEnable||false;
    el=document.getElementById('__gmp_boss_auto_stop_mp');if(el)el.value=cfg.stopMp||10;
    el=document.getElementById('__gmp_boss_auto_pot');if(el)el.checked=cfg.pot;
    el=document.getElementById('__gmp_boss_auto_pot_hp');if(el)el.value=cfg.potHp||80;
    el=document.getElementById('__gmp_boss_auto_atk_skill');if(el)el.checked=cfg.atkSkill;
    el=document.getElementById('__gmp_boss_auto_heal');if(el)el.checked=cfg.heal;
    el=document.getElementById('__gmp_boss_auto_heal_hp');if(el)el.value=cfg.healHp||70;
    el=document.getElementById('__gmp_boss_auto_barrier');if(el)el.checked=cfg.barrier;
    el=document.getElementById('__gmp_boss_bypass');if(el)el.checked=cfg.bypass;
  }
  // Auto-save on any change
  ['__gmp_boss_auto_atk','__gmp_boss_auto_atk_hp_pct','__gmp_boss_auto_atk_logic','__gmp_boss_auto_atk_online',
   '__gmp_boss_auto_stop','__gmp_boss_auto_stop_hp','__gmp_boss_auto_stop_hp_enable',
   '__gmp_boss_auto_stop_mp','__gmp_boss_auto_stop_mp_enable',
   '__gmp_boss_auto_pot','__gmp_boss_auto_pot_hp',
   '__gmp_boss_auto_atk_skill',
   '__gmp_boss_auto_heal','__gmp_boss_auto_heal_hp',
   '__gmp_boss_auto_barrier',
   '__gmp_boss_bypass',
  ].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('change',function(){setTimeout(__wbSaveBossConfig,100);});
    if(el&&el.tagName==='INPUT'&&el.type==='number')el.addEventListener('input',function(){setTimeout(__wbSaveBossConfig,100);});
  });
  // Load saved config
  setTimeout(__wbLoadBossConfig,300);
  // === BOSS auto script save/load ===
  document.getElementById('__gmp_boss_auto_script_enable').onchange=function(){
    if(this.checked){
      if(window.__wbBossAutoScriptStart)window.__wbBossAutoScriptStart();
    } else {
      if(window.__wbBossAutoScriptStop)window.__wbBossAutoScriptStop();
    }
    __wbSaveBossAutoScriptState();
  };
  function __wbSaveBossAutoScriptState(){
    if(typeof window.__gmStorageSet==='undefined')return;
    var chk=document.getElementById('__gmp_boss_auto_script_enable');
    window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});
  }
  function __wbLoadBossAutoScriptState(){
    if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();
    return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){
      var s=r&&r.wb_auto_script_state||null;
      if(s){
        var chk=document.getElementById('__gmp_boss_auto_script_enable');
        if(chk)chk.checked=s.enabled;
        if(s.enabled)setTimeout(function(){if(window.__wbBossAutoScriptStart)window.__wbBossAutoScriptStart();},800);
      }
    }).catch(function(){});
  }
  setTimeout(__wbLoadBossAutoScriptState,500);
  document.getElementById('__gmp_boss_auto_btn').onclick=function(){
    if(window.__wbBossAuto.running){
      __wbBossAutoStop();
      this.textContent='▶ 啟動自動戰鬥';
      this.style.background='#0f3460';
      var s=document.getElementById('__gmp_boss_auto_status');
      if(s){s.textContent='停止中';s.style.color='#888';}var ce=document.getElementById('__gmp_boss_auto_enable');if(ce)ce.checked=false;var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}
    } else {
      __wbSyncAutoConfig();
      __wbSaveBossConfig();
      __wbBossAutoStart();
      this.textContent='■ 停止自動戰鬥';
      this.style.background='#e94560';var ce=document.getElementById('__gmp_boss_auto_enable');if(ce)ce.checked=true;var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='⚡ 自動戰鬥運行中...';ss.style.color='#4ade80';}
    }
  };

  // BOSS status update loop
  var __wbBossUpdTimer=null;
  function __wbBossStartUpdater(){
    if(__wbBossUpdTimer)return;
    __wbBossUpdTimer=setInterval(function(){
      if(activeTab==='boss')__wbUpdateBossStatus();
          window.__wbInitHuntToggle();
          window.__wbUpdateHuntListUI();
    },500);
  }
  // 每60秒刷新 DOM 世界王神像資訊（人數變化、重生狀態）
  function __wbBossStartRefresher(){
    var _refInt=setInterval(function(){
      if(activeTab=='boss'){
        __wbUpdateBossStatus();
        var cs=document.querySelectorAll('.wb-status-card');
        if(cs.length)cs.forEach(function(c){try{c.click();}catch(e){}});
        setTimeout(function(){if(activeTab=='boss')__wbUpdateBossStatus();},1500);
      }
    },60000);
    window.___wbBossRefInterval=_refInt;
  }
  __wbBossStartRefresher();
  __wbBossStartUpdater();

  // === IDB 全域匯出/匯入 ===
  function __gmShowIdbStatus(msg,color){
    var el=document.getElementById('__gmp_idb_status');
    if(!el)return;
    el.textContent=msg;el.style.color=color||'#888';
    clearTimeout(window.__gmIdbTimer);
    window.__gmIdbTimer=setTimeout(function(){
      var e=document.getElementById('__gmp_idb_status');
      if(e)e.textContent='';
    },4000);
  }

  document.getElementById('__gmp_export_all').onclick=function(){ __gmExportAllSettings(); };

  document.getElementById('__gmp_import_all').onclick=function(){
    if(!window.__gmAdvanced){
      __gmShowIdbStatus('⚠️ 進階模組尚未載入，請稍候再試','#fbbf24');
      return;
    }
    // 同時匯出進階資料 + 登出歷史
    Promise.all([
      window.__gmAdvanced.exportAll(),
      LogoutDB.exportCache()
    ]).then(function(results){
      var data=results[0];
      data.logout_history=results[1];
      var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      a.href=url;a.download='gm-panel-settings-'+(new Date().toISOString().slice(0,10))+'.json';
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
      var ruleCount=data.advanced_rules?data.advanced_rules.length:0;
      var monsterCount=data.monsters?data.monsters.length:0;
      __gmShowIdbStatus('✅ 匯出成功：'+ruleCount+' 規則 / '+monsterCount+' 怪物 / 技能設定 / '+data.logout_history.length+' 登入紀錄','#4ade80');
    }).catch(function(e){
      __gmShowIdbStatus('❌ 匯出失敗：'+e.message,'#e94560');
    });
  };

  document.getElementById('__gmp_import_all').onclick=function(){
    var inp=document.getElementById('__gmp_import_file');
    inp.value='';inp.click();
  };

  document.getElementById('__gmp_import_file').onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        if(!window.__gmAdvanced){
          __gmShowIdbStatus('⚠️ 進階模組尚未載入，請稍候再試','#fbbf24');
          return;
        }
        window.__gmAdvanced.importAll(data).then(function(){
          __gmShowIdbStatus('✅ 匯入成功，請重新開啟進階設定查看','#4ade80');
          if(window.__gmAdvanced.refreshMonsterDatalist)window.__gmAdvanced.refreshMonsterDatalist();
          if(window.__gmAdvanced.refreshSkillDatalist)window.__gmAdvanced.refreshSkillDatalist();
          // 匯入登出歷史
          if(data.logout_history&&Array.isArray(data.logout_history)){
            LogoutDB.importCache(data.logout_history);
          }
        }).catch(function(err){
          __gmShowIdbStatus('❌ 匯入失敗：'+err.message,'#e94560');
        });
      }catch(ex){
        __gmShowIdbStatus('❌ JSON 格式錯誤','#e94560');
      }
    };
    reader.readAsText(file);
  };
  

  // === Test Reconnect button ===
  document.getElementById('__gmp_farm_logout_history').onclick=__gmOpenLogoutHistory;
  var advBtn=document.getElementById('__gmp_farm_advanced_settings');
  if(advBtn)advBtn.onclick=function(){
    if(window.__gmAdvanced&&typeof window.__gmAdvanced.openModal==='function'){
      try{
        window.__gmAdvanced.openModal();
      }catch(e){
        console.warn('[GM] openModal error:',e);
        alert('❌ 進階模組發生錯誤:\n'+e.message+'\n\n請重新整理頁面重試。');
      }
    } else if(window.__gmAdvanced){
      // window.__gmAdvanced 已載入但沒有 openModal
      console.warn('[GM] openModal not available, __gmAdvanced keys:',Object.keys(window.__gmAdvanced));
      alert('⚠️ 進階模組載入不完全（openModal 方法遺失）\n\n請重新整理頁面重試。');
    } else {
      // 檢查進階模組是否正在載入中
      var waitDialog=document.getElementById('__gmAdvModal');
      if(!waitDialog){
        // 顯示載入中提示，再等 5 秒重試
        alert('🔄 進階模組載入中...\n\n請稍候再點一次。\n若持續無法載入，請重新整理頁面。');
        // 延時重試一次
        setTimeout(function(){
          if(window.__gmAdvanced&&typeof window.__gmAdvanced.openModal==='function'){
            try{window.__gmAdvanced.openModal();}catch(e){}
          }
        },3000);
      }
    }
  };
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
    var d=window.lastState;
    if(!d||!d.char)return;
    try{
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
  window.__gmLoadFarmSettings(function(data){
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
    document.getElementById('__gmp_farm_hp_gt_chk').checked=data.hpGtEnabled!==false;
    document.getElementById('__gmp_farm_mp_gt_chk').checked=data.mpGtEnabled!==false;
    if(data.logicOp)document.getElementById('__gmp_farm_logic').value=data.logicOp;
    document.getElementById('__gmp_farm_logic_chk').checked=data.logicEnabled!==false;
    document.getElementById('__gmp_farm_atk').checked=data.autoAtk!==false;
    // 新增：指定目標 + 攻擊全部
    var elSpecify=document.getElementById('__gmp_farm_specify_target');
    var elTargetIdx=document.getElementById('__gmp_farm_target_index');
    var elAttackAll=document.getElementById('__gmp_farm_attack_all');
    if(elSpecify)elSpecify.checked=data.specifyTarget||false;
    if(elTargetIdx)elTargetIdx.value=data.targetIndex||1;
    if(elAttackAll)elAttackAll.checked=data.attackAll||false;
    // 新增：載入斷線重連設定
    if(data.charName)document.getElementById('__gmp_farm_char_name').value=data.charName;
    document.getElementById('__gmp_farm_reconnect').checked=data.reconnectEnabled!==false;
    if(data.reconnectInterval)document.getElementById('__gmp_farm_reconnect_interval').value=data.reconnectInterval;
    if(data.charSlot!==undefined)document.getElementById('__gmp_farm_char_slot').value=data.charSlot;
    // MP reconnect
    if(data.mpReconnectEnabled!==undefined)document.getElementById('__gmp_farm_mp_reconnect').checked=data.mpReconnectEnabled;
    if(data.mpReconnectThresh)document.getElementById('__gmp_farm_mp_reconnect_thresh').value=data.mpReconnectThresh;
    // HP/MP 動作下拉
    if(data.hpAction!==undefined){var ha=document.getElementById('__gmp_farm_hp_action');if(ha)ha.value=data.hpAction;}
    if(data.mpAction!==undefined){var ma=document.getElementById('__gmp_farm_mp_action');if(ma)ma.value=data.mpAction;}
    // 傳送延遲（雙拉條）
    if(data.teleportDelayMin!==undefined){
      var minEl=document.getElementById('__gmp_farm_teleport_delay_min');
      if(minEl){minEl.value=data.teleportDelayMin;}
      var minLbl=document.getElementById('__gmp_farm_teleport_delay_min_label');
      if(minLbl){minLbl.textContent=parseFloat(data.teleportDelayMin).toFixed(1)+'s';}
    }
    if(data.teleportDelayMax!==undefined){
      var maxEl=document.getElementById('__gmp_farm_teleport_delay_max');
      if(maxEl){maxEl.value=data.teleportDelayMax;}
      var maxLbl=document.getElementById('__gmp_farm_teleport_delay_max_label');
      if(maxLbl){maxLbl.textContent=parseFloat(data.teleportDelayMax).toFixed(1)+'s';}
    }
    // 向後相容：舊 key teleportDelay → 載入為 max
    if(data.teleportDelay!==undefined&&data.teleportDelayMax===undefined){
      var maxEl2=document.getElementById('__gmp_farm_teleport_delay_max');
      if(maxEl2){maxEl2.value=data.teleportDelay;}
      var maxLbl2=document.getElementById('__gmp_farm_teleport_delay_max_label');
      if(maxLbl2){maxLbl2.textContent=parseFloat(data.teleportDelay).toFixed(1)+'s';}
    }
  });

  // === Auto-save on change ===
  var farmInputs=['__gmp_farm_zone','__gmp_farm_hp','__gmp_farm_mp','__gmp_farm_hp_chk','__gmp_farm_mp_chk',
    '__gmp_farm_hp_gt','__gmp_farm_mp_gt','__gmp_farm_hp_gt_chk','__gmp_farm_mp_gt_chk',
    '__gmp_farm_logic','__gmp_farm_logic_chk','__gmp_farm_atk',
    '__gmp_farm_specify_target','__gmp_farm_target_index','__gmp_farm_attack_all',
    '__gmp_farm_char_name','__gmp_farm_reconnect','__gmp_farm_reconnect_interval',
    '__gmp_farm_mp_reconnect','__gmp_farm_mp_reconnect_thresh','__gmp_farm_char_slot',
    '__gmp_farm_teleport_delay_min','__gmp_farm_teleport_delay_max'];
  farmInputs.forEach(function(id){
    var el=document.getElementById(id);
    if(el){
      el.addEventListener('change',window.__gmSaveFarmSettings);
      el.addEventListener('input',window.__gmSaveFarmSettings);
    }
  });
}
// === Debug log wrapper ===
window.__gmDebugLog = true;
function gmLog() {
  if (window.__gmDebugLog) {
    console.log.apply(console, arguments);
  }
}

// === Dynamically add settings UI ===
// Add debug log toggle to game tab
var debugContainer = document.createElement('div');
debugContainer.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:8px;margin-bottom:8px;';
var debugChk = document.createElement('input');
debugChk.type = 'checkbox';
debugChk.id = '__gmp_debug_log';
debugChk.checked = true;
debugChk.style.cssText = 'width:14px;height:14px;cursor:pointer;';
debugChk.onchange = function() {
  window.__gmDebugLog = this.checked;
};
var debugLabel = document.createElement('label');
debugLabel.htmlFor = '__gmp_debug_log';
debugLabel.style.cssText = 'font-size:10px;color:#aaa;cursor:pointer;';
debugLabel.textContent = '顯示主控台偵測日誌';
debugContainer.appendChild(debugChk);
debugContainer.appendChild(debugLabel);

// Add export button to game tab
var exportBtn = document.createElement('button');
exportBtn.id = '__gmp_export_log';
exportBtn.textContent = '📥 匯出封包監控.log';
exportBtn.style.cssText = 'width:100%;padding:6px;background:#0f3460;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;margin-bottom:8px;';
exportBtn.onclick = function() {
  // Export packet logs
  var logs = [];
  if (window.__battleStatus && window.__battleStatus.packets) {
    logs = window.__battleStatus.packets.map(function(p) {
      return JSON.stringify(p);
    });
  }
  var content = logs.join('\n');
  var blob = new Blob([content], {type: 'text/plain'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '封包監控_' + new Date().toISOString().slice(0,10) + '.log';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert('已匯出 ' + logs.length + ' 筆封包記錄');
};

// Append to game tab
setTimeout(function() {
  var gameTab = document.getElementById('__gmp_tab_content_game');
  if (gameTab) {
    gameTab.appendChild(exportBtn);
    gameTab.appendChild(debugContainer);
  }
}, 100);

// === Auto-start countdown modal (10s) — MUST run before __gmBuildPanel or it gets blocked if build throws ===
(function initAutoStart(){
  if(!document.body){setTimeout(initAutoStart,100);return;}
  var sec=10;
  var timer=null;
  var modal=document.createElement('div');
  modal.id='__gmp_autostart_modal';
  modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.82);z-index:10000000;display:flex;align-items:center;justify-content:center;';
  var box=document.createElement('div');
  box.style.cssText='background:#1a1a2e;border:1px solid #0f3460;border-radius:14px;padding:28px 36px;text-align:center;max-width:400px;box-shadow:0 4px 30px rgba(0,0,0,0.7);';
  var titleEl2=document.createElement('div');
  titleEl2.style.cssText='font-size:18px;color:#4ade80;font-weight:bold;margin-bottom:18px;';
  titleEl2.textContent='\u23F1 \u81EA\u52D5\u555F\u52D5\u5012\u6578';
  box.appendChild(titleEl2);
  var countEl2=document.createElement('div');
  countEl2.id='__gmp_autostart_countdown';
  countEl2.style.cssText='font-size:52px;color:#ffd700;font-weight:bold;margin-bottom:14px;';
  countEl2.textContent=String(sec);
  box.appendChild(countEl2);
  var featEl=document.createElement('div');
  featEl.style.cssText='font-size:11px;color:#aaa;margin-bottom:18px;line-height:2;';
  featEl.textContent='\u2705 \u639B\u6A5F\u8173\u672C\n\u2705 BOSS \u81EA\u52D5\u9032\u5165\n\u2705 BOSS \u81EA\u52D5\u5075\u6E2C\u6230\u9B25';
  box.appendChild(featEl);
  var btnRow2=document.createElement('div');
  btnRow2.style.cssText='display:flex;gap:10px;justify-content:center;';
  var cancelBtn2=document.createElement('button');
  cancelBtn2.id='__gmp_autostart_cancel';
  cancelBtn2.style.cssText='padding:10px 28px;background:#e94560;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;';
  cancelBtn2.textContent='\u53D6\u6D88';
  btnRow2.appendChild(cancelBtn2);
  var nowBtn2=document.createElement('button');
  nowBtn2.id='__gmp_autostart_now';
  nowBtn2.style.cssText='padding:10px 28px;background:#4ade80;border:none;color:#000;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;';
  nowBtn2.textContent='\u7ACB\u5373\u555F\u52D5';
  btnRow2.appendChild(nowBtn2);
  box.appendChild(btnRow2);
  modal.appendChild(box);
  document.body.appendChild(modal);

  function doStart(){
    if(timer){clearInterval(timer);timer=null;}
    if(modal.parentNode)modal.remove();
    console.log('[AutoStart] Starting scripts...');
    try{ if(typeof startFarming==='function')startFarming(); }catch(e){ console.warn('[AutoStart] startFarming failed:',e.message); }
    try{
      var cb3=document.getElementById('__gmp_boss_auto_enable');
      if(cb3&&!cb3.checked){cb3.checked=true;cb3.dispatchEvent(new Event('change',{bubbles:true}));}
      if(typeof __wbBossAutoScriptStart==='function') __wbBossAutoScriptStart();
      if(typeof __wbBossAutoStart==='function') __wbBossAutoStart();
    }catch(e){ console.warn('[AutoStart] Boss scripts failed:',e.message); }
  }

  function doCancel(){
    if(timer){clearInterval(timer);timer=null;}
    if(modal.parentNode)modal.remove();
    console.log('[AutoStart] Cancelled by user');
  }

  cancelBtn2.onclick=doCancel;
  nowBtn2.onclick=doStart;

  timer=setInterval(function(){
    sec--;
    var el2=document.getElementById('__gmp_autostart_countdown');
    if(el2)el2.textContent=sec;
    if(sec<=0)doStart();
  },1000);
})();

// ==== 傳送延遲雙拉條綁定 ====
function __gmBindTeleportSliders(){
  var tpdMin=document.getElementById('__gmp_farm_teleport_delay_min');
  var tpdMinLbl=document.getElementById('__gmp_farm_teleport_delay_min_label');
  var tpdMax=document.getElementById('__gmp_farm_teleport_delay_max');
  var tpdMaxLbl=document.getElementById('__gmp_farm_teleport_delay_max_label');
  if(!tpdMin&&!tpdMax)return;
  if(tpdMinLbl){var mv=parseFloat(tpdMin&&tpdMin.value!=null?tpdMin.value:'0')||0;tpdMinLbl.textContent=mv.toFixed(1)+'s';}
  if(tpdMaxLbl){var xv=parseFloat(tpdMax&&tpdMax.value!=null?tpdMax.value:'0')||0;tpdMaxLbl.textContent=xv.toFixed(1)+'s';}
  function __gmDoSaveTeleportDelay(){
    if(typeof window.__gmStorageGet!=='function')return;
    var minV=parseFloat(tpdMin&&tpdMin.value!=null?tpdMin.value:'0')||0;
    var maxV=parseFloat(tpdMax&&tpdMax.value!=null?tpdMax.value:'0')||0;
    // 讀取現有設定，只更新 delay 欄位，保留其他欄位
    window.__gmStorageGet(['gmFarmSettings']).then(function(r){
      var existing=r&&r.gmFarmSettings||{};
      existing.teleportDelayMin=minV;
      existing.teleportDelayMax=maxV;
      return window.__gmStorageSet('gmFarmSettings',existing);
    }).catch(function(){});
  }
  if(tpdMin){
    tpdMin.oninput=function(){
      var minV=parseFloat(tpdMin.value)||0;
      var maxV=parseFloat(tpdMax&&tpdMax.value!=null?tpdMax.value:'0')||0;
      if(minV>maxV){tpdMax.value=tpdMin.value;if(tpdMaxLbl)tpdMaxLbl.textContent=minV.toFixed(1)+'s';}
      if(tpdMinLbl)tpdMinLbl.textContent=minV.toFixed(1)+'s';
      __gmDoSaveTeleportDelay();
    };
  }
  if(tpdMax){
    tpdMax.oninput=function(){
      var minV=parseFloat(tpdMin&&tpdMin.value!=null?tpdMin.value:'0')||0;
      var maxV=parseFloat(tpdMax.value)||0;
      if(maxV<minV){tpdMin.value=tpdMax.value;if(tpdMinLbl)tpdMinLbl.textContent=maxV.toFixed(1)+'s';}
      if(tpdMaxLbl)tpdMaxLbl.textContent=maxV.toFixed(1)+'s';
      __gmDoSaveTeleportDelay();
    };
  }
}
setTimeout(__gmBindTeleportSliders,300);

try { __gmBuildPanel(); } catch(e) { console.error('[GM] __gmBuildPanel failed:',e.message); }
document.addEventListener('__gm_show_panel',function(){ try{__gmBuildPanel()}catch(e){console.error(e)}; setTimeout(__gmBindTeleportSliders,100); });

  // 自動進入模式下拉：監聽變更並儲存/廣播
document.addEventListener('change',function(e){
    var t=e.target;
    if(t && t.id==='__gmp_boss_script_mode'){
  var _mode=t.value;console.log('[BossScript] Mode changed to:'+_mode);
      // 寫入 runtime state
      if(window.__wbBossAutoScript)window.__wbBossAutoScript.mode=_mode;
      // 顯示/隱藏定時設定 + 定時紀錄面板
      var cronDiv=document.getElementById('__gmp_cron_config');
      if(cronDiv)cronDiv.style.display=(_mode==='cron')?'block':'none';
      var cronLogSec=document.getElementById('__gmp_cron_log_section');
      if(cronLogSec)cronLogSec.style.display=(_mode==='cron')?'block':'none';
      if(_mode==='cron'&&typeof __wbRenderCronLog==='function'){setTimeout(__wbRenderCronLog,100);}
      // 儲存到 chrome.storage
      if(typeof __wbSaveBossScriptMode==='function')__wbSaveBossScriptMode(_mode);
    }
    // cron 參數變更時自動儲存
    if(t && (t.id==='__gmp_cron_start_min'||t.id==='__gmp_cron_stop_min'||t.id==='__gmp_cron_quick_enter')){
      if(typeof __wbSaveCronConfig==='function')__wbSaveCronConfig();
    }
  });

  // === 定時模式 BOSS 紀錄面板 ===
  window.__wbRenderCronLog=function(){
    var listEl=document.getElementById('__gmp_cron_log_list');
    var countEl=document.getElementById('__gmp_cron_log_count');
    if(!listEl)return;
    var history=window.__wbBossHistory||[];
    // 過濾：只顯示定時模式相關事件（排除即時、智能、__DIAG__）
    var filtered=history.filter(function(h){return h.bossName!=='__DIAG__';});
    if(countEl)countEl.textContent='('+filtered.length+')';
    if(!filtered.length){listEl.innerHTML='<span style="color:#666;">尚無紀錄</span>';return;}
    // 取最後 100 筆，新在上
    var items=filtered.slice(-100).reverse();
    var html='';
    items.forEach(function(h){
      var d=new Date(h.t);
      var ts=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
      var ec='#aaa';
      if(h.event==='defeat')ec='#e94560';
      else if(h.event==='enter'||h.event==='reenter')ec='#4caf50';
      else if(h.event==='skip'||h.event==='fail_entry')ec='#fbbf24';
      else if(h.event==='wait')ec='#86c5ff';
      else if(h.event==='leave')ec='#888';
      html+='<div style="display:flex;gap:4px;border-bottom:1px solid rgba(255,255,255,0.05);padding:2px 0;">'+
        '<span style="color:#666;min-width:44px;">'+ts+'</span>'+
        '<span style="color:'+ec+';min-width:28px;">['+h.event+']</span>'+
        '<span style="color:#ffd700;min-width:60px;">'+h.bossName+'</span>'+
        '<span style="color:#aaa;flex:1;">'+h.details+'</span>'+
      '</div>';
    });
    listEl.innerHTML=html;
  };

  // 摺疊切換
  var _logToggle=document.getElementById('__gmp_cron_log_toggle');
  var _logBody=document.getElementById('__gmp_cron_log_body');
  var _logArrow=document.getElementById('__gmp_cron_log_arrow');
  if(_logToggle&&_logBody&&_logArrow){
    _logToggle.onclick=function(){
      var vis=_logBody.style.display!=='none';
      _logBody.style.display=vis?'none':'block';
      _logArrow.textContent=vis?'\u25B6':'\u25BC';
      if(!vis&&typeof __wbRenderCronLog==='function'){
        if(typeof __wbLoadBossHistory==='function'){__wbLoadBossHistory(function(){__wbRenderCronLog();});}
        else __wbRenderCronLog();
      }
    };
  }

  // 清空
  var _logClear=document.getElementById('__gmp_cron_log_clear');
  if(_logClear)_logClear.onclick=function(){
    if(typeof __wbClearBossHistory==='function'){__wbClearBossHistory().then(function(){if(typeof __wbRenderCronLog==='function')__wbRenderCronLog();});}
    else{window.__wbBossHistory=[];if(typeof __wbRenderCronLog==='function')__wbRenderCronLog();}
  };

  // 匯出到 console (F12)
  var _logExport=document.getElementById('__gmp_cron_log_export');
  if(_logExport)_logExport.onclick=function(){
    var history=window.__wbBossHistory||[];
    var filtered=history.filter(function(h){return h.bossName!=='__DIAG__';});
    console.log('=== BOSS Cron Log Export ('+filtered.length+' entries) ===');
    console.table(filtered.map(function(h){return {time:new Date(h.t).toISOString(),boss:h.bossName,event:h.event,details:h.details};}));
    console.log(JSON.stringify(filtered,null,2));
    alert('已匯出 '+filtered.length+' 筆紀錄到 Console (F12)');
  };

  // === Socket 封包即時 Log 面板 ===
  var _pktLogPaused=false;
  var _pktLogPoolInterval=null;

  window.__gmRenderPacketLog=function(){
    var listEl=document.getElementById('__gmp_packet_log_list');
    var countEl=document.getElementById('__gmp_packet_log_count');
    if(!listEl)return;
    var logs=window.__gmPacketLog||[];
    var sendChk=document.getElementById('__gmp_pkt_send_chk');
    var recvChk=document.getElementById('__gmp_pkt_recv_chk');
    var showSend=sendChk?sendChk.checked:true;
    var showRecv=recvChk?recvChk.checked:true;
    var filtered=logs.filter(function(l){
      if(l.dir==='SEND')return showSend;
      if(l.dir==='RECV')return showRecv;
      return false;
    });
    if(countEl)countEl.textContent='('+filtered.length+')';
    var html='';
    for(var i=filtered.length-1;i>=Math.max(0,filtered.length-80);i--){
      var l=filtered[i];
      var time=new Date(l.t).toTimeString().slice(0,8);
      var dirColor=l.dir==='SEND'?'#4ade80':'#60a5fa';
      var dirLabel=l.dir==='SEND'?'\u2191':'\u2193';
      html+='<div style="margin-bottom:1px;font-size:9px;"><span style="color:#888;">'+time+'</span> <span style="color:'+dirColor+';">'+dirLabel+'</span> <span style="color:#fbbf24;">'+__gmEscapeHtml(l.evt||'?')+'</span> <span style="color:#aaa;">'+__gmEscapeHtml((l.args||'').substring(0,120))+'</span></div>';
    }
    listEl.innerHTML=html||'<div style="color:#555;font-style:italic;">尚無封包...</div>';
  };

  function __gmEscapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  if(!window.__gmPacketLogInit){
    window.__gmPacketLogInit=true;
    // 摺疊開關
    var _pktToggle=document.getElementById('__gmp_packet_log_toggle');
    var _pktBody=document.getElementById('__gmp_packet_log_body');
    var _pktArrow=document.getElementById('__gmp_packet_log_arrow');
    if(_pktToggle&&_pktBody&&_pktArrow){
      _pktToggle.onclick=function(e){
        if(e.target.tagName==='INPUT')return;
        var vis=_pktBody.style.display!=='block';
        _pktBody.style.display=vis?'block':'none';
        _pktArrow.textContent=vis?'\u25BC':'\u25B6';
        if(vis&&typeof window.__gmRenderPacketLog==='function'){
          window.__gmRenderPacketLog();
        }
      };
    }
    // 篩選 checkbox 變更即時刷新
    var _pktSend=document.getElementById('__gmp_pkt_send_chk');
    var _pktRecv=document.getElementById('__gmp_pkt_recv_chk');
    if(_pktSend)_pktSend.onchange=function(){if(typeof window.__gmRenderPacketLog==='function')window.__gmRenderPacketLog();};
    if(_pktRecv)_pktRecv.onchange=function(){if(typeof window.__gmRenderPacketLog==='function')window.__gmRenderPacketLog();};
    // 清空按鈕
    var _pktClear=document.getElementById('__gmp_packet_log_clear');
    if(_pktClear)_pktClear.onclick=function(){
      window.__gmPacketLog=[];
      if(typeof window.__gmRenderPacketLog==='function')window.__gmRenderPacketLog();
    };
    // 暫停/繼續按鈕
    var _pktPause=document.getElementById('__gmp_packet_log_pause');
    if(_pktPause)_pktPause.onclick=function(){
      _pktLogPaused=!_pktLogPaused;
      this.textContent=_pktLogPaused?'\u25B6 繼續':'暫停';
      this.style.color=_pktLogPaused?'#fbbf24':'#64b5f6';
    };
    // 定時刷新（每 500ms）
    _pktLogPoolInterval=setInterval(function(){
      if(_pktLogPaused)return;
      var body=document.getElementById('__gmp_packet_log_body');
      if(body&&body.style.display==='block'){
        if(typeof window.__gmRenderPacketLog==='function')window.__gmRenderPacketLog();
      }
    },500);
  }

console.log('[GM] Monitor injected '+ver);


  // === Gacha auto-send + history ===
  (function(){
    var gachaTimer = null;
    var gachaCount = 0;
    var gachaMax = 30;
    var gachaEnabled = false;
    var gachaHistory = [];
    var gachaObserver = null;
    var STORAGE_KEY = '__gmp_gacha_history';

    function updateHistSummary(){
      var el = document.getElementById('__gmp_gacha_hist_summary');
      if (el) { el.textContent = gachaHistory.length ? '📋 '+gachaHistory.length+' 筆歷史記錄' : ''; }
    }

    function gachaHistSave(){
      var data = gachaHistory.slice(0, 500);
      if (typeof window.__gmStorageSet === 'function') {
        window.__gmStorageSet(STORAGE_KEY, data).catch(function(){});
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        var o = {}; o[STORAGE_KEY] = data;
        chrome.storage.local.set(o, function(){});
      }
    }

    function gachaHistLoad(cb){
      function done(result){
        gachaHistory = (result && result[STORAGE_KEY]) || [];
        updateHistSummary();
        if (cb) cb();
      }
      if (typeof window.__gmStorageGet === 'function') {
        window.__gmStorageGet([STORAGE_KEY]).then(done).catch(function(){ done({}); });
      } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([STORAGE_KEY], function(result){
          if (chrome.runtime.lastError) { done({}); } else { done(result); }
        });
      } else {
        done({});
      }
    }

    function addGachaItem(itemName, itemColor){
      var now = new Date();
      var ts = now.getFullYear()+'-'+
        (now.getMonth()+1).toString().padStart(2,'0')+'-'+
        now.getDate().toString().padStart(2,'0')+' '+
        now.getHours().toString().padStart(2,'0')+':'+
        now.getMinutes().toString().padStart(2,'0')+':'+
        now.getSeconds().toString().padStart(2,'0');
      gachaHistory.unshift({name: itemName, time: ts, color: itemColor || '#4ade80'});
      if (gachaHistory.length > 500) gachaHistory.length = 500;
      updateHistSummary();
      gachaHistSave();
    }

    function startObservingGachaMsg(){
      if (gachaObserver) return;
      var msgEl = document.getElementById('gacha-msg');
      if (!msgEl) {
        // DOM not ready yet, retry
        setTimeout(startObservingGachaMsg, 2000);
        return;
      }
      gachaObserver = new MutationObserver(function(){
        var span = msgEl.querySelector('span');
        if (!span) {
          var text = msgEl.textContent.trim();
          if (text && text.indexOf('恭喜獲得') > -1) {
            var m = text.match(/恭喜獲得\s*(.+?)\s*[！!]?\s*$/);
            if (m && m[1]) addGachaItem(m[1].trim());
          }
          return;
        }
        var item = span.textContent.trim();
        var color = span.style.color || '';
        if (item) addGachaItem(item, color);
      });
      gachaObserver.observe(msgEl, {childList: true, subtree: true, characterData: true});
      console.log('[Gacha] Observer started on #gacha-msg');
    }

    function showHistModal(){
      var old = document.getElementById('__gmp_gacha_modal'); if (old) old.remove();
      var m = document.createElement('div'); m.id = '__gmp_gacha_modal';
      m.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:transparent;z-index:99998;display:flex;align-items:flex-start;justify-content:center;padding-top:40px;pointer-events:none;';
      var items = gachaHistory.map(function(h, i){
        return '<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid rgba(34,211,238,0.1);">'+
          '<span style="flex:1;color:'+(h.color||'#4ade80')+';font-size:14px;font-weight:bold;font-family:sans-serif;">'+h.name+'</span>'+
          '<span style="color:#666;font-size:11px;">'+h.time+'</span>'+
          '</div>';
      }).join('');
      m.innerHTML = '<div style="pointer-events:auto;background:#0f0f23;border:2px solid #22d3ee;border-radius:10px;width:380px;max-height:85vh;display:flex;flex-direction:column;color:#fff;font-family:sans-serif;">'+
        '<div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #22d3ee;background:rgba(34,211,238,0.1);border-radius:8px 8px 0 0;">'+
          '<span style="flex:1;font-size:14px;font-weight:bold;color:#22d3ee;">🎁 抽獎歷史</span>'+
          '<button id="__gmp_gacha_export" style="padding:2px 8px;background:#2a2a4a;border:1px solid #fbbf24;color:#fbbf24;border-radius:4px;cursor:pointer;font-size:10px;margin-right:6px;">📤 匯出</button>'+
          '<button id="__gmp_gacha_clear" style="padding:2px 8px;background:#2a2a4a;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;margin-right:6px;">🗑 清空</button>'+
          '<span id="__gmp_gacha_modal_close" style="cursor:pointer;font-size:20px;color:#e94560;font-weight:bold;line-height:1;">✕</span>'+
        '</div>'+
        '<div id="__gmp_gacha_list" style="padding:8px 12px;overflow-y:auto;flex:1;max-height:500px;">'+(items||'<div style="color:#666;text-align:center;padding:20px;">尚無記錄</div>')+'</div>'+
        '<div style="padding:4px 12px;border-top:1px solid rgba(34,211,238,0.1);font-size:9px;color:#666;text-align:right;">共 '+gachaHistory.length+' 筆</div>'+
      '</div>';
      document.body.appendChild(m);
      var closeFn = function(){ m.remove(); };
      document.getElementById('__gmp_gacha_modal_close').onclick = closeFn;
      m.onclick = function(e){ if (e.target === m) closeFn(); };
      document.getElementById('__gmp_gacha_export').onclick = function(){
        var csv = 'name,time\n' + gachaHistory.map(function(h){ return '"'+h.name+'","'+h.time+'"'; }).join('\n');
        var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gacha_history.csv'; a.click();
      };
      document.getElementById('__gmp_gacha_clear').onclick = function(){
        if (!confirm('確定要清空所有抽獎歷史記錄？')) return;
        gachaHistory = [];
        updateHistSummary();
        gachaHistSave();
        closeFn();
      };
    }

    function sendGacha(){
      if (!gachaEnabled) { stopGacha(); return; }
      if (gachaCount >= gachaMax) { stopGacha(); updateStatus('已完成'); return; }
      try {
        if (window.__wbEmit) {
          window.__wbEmit('wbGacha', []);
        } else {
          console.warn('[Gacha] __wbEmit not available');
        }
      } catch(e) { console.error('[Gacha] error:', e.message); }
      gachaCount++;
      updateStatus('發送中 ' + gachaCount + '/' + gachaMax);
    }

    function startGacha(){
      gachaEnabled = true;
      var countEl = document.getElementById('__gmp_gacha_count');
      gachaMax = countEl ? Math.max(1, parseInt(countEl.value)||30) : 30;
      gachaCount = 0;
      if (gachaTimer) clearInterval(gachaTimer);
      gachaTimer = setInterval(sendGacha, 2000);
      updateStatus('開始 ' + gachaMax + ' 次');
      startObservingGachaMsg();
    }

    function stopGacha(){
      gachaEnabled = false;
      if (gachaTimer) { clearInterval(gachaTimer); gachaTimer = null; }
      var chk = document.getElementById('__gmp_gacha_enable');
      if (chk) chk.checked = false;
      updateStatus('已停止');
    }

    function updateStatus(msg){
      var el = document.getElementById('__gmp_gacha_status');
      if (el) el.textContent = msg;
    }

    document.addEventListener('click', function(e){
      var t = e.target;
      while (t && t.nodeType === 3) t = t.parentElement;
      if (!t || !t.getAttribute) return;
      if (t.tagName === 'INPUT' && t.type === 'checkbox' && t.id === '__gmp_gacha_enable') {
        if (t.checked) { startGacha(); } else { stopGacha(); }
        return;
      }
      if (t.id === '__gmp_gacha_hist_btn') {
        gachaHistLoad(function(){ showHistModal(); });
        return;
      }
    });

    document.addEventListener('change', function(e){
      var t = e.target;
      if (t && t.id === '__gmp_gacha_count') {
        gachaMax = Math.max(1, parseInt(t.value)||30);
        if (gachaEnabled) {
          gachaCount = 0;
          updateStatus('發送中 ' + gachaCount + '/' + gachaMax);
        }
      }
    });

    // Load history on init
    gachaHistLoad();
    // Also try to start observer after a delay (DOM may not be ready yet)
    setTimeout(startObservingGachaMsg, 3000);

    window.__gmpGachaStop = stopGacha;
    window.__gmpGachaShowHist = showHistModal;
  })();

  // === Focus Test: auto-foreground every 10s, minimize after 5s ===
  (function(){
    var focusOn=false;
    var focusTimer=null;
    var minimizeTimer=null;
    var chk=document.getElementById('__gmp_focus_test');
    var stEl=document.getElementById('__gmp_focus_test_status');
    var logEl=document.getElementById('__gmp_focus_test_log');
    var logLines=[];
    var seq=0;
    var pending={};

    function addLog(msg,color){
      var now=new Date();
      var ts=now.getHours().toString().padStart(2,'0')+':'+
              now.getMinutes().toString().padStart(2,'0')+':'+
              now.getSeconds().toString().padStart(2,'0')+'.'+
              Math.floor(now.getMilliseconds()/100);
      logLines.push('<div style="color:'+(color||'#aaa')+'">['+ts+'] '+msg+'</div>');
      if(logLines.length>50)logLines.shift();
      if(logEl)logEl.innerHTML=logLines.join('');
    }

    // Listen for relay responses from content.js (ISOLATED world)
    // CustomEvent is fire-and-forget; response logged in content.js console

    function sendAction(action){
      addLog('dispatch: '+action,'#ffd700');
      try{
        document.dispatchEvent(new CustomEvent('__gm_'+action));
      }catch(e){
        addLog(action+' EX: '+e.message,'#e94560');
      }
    }

    function cycle(){
      addLog('>>> Focus <<<','#ffd700');
      sendAction('focusGameWindow');
      minimizeTimer=setTimeout(function(){
        addLog('>>> Minimize <<<','#a78bfa');
        sendAction('minimizeGameWindow');
      },5000);
    }

    function startFocusTest(){
      focusOn=true;
      if(stEl){stEl.textContent='運行中';stEl.style.color='#4ade80';}
      if(logEl)logEl.innerHTML='';
      logLines=[];
      addLog('STARTED','#22d3ee');
      cycle();
      focusTimer=setInterval(cycle,10000);
    }

    function stopFocusTest(){
      focusOn=false;
      if(focusTimer){clearInterval(focusTimer);focusTimer=null;}
      if(minimizeTimer){clearTimeout(minimizeTimer);minimizeTimer=null;}
      if(stEl){stEl.textContent='已停止';stEl.style.color='#888';}
      if(chk)chk.checked=false;
      addLog('STOPPED','#e94560');
    }

    document.addEventListener('click',function(e){
      var t=e.target;
      while(t&&t.nodeType===3)t=t.parentElement;
      if(!t||!t.getAttribute)return;
      if(t.tagName==='INPUT'&&t.type==='checkbox'&&t.id==='__gmp_focus_test'){
        if(t.checked){startFocusTest();}
        else{stopFocusTest();}
      }
    });
    window.__gmpFocusTestStop=stopFocusTest;
  })();

  // === Socket packet send (Other Tab) ===
  (function(){
    document.addEventListener('click',function(e){
      var t=e.target;
      while(t&&t.nodeType===3)t=t.parentElement;
      if(!t||!t.getAttribute)return;
      if(t.id==='__gmp_socket_send'){
        var inp=document.getElementById('__gmp_socket_boss_id');
        var bossId=inp?inp.value.trim()||'wb_casper':'wb_casper';
        var resEl=document.getElementById('__gmp_socket_result');
        if(!window.__wbEmit){
          if(resEl){resEl.textContent='❌ __wbEmit 不可用';resEl.style.color='#e94560';}
          return;
        }
        try{
          window.__wbEmit('joinBoss',[bossId]);
          if(resEl){resEl.textContent='✅ joinBoss["'+bossId+'"] 已發送';resEl.style.color='#4ade80';}
        }catch(er){
          if(resEl){resEl.textContent='❌ '+er.message;resEl.style.color='#e94560';}
        }
        // 2秒後清除結果
        setTimeout(function(){if(resEl)resEl.textContent='';},3000);
      }
    });
  })();

})();
