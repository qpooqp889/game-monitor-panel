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
