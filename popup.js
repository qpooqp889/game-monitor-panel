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
    if (!tabs || !tabs[0] || !tabs[0].id) {
      document.getElementById('status').textContent = 'No active tab!';
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, action, function(response) {
      if (chrome.runtime.lastError) {
        document.getElementById('status').textContent = 'Not on game page!';
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

// Check current status
sendToTab({action: 'checkStatus'}, function(response) {
  if (response) {
    if (response.monitoring) updateUI(true);
    if (response.panelExists) {
      document.getElementById('status').textContent = 'Ready!';
      document.getElementById('btnToggle').classList.add('active');
    }
  }
});
