// background.js - Chrome Debugger for WebSocket monitoring
var activeTabId = null;
var isMonitoring = false;
var packets = { send: [], receive: [] };

// 快取遊戲分頁 ID（由 content script 註冊）
var gameTabId = null;

// 當有新分頁建立時，嘗試找到遊戲分頁
chrome.tabs.onCreated.addListener(function(tab) {
  if (tab.url && /linh5web/i.test(tab.url)) {
    gameTabId = tab.id;
    console.log('[GM Background] Game tab tracked:', tab.id, tab.url);
  }
});

// 當分頁 URL 更新時，檢查是否為遊戲分頁，並自動注入腳本
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && /linh5web/i.test(tab.url)) {
    gameTabId = tabId;
    console.log('[GM Background] Game tab loaded:', tabId, 'auto-injecting scripts...');
    // 自動注入所有 MAIN world 腳本
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['storage.js', 'farming-config.js', 'game-monitor.js', 'wb-boss.js', 'advanced-farming.js'],
      world: 'MAIN'
    }, function(results) {
      if (chrome.runtime.lastError) {
        console.error('[GM Background] Auto-inject failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[GM Background] All scripts auto-injected into tab', tabId);
      }
    });
  }
});

// ========== 健康監控後端 (v4.32) ==========
(function(){
  var HEARTBEAT_TIMEOUT = 60000;    // 60秒沒心跳 → content script 掛了
  var HEARTBEAT_CHECK_MS = 15000;   // 每 15 秒檢查一次
  var _lastHeartbeat = 0;
  var _lastHeartbeatWarned = false;

  function reloadGameTab(reason){
    console.warn('[GM Health BG] Reloading game tab:', reason);
    if(!gameTabId){
      console.warn('[GM Health BG] No gameTabId, skip reload');
      return;
    }
    chrome.tabs.reload(gameTabId, { bypassCache: true }, function(){
      if(chrome.runtime.lastError){
        console.error('[GM Health BG] Reload failed:', chrome.runtime.lastError.message);
        gameTabId = null;
      } else {
        console.log('[GM Health BG] Tab', gameTabId, 'reloaded');
      }
    });
  }

  setInterval(function(){
    if(!_lastHeartbeat) return;
    var gap = Date.now() - _lastHeartbeat;
    if(gap > HEARTBEAT_TIMEOUT && !_lastHeartbeatWarned){
      console.warn('[GM Health BG] Heartbeat lost! Last:', gap/1000, 's ago');
      _lastHeartbeatWarned = true;
      reloadGameTab('heartbeat_lost_' + Math.round(gap/1000) + 's');
    } else if(gap <= HEARTBEAT_TIMEOUT){
      _lastHeartbeatWarned = false;
    }
  }, HEARTBEAT_CHECK_MS);

  chrome.alarms.create('gmHealthCheck', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener(function(alarm){
    if(alarm.name !== 'gmHealthCheck') return;
    if(!_lastHeartbeat) return;
    var gap = Date.now() - _lastHeartbeat;
    if(gap > HEARTBEAT_TIMEOUT && !_lastHeartbeatWarned){
      console.warn('[GM Health BG] Alarm trigger: heartbeat lost', gap/1000, 's');
      _lastHeartbeatWarned = true;
      reloadGameTab('heartbeat_lost_alarm_' + Math.round(gap/1000) + 's');
    }
  });

  window.__gmHealthBG = {
    setHeartbeat: function(){ _lastHeartbeat = Date.now(); _lastHeartbeatWarned = false; },
    reloadGameTab: reloadGameTab
  };

  console.log('[GM Health BG] Monitor backend started');
})();

function doWindowAction(sender, gameTabId, sendResponse, targetState) {
  var tabId = (sender && sender.tab && sender.tab.id) || gameTabId;
  var windowId = sender && sender.tab && sender.tab.windowId;
  console.log('[GM Background] doWindowAction', targetState, 'tabId=', tabId, 'winId=', windowId, 'senderTab=', !!(sender&&sender.tab));
  if (!tabId) { sendResponse({ success: false, error: 'No tabId' }); return; }
  
  function doIt(wid) {
    if (!wid) { sendResponse({ success: false, error: 'No windowId' }); return; }
    console.log('[GM Background] Updating window', wid, 'state=', targetState);
    var props = targetState === 'minimized' ? { state: 'minimized' } : { state: 'normal', focused: true };
    chrome.windows.update(wid, props, function(win) {
      if (chrome.runtime.lastError) {
        console.error('[GM Background] windows.update error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (targetState !== 'minimized') {
        chrome.tabs.update(tabId, { active: true }, function() {
          if (chrome.runtime.lastError) console.error('[GM Background] tabs.update error:', chrome.runtime.lastError.message);
          console.log('[GM Background] Focused window', wid, 'tab', tabId);
          sendResponse({ success: true });
        });
      } else {
        console.log('[GM Background] Minimized window', wid);
        sendResponse({ success: true });
      }
    });
  }

  if (windowId) {
    doIt(windowId);
  } else {
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError) {
        console.error('[GM Background] tabs.get error:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      doIt(tab.windowId);
    });
  }
}
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'registerGameTab') {
    if (sender.tab && sender.tab.id) {
      gameTabId = sender.tab.id;
      console.log('[GM Background] Game tab registered:', gameTabId);
    }
    sendResponse({registered: true});
    return true;

  } else if (request.action === 'gmHeartbeat') {
    if(window.__gmHealthBG) window.__gmHealthBG.setHeartbeat();
    sendResponse({ok: true});
    return true;

  } else if (request.action === 'gmHealthReload') {
    console.warn('[GM Background] Health reload request:', request.reason);
    if(window.__gmHealthBG) window.__gmHealthBG.reloadGameTab(request.reason||'health_request');
    sendResponse({ok: true});
    return true;

  } else if (request.action === 'getGameTabId') {
    // 回應 content script 的查詢
    sendResponse({tabId: gameTabId});
    return true;

  } else if (request.action === 'startMonitoring') {
    startMonitoring(request.tabId, sendResponse);
    return true;

  } else if (request.action === 'stopMonitoring') {
    stopMonitoring(sendResponse);
    return true;

  } else if (request.action === 'getPackets') {
    sendResponse({ packets: packets });
    return true;

  } else if (request.action === 'sendPacket') {
    chrome.tabs.sendMessage(request.tabId, { action: 'sendWS', data: request.data }, sendResponse);
    return true;

    } else if (request.action === 'minimizeGameWindow') {
    doWindowAction(sender, gameTabId, sendResponse, 'minimized');
    return true;

  } else if (request.action === 'focusGameWindow') {
    doWindowAction(sender, gameTabId, sendResponse, 'normal');
    return true;

  } else if (request.action === 'injectScript') {
    // 優先使用 caller 指定的 tabId，否則用快取的 gameTabId，否則用 sender.tab.id
    var targetTabId = request.tabId || gameTabId || (sender.tab && sender.tab.id);
    if (!targetTabId) {
      console.error('[GM Background] No tabId available for injection:', request.scriptName);
      sendResponse({success: false, error: 'No tabId'});
      return true;
    }
    console.log('[GM Background] Injecting', request.scriptName, 'into tab', targetTabId);
    injectScriptIntoMainWorld(request.scriptName, targetTabId, sendResponse);
    return true;
  }
});

function injectScriptIntoMainWorld(scriptName, tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: [scriptName],
    world: 'MAIN'
  }, function(results) {
    if (chrome.runtime.lastError) {
      console.error('[GM Background] Script injection failed:', chrome.runtime.lastError.message);
      callback({ success: false, error: chrome.runtime.lastError.message });
    } else {
      console.log('[GM Background] Script injected:', scriptName);
      callback({ success: true });
    }
  });
}

function startMonitoring(tabId, callback) {
  if (activeTabId) {
    stopMonitoring(null);
  }
  
  activeTabId = tabId;
  isMonitoring = true;
  packets = { send: [], receive: [] };
  
  chrome.debugger.attach({ tabId: tabId }, '1.3', function() {
    chrome.debugger.sendCommand({ tabId: tabId }, 'Network.enable', function() {
      chrome.debugger.sendCommand({ tabId: tabId }, 'Network.setRequestInterception', {
        patterns: [{ urlPattern: '*' }]
      }, function() {
        console.log('[GM Background] Debugging started');
        if (callback) callback(true);
      });
    });
  });
}

function stopMonitoring(callback) {
  if (activeTabId) {
    chrome.debugger.detach({ tabId: activeTabId }, function() {
      console.log('[GM Background] Debugging stopped');
      activeTabId = null;
      isMonitoring = false;
      if (callback) callback(true);
    });
  } else {
    if (callback) callback(true);
  }
}

// Handle WebSocket frames
chrome.debugger.onEvent.addListener(function(source, method, params) {
  if (!activeTabId) return;
  
  if (method === 'network.webSocketFrameSent') {
    if (params.requestId && params.response && params.response.payloadData) {
      packets.send.push({
        data: params.response.payloadData,
        time: Date.now()
      });
      console.log('[GM] WS SEND:', params.response.payloadData.substring(0, 100));
    }
  } else if (method === 'network.webSocketFrameReceived') {
    if (params.requestId && params.response && params.response.payloadData) {
      packets.receive.push({
        data: params.response.payloadData,
        time: Date.now()
      });
      console.log('[GM] WS RECEIVE:', params.response.payloadData.substring(0, 100));
    }
  }
});
