var ZONE_NAME_LOOKUP=buildZoneNameLookup();

// ===== Send Functions (FIXED - use Socket.IO emit) =====
function sendZone(zoneId){
  // Use Socket.IO emit (correct binary protocol)
  if(window.__wbSocket && window.__wbSocket.connected){
    window.__wbSocket.emit('setZone', zoneId);
    console.log('[GM] Teleport (SIO):', zoneId);
  } else if(window.__ws){
    // Fallback: try raw WebSocket (may not work)
    window.__ws.send('42["setZone","'+zoneId+'"]');
    console.log('[GM] Teleport (WS fallback):', zoneId);
  } else {
    console.log('[GM] ERROR: No socket to send teleport!');
  }
}

function sendCmd(cmd){
  if(window.__wbSocket && window.__wbSocket.connected){
    window.__wbSocket.emit(cmd);
    console.log('[GM] Cmd (SIO):', cmd);
  } else if(window.__ws){
    window.__ws.send('42["'+cmd+'"]');
    console.log('[GM] Cmd (WS):', cmd);
  }
}
