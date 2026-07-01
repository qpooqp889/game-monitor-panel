const fs = require('fs');
const path = require('path');

const DIR = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/';

function readFile(f) { return fs.readFileSync(path.join(DIR, f), 'utf8'); }
function writeFile(f, c) { fs.writeFileSync(path.join(DIR, f), c, 'utf8'); }

// Replace function that handles CRLF
function replaceAll(text, search, replacement) {
  // Try as-is first
  let result = text;
  let count = 0;
  while (result.includes(search)) {
    result = result.replace(search, replacement);
    count++;
  }
  return { text: result, count };
}

function replaceAllBoth(text, search, replacement) {
  // Try CRLF version
  let searchCR = search.includes('\n') && !search.includes('\r\n') 
    ? search.replace(/\n/g, '\r\n') : search;
  let replCR = replacement.includes('\n') && !replacement.includes('\r\n')
    ? replacement.replace(/\n/g, '\r\n') : replacement;
  
  if (text.includes(searchCR)) {
    return replaceAll(text, searchCR, replCR);
  }
  // Try LF version
  let searchLF = search.replace(/\r\n/g, '\n');
  let replLF = replacement.replace(/\r\n/g, '\n');
  if (text.includes(searchLF)) {
    return replaceAll(text, searchLF, replLF);
  }
  return { text, count: 0 };
}

function test(label, text, search) {
  const found = text.includes(search);
  console.log(`  ${found ? '✓' : '✗'} ${label}: ${found ? '' : '(not found)'}`);
  return found;
}

// ========== STEP-BY-STEP MODIFICATIONS ==========

let gm = readFile('game-monitor.js');
let wb = readFile('wb-boss.js');

console.log('=== game-monitor.js ===\n');

// 1. Remove auto_script checkbox block
// The block starts with "<div style="display:flex;..." containing "rgba(76,175,80,0.10)" 
// and contains id="__gmp_boss_auto_script"
// We'll find it by the unique marker sequence
let block1Start = gm.indexOf("id=\"__gmp_boss_auto_script\"");
if (block1Start > 0) {
  // Go back to find the opening <div
  let divStart = gm.lastIndexOf("'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);", block1Start);
  // Find the end: </div>'+ then newline+newline
  let endSearchFrom = gm.indexOf("id=\"__gmp_boss_script_status\"", block1Start);
  let divEnd = gm.indexOf("'</div>'", endSearchFrom);
  // Consume the closing </div>'+ and at least 2 newline chars
  let blockEnd = divEnd + 8; // '</div>'
  // Skip past '+ and CR
  // Let me just find the next line that starts with a meaningful character
  // Actually, just consume past '</div>' and the following '+ and whitespace
  blockEnd = divEnd;
  // Look ahead for the next HTML line start
  let afterEnd = gm.indexOf('\n', blockEnd);
  afterEnd = gm.indexOf('\n', afterEnd + 1);
  
  let block = gm.substring(divStart, afterEnd + 1);
  console.log(`  Block to remove: ${block.length} chars`);
  
  // Remove the auto_script checkbox
  gm = gm.substring(0, divStart) + gm.substring(afterEnd + 1);
  console.log('  ✓ Removed auto_script checkbox block\n');
} else {
  console.log('  ✗ Could not find auto_script checkbox\n');
}

// 2. Replace enable row: change red to green, add script status, add label text
// Old enable row (red theme)
let oldEnable = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;\">'+\r\n'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+\r\n'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS</label>'+\r\n'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+\r\n'<div style=\"flex:1;\"></div>'+\r\n'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+\r\n'</div>'+\r\n";

// Test: is oldEnable in gm?
if (gm.includes(oldEnable)) {
  let newEnable = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+\r\n'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+\r\n'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS 自動腳本</label>'+\r\n'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+\r\n'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 閒置中</span>'+\r\n'<div style=\"flex:1;\"></div>'+\r\n'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+\r\n'</div>'+\r\n";
  gm = gm.replace(oldEnable, newEnable);
  console.log('  ✓ Replaced enable row (green theme, merged label, script_status)');
} else {
  console.log('  ✗ Old enable row NOT found');
}

// 3. Merge handler: add __wbBossAutoScriptStart/Stop calls to main enable handler
let oldHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='■ 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='⚡ 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='⚡ 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='▶ 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";

if (gm.includes(oldHandler)) {
  let newHandler = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='■ 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='⚡ 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='⚡ 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='▶ 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";
  gm = gm.replace(oldHandler, newHandler);
  console.log('  ✓ Merged enable handler (added ScriptStart/Stop)');
} else {
  console.log('  ✗ Old handler NOT found');
}

// 4. Remove auto_script handler block
let scriptBlock = "__gmp_boss_auto_script').onchange=function(){if(this.checked){__wbBossAutoScriptStart();}else{__wbBossAutoScriptStop();}__wbSaveBossAutoScriptState();};function __wbSaveBossAutoScriptState(){if(typeof window.__gmStorageSet==='undefined')return;var chk=document.getElementById('__gmp_boss_auto_script');window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});}function __wbLoadBossAutoScriptState(){if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){var s=r&&r.wb_auto_script_state||null;if(s){var chk=document.getElementById('__gmp_boss_auto_script');if(chk)chk.checked=s.enabled;if(s.enabled)setTimeout(__wbBossAutoScriptStart,800);}}).catch(function(){});}setTimeout(__wbLoadBossAutoScriptState,500);";

if (gm.includes(scriptBlock)) {
  gm = gm.replace(scriptBlock, '');
  console.log('  ✓ Removed auto_script handler+save/load block');
} else {
  console.log('  ✗ auto_script handler block NOT found');
}

// 5. Add log HTML area before cooldown section
let logArea = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+\r\n'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+\r\n'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+\r\n'</div>'+\r\n";

// Insert before "// === 冷卻計時 ==="
let coolMarker = "// === \\u51B7\\u537B\\u8A08\\u6642 ===";
let coolIdx = gm.indexOf(coolMarker);
if (coolIdx > 0) {
  // Insert logArea before the coolMarker line
  // The coolMarker line starts with \n// ===
  let beforeCool = gm.lastIndexOf('\n', coolIdx - 2);
  if (beforeCool > 0) {
    // Insert after that newline
    gm = gm.substring(0, beforeCool + 1) + logArea + gm.substring(beforeCool + 1);
    console.log('  ✓ Added script log HTML area');
  } else {
    console.log('  ✗ Could not find insert point before cooldown');
  }
} else {
  console.log('  ✗ Cooldown marker not found');
}

// 6. Add hunt ▲▼ buttons after hunt body
let huntBodyClose = "'<div id=\"__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px;\">'+\r\n'<div id=\"__gmp_hunt_list\" style=\"font-size:10px;color:#555;padding:6px;text-align:center;\">\\u70B9\\u9009\\u4E0A\\u65B9\\u4E16\\u754C\\u738B [+] \\u52A0\\u5165</div>'+\r\n'</div>'+\r\n'</div>'+\r\n";

let huntButtons = "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+\r\n'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+\r\n'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+\r\n'</div>'+\r\n";

if (gm.includes(huntBodyClose)) {
  gm = gm.replace(huntBodyClose, huntBodyClose + huntButtons);
  console.log('  ✓ Added hunt ▲▼ buttons');
} else {
  console.log('  ✗ Hunt body close NOT found');
}

// 7. Add button click handlers before config_btn.onclick
let configRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
let configIdx = gm.indexOf(configRef);
if (configIdx > 0) {
  let handlers = "\r\n  // === Hunt list ▲▼ buttons ===\r\n  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};\r\n  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};\r\n";
  gm = gm.substring(0, configIdx) + handlers + gm.substring(configIdx);
  console.log('  ✓ Added hunt button handlers');
} else {
  console.log('  ✗ Config btn ref NOT found');
}

// ========== wb-boss.js changes ==========
console.log('\n=== wb-boss.js ===\n');

// F1: Replace DOM refs
let f1Changes = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  f1Changes++;
}
console.log(`  ✓ Replaced ${f1Changes} DOM refs`);

// G1: Add selection functions before window.__wbBossAutoScript={}
let stateRef = "window.__wbBossAutoScript={";
let stateIdx = wb.indexOf(stateRef);
if (stateIdx > 0) {
  let selCode = "\r\n// Selected hunt item for outer ▲▼ buttons\r\nwindow.__wbSelectedHuntId=null;\r\n\r\nfunction __wbSelectHuntItem(id){\r\n  window.__wbSelectedHuntId=id;\r\n  __wbUpdateHuntListUI();\r\n}\r\n\r\nfunction __wbMoveSelectedHuntItem(dir){\r\n  __wbGetHuntList(function(list){\r\n    var selIdx=-1;\r\n    if(window.__wbSelectedHuntId){\r\n      selIdx=list.findIndex(function(i){return i.id===window.__wbSelectedHuntId;});\r\n    }\r\n    if(selIdx<0){\r\n      if(list.length){window.__wbSelectedHuntId=list[0].id;__wbUpdateHuntListUI();}\r\n      return;\r\n    }\r\n    var newIdx=selIdx+dir;\r\n    if(newIdx<0||newIdx>=list.length)return;\r\n    var tmp=list[selIdx];\r\n    list[selIdx]=list[newIdx];\r\n    list[newIdx]=tmp;\r\n    window.__wbSelectedHuntId=list[newIdx].id;\r\n    __wbSaveHuntList(list,function(){\r\n      __wbUpdateHuntListUI();\r\n      __wbUpdateWorldBossUI();\r\n    });\r\n  });\r\n}\r\n";
  wb = wb.substring(0, stateIdx) + selCode + wb.substring(stateIdx);
  console.log('  ✓ Added __wbSelectedHuntId + selection functions');
} else {
  console.log('  ✗ State ref NOT found');
}

// H1: Update __wbUpdateHuntListUI
let oldUI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var upBtn=idx>0?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',-1)\">\u25B2</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25B2</span>';var dnBtn=idx<list.length-1?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',1)\">\u25BC</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25BC</span>';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;\">'+upBtn+dnBtn+'<span style=\"font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;\" onclick=\"__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

let newUI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

if (wb.includes(oldUI)) {
  wb = wb.replace(oldUI, newUI);
  console.log('  ✓ Updated HuntListUI with selection highlighting');
} else {
  console.log('  ✗ Old UI function NOT found');
}

// I1: Add __wbAddBossScriptLog function before RestoreFarm
let restoreFarm = 'function __wbBossAutoScriptRestoreFarm';
let restoreIdx = wb.indexOf(restoreFarm);
if (restoreIdx > 0) {
  let logFn = "\r\nfunction __wbAddBossScriptLog(msg){\r\ntry{\r\nvar el=document.getElementById('__gmp_boss_script_log');\r\nif(!el)return;\r\nvar ts=new Date();\r\nvar t=ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')+':'+ts.getSeconds().toString().padStart(2,'0');\r\nvar div=document.createElement('div');\r\ndiv.style.cssText='font-size:9px;color:#aaa;padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03);';\r\ndiv.textContent='['+t+'] '+msg;\r\nel.appendChild(div);\r\nel.scrollTop=el.scrollHeight;\r\nif(el.children.length>50)el.removeChild(el.firstChild);\r\n}catch(e){}\r\n}\r\n";
  wb = wb.substring(0, restoreIdx) + logFn + wb.substring(restoreIdx);
  console.log('  ✓ Added __wbAddBossScriptLog function');
} else {
  console.log('  ✗ RestoreFarm NOT found');
}

// I2: Add log calls
let enterPattern = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\r\n      window.__wbBossAutoScript.phase='entering';\r\n      try{foundBoss.click();}catch(e){}";
let enterLog = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');\r\n      __wbAddBossScriptLog('進入世界王: '+target.name);\r\n      window.__wbBossAutoScript.phase='entering';\r\n      try{foundBoss.click();}catch(e){}";

if (wb.includes(enterPattern)) {
  wb = wb.replace(enterPattern, enterLog);
  console.log('  ✓ Added enter log call');
} else {
  console.log('  ✗ Enter pattern NOT found');
}

let respawnPattern = "try{foundBoss.click();}catch(e){}\r\n      window.__wbBossAutoScript.phase='attacking';";
let respawnLog = "try{foundBoss.click();}catch(e){}\r\n      __wbAddBossScriptLog('重生進入: '+target.name);\r\n      window.__wbBossAutoScript.phase='attacking';";

if (wb.includes(respawnPattern)) {
  wb = wb.replace(respawnPattern, respawnLog);
  console.log('  ✓ Added respawn log call');
} else {
  console.log('  ✗ Respawn pattern NOT found');
}

let defeatPattern = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
let defeatLog = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');\r\n      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');";

if (wb.includes(defeatPattern)) {
  wb = wb.replace(defeatPattern, defeatLog);
  console.log('  ✓ Added defeat log call');
} else {
  console.log('  ✗ Defeat pattern NOT found');
}

// ========== Write files ==========
console.log('\n=== Write and Validate ===');
writeFile('game-monitor.js', gm);
writeFile('wb-boss.js', wb);

try { new Function(gm); console.log('  ✓ game-monitor.js: valid syntax (' + gm.length + 'b)'); }
catch(e) { console.log('  ✗ game-monitor.js: ' + e.message.slice(0, 100)); }

try { new Function(wb); console.log('  ✓ wb-boss.js: valid syntax (' + wb.length + 'b)'); }
catch(e) { console.log('  ✗ wb-boss.js: ' + e.message.slice(0, 100)); }

console.log('\n=== Final verification ===\n');
const finalChecks = {
  'No __gmp_boss_auto_script in gm': !gm.includes('__gmp_boss_auto_script'),
  '__gmp_boss_script_status in gm': gm.includes('__gmp_boss_script_status'),
  '__wbBossAutoScriptStart() in handler': gm.includes('__wbBossAutoScriptStart()'),
  '__wbBossAutoScriptStop() in handler': gm.includes('__wbBossAutoScriptStop()'),
  '__gmp_boss_script_log in gm': gm.includes('__gmp_boss_script_log'),
  '__gmp_hunt_move_up in gm': gm.includes('__gmp_hunt_move_up'),
  '__gmp_hunt_move_down in gm': gm.includes('__gmp_hunt_move_down'),
  '__wbMoveSelectedHuntItem handler in gm': gm.includes('__wbMoveSelectedHuntItem'),
  'No old DOM ref in wb': !wb.includes("document.getElementById('__gmp_boss_auto_script')"),
  'New DOM ref in wb': wb.includes("document.getElementById('__gmp_boss_auto_enable')"),
  '__wbSelectedHuntId in wb': wb.includes('__wbSelectedHuntId'),
  '__wbSelectHuntItem in wb': wb.includes('__wbSelectHuntItem'),
  '__wbMoveSelectedHuntItem in wb': wb.includes('__wbMoveSelectedHuntItem'),
  '__wbAddBossScriptLog in wb': wb.includes('__wbAddBossScriptLog'),
};

let allPass = true;
for (const [label, result] of Object.entries(finalChecks)) {
  console.log(`  ${result ? '✓' : '✗'} ${label}`);
  if (!result) allPass = false;
}

console.log(allPass ? '\n✅ ALL CHECKS PASSED - v3.10 ready!' : '\n❌ SOME CHECKS FAILED');
