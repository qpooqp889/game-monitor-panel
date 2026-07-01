var fs = require('fs');
var CR = '\r\n';

function readIt(f) {
  return fs.readFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/' + f, 'utf8');
}
function writeIt(f, c) {
  fs.writeFileSync('C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/' + f, c, 'utf8');
}
function replaceExact(src, oldStr, newStr, label, isMulti) {
  var count = 0;
  while (src.indexOf(oldStr) >= 0) { src = src.replace(oldStr, newStr); count++; }
  var status = count > 0 ? 'OK: ' + count : 'FAIL';
  if (isMulti) console.log('  ' + label + ': ' + status);
  else console.log(label + ': ' + status);
  return { result: src, count: count };
}

var gm = readIt('game-monitor.js');
var wb = readIt('wb-boss.js');

// The file uses literal JS escape sequences like \uD83C\uDFAF as text
// So we search for the literal backslash-u sequences
var S = '\\uD83C\\uDFAF'; // \uD83C\uDFAF as text
var W = '\\u2694\\uFE0F'; // \u2694\ufe0f as text
var D = '\\u00B7';       // \u00b7 as text
var G = '\\u2699';       // \u2699 as text

// ============================================================
// 1. Remove auto_script checkbox HTML
// ============================================================
var cbBlock = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_script\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_script\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">" + S + " 自動BOSS腳本</label>'+" + CR +
"'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;\">" + D + " 閒置中</span>'+" + CR +
"'</div>'+" + CR + CR;

var r1 = replaceExact(gm, cbBlock, '', '1. Remove checkbox');
gm = r1.result;

// ============================================================
// 2. Replace enable row
// ============================================================
var oldEn = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;\">" + W + " 自動BOSS</label>'+" + CR +
"'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
"'<div style=\"flex:1;\"></div>'+" + CR +
"'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;\">" + G + " 進階設定</button>'+" + CR +
"'</div>'+" + CR;

var newEn = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">" + W + " 自動BOSS 自動腳本</label>'+" + CR +
"'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
"'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">" + D + " 閒置中</span>'+" + CR +
"'<div style=\"flex:1;\"></div>'+" + CR +
"'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">" + G + " 進階設定</button>'+" + CR +
"'</div>'+" + CR;

var r2 = replaceExact(gm, oldEn, newEn, '2. Enable row');
gm = r2.result;

// ============================================================
// 3. Merge enable onchange handler (literal unicode escapes)
// ============================================================
// These handlers contain actual Unicode characters, not escape sequences
// Let's use the actual characters
var oldH = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\u25A0 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\u26A1 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\u26A1 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\u25B6 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";

var newH = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\u25A0 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='\u26A1 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='\u26A1 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='\u25B6 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";

var r3 = replaceExact(gm, oldH, newH, '3. Handler merged');
gm = r3.result;

// ============================================================
// 4. Remove auto_script handler+save/load block
// ============================================================
var hb = "__gmp_boss_auto_script').onchange=function(){if(this.checked){__wbBossAutoScriptStart();}else{__wbBossAutoScriptStop();}__wbSaveBossAutoScriptState();};function __wbSaveBossAutoScriptState(){if(typeof window.__gmStorageSet==='undefined')return;var chk=document.getElementById('__gmp_boss_auto_script');window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});}function __wbLoadBossAutoScriptState(){if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){var s=r&&r.wb_auto_script_state||null;if(s){var chk=document.getElementById('__gmp_boss_auto_script');if(chk)chk.checked=s.enabled;if(s.enabled)setTimeout(__wbBossAutoScriptStart,800);}}).catch(function(){});}setTimeout(__wbLoadBossAutoScriptState,500);";

var r4 = replaceExact(gm, hb, '', '4. Handler block removed');
gm = r4.result;

// ============================================================
// 5. Replace auto_script refs in wb
// ============================================================
var r5 = replaceExact(wb, "document.getElementById('__gmp_boss_auto_script')",
  "document.getElementById('__gmp_boss_auto_enable')", '5. Refs replaced');
wb = r5.result;

// ============================================================
// 6. Add log function to wb-boss.js
// ============================================================
var logFn = CR + "function __wbAddBossScriptLog(msg){" + CR +
  "try{" + CR +
  "var el=document.getElementById('__gmp_boss_script_log');" + CR +
  "if(!el)return;" + CR +
  "var ts=new Date();" + CR +
  "var t=ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')+':'+ts.getSeconds().toString().padStart(2,'0');" + CR +
  "var div=document.createElement('div');" + CR +
  "div.style.cssText='font-size:9px;color:#aaa;padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03);';" + CR +
  "div.textContent='['+t+'] '+msg;" + CR +
  "el.appendChild(div);" + CR +
  "el.scrollTop=el.scrollHeight;" + CR +
  "if(el.children.length>50)el.removeChild(el.firstChild);" + CR +
  "}catch(e){}" + CR +
  "}" + CR;

var restoreIdx = wb.indexOf('function __wbBossAutoScriptRestoreFarm');
if (restoreIdx > 0) {
  wb = wb.substring(0, restoreIdx) + logFn + wb.substring(restoreIdx);
  console.log('6. Log function added');
} else {
  console.log('6. FAIL (RestoreFarm not found)');
}

// ============================================================
// 7. Add log calls (use actual Chinese chars - they match)
// ============================================================
var oldEnter = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR + "      window.__wbBossAutoScript.phase='entering';" + CR + "      try{foundBoss.click();}catch(e){}";
var newEnter = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR + "      __wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      window.__wbBossAutoScript.phase='entering';" + CR + "      try{foundBoss.click();}catch(e){}";
var r7a = replaceExact(wb, oldEnter, newEnter, '7a. Enter log');
wb = r7a.result;

var oldResp = "try{foundBoss.click();}catch(e){}" + CR + "      window.__wbBossAutoScript.phase='attacking';";
var newResp = "try{foundBoss.click();}catch(e){}" + CR + "      __wbAddBossScriptLog('重生進入: '+target.name);" + CR + "      window.__wbBossAutoScript.phase='attacking';";
var r7b = replaceExact(wb, oldResp, newResp, '7b. Respawn log');
wb = r7b.result;

var oldDead = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
var newDead = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');" + CR + "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');";
var r7c = replaceExact(wb, oldDead, newDead, '7c. Defeated log');
wb = r7c.result;

// ============================================================
// 8. Add log HTML area (literal escape sequences)
// ============================================================
var logHtml = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
"'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR +
"'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
"'</div>'+" + CR;

var coldSearch = "// === \\u51B7\\u537B\\u8A08\\u6642 ==="; // literal \u51B7...
var coldIdx = gm.indexOf(coldSearch);
if (coldIdx > 0) {
  var before = gm.lastIndexOf("'</div>'+" + CR, coldIdx);
  if (before > 0) {
    gm = gm.substring(0, before) + "'</div>'+" + CR + logHtml + gm.substring(before);
    console.log('8. Log area added');
  } else {
    console.log('8. FAIL: insertion point not found');
  }
} else {
  console.log('8. FAIL (cold marker not found)');
}

// ============================================================
// 9. Add hunt ▲▼ buttons
// ============================================================
var huntBtn = "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
"'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+" + CR +
"'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+" + CR +
"'</div>'+" + CR;

// Insert before the closing div of the hunt container
// Pattern: ...hunt_body div > hun_list div > /div (body close) > /div (wrapper close)
var huntClosePattern = "'<div id=\"__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px;\">'+" + CR +
"'<div id=\"__gmp_hunt_list\" style=\"font-size:10px;color:#555;padding:6px;text-align:center;\">\\u70B9\\u9009\\u4E0A\\u65B9\\u4E16\\u754C\\u738B [+] \\u52A0\\u5165</div>'+" + CR +
"'</div>'+" + CR +
"'</div>'+" + CR;

var r9 = replaceExact(gm, huntClosePattern, huntClosePattern + huntBtn, '9. Hunt buttons');
gm = r9.result;

// ============================================================
// 9b. ▲▼ button handlers
// ============================================================
var cbref = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
var cbidx = gm.indexOf(cbref);
if (cbidx > 0) {
  var bh = CR + "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.substring(0, cbidx) + bh + gm.substring(cbidx);
  console.log('9b. Button handlers added');
} else {
  console.log('9b. FAIL');
}

// ============================================================
// 10. Add __wbSelectedHuntId, __wbSelectHuntItem, __wbMoveSelectedHuntItem
// ============================================================
var stateRef = "window.__wbBossAutoScript={";
var stateIdx = wb.indexOf(stateRef);
if (stateIdx > 0) {
  var selCode = CR + "// Selected hunt item for outer ▲▼ buttons" + CR +
    "window.__wbSelectedHuntId=null;" + CR + CR +
    "function __wbSelectHuntItem(id){" + CR +
    "  window.__wbSelectedHuntId=id;" + CR +
    "  __wbUpdateHuntListUI();" + CR +
    "}" + CR + CR +
    "function __wbMoveSelectedHuntItem(dir){" + CR +
    "  __wbGetHuntList(function(list){" + CR +
    "    var selIdx=-1;" + CR +
    "    if(window.__wbSelectedHuntId){" + CR +
    "      selIdx=list.findIndex(function(i){return i.id===window.__wbSelectedHuntId;});" + CR +
    "    }" + CR +
    "    if(selIdx<0){" + CR +
    "      if(list.length){window.__wbSelectedHuntId=list[0].id;__wbUpdateHuntListUI();}" + CR +
    "      return;" + CR +
    "    }" + CR +
    "    var newIdx=selIdx+dir;" + CR +
    "    if(newIdx<0||newIdx>=list.length)return;" + CR +
    "    var tmp=list[selIdx];" + CR +
    "    list[selIdx]=list[newIdx];" + CR +
    "    list[newIdx]=tmp;" + CR +
    "    window.__wbSelectedHuntId=list[newIdx].id;" + CR +
    "    __wbSaveHuntList(list,function(){" + CR +
    "      __wbUpdateHuntListUI();" + CR +
    "      __wbUpdateWorldBossUI();" + CR +
    "    });" + CR +
    "  });" + CR +
    "}" + CR;
  wb = wb.substring(0, stateIdx) + selCode + wb.substring(stateIdx);
  console.log('10. Selection code added');
} else {
  console.log('10. FAIL');
}

// ============================================================
// 11. Update __wbUpdateHuntListUI
// ============================================================
var oldUI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var upBtn=idx>0?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',-1)\">\u25B2</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25B2</span>';var dnBtn=idx<list.length-1?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',1)\">\u25BC</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25BC</span>';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;\">'+upBtn+dnBtn+'<span style=\"font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;\" onclick=\"__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

var newUI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

var r11 = replaceExact(wb, oldUI, newUI, '11. UI function');
wb = r11.result;

// ============================================================
// Write & validate
// ============================================================
writeIt('game-monitor.js', gm);
writeIt('wb-boss.js', wb);

console.log('\n=== VALIDATION ===');
try { new Function(gm); console.log('game-monitor.js: OK (' + gm.length + 'b)'); }
catch(e) { console.log('game-monitor.js: FAIL - ' + e.message.substring(0, 150)); }
try { new Function(wb); console.log('wb-boss.js: OK (' + wb.length + 'b)'); }
catch(e) { console.log('wb-boss.js: FAIL - ' + e.message.substring(0, 150)); }

// Final verification
console.log('\n=== FINAL CHECK ===');
console.log('gm has auto_script checkbox:', gm.indexOf('__gmp_boss_auto_script') >= 0 ? 'YES (at ' + gm.indexOf('__gmp_boss_auto_script') + ')' : 'NO');
console.log('gm has script_status span:', gm.indexOf('__gmp_boss_script_status') >= 0 ? 'YES (at ' + gm.indexOf('__gmp_boss_script_status') + ')' : 'NO');
console.log('gm has handler merged:', gm.indexOf('__wbBossAutoScriptStart()') >= 0 ? 'YES' : 'NO');
console.log('gm has script_log div:', gm.indexOf('__gmp_boss_script_log') >= 0 ? 'YES' : 'NO');
console.log('gm has hunt_move_up:', gm.indexOf('__gmp_hunt_move_up') >= 0 ? 'YES' : 'NO');
console.log('gm has handler for move:', gm.indexOf('__wbMoveSelectedHuntItem') >= 0 ? 'YES' : 'NO');
console.log('wb has selectedId:', wb.indexOf('__wbSelectedHuntId') >= 0 ? 'YES' : 'NO');
console.log('wb has select fn:', wb.indexOf('__wbSelectHuntItem') >= 0 ? 'YES' : 'NO');
console.log('wb has move fn:', wb.indexOf('__wbMoveSelectedHuntItem') >= 0 ? 'YES' : 'NO');
console.log('wb has log fn:', wb.indexOf('__wbAddBossScriptLog') >= 0 ? 'YES' : 'NO');
console.log('wb has old per-item ▲▼:', wb.indexOf('__wbMoveHuntItem') >= 0 ? 'YES' : 'NO (removed)');
