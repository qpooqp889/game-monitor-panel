// background.js - Chrome Debugger for WebSocket monitoring
var activeTabId = null;
var isMonitoring = false;
var packets = { send: [], receive: [] };

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'startMonitoring') {
    startMonitoring(request.tabId, sendResponse);
    return true;
  } else if (request.action === 'stopMonitoring') {
    stopMonitoring(sendResponse);
    return true;
  } else if (request.action === 'getPackets') {
    sendResponse({ packets: packets });
    return true;
  } else if (request.action === 'sendPacket') {
    // Forward packet to content script
    chrome.tabs.sendMessage(request.tabId, { action: 'sendWS', data: request.data }, sendResponse);
    return true;
  }
});

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
