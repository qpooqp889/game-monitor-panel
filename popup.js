// popup.js
var isMonitoring = false;

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

function sendToTab(action, callback) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || tabs.length === 0) {
      document.getElementById('status').textContent = 'No tabs!';
      return;
    }
    var tab = tabs[0];
    document.getElementById('status').textContent = 'Tab: ' + tab.url.substring(0, 30) + '...';
    
    chrome.tabs.sendMessage(tab.id, action, function(response) {
      if (chrome.runtime.lastError) {
        document.getElementById('status').textContent = 'Error: ' + chrome.runtime.lastError.message.substring(0, 40);
        return;
      }
      if (callback) callback(response);
    });
  });
}

document.getElementById('btnStart').addEventListener('click', function() {
  sendToTab({action: 'startMonitoring'}, function(response) {
    if (response) {
      updateUI(true);
      document.getElementById('status').textContent = 'Monitor started!';
    }
  });
});

document.getElementById('btnToggle').addEventListener('click', function() {
  sendToTab({action: 'togglePanel'}, function(response) {
    if (response !== undefined) {
      document.getElementById('status').textContent = response ? 'Panel ON' : 'Panel OFF';
      document.getElementById('btnToggle').classList.toggle('active', response);
    }
  });
});

document.getElementById('btnReload').addEventListener('click', function() {
  chrome.tabs.reload();
  updateUI(false);
  document.getElementById('status').textContent = 'Reloading...';
});

// Check current status on load
setTimeout(function() {
  sendToTab({action: 'checkStatus'}, function(response) {
    if (response) {
      if (response.monitoring) updateUI(true);
      if (response.panelExists) {
        document.getElementById('status').textContent = 'Ready!';
        document.getElementById('btnToggle').classList.add('active');
      }
    }
  });
}, 500);
