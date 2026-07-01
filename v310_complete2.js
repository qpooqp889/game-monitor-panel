const fs = require("fs");
const CR = "\r\n";

const DIR = "C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/";
function read(f) { return fs.readFileSync(DIR + f, "utf8"); }
function write(f, c) { return fs.writeFileSync(DIR + f, c, "utf8"); }
function syntaxOk(c) { try { new Function(c); return true; } catch(e) { return false; } }

// ===== 1-2. game-monitor.js: HTML edits =====
let gm = read("game-monitor.js");

// 1. Remove auto_script checkbox block
const sIdx = gm.indexOf("__gmp_boss_auto_script\"");
const asIdx = gm.indexOf("background:rgba(76,175,80,0.10)", sIdx - 200);
const divOpenIdx = gm.lastIndexOf("'<div", asIdx);
const closeDivIdx = gm.indexOf("'</div>'", asIdx);
const afterClose = closeDivIdx + 8;
const afterNewlines = gm.indexOf("'<div", afterClose);
if (afterNewlines > 0) {
  gm = gm.substring(0, divOpenIdx) + gm.substring(afterNewlines);
  console.log("1. Removed auto_script checkbox ✓");
}

// 2. Replace enable row green + merged label
const enIdx = gm.indexOf("__gmp_boss_auto_enable\"");
const enDiv = gm.indexOf("rgba(233,69,96,0.12)", enIdx - 200);
const enDivOpen = gm.lastIndexOf("'<div", enDiv);
const enDivClose = gm.indexOf("'</div>'", enDiv);
const afterEnDiv = enDivClose + 8;
const nextContent = gm.indexOf("'<div", afterEnDiv);
if (nextContent > 0) {
  const newBlock = 
    "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
    "'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
    "'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\\u2694\\uFE0F 自動BOSS 自動腳本</label>'+" + CR +
    "'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+" + CR +
    "'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\\u00B7 閒置中</span>'+" + CR +
    "'<div style=\"flex:1;\"></div>'+" + CR +
    "'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\\u2699 進階設定</button>'+" + CR +
    "'</div>'+" + CR;
  gm = gm.substring(0, enDivOpen) + newBlock + gm.substring(nextContent);
  console.log("2. Replaced enable row ✓");
}

// 3. Remove auto_script handler block
// Find `function __wbSaveBossAutoScriptState`
const saveFn = gm.indexOf("function __wbSaveBossAutoScriptState");
if (saveFn > 0) {
  // Go back to find the start (onchange handler for __gmp_boss_auto_script)
  const handlerRef = gm.lastIndexOf("__gmp_boss_auto_script", saveFn);
  const handlerStart = gm.lastIndexOf(CR, handlerRef - 5);
  // Find end: after setTimeout(__wbLoadBossAutoScriptState,500);
  const loadFn = gm.indexOf("__wbLoadBossAutoScriptState", saveFn);
  const setEnd = gm.indexOf(");", loadFn + 100);
  const blockEnd = setEnd + 2 + CR.length;
  
  gm = gm.substring(0, handlerStart) + gm.substring(blockEnd);
  console.log("3. Removed auto_script handler ✓");
}

// 3b. Merge ScriptStart/ScriptStop into main handler
if (!gm.includes("__wbBossAutoScriptStart();")) {
  gm = gm.replace(
    "__wbBossAutoStart();var btn=document.getElementById",
    "__wbBossAutoStart();__wbBossAutoScriptStart();var btn=document.getElementById"
  );
  gm = gm.replace(
    "__wbBossAutoStop();var btn=document.getElementById",
    "__wbBossAutoStop();__wbBossAutoScriptStop();var btn=document.getElementById"
  );
  console.log("3b. Merged handler calls ✓");
} else {
  console.log("3b. Handler already merged ✓");
}

// 4. Add log HTML area before cooldown section
const cdText = "// === \\u51B7\\u537B\\u8A08\\u6642 ===";
const cdIdx = gm.indexOf(cdText);
if (cdIdx > 0) {
  const logHtml = 
    "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
    "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR +
    "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
    "'</div>'+" + CR;
  
  // Insert before the cdText line
  const insertPoint = cdIdx;
  gm = gm.substring(0, insertPoint) + logHtml + gm.substring(insertPoint);
  console.log("4. Added log HTML ✓");
} else {
  console.log("4. Cooldown text not found, trying alternative...");
  // Try simpler marker
  const cdAlt = "冷卻計時";
  const cdIdx2 = gm.indexOf(cdAlt);
  if (cdIdx2 > 0) {
    // This appears in JS strings. Need to find the comment line
    const cdComment = gm.lastIndexOf("// ===", cdIdx2 - 100);
    if (cdComment > 0) {
      const cdLine = gm.lastIndexOf(CR, cdComment - 2);
      const logHtml = 
        "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
        "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR +
        "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR +
        "'</div>'+" + CR;
      gm = gm.substring(0, cdLine) + logHtml + gm.substring(cdLine);
      console.log("4b. Added log HTML ✓");
    }
  }
}

// 5. Add hunt buttons after hunt body
const huntBody = '__gmp_hunt_body" style="max-height:300px;overflow-y:auto;padding:6px';
const hbIdx = gm.indexOf(huntBody);
if (hbIdx > 0) {
  // Find the closing </div> of the body
  const hbInner = gm.indexOf("</div>", hbIdx + 60);
  const hbOuter = gm.indexOf("'</div>'", hbInner);
  const afterHunt = gm.indexOf("'<div", hbOuter + 10);
  
  if (afterHunt > 0) {
    const huntButtons = 
      "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
      "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+" + CR +
      "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+" + CR +
      "'</div>'+" + CR;
    // Insert right before the next section (after the hunt container closing)
    gm = gm.substring(0, afterHunt) + huntButtons + gm.substring(afterHunt);
    console.log("5. Added hunt buttons ✓");
  }
}

// 6. Add button handlers before config_btn.onclick
const cfgRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cfgIdx = gm.indexOf(cfgRef);
if (cfgIdx > 0) {
  const handlers = 
    "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.substring(0, cfgIdx) + handlers + gm.substring(cfgIdx);
  console.log("6. Added button handlers ✓");
}

// 7. wb-boss.js: Replace DOM refs
let wb = read("wb-boss.js");
let refCount = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log("7. Replaced " + refCount + " DOM refs ✓");

// 8. Add selection functions
if (!wb.includes("__wbSelectedHuntId")) {
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
    console.log("8. Added selection functions ✓");
  }
}

// 9. Update HuntListUI
const uiIdx = wb.indexOf("function __wbUpdateHuntListUI");
if (uiIdx > 0) {
  // Check if it still has old per-item arrows
  if (wb.indexOf("__wbMoveHuntItem", uiIdx) > 0) {
    // Find function body
    let braceCount = 0;
    let fnBodyStart = wb.indexOf("{", uiIdx);
    if (fnBodyStart > 0) {
      let fnBodyEnd = -1;
      for (let i = fnBodyStart; i < wb.length && i < fnBodyStart + 3000; i++) {
        if (wb[i] === "{") braceCount++;
        if (wb[i] === "}") { braceCount--; if (braceCount === 0) { fnBodyEnd = i + 1; break; } }
      }
      if (fnBodyEnd > 0) {
        const newUI = 
          "function __wbUpdateHuntListUI(){var el=document.getElementById('__gmp_hunt_list');var countEl=document.getElementById('__gmp_hunt_count');if(!el)return;__wbGetHuntList(function(list){if(countEl)countEl.textContent=list.length+'\\u53ea';if(list.length){el.innerHTML=list.map(function(i,idx){var isSel=window.__wbSelectedHuntId===i.id;var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';}).join('');}else{el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';}});}";
        wb = wb.substring(0, uiIdx) + newUI + wb.substring(fnBodyEnd);
        console.log("9. Updated HuntListUI ✓");
      }
    }
  } else {
    console.log("9. HuntListUI already updated ✓");
  }
}

// 10. Add log function
if (!wb.includes("__wbAddBossScriptLog")) {
  const restoreRef = "function __wbBossAutoScriptRestoreFarm";
  const rstIdx = wb.indexOf(restoreRef);
  if (rstIdx > 0) {
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
    console.log("10. Added log function ✓");
  }
}

// 11. Add log calls
if (!wb.includes("__wbAddBossScriptLog('進入")) {
  // 11a. Enter log (unique: is ALIVE + phase=entering + click + phase=attacking)
  const enterText = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');";
  const ecIdx = wb.indexOf(enterText);
  if (ecIdx > 0) {
    const afterEnter = ecIdx + enterText.length;
    const phaseText = "window.__wbBossAutoScript.phase='entering';";
    const clickText = "try{foundBoss.click();}catch(e){}";
    const attackText = "window.__wbBossAutoScript.phase='attacking';";
    
    const afterEnterSlice = wb.substring(afterEnter);
    const phaseIdx = afterEnterSlice.indexOf(phaseText);
    const clickIdx = afterEnterSlice.indexOf(clickText, phaseIdx + phaseText.length);
    const attackIdx = afterEnterSlice.indexOf(attackText, clickIdx + clickText.length);
    
    if (attackIdx > 0 && attackIdx < 200) {
      const totalLen = attackIdx + attackText.length;
      const replaced = 
        "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');" + CR +
        "      __wbAddBossScriptLog('進入世界王: '+target.name);" + CR +
        "      window.__wbBossAutoScript.phase='entering';" + CR +
        "      try{foundBoss.click();}catch(e){}" + CR +
        "      window.__wbBossAutoScript.phase='attacking';";
      wb = wb.substring(0, ecIdx) + replaced + wb.substring(ecIdx + totalLen);
      console.log("11a. Added enter log ✓");
    } else {
      // Simpler: just insert log line after console.log
      // Insert __wbAddBossScriptLog line BEFORE phase='entering'
      const pIdxLocal = afterEnterSlice.indexOf("window.__wbBossAutoScript.phase='entering';");
      if (pIdxLocal >= 0) {
        const insertPoint = ecIdx + enterText.length + pIdxLocal;
        wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      " + wb.substring(insertPoint);
        console.log("11a. Added enter log (alt) ✓");
      }
    }
  }
}

if (!wb.includes("__wbAddBossScriptLog('重生")) {
  // 11b. Respawn log: unique marker "defeated! Respawn and re-enter"
  const defText = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
  const defIdx = wb.indexOf(defText);
  if (defIdx > 0) {
    wb = wb.substring(0, defIdx) + 
      "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');" + CR +
      "    __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');" +
      wb.substring(defIdx + defText.length);
    console.log("11b. Added defeat log ✓");
  }
}

if (!wb.includes("__wbAddBossScriptLog('重生進入")) {
  // 11c. Respawn enter log: "Respawn and re-enter" section, where foundBoss.click() then phase='attacking'
  // This is the SECOND try{foundBoss.click()} in the section (after respawn, not first entry)
  // Search from after the defeat log
  const raIdx = wb.indexOf("Respawn and re-enter", wb.length / 2);
  if (raIdx > 0) {
    const afterRa = wb.substring(raIdx);
    const rClick = "try{foundBoss.click();}catch(e){}";
    const rcIdxLocal = afterRa.indexOf(rClick);
    if (rcIdxLocal >= 0) {
      const raPhase = "window.__wbBossAutoScript.phase='attacking';";
      const rpIdxLocal = afterRa.indexOf(raPhase, rcIdxLocal + rClick.length);
      if (rpIdxLocal >= 0) {
        const insertPoint = raIdx + rpIdxLocal;
        wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('重生進入: '+target.name);" + CR + "      " + wb.substring(insertPoint);
        console.log("11c. Added respawn log ✓");
      }
    }
  }
}

// ===== Write files =====
write("game-monitor.js", gm);
write("wb-boss.js", wb);

console.log("\n=== Write & Validate ===");
const gmOk = syntaxOk(gm);
const wbOk = syntaxOk(wb);
console.log("game-monitor.js: " + (gmOk ? "OK" : "SYNTAX ERROR") + " (" + gm.length + "b)");
console.log("wb-boss.js:      " + (wbOk ? "OK" : "SYNTAX ERROR") + " (" + wb.length + "b)");

console.log("\n=== Verification ===");
const checks = {
  "No auto_script checkbox HTML": !gm.includes('__gmp_boss_auto_script" style'),
  "Has script_status": gm.includes("__gmp_boss_script_status"),
  "Has ScriptStart in handler": gm.includes("__wbBossAutoScriptStart()"),
  "Has ScriptStop in handler": gm.includes("__wbBossAutoScriptStop()"),
  "Has log area": gm.includes("__gmp_boss_script_log"),
  "Has hunt up": gm.includes("__gmp_hunt_move_up"),
  "Has hunt down": gm.includes("__gmp_hunt_move_down"),
  "Has move handler": gm.includes("__wbMoveSelectedHuntItem"),
  "No old DOM ref in wb": !wb.includes("document.getElementById('__gmp_boss_auto_script')"),
  "New DOM ref in wb": wb.includes("document.getElementById('__gmp_boss_auto_enable')"),
  "Has __wbSelectedHuntId": wb.includes("__wbSelectedHuntId"),
  "Has __wbSelectHuntItem": wb.includes("__wbSelectHuntItem"),
  "Has __wbMoveSelectedHuntItem": wb.includes("__wbMoveSelectedHuntItem"),
  "Has __wbAddBossScriptLog": wb.includes("__wbAddBossScriptLog"),
  "Has enter log call": wb.includes("__wbAddBossScriptLog('進入"),
  "Has defeat log call": wb.includes("__wbAddBossScriptLog('擊敗"),
  "Has respawn log call": wb.includes("__wbAddBossScriptLog('重生"),
};

let allOk = true;
for (const [k, v] of Object.entries(checks)) {
  console.log("  " + (v ? "✓" : "✗") + " " + k);
  if (!v) allOk = false;
}
console.log(allOk ? "\n✅ ALL CHECKS PASSED" : "\n❌ SOME FAILED");

// Show gm errors if any
if (!gmOk) {
  console.log("\n=== Syntax error details ===");
  try { new Function(gm); } catch(e) { console.log(e.message.substring(0, 200)); }
}
