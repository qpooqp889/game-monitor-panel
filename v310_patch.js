var fs = require('fs');
var gm = fs.readFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/game-monitor.js', 'utf8');
var wb = fs.readFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/wb-boss.js', 'utf8');

// ====== 1. game-monitor.js HTML: Remove auto_script checkbox, merge status into auto_enable ======
var scriptBlock = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);border-radius:6px;\">'+'<input type=\"checkbox\" id=\"__gmp_boss_auto_script\" style=\"width:16px;height:16px;cursor:pointer;\">'+'<label for=\"__gmp_boss_auto_script\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\uD83C\\uDFAF \\u81EA\\u52D5BOSS\\u811A\\u672C</label>'+'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;\">\\u00B7 \\u9592\\u7F6E\\u4E2D</span>'+'</div>'+";
if (gm.indexOf(scriptBlock) >= 0) {
  gm = gm.replace(scriptBlock, '');
  console.log('Removed auto_script checkbox HTML');
} else {
  console.log('WARN: auto_script checkbox HTML not found');
}

// Merge: add __gmp_boss_script_status into the auto_enable row
var oldEnableRow = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;\">'+'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F \\u81EA\\u52D5BOSS</label>'+'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">\\u505C\\u6B62\\u4E2D</span>'+'<div style=\"flex:1;\"></div>'+'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 \\u9032\\u968E\\u8A2D\\u5B9A</button>'+'</div>'+";

var newEnableRow = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F \\u81EA\\u52D5BOSS</label>'+'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">\\u505C\\u6B62\\u4E2D</span>'+'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 \\u9592\\u7F6E\\u4E2D</span>'+'<div style=\"flex:1;\"></div>'+'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 \\u9032\\u968E\\u8A2D\\u5B9A</button>'+'</div>'+";

if (gm.indexOf(oldEnableRow) >= 0) {
  gm = gm.replace(oldEnableRow, newEnableRow);
  console.log('Merged enable row');
} else {
  console.log('WARN: old enable row not found, searching...');
  // Try to find parts of it
  var idx = gm.indexOf('__gmp_boss_auto_enable');
  if (idx > 0) console.log('Found __gmp_boss_auto_enable at', idx, 'context:', gm.substring(idx-50, idx+100));
}

// ====== 2. game-monitor.js: Merge onchange handler ======
var oldHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25A0 \\u505C\\u6B62\\u81EA\\u52D5BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25B6 \\u555F\\u52D5\\u81EA\\u52D5BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u505C\\u6B62\\u4E2D';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u505C\\u6B62\\u4E2D';ss.style.color='#888';}}}";

var newHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25A0 \\u505C\\u6B62\\u81EA\\u52D5BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25B6 \\u555F\\u52D5\\u81EA\\u52D5BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u505C\\u6B62\\u4E2D';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u505C\\u6B62\\u4E2D';ss.style.color='#888';}}}";

if (gm.indexOf(oldHandler) >= 0) {
  gm = gm.replace(oldHandler, newHandler);
  console.log('Merged onchange handler');
} else {
  console.log('WARN: old handler not found');
}

// ====== 3. game-monitor.js: Remove auto_script onchange handler + save/load functions ======
var autoScriptHandlerBlock = "__gmp_boss_auto_script').onchange=function(){if(this.checked){__wbBossAutoScriptStart();}else{__wbBossAutoScriptStop();}__wbSaveBossAutoScriptState();};function __wbSaveBossAutoScriptState(){if(typeof window.__gmStorageSet==='undefined')return;var chk=document.getElementById('__gmp_boss_auto_script');window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});}function __wbLoadBossAutoScriptState(){if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){var s=r&&r.wb_auto_script_state||null;if(s){var chk=document.getElementById('__gmp_boss_auto_script');if(chk)chk.checked=s.enabled;if(s.enabled)setTimeout(__wbBossAutoScriptStart,800);}}).catch(function(){});}setTimeout(__wbLoadBossAutoScriptState,500);";

// There might be two copies (duplicate from v3.09 edit), remove all occurrences
var count = 0;
while (gm.indexOf(autoScriptHandlerBlock) >= 0) {
  gm = gm.replace(autoScriptHandlerBlock, '');
  count++;
}
console.log('Removed auto_script handler block ' + count + ' time(s)');

// Also try shorter version without the setTimeout
var shortBlock = "setTimeout(__wbLoadBossAutoScriptState,500);";
// This might appear separately - remove any remaining auto_script handlers
var remainIdx = gm.indexOf("__gmp_boss_auto_script");
if (remainIdx >= 0) console.log('WARN: remaining auto_script handler at', remainIdx);

// ====== 4. wb-boss.js: Replace all __gmp_boss_auto_script refs with __gmp_boss_auto_enable ======
wb = wb.replace(/document\.getElementById\('__gmp_boss_auto_script'\)/g, "document.getElementById('__gmp_boss_auto_enable')");
console.log('Replaced auto_script refs in wb');

// ====== 5. wb-boss.js: Add boss enter log function ======
var logFn = "\nfunction __wbAddBossScriptLog(msg){\n" +
  "try{\n" +
  "var el=document.getElementById('__gmp_boss_script_log');\n" +
  "if(!el)return;\n" +
  "var ts=new Date();\n" +
  "var t=ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')+':'+ts.getSeconds().toString().padStart(2,'0');\n" +
  "var div=document.createElement('div');\n" +
  "div.style.cssText='font-size:9px;color:#aaa;padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03);';\n" +
  "div.textContent='['+t+'] '+msg;\n" +
  "el.appendChild(div);\n" +
  "el.scrollTop=el.scrollHeight;\n" +
  "if(el.children.length>50)el.removeChild(el.firstChild);\n" +
  "}catch(e){}\n" +
  "}\n\n";

var insertPoint = wb.indexOf('function __wbBossAutoScriptRestoreFarm');
if (insertPoint > 0) {
  wb = wb.slice(0, insertPoint) + logFn + wb.slice(insertPoint);
  console.log('Added log function');
} else {
  console.log('WARN: insert point (RestoreFarm) not found');
}

// ====== 6. wb-boss.js: Add __wbAddBossScriptLog calls ======
var oldEnter1 = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\n      window.__wbBossAutoScript.phase='entering';\n      try{foundBoss.click();}catch(e){}";
var newEnter1 = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\n      __wbAddBossScriptLog('\u9032\u5165\u4E16\u754C\u738B: '+target.name);\n      window.__wbBossAutoScript.phase='entering';\n      try{foundBoss.click();}catch(e){}";
if (wb.indexOf(oldEnter1) >= 0) {
  wb = wb.replace(oldEnter1, newEnter1);
  console.log('Added enter log #1');
} else {
  console.log('WARN: enter log #1 not found');
}

// Add log line after foundBoss.click() in __wbBossAutoScriptReturnToBoss
var oldEnter2 = "try{foundBoss.click();}catch(e){}\n      window.__wbBossAutoScript.phase='attacking';";
var newEnter2 = "try{foundBoss.click();}catch(e){}\n      __wbAddBossScriptLog('\u91CD\u751F\u9032\u5165\u4E16\u754C\u738B: '+target.name);\n      window.__wbBossAutoScript.phase='attacking';";
if (wb.indexOf(oldEnter2) >= 0) {
  wb = wb.replace(oldEnter2, newEnter2);
  console.log('Added enter log #2 (respawn)');
} else {
  console.log('WARN: enter log #2 not found');
}

// Also log when boss dead
var oldDeadLog = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
var newDeadLog = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');\n      __wbAddBossScriptLog('\u64CA\u6557 '+target.name+', \u91CD\u751F\u4E2D');";
if (wb.indexOf(oldDeadLog) >= 0) {
  wb = wb.replace(oldDeadLog, newDeadLog);
  console.log('Added defeated log');
}

// ====== 7. game-monitor.js: Add log HTML area to Boss tab ======
var logAreaHtml = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'"+
"'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 \\u81EA\\u52D5BOSS\\u65E5\\u8A8C</div>'"+
"'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'"+
"'</div>'+";

// Find the end of hunt list container. Insert log area before cooldown section
var coldStart = gm.indexOf("\\u51B7\\u537B\\u8A08\\u6642");
if (coldStart > 0) {
  // Find the preceding '</div>'+ 
  var beforeCold = gm.lastIndexOf("'</div>'+", coldStart);
  if (beforeCold > 0) {
    gm = gm.slice(0, beforeCold + 13) + logAreaHtml + gm.slice(beforeCold + 13);
    console.log('Added log HTML area');
  }
}

// ====== 8. game-monitor.js: Add ▲▼ buttons for hunt list ======
var huntBtnHtml = 
  "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'"+
  "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 \\u4E0A\\u79FB</button>'"+
  "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC \\u4E0B\\u79FB</button>'"+
  "'</div>'+";

// Insert after the hunt list wrapper div closes, before the next section
// Find the sequence: hunt_list close + wrapper close 
var huntListEnd = gm.indexOf("\\u51B7\\u537B\\u8A08\\u6642");
if (huntListEnd > 0) {
  // Find the end of the hunt-toggle-wrapper and the preceding wrapper close
  var huntToggleEnd = gm.lastIndexOf("'</div>'+", gm.indexOf('__gmp_hunt_toggle')+200);
  if (huntToggleEnd > 0) {
    var markAfter = gm.indexOf("'</div>'+", huntToggleEnd + 10);
    if (markAfter > 0 && markAfter < huntListEnd) {
      gm = gm.slice(0, markAfter + 13) + huntBtnHtml + gm.slice(markAfter + 13);
      console.log('Added ▲▼ buttons');
    }
  }
}

// ====== 9. game-monitor.js: Add ▲▼ button handlers near other handlers ======
// Find the handler init section around __gmp_boss_auto_enable handler
var handlerSection = gm.indexOf('__gmp_boss_auto_config_btn') + 20; var nextClick = gm.indexOf('.onclick', handlerSection); if(nextClick>0) handlerSection=nextClick-50;
if (handlerSection > 0) {
  var huntBtnHandler = "\n  // === Hunt list ▲▼ buttons ===\n  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};\n  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};\n";
  gm = gm.slice(0, handlerSection) + huntBtnHandler + gm.slice(handlerSection);
  console.log('Added ▲▼ button handlers');
}

// ====== 10. gm: Find and update __wbUpdateHuntListUI to support selection ======
// This is in wb-boss.js, not gm. The current code already has ▲▼ per-item.
// We need to add a selection mechanism and the move_selected functions.
// Add selectedHuntId to wb-boss.js
var wbStateIdx = wb.indexOf("window.__wbBossAutoScript={");
if (wbStateIdx > 0) {
  // Add selectedHuntId variable before the state
  var selVar = "\n// Selected hunt item for ▲▼ buttons\nvar __wbSelectedHuntId=null;\n\nfunction __wbMoveSelectedHuntItem(dir){\n  __wbGetHuntList(function(list){\n    var selIdx=-1;\n    if(__wbSelectedHuntId){\n      selIdx=list.findIndex(function(i){return i.id===__wbSelectedHuntId;});\n    }\n    if(selIdx<0){\n      // No selection or expired, try to select first\n      if(list.length){\n        __wbSelectedHuntId=list[0].id;\n        __wbUpdateHuntListUI();\n      }\n      return;\n    }\n    var newIdx=selIdx+dir;\n    if(newIdx<0||newIdx>=list.length)return;\n    var tmp=list[selIdx];\n    list[selIdx]=list[newIdx];\n    list[newIdx]=tmp;\n    __wbSelectedHuntId=list[newIdx].id;\n    __wbSaveHuntList(list,function(){\n      __wbUpdateHuntListUI();\n      __wbUpdateWorldBossUI();\n    });\n  });\n}\n\n";
  wb = wb.slice(0, wbStateIdx) + selVar + wb.slice(wbStateIdx);
  console.log('Added __wbMoveSelectedHuntItem + __wbSelectedHuntId');
}

// Update __wbUpdateHuntListUI to add click-to-select
var oldUIFn = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var upBtn=idx>0?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',-1)\">\\u25B2</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\\u25B2</span>';var dnBtn=idx<list.length-1?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',1)\">\\u25BC</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\\u25BC</span>';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;\">'+upBtn+dnBtn+'<span style=\"font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;\" onclick=\"__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738b [+ ] \\u52a0\\u5165</div>';}});}";

var newUIFn = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738b [+ ] \\u52a0\\u5165</div>';}});}";

if (wb.indexOf(oldUIFn) >= 0) {
  wb = wb.replace(oldUIFn, newUIFn);
  console.log('Updated __wbUpdateHuntListUI with selection');
} else {
  console.log('WARN: old __wbUpdateHuntListUI not found, trying partial match');
  var partialIdx = wb.indexOf('__wbUpdateHuntListUI');
  if (partialIdx >= 0) console.log('Found at', partialIdx, wb.substring(partialIdx, partialIdx+60));
}

// Add __wbSelectHuntItem function
var selectFn = "\nfunction __wbSelectHuntItem(id){\n  __wbSelectedHuntId=id;\n  __wbUpdateHuntListUI();\n}\n";
// Add it before the main script functions
var sioHookIdx = wb.indexOf("__wbBossEmitLog");
if (sioHookIdx > 0) {
  wb = wb.slice(0, sioHookIdx) + selectFn + wb.slice(sioHookIdx);
  console.log('Added __wbSelectHuntItem function');
}

// ====== Write ======
fs.writeFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/game-monitor.js', gm, 'utf8');
fs.writeFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/wb-boss.js', wb, 'utf8');
console.log('Files written');

// Validate
try { new Function(gm); console.log('gm OK:', gm.length+'b'); } catch(e) { console.log('gm FAIL:', e.message); }
try { new Function(wb); console.log('wb OK:', wb.length+'b'); } catch(e) { console.log('wb FAIL:', e.message); }
