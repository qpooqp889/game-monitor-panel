const fs = require("fs");
const CR = "\r\n";
const DIR = "C:/Users/steve/DOCUME~1/CHROME~1/game-monitor-panel_v3/";

let gm = fs.readFileSync(DIR + "game-monitor.js", "utf8");

// 4. Log HTML area - find the actual Chinese comment
// The file has: // === 冷卻計時 ===
const cdPosition = gm.indexOf("\u51B7\u5374\u8A08\u6642"); // 冷卻計時
if (cdPosition > 0) {
  // Go back to find the start of the comment line
  const lineStart = gm.lastIndexOf(CR, cdPosition - 2) + CR.length; // Skip past \r\n
  const commentLine = gm.substring(lineStart, cdPosition + 20);
  console.log("Found cd comment:", JSON.stringify(commentLine));
  
  const logHtml = [
    "'<div style=\"margin-bottom:6px;background:rgba(255,255,255,0.03);border-radius:4px;padding:4px;\">'+", CR,
    "'<div style=\"font-size:9px;color:#888;margin-bottom:2px;\">\\u25B6 \u81EA\u52D5BOSS\u65E5\u8A8C</div>'+", CR,
    "'<div id=\"__gmp_boss_script_log\" style=\"max-height:80px;overflow-y:auto;font-size:9px;color:#666;padding:2px 4px;background:rgba(0,0,0,0.2);border-radius:3px;\"></div>'+", CR,
    "'</div>'+", CR
  ].join("");
  
  gm = gm.substring(0, lineStart) + logHtml + gm.substring(lineStart);
  console.log("4. Added log HTML ✓");
} else {
  console.log("4. SKIP - cdPosition not found");
  // Let's search for just "冷卻"
  const p2 = gm.indexOf("\u51B7\u537B"); // 冷卻
  console.log("  '\\u51B7\\u537B' found at", p2);
  // Try unescaped
  const p3 = gm.indexOf("冷卻計時");
  console.log("  '冷卻計時' found at", p3);
}

fs.writeFileSync(DIR + "game-monitor.js", gm, "utf8");

// wb-boss.js
let wb = fs.readFileSync(DIR + "wb-boss.js", "utf8");

// 11b. Defeat log
const defText = [
  "console.log('[WB-AutoScript] '+target.name+' defeated! Respawn and re-enter...');"
].join("");
const defIdx = wb.indexOf(defText);
if (defIdx > 0) {
  if (!wb.includes("__wbAddBossScriptLog('\u64CA\u6557")) { // 擊敗
    const insertAt = defIdx + defText.length;
    wb = wb.substring(0, insertAt) + CR + "      __wbAddBossScriptLog('\u64CA\u6557 '+target.name+', \u91CD\u751F\u4E2D');" + wb.substring(insertAt);
    console.log("11b. Added defeat log ✓");
  } else {
    console.log("11b. Already has defeat log ✓");
  }
} else {
  console.log("11b. Defeat text not found. Searching...");
}

// 11c. Respawn enter log
const respawnEnterLog = "__wbAddBossScriptLog('\u91CD\u751F\u9032\u5165"; // 重生進入
if (!wb.includes(respawnEnterLog)) {
  const rText = "Respawn and re-enter";
  const raIdx = wb.lastIndexOf(rText);
  if (raIdx > 0) {
    const rc = "try{foundBoss.click();}catch(e){}";
    const rp = "window.__wbBossAutoScript.phase='attacking';";
    const afterRa = wb.substring(raIdx);
    const rcIdx = afterRa.indexOf(rc);
    if (rcIdx >= 0) {
      const rpIdx = afterRa.indexOf(rp, rcIdx + rc.length);
      if (rpIdx >= 0) {
        const insertPoint = raIdx + rpIdx;
        wb = wb.substring(0, insertPoint) + 
          "    __wbAddBossScriptLog('\u91CD\u751F\u9032\u5165: '+target.name);" + CR + "      " + 
          wb.substring(insertPoint);
        console.log("11c. Added respawn enter log ✓");
      } else {
        console.log("11c. phase='attacking' not found after respawn click");
      }
    } else {
      console.log("11c. respawn click not found");
    }
  } else {
    console.log("11c. Respaw and re-enter not found");
  }
}

// 7. Replace old DOM refs
let refCount = 0;
const oldRef = "document.getElementById('__gmp_boss_auto_script')";
while (wb.includes(oldRef)) {
  wb = wb.replace(oldRef, "document.getElementById('__gmp_boss_auto_enable')");
  refCount++;
}
console.log("7. Replaced " + refCount + " DOM refs ✓");

fs.writeFileSync(DIR + "wb-boss.js", wb, "utf8");

// Validate
function syntaxOk(c) { try { new Function(c); return true; } catch(e) { return false; } }
const gmOk = syntaxOk(gm);
const wbOk = syntaxOk(wb);
console.log("\ngm: " + (gmOk ? "OK" : "SYNTAX ERROR") + " (" + gm.length + "b)");
console.log("wb: " + (wbOk ? "OK" : "SYNTAX ERROR") + " (" + wb.length + "b)");

if (!gmOk) { try { new Function(gm); } catch(e) { console.log("gm err:", e.message.substring(0,200)); } }

const checks = [
  ["Log area in gm", gm.includes("__gmp_boss_script_log")],
  ["ScriptStop handler", gm.includes("__wbBossAutoScriptStop()")],
  ["ScriptStart handler", gm.includes("__wbBossAutoScriptStart()")],
  ["No auto_script checkbox", !gm.includes('__gmp_boss_auto_script" style')],
  ["Enter log in wb", wb.includes("__wbAddBossScriptLog('\u9032\u5165")],
  ["Defeat log in wb", wb.includes("__wbAddBossScriptLog('\u64CA\u6557")],
  ["Respawn log in wb", wb.includes("__wbAddBossScriptLog('\u91CD\u751F")],
  ["No old DOM ref in wb", !wb.includes("document.getElementById('__gmp_boss_auto_script')")],
  ["Has __wbSelectedHuntId", wb.includes("__wbSelectedHuntId")],
  ["Has __wbMoveSelectedHuntItem", wb.includes("__wbMoveSelectedHuntItem")],
  ["Has __wbAddBossScriptLog fn", wb.includes("function __wbAddBossScriptLog")],
];
let all = true;
for (const [k, v] of checks) {
  console.log((v ? "  \u2713" : "  \u2717") + " " + k);
  if (!v) all = false;
}
console.log(all ? "\n\u2705 ALL OK" : "\n\u274C SOME FAILED");
