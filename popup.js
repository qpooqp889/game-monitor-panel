// popup.js
var isMonitoring = false;
var currentTabId = null;

function updateUI(running) {
  isMonitoring = running;
  var btn = document.getElementById('btnStart');
  if (running) {
    btn.textContent = 'MONITORING';
    btn.classList.remove('off');
    btn.classList.add('on');
  } else {
    btn.textContent = 'START MONITOR';
    btn.classList.remove('on');
    btn.classList.add('off');
  }
}

function getCurrentTab(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      callback(tabs[0].id);
    } else {
      callback(null);
    }
  });
}

document.getElementById('btnStart').addEventListener('click', function() {
  getCurrentTab(function(tabId) {
    if (!tabId) {
      document.getElementById('status').textContent = 'No active tab!';
      return;
    }
    currentTabId = tabId;
    
    chrome.runtime.sendMessage({action: 'startMonitoring', tabId: tabId}, function(response) {
      if (response) {
        updateUI(true);
        document.getElementById('status').textContent = 'Monitor started!';
        
        // Start panel
        chrome.runtime.sendMessage({action: 'startPanel', tabId: tabId});
      } else {
        document.getElementById('status').textContent = 'Start failed!';
      }
    });
  });
});

document.getElementById('btnToggle').addEventListener('click', function() {
  getCurrentTab(function(tabId) {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, {action: 'togglePanel'}, function(response) {
      if (response !== undefined) {
        document.getElementById('status').textContent = response ? 'Panel ON' : 'Panel OFF';
        document.getElementById('btnToggle').classList.toggle('active', response);
      }
    });
  });
});

document.getElementById('btnReload').addEventListener('click', function() {
  getCurrentTab(function(tabId) {
    if (tabId) {
      chrome.tabs.reload(tabId);
      updateUI(false);
      document.getElementById('status').textContent = 'Reloading...';
    }
  });
});

// Poll for packet updates when monitoring
setInterval(function() {
  if (isMonitoring && currentTabId) {
    chrome.runtime.sendMessage({action: 'getPackets'}, function(response) {
      if (response && response.packets) {
        var total = response.packets.send.length + response.packets.receive.length;
        if (total > 0) {
          document.getElementById('status').textContent = 'RX:' + response.packets.receive.length + ' TX:' + response.packets.send.length;
        }
      }
    });
  }
}, 1000);
