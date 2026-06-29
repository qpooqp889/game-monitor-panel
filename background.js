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

// 當分頁 URL 更新時，檢查是否為遊戲分頁
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && /linh5web/i.test(tab.url)) {
    if (!gameTabId) {
      gameTabId = tabId;
      console.log('[GM Background] Game tab registered from onUpdated:', tabId);
    }
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'registerGameTab') {
    // 來自 content script：註冊遊戲分頁 ID
    if (sender.tab && sender.tab.id) {
      gameTabId = sender.tab.id;
      console.log('[GM Background] Game tab registered:', gameTabId);
    }
    sendResponse({registered: true});
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
