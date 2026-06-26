// content.js - Panel only (injection is done via executeScript from popup)
(function() {
  'use strict';
  
  var panelUpdateInterval = null;
  var isPanelOpen = false;
  
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'togglePanel') {
      if (isPanelOpen) {
        var panel = document.getElementById('__gm_display');
        if (panel) panel.remove();
        isPanelOpen = false;
        if (panelUpdateInterval) clearInterval(panelUpdateInterval);
        sendResponse(false);
      } else {
        // Panel is handled by the injected code
        sendResponse(true);
      }
    } else if (request.action === 'checkInjected') {
      sendResponse({ injected: !!window.__gmInjected });
    }
    return true;
  });
  
  console.log('[GM] Content script ready');
})();
