// popup.js
document.getElementById('btnToggle').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'togglePanel'}, function(response) {
      document.getElementById('status').textContent = response ? 'Panel ON' : 'Panel OFF';
      document.getElementById('btnToggle').textContent = response ? 'OFF' : 'ON';
      document.getElementById('btnToggle').classList.toggle('active', response);
    });
  });
});

document.getElementById('btnReload').addEventListener('click', function() {
  chrome.tabs.reload();
  document.getElementById('status').textContent = 'Reloading...';
});

// Check panel status
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  chrome.tabs.sendMessage(tabs[0].id, {action: 'checkStatus'}, function(response) {
    if (response && response.panelExists) {
      document.getElementById('status').textContent = 'Status: ON';
      document.getElementById('btnToggle').textContent = 'OFF';
      document.getElementById('btnToggle').classList.add('active');
    } else {
      document.getElementById('status').textContent = 'Status: OFF';
    }
  });
});
