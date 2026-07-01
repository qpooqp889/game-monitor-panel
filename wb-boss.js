/* wb-boss.js v3.08 - BOSS Auto Script */
// ====== wb-boss.js - World Boss Module ======
// Extracted from game-monitor.js v2.30
// Encapsulated in IIFE, all functions on window.__wb* namespace

(function(){
  if(window.__wbModuleLoaded){console.log("[WB] Module already loaded, skip");return;}
  window.__wbModuleLoaded=true;
  console.log("[WB] World Boss module loading...");

  // === Socket Hook (installSioHook) ===


// ====== Hunt List Reorder ======
function __wbGetHuntIds(callback){
  __wbGetHuntList(function(list){
    if(callback)callback(list?list.map(function(i){return i.id;}):[]);
  });
}

function __wbMoveHuntItem(id, dir){
  __wbGetHuntList(function(list){
    var idx=list.findIndex(function(i){return i.id===id;});
    if(idx<0)return;
    var newIdx=idx+dir;
    if(newIdx<0||newIdx>=list.length)return;
    var tmp=list[idx];
    list[idx]=list[newIdx];
    list[newIdx]=tmp;
    __wbSaveHuntList(list,function(){
      __wbUpdateHuntListUI();
      __wbUpdateWorldBossUI();
    });
  });
}

// ====== BOSS Auto Script State ======
window.__wbBossAutoScript={running:false,timer:null,currentIdx:0,phase:'idle',farmWasRunning:false};

// ====== BOSS Auto Script Main Loop ======
function __wbBossAutoScriptStart(){
  if(window.__wbBossAutoScript.running)return;
  var cfgChk=document.getElementById('__gmp_boss_auto_script');
  if(!cfgChk||!cfgChk.checked)return;

  // Remember & stop farming
  window.__wbBossAutoScript.farmWasRunning = window.__gmFarming && window.__gmFarming.running;
  if(window.__wbBossAutoScript.farmWasRunning){
    if(window.stopFarming)stopFarming();
    console.log('[WB-AutoScript] Stopped farming');
  }

  window.__wbBossAutoScript.running=true;
  window.__wbBossAutoScript.currentIdx=0;
  window.__wbBossAutoScript.phase='loading';
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='\u26A1 BOSS\u811A\u672C\u8DD1\u884C\u4E2D...';
  
  // Load boss history
  __wbLoadBossHistory();
  // Auto-check re-enter when script starts
  var reChk=document.getElementById('__gmp_boss_auto_reenter');
  if(reChk)reChk.checked=true;

  __wbBossAutoScriptLoop();
}

function __wbBossAutoScriptStop(){
  window.__wbBossAutoScript.running=false;
  if(window.__wbBossAutoScript.timer){
    clearTimeout(window.__wbBossAutoScript.timer);
    window.__wbBossAutoScript.timer=null;
  }
  window.__wbBossAutoScript.currentIdx=0;
  window.__wbBossAutoScript.phase='idle';
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='\u2716 BOSS\u811A\u672C\u5DF2\u505C\u6B62';
  // Restore farming
  if(window.__wbBossAutoScript.farmWasRunning){
    window.__wbBossAutoScript.farmWasRunning=false;
    var farmBtn=document.getElementById('__gmp_farm_btn');
    if(farmBtn&&farmBtn.textContent.indexOf('\u25B6')>-1){
      if(window.startFarming)startFarming();
    }
  }
}

function __wbBossAutoScriptLoop(){
  if(!window.__wbBossAutoScript.running)return;
  var cfgChk=document.getElementById('__gmp_boss_auto_script');
  if(!cfgChk||!cfgChk.checked){__wbBossAutoScriptStop();return;}

  __wbGetHuntList(function(list){
    if(!list||!list.length){
      window.__wbBossAutoScript.phase='idle';
      __wbBossAutoScriptRestoreFarm();
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,10000);
      return;
    }

    var idx=window.__wbBossAutoScript.currentIdx;
    if(idx>=list.length){
      // Reached end of hunt list \u2192 restore farm
      console.log('[WB-AutoScript] Completed hunt list, restoring farm');
      window.__wbBossAutoScript.currentIdx=0;
      __wbBossAutoScriptRestoreFarm();
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,5000);
      return;
    }

    var target=list[idx];
    window.__wbBossAutoScript.phase='checking';
    var statusEl=document.getElementById('__gmp_boss_script_status');
    if(statusEl)statusEl.textContent='[BOSS] '+target.name+' ('+(idx+1)+'/'+list.length+')...';

    console.log('[WB-AutoScript] Checking #'+(idx+1)+': '+target.name);

    // Step 1: Navigate to world boss tab
    try{__wbEnsureWBTab();}catch(e){}

    // Step 2: Wait for boss data, then check
    window.__wbBossAutoScript.phase='waiting_boss';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptCheckBoss(target,idx,list);
    },2000);
  });
}

function __wbEnsureWBTab(){
  var zoneTab=document.querySelector('div.tab[data-tab="zone"]');
  var wbSub=document.querySelector('div.subtab[data-c="special"]');
  if(zoneTab){zoneTab.click();}
  if(wbSub){wbSub.click();}
}

function __wbBossAutoScriptCheckBoss(target,idx,list){
  if(!window.__wbBossAutoScript.running)return;

  // Read boss from DOM cards
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var foundBoss=null;
  cards.forEach(function(card){
    var bossId=card.getAttribute('data-boss');
    if(bossId===target.id){foundBoss=card;}
  });

  if(!foundBoss){
    console.log('[WB-AutoScript] '+target.name+' not in DOM, waiting...');
    window.__wbBossAutoScript.phase='waiting_boss';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptCheckBoss(target,idx,list);
    },3000);
    return;
  }

  // Get boss status from sub element
  var bossId=foundBoss.getAttribute('data-boss');
  var subEl=document.querySelector('.wb-sub[data-boss="'+bossId+'"]');
  var subText=subEl?subEl.textContent.trim():'';

  var isAlive=subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1;
  var isDead=subText.indexOf('\u5DF2\u88AB\u64CA\u6557')!==-1||subText.indexOf('\u5DF2\u88AB\u5FB4\u670D')!==-1;

  if(isAlive){
    var threshold=window.__wbCachedMinPlayers||0;
    if(threshold>0){
      var playersText=subEl?subEl.textContent.trim():'';
      var pcMatch=playersText.match(/(\d+)/);
      var curPlayers=pcMatch?parseInt(pcMatch[1],10):0;
      if(curPlayers<threshold){
        console.log('[WB-AutoScript] '+target.name+' only '+curPlayers+' players (<'+threshold+'), skipping');
        __wbAddBossHistory(target.name,'skip','人數不足: '+curPlayers+'/'+threshold+' ','0',null);
        if(list&&idx<list.length-1){
          __wbBossAutoScript.phase='next_boss';
          __wbBossAutoScript.timer=setTimeout(function(){__wbBossAutoScriptCheckBoss(list[idx+1],idx+1,list);},2000);
        }else{
          __wbBossAutoScriptDone(list);
        }
        return;
      }
    }
    console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');
    __wbAddBossHistory(target.name, 'enter', '嘗試進入BOSS', 0, null);
    window.__wbBossAutoScript.phase='entering';
    try{foundBoss.click();}catch(e){}

    // Wait for boss battle then verify entry + start auto-attack
    window.__wbBossAutoScript.timer=setTimeout(function(){
      // Verify entry by checking lastState
      var ls=window.lastState||{};
      var boss=ls.boss||{};
      var bossHp=boss.hp||0;
      var bossMax=boss.maxHp||1;
      if(ls.mode==='bosscombat'&&bossHp>0){
        var hpPct=Math.round(bossHp/bossMax*100);
        __wbAddBossHistory(target.name, 'enter', '確認進入, HP: '+bossHp+'/'+bossMax+' ('+hpPct+'%)', bossHp, null);
      } else {
        __wbAddBossHistory(target.name, 'enter', '可能未成功進入(狀態: '+ls.mode+')', bossHp, null);
      }
      var atkChk=document.getElementById('__gmp_boss_auto_atk');
      if(atkChk)atkChk.checked=true;
      var enableChk=document.getElementById('__gmp_boss_auto_enable');
      if(enableChk)enableChk.checked=true;
      __wbBossAutoScript.phase='attacking';
      __wbBossAutoScriptMonitorBossHP(target,idx,list);
    },1500);

  } else if(isDead){
    // Boss dead → next
    var hasRespawn=false;
    var respawnStr=null;
    var respawnMatch=subText.match(/(\d{1,2}):(\d{2})/);
    if(respawnMatch){
      var h=parseInt(respawnMatch[1],10),min=parseInt(respawnMatch[2],10);
      respawnStr=h+':'+(min<10?'0':'')+min;
      var now=new Date();
      var targetTime=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,min,0);
      if(targetTime<=now)targetTime.setDate(targetTime.getDate()+1);
      var secondsLeft=Math.round((targetTime-now)/1000);
      if(secondsLeft>0&&secondsLeft<86400){hasRespawn=true;}
    }
    var skipReason='BOSS\u5DF2\u88AB\u64CA\u6557';
    if(respawnStr)skipReason+=', \u4E0B\u6B21\u91CD\u751F\u7D04 '+respawnStr;
    else skipReason+=', \u7121\u91CD\u751F\u6642\u9593';
    __wbAddBossHistory(target.name,'skip',skipReason,0,respawnStr);
    if(hasRespawn){
      console.log('[WB-AutoScript] '+target.name+' dead, respawn:'+respawnStr+' found, skipping');
    } else {
      console.log('[WB-AutoScript] '+target.name+' dead/no respawn, skipping');
    }
    window.__wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,500);
  } else {
    // Unknown \u2192 wait
    console.log('[WB-AutoScript] '+target.name+' state unclear, waiting...');
    window.__wbBossAutoScript.phase='waiting_boss';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptCheckBoss(target,idx,list);
    },5000);
  }
}

function __wbBossAutoScriptMonitorBossHP(target,idx,list){
  if(!window.__wbBossAutoScript.running)return;

  var ls=window.lastState||{};
  var boss=ls.boss||{};
  var mode=ls.mode||'';
  var bossHp=boss.hp||0;
  var bossMax=boss.maxHp||1;

  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='[ATTACK] '+target.name+' HP:'+Math.round(bossHp/bossMax*100)+'%';

  // If boss HP is 0 and not in battle mode, it's dead
  if(bossHp<=0&&mode!=='bosscombat'){
    window.__wbBossAutoScript.phase='waiting_loot';
    __wbBossAutoScriptWaitForLoot(target,idx,list);
    return;
  }

  // If in bosscombat, ensure auto attack is on
  if(mode==='bosscombat'&&bossHp>0){
    var atkChk=document.getElementById('__gmp_boss_auto_atk');
    if(atkChk&&!atkChk.checked)atkChk.checked=true;
    var enableChk=document.getElementById('__gmp_boss_auto_enable');
    if(enableChk&&!enableChk.checked)enableChk.checked=true;
    if(window.__wbSyncAutoConfig)__wbSyncAutoConfig();
    if(window.__wbBossAuto&&!window.__wbBossAuto.running&&window.__wbBossAutoStart){
      __wbBossAutoStart();
    }
  }

  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbBossAutoScriptMonitorBossHP(target,idx,list);
  },2000);
}

function __wbBossAutoScriptRestoreFarm(){
  if(window.__wbBossAutoScript.farmWasRunning){
    window.__wbBossAutoScript.farmWasRunning=false;
    console.log('[WB-AutoScript] Restoring farm');
    var farmBtn=document.getElementById('__gmp_farm_btn');
    if(farmBtn&&farmBtn.textContent.indexOf('\u25B6')>-1){
      if(window.startFarming)startFarming();
    }
  }
}

// ====== BOSS 掉落記錄 ======
// Saved to chrome.storage.local key: wb_boss_loot
// Structure: [{ id, t, bossName, drops: [{item, winner}], rank: [{player, damage}], mvp, participants, rawHTML }]

window.__wbBossLoot = [];

function __wbCaptureBossLoot(bossName){
  try {
    var ipBox = document.querySelector('.ip-box');
    if(!ipBox){
      console.log('[WB-Loot] No .ip-box found on page');
      return null;
    }

    // Parse boss name from #br-boss
    var bossEl = document.getElementById('br-boss');
    var bossDisplay = bossEl ? bossEl.textContent.trim() : bossName;

    // Parse drops
    var dropsEl = document.getElementById('br-drops');
    var drops = [];
    if(dropsEl){
      var dropRows = dropsEl.querySelectorAll('.br-row');
      dropRows.forEach(function(row){
        var icon = row.querySelector('img') ? (row.querySelector('img').getAttribute('src') || '') : '';
        var textNodes = row.querySelectorAll('.rk-n, .br-w');
        var itemName = '';
        var winner = '';
        textNodes.forEach(function(n, i){
          if(i === 0) itemName = n.textContent.trim();
          else if(i === 1) winner = n.textContent.trim();
        });
        drops.push({ icon: icon, item: itemName, winner: winner });
      });
    }

    // Parse damage rank
    var rankEl = document.getElementById('br-rank');
    var rank = [];
    var mvp = '';
    if(rankEl){
      var mvpEl = rankEl.querySelector('[style*="color:#7be87b"]');
      if(mvpEl) mvp = mvpEl.textContent.replace('奶媽MVP：', '').trim();

      var rankRows = rankEl.querySelectorAll('.rank-row');
      rankRows.forEach(function(row){
        var no = row.querySelector('.rk-no');
        var name = row.querySelector('.rk-n');
        var dmg = row.querySelector('.rk-d');
        if(no && name && dmg){
          rank.push({
            rank: parseInt(no.textContent) || rank.length + 1,
            player: name.textContent.trim(),
            damage: dmg.textContent.trim()
          });
        }
      });
    }

    // Collect all participants (unique)
    var participants = [];
    drops.forEach(function(d){ if(d.winner && participants.indexOf(d.winner) === -1) participants.push(d.winner); });
    rank.forEach(function(r){ if(r.player && participants.indexOf(r.player) === -1) participants.push(r.player); });
    if(mvp && participants.indexOf(mvp) === -1) participants.push(mvp);

    var entry = {
      id: Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      t: Date.now(),
      bossName: bossDisplay,
      drops: drops,
      rank: rank,
      mvp: mvp,
      participants: participants,
      rawHTML: ipBox.innerHTML.substring(0, 2000)
    };

    // Save to window array
    window.__wbBossLoot.push(entry);

    // Persist to chrome.storage
    __wbSaveBossLoot();

    console.log('[WB-Loot] Captured boss loot for ' + bossDisplay + ' (' + drops.length + ' drops, ' + rank.length + ' rankers)');
    return entry;
  } catch(e){
    console.error('[WB-Loot] Capture error:', e);
    return null;
  }
}

function __wbSaveBossLoot(){
  try {
    var data = window.__wbBossLoot || [];
    // Keep last 200 entries max
    if(data.length > 200) data = data.slice(-200);
    var serialized = JSON.stringify(data);
    // Use chrome.storage.local directly (injected context)
    if(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local){
      chrome.storage.local.set({ wb_boss_loot: data }, function(){
        console.log('[WB-Loot] Saved ' + data.length + ' entries to storage');
      });
    } else if(window.__wbSaveToStorage){
      window.__wbSaveToStorage('wb_boss_loot', data);
    }
  } catch(e){
    console.error('[WB-Loot] Save error:', e);
  }
}

function __wbLoadBossLoot(callback){
  try {
    if(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local){
      chrome.storage.local.get('wb_boss_loot', function(result){
        window.__wbBossLoot = result.wb_boss_loot || [];
        if(callback) callback(window.__wbBossLoot);
      });
    } else {
      window.__wbBossLoot = window.__wbBossLoot || [];
      if(callback) callback(window.__wbBossLoot);
    }
  } catch(e){
    window.__wbBossLoot = [];
    if(callback) callback([]);
  }
}

function __wbGetBossLoot(){
  return window.__wbBossLoot || [];
}

function __wbClearBossLoot(){
  window.__wbBossLoot = [];
  __wbSaveBossLoot();
}

// ====== BOSS 歷史記錄 ======
// Log entry structure:
// { id: unique, t: Date.now(), bossName: string, event: 'enter'|'leave'|'defeat'|'death'|'reenter'|'fail_entry'|'skip',
//   details: string, bossHp: number, nextRespawn: string|null }

window.__wbBossHistory = [];

function __wbAddBossHistory(bossName, event, details, bossHp, nextRespawn){
  var entry = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    t: Date.now(),
    bossName: bossName || '?',
    event: event || 'unknown',
    details: details || '',
    bossHp: bossHp || 0,
    nextRespawn: nextRespawn || null
  };
  window.__wbBossHistory.push(entry);
  __wbSaveBossHistory();
  return entry;
}

function __wbSaveBossHistory(){
  // Keep last 500 entries
  if(window.__wbBossHistory.length > 500) window.__wbBossHistory = window.__wbBossHistory.slice(-500);
  if(typeof window.__gmStorageSet === 'undefined') return;
  window.__gmStorageSet('wb_boss_history', window.__wbBossHistory).catch(function(){});
}

function __wbLoadBossHistory(callback){
  if(typeof window.__gmStorageGet === 'undefined'){ if(callback) callback([]); return; }
  window.__gmStorageGet(['wb_boss_history']).then(function(r){
    var list = r && r.wb_boss_history || [];
    window.__wbBossHistory = list;
    if(callback) callback(list);
  }).catch(function(){
    window.__wbBossHistory = [];
    if(callback) callback([]);
  });
}

function __wbClearBossHistory(){
  window.__wbBossHistory = [];
  if(typeof window.__gmStorageSet !== 'undefined'){
    window.__gmStorageSet('wb_boss_history', []);
  }
}

// ====== 死亡偵測 + 自動重進 ======
// Checkbox id: __gmp_boss_auto_reenter
function __wbCanReEnterBoss(){
  var chk = document.getElementById('__gmp_boss_auto_reenter');
  return chk && chk.checked;
}

// Try to re-enter the same boss after death
function __wbBossAutoScriptReEnter(target, idx, list){
  if(!window.__wbBossAutoScript.running) return;

  var phaseEl = document.getElementById('__gmp_boss_script_status');
  if(phaseEl) phaseEl.textContent = '[重進] ' + target.name + ' 回大廳重進中...';

  // Step 1: Go to lobby / zone tab
  try { __wbEnsureWBTab(); } catch(e){}

  // Step 2: Wait for boss tab to load
  window.__wbBossAutoScript.phase = 'reenter_wait';
  window.__wbBossAutoScript.timer = setTimeout(function(){
    __wbBossAutoScriptCheckReEnter(target, idx, list);
  }, 2000);
}

function __wbBossAutoScriptCheckReEnter(target, idx, list){
  if(!window.__wbBossAutoScript.running) return;

  var cards = document.querySelectorAll('.wb-card[data-boss]');
  var foundBoss = null;
  cards.forEach(function(card){
    var bossId = card.getAttribute('data-boss');
    if(bossId === target.id) foundBoss = card;
  });

  if(!foundBoss){
    // Boss not in DOM - log and move on
    var reason = 'BOSS 不在列表中 (可能已消失/時間未到)';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, null);
    __wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);
    return;
  }

  var bossId = foundBoss.getAttribute('data-boss');
  var subEl = document.querySelector('.wb-sub[data-boss="' + bossId + '"]');
  var subText = subEl ? subEl.textContent.trim() : '';

  var isAlive = subText.indexOf('存活') !== -1 || subText.indexOf('戰鬥中') !== -1 || subText.indexOf('HP') !== -1;
  var isDead = subText.indexOf('已被擊敗') !== -1 || subText.indexOf('已被征服') !== -1;

  if(isAlive){
    // Boss is alive - enter!
    var details = 'BOSS存活, 進入戰鬥';
    __wbAddBossHistory(target.name, 'reenter', details, 0, null);

    try { foundBoss.click(); } catch(e){}
    window.__wbBossAutoScript.phase = 'entering';

    window.__wbBossAutoScript.timer = setTimeout(function(){
      // Verify entry by checking boss HP
      __wbBossAutoScriptVerifyEntry(target, idx, list, 3); // 3 attempts
    }, 1500);

  } else if(isDead){
    // Boss still dead - extract respawn info
    var respawnStr = null;
    var respawnMatch = subText.match(/(\d{1,2}):(\d{2})/);
    if(respawnMatch){
      var h = parseInt(respawnMatch[1],10), min = parseInt(respawnMatch[2],10);
      respawnStr = h + ':' + (min < 10 ? '0' : '') + min;
    }
    var reason = 'BOSS 已被擊敗';
    if(respawnStr) reason += ', 下次重生約 ' + respawnStr;
    else reason += ', 未偵測到重生時間';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, respawnStr);

    // Move to next boss
    window.__wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);

  } else {
    // Unknown state - wait and retry
    var reason = 'BOSS 狀態不明, 等待中...';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, null);

    window.__wbBossAutoScript.timer = setTimeout(function(){
      __wbBossAutoScriptCheckReEnter(target, idx, list);
    }, 5000);
  }
}

// Verify boss entry by checking lastState boss HP
function __wbBossAutoScriptVerifyEntry(target, idx, list, retriesLeft){
  if(!window.__wbBossAutoScript.running) return;

  var ls = window.lastState || {};
  var boss = ls.boss || {};
  var mode = ls.mode || '';
  var bossHp = boss.hp || 0;
  var bossMax = boss.maxHp || 1;

  // Check if we're actually in boss combat with HP > 0
  var entered = (mode === 'bosscombat' && bossHp > 0);

  if(entered){
    // Successfully entered!
    var hpPct = Math.round(bossHp / bossMax * 100);
    __wbAddBossHistory(target.name, 'enter', '成功進入, HP: ' + bossHp + '/' + bossMax + ' (' + hpPct + '%)', bossHp, null);

    // Start auto-attack
    var atkChk = document.getElementById('__gmp_boss_auto_atk');
    if(atkChk) atkChk.checked = true;
    var enableChk = document.getElementById('__gmp_boss_auto_enable');
    if(enableChk) enableChk.checked = true;
    __wbBossAutoScript.phase = 'attacking';
    __wbBossAutoScriptMonitorBossHP(target, idx, list);

  } else if(retriesLeft > 0){
    // Not yet entered, wait and retry
    window.__wbBossAutoScript.timer = setTimeout(function(){
      __wbBossAutoScriptVerifyEntry(target, idx, list, retriesLeft - 1);
    }, 2000);

  } else {
    // Failed to enter after retries
    var reason = '進入失敗(無法確認戰鬥開始), 跳到下一隻';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, null);
    __wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);
  }
}

// Modified defeat handler in MonitorBossHP - add re-enter logic


function __wbBossAutoScriptWaitForLoot(target, idx, list){
  // Check if loot capture is enabled
  var lootChk = document.getElementById('__gmp_boss_auto_loot');
  if(!lootChk || !lootChk.checked){
    console.log('[WB-Loot] Loot capture disabled by checkbox, skipping');
    __wbBossAutoScriptHandleDefeat(target, idx, list);
    return;
  }


console.log('[WB-Loot] Waiting for loot popup (.ip-box) after ' + target.name + ' defeated...');
  var maxWait = 20000; // 20 seconds max
  var interval = 500;
  var elapsed = 0;
  var captured = false;

  var poller = setInterval(function(){
    if(!window.__wbBossAutoScript.running){ clearInterval(poller); return; }
    elapsed += interval;

    var ipBox = document.querySelector('.ip-box');
    if(ipBox && ipBox.innerHTML.length > 100){
      // Loot popup found and has content
      clearInterval(poller);
      captured = true;
      console.log('[WB-Loot] Loot popup found after ' + elapsed + 'ms, capturing...');
      __wbCaptureBossLoot(target.name);
      __wbBossAutoScriptHandleDefeat(target, idx, list);
      return;
    }

    if(elapsed >= maxWait){
      clearInterval(poller);
      console.log('[WB-Loot] Loot popup not found after ' + maxWait + 'ms, proceeding without loot capture');
      __wbBossAutoScriptHandleDefeat(target, idx, list);
    }
  }, interval);
}
function __wbBossAutoScriptHandleDefeat(target, idx, list){
  console.log('[WB-AutoScript] ' + target.name + ' defeated!');

  // Log defeat
  var ls = window.lastState || {};
  var boss = ls.boss || {};
  __wbAddBossHistory(target.name, 'defeat', '擊敗 BOSS', 0, null);


  // Turn off auto-attack

  var enableChk = document.getElementById('__gmp_boss_auto_enable');
  if(enableChk) enableChk.checked = false;
  var atkChk = document.getElementById('__gmp_boss_auto_atk');
  if(atkChk) atkChk.checked = false;

  // Check re-enter setting
  if(__wbCanReEnterBoss()){
    window.__wbBossAutoScript.phase = 'reenter';
    __wbBossAutoScriptReEnter(target, idx, list);
  } else {
    // Log leave before moving on
    __wbAddBossHistory(target.name, 'leave', '離開(無重進設定)', 0, null);
    window.__wbBossAutoScript.currentIdx++;
    if(window.__wbBossAutoScript.timer) clearTimeout(window.__wbBossAutoScript.timer);
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 1000);
  }
}


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

function __wbBossAutoStart(){
  window.__wbBossAuto.running=true;
  __wbBossLoop();
  var ss=document.getElementById('__gmp_boss_auto_status_short');
  if(ss){ss.textContent='\u26A1 \u81EA\u52A8BOSS\u8FD0\u884C\u4E2D...';ss.style.color='#4ade80';}
  var ce=document.getElementById('__gmp_boss_auto_enable');
  if(ce)ce.checked=true;
}

function __wbBossAutoStop(){
  window.__wbBossAuto.running=false;
  if(window.__wbBossAuto.timer)clearTimeout(window.__wbBossAuto.timer);
  var ss=document.getElementById('__gmp_boss_auto_status_short');
  if(ss){ss.textContent='\u505C\u6B62\u4E2D';ss.style.color='#888';}
  var ce=document.getElementById('__gmp_boss_auto_enable');
  if(ce)ce.checked=false;
}


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
      if(activeTab==='boss'){__wbUpdateBossStatus();__wbUpdateWorldBossUI();}
          __wbInitHuntToggle();
          __wbUpdateHuntListUI();
    },500);
  }


// ========== 優先討伐清單管理 ==========
function __wbLoadHuntList(callback){
  if(typeof window.__gmStorageGet==='undefined'){if(callback)callback([]);return;}
  window.__gmStorageGet(['wb_min_players']).then(function(mr){
    window.__wbCachedMinPlayers=(mr&&mr.wb_min_players&&mr.wb_min_players.value)||0;
  });
  window.__gmStorageGet(['wb_priority_list']).then(function(r){
    var list=r&&r.wb_priority_list||[];
    var ids=list.map(function(i){return i.id;});
    if(callback)callback(ids);
  }).catch(function(){if(callback)callback([]);});
}

function __wbGetHuntList(callback){
  if(typeof window.__gmStorageGet==='undefined'){if(callback)callback([]);return;}
  window.__gmStorageGet(['wb_priority_list']).then(function(r){
    callback(r&&r.wb_priority_list||[]);
  }).catch(function(){callback([]);});
}

function __wbSaveHuntList(list){
  if(typeof window.__gmStorageSet==='undefined')return;
  window.__gmStorageSet('wb_min_players',{value:parseInt((document.getElementById('__gmp_hunt_min_players')||{}).value)||0});
  window.__gmStorageSet('wb_priority_list',list).then(function(){
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
      el.innerHTML=list.map(function(i,idx){
        var upBtn=idx>0?'<span style="font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;" onclick="__wbMoveHuntItem(\''+i.id+'\',-1)">\u25B2</span>':'<span style="font-size:9px;color:#333;min-width:14px;text-align:center;">\u25B2</span>';
        var dnBtn=idx<list.length-1?'<span style="font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;" onclick="__wbMoveHuntItem(\''+i.id+'\',1)">\u25BC</span>':'<span style="font-size:9px;color:#333;min-width:14px;text-align:center;">\u25BC</span>';
        return '<div style="display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;">'+
          upBtn+dnBtn+
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
  window.__wbMoveHuntItem=__wbMoveHuntItem;window.__wbGetHuntIds=__wbGetHuntIds;
  window.__wbCaptureBossLoot=__wbCaptureBossLoot;window.__wbSaveBossLoot=__wbSaveBossLoot;
  window.__wbLoadBossLoot=__wbLoadBossLoot;window.__wbGetBossLoot=__wbGetBossLoot;
  window.__wbClearBossLoot=__wbClearBossLoot;
  window.__wbBossAutoScriptWaitForLoot=__wbBossAutoScriptWaitForLoot;
  window.__wbBossAutoScriptStart=__wbBossAutoScriptStart;
  window.__wbBossAutoScriptStop=__wbBossAutoScriptStop;

  console.log("[WB] World Boss module loaded");
})();
