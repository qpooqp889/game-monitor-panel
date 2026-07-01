const fs = require("fs");
const CR = "\r\n";
const DIR = "C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/";

let gm = fs.readFileSync(DIR + "game-monitor.js", "utf8");

// 4. Insert log HTML before // === 冷卻計時 ===
const cdText = "".concat("// === ", String.fromCharCode(0x51B7, 0x5374, 0x8A08, 0x6642), " ===");
const cdIdx = gm.indexOf(cdText);
if (cdIdx > 0) {
  const logHtml = [
    "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+", CR,
    "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 自動BOSS日誌</div>'+", CR,
    "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+", CR,
    "'</div>'+", CR
  ].join("");
  gm = gm.substring(0, cdIdx) + logHtml + gm.substring(cdIdx);
  console.log("4. Added log HTML at", cdIdx, "✓");
} else {
  console.log("4. SKIP");
}

// 11b. Defeat log in wb-boss.js
let wb = fs.readFileSync(DIR + "wb-boss.js", "utf8");
const defText = "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');";
const defIdx = wb.indexOf(defText);
if (defIdx > 0 && !wb.includes("__wbAddBossScriptLog('擊敗")) {
  const afterDef = defIdx + defText.length;
  const before = wb.substring(0, afterDef);
  const after = wb.substring(afterDef);
  wb = before + CR + "      __wbAddBossScriptLog('擊敗 '+target.name+', 重生中');" + after;
  console.log("11b. Added defeat log ✓");
} else {
  console.log("11b. SKIP");
}

// 11c. Respawn enter log
if (!wb.includes("__wbAddBossScriptLog('重生進入")) {
  const rText = "Respawn and re-enter";
  const raIdx = wb.lastIndexOf(rText);
  if (raIdx > 0) {
    const rc = "try{foundBoss.click();}catch(e){}";
    const rp = "window.__wbBossAutoScript.phase='attacking';";
    const afterRa = wb.substring(raIdx);
    const rcIdx = afterRa.indexOf(rc);
    const rpIdx = rcIdx >= 0 ? afterRa.indexOf(rp, rcIdx + rc.length) : -1;
    if (rpIdx >= 0) {
      const insertPoint = raIdx + rpIdx;
      wb = wb.substring(0, insertPoint) + "    __wbAddBossScriptLog('重生進入: '+target.name);" + CR + "      " + wb.substring(insertPoint);
      console.log("11c. Added respawn log ✓");
    } else {
      console.log("11c. SKIP - respawn pattern");
    }
  }
}

// 7. Replace old DOM refs in wb
let refCount = 0;
while (wb.includes("document.getElementById('__gmp_boss_auto_script')")) {
  wb = wb.replace("document.getElementById('__gmp_boss_auto_script')", "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log("7. Replaced " + refCount + " DOM refs ✓");

fs.writeFileSync(DIR + "game-monitor.js", gm, "utf8");
fs.writeFileSync(DIR + "wb-boss.js", wb, "utf8");

// Validate
function syntaxOk(c) { try { new Function(c); return true; } catch(e) { return false; } }
console.log("\ngm: " + (syntaxOk(gm) ? "OK" : "SYNTAX ERROR") + " (" + gm.length + "b)");
console.log("wb: " + (syntaxOk(wb) ? "OK" : "SYNTAX ERROR") + " (" + wb.length + "b)");

// All checks
const checks = {
  "Has log area": gm.includes("__gmp_boss_script_log"),
  "ScriptStop in handler": gm.includes("__wbBossAutoScriptStop()"),
  "Defeat log": wb.includes("__wbAddBossScriptLog('擊敗"),
  "Respawn log": wb.includes("__wbAddBossScriptLog('重生進入"),
  "Enter log": wb.includes("__wbAddBossScriptLog('進入"),
};
for (const [k, v] of Object.entries(checks)) {
  console.log("  " + (v ? "✓" : "✗") + " " + k);
}
