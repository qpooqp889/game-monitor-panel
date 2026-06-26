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

document.getElementById('btnStart').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'startMonitoring'}, function(response) {
      if (response) {
        updateUI(true);
        document.getElementById('status').textContent = 'Monitor started!';
      } else {
        updateUI(false);
        document.getElementById('status').textContent = 'Start failed!';
      }
    });
  });
});

document.getElementById('btnToggle').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePanel'}, function(response) {
      document.getElementById('status').textContent = response ? 'Panel ON' : 'Panel OFF';
      document.getElementById('btnToggle').classList.toggle('active', response);
    });
  });
});

document.getElementById('btnReload').addEventListener('click', function() {
  chrome.tabs.reload();
  updateUI(false);
  document.getElementById('status').textContent = 'Reloading...';
});

// Check current status
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  chrome.tabs.sendMessage(tabs[0].id, {action: 'checkStatus'}, function(response) {
    if (response) {
      if (response.monitoring) updateUI(true);
      if (response.panelExists) {
        document.getElementById('status').textContent = 'Ready!';
        document.getElementById('btnToggle').classList.add('active');
      }
    }
  });
});
