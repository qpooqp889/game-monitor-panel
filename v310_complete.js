const fs = require('fs');

const ROOT = 'C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/';

function read(f) { return fs.readFileSync(ROOT + f, 'utf8'); }
function write(f, c) { fs.writeFileSync(ROOT + f, c, 'utf8'); }
function verify(f, content) {
  try { new Function(content); return 'OK'; }
  catch(e) { return 'FAIL: ' + e.message.slice(0, 120); }
}

// Helper: replace with CRLF matching. Since file uses \r\n, we build strings with \r\n
const CR = '\r\n';

let gm = read('game-monitor.js');
let wb = read('wb-boss.js');

// The file stores Unicode as literal escape sequences like: \uD83C\uDFAF (12 ASCII chars)
// In JavaScript, to match literal "\\uD83C\\uDFAF" in the source text, we use: '\\uD83C\\uDFAF'
const U = (n) => '\\u' + n;  // literal \uXXXX text

// Common sequences used in the HTML
const SCOPE = U('D83C') + U('DFAF');
const SWORD = U('2694') + U('FE0F');
const GEAR  = U('2699');
const DOT   = U('00B7');

function countReplacements(src, oldStr, newStr, label) {
  let count = 0;
  while (src.indexOf(oldStr) >= 0) { src = src.replace(oldStr, newStr); count++; }
  if (count === 0) {
    // Try with \n only (source might have both)
    const oLF = oldStr.split(CR).join('\n');
    const nLF = newStr.split(CR).join('\n');
    while (src.indexOf(oLF) >= 0) { src = src.replace(oLF, nLF); count++; }
  }
  if (count > 0) console.log('  ✓ ' + label + ' (' + count + ')');
  else console.log('  ✗ ' + label);
  return { result: src, count };
}

// ========================================================================
// A. game-monitor.js: Remove auto_script checkbox block
// ========================================================================
console.log('\n=== A. game-monitor.js: Auto-script checkbox ===');

// The auto_script checkbox spans 5 lines: opening div, input, label, span, closing div, plus blank line
// We need to match from "background:rgba(76,175,80,0.10);" through the closing </div>'+ and the blank CR before the next section
// The block is: <div style="display:flex..."><input ... id=__gmp_boss_auto_script> + label + span + </div> + blank
// Exactly findable by: the area between __gmpBossSection and the HP bar section

const SCRIPT_BLOCK_OPEN  = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 8px;background:rgba(76,175,80,0.10);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_script\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_script\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">" + SCOPE + " 自動BOSS腳本</label>'+" + CR +
"'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;\">" + DOT + " 閒置中</span>'+" + CR +
"'</div>'+" + CR + CR;

let r1 = countReplacements(gm, SCRIPT_BLOCK_OPEN, '', 'A1 Remove checkbox block');
gm = r1.result;

// ========================================================================
// B. game-monitor.js: Replace enable row (change colors, add script_status)
// ========================================================================
console.log('\n=== B. game-monitor.js: Enable row ===');

const OLD_ENABLE_ROW = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(233,69,96,0.12);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#e94560;font-weight:bold;cursor:pointer;\">" + SWORD + " 自動BOSS</label>'+" + CR +
"'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
"'<div style=\"flex:1;\"></div>'+" + CR +
"'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #e94560;color:#e94560;border-radius:4px;cursor:pointer;font-size:10px;\">" + GEAR + " 進階設定</button>'+" + CR +
"'</div>'+" + CR;

const NEW_ENABLE_ROW = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">" + SWORD + " 自動BOSS 自動腳本</label>'+" + CR +
"'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
"'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">" + DOT + " 閒置中</span>'+" + CR +
"'<div style=\"flex:1;\"></div>'+" + CR +
"'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">" + GEAR + " 進階設定</button>'+" + CR +
"'</div>'+" + CR;

let rB = countReplacements(gm, OLD_ENABLE_ROW, NEW_ENABLE_ROW, 'B1 Replace enable row');
gm = rB.result;

// ========================================================================
// C. game-monitor.js: Merge enable onchange handler (add auto script calls)
// ========================================================================
console.log('\n=== C. game-monitor.js: Handler merge ===');

const OLD_HANDLER = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='■ 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='⚡ 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='⚡ 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='▶ 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";

const NEW_HANDLER = "document.getElementById('__gmp_boss_auto_enable').onchange=function(){if(this.checked){__wbSyncAutoConfig();__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='■ 停止自動BOSS';btn.style.background='#e94560';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='⚡ 自動BOSS運行中...';s.style.color='#4ade80';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='⚡ 自動BOSS運行中...';ss.style.color='#4ade80';}}else{__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById('__gmp_boss_auto_btn');if(btn){btn.textContent='▶ 啟動自動BOSS';btn.style.background='#0f3460';}var s=document.getElementById('__gmp_boss_auto_status');if(s){s.textContent='停止中';s.style.color='#888';}var ss=document.getElementById('__gmp_boss_auto_status_short');if(ss){ss.textContent='停止中';ss.style.color='#888';}}}";

let rC = countReplacements(gm, OLD_HANDLER, NEW_HANDLER, 'C1 Merge handler');
gm = rC.result;

// ========================================================================
// D. game-monitor.js: Remove auto_script handler+save/load block
// ========================================================================
console.log('\n=== D. game-monitor.js: Remove script handler block ===');

const SCRIPT_HANDLER_BLOCK = "__gmp_boss_auto_script').onchange=function(){if(this.checked){__wbBossAutoScriptStart();}else{__wbBossAutoScriptStop();}__wbSaveBossAutoScriptState();};function __wbSaveBossAutoScriptState(){if(typeof window.__gmStorageSet==='undefined')return;var chk=document.getElementById('__gmp_boss_auto_script');window.__gmStorageSet('wb_auto_script_state',{enabled:chk?chk.checked:false}).catch(function(){});}function __wbLoadBossAutoScriptState(){if(typeof window.__gmStorageGet==='undefined')return Promise.resolve();return window.__gmStorageGet(['wb_auto_script_state']).then(function(r){var s=r&&r.wb_auto_script_state||null;if(s){var chk=document.getElementById('__gmp_boss_auto_script');if(chk)chk.checked=s.enabled;if(s.enabled)setTimeout(__wbBossAutoScriptStart,800);}}).catch(function(){});}setTimeout(__wbLoadBossAutoScriptState,500);";

let rD = countReplacements(gm, SCRIPT_HANDLER_BLOCK, '', 'D1 Remove handler block');
gm = rD.result;

// ========================================================================
// E. game-monitor.js: Add script log area & hunt buttons & handlers
// ========================================================================
console.log('\n=== E. game-monitor.js: Add HTML elements ===');

// E1: Add script log area before cooldown section
const LOG_AREA = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
"'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">" + U('25B6') + " 自動BOSS日誌</div>'+" + CR +
"'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
"'</div>'+" + CR;

// Insert before "冷卻計時" section
const COOLDOWN_MARKER = "// === " + U('51B7') + U('537B') + U('8A08') + U('6642') + " ===";
const cdIdx = gm.indexOf(COOLDOWN_MARKER);
if (cdIdx > 0) {
  const beforeCloseDiv = gm.lastIndexOf("'</div>'+" + CR, cdIdx);
  if (beforeCloseDiv > 0 && gm.lastIndexOf("'</div>'+" + CR, beforeCloseDiv - 1) > 0) {
    const prevClose = gm.lastIndexOf("'</div>'+" + CR, beforeCloseDiv - 1);
    // Bug: this insertion is complex. Let me use: find the closing of the mobs section then the blank line
    // Actually, just insert LOG_AREA before the COOLDOWN_MARKER's section
    // Find the line before "冷卻計時":
    const cdSection = "// === " + U('51B7') + U('537B') + U('8A08') + U('6642') + " ===" + CR +
      "'<div style=\"margin-bottom:8px;\">'+" + CR +
      "'<div style=\"font-size:10px;color:#888;margin-bottom:4px;\">冷卻計時</div>";
    // Actually let me just insert between two sections.
    // After the hunt list section and before cooldown, there's: '</div>'+ CR '// === 冷卻計時 ==='
    const cdSectionStart = "'<div style=\"margin-bottom:8px;\">'+" + CR +
      "'<div style=\"font-size:10px;color:#888;margin-bottom:4px;\">" + U('51B7') + U('537B') + U('8A08') + U('6642') + "</div>";
    gm = gm.replace(cdSectionStart, cdSectionStart + LOG_AREA);
    console.log('  ✓ E1 Add log area');
  } else {
    console.log('  ✗ E1 Insert point not found');
  }
} else {
  console.log('  ✗ E1 Cooldown marker not found');
}

// E2: Add hunt ▲▼ buttons after hunt body
const HUNT_BODY_CLOSE = "'<div id=\"__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px;\">'+" + CR +
"'<div id=\"__gmp_hunt_list\" style=\"font-size:10px;color:#555;padding:6px;text-align:center;\">" + U('70B9') + U('9009') + U('4E0A') + U('65B9') + U('4E16') + U('754C') + U('738B') + " [+] " + U('52A0') + U('5165') + "</div>'+" + CR +
"'</div>'+" + CR +
"'</div>'+" + CR;

const HUNT_BUTTONS = "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
"'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">" + U('25B2') + " 上移</button>'+" + CR +
"'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">" + U('25BC') + " 下移</button>'+" + CR +
"'</div>'+" + CR;

let rE2 = countReplacements(gm, HUNT_BODY_CLOSE, HUNT_BODY_CLOSE + HUNT_BUTTONS, 'E2 Add hunt buttons');
gm = rE2.result;

// E3: Add button click handlers before config_btn.onclick
const CONFIG_BTN_REF = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cbIdx = gm.indexOf(CONFIG_BTN_REF);
if (cbIdx > 0) {
  const handlers = CR + "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.slice(0, cbIdx) + handlers + gm.slice(cbIdx);
  console.log('  ✓ E3 Add button handlers');
} else {
  console.log('  ✗ E3 Config btn not found');
}

// ========================================================================
// F. wb-boss.js: Replace __gmp_boss_auto_script refs with __gmp_boss_auto_enable
// ========================================================================
console.log('\n=== F. wb-boss.js: Ref updates ===');

let rF = countReplacements(wb, "document.getElementById('__gmp_boss_auto_script')",
  "document.getElementById('__gmp_boss_auto_enable')", 'F1 Replace DOM refs');
wb = rF.result;

// ========================================================================
// G. wb-boss.js: Add __wbSelectedHuntId + selection functions
// ========================================================================
console.log('\n=== G. wb-boss.js: Selection functions ===');

const STATE_REF = "window.__wbBossAutoScript={";
const sIdx = wb.indexOf(STATE_REF);
if (sIdx > 0) {
  const SEL_CODE = CR + "// Selected hunt item for outer ▲▼ buttons" + CR +
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
  wb = wb.slice(0, sIdx) + SEL_CODE + wb.slice(sIdx);
  console.log('  ✓ G1 Selection functions');
} else {
  console.log('  ✗ G1 State ref not found');
}

// ========================================================================
// H. wb-boss.js: Update __wbUpdateHuntListUI with selection highlighting
// ========================================================================
console.log('\n=== H. wb-boss.js: Hunt list UI ===');

const OLD_UI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var upBtn=idx>0?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',-1)\">\u25B2</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25B2</span>';var dnBtn=idx<list.length-1?'<span style=\"font-size:9px;color:#aaa;cursor:pointer;min-width:14px;text-align:center;\" onclick=\"__wbMoveHuntItem(\\''+i.id+'\\',1)\">\u25BC</span>':'<span style=\"font-size:9px;color:#333;min-width:14px;text-align:center;\">\u25BC</span>';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:rgba(76,175,80,0.08);border-radius:5px;margin-bottom:2px;border-left:3px solid #4caf50;\">'+upBtn+dnBtn+'<span style=\"font-size:10px;color:#4caf50;min-width:18px;cursor:pointer;\" onclick=\"__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

const NEW_UI = "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';}});}";

let rH = countReplacements(wb, OLD_UI, NEW_UI, 'H1 Update UI function');
wb = rH.result;

// ========================================================================
// I. wb-boss.js: Add __wbAddBossScriptLog function + log calls
// ========================================================================
console.log('\n=== I. wb-boss.js: Log function + calls ===');

// I1: Add log function before RestoreFarm
const RESTORE_FARM = 'function __wbBossAutoScriptRestoreFarm';
const rfIdx = wb.indexOf(RESTORE_FARM);
if (rfIdx > 0) {
  const LOG_FN = CR + "function __wbAddBossScriptLog(msg){" + CR +
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
  wb = wb.slice(0, rfIdx) + LOG_FN + wb.slice(rfIdx);
  console.log('  ✓ I1 Add log function');
} else {
  console.log('  ✗ I1 RestoreFarm not found');
}

// I2: Add log calls for enter, respawn, defeated
// These use actual Chinese characters (not escape sequences), should match as-is
const ENTER_LOG = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR +
  "      __wbAddBossScriptLog('進入世界王: '+target.name);" + CR +
  "      window.__wbBossAutoScript.phase='entering';" + CR +
  "      try{foundBoss.click();}catch(e){}";

// Find the exact pattern - need to match "is ALIVE, entering..." + click
const ENTER_PATTERN = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR +
  "      window.__wbBossAutoScript.phase='entering';" + CR +
  "      try{foundBoss.click();}catch(e){}";

let rI2 = countReplacements(wb, ENTER_PATTERN, ENTER_LOG, 'I2 Add enter log');
wb = rI2.result;

const RESPAWN_PATTERN = "try{foundBoss.click();}catch(e){}" + CR +
  "      window.__wbBossAutoScript.phase='attacking';";
const RESPAWN_LOG = "try{foundBoss.click();}catch(e){}" + CR +
  "      __wbAddBossScriptLog('重生進入: '+target.name);" + CR +
  "      window.__wbBossAutoScript.phase='attacking';";

let rI3 = countReplacements(wb, RESPAWN_PATTERN, RESPAWN_LOG, 'I3 Add respawn log');
wb = rI3.result;

const DEFEAT_PATTERN = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
const DEFEAT_LOG = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');" + CR +
  "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');";

let rI4 = countReplacements(wb, DEFEAT_PATTERN, DEFEAT_LOG, 'I4 Add defeat log');
wb = rI4.result;

// ========================================================================
// Write and validate
// ========================================================================
console.log('\n=== Write & Validate ===');
write('game-monitor.js', gm);
write('wb-boss.js', wb);
console.log('  game-monitor.js: ' + verify('game-monitor.js', gm) + ' (' + gm.length + 'b)');
console.log('  wb-boss.js:      ' + verify('wb-boss.js', wb) + ' (' + wb.length + 'b)');

console.log('\n=== Checks ===');
const checks = [
  ['__gmp_boss_auto_script in gm', gm.indexOf('__gmp_boss_auto_script') >= 0, true],
  ['__gmp_boss_script_status in gm (single)', gm.indexOf('__gmp_boss_script_status') >= 0, true],
  ['__wbBossAutoScriptStart() in handler', gm.indexOf('__wbBossAutoScriptStart()') >= 0, true],
  ['__wbBossAutoScriptStop() in handler', gm.indexOf('__wbBossAutoScriptStop()') >= 0, true],
  ['__gmp_boss_script_log div', gm.indexOf('__gmp_boss_script_log') >= 0, true],
  ['__gmp_hunt_move_up button', gm.indexOf('__gmp_hunt_move_up') >= 0, true],
  ['__gmp_hunt_move_down button', gm.indexOf('__gmp_hunt_move_down') >= 0, true],
  ['__wbSelectHuntItem in gm handler', gm.indexOf('__wbSelectHuntItem') >= 0, true],
  ['__wbMoveSelectedHuntItem in gm handler', gm.indexOf('__wbMoveSelectedHuntItem') >= 0, true],
  ['__gmp_boss_auto_script in wb', wb.indexOf("document.getElementById('__gmp_boss_auto_script')") >= 0, false],
  ['__gmp_boss_auto_enable in wb refs', wb.indexOf("document.getElementById('__gmp_boss_auto_enable')") >= 0, true],
  ['__wbSelectedHuntId in wb', wb.indexOf('__wbSelectedHuntId') >= 0, true],
  ['__wbSelectHuntItem in wb', wb.indexOf('__wbSelectHuntItem') >= 0, true],
  ['__wbMoveSelectedHuntItem in wb', wb.indexOf('__wbMoveSelectedHuntItem') >= 0, true],
  ['__wbAddBossScriptLog in wb', wb.indexOf('__wbAddBossScriptLog') >= 0, true],
];

let allOK = true;
checks.forEach(([label, actual, expected]) => {
  const status = actual === expected ? 'OK' : 'FAIL';
  if (status === 'FAIL') allOK = false;
  console.log('  ' + status + ': ' + label + (actual !== expected ? ' (expected=' + expected + ', actual=' + actual + ')' : ''));
});

if (allOK) console.log('\n✅ ALL CHECKS PASS');
else console.log('\n❌ SOME CHECKS FAILED - manual review needed');
