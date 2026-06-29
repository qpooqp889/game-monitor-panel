// content.js - Runs automatically on game page
(function(){
if(window.__gmContentLoaded)return;
window.__gmContentLoaded=true;

window.__gmPanelVisible=false;

// 遊戲分頁 ID（盡早向 background 請求並快取）
var __gmGameTabId = null;

// Pending injection requests (queued before tabId is known)
var __gmPendingInjections = [];

// 向 background 註冊自己並取得自己的 tabId
chrome.runtime.sendMessage({action:'registerGameTab'}, function(resp) {
  if (resp && resp.registered) {
    console.log('[GM Content] Game tab registered');
  }
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
    console.log('[GM Content] Relaying', scriptName, 'injection request');

    function doInject(tabId) {
      chrome.runtime.sendMessage(
        {action: 'injectScript', scriptName: scriptName, tabId: tabId},
        function(response) {
          if (response && response.success) {
            console.log('[GM Content] ' + scriptName + ' injected');
            window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
          } else {
            console.error('[GM Content] Failed to inject ' + scriptName, response && response.error);
            // Retry once after 800ms
            setTimeout(function() {
              chrome.runtime.sendMessage(
                {action: 'injectScript', scriptName: scriptName, tabId: tabId},
                function(resp2) {
                  if (resp2 && resp2.success) {
                    console.log('[GM Content] ' + scriptName + ' injected (retry)');
                    window.postMessage({type: 'GM_ADVANCED_LOADED', src: scriptName}, '*');
                  } else {
                    console.error('[GM Content] Retry failed for ' + scriptName, resp2 && resp2.error);
                  }
                }
              );
            }, 800);
          }
        }
      );
    }

    // 立即嘗試讀取快取（registerGameTab 的 callback 已經更新了 __gmGameTabId）
    if (__gmGameTabId) {
      doInject(__gmGameTabId);
    } else {
      // 還不知道 tabId：向 background 查詢，等回應後再注射
      chrome.runtime.sendMessage({action: 'getGameTabId'}, function(info) {
        if (info && info.tabId) {
          __gmGameTabId = info.tabId;
          doInject(__gmGameTabId);
        } else {
          console.error('[GM Content] Cannot determine game tabId — game tab may not be registered yet. Retry later.');
        }
      });
    }
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'togglePanel') {
    togglePanel();
    sendResponse({visible: window.__gmPanelVisible});
  } else if (request.action === 'tabIdInfo') {
    __gmGameTabId = request.tabId;
    sendResponse({ok: true});
  }
  return true;
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
