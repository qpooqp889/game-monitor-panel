// content.js - Runs automatically on game page
(function(){
if(window.__gmContentLoaded)return;
window.__gmContentLoaded=true;

window.__gmPanelVisible=false;

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if(request.action==='togglePanel'){
    togglePanel();
    sendResponse({visible: window.__gmPanelVisible});
  }
  return true;
});

// Listen for messages from game-monitor.js (MAIN world)
window.addEventListener('message',function(e){
  if(!e.data||!e.data.type)return;
  
  // Save settings
  if(e.data.type==='GM_SAVE_SETTINGS'&&e.data.data){
    chrome.storage.local.set({gmFarmSettings:e.data.data},function(){
      console.log('[GM] Settings saved');
    });
  }
  
  // Load settings
  if(e.data.type==='GM_LOAD_SETTINGS'){
    chrome.storage.local.get(['gmFarmSettings'],function(result){
      var data=result.gmFarmSettings||{};
      window.postMessage({type:'GM_LOAD_RESPONSE',data:data},'*');
    });
  }
  
  // Load advanced module (game-monitor.js asks us to inject it)
  // Use chrome.scripting.executeScript via background to avoid CSP violation
  if(e.data.type==='GM_LOAD_ADVANCED'&&e.data.src){
    var scriptName=e.data.src;
    console.log('[GM Content] Requesting',scriptName,'injection via background');
    // Send message to background to inject into MAIN world
    chrome.runtime.sendMessage({action:'injectScript',scriptName:scriptName},function(response){
      if(response&&response.success){
        console.log('[GM Content] '+scriptName+' injected via background');
        window.postMessage({type:'GM_ADVANCED_LOADED',src:scriptName},'*');
      } else {
        console.error('[GM Content] Failed to inject',scriptName,response);
      }
    });
  }
});

function togglePanel(){
  var el=document.getElementById('__gmp');
  if(el){
    el.remove();
    window.__gmPanelVisible=false;
  } else {
    // Delegate to game-monitor.js (MAIN world) to rebuild the new panel with tabs/farm/version
    document.dispatchEvent(new CustomEvent('__gm_show_panel'));
    window.__gmPanelVisible=true;
  }
}
})();
