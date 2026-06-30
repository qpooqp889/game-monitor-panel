// ====== wb-boss.js - World Boss Module ======
// Extracted from game-monitor.js v2.30
// Encapsulated in IIFE, all functions on window.__wb* namespace

(function(){
  if(window.__wbModuleLoaded){console.log("[WB] Module already loaded, skip");return;}
  window.__wbModuleLoaded=true;
  console.log("[WB] World Boss module loading...");

  // === Socket Hook (installSioHook) ===
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




  // === Variable/Init ===


  // === Function Definitions ===
function __wbSend(action){if(!window.__wbSocket||!window.__wbSocket.emit){setTimeout(function(){if(window.__wbSocket)window.__wbSocket.emit('bossAction',action);},200);return;}try{window.__wbSocket.emit('bossAction',action);console.log('[WB] bossAction:',action);}catch(e){}}

function __wbSendPotion(type){if(!window.__wbSocket)return;try{window.__wbSocket.emit('usePotion',{type:type||'potion_heal'});}catch(e){}}

function __wbCastSkill(id,target){if(!window.__wbSocket)return;try{var p={id:id};if(target)p.target=target;window.__wbSocket.emit('castSkill',p);}catch(e){}}

function __wbSetBossSet(s){if(!window.__wbSocket)return;try{window.__wbSocket.emit('setBossSet',s);}catch(e){}}

function __wbEmit(evt,data){if(!window.__wbSocket||!window.__wbSocket.emit)return;try{window.__wbSocket.emit(evt,data);console.log('[WB-Emit]',evt,JSON.stringify(data).slice(0,200));}catch(e){console.warn('[WB-Emit] failed',e);}}


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
  __wbUpdateWorldBossUI();
  window.__wbWorldBossTimer=setInterval(function(){
    __wbUpdateWorldBossUI();
  },60000);
  console.log('[WB-WorldBoss] DOM timer started, interval=60s');
}

function __wbStopWorldBossTimer(){
  if(window.__wbWorldBossTimer){clearInterval(window.__wbWorldBossTimer);window.__wbWorldBossTimer=null;}
}


// 解析世界王資料（通用格式，嘗試多種結構）
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
function __wbUpdateWorldBossUI(){
  var el=document.getElementById('__gmp_wb_list');
  var timerEl=document.getElementById('__gmp_wb_timer');
  var countEl=document.getElementById('__gmp_wb_count');
  if(!el)return;

  if(timerEl){
    timerEl.textContent='每 60s';
    timerEl.style.color='#888';
  }

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
  __wbLoadHuntList(function(huntIds){
    if(bossList.length){
      if(countEl)countEl.textContent=bossList.length+' 隻';
      var html=bossList.map(function(b){
        var rsStr=b.respawn!==null?'\u91cd\u751f:'+Math.floor(b.respawn/60)+'m '+String((b.respawn%60)+'s').padStart(3,'0'):(b.status==='alive'?'\u5b58\u6d3b\u4e2d':'--');
        var sc={alive:'#4ade80',dead:'#888',waiting:'#fbbf24',unknown:'#555'};
        var inHunt=huntIds.indexOf(b.id)!==-1;
        var addBtn=inHunt?'<span style="color:#4caf50;font-size:11px;min-width:18px;">\u2713</span>':'<span onclick="__wbAddToHuntList(\''+b.id+'\',\''+b.name+'\','+b.lv+')" style="color:#4caf50;font-size:14px;cursor:pointer;min-width:18px;text-align:center;">[+]</span>';
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
      el.innerHTML='<div style="font-size:10px;color:#888;padding:8px;text-align:center;">\u4e16\u754c\u738b\u5217\u8868\u4e3a\u7a7a<br><span style="font-size:9px;color:#555;">\u8bf7\u5148\u5207\u6362\u5230\u300c\u72e9\u7315\u573a \u2192 \u4e16\u754c\u738b\u300d\u5206\u9875</span></div>';
    }
    // 同步更新優先討伐清單 UI
    __wbUpdateHuntListUI();
  });
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

function __wbBossLoop(){if(!window.__wbBossAuto.running)return;var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};var cfg=window.__wbBossAuto.config;var hpPct=ch.maxHp>0?ch.hp/ch.maxHp:1;try{if(cfg.pot&&hpPct<(cfg.hpPct/100)&&cd.pot<0.05)__wbSend('pot');if(cfg.heal&&cd.heal<0.05)__wbSend('heal');if(cfg.barrier&&boss.hp>0&&boss.maxHp>0&&(boss.hp/boss.maxHp)<(cfg.barrierPct/100)&&cd.barrier<0.05&&boss.barrierHas)__wbSend('barrier');if(cfg.atk&&ls.mode==='bosscombat'&&cd.atk<0.05)__wbSend('atk');}catch(e){}window.__wbBossAuto.timer=setTimeout(__wbBossLoop,500);}

function __wbBossAutoStart(){window.__wbBossAuto.running=true;__wbBossLoop();}

function __wbBossAutoStop(){window.__wbBossAuto.running=false;if(window.__wbBossAuto.timer)clearTimeout(window.__wbBossAuto.timer);}


// ====== Cooldown Bypass ======
window.__wbBypassCD=false;
function __wbToggleBypass(on){window.__wbBypassCD=on;if(on&&!window.__wbBypassPatched){window.__wbBypassPatched=true;var _orig=window.updateBossCd;if(_orig){window.updateBossCd=function(){try{_orig.apply(this,arguments);}catch(e){}var keys=['pot','atk','heal','convert','barrier','holybarrier'];keys.forEach(function(k){var b=document.getElementById('bact-'+k);if(b)b.disabled=false;});};}var _origRBP=window.renderBossPanel;if(_origRBP){window.renderBossPanel=function(p){try{_origRBP.apply(this,arguments);}catch(e){_origRBP(p);}setTimeout(function(){document.querySelectorAll('.bact-btn[id]').forEach(function(b){var k=b.dataset&&b.dataset.k;if(k&&!b.__wbBypass){b.__wbBypass=true;b.addEventListener('click',function(){__wbSend(k);b.disabled=false;});}});},50);};}}console.log('[WB] Bypass:',on?'ON':'OFF');}

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

  function __wbSyncAutoConfig(){
    var cfg=window.__wbBossAuto.config;
    cfg.pot=document.getElementById('__gmp_boss_auto_pot').checked;
    cfg.heal=document.getElementById('__gmp_boss_auto_heal').checked;
    cfg.barrier=document.getElementById('__gmp_boss_auto_barrier').checked;
    cfg.atk=document.getElementById('__gmp_boss_auto_atk').checked;
    cfg.hpPct=parseInt(document.getElementById('__gmp_boss_auto_hp').value)||50;
    cfg.barrierPct=parseInt(document.getElementById('__gmp_boss_auto_barrier_pct').value)||30;
  }

  function __wbBossStartUpdater(){
    if(__wbBossUpdTimer)return;
    __wbBossUpdTimer=setInterval(function(){
      if(activeTab==='boss')__wbUpdateBossStatus();
          __wbInitHuntToggle();
          __wbUpdateHuntListUI();
    },500);
  }


// ========== 優先討伐清單管理 ==========
function __wbLoadHuntList(callback){
  if(typeof chrome==='undefined'||!chrome.storage){if(callback)callback([]);return;}
  chrome.storage.local.get('wb_priority_list',function(r){
    var list=r.wb_priority_list||[];
    var ids=list.map(function(i){return i.id;});
    if(callback)callback(ids);
  });
}

function __wbGetHuntList(callback){
  if(typeof chrome==='undefined'||!chrome.storage){callback([]);return;}
  chrome.storage.local.get('wb_priority_list',function(r){
    callback(r.wb_priority_list||[]);
  });
}

function __wbSaveHuntList(list){
  if(typeof chrome==='undefined'||!chrome.storage)return;
  chrome.storage.local.set({wb_priority_list:list},function(){
    __wbUpdateHuntListUI();
    __wbUpdateWorldBossUI();
  });
}

function __wbAddToHuntList(bossId,bossName,bossLv){
  __wbGetHuntList(function(list){
    // 檢查是否已存在
    if(list.some(function(i){return i.id===bossId;}))return;
    list.push({id:bossId,name:bossName,lv:bossLv,addedAt:Date.now()});
    __wbSaveHuntList(list);
  });
}

function __wbRemoveFromHuntList(bossId){
  __wbGetHuntList(function(list){
    list=list.filter(function(i){return i.id!==bossId;});
    __wbSaveHuntList(list);
  });
}

function __wbUpdateHuntListUI(){
  var el=document.getElementById('__gmp_hunt_list');
  var countEl=document.getElementById('__gmp_hunt_count');
  if(!el)return;
  __wbGetHuntList(function(list){
    if(countEl)countEl.textContent=list.length+' \u53ea';
    if(list.length){
      el.innerHTML=list.map(function(i){
        return '<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;">'+
          '<span style="font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;" onclick="__wbRemoveFromHuntList(\''+i.id+'\')">[x]</span>'+
          '<span style="font-size:10px;color:#4caf50;min-width:70px;">'+i.name+'</span>'+
          '<span style="font-size:9px;color:#aaa;">Lv.'+i.lv+'</span>'+
        '</div>';
      }).join('');
    } else {
      el.innerHTML='<div style="font-size:10px;color:#888;padding:6px;text-align:center;">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738b [+ ] \u52a0\u5165</div>';
    }
  });
}


// 初始載入優先討伐清單
function __wbInitHuntToggle(){
  // 世界王清單折疊
  var wbToggle=document.getElementById('__gmp_wb_toggle');
  var wbBody=document.getElementById('__gmp_wb_body');
  if(wbToggle&&wbBody){
    wbToggle.onclick=function(){
      if(wbBody.style.display!=='none'){
        wbBody.style.display='none';
        wbToggle.style.borderBottom='none';
      }else{
        wbBody.style.display='block';
        wbToggle.style.borderBottom='1px solid rgba(233,69,96,0.2)';
      }
    };
  }
  // 討伐清單折疊
  var huntToggle=document.getElementById('__gmp_hunt_toggle');
  var huntBody=document.getElementById('__gmp_hunt_body');
  if(huntToggle&&huntBody){
    huntToggle.onclick=function(){
      if(huntBody.style.display!=='none'){
        huntBody.style.display='none';
        huntToggle.style.borderBottom='none';
      }else{
        huntBody.style.display='block';
        huntToggle.style.borderBottom='1px solid rgba(76,175,80,0.2)';
      }
    };
  }
  __wbUpdateHuntListUI();
}


  // === Auto-detect setTimeout ===
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



  // ====== Export __wb* functions to window (for inline onclick/closure fallback) ======
  window.__wbSend=__wbSend;window.__wbSendPotion=__wbSendPotion;window.__wbCastSkill=__wbCastSkill;
  window.__wbSetBossSet=__wbSetBossSet;window.__wbEmit=__wbEmit;
  window.__wbSubscribeWorldBoss=__wbSubscribeWorldBoss;window.__wbQueryWorldBoss=__wbQueryWorldBoss;
  window.__wbStartWorldBossTimer=__wbStartWorldBossTimer;window.__wbStopWorldBossTimer=__wbStopWorldBossTimer;
  window.__wbParseWorldBossData=__wbParseWorldBossData;window.__wbUpdateWorldBossUI=__wbUpdateWorldBossUI;
  window.__wbDetectWorldBossEvt=__wbDetectWorldBossEvt;
  window.__wbBossLoop=__wbBossLoop;window.__wbBossAutoStart=__wbBossAutoStart;window.__wbBossAutoStop=__wbBossAutoStop;
  window.__wbToggleBypass=__wbToggleBypass;
  window.__wbUpdateBossStatus=__wbUpdateBossStatus;window.__wbSyncAutoConfig=__wbSyncAutoConfig;
  window.__wbBossStartUpdater=__wbBossStartUpdater;
  window.__wbLoadHuntList=__wbLoadHuntList;window.__wbGetHuntList=__wbGetHuntList;
  window.__wbSaveHuntList=__wbSaveHuntList;window.__wbAddToHuntList=__wbAddToHuntList;
  window.__wbRemoveFromHuntList=__wbRemoveFromHuntList;window.__wbUpdateHuntListUI=__wbUpdateHuntListUI;
  window.__wbInitHuntToggle=__wbInitHuntToggle;

  console.log("[WB] World Boss module loaded");
})();
