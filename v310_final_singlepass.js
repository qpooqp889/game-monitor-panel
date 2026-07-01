const fs = require("fs");
const DIR = "C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/";

let gm = fs.readFileSync(DIR + "game-monitor.js", "utf8");
let wb = fs.readFileSync(DIR + "wb-boss.js", "utf8");
const CR = "\r\n";

// ========== STEP 1: Remove auto_script checkbox block ==========
const asDiv = gm.indexOf("__gmp_boss_auto_script");
const asDivStart = gm.lastIndexOf("'<div", asDiv);
const asDivEnd = gm.indexOf("'</div>'", asDiv) + 8;
gm = gm.substring(0, asDivStart) + gm.substring(asDivEnd);
console.log("1. Removed auto_script checkbox ✓");

// ========== STEP 2: Replace enable row with merged green theme ==========
const enDiv = gm.indexOf("__gmp_boss_auto_enable");
const enDivStart = gm.lastIndexOf("'<div", enDiv);
const enDivEnd = gm.indexOf("'</div>'", enDiv) + 8;

const newRow = "'<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:8px;background:rgba(76,175,80,0.12);border-radius:6px;\">'+" + CR +
"'<input type=\"checkbox\" id=\"__gmp_boss_auto_enable\" style=\"width:16px;height:16px;cursor:pointer;\">'+" + CR +
"'<label for=\"__gmp_boss_auto_enable\" style=\"font-size:12px;color:#4caf50;font-weight:bold;cursor:pointer;\">\u2694\uFE0F 自動BOSS 自動腳本</label>'+' + CR +
"'<span id=\"__gmp_boss_auto_status_short\" style=\"font-size:10px;color:#888;\">停止中</span>'+' + CR +
"'<span id=\"__gmp_boss_script_status\" style=\"font-size:9px;color:#888;margin-left:4px;\">\u00B7 閒置中</span>'+' + CR +
"'<div style=\"flex:1;\"></div>'+' + CR +
"'<button id=\"__gmp_boss_auto_config_btn\" style=\"padding:4px 8px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;\">\u2699 進階設定</button>'+' + CR +
"'</div>'+";

// Find the end of the existing row - it's '</div>'+ immediately followed by something
const nextContent = gm.indexOf("'+", enDivEnd);
if (nextContent >= 0 && nextContent - enDivEnd < 5) {
  gm = gm.substring(0, enDivStart) + newRow + gm.substring(nextContent + 2);
  // Remove leading newline after replacement
} else {
  gm = gm.substring(0, enDivStart) + newRow + gm.substring(enDivEnd);
}
console.log("2. Replaced enable row ✓");

// ========== STEP 3: Remove auto_script handler blocks ==========
let removed = 0;
while (true) {
  const handlerRef = gm.indexOf("__gmp_boss_auto_script");
  if (handlerRef < 0) break;
  // Find the block: onchange handler for __gmp_boss_auto_script
  const lineRef = gm.lastIndexOf(CR, handlerRef - 5);
  // Find end of this handler block
  // It ends with: setTimeout(__wbLoadBossAutoScriptState,500);
  const loadRef = gm.indexOf("__wbLoadBossAutoScriptState", handlerRef);
  const setEnd = gm.indexOf(");", loadRef + 30) + 2;
  const lineEnd = gm.indexOf(CR, setEnd);
  if (lineRef > 0 && lineEnd > 0) {
    gm = gm.substring(0, lineRef) + gm.substring(lineEnd);
    removed++;
  } else break;
}
console.log("3. Removed " + removed + " handler block(s) ✓");

// ========== STEP 4: Add ScriptStart/ScriptStop ==========
// Find the enable handler's __wbSyncAutoConfig() line
const syncLine = "      __wbSyncAutoConfig();" + CR + "      __wbBossAutoStart();";
const syncRepl = "      __wbSyncAutoConfig();" + CR + "      __wbBossAutoStart();__wbBossAutoScriptStart();";
if (gm.includes(syncLine)) {
  gm = gm.replace(syncLine, syncRepl);
}

// Stop
const stopLine1 = "__wbBossAutoStop();\r\n      var btn=document.getElementById('__gmp_boss_auto_btn');";
const stopRepl1 = "__wbBossAutoStop();__wbBossAutoScriptStop();\r\n      var btn=document.getElementById('__gmp_boss_auto_btn');";
const stopLine2 = "__wbBossAutoStop();\r\n      this.textContent='\u25B6 \u555F\u52D5\u81EA\u52D5BOSS';";
const stopRepl2 = "__wbBossAutoStop();__wbBossAutoScriptStop();\r\n      this.textContent='\u25B6 \u555F\u52D5\u81EA\u52D5BOSS';";

if (gm.includes(stopLine1)) gm = gm.replace(stopLine1, stopRepl1);
if (gm.includes(stopLine2)) gm = gm.replace(stopLine2, stopRepl2);
console.log("4. Added ScriptStart/ScriptStop ✓");

// ========== STEP 5: Add log HTML before冷却计时 ==========
const cdComment = "    // === 冷卻計時 ===";
const cdIdx = gm.indexOf(cdComment);
if (cdIdx > 0) {
  const logHtml = "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR +
"'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\u25B6 自動BOSS日誌</div>'+' + CR +
"'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+' + CR +
"'</div>'+' + CR +
"    // === 冷卻計時 ===";
  gm = gm.substring(0, cdIdx) + logHtml + gm.substring(cdIdx + cdComment.length);
  console.log("5. Added log HTML ✓");
}

// ========== STEP 6: Add hunt buttons ==========
const huntBody = "__gmp_hunt_body\" style=\"max-height:300px;overflow-y:auto;padding:6px";
const hbIdx = gm.indexOf(huntBody);
if (hbIdx > 0) {
  const hbClose = gm.indexOf("'</div>'", hbIdx + 60);
  const nextDiv = gm.indexOf("'<div", hbClose + 10);
  if (nextDiv > 0) {
    const huntBtns = "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR +
"'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\u25B2 上移</button>'+' + CR +
"'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\u25BC 下移</button>'+' + CR +
"'</div>'+' + CR;
    gm = gm.substring(0, nextDiv) + huntBtns + gm.substring(nextDiv);
    console.log("6. Added hunt buttons ✓");
  }
}

// ========== STEP 7: Add button handlers ==========
const cfgRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cfgIdx = gm.indexOf(cfgRef);
if (cfgIdx > 0) {
  const handlers = "  // === Hunt list ▲▼ buttons ===" + CR +
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR +
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR;
  gm = gm.substring(0, cfgIdx) + handlers + gm.substring(cfgIdx);
  console.log("7. Added button handlers ✓");
}

fs.writeFileSync(DIR + "game-monitor.js", gm, "utf8");

// ========== STEP 8: Replace old DOM refs in wb ==========
let refCount = 0;
const oldRef = "document.getElementById('__gmp_boss_auto_script')";
while (wb.includes(oldRef)) {
  wb = wb.replace(oldRef, "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log("8. Replaced " + refCount + " DOM refs ✓");

// ========== STEP 9: Add selection functions ==========
if (!wb.includes("__wbSelectedHuntId")) {
  const stIdx = wb.indexOf("window.__wbBossAutoScript={");
  if (stIdx > 0) {
    const selCode = CR +
      "// Selected hunt item for outer ▲▼ buttons"+ CR +
      "window.__wbSelectedHuntId=null;"+ CR +
      CR +
      "function __wbSelectHuntItem(id){"+ CR +
      "  window.__wbSelectedHuntId=id;"+ CR +
      "  __wbUpdateHuntListUI();"+ CR +
      "}"+ CR +
      CR +
      "function __wbMoveSelectedHuntItem(dir){"+ CR +
      "  __wbGetHuntList(function(list){"+ CR +
      "    var selIdx=-1;"+ CR +
      "    if(window.__wbSelectedHuntId){"+ CR +
      "      selIdx=list.findIndex(function(i){return i.id===window.__wbSelectedHuntId;});"+ CR +
      "    }"+ CR +
      "    if(selIdx<0){"+ CR +
      "      if(list.length){window.__wbSelectedHuntId=list[0].id;__wbUpdateHuntListUI();}"+ CR +
      "      return;"+ CR +
      "    }"+ CR +
      "    var newIdx=selIdx+dir;"+ CR +
      "    if(newIdx<0||newIdx>=list.length)return;"+ CR +
      "    var tmp=list[selIdx];"+ CR +
      "    list[selIdx]=list[newIdx];"+ CR +
      "    list[newIdx]=tmp;"+ CR +
      "    window.__wbSelectedHuntId=list[newIdx].id;"+ CR +
      "    __wbSaveHuntList(list,function(){"+ CR +
      "      __wbUpdateHuntListUI();"+ CR +
      "      __wbUpdateWorldBossUI();"+ CR +
      "    });"+ CR +
      "  });"+ CR +
      "}"+ CR;
    wb = wb.substring(0, stIdx) + selCode + wb.substring(stIdx);
    console.log("9. Added selection functions ✓");
  }
}

// ========== STEP 10: Update HuntListUI ==========
const uiIdx = wb.indexOf("function __wbUpdateHuntListUI");
if (uiIdx > 0) {
  // Find function body end
  let braceCount = 0;
  const fnBodyStart = wb.indexOf("{", uiIdx);
  let fnBodyEnd = -1;
  for (let i = fnBodyStart; i < wb.length && i < fnBodyStart + 3000; i++) {
    if (wb[i] === "{") braceCount++;
    if (wb[i] === "}") { braceCount--; if (braceCount === 0) { fnBodyEnd = i + 1; break; } }
  }
  if (fnBodyEnd > 0) {
    const newUI = "function __wbUpdateHuntListUI(){" + CR +
      "var el=document.getElementById('__gmp_hunt_list');" + CR +
      "var countEl=document.getElementById('__gmp_hunt_count');" + CR +
      "if(!el)return;" + CR +
      "__wbGetHuntList(function(list){" + CR +
      "  if(countEl)countEl.textContent=list.length+'\u53ea';" + CR +
      "  if(list.length){" + CR +
      "    el.innerHTML=list.map(function(i,idx){" + CR +
      "      var isSel=window.__wbSelectedHuntId===i.id;" + CR +
      "      var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';" + CR +
      "      var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';" + CR +
      "      return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';" + CR +
      "    }).join('');" + CR +
      "  }else{" + CR +
      "    el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\u70b9\u9009\u4e0a\u65b9\u4e16\u754c\u738B [+] \u52A0\u5165</div>';" + CR +
      "  }" + CR +
      "});" + CR +
      "}";
    wb = wb.substring(0, uiIdx) + newUI + wb.substring(fnBodyEnd);
    console.log("10. Updated HuntListUI ✓");
  }
}

// ========== STEP 11: Add log function ==========
if (!wb.includes("__wbAddBossScriptLog")) {
  const rstIdx = wb.indexOf("function __wbBossAutoScriptRestoreFarm");
  if (rstIdx > 0) {
    const logFn = CR +
      "function __wbAddBossScriptLog(msg){" + CR +
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
    console.log("11. Added log function ✓");
  }
}

// ========== STEP 12: Add enter log ==========
const enterText = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');";
const ecIdx = wb.indexOf(enterText);
if (ecIdx >= 0) {
  const after = wb.substring(ecIdx + enterText.length);
  const phaseText = "window.__wbBossAutoScript.phase='entering';";
  const phIdx = after.indexOf(phaseText);
  if (phIdx >= 0) {
    const insertPoint = ecIdx + enterText.length + phIdx;
    wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      " + wb.substring(insertPoint);
    console.log("12. Added enter log ✓");
  }
}

// ========== STEP 13: Add defeat log ==========
const defText = "console.log('[WB-AutoScript] '+target.name+' defeated!');";
const defIdx = wb.indexOf(defText);
if (defIdx >= 0) {
  const afterDef = defIdx + defText.length;
  wb = wb.substring(0, afterDef) + CR + "    __wbAddBossScriptLog('擊敗 '+target.name+', 下一隻');" + wb.substring(afterDef);
  console.log("13. Added defeat log ✓");
}

fs.writeFileSync(DIR + "wb-boss.js", wb, "utf8");

// ===== Validation =====
function ok(c) { try { new Function(c); return true; } catch(e) { console.log("Syntax err:", e.message.substring(0,150)); return false; } }
console.log("\ngame-monitor.js: " + (ok(gm) ? "OK ✓" : "SYNTAX ERROR ✗"));
console.log("wb-boss.js:      " + (ok(wb) ? "OK ✓" : "SYNTAX ERROR ✗"));

const checks = [
  ["No auto_script checkbox", !gm.includes('__gmp_boss_auto_script" style')],
  ["Has script_status", gm.includes("__gmp_boss_script_status")],
  ["ScriptStart in handler", gm.includes("__wbBossAutoScriptStart()")],
  ["ScriptStop in handler", gm.includes("__wbBossAutoScriptStop()")],
  ["Has log area", gm.includes("__gmp_boss_script_log")],
  ["Has hunt up btn", gm.includes("__gmp_hunt_move_up")],
  ["Has hunt down btn", gm.includes("__gmp_hunt_move_down")],
  ["Has move handler", gm.includes("__wbMoveSelectedHuntItem")],
  ["No old auto_script DOM ref in wb", !wb.includes("document.getElementById('__gmp_boss_auto_script')")],
  ["Has __wbSelectedHuntId", wb.includes("__wbSelectedHuntId")],
  ["Has __wbAddBossScriptLog fn", wb.includes("function __wbAddBossScriptLog")],
  ["Enter log call", wb.includes("__wbAddBossScriptLog('進入")],
  ["Defeat log call", wb.includes("__wbAddBossScriptLog('擊敗")],
];
let allOk = true;
for (const [k, v] of checks) {
  console.log((v ? "  ✓" : "  ✗") + " " + k);
  if (!v) allOk = false;
}
console.log(allOk ? "\n✅ ALL CHECKS PASSED" : "\n❌ SOME CHECKS FAILED");
