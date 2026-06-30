// popup.js
var isInjected = false;
var panelVisible = false;

function updateStatus(text) {
  document.getElementById('status').textContent = text;
}

function updateInjectButton() {
  var btn = document.getElementById('btnInject');
  if (isInjected) {
    btn.textContent = 'INJECTED ✓';
    btn.classList.add('on');
  } else {
    btn.textContent = 'INJECT MONITOR';
    btn.classList.remove('on');
  }
}

function updatePanelButton(visible) {
  var btn = document.getElementById('btnPanel');
  if (visible) {
    btn.textContent = 'HIDE PANEL';
    btn.classList.add('active');
  } else {
    btn.textContent = 'SHOW PANEL';
    btn.classList.remove('active');
  }
  panelVisible = visible;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'panelToggled') {
    updatePanelButton(request.visible);
    sendResponse(true);
  }
  return true;
});

document.getElementById('btnInject').addEventListener('click', function() {
  updateStatus('Injecting...');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      updateStatus('No tab!');
      return;
    }
    var tab = tabs[0];
    if (!tab.url || !tab.url.includes('linh5web.win')) {
      updateStatus('Not on game page!');
      return;
    }
    
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ['game-monitor.js', 'wb-boss.js', 'advanced-farming.js'],
      world: 'MAIN'
    }, function(results) {
      if (chrome.runtime.lastError) {
        updateStatus('Error: ' + chrome.runtime.lastError.message.substring(0,60));
      } else {
        isInjected = true;
        updateInjectButton();
        updateStatus('Injected OK!');
      }
    });
  });
});

document.getElementById('btnPanel').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) return;
    var tab = tabs[0];
    
    // Send message to toggle panel
    chrome.tabs.sendMessage(tab.id, {action: 'togglePanel'}, function(response) {
      if (chrome.runtime.lastError) {
        updateStatus('Error: ' + chrome.runtime.lastError.message.substring(0,40));
        return;
      }
      if (response !== undefined) {
        updatePanelButton(response.visible);
        updateStatus(response.visible ? 'Panel shown' : 'Panel hidden');
      }
    });
  });
});
