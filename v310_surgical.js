const fs = require('fs');

const DIR = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/';

function read(f) { return fs.readFileSync(DIR + f, 'utf8'); }
function write(f, c) { fs.writeFileSync(DIR + f, c, 'utf8'); }
function verify(f, c) {
  try { new Function(c); return 'OK'; } catch(e) { return 'FAIL: ' + e.message.slice(0, 120); }
}

let gm = read('game-monitor.js');
let wb = read('wb-boss.js');

const CR = '\r\n';

// ===== 1. Remove auto_script checkbox block =====
// The block starts at the div that immediately follows the previous '</div>'
// Unique marker: id="__gmp_boss_auto_script"
const s1 = gm.indexOf('__gmp_boss_auto_script');
// Go backwards to find the preceding '</div>' which marks the end of the previous section
const prevSectionEnd = gm.lastIndexOf("'</div>'", s1);
// The auto_script block starts on the next line after that
let block1Start = gm.indexOf("'<div", prevSectionEnd + 10);
// Find the end: after the script_span and its closing </div>
const scriptSpan = gm.indexOf('__gmp_boss_script_status', s1);
let block1End = gm.indexOf("'</div>'", scriptSpan);
// Consume past it and following whitespace
const afterBlock1 = gm.indexOf("'<div", block1End + 10);  // next HTML block starts here
if (afterBlock1 > 0) {
  // Remove everything from block1Start to just before afterBlock1
  const block1 = gm.substring(block1Start, afterBlock1);
  console.log('1. Removing auto_script block:', block1.length, 'bytes');
  gm = gm.substring(0, block1Start) + gm.substring(afterBlock1);
  console.log('   ✓');
} else {
  console.log('1. Failed to find next block boundary');
}

// ===== 2. Replace enable row =====
// Find the enable checkbox block
const s2 = gm.indexOf('__gmp_boss_auto_enable');
let enBlockStart = gm.lastIndexOf("'<div", s2 - 100);
let enBlockEnd = gm.indexOf("'</div>'", s2);
let enNext = gm.indexOf("'<div", enBlockEnd + 10);
if (enBlockStart > 0 && enBlockEnd > 0 && enNext > 0) {
  const oldEnBlock = gm.substring(enBlockStart, enNext);
  
  // Check if it's already been replaced (green theme) - if so, skip
  if (oldEnBlock.includes('rgba(233,69,96,0.12)')) {
    // Build new block
    const newEnBlock = 
      "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
      "'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
      "'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS 自動腳本</label>'+" + CR +
      "'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
      "'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 閒置中</span>'+" + CR +
      "'<div style=\"flex:1;\"></div>'+" + CR +
      "'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+" + CR +
      "'</div>'+" + CR;
    
    console.log('2. Replacing enable row:', oldEnBlock.length, '->', newEnBlock.length, 'bytes');
    gm = gm.substring(0, enBlockStart) + newEnBlock + gm.substring(enNext);
    console.log('   ✓');
  } else {
    console.log('2. Enable row already green, skipping');
  }
} else {
  console.log('2. Failed to find enable row boundaries');
}

// ===== 3. Merge handler =====
const handlerPattern = "__gmStorageSet('wb_auto_script_state'";
const hIdx = gm.indexOf(handlerPattern);
if (hIdx > 0) {
  // This is the auto_script save/load block - remove it
  // It starts from the ___gmp_boss_auto_script').onchange=... and ends at setTimeout(__wbLoadBossAutoScriptState,500);
  const scriptStart = gm.indexOf("__gmp_boss_auto_script')", hIdx - 200);
  const loadEnd = gm.indexOf('setTimeout(__wbLoadBossAutoScriptState,500);');
  if (scriptStart > 0 && loadEnd > 0) {
    const removeBlock = gm.substring(scriptStart - 30, loadEnd + 45);
    console.log('3. Removing auto_script handler block:', removeBlock.length, 'bytes');
    gm = gm.replace(removeBlock, '');
    console.log('   ✓');
  }
}

// ===== 3b. Merge __wbBossAutoScriptStart/Stop into main handler =====
const oldHandler = "__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn')";
const hIdx2 = gm.indexOf(oldHandler);
if (hIdx2 > 0) {
  const newHandler = "__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn')";
  gm = gm.replace(oldHandler, newHandler);
  console.log('3b. Added __wbBossAutoScriptStart() to oncheck handler ✓');
}

const oldStop = "}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn')";
const stopIdx = gm.indexOf(oldStop);
if (stopIdx > 0) {
  const newStop = "}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn')";
  gm = gm.replace(oldStop, newStop);
  console.log('3c. Added __wbBossAutoScriptStop() to uncheck handler ✓');
}

// ===== 4. Add log HTML area before cooldown section =====
const cdMarker = "\\\\u51B7\\\\u537B\\\\u8A08\\\\u6642";
const cdIdx = gm.indexOf('\\\\u51B7\\\\u537B\\\\u8A08\\\\u6642');
// Also try: // === 冷卻計時 === (literal with escape sequences)
const cdSection = "// === \\u51B7\\u537B\\u8A08\\u6642 ===";
const cdSectionIdx = gm.indexOf(cdSection);
let inserted = false;
if (cdSectionIdx > 0) {
  const logHtml = 
    "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
    "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR +
    "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
    "'</div>'+" + CR;

  // Insert after: '</div>'+   + newline  and before the // === cold === line
  const insertPoint = cdSectionIdx;
  // Find the preceding '</div>'+
  const precedingClose = gm.lastIndexOf("'</div>'+" + CR, insertPoint);
  if (precedingClose > 0) {
    const afterClose = precedingClose + 10; // after '</div>'+\r\n
    gm = gm.substring(0, afterClose) + logHtml + gm.substring(afterClose);
    console.log('4. Added log HTML area ✓');
    inserted = true;
  }
}
if (!inserted) {
  console.log('4. Could not find cooldown section insertion point');
}

// ===== 5. Add hunt buttons after hunt body =====
const huntBody = "__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px;";
const huntBodyIdx = gm.indexOf(huntBody);
if (huntBodyIdx > 0) {
  // Find the closing of this container: two </div>'+
  const huntListClose = gm.indexOf("</div>'+" + CR, huntBodyIdx + 50);
  let wrapperClose = gm.indexOf("'</div>'+" + CR, huntListClose + 10);
  if (wrapperClose > 0) {
    const afterClose = wrapperClose + 10;
    const huntButtons = 
      "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
      "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+" + CR +
      "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+" + CR +
      "'</div>'+" + CR;
    gm = gm.substring(0, afterClose) + huntButtons + gm.substring(afterClose);
    console.log('5. Added hunt ▲▼ buttons ✓');
  } else {
    console.log('5. Could not find wrapper close');
  }
} else {
  console.log('5. Hunt body not found');
}

// ===== 6. Add button handlers before config_btn.onclick =====
const configBtnRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cfgRefIdx = gm.indexOf(configBtnRef);
if (cfgRefIdx > 0) {
  const btnHandlers = 
    CR + "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.substring(0, cfgRefIdx) + btnHandlers + gm.substring(cfgRefIdx);
  console.log('6. Added hunt button handlers ✓');
} else {
  console.log('6. Config btn ref not found');
}

// ===== 7. wb-boss.js: Replace DOM refs =====
let refCount = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log('7. Replaced', refCount, 'DOM refs in wb-boss.js ✓');

// ===== 8. wb-boss.js: Add selection functions =====
const stateRef = "window.__wbBossAutoScript={";
const stateIdx = wb.indexOf(stateRef);
if (stateIdx > 0) {
  // Check if already added
  if (!wb.includes('__wbSelectedHuntId')) {
    const selCode = 
      CR + "// Selected hunt item for outer ▲▼ buttons" + CR +
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
    console.log('8. Added selection functions ✓');
  } else {
    console.log('8. Selection functions already present ✓');
  }
} else {
  console.log('8. State ref not found');
}

// ===== 9. wb-boss.js: Update HuntListUI =====
const oldUIMarker = "__wbMoveHuntItem(\\''+i.id+'\\',-1)";  // old per-item up button
if (wb.includes(oldUIMarker)) {
  // Replace the entire function; find its boundaries
  const fnStart = wb.indexOf('function __wbUpdateHuntListUI');
  const fnEnd = wb.indexOf('}', fnStart);
  if (fnStart > 0) {
    // Try to find the actual end by counting braces
    let braceCount = 0;
    let fnEnd2 = -1;
    for (let i = fnStart; i < wb.length; i++) {
      if (wb[i] === '{') braceCount++;
      if (wb[i] === '}') {
        braceCount--;
        if (braceCount === 0) { fnEnd2 = i + 1; break; }
      }
    }
    if (fnEnd2 > 0) {
      const newUI = 
        "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';}});}";
      wb = wb.substring(0, fnStart) + newUI + wb.substring(fnEnd2);
      console.log('9. Updated HuntListUI ✓');
    } else {
      console.log('9. Could not find function end');
    }
  } else {
    console.log('9. UI function not found');
  }
} else {
  console.log('9. HuntListUI already updated ✓');
}

// ===== 10. wb-boss.js: Add log function =====
if (!wb.includes('__wbAddBossScriptLog')) {
  const restoreFarm = 'function __wbBossAutoScriptRestoreFarm';
  const restoreIdx = wb.indexOf(restoreFarm);
  if (restoreIdx > 0) {
    const logFn = 
      CR + "function __wbAddBossScriptLog(msg){" + CR +
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
    wb = wb.substring(0, restoreIdx) + logFn + wb.substring(restoreIdx);
    console.log('10. Added log function ✓');
  } else {
    console.log('10. RestoreFarm not found');
  }
} else {
  console.log('10. Log function already present ✓');
}

// ===== 11. wb-boss.js: Add log calls =====
if (!wb.includes('__wbAddBossScriptLog(\'進入世界王')) {
  // Add enter log
  const enterPattern = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR +
    "      window.__wbBossAutoScript.phase='entering';" + CR +
    "      try{foundBoss.click();}catch(e){}";
  const enterLog = enterPattern.replace(
    "window.__wbBossAutoScript.phase='entering';",
    "__wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      window.__wbBossAutoScript.phase='entering';"
  );
  
  if (wb.includes(enterPattern)) {
    wb = wb.replace(enterPattern, enterLog);
    console.log('11a. Added enter log call ✓');
  } else {
    console.log('11a. Enter pattern not found');
  }

  // Add respawn log
  const respawnPattern = "try{foundBoss.click();}catch(e){}" + CR +
    "      window.__wbBossAutoScript.phase='attacking';";
  const respawnLog = respawnPattern.replace(
    "window.__wbBossAutoScript.phase='attacking';",
    "__wbAddBossScriptLog('重生進入: '+target.name);" + CR + "      window.__wbBossAutoScript.phase='attacking';"
  );
  
  if (wb.includes(respawnPattern)) {
    wb = wb.replace(respawnPattern, respawnLog);
    console.log('11b. Added respawn log call ✓');
  } else {
    console.log('11b. Respawn pattern not found');
  }

  // Add defeat log
  const defeatPattern = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
  const defeatLog = defeatPattern.replace(
    "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');",
    "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');" + CR + "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');"
  );
  
  if (wb.includes(defeatPattern)) {
    wb = wb.replace(defeatPattern, defeatLog);
    console.log('11c. Added defeat log call ✓');
  } else {
    console.log('11c. Defeat pattern not found');
  }
} else {
  console.log('11. Log calls already present ✓');
}

// ===== Write =====
write('game-monitor.js', gm);
write('wb-boss.js', wb);

console.log('\n=== Validation ===');
console.log('  game-monitor:', verify('game-monitor.js', gm), '(' + gm.length + 'b)');
console.log('  wb-boss:     ', verify('wb-boss.js', wb), '(' + wb.length + 'b)');

console.log('\n=== Final checks ===');
const checks = [
  ['No __gmp_boss_auto_script checkbox in HTML', !gm.includes('auto_script" style'), true],
  ['Has __gmp_boss_script_status', gm.includes('__gmp_boss_script_status'), true],
  ['Has ScriptStart in handler', gm.includes('__wbBossAutoScriptStart()'), true],
  ['Has ScriptStop in handler', gm.includes('__wbBossAutoScriptStop()'), true],
  ['Has __gmp_boss_script_log', gm.includes('__gmp_boss_script_log'), true],
  ['Has __gmp_hunt_move_up', gm.includes('__gmp_hunt_move_up'), true],
  ['Has __gmp_hunt_move_down', gm.includes('__gmp_hunt_move_down'), true],
  ['Has __wbMoveSelectedHuntItem handler in gm', gm.includes('__wbMoveSelectedHuntItem'), true],
  ['No old DOM ref in wb', !wb.includes("document.getElementById('__gmp_boss_auto_script')"), true],
  ['Has new DOM ref in wb', wb.includes("document.getElementById('__gmp_boss_auto_enable')"), true],
  ['Has __wbSelectedHuntId in wb', wb.includes('__wbSelectedHuntId'), true],
  ['Has __wbSelectHuntItem in wb', wb.includes('__wbSelectHuntItem'), true],
  ['Has __wbMoveSelectedHuntItem in wb', wb.includes('__wbMoveSelectedHuntItem'), true],
  ['Has __wbAddBossScriptLog in wb', wb.includes('__wbAddBossScriptLog'), true],
  ['No old per-item arrows in UI', !wb.includes('__wbMoveHuntItem(\\'), true],
];

let allOK = true;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) allOK = false;
}

// Count remaining occurrences
if (gm.includes('auto_script')) {
  const remaining = gm.match(/auto_script/g).length;
  console.log(`  ⚠ Note: ${remaining} 'auto_script' remaining (expected in handler names)`);
}
if (wb.includes('__wbMoveHuntItem')) {
  console.log('  ⚠ Note: __wbMoveHuntItem still defined (called by outer buttons? check)');
}

console.log(allOK ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
