// content.js - Runs automatically on game page
(function(){
if(window.__gmContentLoaded)return;
window.__gmContentLoaded=true;

// ====== Extension context invalidation guard ======
var __gmRuntimeDead = false;
var _gmChrome = null;
try {
  _gmChrome = chrome;
  // 不在初始化時預先判定 __gmRuntimeDead
  // chrome.runtime.id 在 document_start 階段可能尚未就緒
  // __gmRuntimeDead 只應在實際 API 呼叫失敗時設為 true（lazy detection）
} catch(e) {
  // chrome 物件本身不存在 → 非擴充環境，設死旗
  __gmRuntimeDead = true;
}

// Runtime disconnect listener
try {
  // Listen for runtime disconnect (extension reload)
  // onConnect/onDisconnect isn't reliable for detecting reload.
  // Instead, wrap sendMessage to catch the error.
} catch(e) {
  __gmRuntimeDead = true;
}

function __gmSafeSendMessage(msg, cb) {
  if (__gmRuntimeDead) {
    if (cb) cb(null);
    return;
  }
  try {
    _gmChrome.runtime.sendMessage(msg, function(resp) {
      // 注意：sendMessage 失敗不一定是永久斷線
      // background.js 可能在 document_start 階段尚未就緒，這是暫時性的
      // 只有 storage.local API 失敗才能確認 runtime 永久失效
      if (_gmChrome.runtime.lastError) {
        if (cb) cb(null);
        return;
      }
      if (cb) cb(resp);
    });
  } catch(e) {
    if (cb) cb(null);
  }
}

function __gmSafeStorageGet(keys, cb) {
  if (__gmRuntimeDead) { if(cb) cb({}); return; }
  try {
    _gmChrome.storage.local.get(keys, function(result) {
      if (_gmChrome.runtime.lastError) { __gmRuntimeDead = true; if(cb) cb({}); return; }
      if (cb) cb(result);
    });
  } catch(e) {
    __gmRuntimeDead = true; if(cb) cb({});
  }
}

function __gmSafeStorageSet(obj, cb) {
  if (__gmRuntimeDead) { if(cb) cb(); return; }
  try {
    _gmChrome.storage.local.set(obj, function() {
      if (_gmChrome.runtime.lastError) { __gmRuntimeDead = true; if(cb) cb(); return; }
      if (cb) cb();
    });
  } catch(e) {
    __gmRuntimeDead = true; if(cb) cb();
  }
}

// If runtime is already dead, bail out silently
if (__gmRuntimeDead) {
  console.log('[GM Content] Extension context invalidated, content script disabled');
  return;
}

// ====== Main content script ======
window.__gmPanelVisible=false;

// 遊戲分頁 ID（盡早向 background 請求並快取）
var __gmGameTabId = null;

// Pending injection requests (queued before tabId is known)
var __gmPendingInjections = [];

// 向 background 註冊自己並取得自己的 tabId
__gmSafeSendMessage({action:'registerGameTab'}, function(resp) {
  if (resp && resp.registered) {
    console.log('[GM Content] Game tab registered');
  }
});

// Storage 請求序號（用於配對回應）
var __gmStorageSeq = 0;

// 來自 game-monitor.js 的 relay 請求（MAIN world → content → background）
window.addEventListener('message', function(e) {
  if (!e.data || !e.data.type) return;

  // ---------- 通用 chrome.storage.local 讀寫（取代 IndexedDB） ----------
  if (e.data.type === 'GM_STORAGE_GET') {
    // e.data = {type: 'GM_STORAGE_GET', keys: ['key1','key2'], seq: N}
    __gmSafeStorageGet(e.data.keys || [], function(result) {
      window.postMessage({
        type: 'GM_STORAGE_RESPONSE',
        keys: e.data.keys,
        data: result,
        seq: e.data.seq || 0
      }, '*');
    });
    return;
  }

  if (e.data.type === 'GM_STORAGE_SET') {
    // e.data = {type: 'GM_STORAGE_SET', key: 'xxx', data: {...}, seq: N}
    var obj = {};
    obj[e.data.key] = e.data.data;
    __gmSafeStorageSet(obj, function() {
      if (e.data.seq !== undefined) {
        window.postMessage({
          type: 'GM_STORAGE_RESPONSE',
          key: e.data.key,
          success: true,
          seq: e.data.seq
        }, '*');
      }
    });
    return;
  }

  // ---------- Legacy: 基本掛機設定 ----------
  if (e.data.type === 'GM_SAVE_SETTINGS' && e.data.data) {
    __gmSafeStorageSet({gmFarmSettings: e.data.data}, function() {
      if (!__gmRuntimeDead) console.log('[GM] Settings saved');
    });
    return;
  }

  if (e.data.type === 'GM_LOAD_SETTINGS') {
    __gmSafeStorageGet(['gmFarmSettings'], function(result) {
      var data = result.gmFarmSettings || {};
      window.postMessage({type: 'GM_LOAD_RESPONSE', data: data}, '*');
    });
    return;
  }

  // ---------- 注入模組 ----------
  if (e.data.type === 'GM_LOAD_ADVANCED' && e.data.src) {
    // If runtime is dead, can't inject — warn and bail
    if (__gmRuntimeDead) {
      console.warn('[GM Content] Extension invalidated, cannot inject', e.data.src);
      window.postMessage({type: 'GM_ADVANCED_LOADED', src: e.data.src, error: 'context invalidated'}, '*');
      return;
    }

    var scriptName = e.data.src;
    console.log('[GM Content] Relaying', scriptName, 'injection request');

    function doInject(tabId) {
      __gmSafeSendMessage(
        {action: 'injectScript', scriptName: scriptName, tabId: tabId},
        function(response) {
          if (response && response.success) {
            console.log('[GM Content] ' + scriptName + ' injected');
            window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
          } else {
            console.error('[GM Content] Failed to inject ' + scriptName, response && response.error);
            // Retry once after 800ms (only if runtime still alive)
            if (!__gmRuntimeDead) {
              setTimeout(function() {
                __gmSafeSendMessage(
                  {action: 'injectScript', scriptName: scriptName, tabId: tabId},
                  function(resp2) {
                    if (resp2 && resp2.success) {
                      console.log('[GM Content] ' + scriptName + ' injected (retry)');
                      window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
                    } else {
                      console.error('[GM Content] Retry failed for ' + scriptName, resp2 && resp2.error);
                    }
                  }
                );
              }, 800);
            }
          }
        }
      );
    }

    // 立即嘗試讀取快取（registerGameTab 的 callback 已經更新了 __gmGameTabId）
    if (__gmGameTabId) {
      doInject(__gmGameTabId);
    } else {
      // 還不知道 tabId：向 background 查詢，等回應後再注射
      __gmSafeSendMessage({action: 'getGameTabId'}, function(info) {
        if (info && info.tabId) {
          __gmGameTabId = info.tabId;
          doInject(__gmGameTabId);
        } else {
          console.error('[GM Content] Cannot determine game tabId — game tab may not be registered yet. Retry later.');
        }
      });
    }
  }

});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (__gmRuntimeDead) {
    sendResponse({error: 'context invalidated'});
    return true;
  }
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({visible: window.__gmPanelVisible});
  } else if (request.action === 'tabIdInfo') {
    __gmGameTabId = request.tabId;
    sendResponse({ok: true});
  }
  return true;
});

function togglePanel() {
  var el = document.getElementById('__gmp');
  if (el) {
    el.remove();
    window.__gmPanelVisible = false;
  } else {
    document.dispatchEvent(new CustomEvent('__gm_show_panel'));
    window.__gmPanelVisible = true;
  }
}
})();
// ---------- WINDOW FOCUS / MINIMIZE relay ----------
document.addEventListener('__gm_focusGameWindow', function() {
  __gmSafeSendMessage({action:'focusGameWindow'}, function(resp) {
    console.log('[GM Content] focusGameWindow relay response:', resp);
  });
});
document.addEventListener('__gm_minimizeGameWindow', function() {
  __gmSafeSendMessage({action:'minimizeGameWindow'}, function(resp) {
    console.log('[GM Content] minimizeGameWindow relay response:', resp);
  });
});

// ========== 瀏覽器健康監控 (v4.32) ==========
(function(){
  if(window.__gmHealthMonitorLoaded)return;
  window.__gmHealthMonitorLoaded=true;

  var RELOAD_COOLDOWN = 120000; // reload 冷卻: 2 分鐘內不重複 reload
  var _lastReloadTime = 0;
  var _loginVisibleStart = 0;    // 登入畫面開始顯示的時間
  var _loginVisibleCount = 0;    // 連續偵測到登入畫面的次數
  var MEM_THRESHOLD = 1024*1024*1024; // JS heap 超過 1GB 視為記憶體異常
  var HEARTBEAT_INTERVAL = 10000; // 每 10 秒發一次心跳

  // ===== 安全 reload: 有冷卻防護 =====
  function safeReload(reason){
    var now = Date.now();
    if(now - _lastReloadTime < RELOAD_COOLDOWN){
      console.warn('[GM Health] Reload skipped (cooldown):', reason);
      return;
    }
    _lastReloadTime = now;
    console.warn('[GM Health] RELOAD triggered:', reason);
    __gmSafeSendMessage({action:'gmHealthReload', reason: reason});
  }

  // ===== 心跳: 通知 background.js 我還活著 =====
  function sendHeartbeat(){
    __gmSafeSendMessage({action:'gmHeartbeat', ts: Date.now()}, function(resp){
      // silent
    });
  }

  // ===== 登入畫面卡死偵測 =====
  function checkLoginHang(){
    var el = document.getElementById('login');
    var isVisible = el && el.style.display !== 'none' && el.offsetParent !== null;
    if(isVisible){
      if(_loginVisibleStart === 0){
        _loginVisibleStart = Date.now();
        _loginVisibleCount = 0;
      }
      _loginVisibleCount++;
      // 登入畫面連續出現超過 30 秒 → 重整
      var elapsed = Date.now() - _loginVisibleStart;
      if(elapsed > 30000 && _loginVisibleCount > 2){
        console.warn('[GM Health] Login screen stuck for', Math.round(elapsed/1000), 's');
        safeReload('login_screen_stuck_' + Math.round(elapsed/1000) + 's');
        _loginVisibleStart = Date.now(); // reset 避免重複觸發
        _loginVisibleCount = 0;
      }
    } else {
      _loginVisibleStart = 0;
      _loginVisibleCount = 0;
    }
  }

  // ===== 記憶體監控 =====
  function checkMemory(){
    if(!performance.memory) return; // 非 Chrome 環境
    var used = performance.memory.usedJSHeapSize;
    var limit = performance.memory.jsHeapSizeLimit;
    if(used > MEM_THRESHOLD && limit > 0){
      var pct = Math.round(used / limit * 100);
      console.warn('[GM Health] Memory high:', (used/1024/1024).toFixed(0)+'MB / '+pct+'%');
    }
    // 超過 80% heap limit 或 1.5GB → 觸發 reload
    if(limit > 0 && used/limit > 0.8){
      safeReload('memory_high_' + Math.round(used/limit*100) + 'pct');
    } else if(used > 1500*1024*1024){
      safeReload('memory_high_' + Math.round(used/1024/1024) + 'MB');
    }
  }

  // ===== 主監控循環 =====
  var _monitorTick = 0;
  setInterval(function(){
    _monitorTick++;
    sendHeartbeat();
    // 每 3 秒檢查一次登入畫面和記憶體
    if(_monitorTick % 3 === 0){
      checkLoginHang();
      checkMemory();
    }
  }, 10000);

  console.log('[GM Health] Monitor started (heartbeat 10s, health check 30s)');
})();
