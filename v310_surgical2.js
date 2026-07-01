const fs = require('fs');
const DIR = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/';
const CR = '\r\n';

function read(f) { return fs.readFileSync(DIR + f, 'utf8'); }
function write(f, c) { fs.writeFileSync(DIR + f, c, 'utf8'); }

// ===== game-monitor.js =====
let gm = read('game-monitor.js');
let origWb = read('wb-boss.js');

// 1. Find & remove auto_script checkbox HTML by position
let p = 0;
const cbDiv = gm.indexOf('__gmp_boss_auto_script', p);
console.log('1. auto_script at', cbDiv);
const cbDivOpen = gm.lastIndexOf("'<div", cbDiv);
// The auto_script block: starts with '<div style=...background:rgba(76,175,80,0.10)
// and goes through </div>'+
const cbDivClose = gm.indexOf("'</div>'", cbDiv);
// Find the line after '</div>'+
let afterCb = gm.indexOf(CR + CR, cbDivClose); // double newline after
if (afterCb < 0) afterCb = gm.indexOf('\n\n', cbDivClose);
if (afterCb < 0) afterCb = gm.indexOf(CR, cbDivClose + 10);
if (afterCb > 0) afterCb += CR.length;

// The next HTML block or line starts here
const cbBlock = gm.substring(cbDivOpen, afterCb);
console.log('  Block to remove: len=' + cbBlock.length);
gm = gm.substring(0, cbDivOpen) + gm.substring(afterCb);
console.log('  ✓');

// 2. Replace enable row
const enCheck = gm.indexOf('__gmp_boss_auto_enable', p);
console.log('\n2. enable at', enCheck);
const enDivOpen = gm.lastIndexOf("'<div", enCheck);
const enDivClose = gm.indexOf("'</div>'", enCheck);
let afterEn = gm.indexOf(CR + CR, enDivClose);
if (afterEn < 0) afterEn = gm.indexOf('\n\n', enDivClose);
if (afterEn < 0) afterEn = gm.indexOf(CR, enDivClose + 10);
if (afterEn > 0) afterEn += CR.length;

const oldEnBlock = gm.substring(enDivOpen, afterEn);
console.log('  Old enable row: len=' + oldEnBlock.length + ' (' + oldEnBlock.includes('rgba(233') + ' red, ' + oldEnBlock.includes('rgba(76,175') + ' green)');

if (oldEnBlock.includes('rgba(233,69,96,0.12)')) {
  const newEnBlock =
    "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
    "'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
    "'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS 自動腳本</label>'+" + CR +
    "'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
    "'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 閒置中</span>'+" + CR +
    "'<div style=\"flex:1;\"></div>'+" + CR +
    "'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+" + CR +
    "'</div>'+" + CR;
  
  // Verify the new block looks right by checking length
  console.log('  Replacing with green theme, len=' + newEnBlock.length);
  gm = gm.substring(0, enDivOpen) + newEnBlock + gm.substring(afterEn);
  console.log('  ✓');
} else {
  console.log('  Already replaced or unexpected format, checking:', oldEnBlock.substring(0, 60));
}

// 3. Remove auto_script handler block
// The handler block is: function __wbSaveBossAutoScriptState... and __wbLoadBossAutoScriptState
const saveFn = gm.indexOf('function __wbSaveBossAutoScriptState');
if (saveFn > 0) {
  // Find the start - includes the preceding .onchange= handler
  const handlerStart = gm.lastIndexOf('__gmp_boss_auto_script', saveFn);
  // Find the line where it actually starts (onchange assignment)
  const realStart = gm.lastIndexOf(CR, handlerStart - 2);
  
  // Find end: the whole block ends after setTimeout(__wbLoadBossAutoScriptState,500);
  const loadFn = gm.indexOf('__wbLoadBossAutoScriptState', saveFn);
  const setTimeoutEnd = gm.indexOf(');', loadFn + 100);
  const blockEnd = setTimeoutEnd + 2;
  
  console.log('\n3. Handler block: start at', realStart, 'end at', blockEnd);
  const handlerBlock = gm.substring(realStart, blockEnd);
  console.log('  len=' + handlerBlock.length);
  gm = gm.substring(0, realStart) + gm.substring(blockEnd);
  console.log('  ✓');
}

// 3b. Merge ScriptStart into check handler
const scriptStartRef = '__wbBossAutoStart();var btn=document.getElementById';
const ssIdx = gm.indexOf(scriptStartRef);
if (ssIdx > 0) {
  if (!gm.includes('__wbBossAutoScriptStart();')) {
    gm = gm.replace(
      '__wbBossAutoStart();var btn=document.getElementById',
      '__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById'
    );
    console.log('\n3b. Added __wbBossAutoScriptStart() ✓');
  }
  
  // Add ScriptStop to uncheck
  if (!gm.includes('__wbBossAutoScriptStop();')) {
    gm = gm.replace(
      '__wbBossAutoStop();var btn=document.getElementById',
      '__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById'
    );
    console.log('3c. Added __wbBossAutoScriptStop() ✓');
  }
}

// 4. Add log HTML area before cooldown section
// Find a unique marker near the cooldown section
const cdText = '\\u51B7\\u537B\\u8A08\\u6642';
const cdIdx = gm.indexOf(cdText);
console.log('\n4. Cooldown section at', cdIdx);
if (cdIdx > 0) {
  // Go backwards to find the opening of the cooldown <div>
  const cdLine = gm.lastIndexOf(CR, cdIdx - 2);
  // The line before that should be the closing of the previous section
  const prevLine = gm.lastIndexOf(CR, cdLine - 2);
  // The log HTML should be inserted between '</div>' and the cooldown section
  const divCloseMarker = "'</div>'";
  const closeDivIdx = gm.lastIndexOf(divCloseMarker, cdLine);
  if (closeDivIdx > 0) {
    const logHtml =
      CR + "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
      "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR +
      "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
      "'</div>'+" + CR;
    
    // Insert after the '</div>' line
    let insertAfter = gm.indexOf(CR, closeDivIdx + 10);
    if (insertAfter > 0) {
      gm = gm.substring(0, insertAfter + 1) + logHtml + gm.substring(insertAfter + 1);
      console.log('  ✓ inserted log HTML area');
    }
  }
}

// 5. Add hunt buttons
const huntBody = '__gmp_hunt_body" style="max-height:300px;overflow-y:auto;padding:6px';
const hbIdx = gm.indexOf(huntBody);
console.log('\n5. Hunt body at', hbIdx);
if (hbIdx > 0) {
  // Find the closing </div> of the body
  const hbDiv = gm.indexOf('</div>', hbIdx + 50);
  // There are TWO </div> (body div + section div)
  const hbDiv2 = gm.indexOf('</div>', hbDiv + 10);
  // Find after the second '</div>'+
  let afterHunt = gm.indexOf(CR + CR, hbDiv2 + 10);
  if (afterHunt < 0) afterHunt = gm.indexOf(CR, hbDiv2 + 10);
  if (afterHunt > 0) afterHunt += CR.length;
  
  const huntButtons =
    "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
    "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+" + CR +
    "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+" + CR +
    "'</div>'+" + CR;
  
  gm = gm.substring(0, afterHunt) + huntButtons + gm.substring(afterHunt);
  console.log('  ✓ Added hunt buttons');
}

// 6. Add button handlers
const cfgRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cfgIdx = gm.indexOf(cfgRef);
console.log('\n6. Config btn at', cfgIdx);
if (cfgIdx > 0) {
  const handlers =
    "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.substring(0, cfgIdx) + handlers + gm.substring(cfgIdx);
  console.log('  ✓ Added handlers');
}

// ===== Write gm =====
write('game-monitor.js', gm);

// ===== wb-boss.js =====
let wb = origWb;

// 7. Replace DOM refs
let refCount = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log('\n7. Replaced', refCount, 'DOM refs in wb ✓');

// 8. Add selection functions
if (!wb.includes('__wbSelectedHuntId')) {
  const stateRef = "window.__wbBossAutoScript={";
  const stIdx = wb.indexOf(stateRef);
  if (stIdx > 0) {
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
    wb = wb.substring(0, stIdx) + selCode + wb.substring(stIdx);
    console.log('8. Added selection functions ✓');
  }
}

// 9. Update HuntListUI
const oldUiRef = '__wbMoveHuntItem';
const uiIdx = wb.indexOf('function __wbUpdateHuntListUI');
if (uiIdx > 0 && wb.indexOf(oldUiRef, uiIdx) > 0) {
  // Find the function body by brace counting
  let braceCount = 0;
  let fnStart = wb.indexOf('{', uiIdx);
  let fnEnd = -1;
  for (let i = fnStart; i < wb.length && i < fnStart + 3000; i++) {
    if (wb[i] === '{') braceCount++;
    if (wb[i] === '}') {
      braceCount--;
      if (braceCount === 0) { fnEnd = i + 1; break; }
    }
  }
  
  if (fnEnd > 0) {
    const newUI =
      "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';}});}";
    wb = wb.substring(0, uiIdx) + newUI + wb.substring(fnEnd);
    console.log('9. Updated HuntListUI ✓');
  }
}

// 10. Add log function
const restoreRef = 'function __wbBossAutoScriptRestoreFarm';
const rstIdx = wb.indexOf(restoreRef);
if (rstIdx > 0 && !wb.includes('__wbAddBossScriptLog')) {
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
  wb = wb.substring(0, rstIdx) + logFn + wb.substring(rstIdx);
  console.log('10. Added log function ✓');
}

// 11. Add log calls - using direct single-line search (no CRLF issues)
const wb2 = wb; // copy before modifications

// 11a. Add enter log
const enterConsole = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');";
const enterPhase = "window.__wbBossAutoScript.phase='entering';";
const enterClick = "try{foundBoss.click();}catch(e){}";

const ecIdx = wb.indexOf(enterConsole);
if (ecIdx > 0) {
  // Build the pattern by looking at actual characters
  const ecEnd = ecIdx + enterConsole.length;
  // Check if next chars start with phase
  let checkAfter = wb.substring(ecEnd);
  // Remove whitespace/newlines until we find phase
  let phaseIdx = checkAfter.indexOf(enterPhase);
  if (phaseIdx >= 0) {
    let afterPhase = phaseIdx + enterPhase.length;
    let clickIdx = checkAfter.indexOf(enterClick, afterPhase);
    if (clickIdx >= 0) {
      let afterClick = clickIdx + enterClick.length;
      const oldSeq = checkAfter.substring(0, afterClick);
      const newSeq = 
        CR + "      __wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      " + enterPhase + CR + "      " + enterClick;
      // Use substring to verify this is the actual match
      const checkStr = wb.substring(ecIdx, ecIdx + afterClick.length + 5);
      console.log('\n11a. Found enter log pattern at', ecIdx, 'len:', afterClick);
      wb = wb.substring(0, ecIdx) + 
        "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR +
        "      __wbAddBossScriptLog('進入世界王: '+target.name);" + CR +
        "      window.__wbBossAutoScript.phase='entering';" + CR +
        "      try{foundBoss.click();}catch(e){}" +
        wb.substring(ecIdx + afterClick);
      console.log('  ✓');
    }
  }
}

// 11b. Add respawn log - simpler approach: find unique phrases
if (wb.includes('__wbAddBossScriptLog(\'重生進入')) {
  console.log('11b. Respawn log already present ✓');
} else {
  // Find: try{foundBoss.click();}catch(e){}
  // followed by whitespace then window.__wbBossAutoScript.phase='attacking';
  const respClick = "try{foundBoss.click();}catch(e){}";
  const respPhase = "window.__wbBossAutoScript.phase='attacking';";
  
  let searchFrom = 0;
  let respCount = 0;
  while (true) {
    const rcIdx = wb.indexOf(respClick, searchFrom);
    if (rcIdx < 0) break;
    // Check if attacking follows after
    const afterRC = wb.substring(rcIdx + respClick.length);
    const ipIdx = afterRC.indexOf(respPhase);
    if (ipIdx >= 0 && ipIdx < 100) {
      const afterThis = rcIdx + respClick.length + ipIdx + respPhase.length;
      // Skip this one - it's for the regular enter, not the respawn
      // Respawn has: click + phase='attacking' (without 'entering' between)
      // Skip if 'entering' appears between click and phase
      const between = wb.substring(rcIdx, rcIdx + respClick.length + ipIdx);
      if (!between.includes('entering') && !between.includes('__wbAddBossScriptLog')) {
        wb = wb.substring(0, rcIdx) +
          respClick + CR +
          "      __wbAddBossScriptLog('重生進入: '+target.name);" + CR +
          "      " + respPhase +
          wb.substring(rcIdx + respClick.length + ipIdx + respPhase.length);
        respCount++;
      } else {
        searchFrom = rcIdx + 1;
        continue;
      }
    }
    searchFrom = rcIdx + 1;
  }
  console.log('11b. Added', respCount, 'respawn log calls ✓');
}

// 11c. Add defeat log
const defeatConsole = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
if (wb.includes(defeatConsole) && !wb.includes('__wbAddBossScriptLog(\'擊敗')) {
  wb = wb.replace(defeatConsole,
    defeatConsole + CR +
    "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');");
  console.log('11c. Added defeat log ✓');
}

// ===== Write wb =====
write('wb-boss.js', wb);

// ===== Validate =====
console.log('\n=== Validation ===');
try { new Function(gm); console.log('  game-monitor.js: OK (' + gm.length + 'b)'); }
catch(e) { console.log('  game-monitor.js: SYNTAX ERROR - ' + e.message.slice(0, 150)); }

try { new Function(wb); console.log('  wb-boss.js: OK (' + wb.length + 'b)'); }
catch(e) { console.log('  wb-boss.js: SYNTAX ERROR - ' + e.message.slice(0, 150)); }

console.log('\n=== Quick checks ===');
const checks = {
  'No auto_script checkbox': !gm.includes('auto_script" style'),
  'Has script_status': gm.includes('__gmp_boss_script_status'),
  'Has ScriptStart': gm.includes('__wbBossAutoScriptStart()'),
  'Has ScriptStop': gm.includes('__wbBossAutoScriptStop()'),
  'Has log area': gm.includes('__gmp_boss_script_log'),
  'Has hunt up button': gm.includes('__gmp_hunt_move_up'),
  'Has hunt down button': gm.includes('__gmp_hunt_move_down'),
  'Has handler for move': gm.includes('__wbMoveSelectedHuntItem'),
  'No old DOM ref in wb': !wb.includes("document.getElementById('__gmp_boss_auto_script')"),
  'New DOM ref in wb': wb.includes("document.getElementById('__gmp_boss_auto_enable')"),
  'Has __wbSelectedHuntId': wb.includes('__wbSelectedHuntId'),
  'Has __wbSelectHuntItem': wb.includes('__wbSelectHuntItem'),
  'Has __wbMoveSelectedHuntItem': wb.includes('__wbMoveSelectedHuntItem'),
  'Has __wbAddBossScriptLog': wb.includes('__wbAddBossScriptLog'),
};
let allOk = true;
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? '✓' : '✗'} ${k}`);
  if (!v) allOk = false;
}
console.log(allOk ? '\n✅ ALL OK' : '\n❌ SOME FAILED');
