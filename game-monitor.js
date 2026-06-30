(function(){
var ver='v2.23';
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
// ====== LogoutDB (chrome.storage.local) ======
var LogoutDB=(function(){
  var KEY='gmLogoutHistory';
  var _cache=null;_cacheLoaded=false;
  function ensureLoaded(){
    if(_cacheLoaded)return Promise.resolve();
    return __gmStorageGet([KEY]).then(function(r){
      _cache=r&&r[KEY]||[];
      _cacheLoaded=true;
    });
  }
  function saveCache(){
    return __gmStorageSet(KEY,_cache);
  }
  function genId(){return Date.now()+'_'+Math.random().toString(36).slice(2,8)}
  return {
    add:function(ts,mode){
      return ensureLoaded().then(function(){
        _cache.push({id:genId(),ts:ts||Date.now(),mode:mode||'unknown'});
        return saveCache();
      });
    },
    getAll:function(){
      return ensureLoaded().then(function(){
        return _cache.slice().sort(function(x,y){return y.ts-x.ts});
      });
    },
    getBefore:function(b){
      var ts=b instanceof Date?b.getTime():b;
      return this.getAll().then(function(a){return a.filter(function(r){return r.ts<ts})});
    },
    getAfter:function(a){
      var ts=a instanceof Date?a.getTime():a;
      return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=ts})});
    },
    getToday:function(){
      var now=new Date();
      var start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
      return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=start})});
    },
    getByDayOffset:function(offset){
      var now=new Date();
      var base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      base.setDate(base.getDate()-offset);
      var start=base.getTime();
      var end=start+86400000;
      return this.getAll().then(function(a){return a.filter(function(r){return r.ts>=start&&r.ts<end})});
    },
    clearAll:function(){return ensureLoaded().then(function(){_cache=[];return saveCache()})},
    clearBefore:function(b){
      var ts=b instanceof Date?b.getTime():b;
      var self=this;
      return self.getBefore(ts).then(function(old){
        var ids={};
        old.forEach(function(r){ids[r.id]=true});
        _cache=_cache.filter(function(r){return!ids[r.id]});
        return saveCache().then(function(){return old.length});
      });
    },
    count:function(){return ensureLoaded().then(function(){return _cache.length})},
    last:function(){return ensureLoaded().then(function(){return _cache.length?_cache[_cache.length-1]:null})},
    // 匯出完整資料（供儲存輔助用）
    exportCache:function(){return ensureLoaded().then(function(){return JSON.parse(JSON.stringify(_cache))})},
    importCache:function(arr){_cache=Array.isArray(arr)?arr.slice():[];return saveCache()}
  };
})();
console.log('[LogoutDB] Storage local store loaded');


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
          // 被動偵測：含 respawn / worldBoss / bossList / hp+maxHp+name 即為世界王候選
          if(/respawn|worldBoss|bossList|world_boss|getBoss|RefreshBoss/i.test(evtName)||
             (p.data.length>1&&/respawn|hp|maxHp|worldBoss|bossLv|lv|name/i.test(JSON.stringify(p.data[1])))){
            window.__wbWorldBossCache=window.__wbWorldBossCache||{data:null,ts:0};
            window.__wbWorldBossCache.data=p.data;
            window.__wbWorldBossCache.ts=Date.now();
            console.log('[WB] WorldBoss event captured:',evtName,JSON.stringify(p.data[1]).slice(0,200));
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
  var names=['worldBoss','getBossInfo','bossInfo','world_boss','bossList','getBoss','RefreshBoss','getBossList','wbBoss'];
  var found=false;
  names.forEach(function(n){if(found)return;try{if(window.__wbSocket&&window.__wbSocket.emit){window.__wbSocket.emit(n);console.log('[WB-Query] emit:',n);found=true;}}catch(e){}});
  if(!found)console.log('[WB-Query] no socket, will retry on next state');
  return found;
}
// 自動查詢：每 60 秒執行一次
function __wbStartWorldBossTimer(){
  if(window.__wbWorldBossTimer)clearInterval(window.__wbWorldBossTimer);
  __wbQueryWorldBoss();
  window.__wbWorldBossTimer=setInterval(function(){
    if(!window.__wbSocket){__wbQueryWorldBoss();return;}
    __wbQueryWorldBoss();
    __wbUpdateWorldBossUI();
  },60000);
  console.log('[WB-WorldBoss] timer started, interval=60s');
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
      name:it.name||it.n||it.bossName||it.boss_name||'?'
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
  var cache=window.__wbWorldBossCache||{};
  var age=cache.ts?(Date.now()-cache.ts)/1000:null;
  // 更新倒數計時
  if(timerEl){
    if(age!==null){
      var rem=Math.max(0,60-Math.floor(age));
      timerEl.textContent='自動刷新 '+rem+'s';
      timerEl.style.color='#888';
    } else {
      timerEl.textContent='等待資料...';
      timerEl.style.color='#555';
    }
  }
  // 解析並顯示
  var parsed=__wbParseWorldBossData(cache.data&&cache.data.length>1?cache.data[1]:null);
  if(parsed.length){
    if(countEl)countEl.textContent=parsed.length+' 隻';
    el.innerHTML=parsed.map(function(b){
      var pct=b.maxHp>0?Math.round(b.hp/b.maxHp*100):100;
      var hpColor=pct>60?'#e94560':pct>30?'#fbbf24':'#dc2626';
      var rsStr=b.respawn!==null?'重生:'+b.respawn+'s':'--';
      var statusLabel={alive:'&#x1F7E2; 存活',dead:'&#x1F534; 死亡',waiting:'&#x1F7E1; 等待',unknown:'?'};
      return '<div style="display:flex;align-items:center;gap:6px;padding:5px 6px;background:rgba(233,69,96,0.06);border-radius:5px;margin-bottom:3px;border-left:3px solid '+hpColor+';">'+
        '<span style="font-size:10px;color:#e94560;min-width:70px;">'+b.name+'</span>'+
        '<span style="font-size:9px;color:#aaa;">Lv.'+b.lv+'</span>'+
        '<span style="font-size:9px;color:'+hpColor+';min-width:55px;">'+b.hp+'/'+b.maxHp+'</span>'+
        '<div style="flex:1;background:#2a2a4a;border-radius:3px;height:6px;"><div style="width:'+pct+'%;background:'+hpColor+';height:100%;border-radius:3px;"></div></div>'+
        '<span style="font-size:9px;color:#ffd700;min-width:65px;">'+rsStr+'</span>'+
        '<span style="font-size:9px;color:#aaa;">'+statusLabel[b.status]||'?'+'</span>'+
      '</div>';
    }).join('');
  } else {
    if(countEl)countEl.textContent='--';
    el.innerHTML='<div style="font-size:10px;color:#555;padding:8px;text-align:center;">尚無世界王資料<br><span style="font-size:9px;">等待 socket 事件...</span></div>';
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
window.__wbBossAuto={running:false,timer:null,config:{pot:true,heal:false,barrier:false,atk:false,hpPct:50,barrierPct:30}};
function __wbBossLoop(){if(!window.__wbBossAuto.running)return;var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};var cfg=window.__wbBossAuto.config;var hpPct=ch.maxHp>0?ch.hp/ch.maxHp:1;try{if(cfg.pot&&hpPct<(cfg.hpPct/100)&&cd.pot<0.05)__wbSend('pot');if(cfg.heal&&cd.heal<0.05)__wbSend('heal');if(cfg.barrier&&boss.hp>0&&boss.maxHp>0&&(boss.hp/boss.maxHp)<(cfg.barrierPct/100)&&cd.barrier<0.05&&boss.barrierHas)__wbSend('barrier');if(cfg.atk&&ls.mode==='bosscombat'&&cd.atk<0.05)__wbSend('atk');}catch(e){}window.__wbBossAuto.timer=setTimeout(__wbBossLoop,500);}
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

// ========== Storage Helper (chrome.storage.local via content.js relay) ==========
var __gmStorageSeq=0;
var __gmStorageCbs={};
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='GM_STORAGE_RESPONSE'&&e.data.seq!==undefined&&__gmStorageCbs[e.data.seq]){
    __gmStorageCbs[e.data.seq](e.data.data||e.data);
    delete __gmStorageCbs[e.data.seq];
  }
});
// 儲存單一 key（掛到 window 供 advanced-farming.js 使用）
function __gmStorageSet(key,data){
  return new Promise(function(resolve){
    var seq=++__gmStorageSeq;
    __gmStorageCbs[seq]=function(){resolve()};
    window.postMessage({type:'GM_STORAGE_SET',key:key,data:data,seq:seq},'*');
  });
}
// 讀取 key(s)，傳入單一字串回傳值，傳入陣列回傳物件（掛到 window 供 advanced-farming.js 使用）
function __gmStorageGet(keys){
  return new Promise(function(resolve){
    var seq=++__gmStorageSeq;
    __gmStorageCbs[seq]=function(resp){resolve(resp)};
    window.postMessage({type:'GM_STORAGE_GET',keys:Array.isArray(keys)?keys:[keys],seq:seq},'*');
  });
}
// 暴露到 window 讓獨立注入的 advanced-farming.js 也能使用
window.__gmStorageSet=__gmStorageSet;
window.__gmStorageGet=__gmStorageGet;
// ========== End Storage Helper ==========

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
    attackAll: document.getElementById('__gmp_farm_attack_all')?document.getElementById('__gmp_farm_attack_all').checked:false
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
      if(hpLow){
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
      if(mpLow){
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
      if(isInTown){
        var hpGtOk=hpGtEnabled&&hpPct>(hpGtThresh/100);
        var mpGtOk=mpGtEnabled&&mpPct>(mpGtThresh/100);
        console.log('[GM] In town, HP:',Math.round(hpPct*100)+'%, MP:',Math.round(mpPct*100)+'%, hpGtOk:',hpGtOk,'mpGtOk:',mpGtOk);
        if(hpGtOk||mpGtOk){
          console.log('[GM] Teleporting to farm zone:',farmZone);
          sendZone(farmZone);
          status.textContent='HP/MP充足，傳送掛機...';
          status.style.color='#4ade80';
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
    '<button id="__gmp_tab_boss" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;">👑BOSS</button>'+
    '<button id="__gmp_tab_monitor" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">📡監控</button>'+
    '<button id="__gmp_tab_skill" style="padding:5px 9px;background:#333;border:none;color:#aaa;border-radius:6px;cursor:pointer;font-size:11px;">⚡技能</button>'+
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
    // === BOSS TAB ===
    '<div id="__gmp_tab_content_boss" style="display:none;">'+
    '<div style="background:rgba(255,255,255,0.06);padding:8px;border-radius:6px;margin-bottom:8px;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">'+'<span id="__gmp_boss_name" style="font-weight:bold;color:#e94560;font-size:12px;">--</span>'+
      '<span id="__gmp_boss_lv" style="font-size:11px;color:#aaa;"></span></div>'+
      '<div style="margin-bottom:4px;"><div style="display:flex;justify-content:space-between;font-size:10px;color:#888;margin-bottom:2px;"><span>BOSS HP</span><span id="__gmp_boss_hp_text" style="color:#e94560;">--/--</span></div>'+
      '<div style="background:#3a1a1a;border-radius:4px;height:14px;"><div id="__gmp_boss_hp_bar" style="width:0%;background:#e94560;height:100%;border-radius:4px;transition:width 0.3s;"></div></div></div>'+
      '<div id="__gmp_boss_buffs" style="font-size:10px;color:#86c5ff;margin-top:4px;"></div>'+
    '</div>'+
    // === 世界王列表（每分鐘自動刷新）===
    '<div style="background:rgba(233,69,96,0.06);padding:8px;border-radius:6px;margin-bottom:8px;border:1px solid rgba(233,69,96,0.3);">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'+
        '<span style="font-size:11px;color:#e94560;font-weight:bold;">&#x1F3C5; 世界王列表</span>'+
        '<div style="display:flex;gap:4px;align-items:center;">'+
          '<span id="__gmp_wb_count" style="font-size:9px;color:#888;">--</span>'+
          '<span id="__gmp_wb_timer" style="font-size:9px;color:#888;">初始化中...</span>'+
          '<button id="__gmp_wb_refresh" style="padding:2px 6px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:9px;font-weight:bold;">&#x1F504; 刷新</button>'+
        '</div>'+
      '</div>'+
      '<div id="__gmp_wb_list" style="font-size:10px;color:#555;padding:6px;text-align:center;">等待 socket 事件...</div>'+
      '<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(233,69,96,0.2);display:flex;gap:4px;flex-wrap:wrap;align-items:center;">'+
        '<span style="font-size:9px;color:#555;">自動:</span>'+
        '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;">'+
          '<input type="checkbox" id="__gmp_wb_auto" checked style="width:11px;height:11px;cursor:pointer;">'+
          '<span style="font-size:9px;color:#888;">每 60s 查詢</span>'+
        '</label>'+
        '<span style="font-size:9px;color:#444;margin-left:4px;">| 事件:</span>'+
        '<span id="__gmp_wb_evt_name" style="font-size:9px;color:#ffd700;">auto-detecting...</span>'+
        '<button id="__gmp_wb_show_detected" style="margin-left:auto;padding:2px 6px;background:#2a2a4a;border:1px solid #555;color:#aaa;border-radius:4px;cursor:pointer;font-size:9px;">? 事件候選</button>'+
      '</div>'+
    '</div>'+
    '<div style="margin-bottom:8px;">'+'<div style="font-size:10px;color:#888;margin-bottom:4px;">冷卻計時</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'+'<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">💊</span> 藥水 <span id="__gmp_cd_pot" style="color:#4ade80;float:right;">就緒</span></div>'+
      '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">⚔️</span> 攻擊 <span id="__gmp_cd_atk" style="color:#4ade80;float:right;">就緒</span></div>'+
      '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">💚</span> 治療 <span id="__gmp_cd_heal" style="color:#4ade80;float:right;">就緒</span></div>'+
      '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">🔄</span> 轉換 <span id="__gmp_cd_convert" style="color:#4ade80;float:right;">就緒</span></div>'+
      '<div style="background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:4px;font-size:10px;"><span style="color:#888;">🛡️</span> 屏障 <span id="__gmp_cd_barrier" style="color:#4ade80;float:right;">就緒</span></div>'+
    '</div></div>'+
    '<div style="margin-bottom:8px;">'+'<div style="font-size:10px;color:#888;margin-bottom:4px;">手動指令（直接發送）</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">'+'<button id="__gmp_boss_pot" style="padding:8px;background:#1a4a1a;border:1px solid #2a6a2a;color:#4ade80;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">💊 藥水</button>'+
      '<button id="__gmp_boss_atk" style="padding:8px;background:#2a1a1a;border:1px solid #6a2a2a;color:#f87171;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">⚔️ 攻擊</button>'+
      '<button id="__gmp_boss_heal" style="padding:8px;background:#1a2a1a;border:1px solid #2a5a2a;color:#86efac;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">💚 治療</button>'+
      '<button id="__gmp_boss_convert" style="padding:8px;background:#1a1a4a;border:1px solid #2a2a7a;color:#a5b4fc;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">🔄 轉換</button>'+
      '<button id="__gmp_boss_barrier" style="padding:8px;background:#1a1a3a;border:1px solid #3a3a8a;color:#818cf8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">🛡️ 屏障</button>'+
      '<button id="__gmp_boss_holy" style="padding:8px;background:#2a1a2a;border:1px solid #6a2a6a;color:#d8b4fe;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">✨ 神聖</button>'+
    '</div></div>'+
    '<div style="margin-bottom:8px;">'+'<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'+'<input type="checkbox" id="__gmp_boss_bypass" style="width:14px;height:14px;cursor:pointer;">'+'<label for="__gmp_boss_bypass" style="font-size:11px;color:#ffd700;cursor:pointer;">🔓 解除冷卻限制（按了直接發送，無視按鈕鎖定）</label></div>'+
      '<div style="font-size:10px;color:#555;padding-left:22px;">⚠️ 伺服器仍會驗證冷卻，客戶端 bypass 讓按鈕可以一直按</div>'+
    '</div>'+
    '<div style="margin-bottom:8px;">'+'<div style="font-size:10px;color:#888;margin-bottom:4px;">自動掛機</div>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+'<input type="checkbox" id="__gmp_boss_auto_pot" style="width:13px;height:13px;cursor:pointer;">'+'<label for="__gmp_boss_auto_pot" style="font-size:10px;color:#4ade80;cursor:pointer;">💊 HP&lt;</label>'+
      '<input id="__gmp_boss_auto_hp" type="number" value="50" min="1" max="100" style="width:45px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+'<span style="font-size:10px;color:#555;">%</span></div>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+'<input type="checkbox" id="__gmp_boss_auto_heal" style="width:13px;height:13px;cursor:pointer;">'+'<label for="__gmp_boss_auto_heal" style="font-size:10px;color:#86efac;cursor:pointer;">💚 自動治療魔法</label></div>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'+'<input type="checkbox" id="__gmp_boss_auto_barrier" style="width:13px;height:13px;cursor:pointer;">'+'<label for="__gmp_boss_auto_barrier" style="font-size:10px;color:#818cf8;cursor:pointer;">🛡️ Boss HP&lt;</label>'+
      '<input id="__gmp_boss_auto_barrier_pct" type="number" value="30" min="1" max="100" style="width:45px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;text-align:center;">'+'<span style="font-size:10px;color:#555;">%</span></div>'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'+'<input type="checkbox" id="__gmp_boss_auto_atk" style="width:13px;height:13px;cursor:pointer;">'+'<label for="__gmp_boss_auto_atk" style="font-size:10px;color:#f87171;cursor:pointer;">⚔️ 自動攻擊</label></div>'+
      '<div id="__gmp_boss_auto_status" style="font-size:10px;color:#888;text-align:center;margin-bottom:6px;">停止中</div>'+
      '<button id="__gmp_boss_auto_btn" style="width:100%;padding:8px;background:#0f3460;border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;">▶ 啟動自動BOSS</button>'+
    '</div>'+
    '<div style="margin-bottom:6px;">'+'<div style="font-size:10px;color:#888;margin-bottom:4px;">📡 Socket.IO 狀態</div>'+
      '<div style="display:flex;gap:6px;margin-bottom:4px;">'+'<span style="font-size:10px;color:#888;">連接: </span><span id="__gmp_sock_status" style="font-size:10px;color:#ffd700;">檢測中...</span></div>'+
      '<div style="font-size:10px;color:#888;">已捕獲: <span id="__gmp_sock_sent" style="color:#4ade80;">0</span> 發送 / <span id="__gmp_sock_evts" style="color:#00d9ff;">0</span> 事件</div>'+
      '<div style="margin-top:8px;display:flex;gap:4px;">'+
        '<button id="__gmp_export_all" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #7bd14a;color:#7bd14a;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">📥 匯出設定</button>'+
        '<button id="__gmp_import_all" style="flex:1;padding:5px 4px;background:#0f3460;border:1px solid #fbbf24;color:#fbbf24;border-radius:5px;cursor:pointer;font-size:10px;font-weight:bold;">📤 匯入設定</button>'+
        '<input type="file" id="__gmp_import_file" accept=".json" style="display:none;">'+
      '</div>'+
      '<div id="__gmp_idb_status" style="font-size:10px;color:#555;margin-top:3px;text-align:center;"></div>'+ 
    '</div>'+ 
    '</div>'+
    // === MONITOR TAB ===
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
      '檢測間隔 <input id="__gmp_farm_reconnect_interval" type="number" value="60" min="10" max="300" style="width:50px;padding:3px 5px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:10px;outline:none;text-align:center;"> 秒'+
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

    // Character slot selector — MOVED TO BOTTOM
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px;background:#1a1a2e;border:1px solid #0f3460;border-radius:6px;">'+
      '<span style="font-size:10px;color:#ffd700;width:70px;">角色槽位</span>'+
      '<select id="__gmp_farm_char_slot" style="flex:1;padding:4px 6px;background:#2a2a4a;border:1px solid #0f3460;border-radius:4px;color:#fff;font-size:11px;outline:none;">'+
        '<option value="0">槽 0</option>'+
        '<option value="1">槽 1</option>'+
        '<option value="2">槽 2</option>'+
      '</select>'+
    '</div>'+
    // Test Reconnect button
    '<button id="__gmp_farm_test_reconnect" style="width:100%;padding:6px;background:#2a2a4a;border:1px solid #ffd700;color:#ffd700;border-radius:6px;cursor:pointer;font-size:11px;font-weight:bold;margin-bottom:4px;">🧪 測試斷線重連</button>'+ 
    '</div>'+  // closes inner farm content div
    '</div>'+ // closes farm tab content div
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
  function switchTab(tab){
    activeTab=tab;
    ['game','zone','farm','boss','monitor','skill'].forEach(function(t){
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
    if(tab==='boss'){__wbUpdateBossStatus();__wbUpdateWorldBossUI();}
  }
  document.getElementById('__gmp_tab_game').onclick=function(){switchTab('game')};
  document.getElementById('__gmp_tab_zone').onclick=function(){switchTab('zone')};
  document.getElementById('__gmp_tab_farm').onclick=function(){switchTab('farm')};
  document.getElementById('__gmp_tab_boss').onclick=function(){switchTab('boss');};
  document.getElementById('__gmp_tab_monitor').onclick=function(){switchTab('monitor')};

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
    var panel = document.getElementById('panel-scroll');
    if (!panel) {
      alert('找不到遊戲設定面板 (#panel-scroll)。\n請先在遊戲內打開自動施法設定介面。');
      return;
    }
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
    __wbQueryWorldBoss();
    __wbUpdateWorldBossUI();
    this.textContent='已刷新!';
    setTimeout(function(){var b=document.getElementById('__gmp_wb_refresh');if(b)b.textContent='\u21BB 刷新';},1000);
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
    var candidates={};
    evts.slice(-200).forEach(function(e){
      if(/respawn|worldBoss|bossList|world_boss|RefreshBoss|getBoss/i.test(e.evt)){
        candidates[e.evt]=(candidates[e.evt]||0)+1;
      }
    });
    var sorted=Object.keys(candidates).sort(function(a,b){return candidates[b]-candidates[a]});
    if(sorted.length){
      var list=sorted.slice(0,10).map(function(k,i){return(i+1)+'. '+k+' (x'+candidates[k]+')';}).join('\n');
      console.log('[WB] Event candidates:\n'+list);
      alert('事件候選 (查看 console 更多):\n'+sorted.slice(0,5).join('\n'));
    } else {
      alert('尚無偵測到世界王相關事件。請確認 Monitor 已在運行且有收到封包。');
    }
  };
  // 世界王 UI 更新訂閱（cache 更新時即時刷新）
  __wbSubscribeWorldBoss(function(evtName,data){
    __wbUpdateWorldBossUI();
    var evtEl=document.getElementById('__gmp_wb_evt_name');
    if(evtEl)evtEl.textContent=evtName||'unknown';
  });

  // Auto boss
  function __wbSyncAutoConfig(){
    var cfg=window.__wbBossAuto.config;
    cfg.pot=document.getElementById('__gmp_boss_auto_pot').checked;
    cfg.heal=document.getElementById('__gmp_boss_auto_heal').checked;
    cfg.barrier=document.getElementById('__gmp_boss_auto_barrier').checked;
    cfg.atk=document.getElementById('__gmp_boss_auto_atk').checked;
    cfg.hpPct=parseInt(document.getElementById('__gmp_boss_auto_hp').value)||50;
    cfg.barrierPct=parseInt(document.getElementById('__gmp_boss_auto_barrier_pct').value)||30;
  }
  document.getElementById('__gmp_boss_auto_pot').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_heal').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_barrier').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_atk').addEventListener('change',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_hp').addEventListener('input',__wbSyncAutoConfig);
  document.getElementById('__gmp_boss_auto_barrier_pct').addEventListener('input',__wbSyncAutoConfig);

  document.getElementById('__gmp_boss_auto_btn').onclick=function(){
    if(window.__wbBossAuto.running){
      __wbBossAutoStop();
      this.textContent='▶ 啟動自動BOSS';
      this.style.background='#0f3460';
      var s=document.getElementById('__gmp_boss_auto_status');
      if(s){s.textContent='停止中';s.style.color='#888';}
    } else {
      __wbSyncAutoConfig();
      __wbBossAutoStart();
      this.textContent='■ 停止自動BOSS';
      this.style.background='#e94560';
      var s=document.getElementById('__gmp_boss_auto_status');
      if(s){s.textContent='⚡ 自動BOSS運行中...';s.style.color='#4ade80';}
    }
  };

  // BOSS status update loop
  var __wbBossUpdTimer=null;
  function __wbBossStartUpdater(){
    if(__wbBossUpdTimer)return;
    __wbBossUpdTimer=setInterval(function(){
      if(activeTab==='boss')__wbUpdateBossStatus();
    },500);
  }
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

  document.getElementById('__gmp_export_all').onclick=function(){
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
    if(data.charSlot!==undefined)document.getElementById('__gmp_farm_char_slot').value=data.charSlot;
    if(data.charSlot!==undefined)document.getElementById('__gmp_farm_char_slot').value=data.charSlot;
    if(data.charSlot!==undefined)document.getElementById('__gmp_farm_char_slot').value=data.charSlot;
    // 新增：MP reconnect
    if(data.mpReconnectEnabled!==undefined)document.getElementById('__gmp_farm_mp_reconnect').checked=data.mpReconnectEnabled;
    if(data.mpReconnectThresh)document.getElementById('__gmp_farm_mp_reconnect_thresh').value=data.mpReconnectThresh;
  });

  // === Auto-save on change ===
  var farmInputs=['__gmp_farm_zone','__gmp_farm_hp','__gmp_farm_mp','__gmp_farm_hp_chk','__gmp_farm_mp_chk',
    '__gmp_farm_hp_gt','__gmp_farm_mp_gt','__gmp_farm_hp_gt_chk','__gmp_farm_mp_gt_chk',
    '__gmp_farm_logic','__gmp_farm_logic_chk','__gmp_farm_atk',
    '__gmp_farm_specify_target','__gmp_farm_target_index','__gmp_farm_attack_all',
    '__gmp_farm_char_name','__gmp_farm_reconnect','__gmp_farm_reconnect_interval',
    '__gmp_farm_mp_reconnect','__gmp_farm_mp_reconnect_thresh','__gmp_farm_char_slot'];
  farmInputs.forEach(function(id){
    var el=document.getElementById(id);
    if(el){
      el.addEventListener('change',saveFarmSettings);
      el.addEventListener('input',saveFarmSettings);
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

__gmBuildPanel();
document.addEventListener('__gm_show_panel',function(){__gmBuildPanel()});
console.log('[GM] Monitor injected '+ver);
})();
