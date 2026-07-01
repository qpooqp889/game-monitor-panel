// ============================================================================
// v3.10 - Merge auto/script checkbox + hunt list ▲▼ outer buttons + log area
// ============================================================================
var fs = require('fs');
var BASE = 'C:/Users/steve/Documents/chrome\u63D2\u4EF6/game-monitor-panel_v3';
// Use short path as fallback
var GMP = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3';

function loadp(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch(e) { }
  try { return fs.readFileSync(p.replace(BASE, GMP), 'utf8'); } catch(e2) { }
  throw new Error('Cannot load: ' + p);
}
function savep(p, c) {
  try { fs.writeFileSync(p, c, 'utf8'); } catch(e) {
    fs.writeFileSync(p.replace(BASE, GMP), c, 'utf8');
  }
}

var gm = loadp(BASE + '/game-monitor.js');
var wb = loadp(BASE + '/wb-boss.js');

// ---- Helper: replace first occurrence ----
function replaceFirst(src, oldStr, newStr) {
  var idx = src.indexOf(oldStr);
  if (idx < 0) return null;
  return src.substring(0, idx) + newStr + src.substring(idx + oldStr.length);
}

function replaceAll(src, oldStr, newStr, label) {
  var count = 0;
  while (src.indexOf(oldStr) >= 0) {
    src = replaceFirst(src, oldStr, newStr);
    count++;
  }
  if (count > 0) console.log(label + ': replaced ' + count + ' time(s)');
  else console.log('WARN: ' + label + ' - not found');
  return src;
}

// ======================================================================
// 1. REMOVE auto_script checkbox HTML from game-monitor.js
// ======================================================================
var scriptCheckbox = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);border-radius:6px;\">'+\n'<input type=\"checkbox\" id=\"__gmp_boss_auto_script\" style=\"width:16px;height:16px;cursor:pointer;\">'+\n'<label for=\"__gmp_boss_auto_script\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\uD83C\\uDFAF \\u81EA\\u52D5BOSS\\u811A\\u672C</label>'+\n'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;\">\\u00B7 \\u9592\\u7F6E\\u4E2D</span>'+\n'</div>'+\n";

if (gm.indexOf(scriptCheckbox) >= 0) {
  gm = gm.replace(scriptCheckbox, '');
  console.log('(1) Removed auto_script checkbox HTML');
} else {
  // Try without last newline
  var alt = scriptCheckbox.replace(/\n$/, '');
  if (gm.indexOf(alt) >= 0) {
    gm = gm.replace(alt, '');
    console.log('(1) Removed auto_script checkbox HTML (no-trailing-newline variant)');
  } else {
    console.log('(1) WARN: auto_script checkbox HTML NOT FOUND');
    // Show context to debug
    var idx = gm.indexOf('__gmp_boss_auto_script');
    if (idx > 0) {
      console.log('  Found at: ' + idx);
      console.log('  Context: ' + gm.substring(idx - 50, idx + 200).replace(/\n/g, '\\n'));
    }
  }
}

// ======================================================================
// 2. MODIFY enable row: add status span, change color scheme
// ======================================================================
var oldEnableRow = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;\">'+\n'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+\n'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F \\u81EA\\u52D5BOSS</label>'+\n'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">\\u505C\\u6B62\\u4E2D</span>'+\n'<div style=\"flex:1;\"></div>'+\n'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 \\u9032\\u968E\\u8A2D\\u5B9A</button>'+\n'</div>'+\n";

var newEnableRow = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+\n'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+\n'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F \\u81EA\\u52D5BOSS \\u81EA\\u52D5\\u811A\\u672C</label>'+\n'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">\\u505C\\u6B62\\u4E2D</span>'+\n'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 \\u9592\\u7F6E\\u4E2D</span>'+\n'<div style=\"flex:1;\"></div>'+\n'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 \\u9032\\u968E\\u8A2D\\u5B9A</button>'+\n'</div>'+\n";

if (gm.indexOf(oldEnableRow) >= 0) {
  gm = gm.replace(oldEnableRow, newEnableRow);
  console.log('(2) Merged enable row (added status span, changed color)');
} else {
  console.log('(2) WARN: enable row NOT FOUND');
  var idx = gm.indexOf('__gmp_boss_auto_enable');
  if (idx > 0) {
    console.log('  Found at: ' + idx);
    console.log('  Context: ' + gm.substring(idx - 30, idx + 300).replace(/\n/g, '\\n'));
  }
}

// ======================================================================
// 3. Update enable onchange handler (add __wbBossAutoScriptStart/Stop calls)
// ======================================================================
var oldHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25A0 \\u505C\\u6B62\\u81EA\\u52D5BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25B6 \\u555F\\u52D5\\u81EA\\u52D5BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u505C\\u6B62\\u4E2D';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u505C\\u6B62\\u4E2D';ss.style.color='#888';}}}";

var newHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25A0 \\u505C\\u6B62\\u81EA\\u52D5BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u26A1 \\u81EA\\u52D5BOSS\\u8DD1\\u884C\\u4E2D...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\\u25B6 \\u555F\\u52D5\\u81EA\\u52D5BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\\u505C\\u6B62\\u4E2D';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\\u505C\\u6B62\\u4E2D';ss.style.color='#888';}}}";

gm = replaceAll(gm, oldHandler, newHandler, '(3) Merged enable handler');

// ======================================================================
// 4. Remove auto_script onchange handler block + save/load functions
// ======================================================================
// There's a block: __gmp_boss_auto_script').onchange=... save/load... setTimeout(...)
// This appears twice (duplicate from v3.09)
var handlerBlock = "__gmp_boss_auto_script').onchange=function(){if(this.checked){__wbBossAutoScriptStart();}else{__wbBossAutoScriptStop();}__wbSaveBossAutoScriptState();};function __wbSaveBossAutoScriptState(){if(typeof window.__gmStorageSet==='undefined')return;var chk=document.getElementById('__gmp_boss_auto_script');window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});}function __wbLoadBossAutoScriptState(){if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){var s=r&&r.wb_auto_script_state||null;if(s){var chk=document.getElementById('__gmp_boss_auto_script');if(chk)chk.checked=s.enabled;if(s.enabled)setTimeout(__wbBossAutoScriptStart,800);}}).catch(function(){});}setTimeout(__wbLoadBossAutoScriptState,500);";

var removed = 0;
while (gm.indexOf(handlerBlock) >= 0) {
  gm = gm.replace(handlerBlock, '');
  removed++;
}
console.log('(4) Removed auto_script handler+save/load block: ' + removed + ' time(s)');

// ======================================================================
// 5. Replace auto_script refs in wb-boss.js
// ======================================================================
wb = replaceAll(wb, "document.getElementById('__gmp_boss_auto_script')",
  "document.getElementById('__gmp_boss_auto_enable')",
  '(5) Replaced auto_script refs in wb');

// ======================================================================
// 6. Add __wbAddBossScriptLog function to wb-boss.js
// ======================================================================
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

var restoreFarmIdx = wb.indexOf('function __wbBossAutoScriptRestoreFarm');
if (restoreFarmIdx > 0) {
  wb = wb.substring(0, restoreFarmIdx) + logFn + wb.substring(restoreFarmIdx);
  console.log('(6) Added __wbAddBossScriptLog function');
} else {
  console.log('(6) WARN: insert point (RestoreFarm) not found');
}

// ======================================================================
// 7. Add log calls in wb-boss.js
// ======================================================================
// In __wbBossAutoScriptCheckBoss: after 'is ALIVE, entering...'
var oldEnter1 = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\n      window.__wbBossAutoScript.phase='entering';\n      try{foundBoss.click();}catch(e){}";
var newEnter1 = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\n      __wbAddBossScriptLog('\u9032\u5165\u4E16\u754C\u738B: '+target.name);\n      window.__wbBossAutoScript.phase='entering';\n      try{foundBoss.click();}catch(e){}";
wb = replaceAll(wb, oldEnter1, newEnter1, '(7a) Enter log (check)');

// In __wbBossAutoScriptReturnToBoss: after foundBoss.click
var oldEnter2 = "try{foundBoss.click();}catch(e){}\n      window.__wbBossAutoScript.phase='attacking';";
var newEnter2 = "try{foundBoss.click();}catch(e){}\n      __wbAddBossScriptLog('\u91CD\u751F\u9032\u5165: '+target.name);\n      window.__wbBossAutoScript.phase='attacking';";
wb = replaceAll(wb, oldEnter2, newEnter2, '(7b) Enter log (respawn)');

// Defeated log
var oldDeadLog = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
var newDeadLog = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');\n      __wbAddBossScriptLog('\u64CA\u6557 '+target.name+', \u91CD\u751F\u4E2D');";
wb = replaceAll(wb, oldDeadLog, newDeadLog, '(7c) Defeated log');

// ======================================================================
// 8. Add log HTML area to game-monitor.js Boss tab
// ======================================================================
var logAreaHtml = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+\n" +
  "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 \\u81EA\\u52D5BOSS\\u65E5\\u8A8C</div>'+\n" +
  "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+\n" +
  "'</div>'+\n";

// Insert before cooldown section: insert after '</div>'+ that precedes '// === 冷卻計時 ==='
var coldMarker = "// === \\u51B7\\u537B\\u8A08\\u6642 ===";
var coldIdx = gm.indexOf(coldMarker);
if (coldIdx > 0) {
  // Find the preceding '</div>'+ 
  var beforeCold = gm.lastIndexOf("'</div>'+\n", coldIdx);
  if (beforeCold < 0) beforeCold = gm.lastIndexOf("'</div>'+\r\n", coldIdx);
  if (beforeCold > 0) {
    var afterClose = beforeCold + "'</div>'+\n".length;
    if (gm.substring(afterClose - 2, afterClose) === "'+") {
      // Already has the closing, insert after
    }
    gm = gm.substring(0, beforeCold) + "'</div>'+\n" + logAreaHtml + gm.substring(beforeCold + "'</div>'+\n".length);
    console.log('(8) Added log HTML area');
  } else {
    console.log('(8) WARN: could not find insertion point before cooldown');
  }
} else {
  console.log('(8) WARN: cooldown section not found');
}

// ======================================================================
// 9. Add ▲▼ buttons after hunt list body
// ======================================================================
var huntBtnHtml =
  "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+\n" +
  "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 \\u4E0A\\u79FB</button>'+\n" +
  "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC \\u4E0B\\u79FB</button>'+\n" +
  "'</div>'+\n";

// Find the hunt body close + wrapper close, insert buttons before wrapper close
var huntBodyClose = "__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px;\">'+\n        '<div id=\"__gmp_hunt_list\" style=\"font-size:10px;color:#555;padding:6px;text-align:center;\">\\u70B9\\u9009\\u4E0A\\u65B9\\u4E16\\u754C\\u738B [+] \\u52A0\\u5165</div>'+\n      '</div>'+\n    '</div>'+\n";

var bodyCloseIdx = gm.indexOf(huntBodyClose);
if (bodyCloseIdx > 0) {
  // Insert buttons before the last '</div>'+ (which closes the hunt container)
  // The pattern ends with '</div>'+\n - we want to insert BEFORE that last line
  var lastClose = gm.lastIndexOf("'</div>'+\n", bodyCloseIdx + huntBodyClose.length);
  if (lastClose > 0) {
    gm = gm.substring(0, lastClose) + huntBtnHtml + gm.substring(lastClose);
    console.log('(9) Added hunt ▲▼ buttons');
  } else {
    console.log('(9) WARN: last close div not found');
  }
} else {
  console.log('(9) WARN: hunt body close not found');
}

// ======================================================================
// 9b. Add ▲▼ button handlers near auto_config_btn handler
// ======================================================================
var configBtnRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
var cbidx = gm.indexOf(configBtnRef);
if (cbidx > 0) {
  var huntBtnHandler = "\n  // === Hunt list ▲▼ buttons ===\n  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};\n  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};\n";
  gm = gm.substring(0, cbidx) + huntBtnHandler + gm.substring(cbidx);
  console.log('(9b) Added ▲▼ button handlers');
} else {
  console.log('(9b) WARN: config btn handler not found');
}

// ======================================================================
// 10. Add __wbSelectedHuntId, __wbSelectHuntItem, __wbMoveSelectedHuntItem to wb-boss.js
// ======================================================================
// Add variables and functions before __wbBossAutoScript state object
var stateRef = "window.__wbBossAutoScript=";
var stateIdx = wb.indexOf(stateRef);
if (stateIdx > 0) {
  var selCode = "\n// Selected hunt item for outer ▲▼ buttons\nwindow.__wbSelectedHuntId=null;\n\n" +
  "function __wbSelectHuntItem(id){\n" +
  "  window.__wbSelectedHuntId=id;\n" +
  "  __wbUpdateHuntListUI();\n" +
  "}\n\n" +
  "function __wbMoveSelectedHuntItem(dir){\n" +
  "  __wbGetHuntList(function(list){\n" +
  "    var selIdx=-1;\n" +
  "    if(window.__wbSelectedHuntId){\n" +
  "      selIdx=list.findIndex(function(i){return i.id===window.__wbSelectedHuntId;});\n" +
  "    }\n" +
  "    if(selIdx<0){\n" +
  "      if(list.length){\n" +
  "        window.__wbSelectedHuntId=list[0].id;\n" +
  "        __wbUpdateHuntListUI();\n" +
  "      }\n" +
  "      return;\n" +
  "    }\n" +
  "    var newIdx=selIdx+dir;\n" +
  "    if(newIdx<0||newIdx>=list.length)return;\n" +
  "    var tmp=list[selIdx];\n" +
  "    list[selIdx]=list[newIdx];\n" +
  "    list[newIdx]=tmp;\n" +
  "    window.__wbSelectedHuntId=list[newIdx].id;\n" +
  "    __wbSaveHuntList(list,function(){\n" +
  "      __wbUpdateHuntListUI();\n" +
  "      __wbUpdateWorldBossUI();\n" +
  "    });\n" +
  "  });\n" +
  "}\n\n";
  wb = wb.substring(0, stateIdx) + selCode + wb.substring(stateIdx);
  console.log('(10) Added __wbSelectedHuntId, __wbSelectHuntItem, __wbMoveSelectedHuntItem');
}

// ======================================================================
// 11. Update __wbUpdateHuntListUI to support selection highlighting
// ======================================================================
var oldUIFn = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var upBtn=idx>0?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',-1)\">\\u25B2</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\\u25B2</span>';var dnBtn=idx<list.length-1?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',1)\">\\u25BC</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\\u25BC</span>';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;\">'+upBtn+dnBtn+'<span style=\"font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;\" onclick=\"__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';}});}";

// New UI: NO per-item ▲▼ (moved to outer buttons), add selection click
var newUIFn = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';}});}";

if (wb.indexOf(oldUIFn) >= 0) {
  wb = wb.replace(oldUIFn, newUIFn);
  console.log('(11) Updated __wbUpdateHuntListUI with selection');
} else {
  console.log('(11) WARN: old __wbUpdateHuntListUI NOT FOUND');
  // Try to find the function
  var fnIdx = wb.indexOf('__wbUpdateHuntListUI');
  if (fnIdx > 0) {
    console.log('  Function reference at: ' + fnIdx);
    console.log('  Near: ' + wb.substring(fnIdx - 20, fnIdx + 60));
  }
}

// ======================================================================
// Write
// ======================================================================
savep(BASE + '/game-monitor.js', gm);
savep(BASE + '/wb-boss.js', wb);
console.log('\n--- Validation ---');
try { new Function(gm); console.log('game-monitor.js: OK (' + gm.length + 'b)'); }
catch(e) { console.log('game-monitor.js: FAIL - ' + e.message.substring(0, 120)); }
try { new Function(wb); console.log('wb-boss.js: OK (' + wb.length + 'b)'); }
catch(e) { console.log('wb-boss.js: FAIL - ' + e.message.substring(0, 120)); }
