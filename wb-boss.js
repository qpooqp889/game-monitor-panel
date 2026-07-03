/* wb-boss.js v3.25 - BOSS Auto Script */

// ====== Debug Logger (觸發條件: 偵測到重生 < 30s) ======
// 儲存至 chrome.storage.local key: __gmp_debug_log
// 每次 <30s 觸發開始記錄，匯出時可取用
window.__wb_debug_active=false;
window.__wb_debug_entries=[];

// 啟動 debug log（當偵測到 <30s 重生時呼叫）
function __wbDebugStart(bossName,reason){
  window.__wb_debug_active=true;
  window.__wb_debug_entries=[];
  window.__wb_debug_boss=bossName;
  __wbDebugLog('start','Debug log started: '+bossName+' - '+reason);
}

// 停止 debug log（BOSS 進入成功/擊敗/跳過）並存檔
function __wbDebugStop(result){
  if(!window.__wb_debug_active)return;
  __wbDebugLog('stop','Debug log stopped: '+result);
  window.__wb_debug_active=false;
  __wbDebugFlush();
}

// 記錄一筆 log
function __wbDebugLog(category,message){
  if(!window.__wb_debug_active)return;
  var entry={
    time:new Date().toISOString(),
    boss:window.__wb_debug_boss||'',
    cat:category,
    msg:message
  };
  window.__wb_debug_entries.push(entry);
  console.log('[WB-DEBUG] '+category+': '+message);
}

// 將收集的 log 寫入 chrome.storage.local（append 式，保留最近 500 組 session）
function __wbDebugFlush(){
  if(!window.__wb_debug_entries.length)return;
  var session={
    boss:window.__wb_debug_boss||'',
    startTime:window.__wb_debug_entries[0]?window.__wb_debug_entries[0].time:'',
    entries:window.__wb_debug_entries.slice()
  };
  window.__wb_debug_entries=[];
  try{
    var getter=window.__gmStorageGet||(function(k){return chrome.storage.local.get(k);});
    var setter=window.__gmStorageSet||(function(k,v){return chrome.storage.local.set({[k]:v});});
    getter(['__gmp_debug_sessions']).then(function(res){
      var sessions=(res&&res.__gmp_debug_sessions)||[];
      sessions.push(session);
      if(sessions.length>500)sessions=sessions.slice(-500);
      return setter('__gmp_debug_sessions',sessions);
    }).then(function(){
      console.log('[WB-DEBUG] Session saved ('+session.entries.length+' entries), total in store');
    }).catch(function(e){console.log('[WB-DEBUG] Flush error: '+e.message);});
  }catch(e){
    console.log('[WB-DEBUG] Flush error: '+e.message);
  }
}

// 匯出全部 debug sessions 為 JSON 字串（供使用者複製/匯出）
window.__wbDebugExport=function(){
  var getter=window.__gmStorageGet||(function(k){return chrome.storage.local.get(k);});
  getter(['__gmp_debug_sessions']).then(function(res){
    var sessions=(res&&res.__gmp_debug_sessions)||[];
    if(!sessions.length){console.log('[WB-DEBUG-EXPORT] No sessions found');alert('No debug sessions found');return;}
    var totalEntries=sessions.reduce(function(s,ss){return s+(ss.entries?ss.entries.length:0);},0);
    console.log('[WB-DEBUG-EXPORT] ========== START ('+sessions.length+' sessions, '+totalEntries+' entries) ==========');
    sessions.forEach(function(session,i){
      console.log('--- Session '+(i+1)+': '+session.boss+' @ '+session.startTime+' ('+session.entries.length+' entries) ---');
      (session.entries||[]).forEach(function(e){
        console.log('  ['+e.cat+'] '+e.msg+'  ('+e.time+')');
      });
    });
    console.log('[WB-DEBUG-EXPORT] ========== END ==========');
    console.log('[WB-DEBUG-EXPORT] RAW JSON:\n'+JSON.stringify(sessions,null,2));
    alert('Debug log exported!\nSessions: '+sessions.length+'\nTotal entries: '+totalEntries);
  }).catch(function(e){
    console.log('[WB-DEBUG-EXPORT] Error: '+e.message);
  });
};
// ====== wb-boss.js - World Boss Module ======
// Extracted from game-monitor.js v2.30
// Encapsulated in IIFE, all functions on window.__wb* namespace

// ====== 模組初始化 / IIFE 包裝 ======
(function(){
  if(window.__wbModuleLoaded){console.log("[WB] Module already loaded, skip");return;}
  window.__wbModuleLoaded=true;
  console.log("[WB] World Boss module loading...");

  // === Socket Hook (installSioHook) ===


// ====== 討伐清單排序（上移/下移/刪除） ======

// 取得討伐清單中的所有 BOSS ID（純 id 陣列）
// @param {Function} callback - 回呼函式，接收 id 字串陣列
function __wbGetHuntIds(callback){
  __wbGetHuntList(function(list){
    if(callback)callback(list?list.map(function(i){return i.id;}):[]);
  });
}

// 移動單一討伐項目（dir= -1 上移, +1 下移）
// @param {string} id - BOSS id
// @param {number} dir - 移動方向：-1=上移, +1=下移
function __wbMoveHuntItem(id, dir){
  __wbGetHuntList(function(list){
    var idx=list.findIndex(function(i){return i.id===id;});
    if(idx<0)return;
    var newIdx=idx+dir;
    if(newIdx<0||newIdx>=list.length)return;
    // 交換相鄰元素位置
    var tmp=list[idx];
    list[idx]=list[newIdx];
    list[newIdx]=tmp;
    __wbSaveHuntList(list);
  });
}
// === 上移/下移勾選項目 ===
// 批量移動討伐清單中已勾選的項目
// @param {number} dir - 移動方向：負值=上移, 正值=下移
function __wbHuntMoveSelected(dir){
  var boxes=document.querySelectorAll('.__gmp_hunt_chk:checked');
  console.log('[GMP-huntMove] dir='+dir+' found '+boxes.length+' checked');
  if(!boxes.length)return;
  var ids=[];
  boxes.forEach(function(b){ids.push(b.value);});
  __wbGetHuntList(function(list){
    if(dir<0){
      // 上移：先依目前位置遞增排序，從最前面的項目開始移動
      ids.sort(function(a,b){
        var ia=list.findIndex(function(i){return i.id===a;});
        var ib=list.findIndex(function(i){return i.id===b;});
        return ia-ib;
      });
      ids.forEach(function(id){
        var idx=list.findIndex(function(i){return i.id===id;});
        if(idx>0){
          // 與前一個元素交換（上移）
          var tmp=list[idx-1];list[idx-1]=list[idx];list[idx]=tmp;
        }
      });
    } else {
      // 下移：先依目前位置遞減排序，從最後面的項目開始移動（避免索引錯位）
      ids.sort(function(a,b){
        var ia=list.findIndex(function(i){return i.id===a;});
        var ib=list.findIndex(function(i){return i.id===b;});
        return ib-ia;
      });
      ids.forEach(function(id){
        var idx=list.findIndex(function(i){return i.id===id;});
        if(idx>=0&&idx<list.length-1){
          // 與後一個元素交換（下移）
          var tmp=list[idx+1];list[idx+1]=list[idx];list[idx]=tmp;
        }
      });
    }
    __wbSaveHuntList(list);
  });
}

// === 刪除勾選項目 ===
// 從討伐清單中批次移除已勾選的項目
function __wbHuntDeleteSelected(){
  var boxes=document.querySelectorAll('.__gmp_hunt_chk:checked');
  console.log('[GMP-huntDelete] found '+boxes.length+' checked');
  if(!boxes.length)return;
  var ids=new Set();
  boxes.forEach(function(b){ids.add(b.value);});
  __wbGetHuntList(function(list){
    // 用 Set 過濾，效率比 Array.indexOf 更高
    var filtered=list.filter(function(i){return !ids.has(i.id);});
    if(filtered.length<list.length){
      console.log('[GMP-huntDelete] removed '+(list.length-filtered.length)+' items');
      __wbSaveHuntList(filtered);
    }
  });
}


// ====== BOSS 自動腳本狀態 ======
// 全域狀態物件：running/停止中、timer/排程器、currentIdx/目前索引、phase/階段、farmWasRunning/農怪是否先前執行中
window.__wbBossAutoScript={running:false,timer:null,currentIdx:0,phase:'idle',farmWasRunning:false,
mode:'scheduled',respawnTimer:null,respawnBoss:null,respawnAttempts:0};
// mode: 'scheduled' (盯第一個+重生計時) 或 'realtime' (每輪掃全部)
// respawnTimer: 重生專屬計時器
// respawnBoss: 正在等重生的 BOSS 物件
// respawnAttempts: 重進嘗試次數 (最多3次)

// ====== 模式持久化 ======
// 設定模式並立即儲存
function __wbSetBossScriptMode(mode){
  if(!window.__wbBossAutoScript)return;
  window.__wbBossAutoScript.mode=mode;
  __wbSaveBossScriptMode(mode);
  console.log('[WB-BossScript] Mode set to:'+mode);
}

function __wbLoadBossScriptMode(){
  if(!window.__gmStorageGet)return;
  __gmStorageGet('wb_script_mode',function(v){
    var el=document.getElementById('__gmp_boss_script_mode');
    if(el&&v)el.value=v;
    window.__wbBossAutoScript.mode=v||'scheduled';
  });
}
function __wbSaveBossScriptMode(m){
  window.__wbBossAutoScript.mode=m;
  if(window.__gmStorageSet)window.__gmStorageSet('wb_script_mode',{mode:m});
}


// ====== BOSS 自動腳本主循環（開始/停止/主迴圈） ======

// 啟動 BOSS 自動討伐腳本
// 流程：先記下農怪狀態 → 停止農怪 → 載入歷史記錄 → 勾選自動重進 → 開始主循環

// ====== 確保遊戲 UI 切換到世界王頁籤 ======
// 導航流程：點擊「狩獵場」主頁籤 → 點擊「世界王」子頁籤
// 找不到世界王子頁籤時仍記錄警告但不拋出例外（caller 用 try/catch 包裹）
function __wbEnsureWBTab(){
  // Step 1: 點擊遊戲的「狩獵場」主頁籤
  var zoneTab=document.querySelector('div.tab[data-tab="zone"]');
  if(!zoneTab){console.warn('[WB-Ensure] 找不到狩獵場主頁籤 (data-tab="zone")');return;}
  zoneTab.click();console.log('[WB-Ensure] Clicked 狩獵場 main tab');
  
  // Step 2: 等待 DOM 更新後點擊「世界王」子頁籤
  // 依序嘗試: data-tab="boss" → 文字含「世界王」的 tab → 假設卡片已可見
  setTimeout(function(){
    var wbSubTab=document.querySelector('div.tab[data-tab="boss"]');
    if(!wbSubTab){
      var allTabs=document.querySelectorAll('div.tab, button.tab, span.tab, a.tab, .zone-tab, .sub-tab');
      allTabs.forEach(function(t){if(t.textContent.indexOf('\u4E16\u754C\u738B')!==-1)wbSubTab=t;});
    }
    if(wbSubTab){wbSubTab.click();console.log('[WB-Ensure] Clicked 世界王 sub-tab');}
    else{console.log('[WB-Ensure] 世界王 sub-tab not found, cards may already be visible');}
  },600);
}

function __wbBossAutoScriptStart(){
  if(window.__wbBossAutoScript.running)return;
  var cfgChk=document.getElementById('__gmp_boss_auto_script_enable');
  if(!cfgChk||!cfgChk.checked)return;
  __wbLoadBossScriptMode();

  // Remember & stop farming
  // 記住目前農怪狀態，稍後才能在結束時復原
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
  // 腳本啟動時自動勾選「死亡重進」
  var reChk=document.getElementById('__gmp_boss_auto_reenter');
  if(reChk)reChk.checked=true;

  __wbBossAutoScriptLoop();
}

// 停止 BOSS 自動討伐腳本
// 會清除所有排程、重置索引，並嘗試復原先前被中斷的農怪
function __wbBossAutoScriptStop(){
  window.__wbBossAutoScript.running=false;
  if(window.__wbBossAutoScript.timer){
    clearTimeout(window.__wbBossAutoScript.timer);
    window.__wbBossAutoScript.timer=null;
  }
  clearTimeout(window.__wbBossAutoScript.respawnTimer);
  window.__wbBossAutoScript.respawnTimer=null;
  window.__wbBossAutoScript.currentIdx=0;
  window.__wbBossAutoScript.phase='idle';
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='\u2716 BOSS\u811A\u672C\u5DF2\u505C\u6B62';
  // Restore farming
  // 復原先前被中斷的農怪狀態
  if(window.__wbBossAutoScript.farmWasRunning){
    window.__wbBossAutoScript.farmWasRunning=false;
    var farmBtn=document.getElementById('__gmp_farm_btn');
    if(farmBtn&&farmBtn.textContent.indexOf('\u25B6')>-1){
      if(window.startFarming)startFarming();
    }
  }
}

// BOSS 自動討伐主循環
// 依序檢查討伐清單中的每隻 BOSS：找到目標 → 切換頁籤 → 等待資料 → 檢查狀態
function __wbBossAutoScriptLoop(){
  if(!window.__wbBossAutoScript.running)return;
  var cfgChk=document.getElementById('__gmp_boss_auto_script_enable');
  if(!cfgChk||!cfgChk.checked){__wbBossAutoScriptStop();return;}
  var mode=window.__wbBossAutoScript.mode||'scheduled';
  __wbGetHuntList(function(list){
    if(!list||!list.length){
      window.__wbBossAutoScript.phase='idle';
      __wbBossAutoScriptRestoreFarm();
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,10000);
      return;
    }
    // 即時模式：依序遍歷全部，找第一個存活的
    if(mode==='realtime'){
      __wbBossAutoScriptLoopRealtime(list,0);
      return;
    }
    // === 智能模式：收集所有 BOSS 狀態，按重生時間排序 ===
    var now=new Date();
    var scoredList=[]; // {idx, target, priority:0=已可進,1=<60s,2=>60s, secondsLeft}
    for(var si=0;si<list.length;si++){
      var t=list[si];
      var card=document.querySelector('.wb-card[data-boss="'+t.id+'"]');
      if(!card)continue;
      var subEl=document.querySelector('.wb-sub[data-boss="'+t.id+'"]');
      var subText=subEl?subEl.textContent.trim():'';
      var isAlive=subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1||subText.indexOf('\u5728\u5834')!==-1;
      var isDead=subText.indexOf('\u5DF2\u88AB\u64CA\u6557')!==-1||subText.indexOf('\u5DF2\u88AB\u5FB4\u670D')!==-1;
      if(isAlive){
        // 檢查最低人數門檻
        var thr=(t&&t.minPlayers)?t.minPlayers:0;
        if(thr>0){
          var pMatch=subText.match(/(\d+)/);
          var curP=pMatch?parseInt(pMatch[1],10):0;
          if(curP<thr){
            // 人數不足門檻，排到最末位
            scoredList.push({idx:si, target:t, priority:999, secondsLeft:-999, subText:subText});
            console.log('[WB-Scan] ALIVE-lowPlayers: '+t.name+' ('+curP+'/'+thr+')');
            continue;
          }
        }
        scoredList.push({idx:si, target:t, priority:0, secondsLeft:-999, subText:subText});
        console.log('[WB-Scan] ALIVE: '+t.name+' (idx='+si+')');
        continue;
      }
      if(isDead){
        var m=subText.match(/(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})/);
        if(m){
          var mo=parseInt(m[1]), d=parseInt(m[2]), h=parseInt(m[3]), mi=parseInt(m[4]);
          var targetTime=new Date(now.getFullYear(),mo-1,d,h,mi,0);
          if(targetTime<=now)targetTime.setDate(targetTime.getDate()+1);
          var sl=Math.round((targetTime-now)/1000);
          var pty=sl<=0?0:(sl<=60?1:2);
          scoredList.push({idx:si, target:t, priority:pty, secondsLeft:sl, subText:subText, respStr:m[0]});
          console.log('[WB-Scan] DEAD+respawn: '+t.name+' (idx='+si+') resp:'+m[0]+' '+sl+'s left, priority='+pty);
        } else {
          scoredList.push({idx:si, target:t, priority:0, secondsLeft:-1, subText:subText});
          console.log('[WB-Scan] DEAD no-respawn: '+t.name+' (idx='+si+'), push as priority=0 for CheckBoss');
        }
      }else{
        scoredList.push({idx:si, target:t, priority:0, secondsLeft:-1, subText:subText});
        console.log('[WB-Scan] UNKNOWN: '+t.name+' (idx='+si+') sub="'+subText+'", push as priority=0');
      }
    }
    if(!scoredList.length){
      console.log('[WB-Scan] No boss available, retrying in 10s');
      __wbBossAutoScriptRestoreFarm();
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,10000);
      return;
    }
    // 排序: priority=0 最優先 → priority=1 次之(依secondsLeft升序) → priority=2 最後(依secondsLeft升序)
    scoredList.sort(function(a,b){
      if(a.priority!==b.priority)return a.priority-b.priority;
      if(a.priority===0)return a.idx-b.idx; // 存活用原始順序
      return a.secondsLeft-b.secondsLeft; // 死了按重生時間由近到遠
    });
    // 全部 BOSS 都保留，取最好的（不過濾，讓遠的重生也能排隊等）
    console.log('[WB-Scan] Sorted list: '+scoredList.map(function(x){return x.target.name+'(p'+x.priority+' s'+x.secondsLeft+')';}).join(', '));
    var best=scoredList[0];
    var idx=best.idx;
    var target=best.target;
    
    // 如果是尚未重生的 BOSS（需等待），計算等待時間
    // secondsLeft >= 30 → 等到剩 <30s 開始狂點
    // 0 < secondsLeft < 30 → 立即狂點
    // secondsLeft < 0 → 已可進入，正常流程
    if(best.secondsLeft>0){
      var waitUntilSpam=Math.max(best.secondsLeft-29,0);
      console.log('[WB-Scan] '+target.name+' respawn in '+best.secondsLeft+'s, wait '+waitUntilSpam+'s then spam-click at 30s mark');
      __wbAddBossHistory(target.name,'wait','\u7B49\u5F85\u91CD\u751F '+best.respStr+' (\u5269'+best.secondsLeft+'s, '+waitUntilSpam+'s\u5F8C\u72C2\u9EDE)',0,best.respStr);
      window.__wbBossAutoScript.currentIdx=idx;
      window.__wbBossAutoScript.phase='waiting_spam';
      var statusEl2=document.getElementById('__gmp_boss_script_status');
      if(statusEl2)statusEl2.textContent='[WAIT] '+target.name+' \u91CD\u751F\u5012\u6578'+best.secondsLeft+'s...';
      try{__wbEnsureWBTab();}catch(e){}
      // 等到剩 30s 時重新 Loop（Loop 會重新掃描，那時它就會進入 ≤30s 狂點分支）
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,(waitUntilSpam+2)*1000);
      return;
    }

    // priority=999: alive but minPlayers not met → periodic re-scan until players arrive
    if(best.priority===999){
      console.log('[WB-Scan] All in-field BOSSes low players, periodic rescan in 5s');
      __wbAddBossHistory(target.name,'wait','\u5B58\u6D3B\u4F46\u4EBA\u6578\u4E0D\u8DB3(\u6700\u4F4E'+((target&&target.minPlayers)?target.minPlayers:0)+')\uFF0C5s\u5F8C\u91CD\u65B0\u626B\u63CF',0,null);
      window.__wbBossAutoScript.currentIdx=0;
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,5000);
      return;
    }

    window.__wbBossAutoScript.currentIdx=idx;
    window.__wbBossAutoScript.phase='checking';
    var statusEl=document.getElementById('__gmp_boss_script_status');
    if(statusEl)statusEl.textContent='[BOSS] '+target.name+' ('+(idx+1)+'/'+list.length+')...';
    try{__wbEnsureWBTab();}catch(e){}
    window.__wbBossAutoScript.phase='waiting_boss';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptCheckBoss(target,idx,list);
    },2000);
  });
}
// 即時模式：依序遍歷全部清單，找第一個符合進入條件的
function __wbBossAutoScriptLoopRealtime(list,startIdx){
  if(!window.__wbBossAutoScript.running)return;
  var cfgChk=document.getElementById('__gmp_boss_auto_script_enable');
  if(!cfgChk||!cfgChk.checked){__wbBossAutoScriptStop();return;}
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='即時掃描 '+list.length+' 項...';
  if(startIdx>=list.length){
    if(statusEl)statusEl.textContent='即時: 本輪無可進入BOSS,5秒後重掃';
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,5000);
    return;
  }
  __wbBossAutoScriptRTNext(list,startIdx,list.slice(startIdx));
}
// 即時模式：檢查清單中第一個可進入的BOSS
function __wbBossAutoScriptRTNext(fullList,startIdx,candidates){
  if(!window.__wbBossAutoScript.running)return;
  if(!candidates||!candidates.length){
    var statusEl=document.getElementById('__gmp_boss_script_status');
    if(statusEl)statusEl.textContent='即時: 本輪無可進入BOSS,5秒後重掃';
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,5000);
    return;
  }
  var target=candidates[0];
  var remaining=candidates.slice(1);
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='即時: 檢查 '+target.name+'...';
  try{__wbEnsureWBTab();}catch(e){}
  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbBossAutoScriptRTReadDOM(target,remaining,fullList);
  },2000);
}
// 即時模式：讀取DOM判斷是否可進入
function __wbBossAutoScriptRTReadDOM(target,remaining,fullList){
  if(!window.__wbBossAutoScript.running)return;
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var found=null;
  cards.forEach(function(card){
    if(card.getAttribute('data-boss')===target.id)found=card;
  });
  if(!found){
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptRTReadDOM(target,remaining,fullList);
    },3000);
    return;
  }
  var subEl=document.querySelector('.wb-sub[data-boss="'+target.id+'"]');
  var subText=subEl?subEl.textContent.trim():'';
  var isAlive=subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1||subText.indexOf('\u5728\u5834')!==-1;
  var isDead=subText.indexOf('\u5DF2\u88AB\u64CA\u6557')!==-1||subText.indexOf('\u5DF2\u88AB\u5FB4\u670D')!==-1;
  if(!isAlive){
    console.log('[WB-Realtime] '+target.name+' state='+subText+', skipping');
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptRTNext(fullList,0,remaining);
    },500);
    return;
  }
  // 可進入！
  console.log('[WB-Realtime] '+target.name+' enterable, joining...');
  __wbAddBossHistory(target.name,'enter','即時模式進入',0,null);
  window.__wbBossAutoScript.entryRetry=0;
  __wbBossAutoScriptRTEnter(target,found,fullList);
}
// 即時模式：進入BOSS（含重試）
function __wbBossAutoScriptRTEnter(target,card,fullList){
  if(!window.__wbBossAutoScript.running)return;
  var retry=window.__wbBossAutoScript.entryRetry||0;
  if(retry===0&&card)try{card.click();}catch(e){}
  window.__wbBossAutoScript.timer=setTimeout(function(){
    var ls=window.lastState||{};
    if(ls.mode==='bosscombat'&&(ls.boss||{}).hp>0){
      console.log('[WB-Realtime] Entered '+target.name);
      window.__wbBossAutoScript.phase='attacking';
      __wbBossAutoScriptRTHP(target,fullList);
    } else if(retry<2){
      window.__wbBossAutoScript.entryRetry=retry+1;
      if(card)try{card.click();}catch(e){}
      window.__wbBossAutoScript.timer=setTimeout(function(){
        __wbBossAutoScriptRTEnter(target,card,fullList);
      },3000);
    } else {
      console.log('[WB-Realtime] Failed to enter after 3 retries, next boss');
      window.__wbBossAutoScript.entryRetry=0;
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,3000);
    }
  },2500);
}
// 即時模式：監控HP（擊敗後不回原BOSS，切回主循環）
function __wbBossAutoScriptRTHP(target,fullList){
  if(!window.__wbBossAutoScript.running)return;
  var ls=window.lastState||{};
  var mode=ls.mode||'';
  var bossHp=(ls.boss||{}).hp||0;
  var bossMax=(ls.boss||{}).maxHp||1;
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='即時: '+target.name+' HP:'+Math.round(bossHp/bossMax*100)+'%';
  if(bossHp<=0&&mode!=='bosscombat'){
    console.log('[WB-Realtime] Boss defeated, back to loop');
    window.__wbBossAutoScript.phase='idle';
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,3000);
    return;
  }
  if(mode==='bosscombat'){
    var atkChk=document.getElementById('__gmp_boss_auto_atk');
    if(atkChk&&!atkChk.checked)atkChk.checked=true;
    var enChk=document.getElementById('__gmp_boss_auto_enable');
    if(enChk&&!enChk.checked)enChk.checked=true;
    if(window.__wbBossAuto&&!window.__wbBossAuto.running&&window.__wbBossAutoStart){
      __wbBossAutoStart();
    }
  }
  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbBossAutoScriptRTHP(target,fullList);
  },2000);
}// ====== BOSS 進入設定 & 狀態檢查 ======

// 檢查指定 BOSS 的 DOM 狀態，決定進入/跳過/等待
// @param {Object} target - 討伐清單中的 BOSS 物件（含 id, name, minPlayers）
// @param {number} idx - 在清單中的索引
// @param {Array}  list - 完整討伐清單
function __wbBossAutoScriptCheckBoss(target,idx,list){
  if(!window.__wbBossAutoScript.running)return;

  // Read boss from DOM cards
  // 從遊戲 DOM 中的 .wb-card 查找目標 BOSS
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var foundBoss=null;
  cards.forEach(function(card){
    var bossId=card.getAttribute('data-boss');
    if(bossId===target.id){foundBoss=card;}
  });

  if(!foundBoss){
    // BOSS 不在 DOM 中（可能尚未載入或頁籤未切換），等 3 秒重試
    var _domCardsCount=document.querySelectorAll('.wb-card[data-boss]').length;
    console.log('[WB-AutoScript] '+target.name+'('+target.id+') not in DOM ('+_domCardsCount+' cards total), waiting...');
    __wbAddBossHistory(target.name,'fail_entry','DOM查無卡片(共'+_domCardsCount+'張, 可能頁籤未切換)',0,null);
    window.__wbBossAutoScript.phase='waiting_boss';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      __wbBossAutoScriptCheckBoss(target,idx,list);
    },3000);
    return;
  }

  // Get boss status from sub element
  // 從 .wb-sub 子元素讀取 BOSS 狀態文字（存活/死亡/重生時間）
  var bossId=foundBoss.getAttribute('data-boss');
  var subEl=document.querySelector('.wb-sub[data-boss="'+bossId+'"]');
  var subText=subEl?subEl.textContent.trim():'';

  // Debug: 記錄 subText 以協助排查狀態文字格式
  console.log('[WB-DEBUG] subText for '+target.name+': '+subText);

  // 判斷 BOSS 狀態：比對繁體中文關鍵字
  var isAlive=subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1||subText.indexOf('\u5728\u5834')!==-1;
  var isDead=subText.indexOf('\u5DF2\u88AB\u64CA\u6557')!==-1||subText.indexOf('\u5DF2\u88AB\u5FB4\u670D')!==-1;

  if(isAlive){
    // BOSS 存活：檢查最低人數門檻
    var threshold=(target&&target.minPlayers)?target.minPlayers:0;
    if(threshold>0){
      var playersText=subEl?subEl.textContent.trim():'';
      var pcMatch=playersText.match(/(\d+)/);
      var curPlayers=pcMatch?parseInt(pcMatch[1],10):0;
      if(curPlayers<threshold){
        // 人數不足門檻，等待 5 秒後回到 Loop 重新智慧掃描
        console.log('[WB-AutoScript] '+target.name+' only '+curPlayers+' players (<'+threshold+'), rescan in 5s');
        __wbAddBossHistory(target.name,'skip','\u4EBA\u6578\u4E0D\u8DB3: '+curPlayers+'/'+threshold+'\uFF0C5s\u5F8C\u91CD\u65B0\u626B\u63CF','0',null);
        window.__wbBossAutoScript.currentIdx=0;
        window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,5000);
        return;
      }
    }
    // 人數達標或無門檻 → 進入 BOSS
    console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');
    __wbAddBossHistory(target.name, 'enter', '\u5617\u8A66\u9032\u5165BOSS', 0, null);
    window.__wbBossAutoScript.phase='entering';

    // 進入 BOSS 房間（含重試機制，最多 3 次）
    window.__wbBossAutoScript.entryRetry=0;
    __wbBossAutoScriptTryEnter(target,idx,list,foundBoss);

  } else if(isDead){
    // === BOSS 已死亡：解析重生時間，判斷是否已可進入 ===
    // 從 subText 擷取重生時間 (e.g. "已被擊敗，20:00 重生")
    var respawnMatch=subText.match(/(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})/);
    var respawnStr=null;
    var secondsLeft=null;
    if(respawnMatch){
      var mo=parseInt(respawnMatch[1],10),d=parseInt(respawnMatch[2],10),h=parseInt(respawnMatch[3],10),min=parseInt(respawnMatch[4],10);
      respawnStr=mo+'/'+d+' '+h+':'+(min<10?'0':'')+min;
      var _now2=new Date();
      var targetTime=new Date(_now2.getFullYear(),mo-1,d,h,min,0);
      if(targetTime<=_now2)targetTime.setDate(targetTime.getDate()+1);
      secondsLeft=Math.round((targetTime-_now2)/1000);
    }

    // 重生時間 < 30 秒 → 狂點卡片嘗試進入（無重試上限，卡在門口直到進去）
    if(respawnStr&&secondsLeft!==null&&secondsLeft<30&&secondsLeft>0){
      var _reason='BOSS\u5DF2\u88AB\u64CA\u6557,\u91CD\u751F\u5012\u6578'+secondsLeft+'s(\u7D04'+respawnStr+')\uFF0C\u72C2\u9EDE\u9032\u5165';
      console.log('[WB-AutoScript] '+target.name+': '+_reason);
      __wbAddBossHistory(target.name,'enter',_reason,0,respawnStr);
      window.__wbBossAutoScript.phase='entering_spam';
      // 等重生倒數歸零+2秒緩衝後開始狂點
      var _waitMs=Math.max((secondsLeft+2)*1000,1000);
      window.__wbBossAutoScript.spamCount=0;
      window.__wbBossAutoScript.timer=setTimeout(function(){
        __wbBossAutoScriptTryEnterSpam(target,idx,list,foundBoss);
      }, _waitMs);
      return;
    }

    // 重生時間 > 0 但 > 30s → 設定等待 timer 而非立即狂點
    if(respawnStr&&secondsLeft!==null&&secondsLeft>30){
      var _reasonN='BOSS\u5DF2\u88AB\u64CA\u6557,\u9810\u8A08\u91CD\u751F'+respawnStr+'(\u5269'+secondsLeft+'s>30s)\uFF0C\u7B49\u5F85\u5FA9\u6D3B\u5F8C\u72C2\u9EDE\u9032\u5165';
      console.log('[WB-AutoScript] '+target.name+': '+_reasonN);
      __wbAddBossHistory(target.name,'wait',_reasonN,0,respawnStr);
      // 等到剩 30s 再重新 Loop（Loop 會重新掃描後進入 ≤30s 狂點分支）
      var _waitMsN=Math.max((secondsLeft-29+2)*1000,2000);
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,_waitMsN);
      return;
    }

    // >30s 在 PATCH 4 已處理，這裡只處理無重生資訊 → 跳下一位
    var skipReason='BOSS\u5DF2\u88AB\u64CA\u6557';
    if(respawnStr){skipReason+=', \u91CD\u751F'+respawnStr+', \u5269'+secondsLeft+'s\uFF0C\u8DF3\u4E0B\u4E00\u4F4D';}
    else{skipReason+=', \u7121\u91CD\u751F\u6642\u9593\uFF0C\u8DF3\u4E0B\u4E00\u4F4D';}
    console.log('[WB-AutoScript] '+target.name+' '+skipReason);
    __wbAddBossHistory(target.name,'skip',skipReason,0,respawnStr);
    window.__wbBossAutoScript.currentIdx=0;
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,500);
  } else {
    // Unknown → try enter (寧可嘗試進入也不要卡住)
    // 狀態不明（如「等待中」「冷卻中」「即將重生」等），直接嘗試進入 BOSS
    console.log('[WB-AutoScript] '+target.name+' state unclear ("'+subText+'"), trying to enter anyway...');
    __wbAddBossHistory(target.name, 'enter', '\u72C0\u614B\u4E0D\u660E('+subText+')\uFF0C\u5617\u8A66\u9032\u5165', 0, null);
    window.__wbBossAutoScript.phase='entering';
    window.__wbBossAutoScript.entryRetry=0;
    __wbBossAutoScriptTryEnter(target,idx,list,foundBoss);
  }
}

// 嘗試進入 BOSS 房間（含重試機制，最多 3 次，每次間隔 3 秒）
// 伺服器端 BOSS 重生可能會有數秒延遲，需要輪詢確認
// @param {Object} target   - BOSS 物件
// @param {number} idx     - 清單索引
// @param {Array}  list    - 完整討伐清單
// @param {Element} card   - .wb-card DOM 元素
function __wbBossAutoScriptTryEnter(target,idx,list,card){
  if(!window.__wbBossAutoScript.running)return;
  var retry=window.__wbBossAutoScript.entryRetry||0;
  var maxRetry=3;

  // 每次進入時重新查詢 DOM 卡片（避免 reference 過期）
  if(!card||retry>0){
    document.querySelectorAll('.wb-card[data-boss]').forEach(function(_c){if(_c.getAttribute('data-boss')===target.id)card=_c;});
  }
  if(!card){console.warn('[WB-AutoScript] TryEnter: card ref is null for '+target.name);}

  // 點擊卡片觸發 joinBoss 封包
  if(card&&retry===0){
    // 第一次嘗試：點擊 + 等待 3 秒後驗證
    try{card.click();}catch(e){}
  }

  // 驗證是否成功進入：檢查 lastState.mode === 'bosscombat'
  var ls=window.lastState||{};
  var boss=ls.boss||{};
  var bossHp=boss.hp||0;
  var bossMax=boss.maxHp||1;

  if(ls.mode==='bosscombat'&&bossHp>0){
    // 成功進入：記錄、啟動自動攻擊、開始 HP 監控
    var hpPct=Math.round(bossHp/bossMax*100);
    __wbAddBossHistory(target.name, 'enter', '確認進入('+(retry+1)+'次嘗試), HP: '+bossHp+'/'+bossMax+' ('+hpPct+'%)', bossHp, null);
    var atkChk=document.getElementById('__gmp_boss_auto_atk');
    if(atkChk)atkChk.checked=true;
    var enableChk=document.getElementById('__gmp_boss_auto_enable');
    if(enableChk)enableChk.checked=true;
    window.__wbBossAutoScript.phase='attacking';
    __wbBossAutoScriptMonitorBossHP(target,idx,list);
  } else if(retry<maxRetry){
    // 進入失敗，等待 3 秒後重試
    console.log('[WB-AutoScript] Entry attempt '+(retry+1)+' failed (mode='+ls.mode+'), retrying...');
    window.__wbBossAutoScript.entryRetry=retry+1;
    window.__wbBossAutoScript.phase='entering_retry';
    window.__wbBossAutoScript.timer=setTimeout(function(){
      // 重試前重新查詢 DOM 卡片（DOM 可能已重繪，舊 reference 無效）
      var _rfCard=null;
      document.querySelectorAll('.wb-card[data-boss]').forEach(function(_c){if(_c.getAttribute('data-boss')===target.id)_rfCard=_c;});
      if(_rfCard){try{_rfCard.click();console.log('[WB-AutoScript] Retry click '+target.name+' (attempt '+(retry+2)+')');}catch(e){}}
      else{console.warn('[WB-AutoScript] Retry: card not in DOM for '+target.name);}
      __wbBossAutoScriptTryEnter(target,idx,list,_rfCard||card);
    },3000);
  } else {
    // 重試 3 次後仍失敗 → 記錄 bossName/subText/mode 並跳過
    var _failSubEl=document.querySelector('.wb-sub[data-boss="'+target.id+'"]');
    var _failSubText=_failSubEl?_failSubEl.textContent.trim():'N/A';
    var _failReason='無法進入('+maxRetry+'次重試) mode='+ls.mode+' sub='+_failSubText;
    console.log('[WB-AutoScript] '+target.name+' entry FAILED: '+_failReason);
    __wbAddBossHistory(target.name, 'fail_entry', _failReason, 0, null);
    window.__wbBossAutoScript.entryRetry=0;
    window.__wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,1000);
  }
}
// ====== 狂點進場模式（無重試上限，持續嘗試直到進去或停止） ======
// 用在 BOSS 重生倒數 ≤30s 時，卡在門口一直點，不設 3 次上限
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
// @param {Element} card  - .wb-card DOM 元素
function __wbBossAutoScriptTryEnterSpam(target,idx,list,card){
  if(!window.__wbBossAutoScript.running)return;

  // 檢查是否已闖入（可能在上一輪狂點中進去了）
  var ls=window.lastState||{};
  if(ls.mode==='bosscombat'){
    var boss=ls.boss||{};
    var bossHp=boss.hp||0;
    if(bossHp>0){
      var hpPct=Math.round(bossHp/(boss.maxHp||1)*100);
      console.log('[WB-AutoScript] Spam enter: already in bosscombat! HP='+hpPct+'%');
      __wbAddBossHistory(target.name,'enter','Spam\u9032\u5165\u6210\u529F',bossHp,null);
      var atkChk=document.getElementById('__gmp_boss_auto_atk');
      if(atkChk)atkChk.checked=true;
      var enableChk=document.getElementById('__gmp_boss_auto_enable');
      if(enableChk)enableChk.checked=true;
      window.__wbBossAutoScript.phase='attacking';
      __wbDebugLog('spam','Already in bosscombat! HP='+hpPct+'%');
    __wbDebugStop('already in boss');
    __wbBossAutoScriptMonitorBossHP(target,idx,list);
      return;
    }
  }

  // 重新查詢 DOM 卡片
  if(!card){
    document.querySelectorAll('.wb-card[data-boss]').forEach(function(_c){if(_c.getAttribute('data-boss')===target.id)card=_c;});
  }

  // 狂點卡片
  if(card){
    try{card.click();}catch(e){}
    var spamCount=(window.__wbBossAutoScript.spamCount||0)+1;
    window.__wbBossAutoScript.spamCount=spamCount;
    __wbDebugLog('spam','click #'+spamCount+' on '+target.name);
    var statusEl=document.getElementById('__gmp_boss_script_status');
    if(statusEl)statusEl.textContent='[SPAM]'+target.name+' #'+spamCount;
    if(spamCount%10===0){console.log('[WB-AutoScript] Spam click '+target.name+' #'+spamCount);}
  } else {
    console.warn('[WB-AutoScript] Spam: card not in DOM for '+target.name+', retrying in 2s');
  }

  // 每 2 秒重試（無上限）
  window.__wbBossAutoScript.phase='entering_spam';
  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbBossAutoScriptTryEnterSpam(target,idx,list,card);
  },2000);
}


// 監控 BOSS HP（每 2 秒輪詢一次）
// 當 HP 歸零且不在戰鬥模式時觸發掉落擷取流程；若仍在戰鬥中則確保自動攻擊保持開啟
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
function __wbBossAutoScriptMonitorBossHP(target,idx,list){
  if(!window.__wbBossAutoScript.running)return;
  __wbBossAutoScriptMonitorBossHP_doCheck(target,idx,list);
}
function __wbBossAutoScriptMonitorBossHP_doCheck(target,idx,list){
  if(!window.__wbBossAutoScript.running)return;

  var ls=window.lastState||{};
  var boss=ls.boss||{};
  var mode=ls.mode||'';
  var bossHp=boss.hp||0;
  var bossMax=boss.maxHp||1;

  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='[ATTACK] '+target.name+' HP:'+Math.round(bossHp/bossMax*100)+'%';

  // If boss HP is 0 and not in battle mode, it's dead
  // HP=0 且離開戰鬥模式 → BOSS 已擊敗，進入等待掉落階段
  if(bossHp<=0&&mode!=='bosscombat'){
    window.__wbBossAutoScript.phase='waiting_loot';
    __wbBossAutoScriptWaitForLoot(target,idx,list);
    return;
  }

  // If in bosscombat, ensure auto attack is on
  // 仍在戰鬥中 → 確保自動攻擊輔助選項全部開啟
  if(mode==='bosscombat'&&bossHp>0){
    var atkChk=document.getElementById('__gmp_boss_auto_atk');
    if(atkChk&&!atkChk.checked)atkChk.checked=true;
    var enableChk=document.getElementById('__gmp_boss_auto_enable');
    if(enableChk&&!enableChk.checked)enableChk.checked=true;
    if(window.__wbSyncAutoConfig)__wbSyncAutoConfig();
    // 若自動攻擊未啟動則嘗試啟動
    if(window.__wbBossAuto&&!window.__wbBossAuto.running&&window.__wbBossAutoStart){
      __wbBossAutoStart();
    }

    // === BOSS HP<20%：偵測已被擊敗提示，提前離開 ===
    // 當 BOSS 血量低於 20% 時，檢查 DOM 中是否出現「世界王已被擊敗」
    // 若出現表示戰鬥已結束但 lastState 未更新，發 selectChar[0] 離開
    var hpPctCheck=bossMax>0?Math.round(bossHp/bossMax*100):100;
    if(hpPctCheck<20){
      var defeatedEl=document.querySelector('div[style*="color:#f87171"]');
      if(defeatedEl&&defeatedEl.textContent.indexOf('\u4E16\u754C\u738B\u5DF2\u88AB\u64CA\u6557')!==-1){
        console.log('[WB-AutoScript] Boss defeated at HP'+hpPctCheck+'%, leaving early');
        __wbAddBossHistory(target.name,'defeat','HP<20% \u4E16\u754C\u738B\u5DF2\u88AB\u64CA\u6557 \u63D0\u524D\u96E2\u958B',bossHp,null);
        if(statusEl)statusEl.textContent='[LEAVE]'+target.name+'\u5DF2\u64CA\u6557(HP'+hpPctCheck+'%)';
        // 先 toLobby 回大廳，再 selectChar [0] 回村
        try{
          if(window.__wbSocket&&window.__wbSocket.emit){
            var _lobbyBtn=document.getElementById('br-lobby');
            if(_lobbyBtn){_lobbyBtn.click();console.log('[WB-HP20] Clicked #br-lobby');}
            window.__wbSocket.emit('toLobby',[]);
            console.log('[WB-SEND] toLobby []');
            setTimeout(function(){
              if(window.__wbSocket&&window.__wbSocket.emit){
                window.__wbSocket.emit('selectChar',0);
                console.log('[WB-SEND] selectChar [0]');
              }
            },600);
          }
        }catch(e){console.warn('[WB-AutoScript] toLobby/selectChar failed:',e.message);}
        // BOSS 已擊敗 → 回 Loop 從第一位重新掃描
        window.__wbBossAutoScript.currentIdx=0;
        window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,1500);
        return;
      }
    }
  }

  // 每 500ms 遞迴輪詢（快速檢查自動攻擊 + HP<20% 提早離開）
  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbBossAutoScriptMonitorBossHP_doCheck(target,idx,list);
  },500);
}

// 復原農怪狀態（BOSS 腳本結束或清單為空時呼叫）
function __wbBossAutoScriptRestoreFarm(){
  if(window.__wbBossAutoScript.farmWasRunning){
    window.__wbBossAutoScript.farmWasRunning=false;
    console.log('[WB-AutoScript] Restoring farm');
    var farmBtn=document.getElementById('__gmp_farm_btn');
    // ▶ 符號表示農怪按鈕處於「可啟動」狀態
    if(farmBtn&&farmBtn.textContent.indexOf('\u25B6')>-1){
      if(window.startFarming)startFarming();
    }
  }
}

// BOSS 腳本完成（最後一隻處理完畢的收尾）
// @param {Array} list - 討伐清單
// 所有 BOSS 處理完畢後的收尾
// 智能模式：計算列表中最早復活時間，設定醒來計時器
// 即時模式：直接恢復掛機
function __wbBossAutoScriptDone(list){
  console.log('[WB-AutoScript] All bosses processed, looping back to first');
  window.__wbBossAutoScript.currentIdx=0;
  window.__wbBossAutoScript.spamCount=0;

  // 計算列表中最早復活時間，設定醒來計時器（避免空轉）
  var now=new Date();
  var nearestSec=null;
  if(list&&list.length){
    list.forEach(function(item){
      var subEl=document.querySelector('.wb-sub[data-boss="'+item.id+'"]');
      if(!subEl)return;
      var txt=subEl.textContent.trim();
      var m=txt.match(/(d{1,2}):(d{2})/);
      if(!m)return;
      var h=parseInt(m[1],10),min=parseInt(m[2],10);
      var t=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,min,0);
      if(t<=now)t.setDate(t.getDate()+1);
      var sec=Math.round((t-now)/1000);
      if(sec>0&&(nearestSec===null||sec<nearestSec))nearestSec=sec;
    });
  }

  // 恢復掛機
  __wbBossAutoScriptRestoreFarm();

  if(nearestSec!==null&&nearestSec<=3600){
    // 有合理復活時間 → 設定醒來計時器
    console.log('[WB-AutoScript] Next respawn in '+nearestSec+'s, waking up then');
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,nearestSec*1000+5000);
  } else {
    // 無復活資訊或太久 → 每 30 秒輪詢一次
    console.log('[WB-AutoScript] No near respawn, polling every 30s');
    window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,30000);
  }
}


// ====== 智能模式重生計時器 ======
// 啟動重生倒數計時器（智能模式專用：只對 idx=0 的優先目標有效）
function __wbStartRespawnTimer(target,seconds,list){
  if(!window.__wbBossAutoScript.running)return;
  clearTimeout(window.__wbBossAutoScript.respawnTimer);
  window.__wbBossAutoScript.respawnTimer=null;
  window.__wbBossAutoScript.respawnBoss=target;
  window.__wbBossAutoScript.respawnAttempts=0;
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='計時: '+target.name+' '+seconds+'s';
  console.log('[WB-RespawnTimer] '+target.name+' respawn in '+seconds+'s');
  __wbRespawnTimerTick(target,seconds,list);
}
// 計時器遞迴：每秒更新，倒數至0時嘗試進入
function __wbRespawnTimerTick(target,secondsLeft,list){
  if(!window.__wbBossAutoScript.running||window.__wbBossAutoScript.mode!=='scheduled'){
    clearTimeout(window.__wbBossAutoScript.respawnTimer);
    window.__wbBossAutoScript.respawnTimer=null;
    return;
  }
  if(secondsLeft<=0){
    console.log('[WB-RespawnTimer] Timer expired, attempting entry...');
    __wbRespawnAttempt(target,list);
    return;
  }
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='計時: '+target.name+' '+secondsLeft+'s';
  window.__wbBossAutoScript.respawnTimer=setTimeout(function(){
    __wbRespawnTimerTick(target,secondsLeft-1,list);
  },1000);
}
// 嘗試進入重生後的BOSS（最多3次）
function __wbRespawnAttempt(target,list){
  if(!window.__wbBossAutoScript.running)return;
  var attempt=(window.__wbBossAutoScript.respawnAttempts||0)+1;
  window.__wbBossAutoScript.respawnAttempts=attempt;
  console.log('[WB-RespawnTimer] Attempt #'+attempt+' for '+target.name);
  var statusEl=document.getElementById('__gmp_boss_script_status');
  if(statusEl)statusEl.textContent='計時: '+target.name+' 嘗試#'+attempt+'...';
  try{__wbEnsureWBTab();}catch(e){}
  window.__wbBossAutoScript.timer=setTimeout(function(){
    __wbRespawnAttemptCheck(target,list,attempt);
  },2000);
}
// 確認DOM中BOSS狀態後點擊進入
function __wbRespawnAttemptCheck(target,list,attempt){
  if(!window.__wbBossAutoScript.running)return;
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var found=null;
  cards.forEach(function(card){if(card.getAttribute('data-boss')===target.id)found=card;});
  if(!found){
    window.__wbBossAutoScript.timer=setTimeout(function(){__wbRespawnAttemptCheck(target,list,attempt);},3000);
    return;
  }
  var subEl=document.querySelector('.wb-sub[data-boss="'+target.id+'"]');
  var subText=subEl?subEl.textContent.trim():'';
  var isAlive=subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1||subText.indexOf('\u5728\u5834')!==-1;
  if(!isAlive){
    console.log('[WB-RespawnTimer] Not alive yet, retry 2s');
    window.__wbBossAutoScript.timer=setTimeout(function(){__wbRespawnAttemptCheck(target,list,attempt);},2000);
    return;
  }
  console.log('[WB-RespawnTimer] BOSS is alive, clicking!');
  __wbAddBossHistory(target.name,'enter','重生進入(嘗試#'+attempt+')',0,null);
  try{found.click();}catch(e){}
  window.__wbBossAutoScript.timer=setTimeout(function(){
    var ls=window.lastState||{};
    if(ls.mode==='bosscombat'&&(ls.boss||{}).hp>0){
      console.log('[WB-RespawnTimer] Entered successfully!');
      window.__wbBossAutoScript.respawnAttempts=0;
      window.__wbBossAutoScript.respawnTimer=null;
      window.__wbBossAutoScript.respawnBoss=null;
      window.__wbBossAutoScript.phase='attacking';
      __wbBossAutoScriptMonitorBossHP(target,0,list);
    } else if(attempt<3){
      __wbRespawnAttempt(target,list);
    } else {
      console.log('[WB-RespawnTimer] 3 attempts failed, moving to next boss');
      __wbAddBossHistory(target.name,'fail_entry','重生3次失敗',0,null);
      window.__wbBossAutoScript.respawnAttempts=0;
      clearTimeout(window.__wbBossAutoScript.respawnTimer);
      window.__wbBossAutoScript.respawnTimer=null;
      window.__wbBossAutoScript.respawnBoss=null;
      window.__wbBossAutoScript.currentIdx++;
      window.__wbBossAutoScript.timer=setTimeout(__wbBossAutoScriptLoop,3000);
    }
  },2500);
}


// ====== BOSS 掉落記錄 ======
// Saved to chrome.storage.local key: wb_boss_loot
// Structure: [{ id, t, bossName, drops: [{item, winner}], rank: [{player, damage}], mvp, participants, rawHTML }]

window.__wbBossLoot = [];

// 擷取 BOSS 掉落畫面資料
// 從遊戲結算畫面 (.ip-box) 解析掉落物品、傷害排名、MVP、參與者清單
// @param {string} bossName - 備用 BOSS 名稱（若 DOM 中找不到名稱時使用）
// @returns {Object|null} 掉落記錄物件，失敗則回傳 null
function __wbCaptureBossLoot(bossName){
  try {
    var ipBox = document.querySelector('.ip-box');
    if(!ipBox){
      console.log('[WB-Loot] No .ip-box found on page');
      return null;
    }

    // Parse boss name from #br-boss
    // 從結算面板讀取 BOSS 顯示名稱
    var bossEl = document.getElementById('br-boss');
    var bossDisplay = bossEl ? bossEl.textContent.trim() : bossName;

    // Parse drops
    // 解析掉落物品：每列包含圖示、物品名、獲得者
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
    // 解析傷害排名（含排名、玩家名、傷害值）以及 MVP
    var rankEl = document.getElementById('br-rank');
    var rank = [];
    var mvp = '';
    if(rankEl){
      var mvpEl = rankEl.querySelector('[style*="color:#7be87b"]');
      if(mvpEl) mvp = mvpEl.textContent.replace('\u5976\u5ABDMVP\uFF1A', '').trim();

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
    // 收集所有參與者（去重，包含掉落獲得者、排名玩家、MVP）
    var participants = [];
    drops.forEach(function(d){ if(d.winner && participants.indexOf(d.winner) === -1) participants.push(d.winner); });
    rank.forEach(function(r){ if(r.player && participants.indexOf(r.player) === -1) participants.push(r.player); });
    if(mvp && participants.indexOf(mvp) === -1) participants.push(mvp);

    // 建構掉落記錄物件，id 以時間戳 + 隨機字串組成，確保唯一性
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

// 儲存掉落記錄到 chrome.storage.local（最多保留 200 筆）
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

// 從 chrome.storage.local 載入掉落記錄
// @param {Function} callback - 回呼函式，接收掉落記錄陣列
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

// 取得目前的掉落記錄（同步，直接回傳記憶體中的陣列）
function __wbGetBossLoot(){
  return window.__wbBossLoot || [];
}

// 清除所有掉落記錄
function __wbClearBossLoot(){
  window.__wbBossLoot = [];
  __wbSaveBossLoot();
}

// ====== BOSS 歷史記錄 ======
// Log entry structure:
// { id: unique, t: Date.now(), bossName: string, event: 'enter'|'leave'|'defeat'|'death'|'reenter'|'fail_entry'|'skip',
//   details: string, bossHp: number, nextRespawn: string|null }

window.__wbBossHistory = [];

// 新增一筆 BOSS 歷史記錄
// @param {string} bossName    - BOSS 名稱
// @param {string} event       - 事件類型（enter/leave/defeat/death/reenter/fail_entry/skip）
// @param {string} details     - 事件詳細描述
// @param {number} bossHp      - 當時 BOSS HP
// @param {string|null} nextRespawn - 下次重生時間（格式 "HH:MM" 或 null）
// @returns {Object} 新增的記錄物件
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

// 儲存 BOSS 歷史記錄（最多保留 500 筆，超過則截斷舊資料）
function __wbSaveBossHistory(){
  // Keep last 500 entries
  if(window.__wbBossHistory.length > 500) window.__wbBossHistory = window.__wbBossHistory.slice(-500);
  if(typeof window.__gmStorageSet === 'undefined') return;
  window.__gmStorageSet('wb_boss_history', window.__wbBossHistory).catch(function(){});
}

// 從 storage 載入 BOSS 歷史記錄
// @param {Function} callback - 回呼函式，接收歷史記錄陣列
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

// 清除 BOSS 歷史記錄
function __wbClearBossHistory(){
  window.__wbBossHistory = [];
  if(typeof window.__gmStorageSet !== 'undefined'){
    window.__gmStorageSet('wb_boss_history', []);
  }
}

// ====== 死亡偵測 + 自動重進 ======
// Checkbox id: __gmp_boss_auto_reenter

// 檢查「自動重進」選項是否被勾選
function __wbCanReEnterBoss(){
  var chk = document.getElementById('__gmp_boss_auto_reenter');
  return chk && chk.checked;
}

// Try to re-enter the same boss after death
// BOSS 死亡後嘗試重進同一隻 BOSS（先回大廳再重新進入）
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
function __wbBossAutoScriptReEnter(target, idx, list){
  if(!window.__wbBossAutoScript.running) return;

  var phaseEl = document.getElementById('__gmp_boss_script_status');
  if(phaseEl) phaseEl.textContent = '[\u91CD\u9032] ' + target.name + ' \u56DE\u5927\u5EF3\u91CD\u9032\u4E2D...';

  // Step 1: Go to lobby / zone tab
  // 先切回世界王頁籤
  try { __wbEnsureWBTab(); } catch(e){}

  // Step 2: Wait for boss tab to load
  // 等待 2 秒讓頁籤載入完畢，再檢查是否能重新進入
  window.__wbBossAutoScript.phase = 'reenter_wait';
  window.__wbBossAutoScript.timer = setTimeout(function(){
    __wbBossAutoScriptCheckReEnter(target, idx, list);
  }, 2000);
}

// 檢查重進條件：BOSS 存活則進入；已死亡則跳過；狀態不明則等待重試
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
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
    // BOSS 已不在列表中（可能時間已過或已消失）
    var reason = 'BOSS \u4E0D\u5728\u5217\u8868\u4E2D (\u53EF\u80FD\u5DF2\u6D88\u5931/\u6642\u9593\u672A\u5230)';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, null);
    __wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);
    return;
  }

  var bossId = foundBoss.getAttribute('data-boss');
  var subEl = document.querySelector('.wb-sub[data-boss="' + bossId + '"]');
  var subText = subEl ? subEl.textContent.trim() : '';

  var isAlive = subText.indexOf('\u5B58\u6D3B') !== -1 || subText.indexOf('\u6230\u9B25\u4E2D') !== -1 || subText.indexOf('HP') !== -1;
  var isDead = subText.indexOf('\u5DF2\u88AB\u64CA\u6557') !== -1 || subText.indexOf('\u5DF2\u88AB\u5FB4\u670D') !== -1;

  if(isAlive){
    // Boss is alive - enter!
    // BOSS 存活 → 點擊進入，然後驗證是否成功進入戰鬥
    var details = 'BOSS\u5B58\u6D3B, \u9032\u5165\u6230\u9B25';
    __wbAddBossHistory(target.name, 'reenter', details, 0, null);

    try { foundBoss.click(); } catch(e){}
    window.__wbBossAutoScript.phase = 'entering';

    window.__wbBossAutoScript.timer = setTimeout(function(){
      // Verify entry by checking boss HP
      __wbBossAutoScriptVerifyEntry(target, idx, list, 3); // 3 attempts（最多重試 3 次）
    }, 1500);

  } else if(isDead){
    // Boss still dead - extract respawn info
    // BOSS 仍為死亡狀態 → 擷取重生時間資訊後跳過
    var respawnStr = null;
    var respawnMatch = subText.match(/(\d{1,2}):(\d{2})/);
    if(respawnMatch){
      var h = parseInt(respawnMatch[1],10), min = parseInt(respawnMatch[2],10);
      respawnStr = h + ':' + (min < 10 ? '0' : '') + min;
    }
    var reason = 'BOSS \u5DF2\u88AB\u64CA\u6557';
    if(respawnStr) reason += ', \u4E0B\u6B21\u91CD\u751F\u7D04 ' + respawnStr;
    else reason += ', \u672A\u5075\u6E2C\u5230\u91CD\u751F\u6642\u9593';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, respawnStr);

    // Move to next boss
    window.__wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);

  } else {
    // Unknown → try enter (寧可嘗試進入也不要卡住)
    // 狀態不明（如「等待中」「冷卻中」「即將重生」等），直接嘗試進入 BOSS
    console.log('[WB-AutoScript] ReEnter: '+target.name+' state unclear ("'+subText+'"), trying to enter anyway...');
    __wbAddBossHistory(target.name, 'reenter', '\u72C0\u614B\u4E0D\u660E('+subText+')\uFF0C\u5617\u8A66\u91CD\u9032', 0, null);
    window.__wbBossAutoScript.phase = 'entering';
    window.__wbBossAutoScript.entryRetry = 0;
    // Re-enter: 點擊卡片後驗證是否成功進入戰鬥
    try { foundBoss.click(); } catch(e){}
    window.__wbBossAutoScript.timer = setTimeout(function(){
      __wbBossAutoScriptVerifyEntry(target, idx, list, 3);
    }, 1500);
  }
}

// Verify boss entry by checking lastState boss HP
// 驗證是否成功進入 BOSS 戰鬥（檢查 lastState 中的 HP 和 mode）
// @param {Object} target      - BOSS 物件
// @param {number} idx         - 清單索引
// @param {Array}  list        - 完整討伐清單
// @param {number} retriesLeft - 剩餘重試次數（最多 3 次）
function __wbBossAutoScriptVerifyEntry(target, idx, list, retriesLeft){
  if(!window.__wbBossAutoScript.running) return;

  var ls = window.lastState || {};
  var boss = ls.boss || {};
  var mode = ls.mode || '';
  var bossHp = boss.hp || 0;
  var bossMax = boss.maxHp || 1;

  // Check if we're actually in boss combat with HP > 0
  // 確認是否真的在 BOSS 戰鬥中（mode='bosscombat' 且 HP>0）
  var entered = (mode === 'bosscombat' && bossHp > 0);

  if(entered){
    // Successfully entered!
    // 成功進入 → 記錄進入資訊並開始 HP 監控
    var hpPct = Math.round(bossHp / bossMax * 100);
    __wbAddBossHistory(target.name, 'enter', '\u6210\u529F\u9032\u5165, HP: ' + bossHp + '/' + bossMax + ' (' + hpPct + '%)', bossHp, null);

    // Start auto-attack（啟動自動攻擊）
    var atkChk = document.getElementById('__gmp_boss_auto_atk');
    if(atkChk) atkChk.checked = true;
    var enableChk = document.getElementById('__gmp_boss_auto_enable');
    if(enableChk) enableChk.checked = true;
    __wbBossAutoScript.phase = 'attacking';
    __wbBossAutoScriptMonitorBossHP(target, idx, list);

  } else if(retriesLeft > 0){
    // Not yet entered, wait and retry
    // 尚未進入戰鬥 → 等待 2 秒後重試
    window.__wbBossAutoScript.timer = setTimeout(function(){
      __wbBossAutoScriptVerifyEntry(target, idx, list, retriesLeft - 1);
    }, 2000);

  } else {
    // Failed to enter after retries
    // 重試次數用盡仍無法確認進入 → 記錄失敗並跳到下一隻
    var reason = '\u9032\u5165\u5931\u6557(\u7121\u6CD5\u78BA\u8A8D\u6230\u9B25\u958B\u59CB), \u8DF3\u5230\u4E0B\u4E00\u96FB';
    __wbAddBossHistory(target.name, 'fail_entry', reason, 0, null);
    __wbBossAutoScript.currentIdx++;
    window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 500);
  }
}

// Modified defeat handler in MonitorBossHP - add re-enter logic


// ====== BOSS 擊敗後等待掉落 & 處理 ======

// 等待掉落彈窗出現（.ip-box），最長等待 20 秒
// 若掉落擷取未啟用則直接進入擊敗處理
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
function __wbBossAutoScriptWaitForLoot(target, idx, list){
  // Check if loot capture is enabled
  // 檢查掉落擷取 checkbox 是否啟用
  var lootChk = document.getElementById('__gmp_boss_auto_loot');
  if(!lootChk || !lootChk.checked){
    console.log('[WB-Loot] Loot capture disabled by checkbox, skipping');
    __wbBossAutoScriptHandleDefeat(target, idx, list);
    return;
  }


console.log('[WB-Loot] Waiting for loot popup (.ip-box) after ' + target.name + ' defeated...');
  var maxWait = 20000; // 20 seconds max（最長等待 20 秒）
  var interval = 200;   // 每 200ms 檢查一次（加速）
  var elapsed = 0;
  var captured = false;

  // 使用 setInterval 輪詢 .ip-box DOM 元素
  var poller = setInterval(function(){
    if(!window.__wbBossAutoScript.running){ clearInterval(poller); return; }
    elapsed += interval;

    var ipBox = document.querySelector('.ip-box');
    if(ipBox && ipBox.innerHTML.length > 100){
      // Loot popup found and has content
      // 掉落彈窗出現且有內容 → 擷取並處理擊敗
      clearInterval(poller);
      captured = true;
      console.log('[WB-Loot] Loot popup found after ' + elapsed + 'ms, capturing...');
      __wbCaptureBossLoot(target.name);
      __wbBossAutoScriptHandleDefeat(target, idx, list);
      return;
    }

    if(elapsed >= maxWait){
      // 超時仍未出現掉落彈窗 → 直接進入擊敗處理（不擷取掉落）
      clearInterval(poller);
      console.log('[WB-Loot] Loot popup not found after ' + maxWait + 'ms, proceeding without loot capture');
      __wbBossAutoScriptHandleDefeat(target, idx, list);
    }
  }, interval);
}

// 處理 BOSS 擊敗後續：記錄擊敗、關閉自動攻擊、根據重進設定決定下一步
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
// 處理 BOSS 擊敗後續：記錄擊敗 → selectChar[0] 回村 → currentIdx++ 跳下一位
// 智能模式：打完第一隻自動輪第二隻，以此類推，最後一隻打完回到掛機
// @param {Object} target - BOSS 物件
// @param {number} idx   - 清單索引
// @param {Array}  list  - 完整討伐清單
function __wbBossAutoScriptHandleDefeat(target, idx, list){
  __wbDebugLog('defeat','BOSS defeated: '+target.name);
  __wbDebugStop('defeated');
  console.log('[WB-AutoScript] ' + target.name + ' defeated!');

  // Log defeat（記錄擊敗事件到歷史）
  var ls = window.lastState || {};
  var boss = ls.boss || {};
  __wbAddBossHistory(target.name, 'defeat', '\u64CA\u6557 BOSS', 0, null);

  // 記錄離開（前進到下一個 BOSS）
  __wbAddBossHistory(target.name, 'leave', '\u64CA\u6557\u5F8C\u56DE\u6751\uFF0C\u524D\u9032\u4E0B\u4E00\u4F4D', 0, null);

  // 立即點擊「返回大廳」按鈕（速度 > selectChar socket）
  var lobbyBtn=document.getElementById('br-lobby');
  if(lobbyBtn){
    console.log('[WB-AutoScript] Clicking #br-lobby to leave immediately');
    __wbDebugLog('defeat','Clicking #br-lobby');
    lobbyBtn.click();
  }

  // 備援：500ms 後發 selectChar [0] 確保回村
  setTimeout(function(){
    console.log('[WB-AutoScript] Backup: Sending selectChar [0]');
    try {
      if(window.__wbSocket && window.__wbSocket.emit){
        window.__wbSocket.emit('selectChar', 0);
      } else if(window.__ws && window.__ws.readyState===WebSocket.OPEN){
        window.__ws.send('42["selectChar",0]');
      }
    } catch(e){ console.warn('[WB-AutoScript] selectChar failed:', e.message); }
  },500);

  // BOSS 已擊敗 → 回 Loop 從第一位重新掃描（1.5s 後，加快下一隻速度）
  window.__wbBossAutoScript.currentIdx=0;
  if(window.__wbBossAutoScript.timer) clearTimeout(window.__wbBossAutoScript.timer);
  window.__wbBossAutoScript.timer = setTimeout(__wbBossAutoScriptLoop, 1500);
}


// ====== Socket Hook（攔截遊戲 WebSocket 事件） ======
window.__wbBossEmitLog=[];
window.__wbSocket=null;
window.lastState=null;  // 初始化全域 lastState
(function(){
  // 安裝 Socket.IO 攔截 Hook
  // 攔截 packet（發送）和 onevent（接收），從中提取世界王相關事件
  function installSioHook(){
    if(window.__wbSioHooked)return;
    // 取得 Socket.IO 原型，若尚未載入則 300ms 後重試
    var SP=window.io&&window.io.Socket&&window.io.Socket.prototype;
    if(!SP){setTimeout(installSioHook,300);return;}
    window.__wbSioHooked=true;
    if(!SP.__wbPkt){
      // 攔截 packet（發送端）：記錄 type=2(EVENT) 或 type=3(ACK) 的封包
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
      // 攔截 onevent（接收端）：解析 state 更新 lastState，偵測世界王事件
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
          // 三種偵測條件任一滿足即視為世界王事件
          var _payloadStr=p.data.length>1?JSON.stringify(p.data[1]):'';
          var _isWbEvtName=/\b(respawn|worldBoss|bossList|world_boss|getBoss|RefreshBoss|bossInfo)\b/i.test(evtName);
          var _isStateBoss=_payloadStr.indexOf('"mode":"boss"')>-1||_payloadStr.indexOf('"mode": "boss"')>-1;
          var _hasBossObj=/"boss"\s*:\s*\{/.test(_payloadStr);
          if(_isWbEvtName||_isStateBoss||_hasBossObj){
            // 更新世界王快取（時間戳 + 原始資料）
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
            // 通知所有訂閱者（用於其他模組即時回應世界王事件）
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

// ====== WebSocket 發送函式 ======

// 發送 bossAction 指令到遊戲伺服器
// @param {string} action - 動作名稱（如 'stop', 'atk', 'pot', 'heal', 'barrier'）
function __wbSend(action){if(!window.__wbSocket||!window.__wbSocket.emit){setTimeout(function(){if(window.__wbSocket)window.__wbSocket.emit('bossAction',action);},200);return;}try{window.__wbSocket.emit('bossAction',action);console.log('[WB] bossAction:',action);}catch(e){}}

// 發送使用藥水指令
// @param {string} type - 藥水類型（預設 'potion_heal'）
function __wbSendPotion(type){if(!window.__wbSocket)return;try{window.__wbSocket.emit('usePotion',{type:type||'potion_heal'});}catch(e){}}

// 施放技能
// @param {string} id     - 技能 id
// @param {string} target - 目標（可選）
function __wbCastSkill(id,target){if(!window.__wbSocket)return;try{var p={id:id};if(target)p.target=target;window.__wbSocket.emit('castSkill',p);}catch(e){}}

// 設定 BOSS 套裝
// @param {*} s - 套裝設定資料
function __wbSetBossSet(s){if(!window.__wbSocket)return;try{window.__wbSocket.emit('setBossSet',s);}catch(e){}}

// 通用 WebSocket 發送函式
// @param {string} evt  - 事件名稱
// @param {*}      data - 事件資料
function __wbEmit(evt,data){if(!window.__wbSocket||!window.__wbSocket.emit)return;try{window.__wbSocket.emit(evt,data);console.log('[WB-Emit]',evt,JSON.stringify(data).slice(0,200));}catch(e){console.warn('[WB-Emit] failed',e);}}


// ====== 世界王 UI 更新 & 事件訂閱 ======

// 訂閱特定世界王事件（用於 UI 即時更新）
// 其他模組可註冊回呼函式，當世界王事件觸發時自動呼叫
// @param {Function} fn - 回呼函式 (evtName, eventData)
function __wbSubscribeWorldBoss(fn){if(window.__wbBossEvtSubscribers.indexOf(fn)<0)window.__wbBossEvtSubscribers.push(fn);}


// 手動查詢世界王（嘗試常見事件名）
// 直接觸發一次 UI 更新
function __wbQueryWorldBoss(){
  __wbUpdateWorldBossUI();
  return true;
}


// 自動查詢：每 60 秒執行一次
// 啟動定時器，每分鐘從遊戲 DOM 重新讀取世界王列表並更新 UI
function __wbStartWorldBossTimer(){
  if(window.__wbWorldBossTimer)clearInterval(window.__wbWorldBossTimer);
  __wbUpdateWorldBossUI();
  window.__wbWorldBossTimer=setInterval(function(){
    __wbUpdateWorldBossUI();
  },60000);
  console.log('[WB-WorldBoss] DOM timer started, interval=60s');
}

// 停止世界王定時查詢
function __wbStopWorldBossTimer(){
  if(window.__wbWorldBossTimer){clearInterval(window.__wbWorldBossTimer);window.__wbWorldBossTimer=null;}
}


// 解析世界王資料（通用格式，嘗試多種結構）
// 將各種可能格式的世界王資料標準化為統一的欄位結構
// @param {*} raw - 原始資料（可能是陣列、物件、list/ bosses/ data 包裝）
// @returns {Array} 標準化的 BOSS 資料陣列
function __wbParseWorldBossData(raw){
  if(!raw)return[];
  var arr=[];
  // 嘗試常見包裝格式（依序嘗試各種可能的巢狀結構）
  if(Array.isArray(raw))arr=raw;
  else if(raw&&raw.list)arr=raw.list;
  else if(raw&&raw.bosses)arr=raw.bosses;
  else if(raw&&raw.data)arr=Array.isArray(raw.data)?raw.data:[raw.data];
  else if(typeof raw==='object')arr=[raw];
  // 過濾：每項須有 name（任何變體）
  arr=arr.filter(function(it){return it&&(it.name||it.n||it.bossName);});
  // 標準化欄位（將不同命名慣例對齊到統一的 key）
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


// ====== 世界王清單 UI 渲染 ======

// 更新世界王 UI（顯示在 BOSS Tab 頂端）
// 從遊戲 DOM 讀取 .wb-card 卡片，解析每隻 BOSS 的名稱/等級/狀態/重生時間
function __wbUpdateWorldBossUI(){
  var el=document.getElementById('__gmp_wb_list');
  var timerEl=document.getElementById('__gmp_wb_timer');
  var countEl=document.getElementById('__gmp_wb_count');
  if(!el)return;

  if(timerEl){
    timerEl.textContent='\u6BCF 60s';
    timerEl.style.color='#888';
  }

  // === 讀取遊戲 DOM ===
  // 遍歷所有 .wb-card[data-boss] 卡片，解析 BOSS 資訊
  var cards=document.querySelectorAll('.wb-card[data-boss]');
  var bossList=[];
  cards.forEach(function(card){
    var bossId=card.getAttribute('data-boss');
    var subEl=document.querySelector('.wb-sub[data-boss="'+bossId+'"]');
    var nameSpan=card.querySelector('.wb-r1>span:first-child');
    var name='?';
    if(nameSpan){
      // 優先取文字節點內容（去除 Lv. 後綴）
      if(nameSpan.firstChild && nameSpan.firstChild.nodeType===3){
        name=nameSpan.firstChild.textContent.trim().replace(/\s*Lv\..*$/,'');
      }else{
        name=nameSpan.textContent.trim().replace(/\s*Lv\..*$/,'');
      }
    }
    // 解析等級（從 .dim 元素中提取數字）
    var lvSpan=nameSpan?nameSpan.querySelector('.dim'):null;
    var lv=lvSpan?parseInt((lvSpan.textContent.match(/\d+/)||[0])[0],10)||0:0;
    var subText=subEl?subEl.textContent.trim():'';

    // 解析 BOSS 狀態與重生時間
    var status='unknown',respawn=null,respawnMin=null;
    if(subText.indexOf('\u5DF2\u88AB\u64CA\u6557')!==-1||subText.indexOf('\u5DF2\u88AB\u5FB4\u670D')!==-1){
      status='dead';
      var m=subText.match(/(\d{1,2}):(\d{2})/);
      if(m){
        var h=parseInt(m[1],10),min=parseInt(m[2],10);
        var now=new Date();
        var target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,min,0);
        // 若重生時間已過，視為明天同一時間
        if(target<=now)target.setDate(target.getDate()+1);
        respawn=Math.round((target-now)/1000);
        respawnMin=Math.ceil(respawn/60);
      }
    } else if(subText.indexOf('\u5B58\u6D3B')!==-1||subText.indexOf('\u6230\u9B25\u4E2D')!==-1||subText.indexOf('HP')!==-1){
      status='alive';
    } else if(subText.indexOf('\u7B49\u5F85')!==-1){
      status='waiting';
    }

    bossList.push({id:bossId,name:name,lv:lv,hp:status==='alive'?1:0,maxHp:1,respawn:respawn,respawnMin:respawnMin,status:status});
  });

  // === 讀取優先討伐清單 ===
    // === 動態創建 toolbar（全選/取消/加入勾選）===
  // 若 toolbar 不存在則動態建立，插入到世界王列表之前
  (function(){
    var __tb=document.getElementById('__gmp_wb_toolbar');
    if(!__tb&&el.parentElement){
      console.log('[GMP-toolbar] CREATING toolbar in DOM');
      __tb=document.createElement('div');
      __tb.id='__gmp_wb_toolbar';
      __tb.style.cssText='display:none;gap:4px;padding:3px 8px;background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(233,69,96,0.15);';
      __tb.innerHTML='<button data-wb-action="selectAll" style="padding:1px 6px;background:#0f3460;border:1px solid #4ade80;color:#4ade80;border-radius:3px;cursor:pointer;font-size:9px;">\u5168\u9009</button> <button data-wb-action="deselectAll" style="padding:1px 6px;background:#0f3460;border:1px solid #fbbf24;color:#fbbf24;border-radius:3px;cursor:pointer;font-size:9px;">\u53D6\u6D88</button> <button data-wb-action="addSelected" style="padding:1px 8px;background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;border-radius:3px;cursor:pointer;font-size:9px;font-weight:bold;">\u2713 \u52A0\u5165\u52FE\u9078</button>';
      el.parentElement.insertBefore(__tb,el);
    } else {console.log('[GMP-toolbar] already exists or no parent');}
  })();

// 載入討伐清單後渲染世界王列表（含 checkbox 與狀態顏色）
__wbLoadHuntList(function(huntIds){
    console.log('[GMP-UpdateWbUI] bossList.length='+bossList.length+' huntIds='+JSON.stringify((huntIds||[]).slice(0,4)));
    var __tb=document.getElementById('__gmp_wb_toolbar');
    console.log('[GMP-UpdateWbUI] toolbar in DOM='+!!__tb);
    if(__tb)__tb.style.display=bossList.length?'flex':'none';
    if(bossList.length){
      if(countEl)countEl.textContent=bossList.length+' \u96BB';
      var html=bossList.map(function(b){
        // 重生倒數格式化：mm:ss，或顯示存活/--
        var rsStr=b.respawn!==null?'\u91CD\u751F:'+Math.floor(b.respawn/60)+'m '+String((b.respawn%60)+'s').padStart(3,'0'):(b.status==='alive'?'\u5b58\u6d3b\u4e2d':'--');
        var sc={alive:'#4ade80',dead:'#888',waiting:'#fbbf24',unknown:'#555'};
        var inHunt=huntIds.indexOf(b.id)!==-1;
        // 已在討伐清單中的顯示 ✓，否則顯示 checkbox
        var chk=inHunt?'<span style="color:#4caf50;font-size:11px;min-width:28px;">\u2713</span>':'<input type="checkbox" class="__gmp_wb_chk" value="'+b.id+'" data-wb-name="'+b.name+'" data-wb-lv="'+b.lv+'" style="width:14px;height:14px;cursor:pointer;flex-shrink:0;">';
        return '<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(233,69,96,0.06);border-radius:5px;margin-bottom:2px;border-left:3px solid '+sc[b.status]+';">'+
          chk+
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


// ====== 世界王事件自動偵測 ======

// 嘗試自動偵測世界王事件（每 5 秒檢查最近捕獲的事件）
// 從 __wbAllEvents 中統計包含世界王關鍵字的事件名稱，回傳最常出現的那個
// @returns {string|null} 最可能的世界王事件名稱，找不到則回傳 null
function __wbDetectWorldBossEvt(){
  var evts=window.__wbAllEvents||[];
  var candidates={};
  evts.slice(-100).forEach(function(e){
    if(/respawn|worldBoss|bossList|world_boss|RefreshBoss|getBoss/i.test(e.evt)){
      candidates[e.evt]=(candidates[e.evt]||0)+1;
    }
  });
  // 依出現次數遞減排序，取第一名
  var sorted=Object.keys(candidates).sort(function(a,b){return candidates[b]-candidates[a]});
  if(sorted.length){
    console.log('[WB-WorldBoss] detected candidates:',sorted.slice(0,5).map(function(k){return k+' x'+candidates[k];}).join(', '));
    return sorted[0];
  }
  return null;
}


// ====== BOSS 自動攻擊循環（藥水/技能/屏障/停止條件） ======

// BOSS 自動攻擊主循環（每 500ms 執行一次）
// 根據血量百分比和 CD 狀態觸發：停止攻擊、使用藥水、施放技能、治療、屏障
function __wbBossLoop(){if(!window.__wbBossAuto.running)return;var ls=window.lastState||{};var ch=ls.char||{};var boss=ls.boss||{};var cd=boss.cd||{};var cfg=window.__wbBossAuto;var hpPct=ch.maxHp>0?ch.hp/ch.maxHp:1;var mpPct=ch.maxMp>0?ch.mp/ch.maxMp:1;try{if(cfg.stop&&((cfg.stopHpEnable!==false&&hpPct<(cfg.stopHp/100))||(cfg.stopMpEnable&&mpPct<(cfg.stopMp/100)))&&cd.stop<0.05)__wbSend('stop');if(cfg.pot&&hpPct<(cfg.potHp/100)&&cd.pot<0.05)__wbSend('pot');if(cfg.atkSkill&&cd.atk<0.05)__wbSend('atk');if(cfg.heal&&hpPct<(cfg.healHp/100)&&cd.heal<0.05)__wbSend('heal');if(cfg.barrier&&cd.barrier<0.05&&boss.barrierHas)__wbSend('barrier');if(cfg.atk&&ls.mode==='boss'){__wbSend('atk');}else if(cfg.atk&&ls.mode==='bosscombat'){var bHpPct=Math.round((boss.hp||0)/(boss.maxHp||1)*100);var bPlayers=boss.players||0;var hpOk=bHpPct<(cfg.atkHpPct||100);var plOk=cfg.atkOnline?bPlayers>cfg.atkOnline:true;var shouldAtk=false;if(cfg.atkLogic==='OR')shouldAtk=hpOk||plOk;else if(cfg.atkLogic==='NOT')shouldAtk=hpOk&&!plOk;else shouldAtk=hpOk&&plOk;if(shouldAtk)__wbSend('atk');}}catch(e){}window.__wbBossAuto.timer=setTimeout(__wbBossLoop,500);}

// 啟動 BOSS 自動攻擊（更新 UI 狀態文字為綠色）
function __wbBossAutoStart(){
  window.__wbBossAuto.running=true;
  __wbBossLoop();
  var ss=document.getElementById('__gmp_boss_auto_status_short');
  if(ss){ss.textContent='\u26A1 \u81EA\u52A8BOSS\u8FD0\u884C\u4E2D...';ss.style.color='#4ade80';}
  var ce=document.getElementById('__gmp_boss_auto_enable');
  if(ce)ce.checked=true;
}

// 停止 BOSS 自動攻擊（清除排程，更新 UI 為灰色）
function __wbBossAutoStop(){
  window.__wbBossAuto.running=false;
  if(window.__wbBossAuto.timer)clearTimeout(window.__wbBossAuto.timer);
  var ss=document.getElementById('__gmp_boss_auto_status_short');
  if(ss){ss.textContent='\u505C\u6B62\u4E2D';ss.style.color='#888';}
  var ce=document.getElementById('__gmp_boss_auto_enable');
  if(ce)ce.checked=false;
}


// ====== 冷卻時間繞過（Cooldown Bypass） ======
window.__wbBypassCD=false;

// 切換冷卻時間繞過功能
// 開啟時會攔截遊戲的 updateBossCd 和 renderBossPanel，強制解除技能按鈕的 disabled 狀態
// @param {boolean} on - true=啟用繞過, false=關閉
function __wbToggleBypass(on){window.__wbBypassCD=on;if(on&&!window.__wbBypassPatched){window.__wbBypassPatched=true;var _orig=window.updateBossCd;if(_orig){window.updateBossCd=function(){try{_orig.apply(this,arguments);}catch(e){}var keys=['pot','atk','heal','convert','barrier','holybarrier'];keys.forEach(function(k){var b=document.getElementById('bact-'+k);if(b)b.disabled=false;});};}var _origRBP=window.renderBossPanel;if(_origRBP){window.renderBossPanel=function(p){try{_origRBP.apply(this,arguments);}catch(e){_origRBP(p);}setTimeout(function(){document.querySelectorAll('.bact-btn[id]').forEach(function(b){var k=b.dataset&&b.dataset.k;if(k&&!b.__wbBypass){b.__wbBypass=true;b.addEventListener('click',function(){__wbSend(k);b.disabled=false;});}});},50);};}}console.log('[WB] Bypass:',on?'ON':'OFF');}


// ====== BOSS 狀態面板更新 ======

  // 更新 BOSS 資訊面板（名稱、HP、Buff、冷卻時間、Socket 狀態）
  function __wbUpdateBossStatus(){
    var ls=window.lastState||{};
    var ch=ls.char||{};
    var boss=ls.boss||{};
    var cd=boss.cd||{};
    var mode=ls.mode||'';
    // Boss name
    var nameEl=document.getElementById('__gmp_boss_name');
    var lvEl=document.getElementById('__gmp_boss_lv');
    if(nameEl)nameEl.textContent=boss.name?(boss.name+' (Lv.'+boss.lv+')'):'-- \u7121\u4E16\u754C\u738B --';
    if(lvEl)lvEl.textContent='mode: '+mode;
    // Boss HP bar（血量條：依百分比變色 → >50%紅、>25%黃、<=25%深紅）
    var hpEl=document.getElementById('__gmp_boss_hp_text');
    var hpBar=document.getElementById('__gmp_boss_hp_bar');
    if(hpEl)hpEl.textContent=boss.hp?(boss.hp+'/'+boss.maxHp):'--/--';
    if(hpBar){
      var pct=boss.maxHp>0?Math.round(boss.hp/boss.maxHp*100):0;
      hpBar.style.width=pct+'%';
      hpBar.style.background=pct>50?'#e94560':pct>25?'#fbbf24':'#dc2626';
    }
    // Buffs（顯示屏障狀態）
    var bufEl=document.getElementById('__gmp_boss_buffs');
    if(bufEl){
      var parts=[];
      if(boss.barrierOn)parts.push('\uD83D\uDEE1\uFE0F \u5C4F\u969C ON');
      if(boss.barrierHas)parts.push('\uD83D\uDCE6 \u6709\u5C4F\u969C');
      bufEl.textContent=parts.length?parts.join(' | '):'';
    }
    // Cooldown timers（五個技能冷卻顯示：>0.05s 紅色倒數，否則綠色「就緒」）
    var keys=['pot','atk','heal','convert','barrier'];
    keys.forEach(function(k){
      var el=document.getElementById('__gmp_cd_'+k);
      if(!el)return;
      var v=cd[k]||0;
      if(v>0.05){
        el.textContent=v.toFixed(1)+'s';
        el.style.color='#e94560';
      } else {
        el.textContent='\u5C31\u7DD2';
        el.style.color='#4ade80';
      }
    });
    // Socket status（連線狀態）
    var sockEl=document.getElementById('__gmp_sock_status');
    if(sockEl)sockEl.textContent=window.__wbSocket?'\u2705 \u5DF2\u9023\u63A5':'\u274C \u672A\u9023\u63A5';
    if(sockEl)sockEl.style.color=window.__wbSocket?'#4ade80':'#e94560';
    var sentEl=document.getElementById('__gmp_sock_sent');
    if(sentEl)sentEl.textContent=(window.__wbBossEmitLog||[]).length;
    var evtEl=document.getElementById('__gmp_sock_evts');
    if(evtEl)evtEl.textContent=(window.__sioPackets||[]).length;
  }

  // 從 UI checkbox/input 同步設定值到 __wbBossAuto 設定物件
  function __wbSyncAutoConfig(){
    var cfg=window.__wbBossAuto;
    cfg.pot=document.getElementById('__gmp_boss_auto_pot').checked;
    cfg.heal=document.getElementById('__gmp_boss_auto_heal').checked;
    cfg.barrier=document.getElementById('__gmp_boss_auto_barrier').checked;
    cfg.atk=document.getElementById('__gmp_boss_auto_atk').checked;
    cfg.potHp=parseInt(document.getElementById('__gmp_boss_auto_pot_hp').value)||80;
    cfg.healHp=parseInt(document.getElementById('__gmp_boss_auto_heal_hp').value)||70;
    cfg.stop=document.getElementById('__gmp_boss_auto_stop').checked;
    cfg.stopHpEnable=document.getElementById('__gmp_boss_auto_stop_hp_enable').checked;
    cfg.stopHp=parseInt(document.getElementById('__gmp_boss_auto_stop_hp').value)||30;
    cfg.stopMpEnable=document.getElementById('__gmp_boss_auto_stop_mp_enable')?document.getElementById('__gmp_boss_auto_stop_mp_enable').checked:false;
    cfg.stopMp=parseInt(document.getElementById('__gmp_boss_auto_stop_mp').value)||10;
    cfg.atkSkill=document.getElementById('__gmp_boss_auto_atk_skill').checked;
  }

  // 啟動 BOSS 狀態定時更新器（每 500ms）
  // 僅在 activeTab==='boss' 時更新狀態面板，同時持續更新討伐清單 UI
  function __wbBossStartUpdater(){
    if(__wbBossUpdTimer)return;
    __wbBossUpdTimer=setInterval(function(){
      if(activeTab==='boss'){__wbUpdateBossStatus();__wbUpdateWorldBossUI();}
          __wbInitHuntToggle();
          __wbUpdateHuntListUI();
    },500);
  }


// ========== 優先討伐清單管理 ==========
// 記憶體快取：繞開 chrome.storage.local relay 時序問題
window.__wbHuntListCache=null;
window.__wbHuntListCacheIds=null;

// 從 storage 載入討伐清單（僅回傳 id 陣列）
// 優先使用記憶體快取，若無快取才讀取 chrome.storage
// @param {Function} callback - 回呼函式，接收 id 字串陣列
function __wbLoadHuntList(callback){
  // 優先使用記憶體快取（chrome.storage.local relay 有時序問題）
  // 快取命中直接回傳 slice 副本，避免外部修改影響快取
  if(window.__wbHuntListCacheIds){
    console.log('[GMP-LoadHuntList] cache hit:',JSON.stringify(window.__wbHuntListCacheIds.slice(0,5)));
    if(callback)callback(window.__wbHuntListCacheIds.slice());
    return;
  }
  if(typeof window.__gmStorageGet==='undefined'){if(callback)callback([]);return;}
  window.__gmStorageGet(['wb_priority_list']).then(function(r){
    var list=r&&r.wb_priority_list||[];
    // 載入後同步更新記憶體快取
    window.__wbHuntListCache=list.slice();
    window.__wbHuntListCacheIds=list.map(function(i){return i.id;});
    console.log('[GMP-LoadHuntList] loaded from storage, ids:',JSON.stringify(window.__wbHuntListCacheIds.slice(0,5)));
    if(callback)callback(window.__wbHuntListCacheIds.slice());
  }).catch(function(){if(callback)callback([]);});
}

// 從 storage 載入完整討伐清單（含完整物件，非僅 id）
// @param {Function} callback - 回呼函式，接收完整 BOSS 物件陣列 [{id, name, lv, ...}]
function __wbGetHuntList(callback){
  // 優先使用記憶體快取
  if(window.__wbHuntListCache){if(callback)callback(window.__wbHuntListCache.slice());return;}
  if(typeof window.__gmStorageGet==='undefined'){if(callback)callback([]);return;}
  window.__gmStorageGet(['wb_priority_list']).then(function(r){
    var list=r&&r.wb_priority_list||[];
    window.__wbHuntListCache=list.slice();
    window.__wbHuntListCacheIds=list.map(function(i){return i.id;});
    callback(list);
  }).catch(function(){callback([]);});
}

// 儲存討伐清單到 storage 並同步更新記憶體快取
// @param {Array} list - 完整的討伐清單物件陣列
function __wbSaveHuntList(list){
  console.log('[GMP-SaveHunt] write list:',JSON.stringify(list.map(function(i){return i.id+':'+i.name;})));
  // 立刻更新記憶體快取（繞開 relay 時序問題）
  // 先寫快取再寫 storage，確保後續讀取立即反映最新狀態
  window.__wbHuntListCache=list.slice();
  window.__wbHuntListCacheIds=list.map(function(i){return i.id;});
  if(typeof window.__gmStorageSet==='undefined'){
    console.warn('[GMP-SaveHunt] __gmStorageSet missing, using cache only');
    __wbUpdateHuntListUI();
    __wbUpdateWorldBossUI();
    return;
  }
  window.__gmStorageSet('wb_priority_list',list).then(function(){
    console.log('[GMP-SaveHunt] storage write OK');
    __wbUpdateHuntListUI();
    __wbUpdateWorldBossUI();
  }).catch(function(e){console.error('[GMP-SaveHunt] write FAILED:',e);});
}

// 新增單一 BOSS 到討伐清單
// @param {string} bossId   - BOSS id
// @param {string} bossName - BOSS 名稱
// @param {number} bossLv   - BOSS 等級
function __wbAddToHuntList(bossId,bossName,bossLv){
  // 從快取讀取（若無快取則從 storage 載入）
  __wbGetHuntList(function(list){
    if(list.some(function(i){return i.id===bossId;})){console.log('[GMP-AddToHunt] '+bossName+' already in list');return;}
    list.push({id:bossId,name:bossName,lv:bossLv,addedAt:Date.now(),minPlayers:0});
    console.log('[GMP-AddToHunt] adding '+bossName);
    __wbSaveHuntList(list);
  });
}

// === 批量加入勾選的世界王到優先討伐清單 ===
// 從世界王清單 UI 中勾選的 checkbox 批次加入討伐清單（自動去重）
function __wbAddSelectedToHunt(){
  var boxes=document.querySelectorAll('.__gmp_wb_chk:checked');
  console.log('[GMP-addSelected] found '+boxes.length+' checked boxes');
  if(!boxes.length)return;
  var added=[];
  boxes.forEach(function(b){
    var id=b.value;
    var name=b.getAttribute('data-wb-name')||'';
    var lv=parseInt(b.getAttribute('data-wb-lv'))||0;
    console.log('[GMP-addSelected]  id='+id+' name='+name);
    added.push({id:id,name:name,lv:lv,addedAt:Date.now(),minPlayers:0});
  });
  if(!added.length)return;
  __wbGetHuntList(function(list){
    console.log('[GMP-addSelected] current hunt list has '+list.length+' items');
    var changed=false;
    added.forEach(function(item){
      // 檢查是否已存在，避免重複加入
      if(!list.some(function(i){return i.id===item.id;})){
        list.push(item);changed=true;
        console.log('[GMP-addSelected] ADDED '+item.name);
      } else {console.log('[GMP-addSelected] SKIP '+item.name+' (exists)');}
    });
    if(changed){console.log('[GMP-addSelected] saving...');__wbSaveHuntList(list);}
    else{console.log('[GMP-addSelected] no changes');}
  });
}

// 全選/取消全選世界王列表中的 checkbox
// @param {boolean} select - true=全選, false=取消全選
function __wbToggleSelectAll(select){
  var boxes=document.querySelectorAll('.__gmp_wb_chk');
  console.log('[GMP-toggleSelectAll] select='+select+' found '+boxes.length+' boxes');
  boxes.forEach(function(b){b.checked=select;});
}


// 從討伐清單中移除指定 BOSS
// @param {string} bossId - 要移除的 BOSS id
function __wbRemoveFromHuntList(bossId){
  __wbGetHuntList(function(list){
    list=list.filter(function(i){return i.id!==bossId;});
    __wbSaveHuntList(list);
  });
}

// 更新討伐清單 UI（含上移/下移/刪除按鈕及各項目的 minPlayers 輸入框）
function __wbUpdateHuntListUI(){
  var el=document.getElementById('__gmp_hunt_list');
  var countEl=document.getElementById('__gmp_hunt_count');
  if(!el)return;
  // 保存已勾選的 id，innerHTML 重繪後復原
  // 防止 innerHTML 重繪後失去勾選狀態
  var prev=document.querySelectorAll('.__gmp_hunt_chk:checked');
  var checkedIds={};
  prev.forEach(function(c){checkedIds[c.value]=true;});
  // 保存批次人數輸入框的值，innerHTML 重繪後復原
  var batchMinpEl=document.getElementById('__gmp_hunt_batch_minp');
  var savedBatchMinp=batchMinpEl?batchMinpEl.value:'0';
  __wbGetHuntList(function(list){
    if(countEl)countEl.textContent=list.length+' \u53EA';
    var toolbar='<div style="display:flex;gap:4px;padding:2px 0 4px;flex-wrap:wrap;align-items:center;">'+
      '<button data-wb-action="huntUp" style="padding:2px 8px;background:#0f3460;border:1px solid #4ade80;color:#4ade80;border-radius:3px;cursor:pointer;font-size:10px;">\u25B2 \u4E0A\u79FB</button>'+
      '<button data-wb-action="huntDown" style="padding:2px 8px;background:#0f3460;border:1px solid #fbbf24;color:#fbbf24;border-radius:3px;cursor:pointer;font-size:10px;">\u25BC \u4E0B\u79FB</button>'+
      '<button data-wb-action="huntDelete" style="padding:2px 8px;background:#3a1a1a;border:1px solid #e94560;color:#e94560;border-radius:3px;cursor:pointer;font-size:10px;">\u2715 \u522A\u9664</button>'+
      '<span style="font-size:9px;color:#555;margin:0 2px;">|</span>'+
      '<span style="font-size:9px;color:#aaa;">\u6279\u91CF\u4EBA\u6578:</span>'+
      '<input id="__gmp_hunt_batch_minp" type="number" value="'+savedBatchMinp+'" min="0" max="20" style="width:32px;padding:1px 3px;background:#2a2a4a;border:1px solid #0f3460;border-radius:3px;color:#fbbf24;font-size:9px;outline:none;text-align:center;" title=\批\u91CF\u8A2D\u5B9A\u52FE\u9078\u9805\u76EE\u7684\u6700\u4F4E\u5728\u5834\u4EBA\u6578\">'+
      '<button data-wb-action="huntBatchMinp" style="padding:2px 6px;background:#1a3a1a;border:1px solid #fbbf24;color:#fbbf24;border-radius:3px;cursor:pointer;font-size:10px;margin-left:auto;">\u2713 \u5957\u7528</button>'+
    '</div>';
    if(list.length){
      el.innerHTML=toolbar+list.map(function(i,idx){
        return '<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;background:rgba(76,175,80,0.06);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;">'+
          '<input type="checkbox" class="__gmp_hunt_chk" value="'+i.id+'"'+(checkedIds[i.id]?' checked':'')+' style="width:13px;height:13px;cursor:pointer;flex-shrink:0;">'+
          '<span style="font-size:10px;color:#4caf50;min-width:70px;">'+i.name+'</span>'+
          '<span style="font-size:9px;color:#aaa;">Lv.'+i.lv+'</span>'+
          '<input type="number" value="'+(i.minPlayers||0)+'" min="0" max="20" style="width:32px;padding:1px 2px;background:#2a2a4a;border:1px solid #0f3460;border-radius:3px;color:#fbbf24;font-size:9px;outline:none;text-align:center;" data-wb-minp="'+i.id+'" title="\u6700\u4F4E\u4EBA\u6578(0=\u4E0D\u9650)">'+
        '</div>';
      }).join('');
    } else {
      el.innerHTML=toolbar+'<div style="font-size:10px;color:#888;padding:6px;text-align:center;">\u70b9\u52FE\u4e0a\u65b9\u4e16\u754c\u738b\uff0c\u7136\u5F8C\u9EDE \u2713 \u52A0\u5165\u52FE\u9078</div>';
    }
  });
}


// ====== UI 折疊/展開初始化 ======

// 初始載入優先討伐清單
// 設定世界王清單和討伐清單的折疊/展開按鈕事件
function __wbInitHuntToggle(){
  // 世界王清單折疊
  // 點擊標題列切換內容區顯示/隱藏
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
// ====== 啟動時自動偵測世界王事件 ======
// 初次啟動偵測
// 延遲 5 秒後執行：偵測世界王事件名稱 → 啟動定時器 → 每 5 秒重新偵測
setTimeout(function(){
  var detected=__wbDetectWorldBossEvt();
  if(detected){
    window.__wbWorldBossEvtName=detected;
    console.log('[WB-WorldBoss] confirmed event:',detected);
  }
  __wbStartWorldBossTimer();
  // 每 5 秒偵測新事件（若尚未確認事件名稱）
  window.__wbWorldBossDetectTimer=setInterval(function(){
    if(!window.__wbWorldBossEvtName){
      var d=__wbDetectWorldBossEvt();
      if(d){window.__wbWorldBossEvtName=d;console.log('[WB-WorldBoss] auto-detected:',d);}
    }
    __wbUpdateWorldBossUI();
  },5000);
},5000);



  // ====== Export __wb* functions to window (for inline onclick/closure fallback) ======
  // 將所有內部函式匯出到 window 全域，供 HTML inline onclick 和其他模組使用
  window.__wbSend=__wbSend;window.__wbSendPotion=__wbSendPotion;window.__wbCastSkill=__wbCastSkill;
  window.__wbSetBossSet=__wbSetBossSet;window.__wbEmit=__wbEmit;
  window.__wbSubscribeWorldBoss=__wbSubscribeWorldBoss;window.__wbQueryWorldBoss=__wbQueryWorldBoss;
  window.__wbStartWorldBossTimer=__wbStartWorldBossTimer;window.__wbStopWorldBossTimer=__wbStopWorldBossTimer;
  window.__wbParseWorldBossData=__wbParseWorldBossData;window.__wbUpdateWorldBossUI=__wbUpdateWorldBossUI;
  window.__wbEnsureWBTab=__wbEnsureWBTab;
  window.__wbDetectWorldBossEvt=__wbDetectWorldBossEvt;
  window.__wbBossLoop=__wbBossLoop;window.__wbBossAutoStart=__wbBossAutoStart;window.__wbBossAutoStop=__wbBossAutoStop;
  window.__wbToggleBypass=__wbToggleBypass;
  window.__wbUpdateBossStatus=__wbUpdateBossStatus;window.__wbSyncAutoConfig=__wbSyncAutoConfig;
  window.__wbBossStartUpdater=__wbBossStartUpdater;
  window.__wbLoadHuntList=__wbLoadHuntList;window.__wbGetHuntList=__wbGetHuntList;
  window.__wbLoadBossScriptMode=__wbLoadBossScriptMode;window.__wbSetBossScriptMode=__wbSetBossScriptMode;
  window.__wbSaveHuntList=__wbSaveHuntList;window.__wbAddToHuntList=__wbAddToHuntList;
  window.__wbAddSelectedToHunt=__wbAddSelectedToHunt;
  window.__wbToggleSelectAll=__wbToggleSelectAll;
  window.__wbHuntMoveSelected=__wbHuntMoveSelected;
  window.__wbHuntDeleteSelected=__wbHuntDeleteSelected;
  window.__wbRemoveFromHuntList=__wbRemoveFromHuntList;window.__wbUpdateHuntListUI=__wbUpdateHuntListUI;
  window.__wbInitHuntToggle=__wbInitHuntToggle;
  window.__wbMoveHuntItem=__wbMoveHuntItem;window.__wbGetHuntIds=__wbGetHuntIds;
  window.__wbCaptureBossLoot=__wbCaptureBossLoot;window.__wbSaveBossLoot=__wbSaveBossLoot;
  window.__wbLoadBossLoot=__wbLoadBossLoot;window.__wbGetBossLoot=__wbGetBossLoot;
  window.__wbClearBossLoot=__wbClearBossLoot;
  window.__wbBossAutoScriptWaitForLoot=__wbBossAutoScriptWaitForLoot;
  window.__wbBossAutoScriptStart=__wbBossAutoScriptStart;
  window.__wbBossAutoScriptStop=__wbBossAutoScriptStop;
  window.__wbBossAutoScriptTryEnter=__wbBossAutoScriptTryEnter;
  window.__wbBossAutoScriptTryEnterSpam=__wbBossAutoScriptTryEnterSpam;

  console.log("[WB] World Boss module loaded");
})();


// ====== IIFE 外部：minPlayers 數量輸入事件監聽 ======
// === Per-item minPlayers change handler ===
// 監聽討伐清單中每隻 BOSS 的「最低人數」輸入框變更
// 透過事件委派，在 document 層級監聽 input 事件，匹配 data-wb-minp 屬性
document.addEventListener('input',function(e){
  var t=e.target;
  if(t&&t.getAttribute&&t.getAttribute('data-wb-minp')){
    var id=t.getAttribute('data-wb-minp');
    var val=parseInt(t.value)||0;
    // 讀取完整清單 → 更新對應項目的 minPlayers → 儲存
    __wbGetHuntList(function(list){
      var changed=false;
      list.forEach(function(item,i){
        if(item.id===id){list[i].minPlayers=val;changed=true;}
      });
      if(changed)__wbSaveHuntList(list);
    });
  }
});
