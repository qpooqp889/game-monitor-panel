const fs = require("fs");
const CR = "\r\n";
const DIR = "C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/";

function read(f) { return fs.readFileSync(DIR + f, "utf8"); }
function write(f, c) { fs.writeFileSync(DIR + f, c, "utf8"); }
function syntaxOk(c) { try { new Function(c); return true; } catch(e) { return false; } }

// ===== game-monitor.js =====
let gm = read("game-monitor.js");

// 3b. Merge ScriptStart/ScriptStop into enable handler
gm = gm.replace(
  [
    "      __wbSyncAutoConfig();",
    "      __wbBossAutoStart();",
    "      var btn=document.getElementById('__gmp_boss_auto_btn');"
  ].join(CR),
  [
    "      __wbSyncAutoConfig();",
    "      __wbBossAutoStart();__wbBossAutoScriptStart();",
    "      var btn=document.getElementById('__gmp_boss_auto_btn');"
  ].join(CR)
);
gm = gm.replace(
  "      __wbBossAutoStop();\r\n      this.textContent='停止中';",
  "      __wbBossAutoStop();__wbBossAutoScriptStop();\r\n      this.textContent='停止中';"
);
console.log("3b. Merged handler calls ✓");

// 4. Add log HTML area before cooldown section
const cdIdx = gm.indexOf('// === \\u51B7\\u537B\\u8A08\\u6642 ===');
if (cdIdx > 0) {
  const logHtml = [
    "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR,
    "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR,
    "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR,
    "'</div>'+" + CR
  ].join("");
  gm = gm.substring(0, cdIdx) + logHtml + gm.substring(cdIdx);
  console.log("4. Added log HTML ✓");
} else {
  // Try alternative marker
  const cdAlt = '// === \\u51B7\\u537B\\u8A08\\u6642';
  const cdIdx2 = gm.indexOf(cdAlt);
  if (cdIdx2 > 0) {
    const logHtml = [
      "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+" + CR,
      "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+" + CR,
      "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+" + CR,
      "'</div>'+" + CR
    ].join("");
    gm = gm.substring(0, cdIdx2) + logHtml + gm.substring(cdIdx2);
    console.log("4b. Added log HTML ✓");
  } else {
    console.log("4. SKIP - cooldown marker not found");
  }
}

// 5. Add hunt buttons after hunt body
const huntBody = '__gmp_hunt_body" style="max-height:300px;overflow-y:auto;padding:6px';
const hbIdx = gm.indexOf(huntBody);
if (hbIdx > 0) {
  const hbInner = gm.indexOf("</div>", hbIdx + 60);
  const hbClose = gm.indexOf("'</div>'", hbInner);
  const afterHunt = gm.indexOf("'<div", hbClose + 10);
  if (afterHunt > 0) {
    const huntBtns = [
      "'<div style=\"display:flex;justify-content:flex-end;gap:6px;padding:4px 8px;margin-bottom:4px;\">'+" + CR,
      "'<button id=\"__gmp_hunt_move_up\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25B2 上移</button>'+" + CR,
      "'<button id=\"__gmp_hunt_move_down\" style=\"padding:2px 10px;background:#0f3460;border:1px solid #4caf50;color:#4caf50;border-radius:4px;cursor:pointer;font-size:10px;font-weight:bold;\">\\u25BC 下移</button>'+" + CR,
      "'</div>'+" + CR
    ].join("");
    gm = gm.substring(0, afterHunt) + huntBtns + gm.substring(afterHunt);
    console.log("5. Added hunt buttons ✓");
  } else {
    console.log("5. SKIP - afterHunt not found");
  }
} else {
  console.log("5. SKIP - hunt body not found");
}

// 6. Add button handlers
const cfgRef = "document.getElementById('__gmp_boss_auto_config_btn').onclick";
const cfgIdx = gm.indexOf(cfgRef);
if (cfgIdx > 0) {
  const handlers = [
    "  // === Hunt list ▲▼ buttons ===" + CR,
    "  document.getElementById('__gmp_hunt_move_up').onclick=function(){__wbMoveSelectedHuntItem(-1);};" + CR,
    "  document.getElementById('__gmp_hunt_move_down').onclick=function(){__wbMoveSelectedHuntItem(1);};" + CR
  ].join("");
  gm = gm.substring(0, cfgIdx) + handlers + gm.substring(cfgIdx);
  console.log("6. Added button handlers ✓");
} else {
  console.log("6. SKIP - config_btn ref not found");
}

write("game-monitor.js", gm);

// ===== wb-boss.js =====
let wb = read("wb-boss.js");

// 7. Replace DOM refs
let refCount = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log("7. Replaced " + refCount + " DOM refs ✓");

// 8. Add selection functions
if (!wb.includes("__wbSelectedHuntId")) {
  const stIdx = wb.indexOf("window.__wbBossAutoScript={");
  if (stIdx > 0) {
    const selCode = [
      CR, "// Selected hunt item for outer ▲▼ buttons",
      CR, "window.__wbSelectedHuntId=null;",
      CR, "",
      CR, "function __wbSelectHuntItem(id){",
      CR, "  window.__wbSelectedHuntId=id;",
      CR, "  __wbUpdateHuntListUI();",
      CR, "}",
      CR, "",
      CR, "function __wbMoveSelectedHuntItem(dir){",
      CR, "  __wbGetHuntList(function(list){",
      CR, "    var selIdx=-1;",
      CR, "    if(window.__wbSelectedHuntId){",
      CR, "      selIdx=list.findIndex(function(i){return i.id===window.__wbSelectedHuntId;});",
      CR, "    }",
      CR, "    if(selIdx<0){",
      CR, "      if(list.length){window.__wbSelectedHuntId=list[0].id;__wbUpdateHuntListUI();}",
      CR, "      return;",
      CR, "    }",
      CR, "    var newIdx=selIdx+dir;",
      CR, "    if(newIdx<0||newIdx>=list.length)return;",
      CR, "    var tmp=list[selIdx];",
      CR, "    list[selIdx]=list[newIdx];",
      CR, "    list[newIdx]=tmp;",
      CR, "    window.__wbSelectedHuntId=list[newIdx].id;",
      CR, "    __wbSaveHuntList(list,function(){",
      CR, "      __wbUpdateHuntListUI();",
      CR, "      __wbUpdateWorldBossUI();",
      CR, "    });",
      CR, "  });",
      CR, "}",
      CR
    ].join("");
    wb = wb.substring(0, stIdx) + selCode + wb.substring(stIdx);
    console.log("8. Added selection functions ✓");
  } else {
    console.log("8. SKIP - state ref not found");
  }
} else {
  console.log("8. Already has selection functions ✓");
}

// 9. Update HuntListUI (if it still has old per-item move arrows)
const uiIdx = wb.indexOf("function __wbUpdateHuntListUI");
const hasOldArrows = uiIdx > 0 && wb.indexOf("__wbMoveHuntItem", uiIdx) > 0;
if (hasOldArrows) {
  let fnBodyStart = wb.indexOf("{", uiIdx);
  let braceCount = 0;
  let fnBodyEnd = -1;
  for (let i = fnBodyStart; i < wb.length && i < fnBodyStart + 3000; i++) {
    if (wb[i] === "{") braceCount++;
    if (wb[i] === "}") { braceCount--; if (braceCount === 0) { fnBodyEnd = i + 1; break; } }
  }
  if (fnBodyEnd > 0) {
    const newUI = [
      "function __wbUpdateHuntListUI(){",
      "var el=document.getElementById('__gmp_hunt_list');",
      "var countEl=document.getElementById('__gmp_hunt_count');",
      "if(!el)return;",
      "__wbGetHuntList(function(list){",
      "  if(countEl)countEl.textContent=list.length+'\\u53ea';",
      "  if(list.length){",
      "    el.innerHTML=list.map(function(i,idx){",
      "      var isSel=window.__wbSelectedHuntId===i.id;",
      "      var bg=isSel?'rgba(76,175,80,0.25)':'rgba(76,175,80,0.08)';",
      "      var bl=isSel?'3px solid #4caf50':'3px solid #2a6a2a';",
      "      return '<div style=\"display:flex;align-items:center;gap:2px;padding:4px 6px;background:'+bg+';border-radius:5px;margin-bottom:2px;border-left:'+bl+';cursor:pointer;\" onclick=\"__wbSelectHuntItem(\\''+i.id+'\\')\">'+(idx===0?'<span style=\"font-size:9px;color:#4caf50;min-width:12px;\">\\u2605</span>':'<span style=\"font-size:9px;color:#888;min-width:12px;\">'+(idx+1)+'</span>')+'<span style=\"font-size:10px;color:#e94560;min-width:18px;cursor:pointer;\" onclick=\"event.stopPropagation();__wbRemoveFromHuntList(\\''+i.id+'\\')\">[x]</span>'+'<span style=\"font-size:10px;color:#4caf50;min-width:70px;\">'+i.name+'</span>'+'<span style=\"font-size:9px;color:#aaa;\">Lv.'+i.lv+'</span>'+'</div>';",
      "    }).join('');",
      "  }else{",
      "    el.innerHTML='<div style=\"font-size:10px;color:#888;padding:6px;text-align:center;\">\\u70b9\\u9009\\u4e0a\\u65b9\\u4e16\\u754c\\u738B [+] \\u52A0\\u5165</div>';",
      "  }",
      "});",
      "}"
    ].join("");
    wb = wb.substring(0, uiIdx) + newUI + wb.substring(fnBodyEnd);
    console.log("9. Updated HuntListUI ✓");
  } else {
    console.log("9. SKIP - cannot find function body end");
  }
} else {
  console.log("9. HuntListUI already updated ✓");
}

// 10. Add log function (before RestoreFarm)
if (!wb.includes("__wbAddBossScriptLog")) {
  const rstIdx = wb.indexOf("function __wbBossAutoScriptRestoreFarm");
  if (rstIdx > 0) {
    const logFn = [
      CR,
      "function __wbAddBossScriptLog(msg){",
      "try{",
      "var el=document.getElementById('__gmp_boss_script_log');",
      "if(!el)return;",
      "var ts=new Date();",
      "var t=ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')+':'+ts.getSeconds().toString().padStart(2,'0');",
      "var div=document.createElement('div');",
      "div.style.cssText='font-size:9px;color:#aaa;padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03);';",
      "div.textContent='['+t+'] '+msg;",
      "el.appendChild(div);",
      "el.scrollTop=el.scrollHeight;",
      "if(el.children.length>50)el.removeChild(el.firstChild);",
      "}catch(e){}",
      "}",
      CR
    ].join("");
    wb = wb.substring(0, rstIdx) + logFn + wb.substring(rstIdx);
    console.log("10. Added log function ✓");
  } else {
    console.log("10. SKIP - RestoreFarm not found");
  }
} else {
  console.log("10. Already has log function ✓");
}

// 11a. Enter log
if (!wb.includes("__wbAddBossScriptLog('進入")) {
  const enterText = "console.log('[WB-AutoScript] '+target.name+' is ALIVE, entering...');";
  const ecIdx = wb.indexOf(enterText);
  if (ecIdx > 0) {
    const afterEnter = wb.substring(ecIdx + enterText.length);
    const phaseText = "window.__wbBossAutoScript.phase='entering';";
    const phIdx = afterEnter.indexOf(phaseText);
    if (phIdx >= 0) {
      const insertPoint = ecIdx + enterText.length + phIdx;
      wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('進入世界王: '+target.name);" + CR + "      " + wb.substring(insertPoint);
      console.log("11a. Added enter log ✓");
    }
  }
}

// 11b. Defeat log
if (!wb.includes("__wbAddBossScriptLog('擊敗")) {
  const defText = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
  if (wb.includes(defText)) {
    wb = wb.replace(defText, defText + CR + "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');");
    console.log("11b. Added defeat log ✓");
  }
}

// 11c. Respawn enter log
if (!wb.includes("__wbAddBossScriptLog('重生進入")) {
  const rText = "Respawn and re-enter";
  const raIdx = wb.lastIndexOf(rText);
  if (raIdx > 0) {
    const afterRa = wb.substring(raIdx);
    const rc = "try{foundBoss.click();}catch(e){}";
    const rp = "window.__wbBossAutoScript.phase='attacking';";
    const rcIdx = afterRa.indexOf(rc);
    const rpIdx = rcIdx >= 0 ? afterRa.indexOf(rp, rcIdx + rc.length) : -1;
    if (rpIdx >= 0) {
      const insertPoint = raIdx + rpIdx;
      wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('重生進入: '+target.name);" + CR + "      " + wb.substring(insertPoint);
      console.log("11c. Added respawn enter log ✓");
    } else {
      console.log("11c. SKIP - respawn click+phase pattern not found");
    }
  } else {
    console.log("11c. SKIP - respawn section not found");
  }
}

write("wb-boss.js", wb);

// ===== Validation =====
console.log("\n=== Validation ===");
const gmOk = syntaxOk(gm);
const wbOk = syntaxOk(wb);
console.log("game-monitor.js: " + (gmOk ? "OK" : "SYNTAX ERROR") + " (" + gm.length + "b)");
console.log("wb-boss.js:      " + (wbOk ? "OK" : "SYNTAX ERROR") + " (" + wb.length + "b)");

if (!gmOk) {
  console.log("gm syntax error:"); try { new Function(gm); } catch(e) { console.log(e.message.substring(0, 200)); }
}

console.log("\n=== Verification ===");
const checks = {
  "No auto_script checkbox": !gm.includes('__gmp_boss_auto_script" style'),
  "Has script_status": gm.includes("__gmp_boss_script_status"),
  "ScriptStart in handler": gm.includes("__wbBossAutoScriptStart()"),
  "ScriptStop in handler": gm.includes("__wbBossAutoScriptStop()"),
  "Has log area": gm.includes("__gmp_boss_script_log"),
  "Has hunt up btn": gm.includes("__gmp_hunt_move_up"),
  "Has hunt down btn": gm.includes("__gmp_hunt_move_down"),
  "Has move handler": gm.includes("__wbMoveSelectedHuntItem"),
  "No old DOM ref in wb": !wb.includes("document.getElementById('__gmp_boss_auto_script')"),
  "New DOM ref in wb": wb.includes("document.getElementById('__gmp_boss_auto_enable')"),
  "Has __wbSelectedHuntId": wb.includes("__wbSelectedHuntId"),
  "Has __wbSelectHuntItem": wb.includes("__wbSelectHuntItem"),
  "Has __wbMoveSelectedHuntItem": wb.includes("__wbMoveSelectedHuntItem"),
  "Has __wbAddBossScriptLog function": wb.includes("function __wbAddBossScriptLog"),
  "Enter log call": wb.includes("__wbAddBossScriptLog('進入"),
  "Defeat log call": wb.includes("__wbAddBossScriptLog('擊敗"),
  "Respawn log call": wb.includes("__wbAddBossScriptLog('重生"),
};
let allOk = true;
for (const [k, v] of Object.entries(checks)) {
  console.log("  " + (v ? "✓" : "✗") + " " + k);
  if (!v) allOk = false;
}
console.log(allOk ? "\n✅ ALL CHECKS PASSED" : "\n❌ SOME FAILED");
