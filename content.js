// content.js - Runs automatically on game page
(function(){
if(window.__gmContentLoaded)return;
window.__gmContentLoaded=true;

window.__gmPanelVisible=false;

// 緩存遊戲分頁 ID（background 回撥後更新）
var __gmGameTabId = null;

// 向 background 註冊自己
chrome.runtime.sendMessage({action:'registerGameTab'}, function(resp) {
  if (resp && resp.registered) {
    console.log('[GM Content] Game tab registered');
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({visible: window.__gmPanelVisible});
  } else if (request.action === 'tabIdInfo') {
    // background 回撥 actual tabId
    __gmGameTabId = request.tabId;
    sendResponse({ok: true});
  }
  return true;
});

// 來自 game-monitor.js 的 relay 請求（MAIN world → content → background）
window.addEventListener('message', function(e) {
  if (!e.data || !e.data.type) return;

  if (e.data.type === 'GM_SAVE_SETTINGS' && e.data.data) {
    chrome.storage.local.set({gmFarmSettings: e.data.data}, function() {
      console.log('[GM] Settings saved');
    });
    return;
  }

  if (e.data.type === 'GM_LOAD_SETTINGS') {
    chrome.storage.local.get(['gmFarmSettings'], function(result) {
      var data = result.gmFarmSettings || {};
      window.postMessage({type: 'GM_LOAD_RESPONSE', data: data}, '*');
    });
    return;
  }

  // 注入模組：game-monitor.js → content.js → background.js
  if (e.data.type === 'GM_LOAD_ADVANCED' && e.data.src) {
    var scriptName = e.data.src;
    console.log('[GM Content] Relaying', scriptName, 'injection to background');

    function doInject(tabId) {
      chrome.runtime.sendMessage(
        {action: 'injectScript', scriptName: scriptName, tabId: tabId},
        function(response) {
          if (response && response.success) {
            console.log('[GM Content] ' + scriptName + ' injected');
            window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
          } else {
            console.error('[GM Content] Failed to inject ' + scriptName, response);
            // Retry once after 500ms
            setTimeout(function() {
              chrome.runtime.sendMessage(
                {action: 'injectScript', scriptName: scriptName, tabId: tabId},
                function(resp2) {
                  if (resp2 && resp2.success) {
                    console.log('[GM Content] ' + scriptName + ' injected (retry)');
                    window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
                  } else {
                    console.error('[GM Content] Retry failed for ' + scriptName, resp2);
                  }
                }
              );
            }, 500);
          }
        }
      );
    }

    // 有快取的 tabId 就直接用，否則向 background 請求
    if (__gmGameTabId) {
      doInject(__gmGameTabId);
    } else {
      chrome.runtime.sendMessage({action: 'getGameTabId'}, function(info) {
        if (info && info.tabId) {
          __gmGameTabId = info.tabId;
          doInject(__gmGameTabId);
        } else {
          console.error('[GM Content] Cannot determine game tabId for injection');
        }
      });
    }
  }
});

function togglePanel() {
  var el = document.getElementById('__gmp');
  if (el) {
    el.remove();
    window.__gmPanelVisible = false;
  } else {
    document.dispatchEvent(new CustomEvent('__gm_show_panel'));
    window.__gmPanelVisible = true;
  }
}
})();
